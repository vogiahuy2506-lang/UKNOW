import { useEffect, useRef } from 'react';
import chatbotApi from '../features/chatbot/services/chatbotApi.service';
import {
  AGENT_POLL_INTERVAL_MS,
  idGreater,
  isValidMessageId,
  nextAgentPollDelay,
} from '../utils/publicChatSession.util';

/**
 * Trang chat công khai (/chat/:id): hỏi tin NHÂN VIÊN TRẢ LỜI TAY của hội thoại này
 * (GET /chatbot-public/custom-chatbot/id/:chatbotId/messages?sessionId&afterId) — Hộp thư chỉ lưu tin vào hội thoại web,
 * không có kênh ngoài để đẩy tới khách, nên khách tự hỏi. Cùng nhịp với widget.js (8 giây; tab ẩn → dừng;
 * lỗi → giãn 16/32/60 giây; khử trùng theo id).
 *
 * @param {object} p
 * @param {string|number} p.chatbotId   tham số :chatbotId của trang (id số hoặc widget_key)
 * @param {string} p.sessionId
 * @param {boolean} p.enabled           chỉ bật khi chatbot đã tải và khách đã nhắn ít nhất một tin (chưa nhắn thì chưa có hội thoại)
 * @param {(messages: Array<{id: string, role: 'agent', content: string, attachments: Array, createdAt: string}>) => void} p.onMessages
 *        chỉ nhận tin MỚI (chưa hiện), theo thứ tự id
 */
export default function usePublicAgentMessages({ chatbotId, sessionId, enabled, onMessages }) {
  const onMessagesRef = useRef(onMessages);
  useEffect(() => {
    onMessagesRef.current = onMessages;
  }, [onMessages]);

  // Tiến độ (afterId + id đã báo) sống ngoài effect: bật/tắt `enabled` không làm hỏi lại từ đầu và báo trùng; đổi chatbot/phiên thì làm mới.
  const progressRef = useRef({ key: null, afterId: '0', seen: new Set() });

  useEffect(() => {
    if (!enabled || !chatbotId || !sessionId) return undefined;

    const progressKey = `${chatbotId}|${sessionId}`;
    if (progressRef.current.key !== progressKey) {
      progressRef.current = { key: progressKey, afterId: '0', seen: new Set() };
    }
    const progress = progressRef.current;

    let cancelled = false;
    let timer = null;
    let inFlight = false;
    let errorCount = 0;
    const controller = new AbortController();

    const stop = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
    const canPoll = () => !cancelled && !document.hidden;
    const schedule = (delayMs) => {
      stop();
      if (!canPoll()) return;
      timer = setTimeout(tick, delayMs);
    };

    async function tick() {
      timer = null;
      if (!canPoll() || inFlight) return;
      inFlight = true;
      let nextDelay = AGENT_POLL_INTERVAL_MS;
      try {
        // Truyền signal riêng: api.js khử trùng GET trùng URL/params bằng cách huỷ lượt cũ; signal do mình quản thì không bị huỷ ngầm.
        const res = await chatbotApi.getPublicAgentMessages(chatbotId, { sessionId, afterId: progress.afterId }, { signal: controller.signal });
        if (cancelled) return;
        const body = res?.data;
        if (!body || body.success !== true || !body.data || !Array.isArray(body.data.messages)) {
          throw new Error('Phản hồi hỏi tin mới sai hình dạng');
        }
        errorCount = 0;
        const fresh = [];
        for (const m of body.data.messages) {
          if (!m || !isValidMessageId(m.id)) continue;
          const id = String(m.id);
          if (idGreater(id, progress.afterId)) progress.afterId = id;
          if (progress.seen.has(id)) continue;
          progress.seen.add(id);
          const content = typeof m.content === 'string' ? m.content : '';
          const attachments = Array.isArray(m.attachments) ? m.attachments : [];
          if (!content && attachments.length === 0) continue;
          fresh.push({ id, role: 'agent', content, attachments, createdAt: m.createdAt });
        }
        if (fresh.length > 0) onMessagesRef.current?.(fresh);
        nextDelay = nextAgentPollDelay({ errorCount: 0, hasMore: body.data.hasMore === true });
      } catch {
        if (cancelled) return;
        errorCount += 1;
        nextDelay = nextAgentPollDelay({ errorCount });
      } finally {
        inFlight = false;
      }
      schedule(nextDelay);
    }

    const onVisibility = () => {
      if (document.hidden) stop();
      else if (!inFlight) schedule(0); // tab hiện lại: hỏi ngay một lượt rồi tiếp tục chu kỳ
    };
    document.addEventListener('visibilitychange', onVisibility);
    schedule(0);

    return () => {
      cancelled = true;
      stop();
      controller.abort();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [chatbotId, sessionId, enabled]);
}
