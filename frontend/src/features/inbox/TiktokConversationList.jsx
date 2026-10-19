/**
 * TiktokConversationList.jsx
 *
 * Component tổng hợp cho TikTok Business ở Hộp thư. Nhóm conversations theo
 * `business_id` (TikTok account), hiển thị:
 *   1. Sidebar trái: danh sách tiktok_business_accounts (TiktokChannelCard)
 *   2. Panel phải: danh sách conversation thuộc account đang chọn, với toggle
 *      AI (dùng endpoint `setConversationAiPaused` đã có từ inbox service).
 *
 * Pattern copy từ `TelegramInbox.jsx`/`FacebookInbox.jsx` (group + list).
 *
 * Tại sao tách file thay vì sửa trực tiếp `ConversationList.jsx`:
 * - 3 group theo channel (Bẫy plan §4) → mỗi channel có data shape hơi khác.
 * - TikTok có thêm `rateLimited` indicator mà các kênh khác không có.
 * - Dễ test (mock data feed riêng), dễ bảo trì.
 *
 * Việc 8.1 + 8.3 của plan tiktok-business-messaging-integration.md.
 *
 * Revision history:
 * - PR-5: rewrite để fix các issue từ code review:
 *   - H1/M5: pre-compute unreadByAccount (Map<id, count>) — O(1) lookup thay vì filter O(n) trong map
 *   - H2: tách initial fetch (deps=[]) khỏi selectedAccountId
 *   - H3: dùng key tiktokInbox.error thay vì inbox.error chưa tồn tại
 *   - M2: import formatTime từ utils/formatTime.js (DRY)
 *   - M3: import chatbotApi top-level thay vì await import()
 *   - M4: useMemo cho selectedAccount
 *   - Bonus: React.memo cho TiktokChannelCard (re-render sidebar khi đổi conv)
 */

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';
import TiktokChannelCard from './TiktokChannelCard';
import chatbotApi from '../chatbot/services/chatbotApi.service';
import tiktokBusinessApiService from '../settings/services/tiktokBusinessApi.service';
import { getExternalChannelName } from './utils/channelInfo';
import { getConversationPreview } from './utils/conversationPreview';
import { formatTime } from './utils/formatTime';

// React.memo bọc card — sidebar không bị re-render khi conversation list thay đổi.
const TiktokChannelCardMemo = memo(TiktokChannelCard);

/**
 * Compact view của 1 conversation trong list bên phải.
 * Copy pattern từ ConversationList.jsx (rút gọn) — chỉ render text + thời gian.
 */
