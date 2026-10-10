import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  HiOutlineClipboard,
  HiOutlineExternalLink,
  HiOutlineX,
} from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import {
  getLeadExtraEntries,
  getLeadFullName,
  getLeadInitials,
} from '../utils/leadFields.js';
import LandingLeadConsentBadge from './LandingLeadConsentBadge.jsx';

const HANOI_TIME_ZONE = 'Asia/Ho_Chi_Minh';

function formatSubmittedAt(raw) {
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('vi-VN', { timeZone: HANOI_TIME_ZONE, hourCycle: 'h23' });
}

function DetailRow({ label, children }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-4 px-6 py-3.5">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-dk-text2 sm:pt-0.5">{label}</dt>
      <dd className="sm:col-span-2 min-w-0 text-sm text-slate-900 dark:text-dk-text break-words">{children}</dd>
    </div>
  );
}

function CopyButton({ onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 dark:text-dk-muted hover:text-orange-600 dark:hover:text-orange-400 hover:bg-slate-100 dark:hover:bg-dk-raised transition-colors"
      title={label}
      aria-label={label}
    >
      <HiOutlineClipboard className="w-4 h-4" />
    </button>
  );
}

/**
 * Modal chi tiết một khách từ landing page: mở bằng cách bấm dòng hoặc nút "Xem chi tiết".
 * Hiện ĐỦ mọi trường — ô "Thông tin thêm" ở bảng chỉ có một dòng cắt bớt (trên cảm ứng không có
 * hover để đọc `title`). Dữ liệu lấy từ chính dòng đang chọn, không gọi API mới.
 *
 * @param {object} props
 * @param {object|null} props.lead dòng lead đang xem (null = đóng)
 * @param {Array} props.customDefs định nghĩa trường tuỳ chỉnh (tra nhãn/option)
 * @param {() => void} props.onClose
 * @param {(text: string, label: string) => void} props.onCopy sao chép (trang cha báo toast thành công/lỗi)
 */
export default function LandingLeadDetailModal({ lead, customDefs = [], onClose, onCopy }) {
  const { t } = useI18n();
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!lead) return undefined;
    const previouslyFocused = document.activeElement;
    dialogRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus();
    };
  }, [lead, onClose]);

  if (!lead) return null;

  const fullName = getLeadFullName(lead);
  const extraEntries = getLeadExtraEntries(lead, customDefs, 'vi');
  const publicUrl = lead.landingPageSlug ? `${window.location.origin}/${lead.landingPageSlug}` : null;
  const submittedAt = formatSubmittedAt(lead.registrationTime || lead.createdAt);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="landing-lead-detail-title"
      data-testid="landing-lead-detail-modal"
    >
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative z-10 w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-2xl bg-white dark:bg-dk-surface border border-slate-200/90 dark:border-dk-border shadow-2xl outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-100 dark:border-dk-border bg-slate-50/80 dark:bg-dk-raised/60">
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 text-white text-sm font-semibold shrink-0 shadow-2xs">
              {getLeadInitials(lead)}
            </span>
            <h3 id="landing-lead-detail-title" className="min-w-0 text-base font-bold text-slate-900 dark:text-dk-text truncate">
              {t('landingLeads.detailTitle')}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 dark:text-dk-muted hover:text-slate-700 dark:hover:text-dk-text hover:bg-slate-100 dark:hover:bg-dk-raised transition-colors"
            aria-label={t('common.close')}
          >
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>

        {/* Thông tin cơ bản */}
        <dl className="divide-y divide-slate-100 dark:divide-dk-border">
          <DetailRow label={t('landingLeads.fullName')}>{fullName || '—'}</DetailRow>
          <DetailRow label={t('landingLeads.email')}>
            {lead.email ? (
              <span className="flex items-center gap-1.5">
                <span className="min-w-0 break-all">{lead.email}</span>
                <CopyButton onClick={() => onCopy?.(lead.email, 'email')} label={`${t('landingLeads.copy')} ${t('landingLeads.email')}`} />
              </span>
            ) : (
              '—'
            )}
          </DetailRow>
          <DetailRow label={t('landingLeads.phone')}>
            {lead.phone ? (
              <span className="flex items-center gap-1.5">
                <span className="min-w-0 break-all">{lead.phone}</span>
                <CopyButton onClick={() => onCopy?.(lead.phone, 'SĐT')} label={`${t('landingLeads.copy')} ${t('landingLeads.phone')}`} />
              </span>
            ) : (
              '—'
            )}
          </DetailRow>
          <DetailRow label={t('landingLeads.landingSlug')}>
            {publicUrl ? (
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-orange-600 dark:text-orange-400 hover:underline break-all"
              >
                /{lead.landingPageSlug}
                <HiOutlineExternalLink className="w-3.5 h-3.5 shrink-0" />
              </a>
            ) : (
              '—'
            )}
          </DetailRow>
          <DetailRow label={t('forms.submissionsPage.colConsent')}>
            <LandingLeadConsentBadge row={lead} />
          </DetailRow>
          <DetailRow label={t('landingLeads.registrationTime')}>{submittedAt || '—'}</DetailRow>
        </dl>

        {/* Toàn bộ trường thêm */}
        <div className="border-t border-slate-100 dark:border-dk-border px-6 py-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-dk-text2">
            {t('landingLeads.extraInfo')}
          </h4>
          {extraEntries.length > 0 ? (
            <ul className="mt-3 space-y-2" data-testid="landing-lead-extra-list">
              {extraEntries.map((entry) => (
                <li key={entry.key} className="text-sm text-slate-900 dark:text-dk-text break-words whitespace-pre-line">
                  <span className="font-semibold text-slate-600 dark:text-dk-text2">{entry.label}:</span>{' '}
                  <span>{entry.value}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm italic text-slate-400 dark:text-dk-muted">{t('landingLeads.extraEmpty')}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-4 border-t border-slate-100 dark:border-dk-border bg-slate-50/80 dark:bg-dk-raised/60">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-dk-text bg-white dark:bg-dk-inset border border-slate-200 dark:border-dk-border hover:bg-slate-50 dark:hover:bg-dk-raised rounded-xl transition-colors shadow-2xs"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
