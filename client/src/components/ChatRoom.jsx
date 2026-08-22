import React, { useState, useEffect, useRef } from 'react';
import { Send, Lock, LogOut, Sparkles, ShieldAlert } from 'lucide-react';

export default function ChatRoom({ role, userPassword, socket, onLogout, onWiped }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
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

    if (!socket) return;

    socket.emit('join-room', { role });
    socket.emit('mark-seen', { readerRole: role });

    socket.on('receive-message', (newMsg) => {
      setMessages((prev) => [...prev, newMsg]);
      // If the received message was from the other user, instantly mark as seen
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
      socket.off('receive-message');
      socket.off('messages-seen-update');
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
      position: 'relative',
      userSelect: 'none',
      WebkitUserSelect: 'none'
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

      {/* Top Navigation Bar */}
      <div style={{
        padding: '14px 18px',
        background: 'rgba(18, 18, 26, 0.9)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 10
      }}>
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
                {/* Chat Bubble (+30% size, 50% white transparency) */}
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

                {/* Timestamp & Read / Seen Status */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  marginTop: '2px',
                  paddingLeft: '3px',
                  paddingRight: '3px',
                  fontSize: '8px',
                  color: 'rgba(255, 255, 255, 0.3)'
                }}>
                  <span>
                    {new Date(msg.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {isMe && (
                    <span style={{
                      color: msg.seen ? '#818cf8' : 'rgba(255, 255, 255, 0.25)',
                      fontWeight: msg.seen ? '600' : '400',
                      fontSize: '7.5px'
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
            fontSize: '11px',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            borderRadius: '10px',
            background: 'rgba(255, 255, 255, 0.05)'
          }}>
            <Sparkles size={11} color="#818cf8" className="pulse-red" />
            <span>typing...</span>
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
