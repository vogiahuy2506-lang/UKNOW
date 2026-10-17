import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { HiOutlineChat, HiOutlineChevronRight, HiOutlineLockClosed, HiOutlineMail } from 'react-icons/hi';
import { FaTelegramPlane, FaWhatsapp } from 'react-icons/fa';
import { useI18n } from '../../i18n';
import { useAuthStore } from '../../stores/authStore';
import { CHANNEL_UNAVAILABLE_REASONS } from '../../hooks/queries/useChannelAvailability';

const CHANNEL_NAMES = Object.freeze({
  email: 'Email',
  zalo: 'Zalo',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
});

// Biểu tượng + màu theo kênh: cùng bộ với thẻ kênh ở Gửi nhanh / Tạo chiến dịch.
const CHANNEL_VISUALS = Object.freeze({
  email: { Icon: HiOutlineMail, tint: 'border-blue-100 bg-blue-50 text-blue-600 dark:border-dk-border dark:bg-dk-raised dark:text-blue-400' },
  zalo: { Icon: HiOutlineChat, tint: 'border-sky-100 bg-sky-50 text-sky-600 dark:border-dk-border dark:bg-dk-raised dark:text-sky-400' },
  telegram: { Icon: FaTelegramPlane, tint: 'border-sky-100 bg-sky-50 text-sky-500 dark:border-dk-border dark:bg-dk-raised dark:text-sky-400' },
  whatsapp: { Icon: FaWhatsapp, tint: 'border-emerald-100 bg-emerald-50 text-emerald-600 dark:border-dk-border dark:bg-dk-raised dark:text-emerald-400' },
});

const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

const TOPUP_PATH = '/app/topup';
const BILLING_PATH = '/app/billing';

const formatCount = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('vi-VN') : String(value ?? '');
};

