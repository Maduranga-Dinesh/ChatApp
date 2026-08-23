import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Message from './models/Message.js';
import SecurityState from './models/SecurityState.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const DEFAULT_PASSWORD = process.env.CHAT_PASSWORD || 'secret123';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/secretchat';

// File-based persistent storage fallback
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {}
}
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const SECURITY_FILE = path.join(DATA_DIR, 'security.json');

let inMemoryStore = {
  security: {
    roomKey: 'main_room',
    failedAttempts: 0,
    maxAttempts: 3,
    customPassword: DEFAULT_PASSWORD,
    primaryDeviceId: null,
    secondaryDeviceId: null,
    lastWipeAt: null,
    wipeCount: 0,
  },
  messages: [],
};

// Load saved data from disk
function loadDiskStorage() {
  try {
    if (fs.existsSync(MESSAGES_FILE)) {
      const raw = fs.readFileSync(MESSAGES_FILE, 'utf-8');
      inMemoryStore.messages = JSON.parse(raw);
    }
    if (fs.existsSync(SECURITY_FILE)) {
      const raw = fs.readFileSync(SECURITY_FILE, 'utf-8');
      inMemoryStore.security = { ...inMemoryStore.security, ...JSON.parse(raw) };
    }
    console.log(`📂 Disk Storage loaded: ${inMemoryStore.messages.length} messages found.`);
  } catch (err) {
    console.error('Error reading disk storage:', err);
  }
}

function saveMessagesToDisk() {
  try {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(inMemoryStore.messages, null, 2));
  } catch (err) {
    console.error('Error saving messages to disk:', err);
  }
}

function saveSecurityToDisk() {
  try {
    fs.writeFileSync(SECURITY_FILE, JSON.stringify(inMemoryStore.security, null, 2));
  } catch (err) {
    console.error('Error saving security to disk:', err);
  }
}

loadDiskStorage();

let isMongoConnected = false;

// Connect to MongoDB
async function initDatabase() {
  console.log('Attempting MongoDB connection to:', MONGODB_URI);
  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    isMongoConnected = true;
    console.log('✅ Connected to MongoDB Atlas server successfully.');

    // Initialize security state in MongoDB
    let sec = await SecurityState.findOne({ roomKey: 'main_room' });
    if (!sec) {
      await SecurityState.create({
        roomKey: 'main_room',
        failedAttempts: 0,
        maxAttempts: 3,
        customPassword: DEFAULT_PASSWORD,
      });
      console.log(`Security state created in MongoDB. Default Password: "${DEFAULT_PASSWORD}"`);
    }
  } catch (err) {
    console.log('⚠️ MongoDB server not active. Operating with Persistent File + High-Speed In-Memory Database.');
    isMongoConnected = false;
  }
}

// Security State Helper
async function getSecState() {
  if (isMongoConnected) {
    let sec = await SecurityState.findOne({ roomKey: 'main_room' });
    if (!sec) {
      sec = await SecurityState.create({
        roomKey: 'main_room',
        failedAttempts: 0,
        maxAttempts: 3,
        customPassword: DEFAULT_PASSWORD,
      });
    }
    return sec;
  } else {
    return inMemoryStore.security;
  }
}

// Save Security State Helper
async function saveSecState(secObj) {
  if (isMongoConnected) {
    await secObj.save();
  } else {
    inMemoryStore.security = { ...secObj };
    saveSecurityToDisk();
  }
}

// Execute Database Wipe Function (Destroys all chat history)
async function executeDatabaseWipe(reason = '3_failed_password_attempts') {
  console.log(`🚨 EXECUTING DATABASE WIPE (Reason: ${reason})`);
  
  if (isMongoConnected) {
    await Message.deleteMany({});
  }
  inMemoryStore.messages = [];
  saveMessagesToDisk();

  const sec = await getSecState();
  sec.failedAttempts = 0;
  sec.lastWipeAt = new Date();
  sec.wipeCount = (sec.wipeCount || 0) + 1;
  sec.primaryDeviceId = null;
  sec.secondaryDeviceId = null;
  await saveSecState(sec);

  // Broadcast clean wipe to all connected clients
  io.emit('database-wiped', {
    reason,
    timestamp: new Date(),
  });

  return { wiped: true };
}

