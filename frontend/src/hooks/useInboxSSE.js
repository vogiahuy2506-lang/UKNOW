import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import chatbotApi from '../services/chatbotApi';
import {
  SSE_HEARTBEAT_TIMEOUT,
  SSE_MAX_FAILURES,
  nextSseBackoffMs,
} from './sseBackoff.util';

/** Khoá nhận diện kết nối: đổi token hoặc ngữ cảnh làm việc thì phải nối lại. KHÔNG đưa vào URL. */
export const buildInboxSseConnectionKey = (token, activeContext) => {
  const ownerContext = activeContext?.type === 'employee' ? activeContext.ownerId : null;
  return `${token}:${ownerContext || 'self'}`;
};

/**
 * URL luồng SSE từ một vé ngắn hạn dùng một lần (H-04). JWT không còn nằm trên URL: ngữ cảnh nhân viên
 * (X-Owner-Context) được gửi lúc xin vé và server ghi vào vé, nên URL chỉ mang `ticket`.
 */
export const buildInboxSseUrl = (ticket) => {
  const params = new URLSearchParams({ ticket });
  return `/api/ai/chatbot/inbox/stream?${params.toString()}`;
};

/**
 * @returns {{ status: 'connecting'|'connected'|'disconnected', retry: Function, reconnect: Function, disconnect: Function }}
 */
export const useInboxSSE = (onNewMessage, onUnreadCountChange) => {
  const { user, activeContext } = useAuthStore();
  const contextType = activeContext?.type;
  const contextOwnerId = activeContext?.ownerId;
  const eventSourceRef = useRef(null);
  const connectRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const heartbeatTimeoutRef = useRef(null);
  const tokenRef = useRef(null);
  const connectionKeyRef = useRef(null);
  const failureCountRef = useRef(0);
  // Mỗi lần nối/cleanup tăng số này: yêu cầu xin vé đang bay mà số đã đổi thì bỏ, không mở EventSource cũ.
  const connectSeqRef = useRef(0);
  const pendingConnectKeyRef = useRef(null);
  const [status, setStatus] = useState('connecting');

  const cleanup = useCallback(() => {
    connectSeqRef.current += 1;
    pendingConnectKeyRef.current = null;
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

  const scheduleReconnect = useCallback((connectionKeyAtFail) => {
    failureCountRef.current += 1;
    if (failureCountRef.current > SSE_MAX_FAILURES) {
      console.error('[SSE] Max reconnect attempts reached — stopped');
      setStatus('disconnected');
      return;
    }
    const delay = nextSseBackoffMs(failureCountRef.current);
    console.log(`[SSE] Reconnecting in ${delay}ms (attempt ${failureCountRef.current})...`);
    reconnectTimeoutRef.current = setTimeout(() => {
      if (connectionKeyRef.current === connectionKeyAtFail && connectRef.current) {
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
      scheduleReconnect(connectionKeyRef.current);
    }, SSE_HEARTBEAT_TIMEOUT);
  }, [cleanup, scheduleReconnect]);

  const connect = useCallback(async () => {
    if (!user?.id) return;

    const newToken = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
    if (!newToken) {
      cleanup();
      setStatus('disconnected');
      return;
    }

    const connectionKey = buildInboxSseConnectionKey(newToken, {
      type: contextType,
      ownerId: contextOwnerId,
    });
    const connectionChanged = connectionKeyRef.current !== null
      && connectionKeyRef.current !== connectionKey;

    if (eventSourceRef.current) {
      if (connectionChanged) {
        console.log('[SSE] Authentication context changed, closing existing connection');
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      } else {
        return;
      }
    }
    // Đang xin vé cho đúng kết nối này rồi → đừng xin thêm vé thứ hai.
    if (pendingConnectKeyRef.current === connectionKey) return;

    tokenRef.current = newToken;
    connectionKeyRef.current = connectionKey;
    pendingConnectKeyRef.current = connectionKey;
    connectSeqRef.current += 1;
    const seq = connectSeqRef.current;
    setStatus('connecting');

    let ticket;
    try {
      const res = await chatbotApi.createInboxStreamTicket();
      ticket = res?.data?.ticket;
      if (!ticket) throw new Error('Missing SSE ticket');
    } catch (error) {
      if (seq !== connectSeqRef.current) return;
      pendingConnectKeyRef.current = null;
      console.error('[SSE] Failed to get stream ticket:', error);
      scheduleReconnect(connectionKey);
      return;
    }
    // Trong lúc chờ vé, cleanup / đổi ngữ cảnh / nối lại đã xảy ra → vé này bỏ (hết hạn sau 60 giây).
    if (seq !== connectSeqRef.current || connectionKeyRef.current !== connectionKey) return;
    pendingConnectKeyRef.current = null;

    try {
      const eventSource = new EventSource(buildInboxSseUrl(ticket));

      eventSource.onopen = () => {
        console.log('[SSE] Connected to inbox stream');
        failureCountRef.current = 0;
        setStatus('connected');
        resetHeartbeat();
      };

      eventSource.onerror = (error) => {
        console.error('[SSE] Connection error:', error);
        cleanup();
        if (connectionKeyRef.current === connectionKey) {
          scheduleReconnect(connectionKey);
        }
      };

      eventSource.addEventListener('inbox:new_message', (event) => {
        try {
          const data = JSON.parse(event.data);
          resetHeartbeat();
          if (onNewMessage) onNewMessage(data);
        } catch (e) {
          console.error('[SSE] Failed to parse message:', e);
        }
      });

      eventSource.addEventListener('inbox:unread_change', (event) => {
        try {
          const data = JSON.parse(event.data);
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
      scheduleReconnect(connectionKey);
    }
  }, [cleanup, resetHeartbeat, scheduleReconnect, user?.id, contextType, contextOwnerId, onNewMessage, onUnreadCountChange]);

  connectRef.current = connect;

  const retry = useCallback(() => {
    failureCountRef.current = 0;
    cleanup();
    connect();
  }, [cleanup, connect]);

  useEffect(() => {
    if (user?.id) {
      const currentToken = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
      const currentConnectionKey = buildInboxSseConnectionKey(currentToken, {
        type: contextType,
        ownerId: contextOwnerId,
      });
      if (connectionKeyRef.current !== null && connectionKeyRef.current !== currentConnectionKey) {
        console.log('[SSE] User/token/context changed, reconnecting...');
        cleanup();
        tokenRef.current = currentToken;
        connectionKeyRef.current = currentConnectionKey;
        failureCountRef.current = 0;
        connect();
      }
    }
  }, [user?.id, contextType, contextOwnerId, connect, cleanup]);

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
