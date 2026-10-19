import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { HiOutlineRefresh, HiOutlineScale } from 'react-icons/hi';
import adminSystemApiService from '../../features/admin/services/adminSystemApi.service';
import ConfirmModal from '../../components/common/ConfirmModal';
import { useI18n } from '../../i18n';

const NOTE_MAX_LENGTH = 500;
const PAGE_SIZE = 50;

const fmtTime = (value, locale) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
};

/**
 * Khối "Đặt chỗ hạn mức chờ đối soát" trên trang Giám sát máy chủ (R2).
 *
 * Dòng `uncertain` vẫn tính hạn mức + giữ ví của khách cho tới khi NGƯỜI quyết định — không có cron nào tự gỡ.
 * Hai nút: "Đã gửi" (uncertain → consumed, trừ ví đúng một lần) và "Chưa gửi" (uncertain → released, trả hạn mức + ví).
 * Cả hai đều qua hộp xác nhận kèm ô ghi chú; `hasMessageEvidence` chỉ là gợi ý, không chặn.
 */
export default function SendQuotaReconcilePanel() {
  const { t, locale } = useI18n();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // { row, outcome } khi hộp xác nhận đang mở
  const [pending, setPending] = useState(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await adminSystemApiService.getUncertainSendQuotaReservations({ limit: PAGE_SIZE });
      const data = res?.data?.data;
      setItems(Array.isArray(data?.items) ? data.items : []);
      setTotal(Number(data?.total) || 0);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openConfirm = (row, outcome) => {
    setNote('');
    setPending({ row, outcome });
  };

  const closeConfirm = () => {
    if (submitting) return;
    setPending(null);
    setNote('');
  };

  const submit = async () => {
    if (!pending) return;
    setSubmitting(true);
    try {
      await adminSystemApiService.reconcileSendQuotaReservation(pending.row.id, {
        outcome: pending.outcome,
        note: note.trim(),
      });
      toast.success(t(pending.outcome === 'sent' ? 'adminSystem.quotaReconcile.successSent' : 'adminSystem.quotaReconcile.successNotSent'));
      setPending(null);
      setNote('');
      await load();
    } catch (err) {
      const conflict = err?.response?.status === 409;
      toast.error(conflict ? t('adminSystem.quotaReconcile.conflict') : (err?.response?.data?.message || t('adminSystem.quotaReconcile.failed')));
      if (conflict) {
        setPending(null);
        setNote('');
        await load();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const channelName = (channel) => {
    const key = `auditLogs.details.channel.${channel}`;
    const label = t(key);
    return label && label !== key ? label : String(channel || '');
  };

  const sent = pending?.outcome === 'sent';
  const confirmMessage = pending ? (
    <div className="space-y-3">
      <p>
        {t(sent ? 'adminSystem.quotaReconcile.confirmSentMessage' : 'adminSystem.quotaReconcile.confirmNotSentMessage', { id: pending.row.id })}
      </p>
      {!sent && pending.row.hasMessageEvidence && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          {t('adminSystem.quotaReconcile.confirmNotSentEvidenceWarning')}
        </p>
      )}
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-slate-700 dark:text-dk-text">{t('adminSystem.quotaReconcile.noteLabel')}</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX_LENGTH))}
          maxLength={NOTE_MAX_LENGTH}
          rows={3}
          disabled={submitting}
          placeholder={t('adminSystem.quotaReconcile.notePlaceholder')}
          data-testid="reconcile-note"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary-400 dark:border-dk-border dark:bg-dk-inset dark:text-dk-text"
        />
      </label>
    </div>
  ) : null;

  return (
    <div className="card overflow-hidden" data-testid="quota-reconcile-panel">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-dk-border">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <HiOutlineScale className="h-4 w-4 text-gray-500 dark:text-dk-text2" />
            <h2 className="text-sm font-semibold text-gray-700 dark:text-dk-text">{t('adminSystem.quotaReconcile.title')}</h2>
            {!loading && !loadError && (
              <span className={`badge text-xs ${total > 0 ? 'badge-warning' : 'badge-gray'}`} data-testid="reconcile-count">
                {t('adminSystem.quotaReconcile.count', { n: total })}
              </span>
            )}
          </div>
          <p className="mt-1 max-w-3xl text-xs text-gray-400 dark:text-dk-muted">{t('adminSystem.quotaReconcile.description')}</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={load} disabled={loading}>
          <HiOutlineRefresh className="mr-2 h-4 w-4" />
          {t('adminSystem.quotaReconcile.refresh')}
        </button>
      </div>

      <div className="p-5">
        {loadError ? (
          <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
            {t('adminSystem.quotaReconcile.loadFailed')}
          </div>
        ) : loading && items.length === 0 ? (
          <div className="h-12 animate-pulse rounded-xl bg-gray-100 dark:bg-dk-raised" />
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-dk-text2" data-testid="reconcile-empty">{t('adminSystem.quotaReconcile.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs uppercase text-gray-400 dark:border-dk-border dark:text-dk-muted">
                  <th className="py-2 pr-4 font-semibold">{t('adminSystem.quotaReconcile.colId')}</th>
                  <th className="py-2 pr-4 font-semibold">{t('adminSystem.quotaReconcile.colOwner')}</th>
                  <th className="py-2 pr-4 font-semibold">{t('adminSystem.quotaReconcile.colChannel')}</th>
                  <th className="py-2 pr-4 font-semibold">{t('adminSystem.quotaReconcile.colTimes')}</th>
                  <th className="py-2 pr-4 font-semibold">{t('adminSystem.quotaReconcile.colEvidence')}</th>
                  <th className="py-2 font-semibold">{t('adminSystem.quotaReconcile.colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-dk-border">
                {items.map((row) => (
                  <tr key={row.id} data-testid={`reconcile-row-${row.id}`} className="align-top">
                    <td className="py-3 pr-4 font-mono text-xs text-gray-700 dark:text-dk-text">#{row.id}</td>
                    <td className="py-3 pr-4">
                      <p className="font-semibold text-gray-900 dark:text-dk-text">{row.billingName || row.billingEmail || `#${row.billingUserId}`}</p>
                      {row.billingEmail && row.billingName && (
                        <p className="text-xs text-gray-500 dark:text-dk-text2">{row.billingEmail}</p>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-gray-700 dark:text-dk-text">
                      <p>{t('adminSystem.quotaReconcile.channelQuantity', { channel: channelName(row.channel), quantity: row.quantity })}</p>
                      {row.walletQuantity > 0 && (
                        <p className="text-xs text-gray-500 dark:text-dk-text2">{t('adminSystem.quotaReconcile.walletHeld', { n: row.walletQuantity })}</p>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-xs text-gray-500 dark:text-dk-text2">
                      <p>{t('adminSystem.quotaReconcile.sendingAt', { time: fmtTime(row.sendingAt || row.createdAt, locale) })}</p>
                      <p>{t('adminSystem.quotaReconcile.uncertainAt', { time: fmtTime(row.uncertainAt, locale) })}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`badge text-xs ${row.hasMessageEvidence ? 'badge-success' : 'badge-gray'}`}
                        title={t('adminSystem.quotaReconcile.evidenceHint')}
                        data-testid={`reconcile-evidence-${row.id}`}
                      >
                        {t(row.hasMessageEvidence ? 'adminSystem.quotaReconcile.evidenceYes' : 'adminSystem.quotaReconcile.evidenceNo')}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="btn btn-primary" onClick={() => openConfirm(row, 'sent')}>
                          {t('adminSystem.quotaReconcile.actionSent')}
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => openConfirm(row, 'not_sent')}>
                          {t('adminSystem.quotaReconcile.actionNotSent')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={Boolean(pending)}
        variant={sent ? 'primary' : 'warning'}
        title={t(sent ? 'adminSystem.quotaReconcile.confirmSentTitle' : 'adminSystem.quotaReconcile.confirmNotSentTitle')}
        message={confirmMessage}
        confirmText={t(sent ? 'adminSystem.quotaReconcile.confirmSent' : 'adminSystem.quotaReconcile.confirmNotSent')}
        cancelText={t('adminSystem.quotaReconcile.cancel')}
        onConfirm={submit}
        onCancel={closeConfirm}
        isLoading={submitting}
      />
    </div>
  );
}
