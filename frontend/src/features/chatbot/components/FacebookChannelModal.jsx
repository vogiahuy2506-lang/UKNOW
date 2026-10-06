/**
 * Hộp thoại "Facebook Messenger" trong Chatbot Studio → tab Triển khai.
 *
 * Bối cảnh: Facebook bị gỡ khỏi Studio ngày 21/09/2026 (S-04) vì nút OAuth luôn báo "Facebook App chưa được
 * cấu hình" — app chưa có FACEBOOK_APP_ID/SECRET. Nay Meta App đã được cấu hình, nên khôi phục lại ô kênh.
 *
 * Luồng (2 bước, khớp 100% với backend):
 *  1. Fanpage phải được ủy quyền TRƯỚC ở Cài đặt → Kênh → Facebook (lưu vào `channel_connections` theo user).
 *     Ở đây chỉ GÁN page đã có token cho chatbot này.
 *  2. POST /ai/chatbot/custom-chatbots/:id/channels/facebook với `{ channel_connection_id }`; backend tự sinh
 *     `webhook_token` + `webhook_url`, rồi subscribe page vào app.
 *  3. Người dùng copy `webhook_url` + `verify_token` trả về để dán vào Meta App Dashboard.
 *
 * Vì webhook URL chứa token sinh ngẫu nhiên MỖI LẦN bấm Lưu, nên nếu người dùng sửa (đổi page) thì token cũ
 * trong Meta Dashboard không còn khớp → sẽ phải dán lại. Báo rõ điều này trong UI.
 */
import { useCallback, useEffect, useState } from 'react';
import { HiOutlineX, HiOutlineRefresh, HiOutlineCheckCircle, HiOutlineClipboardCopy } from 'react-icons/hi';
import toast from 'react-hot-toast';
import chatbotApi from '../services/chatbotApi.service';
import { useI18n } from '../../../i18n';

export default function FacebookChannelModal({ open, onClose, chatbotId }) {
  const { t } = useI18n();
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(null);

  const loadPages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await chatbotApi.getFacebookPagesForChatbot(chatbotId);
      const list = res?.data?.data;
      setPages(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error('[FacebookChannelModal] loadPages failed:', err);
      toast.error(t('chatbot.studio.fbLoadPagesFailed'));
      setPages([]);
    } finally {
      setLoading(false);
    }
  }, [chatbotId, t]);

  useEffect(() => {
    if (open) loadPages();
  }, [open, loadPages]);

  if (!open) return null;

  const handleAttach = async (page) => {
    setSaving(true);
    try {
      const res = await chatbotApi.connectChatbotFacebook(chatbotId, {
        channel_connection_id: page.id,
      });
      setResult(res?.data || null);
      toast.success(t('chatbot.studio.fbAttachSuccess'));
      loadPages();
    } catch (err) {
      console.error('[FacebookChannelModal] attach failed:', err);
      toast.error(err?.response?.data?.message || t('chatbot.studio.fbAttachFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async (field, value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      toast.error(t('chatbot.studio.copyFailed'));
      return;
    }
    setCopied(field);
    toast.success(t('chatbot.studio.fbCopied'));
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="px-5 py-4 flex items-center gap-3 border-b border-slate-100">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-base shrink-0 bg-blue-50 text-blue-600">
            f
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 truncate">
              {t('chatbot.studio.fbModalTitle')}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {t('chatbot.studio.fbModalSubtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={loadPages}
            className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0"
            title={t('chatbot.studio.fbReloadTitle')}
          >
            <HiOutlineRefresh className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0"
          >
            <HiOutlineX className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {result?.webhook_url && (
            <div className="bg-emerald-50/60 border border-emerald-100 rounded-lg p-3 space-y-3">
              <p className="text-xs font-medium text-emerald-900">
                {t('chatbot.studio.fbWebhookReadyTitle')}
              </p>

              <div className="space-y-2">
                <div className="bg-white border border-emerald-100 rounded-lg px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 mb-1">
                    {t('chatbot.studio.fbCallbackUrlLabel')}
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="flex-1 min-w-0 text-[11px] font-mono text-slate-700 break-all">
                      {result.webhook_url}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleCopy('url', result.webhook_url)}
                      className="shrink-0 p-1.5 rounded-md text-emerald-700 hover:bg-emerald-100 transition-colors"
                      title={t('chatbot.studio.fbCopyTitle')}
                    >
                      {copied === 'url'
                        ? <HiOutlineCheckCircle className="w-3.5 h-3.5" />
                        : <HiOutlineClipboardCopy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="bg-white border border-emerald-100 rounded-lg px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 mb-1">
                    {t('chatbot.studio.fbVerifyTokenLabel')}
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="flex-1 min-w-0 text-[11px] font-mono text-slate-700 break-all">
                      {result.verify_token}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleCopy('token', result.verify_token)}
                      className="shrink-0 p-1.5 rounded-md text-emerald-700 hover:bg-emerald-100 transition-colors"
                      title={t('chatbot.studio.fbCopyTitle')}
                    >
                      {copied === 'token'
                        ? <HiOutlineCheckCircle className="w-3.5 h-3.5" />
                        : <HiOutlineClipboardCopy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-emerald-800/90 leading-relaxed">
                {t('chatbot.studio.fbMetaSteps')}
              </p>
            </div>
          )}

          <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-3">
            <p className="text-xs text-slate-600">{t('chatbot.studio.fbIntro')}</p>
          </div>

          {/* Page list */}
          <div className="space-y-1">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-slate-400 text-xs">
                <HiOutlineRefresh className="w-4 h-4 animate-spin mr-2" />
                {t('chatbot.studio.fbLoadingPages')}
              </div>
            ) : pages.length === 0 ? (
              <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <p className="text-sm font-medium text-slate-700">
                  {t('chatbot.studio.fbNoPagesTitle')}
                </p>
                <p className="text-xs text-slate-400 mt-1 px-6">
                  {t('chatbot.studio.channelsGoTo')}{' '}
                  <a
                    href="/app/settings/channels"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary-600 hover:text-primary-700 font-medium underline underline-offset-2"
                  >
                    {t('chatbot.studio.fbSettingsLinkLabel')}
                  </a>{' '}
                  {t('chatbot.studio.channelsAddAccountThenReturn')}
                </p>
              </div>
            ) : (
              pages.map((page) => {
                const active = page.is_active_on_this_chatbot;
                const hasCreds = page.has_credentials !== false;
                return (
                  <div
                    key={page.id}
                    className="flex items-center gap-3 px-3 py-2.5 bg-white border border-slate-200 rounded-lg hover:border-slate-300 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 font-bold">
                      f
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {page.fb_page_name || page.display_name || t('chatbot.studio.fbPageFallbackName')}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate font-mono">
                        {page.fb_page_id || page.external_channel_id}
                      </p>
                    </div>
                    {active ? (
                      <span className="shrink-0 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded">
                        {t('chatbot.studio.fbActiveBadge')}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleAttach(page)}
                        disabled={saving || !hasCreds}
                        className="shrink-0 px-3 py-1.5 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {!hasCreds
                          ? t('chatbot.studio.fbNeedTokenBadge')
                          : saving
                            ? t('chatbot.studio.fbAttachingBadge')
                            : t('chatbot.studio.fbAttachBadge')}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {pages.length > 0 && (
            <p className="text-[11px] text-amber-700 bg-amber-50/70 border border-amber-100 rounded-lg px-3 py-2 leading-relaxed">
              {t('chatbot.studio.fbRotateTokenWarning')}
            </p>
          )}
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