function ConversationRow({ conv, selected, onSelect, t, locale }) {
  const preview = getConversationPreview({
    content: conv.lastMessage,
    rawType: conv.lastMessageRawType,
    attachmentType: conv.lastMessageAttachmentType,
    messageType: conv.lastMessageType,
  });
  const visitorName = conv.visitorName || conv.user_openid || t('inbox.customer');
  const time = formatTime(conv.lastMessageAt || conv.updatedAt, t, locale);
  return (
    <button
      type="button"
      onClick={() => onSelect?.(conv)}
      className={`w-full text-left px-3 py-2.5 rounded-lg flex items-start gap-2.5 transition-colors ${
        selected ? 'bg-pink-50 border border-pink-200' : 'hover:bg-gray-50 border border-transparent'
      }`}
      data-testid={`tiktok-conv-row-${conv.id}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-900 truncate">{visitorName}</p>
          <span className="text-[10px] text-gray-400 shrink-0 ml-auto">{time}</span>
        </div>
        <p className="text-xs text-gray-500 truncate mt-0.5">{preview || '—'}</p>
      </div>
    </button>
  );
}

/**
 * @param {object} props
 * @param {Array<object>} [props.accounts] - override data (test only) — nếu không truyền,
 *   component tự gọi tiktokBusinessApiService.listAccounts().
 * @param {Array<object>} [props.conversations] - override data (test only).
 * @param {function} [props.onSelectConversation] - callback khi click 1 conv.
 */
export default function TiktokConversationList({
  accounts: accountsOverride,
  conversations: conversationsOverride,
  onSelectConversation,
}) {
  const { t, locale } = useI18n();
  const [accounts, setAccounts] = useState(accountsOverride || []);
  const [conversations, setConversations] = useState(conversationsOverride || []);
  const [selectedAccountId, setSelectedAccountId] = useState(
    accountsOverride && accountsOverride.length > 0 ? accountsOverride[0].id : null
  );
  const [selectedConvId, setSelectedConvId] = useState(null);
  const [loading, setLoading] = useState(!accountsOverride);
  const [error, setError] = useState(null);

  // H2: initial fetch chỉ chạy 1 lần khi mount và khi override thay đổi.
  // KHÔNG phụ thuộc `selectedAccountId` — đổi account không trigger refetch.
  useEffect(() => {
    if (accountsOverride) {
      // Test path: skip fetch
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await tiktokBusinessApiService.listAccounts();
        if (cancelled) return;
        const list = res?.data?.data || [];
        setAccounts(list);
        if (list.length > 0 && !selectedAccountId) {
          setSelectedAccountId(list[0].id);
        }
      } catch (err) {
        if (cancelled) return;
        console.warn('[TiktokInbox] listAccounts error:', err.message);
        setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountsOverride]);

  // H1/M5: pre-compute unread count theo accountId — O(1) lookup trong map.
  // Trước đây: `visibleConvs.filter(...).length` chạy trong `accounts.map()` mỗi render.
  const unreadByAccount = useMemo(() => {
    const map = new Map();
    for (const c of conversations) {
      if (c.channel === 'tiktok_business' && c.unread && c.external_channel_id != null) {
        map.set(c.external_channel_id, (map.get(c.external_channel_id) || 0) + 1);
      }
    }
    return map;
  }, [conversations]);

  // Filter conversations theo account đang chọn
  const visibleConvs = useMemo(
    () => conversations.filter(
      (c) => c.channel === 'tiktok_business' && c.external_channel_id === selectedAccountId
    ),
    [conversations, selectedAccountId]
  );

  // M4: memoize selected account để tránh `accounts.find()` mỗi render.
  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === selectedAccountId) || null,
    [accounts, selectedAccountId]
  );

  const selectedConv = useMemo(
    () => visibleConvs.find((c) => c.id === selectedConvId) || null,
    [visibleConvs, selectedConvId]
  );

  // Toggle AI handler — tách ra useCallback để ổn định tham chiếu.
  const handleToggleAi = useCallback(async () => {
    if (!selectedConv) return;
    const newPaused = !selectedConv.aiPaused;
    try {
      await chatbotApi.setConversationAiPaused(selectedConv.id, 'tiktok_business', newPaused);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedConv.id
            ? {
                ...c,
                aiPaused: newPaused,
                aiPausedAt: newPaused ? new Date().toISOString() : null,
              }
            : c
        )
      );
    } catch (err) {
      console.warn('[TiktokInbox] toggle AI fail:', err.message);
      toast.error(t('tiktokInbox.toggleAiFailed', 'Không thể đổi trạng thái AI. Vui lòng thử lại.'));
    }
  }, [selectedConv, t]);

  if (loading) {
    return (
      <div className="p-4 text-sm text-gray-500" data-testid="tiktok-inbox-loading">
        {t('common.loading', 'Đang tải...')}
      </div>
    );
  }

  if (error && accounts.length === 0) {
    return (
      <div className="p-4 text-sm text-red-600" data-testid="tiktok-inbox-error">
        {t('tiktokInbox.error', 'Có lỗi khi tải tài khoản TikTok')}: {error}
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div
        className="p-6 text-sm text-gray-600 text-center"
        data-testid="tiktok-inbox-empty"
      >
        <p className="font-medium mb-1">{t('tiktokInbox.empty.title', 'Chưa có tài khoản TikTok')}</p>
        <p className="text-xs text-gray-500">
          {t('tiktokInbox.empty.hint',
            'Kết nối TikTok Business ở Settings → Channels → TikTok trước khi dùng Hộp thư.')}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full" data-testid="tiktok-inbox-root">
      {/* Sidebar: list tiktok_business_accounts */}
      <div className="w-64 shrink-0 border-r border-gray-200 p-2 space-y-1.5 overflow-y-auto">
        <p className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {t('tiktokInbox.section', 'Tài khoản TikTok')}
        </p>
        {accounts.map((acc) => (
          <TiktokChannelCardMemo
            key={acc.id}
            account={{
              ...acc,
              unread: unreadByAccount.get(acc.id) || 0,
            }}
            selected={selectedAccountId === acc.id}
            onSelect={(a) => {
              setSelectedAccountId(a.id);
              setSelectedConvId(null);
            }}
          />
        ))}
      </div>

      {/* Panel phải: conversations thuộc account đang chọn */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Header */}
        <div className="px-4 py-2.5 border-b border-gray-200 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-gray-900 truncate">
              {selectedAccount?.display_name || selectedAccount?.business_id || t('common.none', 'Không có')}
            </h3>
            <p className="text-xs text-gray-500">
              {getExternalChannelName('tiktok_business')} ·{' '}
              {visibleConvs.length} {t('tiktokInbox.conversations', 'hội thoại')}
            </p>
          </div>
          {selectedConv ? (
            <button
              type="button"
              onClick={handleToggleAi}
              className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              data-testid="tiktok-inbox-toggle-ai"
            >
              {selectedConv.aiPaused
                ? t('tiktokInbox.aiResume', 'Bật AI')
                : t('tiktokInbox.aiPause', 'Tạm dừng AI')}
            </button>
          ) : null}
        </div>

        {/* List conversations */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {visibleConvs.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-gray-500" data-testid="tiktok-inbox-conv-empty">
              {t('tiktokInbox.noConversations', 'Chưa có hội thoại nào.')}
            </div>
          ) : (
            visibleConvs.map((conv) => (
              <ConversationRow
                key={conv.id}
                conv={conv}
                selected={selectedConvId === conv.id}
                onSelect={(c) => {
                  setSelectedConvId(c.id);
                  onSelectConversation?.(c);
                }}
                t={t}
                locale={locale}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
