import { useCallback, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  generateLandingHtmlWithAi,
  editLandingHtmlWithAi,
} from '../../landing-pages/services/landingPagesAdminApi.service.js';

/**
 * Tạo INTENTS với translation function.
 * (Đặt trong function để có access tới i18n hook)
 */
function makeIntents(tc) {
  return [
    // ---- Title ----
    {
      key: 'rename-title',
      test: (p) => /(đổi\s*tên|đặt\s*tên|sửa\s*tên|rename\s*(?:thành|to)?|set\s*title)/i.test(p),
      extract: (p) => {
        const m =
          p.match(/(?:đổi\s*tên|đặt\s*tên|sửa\s*tên|rename\s*(?:thành|to)?|set\s*title)\s*[:-]?\s*[""']?(.+?)[""']?$/i) ||
          p.match(/thành\s*[""']?(.+?)[""']?$/i) ||
          p.match(/to\s*[""']?(.+?)[""']?$/i);
        return m ? m[1].trim() : null;
      },
      apply: ({ value, setForm }) => {
        setForm((prev) => ({ ...prev, title: value }));
        return tc('intentRenameTitle', { value });
      },
    },

    // ---- Slug ----
    {
      key: 'set-slug',
      test: (p) => /(đổi\s*slug|sửa\s*slug|set\s*slug|slug\s*(?:=|là|thành)|đặt\s*slug)/i.test(p),
      extract: (p) => {
        const m =
          p.match(/slug\s*(?:=|là|thành)\s*[""']?([a-z0-9-]+)[""']?/i) ||
          p.match(/đổi\s*slug\s*(?:thành)?\s*[""']?([a-z0-9-]+)[""']?/i);
        return m ? m[1].toLowerCase() : null;
      },
      apply: ({ value, setForm }) => {
        const cleaned = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
        setForm((prev) => ({ ...prev, slug: cleaned }));
        return tc('intentSetSlug', { value: cleaned });
      },
    },

    // ---- Publish ----
    {
      key: 'publish',
      test: (p) => /(xuất\s*bản|publish|đăng\s*lên|live|public)/i.test(p) && !/bỏ\s*(?:xuất\s*bản|publish)|unpublish/i.test(p),
      apply: ({ setForm }) => {
        setForm((prev) => ({ ...prev, isPublished: true }));
        return tc('intentPublish');
      },
    },
    {
      key: 'unpublish',
      test: (p) => /(bỏ\s*(?:xuất\s*bản|publish)|unpublish|private|ẩn\s*trang)/i.test(p),
      apply: ({ setForm }) => {
        setForm((prev) => ({ ...prev, isPublished: false }));
        return tc('intentUnpublish');
      },
    },

    // ---- Custom domain ----
    {
      key: 'set-custom-domain',
      test: (p) => /(dùng\s*tên\s*miền|set\s*domain|tên\s*miền\s*riêng|trỏ\s*domain|domain\s*=|custom\s*domain)/i.test(p),
      extract: (p) => {
        const m = p.match(/([a-z0-9-]+(?:\.[a-z0-9-]+)+)/i);
        return m ? m[1].toLowerCase() : null;
      },
      apply: ({ value, setForm, openTab }) => {
        const hostname = value;
        const isApex = hostname.split('.').length === 2;
        setForm((prev) => ({
          ...prev,
          domainType: 'custom',
          customDomainHostname: hostname,
          customDomainIsApex: isApex,
        }));
        openTab?.('domain');
        return tc('intentSetDomain', { value: hostname });
      },
    },

    // ---- Lead form: toggle a field ----
    {
      key: 'lead-form-toggle',
      test: (p) => /(bật|tắt|ẩn|hiện|thêm)\s*(trường|field)\s*(sđt|số\s*điện\s*thoại|phone|tên|name|email|địa\s*chỉ|address|công\s*ty|company|ghi\s*chú|note|message)/i.test(p),
      extract: (p) => {
        const action = /(bật|hiện|thêm)/i.test(p) ? 'enable' : 'disable';
        const fieldMatch = p.match(/(sđt|số\s*điện\s*thoại|phone|tên|name|email|địa\s*chỉ|address|công\s*ty|company|ghi\s*chú|note|message)/i);
        return { action, field: fieldMatch ? fieldMatch[1].toLowerCase() : null };
      },
      apply: ({ value, setForm, openTab }) => {
        const map = {
          'sđt': 'phone',
          'số điện thoại': 'phone',
          'phone': 'phone',
          'tên': 'name',
          'name': 'name',
          'email': 'email',
          'địa chỉ': 'address',
          'address': 'address',
          'công ty': 'company',
          'company': 'company',
          'ghi chú': 'note',
          'note': 'note',
          'message': 'note',
        };
        const key = map[value.field];
        if (!key) return null;
        setForm((prev) => {
          const cfg = { ...(prev.leadFormConfig || {}) };
          cfg.fields = { ...(cfg.fields || {}) };
          cfg.fields[key] = { ...(cfg.fields[key] || {}), enabled: value.action === 'enable' };
          return { ...prev, leadFormConfig: cfg };
        });
        openTab?.('lead-form');
        return tc(value.action === 'enable' ? 'intentEnableField' : 'intentDisableField', { field: value.field });
      },
    },

    // ---- Open settings tab ----
    {
      key: 'open-tab',
      test: (p) => /(mở\s*tab|open\s*tab|mở\s*cài\s*đặt|mở\s*settings|chuyển\s*tab)/i.test(p),
      extract: (p) => {
        if (/lead\s*form|form\s*liên\s*hệ|leadform/i.test(p)) return 'lead-form';
        if (/tên\s*miền|domain/i.test(p)) return 'domain';
        if (/thông\s*tin|info/i.test(p)) return 'info';
        return null;
      },
      apply: ({ value, openTab }) => {
        if (!value) return null;
        openTab?.(value);
        return tc('intentOpenTab', { value });
      },
    },
  ];
}

