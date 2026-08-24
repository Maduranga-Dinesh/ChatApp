import React, { useState, useEffect, useRef } from 'react';
import { Send, Lock, LogOut, Sparkles, ShieldAlert, Circle, Reply, X, CornerDownRight, Clipboard, Mic, Play, Pause, Trash2, Clock, Square } from 'lucide-react';

// Custom Interactive Audio Player Component
function VoiceMessagePlayer({ msg, isMe, socket, role }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(msg.audioDuration || 0);
  const audioRef = useRef(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => {
        setIsPlaying(true);
        // Mark as listened if recipient is playing for the first time
        if (msg.sender !== role && !msg.listened) {
          if (socket && socket.connected) {
            socket.emit('mark-audio-listened', {
              msgId: msg._id,
              clientMsgId: msg.clientMsgId,
              readerRole: role,
            });
          }
          fetch('/api/messages/mark-audio-listened', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ msgId: msg._id, clientMsgId: msg.clientMsgId }),
          }).catch(() => {});
        }
      }).catch((err) => {
        console.error('Audio playback failed:', err);
      });
    }
  };

  const handleSeek = (e) => {
    const audio = audioRef.current;
    const target = parseFloat(e.target.value);
    if (audio) {
      audio.currentTime = target;
      setCurrentTime(target);
    }
  };

  const formatTime = (secs) => {
    if (isNaN(secs) || !isFinite(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Expiration calculation (3 days after listened)
  const getExpiryText = () => {
    if (msg.listened && msg.listenedAt) {
      const listenedMs = new Date(msg.listenedAt).getTime();
      const diffMs = (3 * 24 * 60 * 60 * 1000) - (Date.now() - listenedMs);
      if (diffMs <= 0) return 'Expiring soon';
      const hours = Math.floor(diffMs / (3600 * 1000));
      const days = Math.floor(hours / 24);
      if (days >= 1) return `Expires in ${days}d ${hours % 24}h`;
      return `Expires in ${hours}h`;
    }
    return '3d expiry after play';
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      minWidth: '220px',
      maxWidth: '310px',
      padding: '4px 2px'
    }}>
      <audio ref={audioRef} src={msg.audioData} preload="metadata" />

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
      }}>
        {/* Play/Pause Button */}
        <button
          type="button"
          onClick={togglePlay}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            border: 'none',
            background: isPlaying ? '#10b981' : (isMe ? '#6366f1' : '#3b82f6'),
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            transition: 'all 0.2s ease',
          }}
          title={isPlaying ? 'Pause' : 'Play voice note'}
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} style={{ marginLeft: '2px' }} />}
        </button>

        {/* Scrubber & Time */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <input
            type="range"
            min="0"
            max={duration || 1}
            step="0.1"
            value={currentTime}
            onChange={handleSeek}
            style={{
              width: '100%',
              accentColor: '#10b981',
              cursor: 'pointer',
              height: '4px'
            }}
          />
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '10px',
            color: 'rgba(255, 255, 255, 0.75)',
            fontFamily: 'monospace'
          }}>
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      {/* Expiry & Listened status badge */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '9.5px',
        color: msg.listened ? '#34d399' : 'rgba(255, 255, 255, 0.55)',
        paddingTop: '3px',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
          <Clock size={10} />
          <span>{getExpiryText()}</span>
        </span>
        {msg.listened && (
          <span style={{ color: '#34d399', fontWeight: '600' }}>
            ✓ Listened
          </span>
        )}
      </div>
    </div>
  );
}

