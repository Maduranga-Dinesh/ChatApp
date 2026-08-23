import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import PasswordGate from './components/PasswordGate';
import ChatRoom from './components/ChatRoom';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState(null); // 'BOT1' or 'BOT2'
  const [userPassword, setUserPassword] = useState('');
  const [socket, setSocket] = useState(null);
  const [statusInfo, setStatusInfo] = useState(null);
  const socketRef = useRef(null);

  // Fetch initial security status (remaining attempts, etc.)
  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/security/status');
      if (res.ok) {
        const data = await res.json();
        setStatusInfo(data);
      }
    } catch (err) {
      console.error('Failed to fetch status:', err);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleLoginSuccess = (role, password) => {
    setUserRole(role);
    setUserPassword(password);
    
    // Connect Socket.io with websocket + polling fallback and auto-reconnect
    const newSocket = io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 10000,
    });
    socketRef.current = newSocket;
    setSocket(newSocket);

    setIsAuthenticated(true);
  };

  const handleLogout = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setSocket(null);
    setIsAuthenticated(false);
    setUserRole(null);
    setUserPassword('');
    fetchStatus();
  }, []);

  const handleDatabaseWiped = () => {
    fetchStatus();
  };

  // Auto-lock when screen turns off, window minimizes, app switches (visibility hidden), or inactive for 3 minutes
  useEffect(() => {
    if (!isAuthenticated) return;

    // 1. Lock immediately on visibility change (minimize, switch app, screen off) or pagehide
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleLogout();
      }
    };

    const handlePageHide = () => {
      handleLogout();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    // 2. Inactivity timer for 3 minutes (180,000 ms)
    const INACTIVITY_TIMEOUT = 3 * 60 * 1000; // 3 minutes
    let inactivityTimer = setTimeout(() => {
      handleLogout();
    }, INACTIVITY_TIMEOUT);

    const resetInactivityTimer = () => {
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        handleLogout();
      }, INACTIVITY_TIMEOUT);
    };

    const activityEvents = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'touchmove',
      'wheel',
      'scroll',
      'click',
    ];

    activityEvents.forEach((evt) => {
      window.addEventListener(evt, resetInactivityTimer, { passive: true });
    });

    return () => {
      clearTimeout(inactivityTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      activityEvents.forEach((evt) => {
        window.removeEventListener(evt, resetInactivityTimer);
      });
    };
  }, [isAuthenticated, handleLogout]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-dark)' }}>
      {!isAuthenticated ? (
        <PasswordGate
          onLoginSuccess={handleLoginSuccess}
          onDatabaseWiped={handleDatabaseWiped}
          statusInfo={statusInfo}
        />
      ) : (
        <ChatRoom
          role={userRole}
          userPassword={userPassword}
          socket={socket}
          onLogout={handleLogout}
          onWiped={handleDatabaseWiped}
        />
      )}
    </div>
  );
}