// API Routes

// Get security status
app.get('/api/security/status', async (req, res) => {
  try {
    const sec = await getSecState();
    const messageCount = isMongoConnected ? await Message.countDocuments() : inMemoryStore.messages.length;
    res.json({
      failedAttempts: sec.failedAttempts,
      maxAttempts: sec.maxAttempts || 3,
      remainingAttempts: Math.max(0, (sec.maxAttempts || 3) - sec.failedAttempts),
      lastWipeAt: sec.lastWipeAt,
      wipeCount: sec.wipeCount || 0,
      messageCount,
      isMongoConnected,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login API & Password Verification
app.post('/api/auth/login', async (req, res) => {
  try {
    const { password, deviceId } = req.body;
    const sec = await getSecState();
    const expectedPassword = sec.customPassword || DEFAULT_PASSWORD;

    if (password === expectedPassword) {
      sec.failedAttempts = 0;

      // Smart 1-to-1 Device-to-Role Mapping
      let assignedRole = 'BOT1';

      if (deviceId) {
        if (sec.primaryDeviceId === deviceId) {
          assignedRole = 'BOT1';
        } else if (sec.secondaryDeviceId === deviceId) {
          assignedRole = 'BOT2';
        } else {
          // New device registering
          if (!sec.primaryDeviceId) {
            sec.primaryDeviceId = deviceId;
            assignedRole = 'BOT1';
          } else if (!sec.secondaryDeviceId) {
            sec.secondaryDeviceId = deviceId;
            assignedRole = 'BOT2';
          } else {
            // Fallback if third device logs in
            assignedRole = activeUsers.BOT1 ? 'BOT2' : 'BOT1';
          }
        }
      } else {
        assignedRole = activeUsers.BOT1 ? 'BOT2' : 'BOT1';
      }

      await saveSecState(sec);

      return res.json({
        success: true,
        role: assignedRole,
        message: 'Access Granted',
      });
    } else {
      sec.failedAttempts = (sec.failedAttempts || 0) + 1;
      await saveSecState(sec);

      const maxAttempts = sec.maxAttempts || 3;
      const remaining = maxAttempts - sec.failedAttempts;

      if (sec.failedAttempts >= maxAttempts) {
        // TRIGGER 3-ATTEMPT DATABASE SELF-DESTRUCT WIPE!
        await executeDatabaseWipe('3_failed_password_attempts');
        return res.status(401).json({
          success: false,
          wiped: true,
          remaining: 0,
          message: 'CRITICAL: 3 Failed attempts reached! Chat history permanently wiped from database!',
        });
      } else {
        return res.status(401).json({
          success: false,
          wiped: false,
          remaining,
          message: `Incorrect Password! Warning: ${remaining} attempt(s) remaining before automatic chat history wipe!`,
        });
      }
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Password (Only for BOT1)
app.post('/api/security/set-password', async (req, res) => {
  try {
    const { newPassword, currentPassword } = req.body;
    const sec = await getSecState();
    if (currentPassword !== (sec.customPassword || DEFAULT_PASSWORD)) {
      return res.status(400).json({ error: 'Current password incorrect' });
    }
    sec.customPassword = newPassword;
    sec.failedAttempts = 0;
    await saveSecState(sec);
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manual Wipe API
app.post('/api/security/manual-wipe', async (req, res) => {
  try {
    const { password } = req.body;
    const sec = await getSecState();
    if (password !== (sec.customPassword || DEFAULT_PASSWORD)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const systemMsg = await executeDatabaseWipe('manual');
    res.json({ success: true, message: 'Chat history wiped', systemMsg });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch Chat Messages
app.get('/api/messages', async (req, res) => {
  try {
    let msgs = [];
    if (isMongoConnected) {
      msgs = await Message.find({ type: { $ne: 'system' } }).sort({ createdAt: 1 }).limit(500);
    } else {
      msgs = inMemoryStore.messages.filter((m) => m.type !== 'system');
    }
    res.json(msgs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Send message via HTTP REST (Backup for WebSockets)
app.post('/api/messages', async (req, res) => {
  try {
    const { sender, text, clientMsgId } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Message text is required' });
    }

    const msgObj = {
      sender: (sender === 'BOT2' ? 'BOT2' : 'BOT1'),
      text: text.trim(),
      type: 'text',
      seen: false,
      seenAt: null,
      clientMsgId: clientMsgId || Date.now().toString(),
      createdAt: new Date(),
    };

    let savedMsg = msgObj;
    if (isMongoConnected) {
      try {
        savedMsg = await Message.create(msgObj);
      } catch (dbErr) {
        console.error('Mongo save error, saving to memory:', dbErr);
        inMemoryStore.messages.push(msgObj);
        saveMessagesToDisk();
      }
    } else {
      inMemoryStore.messages.push(msgObj);
      saveMessagesToDisk();
    }

    io.emit('receive-message', savedMsg);
    res.json(savedMsg);
  } catch (err) {
    console.error('Failed to send message via API:', err);
    res.status(500).json({ error: err.message });
  }
});

// Online Users Tracking
const activeUsers = {
  BOT1: false,
  BOT2: false,
};

// Socket.io Real-time Event Handlers
io.on('connection', (socket) => {
  console.log(`⚡ Socket client connected: ${socket.id}`);
  let currentRole = null;

  socket.on('join-room', ({ role }) => {
    currentRole = role === 'BOT1' ? 'BOT1' : 'BOT2';
    activeUsers[currentRole] = true;
    socket.join('secret-room');

    io.emit('online-status', activeUsers);
  });

  socket.on('send-message', async (data) => {
    try {
      const { sender, text, clientMsgId } = data;
      if (!text || !text.trim()) return;

      const msgObj = {
        sender,
        text: text.trim(),
        type: 'text',
        seen: false,
        seenAt: null,
        clientMsgId,
        createdAt: new Date(),
      };

      let savedMsg = msgObj;
      if (isMongoConnected) {
        try {
          savedMsg = await Message.create(msgObj);
        } catch (dbErr) {
          console.error('Mongo save error in socket, fallback to memory:', dbErr);
          inMemoryStore.messages.push(msgObj);
          saveMessagesToDisk();
        }
      } else {
        inMemoryStore.messages.push(msgObj);
        saveMessagesToDisk();
      }

      io.emit('receive-message', savedMsg);
    } catch (err) {
      console.error('Failed to save message:', err);
    }
  });

  socket.on('typing', ({ sender, isTyping }) => {
    socket.to('secret-room').emit('user-typing', { sender, isTyping });
  });

  socket.on('mark-seen', async ({ readerRole }) => {
    try {
      const senderToMark = readerRole === 'BOT1' ? 'BOT2' : 'BOT1';
      const now = new Date();

      if (isMongoConnected) {
        await Message.updateMany(
          { sender: senderToMark, seen: false },
          { $set: { seen: true, seenAt: now } }
        );
      } else {
        inMemoryStore.messages.forEach((m) => {
          if (m.sender === senderToMark && !m.seen) {
            m.seen = true;
            m.seenAt = now;
          }
        });
        saveMessagesToDisk();
      }

      io.emit('messages-seen-update', {
        readerRole,
        seenAt: now,
      });
    } catch (err) {
      console.error('Error marking seen:', err);
    }
  });

  socket.on('manual-wipe-request', async ({ sender }) => {
    if (sender === 'BOT1') {
      await executeDatabaseWipe('manual');
    }
  });

  socket.on('disconnect', () => {
    if (currentRole) {
      activeUsers[currentRole] = false;
      io.emit('online-status', activeUsers);
    }
  });
});

// Serve static frontend in production
const clientDistPath = path.join(__dirname, '../client/dist');
app.use(express.static(clientDistPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// Start listening immediately
server.listen(PORT, () => {
  console.log(`🔒 Secret Chat Server running on http://localhost:${PORT}`);
  initDatabase();
});
