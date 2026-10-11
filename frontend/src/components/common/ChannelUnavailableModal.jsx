import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { HiOutlineLockClosed } from 'react-icons/hi';
import { useI18n } from '../../i18n';
import { useAuthStore } from '../../stores/authStore';
import { CHANNEL_UNAVAILABLE_REASONS } from '../../hooks/queries/useChannelAvailability';

const CHANNEL_NAMES = Object.freeze({
  email: 'Email',
  zalo: 'Zalo',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
});

const TOPUP_PATH = '/app/topup';
const BILLING_PATH = '/app/billing';

const formatCount = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('vi-VN') : String(value ?? '');
};

/**
 * PLAN_KENH_KHONG_AN_KHOA_VA_GOI_Y_MUA_2026-10-11 — bấm vào thẻ/bước/loại chiến dịch của kênh đang bị khoá thì hiện
 * modal này: nói RÕ vì sao khoá và đưa nút mua đúng thứ còn thiếu.
 *
 * `info` là một phần tử của useChannelAvailability (`{ reason, detail, used, limit }`):
 *  - plan_expired                       -> "Gia hạn gói"
 *  - not_in_plan, detail 'accounts'     -> "Mua thêm slot tài khoản {kênh}" (+ Nâng gói)
 *  - not_in_plan, detail 'messages'     -> chỉ "Nâng gói": hạn mức TIN của gói bằng 0 thì mua thêm slot tài khoản không mở được kênh
 *  - quota_exhausted, detail 'channel'  -> "Mua thêm lượt" (+ Nâng gói)
 *  - quota_exhausted, detail 'combined' -> chỉ "Nâng gói": trần tổng của gói không có ví bù (checkSendQuota)
 *
 * Nhân viên (ngữ cảnh chủ) không vào được /app/topup và /app/billing (OwnerRoute) nên không có nút điều hướng, chỉ có
 * lời nhắn liên hệ chủ tài khoản.
 *
 * @param {{ channel: 'email'|'zalo'|'telegram'|'whatsapp', info?: object, onClose: () => void }} props
 */
export default function ChannelUnavailableModal({ channel, info, onClose }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const isEmployee = useAuthStore((state) => state.activeContext?.type) === 'employee';
  const dialogRef = useRef(null);
  // Giữ onClose mới nhất trong ref: nơi gọi hay truyền mũi tên inline, đừng để mỗi lần vẽ lại lại gắn/gỡ phím Esc và giành focus.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = setTimeout(() => dialogRef.current?.focus(), 50);
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onCloseRef.current?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  if (!channel) return null;

  const name = CHANNEL_NAMES[channel] || channel;
  const reason = info?.reason || null;
  const detail = info?.detail || null;

  let title;
  let hint;
  /** @type {Array<{ key: string, label: string, to: string, primary: boolean }>} */
  const actions = [];

  if (reason === CHANNEL_UNAVAILABLE_REASONS.PLAN_EXPIRED) {
    title = t('channelUnavailable.expiredTitle');
    hint = t('channelUnavailable.expiredHint', { channel: name });
    actions.push({ key: 'renew', label: t('channelUnavailable.renew'), to: BILLING_PATH, primary: true });
  } else if (reason === CHANNEL_UNAVAILABLE_REASONS.QUOTA_EXHAUSTED) {
    const counts = { channel: name, used: formatCount(info?.used), limit: formatCount(info?.limit) };
    title = t('channelUnavailable.quotaTitle', counts);
    if (detail === 'combined') {
      hint = t('channelUnavailable.quotaCombinedHint', counts);
      actions.push({ key: 'upgrade', label: t('channelNotInPlan.upgrade'), to: BILLING_PATH, primary: true });
    } else {
      hint = t('channelUnavailable.quotaHint', counts);
      actions.push({ key: 'buyQuota', label: t('channelUnavailable.buyQuota'), to: TOPUP_PATH, primary: true });
      actions.push({ key: 'upgrade', label: t('channelNotInPlan.upgrade'), to: BILLING_PATH, primary: false });
    }
  } else {
    // not_in_plan (và mặc định an toàn nếu ai đó mở modal khi kênh thực ra dùng được: vẫn nói được "gói chưa có kênh").
    title = t('channelNotInPlan.title', { channel: name });
    if (detail === 'messages') {
      hint = t('channelUnavailable.noMessagesHint', { channel: name });
      actions.push({ key: 'upgrade', label: t('channelNotInPlan.upgrade'), to: BILLING_PATH, primary: true });
    } else {
      hint = t('channelNotInPlan.hint', { channel: name });
      actions.push({ key: 'buySlot', label: t('channelUnavailable.buySlot', { channel: name }), to: TOPUP_PATH, primary: true });
      actions.push({ key: 'upgrade', label: t('channelNotInPlan.upgrade'), to: BILLING_PATH, primary: false });
    }
  }

  const go = (to) => {
    onClose?.();
    navigate(to);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="channel-unavailable-title"
      data-testid="channel-unavailable-modal"
      data-channel={channel}
      data-reason={reason || ''}
    >
      <div className="fixed inset-0" onClick={() => onClose?.()} aria-hidden="true" data-testid="channel-unavailable-backdrop" />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl outline-none animate-in fade-in zoom-in-95 duration-150 dark:border-dk-border/90 dark:bg-dk-surface"
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-100 bg-amber-50 text-amber-600 shadow-xs dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
              <HiOutlineLockClosed className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <h3 id="channel-unavailable-title" className="text-base font-bold leading-snug text-slate-900 dark:text-dk-text sm:text-lg">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-dk-text2">{hint}</p>
              {isEmployee && (
                <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600 dark:bg-dk-raised dark:text-dk-text2" data-testid="channel-unavailable-owner-only">
                  {t('channelUnavailable.ownerOnlyHint')}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-slate-100 bg-slate-50/80 px-6 py-4 dark:border-dk-border dark:bg-dk-raised/80">
          <button
            type="button"
            onClick={() => onClose?.()}
            className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:text-dk-text2 dark:hover:bg-dk-strong"
          >
            {t('common.close')}
          </button>
          {!isEmployee && actions.map((action) => (
            <button
              key={action.key}
              type="button"
              data-testid={`channel-unavailable-action-${action.key}`}
              onClick={() => go(action.to)}
              className={action.primary
                ? 'rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-primary-600/20 transition-colors hover:bg-primary-700'
                : 'rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-dk-border dark:bg-dk-surface dark:text-dk-text dark:hover:bg-dk-raised'}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
