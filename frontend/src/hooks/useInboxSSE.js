import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';

const SSE_RECONNECT_DELAY = 3000;
const SSE_HEARTBEAT_TIMEOUT = 60000;

export const useInboxSSE = (onNewMessage, onUnreadCountChange) => {
  const { user } = useAuthStore();
  const eventSourceRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const heartbeatTimeoutRef = useRef(null);

  const connect = useCallback(() => {
    if (!user?.id || eventSourceRef.current) return;

    const token = localStorage.getItem('token');
    if (!token) return;

    // EventSource doesn't support custom headers, use query param with token
    const url = `/api/ai/chatbot/inbox/stream?token=${encodeURIComponent(token)}`;

    try {
      const eventSource = new EventSource(url);

      eventSource.onopen = () => {
        console.log('[SSE] Connected to inbox stream');
        resetHeartbeat();
      };

      eventSource.onerror = (error) => {
        console.error('[SSE] Connection error:', error);
        cleanup();
        // Reconnect after delay
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('[SSE] Reconnecting...');
          connect();
        }, SSE_RECONNECT_DELAY);
      };

      // Listen for new messages
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

      // Listen for unread count changes
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

      // Listen for connected event
      eventSource.addEventListener('connected', (event) => {
        console.log('[SSE] Server confirmed connection');
        resetHeartbeat();
      });

      eventSourceRef.current = eventSource;
    } catch (error) {
      console.error('[SSE] Failed to create EventSource:', error);
    }
  }, [user?.id, onNewMessage, onUnreadCountChange]);

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

  const resetHeartbeat = useCallback(() => {
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
    }
    heartbeatTimeoutRef.current = setTimeout(() => {
      console.log('[SSE] Heartbeat timeout - reconnecting');
      cleanup();
      connect();
    }, SSE_HEARTBEAT_TIMEOUT);
  }, [cleanup, connect]);

  useEffect(() => {
    connect();

    return () => {
      cleanup();
    };
  }, [connect, cleanup]);

  return {
    reconnect: connect,
    disconnect: cleanup,
  };
};

export default useInboxSSE;