/**
 * PLAN_KENH_KHONG_AN_KHOA_VA_GOI_Y_MUA_2026-10-11 — bấm vào thẻ/bước/loại chiến dịch của kênh đang bị khoá thì hiện
 * modal này: nói RÕ vì sao khoá và đưa lựa chọn mua đúng thứ còn thiếu.
 *
 * `info` là một phần tử của useChannelAvailability (`{ reason, detail, used, limit }`):
 *  - plan_expired                       -> "Gia hạn gói"
 *  - not_in_plan, detail 'accounts'     -> "Mua thêm tài khoản {kênh}" (khuyên dùng) + "Nâng gói"
 *  - not_in_plan, detail 'messages'     -> chỉ "Nâng gói": hạn mức TIN của gói bằng 0 thì mua thêm slot tài khoản không mở được kênh
 *  - quota_exhausted, detail 'channel'  -> "Mua thêm lượt gửi" (khuyên dùng) + "Nâng gói"
 *  - quota_exhausted, detail 'combined' -> chỉ "Nâng gói": trần tổng của gói không có ví bù (checkSendQuota)
 *
 * Bố cục: đầu hộp (biểu tượng kênh + ổ khoá, tiêu đề ngắn, một câu giải thích) -> thẻ chọn xếp dọc rộng đều (mỗi thẻ có
 * tiêu đề + mô tả một dòng + mũi tên; thẻ khuyên dùng nổi bật nhẹ) -> chân hộp một nút "Để sau".
 *
 * Nhân viên (ngữ cảnh chủ) không vào được /app/topup và /app/billing (OwnerRoute) nên không có thẻ điều hướng, chỉ có
 * lời nhắn liên hệ chủ tài khoản + nút "Đã hiểu".
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
    const previouslyFocused = document.activeElement;
    // Focus vào KHUNG hộp (tabIndex -1), không vào thẻ đầu: thẻ khuyên dùng đã viền cam, thêm vòng focus thành hai lớp.
    // Bấm Tab vẫn đi vào từng thẻ (bẫy focus bên dưới).
    const timer = setTimeout(() => dialogRef.current?.focus(), 50);
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onCloseRef.current?.();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      // Bẫy focus: Tab xoay vòng trong hộp.
      const items = Array.from(dialogRef.current.querySelectorAll(FOCUSABLE));
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === dialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) previouslyFocused.focus();
    };
  }, []);

  if (!channel) return null;

  const name = CHANNEL_NAMES[channel] || channel;
  const reason = info?.reason || null;
  const detail = info?.detail || null;
  const visual = CHANNEL_VISUALS[channel] || { Icon: HiOutlineLockClosed, tint: CHANNEL_VISUALS.zalo.tint };
  const ChannelIcon = visual.Icon;

  const upgradeOption = (descKey) => ({
    key: 'upgrade',
    title: t('channelUnavailable.upgradeTitle'),
    desc: t(descKey, { channel: name }),
    to: BILLING_PATH,
  });

  let title;
  let hint;
  let keepHistory = false;
  /** @type {Array<{ key: string, title: string, desc: string, to: string, primary?: boolean }>} */
  const options = [];

  if (reason === CHANNEL_UNAVAILABLE_REASONS.PLAN_EXPIRED) {
    title = t('channelUnavailable.expiredTitle');
    hint = t('channelUnavailable.expiredHint', { channel: name });
    keepHistory = true;
    options.push({ key: 'renew', title: t('channelUnavailable.renewTitle'), desc: t('channelUnavailable.renewDesc'), to: BILLING_PATH, primary: true });
  } else if (reason === CHANNEL_UNAVAILABLE_REASONS.QUOTA_EXHAUSTED) {
    const counts = { channel: name, used: formatCount(info?.used), limit: formatCount(info?.limit) };
    title = t('channelUnavailable.quotaTitle', counts);
    if (detail === 'combined') {
      hint = t('channelUnavailable.quotaCombinedHint', counts);
      options.push({ ...upgradeOption('channelUnavailable.upgradeDescQuota'), primary: true });
    } else {
      hint = t('channelUnavailable.quotaHint', counts);
      options.push({ key: 'buyQuota', title: t('channelUnavailable.buyQuotaTitle'), desc: t('channelUnavailable.buyQuotaDesc'), to: TOPUP_PATH, primary: true });
      options.push(upgradeOption('channelUnavailable.upgradeDescQuota'));
    }
  } else {
    // not_in_plan (và mặc định an toàn nếu ai đó mở modal khi kênh thực ra dùng được: vẫn nói được "gói chưa có kênh").
    title = t('channelUnavailable.unlockTitle', { channel: name });
    keepHistory = true;
    if (detail === 'messages') {
      hint = t('channelUnavailable.noMessagesHint', { channel: name });
      options.push({ ...upgradeOption('channelUnavailable.upgradeDescChannel'), primary: true });
    } else {
      // Nhân viên không có lựa chọn nào (chỉ liên hệ chủ) → bỏ vế "Chọn một cách để dùng ngay".
      hint = t(isEmployee ? 'channelUnavailable.notInPlanHintEmployee' : 'channelUnavailable.notInPlanHint', { channel: name });
      options.push({ key: 'buySlot', title: t('channelUnavailable.buySlotTitle', { channel: name }), desc: t('channelUnavailable.buySlotDesc', { channel: name }), to: TOPUP_PATH, primary: true });
      options.push(upgradeOption('channelUnavailable.upgradeDescChannel'));
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
        className="relative z-10 max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200/90 bg-white shadow-2xl outline-none animate-in fade-in zoom-in-95 duration-150 dark:border-dk-border/90 dark:bg-dk-surface"
      >
        <div className="px-5 pb-5 pt-6 sm:px-6">
          <div className="flex flex-col items-center text-center">
            <div className="relative" aria-hidden="true">
              <div className={`flex h-14 w-14 items-center justify-center rounded-2xl border shadow-xs ${visual.tint}`}>
                <ChannelIcon className="h-7 w-7" />
              </div>
              <span className="absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-slate-600 text-white dark:border-dk-surface dark:bg-dk-strong dark:text-dk-text2">
                <HiOutlineLockClosed className="h-3 w-3" />
              </span>
            </div>
            <h3 id="channel-unavailable-title" className="mt-4 text-lg font-bold leading-snug text-slate-900 dark:text-dk-text">
              {title}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-dk-text2">{hint}</p>
            {keepHistory && (
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-dk-text2/80" data-testid="channel-unavailable-keep-history">
                {t('channelUnavailable.keepHistory')}
              </p>
            )}
          </div>

          {isEmployee ? (
            <p className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600 dark:bg-dk-raised dark:text-dk-text2" data-testid="channel-unavailable-owner-only">
              {t('channelUnavailable.ownerOnlyHint')}
            </p>
          ) : (
            <div className="mt-5 flex flex-col gap-2.5">
              {options.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  data-testid={`channel-unavailable-action-${option.key}`}
                  onClick={() => go(option.to)}
                  className={`group flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                    option.primary
                      ? 'border-primary-300 bg-primary-50/70 hover:bg-primary-50 dark:border-primary-500/50 dark:bg-primary-950/30 dark:hover:bg-primary-950/50'
                      : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-dk-border dark:bg-dk-surface dark:hover:bg-dk-raised'
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900 dark:text-dk-text">{option.title}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-slate-500 dark:text-dk-text2">{option.desc}</span>
                  </span>
                  <HiOutlineChevronRight
                    className={`h-5 w-5 shrink-0 transition-transform group-hover:translate-x-0.5 ${option.primary ? 'text-primary-600 dark:text-primary-400' : 'text-slate-400 dark:text-dk-text2'}`}
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            data-testid="channel-unavailable-close"
            onClick={() => onClose?.()}
            className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-dk-border dark:bg-dk-surface dark:text-dk-text dark:hover:bg-dk-raised"
          >
            {isEmployee ? t('channelUnavailable.gotIt') : t('channelUnavailable.later')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
