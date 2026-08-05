import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import {
  SSE_HEARTBEAT_TIMEOUT,
  SSE_MAX_FAILURES,
  nextSseBackoffMs,
} from './sseBackoff.util';

/**
 * @returns {{ status: 'connecting'|'connected'|'disconnected', retry: Function, reconnect: Function, disconnect: Function }}
 */
export const useInboxSSE = (onNewMessage, onUnreadCountChange) => {
  const { user } = useAuthStore();
  const eventSourceRef = useRef(null);
  const connectRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const heartbeatTimeoutRef = useRef(null);
  const tokenRef = useRef(null);
  const failureCountRef = useRef(0);
  const [status, setStatus] = useState('connecting');

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback((tokenAtFail) => {
    failureCountRef.current += 1;
    if (failureCountRef.current > SSE_MAX_FAILURES) {
      console.error('[SSE] Max reconnect attempts reached — stopped');
      setStatus('disconnected');
      return;
    }
    const delay = nextSseBackoffMs(failureCountRef.current);
    console.log(`[SSE] Reconnecting in ${delay}ms (attempt ${failureCountRef.current})...`);
    reconnectTimeoutRef.current = setTimeout(() => {
      if (tokenRef.current === tokenAtFail && connectRef.current) {
        connectRef.current();
      }
    }, delay);
  }, []);

  const resetHeartbeat = useCallback(() => {
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
    }
    heartbeatTimeoutRef.current = setTimeout(() => {
      console.log('[SSE] Heartbeat timeout - reconnecting via backoff');
      cleanup();
      scheduleReconnect(tokenRef.current);
    }, SSE_HEARTBEAT_TIMEOUT);
  }, [cleanup, scheduleReconnect]);

  const connect = useCallback(() => {
    if (!user?.id) return;

    const newToken = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
    if (!newToken) {
      cleanup();
      setStatus('disconnected');
      return;
    }

    const tokenChanged = tokenRef.current !== null && tokenRef.current !== newToken;

    if (eventSourceRef.current) {
      if (tokenChanged) {
        console.log('[SSE] Token changed, closing existing connection');
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      } else {
        return;
      }
    }

    tokenRef.current = newToken;
    setStatus('connecting');

    const url = `/api/ai/chatbot/inbox/stream?token=${encodeURIComponent(newToken)}`;

    try {
      const eventSource = new EventSource(url);

      eventSource.onopen = () => {
        console.log('[SSE] Connected to inbox stream');
        failureCountRef.current = 0;
        setStatus('connected');
        resetHeartbeat();
      };

      eventSource.onerror = (error) => {
        console.error('[SSE] Connection error:', error);
        cleanup();
        if (tokenRef.current === newToken) {
          scheduleReconnect(newToken);
        }
      };

      eventSource.addEventListener('inbox:new_message', (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[SSE] New message:', data);
          resetHeartbeat();
          if (onNewMessage) onNewMessage(data);
        } catch (e) {
          console.error('[SSE] Failed to parse message:', e);
        }
      });

      eventSource.addEventListener('inbox:unread_change', (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[SSE] Unread change:', data);
          resetHeartbeat();
          if (onUnreadCountChange) onUnreadCountChange(data);
        } catch (e) {
          console.error('[SSE] Failed to parse unread change:', e);
        }
      });

      eventSource.addEventListener('connected', () => {
        console.log('[SSE] Server confirmed connection');
        failureCountRef.current = 0;
        setStatus('connected');
        resetHeartbeat();
      });

      eventSourceRef.current = eventSource;
    } catch (error) {
      console.error('[SSE] Failed to create EventSource:', error);
      scheduleReconnect(newToken);
    }
  }, [cleanup, resetHeartbeat, scheduleReconnect, user?.id, onNewMessage, onUnreadCountChange]);

  connectRef.current = connect;

  const retry = useCallback(() => {
    failureCountRef.current = 0;
    cleanup();
    connect();
  }, [cleanup, connect]);

  useEffect(() => {
    if (user?.id) {
      const currentToken = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
      if (tokenRef.current !== null && tokenRef.current !== currentToken) {
        console.log('[SSE] User/token changed, reconnecting...');
        cleanup();
        tokenRef.current = currentToken;
        failureCountRef.current = 0;
        connect();
      }
    }
  }, [user?.id, connect, cleanup]);

  useEffect(() => {
    connect();

    return () => {
      cleanup();
    };
  }, [connect, cleanup]);

  return {
    status,
    retry,
    reconnect: connect,
    disconnect: cleanup,
  };
};

export default useInboxSSE;
