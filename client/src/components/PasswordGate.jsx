import React, { useState } from 'react';
import { Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';

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
              placeholder="Password"
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
      </div>
    </div>
  );
}