function detectIntent(prompt, { setForm, openTab, intents }) {
  const p = prompt.trim();
  for (const intent of intents) {
    if (intent.test(p)) {
      const value = intent.extract ? intent.extract(p) : null;
      const result = intent.apply({ value, setForm, openTab });
      if (result) {
        return { matched: true, key: intent.key, message: result };
      }
    }
  }
  return { matched: false };
}

export default function useCanvasConversation({ form, setForm, hasExistingHtml, openTab, tc }) {
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const idCounterRef = useRef(0);

  // Build intents with current language
  const intents = makeIntents(tc);

  const nextId = useCallback(() => {
    idCounterRef.current += 1;
    return `msg_${idCounterRef.current}_${Date.now()}`;
  }, []);

  const appendMessage = useCallback((msg) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const handleSend = useCallback(
    async ({ prompt }) => {
      if (!prompt?.trim()) return;
      const trimmedPrompt = prompt.trim();

      // 1) Thử bắt intent local trước
      const intentResult = detectIntent(trimmedPrompt, { setForm, openTab, intents });
      if (intentResult.matched) {
        appendMessage({
          id: nextId(),
          role: 'ai',
          content: intentResult.message,
          status: 'done',
          intent: intentResult.key,
          ts: Date.now(),
        });
        toast.success(intentResult.message);
        return;
      }

      // 2) Không match intent → gọi AI edit/generate HTML
      const userMsg = {
        id: nextId(),
        role: 'user',
        content: trimmedPrompt,
        status: 'sent',
        ts: Date.now(),
      };
      appendMessage(userMsg);

      const aiMsgId = nextId();
      const aiPlaceholder = {
        id: aiMsgId,
        role: 'ai',
        content: '',
        status: 'streaming',
        ts: Date.now(),
        suggestedHtml: null,
      };
      appendMessage(aiPlaceholder);
      setIsStreaming(true);

      try {
        let result;
        const currentHtml = String(form.htmlContent || '').trim();
        if (hasExistingHtml && currentHtml) {
          result = await editLandingHtmlWithAi({
            currentHtml,
            instruction: trimmedPrompt,
          });
        } else {
          result = await generateLandingHtmlWithAi({ prompt: trimmedPrompt });
        }

        const suggestedHtml =
          result?.html ||
          result?.data?.html ||
          result?.data?.data?.html ||
          (typeof result === 'string' ? result : '');

        const summary = result?.summary || result?.message || tc('aiGeneratedContent');

        // Auto-apply
        if (suggestedHtml) {
          const previousHtml = currentHtml;
          setForm((p) => ({ ...p, htmlContent: suggestedHtml }));
          toast.success(tc('aiAppliedDirect'));
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId
                ? {
                    ...m,
                    content: summary,
                    suggestedHtml,
                    previousHtml,
                    status: 'applied',
                  }
                : m
            )
          );
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId
                ? { ...m, content: summary, status: 'done' }
                : m
            )
          );
        }
      } catch (e) {
        const message =
          e?.response?.data?.message ||
          e?.message ||
          tc('aiConnectionError');
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? { ...m, content: message, status: 'error', suggestedHtml: null }
              : m
          )
        );
        toast.error(message);
      } finally {
        setIsStreaming(false);
      }
    },
    [appendMessage, form.htmlContent, hasExistingHtml, intents, nextId, openTab, setForm, tc]
  );

  /**
   * Hoàn tác 1 message đã auto-apply: khôi phục HTML về version trước đó.
   */
  const handleUndo = useCallback(
    (msgId) => {
      setMessages((prev) => {
        const msg = prev.find((m) => m.id === msgId);
        if (!msg?.previousHtml || !msg?.suggestedHtml) return prev;
        const restored = msg.previousHtml;
        setForm((p) => ({ ...p, htmlContent: restored }));
        toast.success(tc('aiUndoSuccess'));
        return prev.map((m) => (m.id === msgId ? { ...m, status: 'rejected' } : m));
      });
    },
    [setForm, tc]
  );

  // Backwards-compat no-op (UI không gọi nữa nhưng LandingCanvasLayout có thể đang dùng).
  const handleApply = useCallback(() => {}, []);
  const handleReject = useCallback(() => {}, []);

  return {
    messages,
    isStreaming,
    handleSend,
    handleApply,
    handleReject,
    handleUndo,
  };
}
