import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, Trash2, Shield, Lock, Circle, Globe, LogOut, Key, 
  Sparkles, CheckCheck, RefreshCw, AlertOctagon, HelpCircle 
} from 'lucide-react';

export default function ChatRoom({ role, userPassword, socket, onLogout, onWiped }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [onlineUsers, setOnlineUsers] = useState({ BOT1: false, BOT2: false });
  const [isTypingOther, setIsTypingOther] = useState(false);
  const [showSinhalaHelper, setShowSinhalaHelper] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [passUpdateStatus, setPassUpdateStatus] = useState('');
  const [securityStats, setSecurityStats] = useState(null);

  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const otherRole = role === 'BOT1' ? 'BOT2' : 'BOT1';

  // Sinhala quick phrases for easy typing
  const sinhalaPhrases = [
    'කොහොමද?', 'හරි', 'ඔව්', 'නෑ', 'ස්තූතියි', 
    'මම ආවා', 'පස්සෙ කතා කරමු', 'ලින්ක් එක එවන්න', 
    'ඕක සිරා', 'පරිස්සමෙන් ඉන්න'
  ];

  // Fetch initial chat history
  const fetchMessages = async () => {
    try {
      const res = await fetch('/api/messages');
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    }
  };

  // Fetch security stats
  const fetchSecurityStats = async () => {
    try {
      const res = await fetch('/api/security/status');
      if (res.ok) {
        const data = await res.json();
        setSecurityStats(data);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  useEffect(() => {
    fetchMessages();
    fetchSecurityStats();

    if (!socket) return;

    socket.emit('join-room', { role });

    socket.on('receive-message', (newMsg) => {
      setMessages((prev) => [...prev, newMsg]);
    });

    socket.on('online-status', (status) => {
      setOnlineUsers(status);
    });

    socket.on('user-typing', ({ sender, isTyping }) => {
      if (sender !== role) {
        setIsTypingOther(isTyping);
      }
    });

    socket.on('database-wiped', (data) => {
      setMessages([]);
      if (data.systemMsg) {
        setMessages([data.systemMsg]);
      }
      fetchSecurityStats();
      if (onWiped) onWiped();
    });

    return () => {
      socket.off('receive-message');
      socket.off('online-status');
      socket.off('user-typing');
      socket.off('database-wiped');
    };
  }, [socket, role]);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTypingOther]);

  // Handle message sending
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const clientMsgId = Date.now().toString();
    const payload = {
      sender: role,
      text: inputText.trim(),
      clientMsgId,
    };

    socket.emit('send-message', payload);
    setInputText('');

    // Clear typing status
    socket.emit('typing', { sender: role, isTyping: false });
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

  // Append Sinhala quick phrase
  const addPhrase = (phrase) => {
    setInputText((prev) => (prev ? `${prev} ${phrase}` : phrase));
  };

  // Manual Wipe (BOT1 Super Admin feature)
  const handleManualWipe = async () => {
    if (role !== 'BOT1') return;
    if (window.confirm('⚠️ Are you sure you want to PERMANENTLY wipe all MongoDB chat history?')) {
      try {
        const res = await fetch('/api/security/manual-wipe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: userPassword }),
        });
        if (res.ok) {
          socket.emit('manual-wipe-request', { sender: role });
        }
      } catch (err) {
        console.error('Wipe failed:', err);
      }
    }
  };

  // Password update by BOT1
  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 4) {
      setPassUpdateStatus('Password must be at least 4 characters');
      return;
    }

    try {
      const res = await fetch('/api/security/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword, currentPassword: userPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setPassUpdateStatus('✅ Password updated successfully!');
        setNewPassword('');
      } else {
        setPassUpdateStatus(`❌ ${data.error || 'Failed to update'}`);
      }
    } catch (err) {
      setPassUpdateStatus('Error connecting to server');
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      maxWidth: '900px',
      margin: '0 auto',
      background: 'rgba(10, 10, 15, 0.95)',
      borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
      borderRight: '1px solid rgba(255, 255, 255, 0.08)',
      position: 'relative'
    }}>
      
      {/* Top Navigation Bar */}
      <div style={{
        padding: '16px 20px',
        background: 'rgba(18, 18, 26, 0.9)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 10
      }}>
        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
          {/* Logout Button */}
          <button
            onClick={onLogout}
            style={{
              padding: '7px 14px',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              background: 'rgba(255, 255, 255, 0.05)',
              color: 'var(--text-muted)',
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'background 0.2s ease'
            }}
          >
            <LogOut size={14} />
            Exit
          </button>
        </div>
      </div>

      {/* Chat Messages Body */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        {messages.length === 0 ? (
          <div style={{
            textAlign: 'center',
            margin: 'auto',
            color: 'var(--text-muted)',
            padding: '40px 20px'
          }}>
            <Lock size={36} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
            <h3 style={{ fontSize: '14px', color: '#fff', marginBottom: '4px' }}>
              Secret Chat Ready
            </h3>
            <p style={{ fontSize: '11px', maxWidth: '260px', margin: '0 auto', opacity: 0.7 }}>
              No messages yet. Send a message to start secret conversation.
            </p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            if (msg.type === 'system') {
              return (
                <div key={msg._id || idx} style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  borderRadius: '10px',
                  padding: '8px 12px',
                  color: '#fca5a5',
                  fontSize: '10px',
                  textAlign: 'center',
                  margin: '6px 0'
                }}>
                  {msg.text}
                </div>
              );
            }

            const isMe = msg.sender === role;

            return (
              <div
                key={msg._id || idx}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isMe ? 'flex-end' : 'flex-start',
                  maxWidth: '82%',
                  alignSelf: isMe ? 'flex-end' : 'flex-start'
                }}
              >
                {/* 
                  CHAT BUBBLE STYLING (+30% size, 50% white transparency)
                */}
                <div
                  className={`chat-bubble-white50 ${isMe ? 'chat-bubble-me' : 'chat-bubble-other'}`}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '11px',
                    fontSize: '8.5px',
                    lineHeight: '1.35',
                    wordBreak: 'break-word',
                    display: 'inline-block'
                  }}
                >
                  {msg.text}
                </div>

                {/* Timestamp */}
                <span style={{
                  fontSize: '8px',
                  color: 'rgba(255, 255, 255, 0.3)',
                  marginTop: '2px',
                  paddingLeft: '3px',
                  paddingRight: '3px'
                }}>
                  {new Date(msg.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            );
          })
        )}

        {/* Live Typing Indicator */}
        {isTypingOther && (
          <div style={{
            alignSelf: 'flex-start',
            fontSize: '12px',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '12px',
            background: 'rgba(255, 255, 255, 0.05)'
          }}>
            <Sparkles size={12} color="#818cf8" className="pulse-red" />
            <span>{otherRole} is typing...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input Bar */}
      <div style={{
        padding: '14px 16px',
        background: 'rgba(18, 18, 26, 0.95)',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
      }}>
        <form onSubmit={handleSendMessage} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Text Input */}
          <input
            type="text"
            placeholder="Type a secret message..."
            value={inputText}
            onChange={handleInputChange}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: '14px',
              background: 'rgba(0, 0, 0, 0.4)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#fff',
              fontSize: '14px',
              outline: 'none'
            }}
          />

          {/* Send Button */}
          <button
            type="submit"
            disabled={!inputText.trim()}
            style={{
              padding: '12px 18px',
              borderRadius: '14px',
              border: 'none',
              background: inputText.trim() 
                ? 'linear-gradient(135deg, #6366f1, #4f46e5)' 
                : 'rgba(255, 255, 255, 0.1)',
              color: inputText.trim() ? '#fff' : 'rgba(255, 255, 255, 0.3)',
              cursor: inputText.trim() ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s'
            }}
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}