export default function ChatRoom({ role, userPassword, socket, onLogout, onWiped }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [onlineUsers, setOnlineUsers] = useState({ BOT1: false, BOT2: false });
  const [isTypingOther, setIsTypingOther] = useState(false);
  const [screenShield, setScreenShield] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null); // { msgId, sender, text }

  // Audio Recording States
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const audioStreamRef = useRef(null);

  // Audio Preview States
  const [previewAudio, setPreviewAudio] = useState(null); // { audioUrl, base64Audio, duration }
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
  const previewAudioRef = useRef(null);

  // Persistent Dynamic Font Size (Default 15.5px, ranges 11px to 24px)
  const [fontSize, setFontSize] = useState(() => {
    try {
      const saved = localStorage.getItem('chat_font_size_pref');
      return saved ? parseFloat(saved) : 15.5;
    } catch (e) {
      return 15.5;
    }
  });

  const handleIncreaseFont = () => {
    setFontSize((prev) => {
      const next = Math.min(prev + 1.5, 24);
      try {
        localStorage.setItem('chat_font_size_pref', next);
      } catch (e) {}
      return next;
    });
  };

  const handleDecreaseFont = () => {
    setFontSize((prev) => {
      const next = Math.max(prev - 1.5, 11);
      try {
        localStorage.setItem('chat_font_size_pref', next);
      } catch (e) {}
      return next;
    });
  };

  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const inputRef = useRef(null);
  const chatContainerRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const isInitialLoadRef = useRef(true);

  const otherRole = role === 'BOT1' ? 'BOT2' : 'BOT1';

  // Smooth scroll to bottom helper
  const scrollToBottom = (smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    }
  };

  // Track if user is scrolling up to read old history
  const handleChatScroll = () => {
    const el = chatContainerRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // User is near bottom if within 120px
    isNearBottomRef.current = distanceToBottom < 120;
  };

  // Fetch initial chat history
  const fetchMessages = async () => {
    try {
      const res = await fetch('/api/messages');
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
        if (socket) {
          socket.emit('mark-seen', { readerRole: role });
        }
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    }
  };

  // Socket and Chat listeners
  useEffect(() => {
    fetchMessages();

    // Background auto-sync every 4 seconds for reliable multi-device sync
    const syncInterval = setInterval(() => {
      fetchMessages();
    }, 4000);

    if (!socket) {
      return () => clearInterval(syncInterval);
    }

    const handleConnect = () => {
      socket.emit('join-room', { role });
      socket.emit('mark-seen', { readerRole: role });
      fetchMessages();
    };

    socket.on('connect', handleConnect);
    if (socket.connected) {
      handleConnect();
    }

    socket.on('receive-message', (newMsg) => {
      setMessages((prev) => {
        const exists = prev.some(
          (m) =>
            (newMsg._id && m._id === newMsg._id) ||
            (newMsg.clientMsgId && m.clientMsgId === newMsg.clientMsgId)
        );
        if (exists) {
          return prev.map((m) =>
            (newMsg._id && m._id === newMsg._id) ||
            (newMsg.clientMsgId && m.clientMsgId === newMsg.clientMsgId)
              ? newMsg
              : m
          );
        }
        return [...prev, newMsg];
      });

      // If the received message was from the other user, mark as seen
      if (newMsg.sender !== role) {
        socket.emit('mark-seen', { readerRole: role });
      }
    });

    socket.on('messages-seen-update', ({ readerRole, seenAt }) => {
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.sender !== readerRole) {
            return { ...msg, seen: true, seenAt: seenAt || msg.seenAt };
          }
          return msg;
        })
      );
    });

    socket.on('online-status', (status) => {
      setOnlineUsers(status);
    });

    socket.on('user-typing', ({ sender, isTyping }) => {
      if (sender === otherRole) {
        setIsTypingOther(isTyping);
      }
    });

    socket.on('audio-listened-update', ({ msgId, clientMsgId, listenedAt }) => {
      setMessages((prev) =>
        prev.map((msg) => {
          if (
            (msgId && (msg._id === msgId || String(msg._id) === String(msgId))) ||
            (clientMsgId && msg.clientMsgId === clientMsgId)
          ) {
            return { ...msg, listened: true, listenedAt: listenedAt || new Date() };
          }
          return msg;
        })
      );
    });

    socket.on('messages-deleted', ({ deletedIds }) => {
      if (Array.isArray(deletedIds) && deletedIds.length > 0) {
        setMessages((prev) =>
          prev.filter(
            (msg) =>
              !deletedIds.includes(String(msg._id)) &&
              !deletedIds.includes(String(msg.clientMsgId))
          )
        );
      }
    });

    socket.on('database-wiped', (data) => {
      setMessages([]);
      if (data.systemMsg) {
        setMessages([data.systemMsg]);
      }
      if (onWiped) onWiped();
    });

    return () => {
      clearInterval(syncInterval);
      socket.off('connect', handleConnect);
      socket.off('receive-message');
      socket.off('messages-seen-update');
      socket.off('audio-listened-update');
      socket.off('messages-deleted');
      socket.off('online-status');
      socket.off('user-typing');
      socket.off('database-wiped');
    };
  }, [socket, role]);

  // Anti-Screenshot & Security Protections (Allows full pasting on PC & Mobile)
  useEffect(() => {
    // 1. Allow right-click context menu ONLY on inputs/textareas for pasting
    const handleContextMenu = (e) => {
      if (
        e.target.tagName === 'INPUT' ||
        e.target.tagName === 'TEXTAREA' ||
        e.target.closest('input, textarea')
      ) {
        return true;
      }
      e.preventDefault();
      return false;
    };

    // 2. Prevent dragging out text/media
    const handleDragStart = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return true;
      }
      e.preventDefault();
      return false;
    };

    // 3. Intercept PrintScreen and screenshot shortcuts
    const handleKeyDown = (e) => {
      const isPrintScreen = e.key === 'PrintScreen' || e.keyCode === 44;
      const isSnippingTool =
        (e.ctrlKey || e.metaKey) && e.shiftKey && ['S', 's', '3', '4', '5'].includes(e.key);
      const isDevInspect =
        (e.ctrlKey || e.metaKey) && e.shiftKey && ['I', 'i', 'C', 'c', 'J', 'j'].includes(e.key);
      const isPrint = (e.ctrlKey || e.metaKey) && ['p', 'P'].includes(e.key);

      if (isPrintScreen || isSnippingTool || isDevInspect || isPrint) {
        e.preventDefault();
        setScreenShield(true);
        setTimeout(() => setScreenShield(false), 2500);
      }
    };

    const handleKeyUp = (e) => {
      if (e.key === 'PrintScreen' || e.keyCode === 44) {
        setScreenShield(true);
        setTimeout(() => setScreenShield(false), 2500);
      }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('dragstart', handleDragStart);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('dragstart', handleDragStart);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Smart Scroll Down: ONLY scroll down on initial load or if user is already at the bottom!
  useEffect(() => {
    if (isInitialLoadRef.current) {
      if (messages.length > 0) {
        scrollToBottom(false);
        isInitialLoadRef.current = false;
      }
    } else if (isNearBottomRef.current) {
      scrollToBottom(true);
    }
  }, [messages.length]);

  // Start replying to a message
  const handleStartReply = (msg) => {
    setReplyingTo({
      msgId: msg._id || msg.clientMsgId,
      sender: msg.sender,
      text: msg.type === 'audio' ? '🎤 Voice Note' : (msg.text ? msg.text.substring(0, 100) : 'Voice Note'),
    });
    inputRef.current?.focus();
  };

  // Audio Recording Methods
  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Voice recording is not supported in this browser.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : (MediaRecorder.isTypeSupported('audio/ogg') ? 'audio/ogg' : '');
      }

      const options = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.start(250);
      setIsRecording(true);
      setRecordingDuration(0);

      const startTime = Date.now();
      recordingTimerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setRecordingDuration(elapsed);
        if (elapsed >= 300) {
          stopAndSendRecording();
        }
      }, 500);
    } catch (err) {
      console.error('Microphone access error:', err);
      alert('Could not access microphone. Please allow microphone permissions.');
    }
  };

  const cancelRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }
    setIsRecording(false);
    setRecordingDuration(0);
    audioChunksRef.current = [];
  };

  // Stop recording and switch to Preview Player
  const stopToPreview = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      cancelRecording();
      return;
    }

    const finalDuration = Math.max(1, recordingDuration);

    recorder.onstop = async () => {
      try {
        const mimeType = recorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        if (audioBlob.size < 100) {
          cancelRecording();
          return;
        }

        const audioUrl = URL.createObjectURL(audioBlob);
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreviewAudio({
            audioUrl,
            base64Audio: reader.result,
            duration: finalDuration,
          });
          setIsPreviewPlaying(false);
          setPreviewCurrentTime(0);
        };
        reader.readAsDataURL(audioBlob);
      } catch (err) {
        console.error('Error creating preview audio:', err);
      } finally {
        if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach((track) => track.stop());
          audioStreamRef.current = null;
        }
        setIsRecording(false);
        audioChunksRef.current = [];
      }
    };

    recorder.stop();
  };

  const cancelPreview = () => {
    if (previewAudio?.audioUrl) {
      URL.revokeObjectURL(previewAudio.audioUrl);
    }
    setPreviewAudio(null);
    setIsPreviewPlaying(false);
    setPreviewCurrentTime(0);
    setRecordingDuration(0);
  };

  const sendPreviewAudio = () => {
    if (!previewAudio) return;

    const clientMsgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const currentReply = replyingTo ? { ...replyingTo } : null;
    setReplyingTo(null);

    const newMsg = {
      clientMsgId,
      sender: role,
      text: 'Voice Note',
      type: 'audio',
      audioData: previewAudio.base64Audio,
      audioDuration: previewAudio.duration,
      replyTo: currentReply,
      seen: false,
      seenAt: null,
      listened: false,
      listenedAt: null,
      createdAt: new Date().toISOString(),
    };

    // Optimistic UI update
    setMessages((prev) => [...prev, newMsg]);
    scrollToBottom(true);

    if (socket && socket.connected) {
      socket.emit('send-message', newMsg);
    } else {
      fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMsg),
      }).catch((e) => console.error('Failed to send voice note:', e));
    }

    cancelPreview();
  };

  const togglePreviewPlay = () => {
    const audio = previewAudioRef.current;
    if (!audio) return;

    if (isPreviewPlaying) {
      audio.pause();
      setIsPreviewPlaying(false);
    } else {
      audio.play().then(() => {
        setIsPreviewPlaying(true);
      }).catch((err) => console.error('Preview playback failed:', err));
    }
  };

  const stopAndSendRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      cancelRecording();
      return;
    }

    recorder.onstop = async () => {
      try {
        const mimeType = recorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        if (audioBlob.size < 100) {
          cancelRecording();
          return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
          const base64Audio = reader.result;
          const clientMsgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
          const currentReply = replyingTo ? { ...replyingTo } : null;
          setReplyingTo(null);

          const finalDuration = Math.max(1, recordingDuration);
          const newMsg = {
            clientMsgId,
            sender: role,
            text: 'Voice Note',
            type: 'audio',
            audioData: base64Audio,
            audioDuration: finalDuration,
            replyTo: currentReply,
            seen: false,
            seenAt: null,
            listened: false,
            listenedAt: null,
            createdAt: new Date().toISOString(),
          };

          // Optimistic UI update
          setMessages((prev) => [...prev, newMsg]);
          scrollToBottom(true);

          if (socket && socket.connected) {
            socket.emit('send-message', newMsg);
          } else {
            fetch('/api/messages', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(newMsg),
            }).catch((e) => console.error('Failed to send voice note:', e));
          }
        };
        reader.readAsDataURL(audioBlob);
      } catch (err) {
        console.error('Error processing audio recording:', err);
      } finally {
        if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach((track) => track.stop());
          audioStreamRef.current = null;
        }
        setIsRecording(false);
        setRecordingDuration(0);
        audioChunksRef.current = [];
      }
    };

    recorder.stop();
  };

  // Clean up audio recorder & preview on unmount
  useEffect(() => {
    return () => {
      cancelRecording();
      cancelPreview();
    };
  }, []);

  // Cancel current reply
  const handleCancelReply = () => {
    setReplyingTo(null);
  };

  // Scroll to referenced message when clicking quote
  const scrollToMessage = (targetId) => {
    if (!targetId) return;
    const el = document.getElementById(`msg-${targetId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('highlight-reply');
      setTimeout(() => el.classList.remove('highlight-reply'), 1800);
    }
  };

  // Handle message sending with Optimistic UI & Dual Delivery
  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    const textToSend = inputText.trim();
    if (!textToSend) return;

    const currentReply = replyingTo ? { ...replyingTo } : null;
    setReplyingTo(null);

    const clientMsgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const optimisticMsg = {
      clientMsgId,
      sender: role,
      text: textToSend,
      type: 'text',
      seen: false,
      seenAt: null,
      replyTo: currentReply,
      createdAt: new Date().toISOString(),
    };

    // 1. Instantly display in sender UI and scroll to bottom
    setMessages((prev) => [...prev, optimisticMsg]);
    setInputText('');
    scrollToBottom(true);

    // Clear typing status
    if (socket) {
      socket.emit('typing', { sender: role, isTyping: false });
    }

    // 2. Deliver via Socket.io (if connected)
    if (socket && socket.connected) {
      socket.emit('send-message', {
        sender: role,
        text: textToSend,
        clientMsgId,
        replyTo: currentReply,
      });
    } else {
      // 3. Fallback to HTTP REST only if socket is offline
      try {
        const res = await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: role,
            text: textToSend,
            clientMsgId,
            replyTo: currentReply,
          }),
        });
        if (res.ok) {
          const saved = await res.json();
          setMessages((prev) =>
            prev.map((m) => (m.clientMsgId === clientMsgId ? saved : m))
          );
        }
      } catch (err) {
        console.error('HTTP fallback send error:', err);
      }
    }
  };

  // Handle typing indicator
  const handleInputChange = (e) => {
    setInputText(e.target.value);
    if (!socket) return;

    socket.emit('typing', { sender: role, isTyping: true });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing', { sender: role, isTyping: false });
    }, 2000);
  };

  // Smooth scroll to bottom on input focus (Keyboard appearance)
  const handleInputFocus = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 300);
  };

  // Strictly deduplicated list of messages
  const uniqueMessages = React.useMemo(() => {
    const list = [];
    const seen = new Set();
    for (const m of messages) {
      if (m.type === 'system') continue;
      const key = m._id || m.clientMsgId;
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      list.push(m);
    }
    return list;
  }, [messages]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: '100dvh',
      maxHeight: '100dvh',
      width: '100%',
      maxWidth: '850px',
      margin: '0 auto',
      background: 'rgba(10, 10, 15, 0.95)',
      borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
      borderRight: '1px solid rgba(255, 255, 255, 0.08)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Pure Blackout Anti-Screenshot Security Shield */}
      {screenShield && <div className="pure-black-shield" />}

      {/* Top Navigation Bar with iOS Safe Area Top Padding */}
      <div style={{
        paddingTop: 'max(12px, env(safe-area-inset-top))',
        paddingBottom: '10px',
        paddingLeft: 'max(14px, env(safe-area-inset-left))',
        paddingRight: 'max(14px, env(safe-area-inset-right))',
        background: 'rgba(18, 18, 26, 0.94)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        zIndex: 10
      }}>
        {/* Clean Chat Title & Online Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            fontSize: '15px',
            fontWeight: '700',
            color: '#fff',
            letterSpacing: '0.3px'
          }}>
            Chat
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '11px',
            color: '#10b981',
            borderLeft: '1px solid rgba(255, 255, 255, 0.12)',
            paddingLeft: '10px'
          }}>
            <Circle size={6} fill="#10b981" color="transparent" />
            <span>Online</span>
          </div>
        </div>

        {/* Right Actions: Text Size (+ / -) Controller & Logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Dynamic Text Size Controller (+ / -) */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(255, 255, 255, 0.07)',
            borderRadius: '9px',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            padding: '2px 4px',
            gap: '2px'
          }}>
            <button
              type="button"
              onClick={handleDecreaseFont}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#a5b4fc',
                width: '26px',
                height: '26px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                borderRadius: '6px',
                fontSize: '12.5px',
                fontWeight: '700',
                touchAction: 'manipulation'
              }}
              title="Decrease Text Size (-)"
            >
              A-
            </button>

            <span style={{
              fontSize: '11px',
              color: 'rgba(255, 255, 255, 0.65)',
              minWidth: '22px',
              textAlign: 'center',
              fontWeight: '600'
            }}>
              {Math.round(fontSize)}
            </span>

            <button
              type="button"
              onClick={handleIncreaseFont}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#a5b4fc',
                width: '26px',
                height: '26px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                borderRadius: '6px',
                fontSize: '13.5px',
                fontWeight: '700',
                touchAction: 'manipulation'
              }}
              title="Increase Text Size (+)"
            >
              A+
            </button>
          </div>

          {/* Logout Button */}
          <button
            onClick={onLogout}
            style={{
              padding: '6px 11px',
              borderRadius: '9px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              background: 'rgba(255, 255, 255, 0.06)',
              color: 'var(--text-muted)',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              minHeight: '32px',
              touchAction: 'manipulation'
            }}
          >
            <LogOut size={13} />
            Exit
          </button>
        </div>
      </div>

      {/* Chat Messages Body with Momentum Touch Scroll */}
      <div
        ref={chatContainerRef}
        onScroll={handleChatScroll}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: '12px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}
      >
        {uniqueMessages.length === 0 ? (
          <div style={{
            textAlign: 'center',
            margin: 'auto',
            color: 'var(--text-muted)',
            padding: '30px 16px'
          }}>
            <p style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.35)', margin: 0 }}>
              No messages yet
            </p>
          </div>
        ) : (
          uniqueMessages.map((msg, idx) => {
            const isMe = msg.sender === role;
            const msgIdentifier = msg._id || msg.clientMsgId || idx;

            return (
              <div
                id={`msg-${msgIdentifier}`}
                key={msgIdentifier}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  maxWidth: '85%',
                  alignSelf: 'flex-start',
                  textAlign: 'left',
                  transition: 'background 0.3s'
                }}
              >
                {/* Quoted / Replied-to Reference Box */}
                {msg.replyTo && (
                  <div
                    onClick={() => scrollToMessage(msg.replyTo.msgId)}
                    style={{
                      background: 'rgba(0, 0, 0, 0.45)',
                      borderLeft: '3px solid #818cf8',
                      borderRadius: '8px',
                      padding: '6px 10px',
                      marginBottom: '4px',
                      cursor: 'pointer',
                      maxWidth: '100%',
                      overflow: 'hidden',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                    }}
                    title="Click to jump to quoted message"
                  >
                    <div style={{
                      fontSize: `${Math.max(fontSize - 4, 10.5)}px`,
                      fontWeight: '700',
                      color: '#a5b4fc',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      <CornerDownRight size={12} />
                      <span>Reply</span>
                    </div>
                    <div style={{
                      fontSize: `${Math.max(fontSize - 2.5, 11.5)}px`,
                      color: 'rgba(255, 255, 255, 0.75)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      marginTop: '1px'
                    }}>
                      {msg.replyTo.text}
                    </div>
                  </div>
                )}

                {/* Chat Bubble with Dynamic User Font Size */}
                {/* Chat Bubble with Dynamic User Font Size or Voice Note Player */}
                <div
                  className="chat-bubble-white50"
                  style={{
                    padding: msg.type === 'audio' ? '8px 12px' : `${Math.round(fontSize * 0.58)}px ${Math.round(fontSize * 0.95)}px`,
                    borderRadius: '12px',
                    borderBottomLeftRadius: '2px',
                    borderLeft: isMe ? '3px solid #818cf8' : '1px solid rgba(255, 255, 255, 0.6)',
                    fontSize: `${fontSize}px`,
                    lineHeight: '1.45',
                    wordBreak: 'break-word',
                    display: 'inline-block',
                    textAlign: 'left'
                  }}
                >
                  {msg.type === 'audio' ? (
                    <VoiceMessagePlayer msg={msg} isMe={isMe} socket={socket} role={role} />
                  ) : (
                    msg.text
                  )}
                </div>

                {/* Full Year, Date, Sent Time & Seen Time */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '7px',
                  marginTop: '3px',
                  paddingLeft: '3px',
                  paddingRight: '3px',
                  fontSize: '11.5px',
                  color: 'rgba(255, 255, 255, 0.45)',
                  lineHeight: '1.3'
                }}>
                  <span>
                    {(() => {
                      const d = new Date(msg.createdAt || Date.now());
                      const yyyy = d.getFullYear();
                      const mm = String(d.getMonth() + 1).padStart(2, '0');
                      const dd = String(d.getDate()).padStart(2, '0');
                      const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      return `${yyyy}-${mm}-${dd} ${time}`;
                    })()}
                  </span>
                  {isMe && (
                    <span style={{
                      color: msg.seen ? '#818cf8' : '#f87171',
                      fontWeight: '600',
                      fontSize: '11.5px'
                    }}>
                      {msg.seen
                        ? (() => {
                            const d = new Date(msg.seenAt || msg.createdAt);
                            const yyyy = d.getFullYear();
                            const mm = String(d.getMonth() + 1).padStart(2, '0');
                            const dd = String(d.getDate()).padStart(2, '0');
                            const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            return `• Seen ${yyyy}-${mm}-${dd} ${time}`;
                          })()
                        : '• New'}
                    </span>
                  )}
                  
                  {/* Reply Button */}
                  <button
                    type="button"
                    className="reply-btn-green"
                    onClick={() => handleStartReply(msg)}
                    title="Reply to this message"
                  >
                    <Reply size={11} strokeWidth={2.2} />
                    <span>Reply</span>
                  </button>
                </div>
              </div>
            );
          })
        )}

        {/* Live Typing Indicator */}
        {isTypingOther && (
          <div style={{
            alignSelf: 'flex-start',
            fontSize: '10px',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '3px 8px',
            borderRadius: '8px',
            background: 'rgba(255, 255, 255, 0.05)'
          }}>
            <Sparkles size={10} color="#818cf8" className="pulse-red" />
            <span>typing...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input Bar - Bottom Sticky */}
      <div style={{
        paddingTop: '8px',
        paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
        paddingLeft: 'max(10px, env(safe-area-inset-left))',
        paddingRight: 'max(10px, env(safe-area-inset-right))',
        background: 'rgba(18, 18, 26, 0.98)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        flexShrink: 0,
        width: '100%',
        boxSizing: 'border-box'
      }}>
        {/* Active Reply Banner */}
        {replyingTo && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 12px',
            background: 'rgba(28, 28, 38, 0.95)',
            borderLeft: '3px solid #818cf8',
            borderRadius: '8px',
            marginBottom: '8px',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', flex: 1 }}>
              <Reply size={13} color="#818cf8" style={{ flexShrink: 0 }} />
              <div style={{ overflow: 'hidden', fontSize: '11px', lineHeight: '1.3' }}>
                <span style={{ fontWeight: '700', color: '#a5b4fc', marginRight: '6px' }}>
                  Replying:
                </span>
                <span style={{ color: 'rgba(255, 255, 255, 0.65)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {replyingTo.text}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCancelReply}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.5)',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                touchAction: 'manipulation'
              }}
              title="Cancel Reply"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {previewAudio ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            width: '100%',
            padding: '6px 10px',
            background: 'rgba(99, 102, 241, 0.12)',
            border: '1px solid rgba(99, 102, 241, 0.35)',
            borderRadius: '14px',
            boxSizing: 'border-box',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <audio
              ref={previewAudioRef}
              src={previewAudio.audioUrl}
              onTimeUpdate={() => {
                if (previewAudioRef.current) {
                  setPreviewCurrentTime(previewAudioRef.current.currentTime);
                }
              }}
              onEnded={() => {
                setIsPreviewPlaying(false);
                setPreviewCurrentTime(0);
              }}
            />

            {/* Discard / Trash button */}
            <button
              type="button"
              onClick={cancelPreview}
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                background: 'rgba(239, 68, 68, 0.12)',
                color: '#f87171',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                touchAction: 'manipulation',
                flexShrink: 0
              }}
              title="Discard Voice Note"
            >
              <Trash2 size={16} />
            </button>

            {/* Play/Pause Preview button */}
            <button
              type="button"
              onClick={togglePreviewPlay}
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                border: 'none',
                background: isPreviewPlaying ? '#10b981' : '#6366f1',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                touchAction: 'manipulation',
                flexShrink: 0,
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
              }}
              title={isPreviewPlaying ? 'Pause Preview' : 'Play Preview'}
            >
              {isPreviewPlaying ? <Pause size={16} /> : <Play size={16} style={{ marginLeft: '2px' }} />}
            </button>

            {/* Scrubber & Duration */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
              <input
                type="range"
                min="0"
                max={previewAudio.duration || 1}
                step="0.1"
                value={previewCurrentTime}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (previewAudioRef.current) {
                    previewAudioRef.current.currentTime = val;
                    setPreviewCurrentTime(val);
                  }
                }}
                style={{
                  width: '100%',
                  accentColor: '#818cf8',
                  cursor: 'pointer',
                  height: '4px'
                }}
              />
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '10px',
                color: 'rgba(255, 255, 255, 0.75)',
                fontFamily: 'monospace'
              }}>
                <span>
                  {Math.floor(previewCurrentTime / 60)}:{Math.floor(previewCurrentTime % 60) < 10 ? '0' : ''}{Math.floor(previewCurrentTime % 60)}
                </span>
                <span style={{ color: '#a5b4fc', fontWeight: '600' }}>
                  Preview ({Math.floor(previewAudio.duration / 60)}:{Math.floor(previewAudio.duration % 60) < 10 ? '0' : ''}{Math.floor(previewAudio.duration % 60)})
                </span>
              </div>
            </div>

            {/* Send Button */}
            <button
              type="button"
              onClick={sendPreviewAudio}
              style={{
                height: '38px',
                padding: '0 14px',
                borderRadius: '10px',
                border: 'none',
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: '#fff',
                fontWeight: '600',
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                touchAction: 'manipulation',
                flexShrink: 0,
                boxShadow: '0 2px 10px rgba(16, 185, 129, 0.4)'
              }}
              title="Send Voice Note"
            >
              <Send size={15} />
              <span>Send</span>
            </button>
          </div>
        ) : isRecording ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            width: '100%',
            padding: '6px 12px',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: '14px',
            boxSizing: 'border-box',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
              <div style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: '#ef4444',
                boxShadow: '0 0 10px #ef4444',
                animation: 'pulseRed 1.2s infinite',
                flexShrink: 0
              }} />
              <span style={{
                fontSize: '13.5px',
                fontWeight: '700',
                color: '#fca5a5',
                fontFamily: 'monospace',
                flexShrink: 0
              }}>
                {Math.floor(recordingDuration / 60)}:{recordingDuration % 60 < 10 ? '0' : ''}{recordingDuration % 60}
              </span>
              <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Recording...
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              {/* Discard Button */}
              <button
                type="button"
                onClick={cancelRecording}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: '#f87171',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  touchAction: 'manipulation'
                }}
                title="Discard Recording"
              >
                <Trash2 size={16} />
              </button>

              {/* Stop & Listen (Preview) Button */}
              <button
                type="button"
                onClick={stopToPreview}
                style={{
                  height: '36px',
                  padding: '0 10px',
                  borderRadius: '10px',
                  border: '1px solid rgba(99, 102, 241, 0.4)',
                  background: 'rgba(99, 102, 241, 0.25)',
                  color: '#a5b4fc',
                  fontWeight: '600',
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  touchAction: 'manipulation'
                }}
                title="Stop recording and preview audio"
              >
                <Square size={13} fill="#a5b4fc" />
                <span>Preview</span>
              </button>

              {/* Instant Send Button */}
              <button
                type="button"
                onClick={stopAndSendRecording}
                style={{
                  height: '36px',
                  padding: '0 12px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: '#fff',
                  fontWeight: '600',
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  touchAction: 'manipulation',
                  boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)'
                }}
                title="Send Voice Note Directly"
              >
                <Send size={14} />
                <span>Send</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSendMessage} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            width: '100%',
            boxSizing: 'border-box'
          }}>
            {/* Quick Paste Button */}
            <button
              type="button"
              onClick={async () => {
                try {
                  if (navigator.clipboard && navigator.clipboard.readText) {
                    const text = await navigator.clipboard.readText();
                    if (text) {
                      setInputText((prev) => prev + text);
                      inputRef.current?.focus();
                    }
                  }
                } catch (err) {
                  console.log('Clipboard paste note:', err);
                }
              }}
              style={{
                flexShrink: 0,
                width: '42px',
                height: '44px',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                background: 'rgba(255, 255, 255, 0.06)',
                color: '#a5b4fc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                touchAction: 'manipulation',
                boxSizing: 'border-box'
              }}
              title="Paste copied text"
            >
              <Clipboard size={17} />
            </button>

            {/* Mic Record Button */}
            <button
              type="button"
              onClick={startRecording}
              style={{
                flexShrink: 0,
                width: '42px',
                height: '44px',
                borderRadius: '12px',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                background: 'rgba(16, 185, 129, 0.14)',
                color: '#34d399',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                touchAction: 'manipulation',
                boxSizing: 'border-box',
                transition: 'all 0.2s'
              }}
              title="Record Voice Note (Auto-deletes 3 days after listening)"
            >
              <Mic size={18} />
            </button>

            {/* Text Input */}
            <input
              ref={inputRef}
              type="text"
              placeholder="Type a message..."
              value={inputText}
              onChange={handleInputChange}
              onFocus={handleInputFocus}
              style={{
                flex: 1,
                minWidth: 0,
                padding: '10px 14px',
                borderRadius: '12px',
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#fff',
                fontSize: '16px',
                outline: 'none',
                height: '44px',
                touchAction: 'manipulation',
                boxSizing: 'border-box'
              }}
            />

            {/* Send Button */}
            <button
              type="submit"
              disabled={!inputText.trim()}
              style={{
                flexShrink: 0,
                width: '46px',
                height: '44px',
                padding: 0,
                borderRadius: '12px',
                border: 'none',
                background: inputText.trim() 
                  ? 'linear-gradient(135deg, #6366f1, #4f46e5)' 
                  : 'rgba(255, 255, 255, 0.1)',
                color: inputText.trim() ? '#fff' : 'rgba(255, 255, 255, 0.3)',
                cursor: inputText.trim() ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                touchAction: 'manipulation',
                transition: 'all 0.2s',
                boxSizing: 'border-box'
              }}
            >
              <Send size={17} />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
