import React, { useState, useEffect, useRef } from 'react';
import { Send, Lock, LogOut, Sparkles, ShieldAlert, Circle } from 'lucide-react';

export default function ChatRoom({ role, userPassword, socket, onLogout, onWiped }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [onlineUsers, setOnlineUsers] = useState({ BOT1: false, BOT2: false });
  const [isTypingOther, setIsTypingOther] = useState(false);
  const [screenShield, setScreenShield] = useState(false);

  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const otherRole = role === 'BOT1' ? 'BOT2' : 'BOT1';

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
            return { ...msg, seen: true, seenAt: msg.seenAt || seenAt };
          }
          return msg;
        })
      );
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
      if (onWiped) onWiped();
    });

    return () => {
      clearInterval(syncInterval);
      socket.off('connect', handleConnect);
      socket.off('receive-message');
      socket.off('messages-seen-update');
      socket.off('online-status');
      socket.off('user-typing');
      socket.off('database-wiped');
    };
  }, [socket, role]);

  // Anti-Screenshot & Anti-Screen-Record Protections
  useEffect(() => {
    // 1. Prevent right-click / context menu
    const handleContextMenu = (e) => {
      e.preventDefault();
      return false;
    };

    // 2. Prevent drag & drop of text/media
    const handleDragStart = (e) => {
      e.preventDefault();
      return false;
    };

    // 3. Intercept PrintScreen and screenshot shortcuts
    const handleKeyDown = (e) => {
      const isPrintScreen = e.key === 'PrintScreen' || e.keyCode === 44;
      const isSnippingTool = (e.ctrlKey || e.metaKey) && e.shiftKey && ['S', 's', '3', '4', '5'].includes(e.key);
      const isDevInspect = (e.ctrlKey || e.metaKey) && e.shiftKey && ['I', 'i', 'C', 'c', 'J', 'j'].includes(e.key);
      const isPrintOrSave = (e.ctrlKey || e.metaKey) && ['p', 'P', 's', 'S', 'u', 'U'].includes(e.key);

      if (isPrintScreen || isSnippingTool || isDevInspect || isPrintOrSave) {
        e.preventDefault();
        try {
          if (navigator.clipboard) {
            navigator.clipboard.writeText('');
          }
        } catch (err) {}

        setScreenShield(true);
        setTimeout(() => setScreenShield(false), 2000);
      }
    };

    // 4. Prevent copying text
    const handleCopy = (e) => {
      e.preventDefault();
      try {
        if (navigator.clipboard) {
          navigator.clipboard.writeText('');
        }
      } catch (err) {}
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('dragstart', handleDragStart);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('copy', handleCopy);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('dragstart', handleDragStart);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('copy', handleCopy);
    };
  }, []);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTypingOther]);

  // Handle message sending with Optimistic UI & Dual Delivery
  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    const textToSend = inputText.trim();
    if (!textToSend) return;

    const clientMsgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const optimisticMsg = {
      clientMsgId,
      sender: role,
      text: textToSend,
      type: 'text',
      seen: false,
      seenAt: null,
      createdAt: new Date().toISOString(),
    };

    // 1. Instantly display in sender UI
    setMessages((prev) => [...prev, optimisticMsg]);
    setInputText('');

    // Clear typing status
    if (socket) {
      socket.emit('typing', { sender: role, isTyping: false });
    }

    // 2. Deliver via Socket.io
    if (socket && socket.connected) {
      socket.emit('send-message', {
        sender: role,
        text: textToSend,
        clientMsgId,
      });
    }

    // 3. Always back up delivery via HTTP API
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: role,
          text: textToSend,
          clientMsgId,
        }),
      });
      if (res.ok) {
        const saved = await res.json();
        setMessages((prev) =>
          prev.map((m) => (m.clientMsgId === clientMsgId ? saved : m))
        );
      }
    } catch (err) {
      console.error('HTTP backup send error:', err);
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
      {/* Anti-Screenshot Blackout Security Shield */}
      {screenShield && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: '#000000',
          zIndex: 99999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          color: '#ef4444',
          textAlign: 'center',
          padding: '20px'
        }}>
          <ShieldAlert size={48} color="#ef4444" />
          <h2 style={{ fontSize: '18px', fontWeight: '700', letterSpacing: '0.5px' }}>
            SCREENSHOT / CAPTURE PROTECTED
          </h2>
          <p style={{ fontSize: '12px', color: '#94a3b8' }}>
            Screen recording and captures are blocked for security.
          </p>
        </div>
      )}

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
        {/* User Identity & Peer Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            fontSize: '13px',
            fontWeight: '700',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}>
            <span>{role}</span>
            <span style={{
              fontSize: '9.5px',
              fontWeight: '600',
              color: '#818cf8',
              background: 'rgba(99, 102, 241, 0.18)',
              border: '1px solid rgba(99, 102, 241, 0.35)',
              padding: '2px 6px',
              borderRadius: '6px'
            }}>
              (Me)
            </span>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '11px',
            color: onlineUsers[otherRole] ? '#10b981' : 'var(--text-muted)',
            borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
            paddingLeft: '8px'
          }}>
            <Circle size={6} fill={onlineUsers[otherRole] ? '#10b981' : '#64748b'} color="transparent" />
            <span>{otherRole}: {onlineUsers[otherRole] ? 'Online' : 'Offline'}</span>
          </div>
        </div>

        {/* Logout Button */}
        <button
          onClick={onLogout}
          style={{
            padding: '6px 12px',
            borderRadius: '10px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            background: 'rgba(255, 255, 255, 0.06)',
            color: 'var(--text-muted)',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            minHeight: '34px',
            touchAction: 'manipulation'
          }}
        >
          <LogOut size={13} />
          Exit
        </button>
      </div>

      {/* Chat Messages Body with Momentum Touch Scroll */}
      <div style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        padding: '12px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        {messages.filter((m) => m.type !== 'system').length === 0 ? (
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
          messages
            .filter((m) => m.type !== 'system')
            .map((msg, idx) => {
              const isMe = msg.sender === role;

            return (
              <div
                key={msg._id || msg.clientMsgId || idx}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  maxWidth: '85%',
                  alignSelf: 'flex-start',
                  textAlign: 'left'
                }}
              >
                {/* Sender tag with distinct role color */}
                <span style={{
                  fontSize: '10px',
                  fontWeight: '600',
                  color: isMe ? '#a5b4fc' : '#38bdf8',
                  marginBottom: '2px',
                  paddingLeft: '3px'
                }}>
                  {isMe ? `${msg.sender} (Me)` : msg.sender}
                </span>

                {/* Chat Bubble (+20% size increase, 50% white transparency, left aligned) */}
                <div
                  className="chat-bubble-white50"
                  style={{
                    padding: '7px 12px',
                    borderRadius: '12px',
                    borderBottomLeftRadius: '2px',
                    fontSize: '10.5px',
                    lineHeight: '1.4',
                    wordBreak: 'break-word',
                    display: 'inline-block',
                    textAlign: 'left'
                  }}
                >
                  {msg.text}
                </div>

                {/* Timestamp & Read / Seen Status */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  marginTop: '3px',
                  paddingLeft: '3px',
                  paddingRight: '3px',
                  fontSize: '9px',
                  color: 'rgba(255, 255, 255, 0.4)'
                }}>
                  <span>
                    {new Date(msg.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {isMe && (
                    <span style={{
                      color: msg.seen ? '#818cf8' : 'rgba(255, 255, 255, 0.3)',
                      fontWeight: msg.seen ? '600' : '400',
                      fontSize: '9px'
                    }}>
                      {msg.seen
                        ? `• Seen ${new Date(msg.seenAt || msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                        : '• Sent'}
                    </span>
                  )}
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
        <form onSubmit={handleSendMessage} style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '100%',
          boxSizing: 'border-box'
        }}>
          {/* Text Input */}
          <input
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
      </div>
    </div>
  );
}
