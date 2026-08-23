import React, { useState, useEffect, useRef } from 'react';
import { Send, Lock, LogOut, Sparkles, ShieldAlert, Circle, Reply, X, CornerDownRight, Clipboard } from 'lucide-react';

export default function ChatRoom({ role, userPassword, socket, onLogout, onWiped }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [onlineUsers, setOnlineUsers] = useState({ BOT1: false, BOT2: false });
  const [isTypingOther, setIsTypingOther] = useState(false);
  const [screenShield, setScreenShield] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null); // { msgId, sender, text }

  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const inputRef = useRef(null);

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

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTypingOther]);

  // Start replying to a message
  const handleStartReply = (msg) => {
    setReplyingTo({
      msgId: msg._id || msg.clientMsgId,
      sender: msg.sender,
      text: msg.text,
    });
    inputRef.current?.focus();
  };

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

    // 1. Instantly display in sender UI
    setMessages((prev) => [...prev, optimisticMsg]);
    setInputText('');

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
                      fontSize: '10.5px',
                      fontWeight: '700',
                      color: '#a5b4fc',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      <CornerDownRight size={11} />
                      <span>Reply</span>
                    </div>
                    <div style={{
                      fontSize: '11.5px',
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

                {/* Chat Bubble (+20% size increase, 50% white transparency, left aligned) */}
                <div
                  className="chat-bubble-white50"
                  style={{
                    padding: '8px 14px',
                    borderRadius: '12px',
                    borderBottomLeftRadius: '2px',
                    borderLeft: isMe ? '3px solid #818cf8' : '1px solid rgba(255, 255, 255, 0.6)',
                    fontSize: '13px',
                    lineHeight: '1.45',
                    wordBreak: 'break-word',
                    display: 'inline-block',
                    textAlign: 'left'
                  }}
                >
                  {msg.text}
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
                  fontSize: '10.5px',
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
                      color: msg.seen ? '#818cf8' : 'rgba(255, 255, 255, 0.35)',
                      fontWeight: msg.seen ? '600' : '400',
                      fontSize: '10.5px'
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
                        : '• Sent'}
                    </span>
                  )}
                  
                  {/* Reply Button */}
                  <button
                    type="button"
                    onClick={() => handleStartReply(msg)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'rgba(255, 255, 255, 0.45)',
                      cursor: 'pointer',
                      padding: '1px 4px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '3px',
                      fontSize: '10.5px',
                      borderRadius: '4px',
                      touchAction: 'manipulation'
                    }}
                    title="Reply to this message"
                  >
                    <Reply size={11} />
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
      </div>
    </div>
  );
}
