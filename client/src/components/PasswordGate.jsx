import React, { useState, useEffect } from 'react';
import { Lock, Eye, EyeOff, ArrowRight, Share, PlusSquare, Smartphone, X } from 'lucide-react';

function getOrCreateDeviceId() {
  let id = localStorage.getItem('secret_chat_device_id');
  if (!id) {
    id = 'dev_' + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
    localStorage.setItem('secret_chat_device_id', id);
  }
  return id;
}

export default function PasswordGate({ onLoginSuccess, onDatabaseWiped, statusInfo }) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [isIOSDevice, setIsIOSDevice] = useState(false);
  const [isStandaloneMode, setIsStandaloneMode] = useState(false);

  useEffect(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    setIsIOSDevice(isIOS);
    setIsStandaloneMode(isStandalone);
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!password.trim()) {
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const deviceId = getOrCreateDeviceId();
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, deviceId }),
      });

      const data = await res.json();
      setLoading(false);

      if (res.ok && data.success) {
        onLoginSuccess(data.role, password);
      } else {
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 500);

        if (data.wiped) {
          setErrorMsg('Wiped');
          if (onDatabaseWiped) onDatabaseWiped();
        } else {
          setErrorMsg(data.message || 'Incorrect password');
        }
      }
    } catch (err) {
      setLoading(false);
      setErrorMsg('Connection error');
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100dvh',
      paddingTop: 'max(20px, env(safe-area-inset-top))',
      paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
      paddingLeft: 'max(20px, env(safe-area-inset-left))',
      paddingRight: 'max(20px, env(safe-area-inset-right))',
      position: 'relative'
    }}>
      {/* Subtle Background Glow */}
      <div style={{
        position: 'absolute',
        width: '280px',
        height: '280px',
        background: 'rgba(99, 102, 241, 0.12)',
        filter: 'blur(90px)',
        borderRadius: '50%',
        zIndex: 0,
      }} />

      <div className={`glass-panel ${isShaking ? 'shake-animation' : ''}`} style={{
        width: '100%',
        maxWidth: '360px',
        borderRadius: '24px',
        padding: '32px 24px',
        position: 'relative',
        zIndex: 1,
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)'
      }}>
        {/* Minimal Lock Icon */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: '28px'
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '18px',
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(59, 130, 246, 0.1))',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 20px rgba(0, 0, 0, 0.3)'
          }}>
            <Lock size={26} color="#818cf8" />
          </div>
        </div>

        {/* Minimal Form */}
        <form onSubmit={handleLogin}>
          <div style={{ position: 'relative', marginBottom: errorMsg ? '12px' : '18px' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Code"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errorMsg) setErrorMsg('');
              }}
              autoFocus
              style={{
                width: '100%',
                padding: '14px 44px 14px 16px',
                borderRadius: '14px',
                background: 'rgba(0, 0, 0, 0.45)',
                border: errorMsg ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.12)',
                color: '#fff',
                fontSize: '16px',
                outline: 'none',
                minHeight: '44px',
                touchAction: 'manipulation',
                transition: 'border-color 0.2s ease',
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
              style={{
                position: 'absolute',
                right: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.4)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0
              }}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {errorMsg && (
            <div style={{
              color: '#ef4444',
              fontSize: '12px',
              textAlign: 'center',
              marginBottom: '16px',
              fontWeight: '500'
            }}>
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: '14px',
              border: 'none',
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              color: '#fff',
              fontWeight: '600',
              fontSize: '15px',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 20px rgba(99, 102, 241, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'opacity 0.2s ease, transform 0.1s ease',
              opacity: loading ? 0.7 : 1
            }}
          >
            <span>{loading ? 'Logging in...' : 'Log In'}</span>
            {!loading && <ArrowRight size={16} />}
          </button>
        </form>

        {/* iOS / Mobile Add to Home Screen shortcut trigger */}
        {!isStandaloneMode && (
          <div style={{ marginTop: '20px', textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => setShowInstallGuide(true)}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: 'rgba(255, 255, 255, 0.7)',
                padding: '8px 14px',
                borderRadius: '10px',
                fontSize: '11px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                touchAction: 'manipulation'
              }}
            >
              <Smartphone size={13} color="#818cf8" />
              <span>Add App to Home Screen</span>
            </button>
          </div>
        )}
      </div>

      {/* iOS Step-by-Step Install Guide Modal */}
      {showInstallGuide && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div className="glass-panel" style={{
            width: '100%',
            maxWidth: '340px',
            borderRadius: '20px',
            padding: '24px 20px',
            background: 'rgba(20, 20, 30, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            boxShadow: '0 25px 50px rgba(0,0,0,0.8)'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Smartphone size={18} color="#818cf8" />
                <h3 style={{ fontSize: '15px', color: '#fff', fontWeight: '700', margin: 0 }}>
                  Install on iPhone / iPad
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowInstallGuide(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(255, 255, 255, 0.5)',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.65)', lineHeight: '1.4', marginBottom: '16px' }}>
              Install this app directly to your iOS Home Screen for instant 1-tap access in fullscreen:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: 'rgba(255, 255, 255, 0.04)',
                padding: '10px 12px',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.06)'
              }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '8px',
                  background: 'rgba(99, 102, 241, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Share size={15} color="#818cf8" />
                </div>
                <div style={{ fontSize: '11.5px', color: '#fff' }}>
                  <strong style={{ color: '#818cf8' }}>Step 1:</strong> Tap Safari's <strong>Share</strong> button in the bottom toolbar.
                </div>
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: 'rgba(255, 255, 255, 0.04)',
                padding: '10px 12px',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.06)'
              }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '8px',
                  background: 'rgba(16, 185, 129, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <PlusSquare size={15} color="#10b981" />
                </div>
                <div style={{ fontSize: '11.5px', color: '#fff' }}>
                  <strong style={{ color: '#10b981' }}>Step 2:</strong> Scroll and select <strong>"Add to Home Screen"</strong>.
                </div>
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: 'rgba(255, 255, 255, 0.04)',
                padding: '10px 12px',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.06)'
              }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '8px',
                  background: 'rgba(245, 158, 11, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: '11px',
                  fontWeight: '700',
                  color: '#f59e0b'
                }}>
                  3
                </div>
                <div style={{ fontSize: '11.5px', color: '#fff' }}>
                  <strong style={{ color: '#f59e0b' }}>Step 3:</strong> Tap <strong>"Add"</strong> in top right corner.
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowInstallGuide(false)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '12px',
                border: 'none',
                background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                color: '#fff',
                fontWeight: '600',
                fontSize: '13px',
                cursor: 'pointer',
                touchAction: 'manipulation'
              }}
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

