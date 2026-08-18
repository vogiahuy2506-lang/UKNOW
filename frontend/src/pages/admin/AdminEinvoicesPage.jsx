import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';
import { HiOutlineRefresh, HiOutlineSearch, HiOutlineMail } from 'react-icons/hi';
import adminEinvoicesApiService from '../../features/admin/services/adminEinvoicesApi.service';

const fmtVnd = (n) => Number(n || 0).toLocaleString('vi-VN') + ' đ';
const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

const INVOICE_STATUS_LABEL = (t) => ({
  pending: { label: t('adminEinvoices.statusPending'), cls: 'badge-yellow' },
  issued: { label: t('adminEinvoices.statusIssued'), cls: 'badge-blue' },
  cqt_ok: { label: t('adminEinvoices.statusCqtOk'), cls: 'badge-green' },
  failed: { label: t('adminEinvoices.statusFailed'), cls: 'badge-red' },
  cqt_rejected: { label: t('adminEinvoices.statusCqtRejected'), cls: 'badge-red' },
});

const EMAIL_STATUS_LABEL = (t) => ({
  sent: { label: t('adminEinvoices.emailStatusSent'), cls: 'badge-green' },
  pending: { label: t('adminEinvoices.emailStatusPending'), cls: 'badge-yellow' },
  failed: { label: t('adminEinvoices.emailStatusFailed'), cls: 'badge-red' },
  sending: { label: t('adminEinvoices.emailStatusSending'), cls: 'badge-blue' },
});

const InvoiceStatusBadge = ({ status }) => {
  const { t } = useI18n();
  const s = INVOICE_STATUS_LABEL(t)[status] || { label: status, cls: 'badge-gray' };
  return <span className={`badge ${s.cls} text-xs`}>{s.label}</span>;
};

const EmailStatusBadge = ({ status }) => {
  const { t } = useI18n();
  const s = EMAIL_STATUS_LABEL(t)[status] || { label: status || '—', cls: 'badge-gray' };
  return <span className={`badge ${s.cls} text-xs`}>{s.label}</span>;
};

const PAGE_SIZE = 20;

const getReasonMessage = (reason, t) => {
  switch (reason) {
    case 'worker_disabled':
      return t('adminEinvoices.reasonWorkerDisabled');
    case 'already_issued':
      return t('adminEinvoices.reasonAlreadyIssued');
    case 'already_sent':
      return t('adminEinvoices.reasonAlreadySent');
    case 'not_issued':
      return t('adminEinvoices.reasonNotIssued');
    case 'not_claimable':
      return t('adminEinvoices.reasonNotClaimable');
    case 'no_recipient':
      return t('adminEinvoices.reasonNoRecipient');
    case 'pdf_fetch':
      return t('adminEinvoices.reasonPdfFetch');
    default:
      return reason ? String(reason) : '';
  }
};

const AdminEinvoicesPage = () => {
  const { t } = useI18n();
  const [einvoices, setEinvoices] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const [filters, setFilters] = useState({
    status: 'stuck',
    search: '',
    dateFrom: '',
    dateTo: '',
  });
  const [draft, setDraft] = useState({
    status: 'stuck',
    search: '',
    dateFrom: '',
    dateTo: '',
  });

  const fetchEinvoices = useCallback(async (f, p) => {
    setIsLoading(true);
    try {
      const params = { page: p, limit: PAGE_SIZE, ...f };
      Object.keys(params).forEach((k) => {
        if (!params[k]) delete params[k];
      });
      const res = await adminEinvoicesApiService.getEinvoices(params);
      const { einvoices: rows, total: totalRows } = res.data.data;
      setEinvoices(rows || []);
      setTotal(totalRows || 0);
    } catch {
      toast.error(t('adminEinvoices.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchEinvoices(filters, page);
  }, [fetchEinvoices, filters, page]);

  const handleSearch = (e) => {
    e.preventDefault();
    setFilters({ ...draft });
    setPage(1);
  };

  const handleClearFilters = () => {
    const empty = { status: 'stuck', search: '', dateFrom: '', dateTo: '' };
    setDraft(empty);
    setFilters(empty);
    setPage(1);
  };

  const handleRetry = async (row) => {
    setActionLoadingId(row.id);
    try {
      const res = await adminEinvoicesApiService.retryEinvoice(row.id);
      const result = res.data?.data;
      if (result?.skipped) {
        const msg = getReasonMessage(result.reason, t);
        toast(msg || `Bỏ qua: ${result.reason}`, { icon: '⚠️' });
      } else if (result?.ok === false) {
        toast.error(`Phát hành thất bại (mã ${result.errorCode || 'Lỗi'})`);
      } else {
        toast.success(t('adminEinvoices.retrySuccess'));
      }
      fetchEinvoices(filters, page);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Có lỗi xảy ra khi phát hành lại');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleResendEmail = async (row) => {
    setActionLoadingId(row.id);
    try {
      const res = await adminEinvoicesApiService.resendEmail(row.id);
      const result = res.data?.data;
      if (result?.skipped) {
        const msg = getReasonMessage(result.reason, t);
        toast(msg || `Bỏ qua: ${result.reason}`, { icon: '⚠️' });
      } else if (result?.ok === false) {
        const msg = getReasonMessage(result.reason, t);
        toast.error(msg || `Gửi email thất bại (${result.reason || 'Lỗi'})`);
      } else {
        toast.success(t('adminEinvoices.resendEmailSuccess'));
      }
      fetchEinvoices(filters, page);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Có lỗi xảy ra khi gửi lại email');
    } finally {
      setActionLoadingId(null);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('adminEinvoices.title')}</h1>
          <p className="text-gray-500 mt-1">{t('adminEinvoices.description')}</p>
        </div>
        <button
          type="button"
          onClick={() => fetchEinvoices(filters, page)}
          className="btn btn-secondary"
          disabled={isLoading}
        >
          <HiOutlineRefresh className="w-4 h-4 mr-2" />
          {t('adminEinvoices.refresh')}
        </button>
      </div>

      {/* Filter bar */}
      <form onSubmit={handleSearch} className="card p-4 flex flex-wrap items-end gap-3">
        <div className="flex-[2] min-w-[180px]">
          <label className="block text-xs text-gray-500 mb-1">{t('adminEinvoices.search')}</label>
          <div className="relative">
            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              className="input pl-9 w-full"
              placeholder={t('adminEinvoices.searchPlaceholder')}
              value={draft.search}
              onChange={(e) => setDraft((p) => ({ ...p, search: e.target.value }))}
            />
          </div>
        </div>

        <div className="flex-1 min-w-[150px]">
          <label className="block text-xs text-gray-500 mb-1">{t('adminEinvoices.invoiceStatus')}</label>
          <select
            className="input w-full"
            value={draft.status}
            onChange={(e) => setDraft((p) => ({ ...p, status: e.target.value }))}
          >
            <option value="stuck">{t('adminEinvoices.statusStuck')}</option>
            <option value="">{t('adminEinvoices.statusAll')}</option>
            <option value="pending">{t('adminEinvoices.statusPending')}</option>
            <option value="issued">{t('adminEinvoices.statusIssued')}</option>
            <option value="cqt_ok">{t('adminEinvoices.statusCqtOk')}</option>
            <option value="failed">{t('adminEinvoices.statusFailed')}</option>
            <option value="cqt_rejected">{t('adminEinvoices.statusCqtRejected')}</option>
          </select>
        </div>

        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-gray-500 mb-1">{t('adminEinvoices.fromDate')}</label>
          <input
            type="date"
            className="input w-full"
            value={draft.dateFrom}
            onChange={(e) => setDraft((p) => ({ ...p, dateFrom: e.target.value }))}
          />
        </div>

        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-gray-500 mb-1">{t('adminEinvoices.toDate')}</label>
          <input
            type="date"
            className="input w-full"
            value={draft.dateTo}
            onChange={(e) => setDraft((p) => ({ ...p, dateTo: e.target.value }))}
          />
        </div>

        <div className="flex gap-2 shrink-0">
          <button type="submit" className="btn btn-primary" disabled={isLoading}>
            {t('adminEinvoices.search')}
          </button>
          <button
            type="button"
            onClick={handleClearFilters}
            className="btn btn-secondary"
            disabled={isLoading}
          >
            {t('adminEinvoices.clearFilters')}
          </button>
        </div>
      </form>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {[
                  t('adminEinvoices.orderCode'),
                  t('adminEinvoices.customer'),
                  t('adminEinvoices.amount'),
                  t('adminEinvoices.invoiceStatus'),
                  t('adminEinvoices.invoiceNumber'),
                  t('adminEinvoices.emailStatus'),
                  t('adminEinvoices.errorCode'),
                  t('adminEinvoices.createdAt'),
                  t('adminEinvoices.actions'),
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(9)].map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : einvoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-gray-400">
                    {t('adminEinvoices.noEinvoices')}
                  </td>
                </tr>
              ) : (
                einvoices.map((e) => {
                  const canRetry = ['failed', 'cqt_rejected'].includes(e.status);
                  const canResend = ['issued', 'cqt_ok'].includes(e.status);
                  const isActing = actionLoadingId === e.id;

                  return (
                    <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{e.orderCode}</td>
                      <td className="px-4 py-3">
                        <p className="text-gray-800 font-medium">{e.userFullName || e.userEmail}</p>
                        {e.userFullName && <p className="text-xs text-gray-400">{e.userEmail}</p>}
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">
                        {fmtVnd(e.amount)}
                      </td>
                      <td className="px-4 py-3">
                        <InvoiceStatusBadge status={e.status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-700 whitespace-nowrap">
                        {e.soHdon ? `${e.khhdon || ''} / ${e.soHdon}` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <EmailStatusBadge status={e.emailStatus} />
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px] truncate" title={e.errorMessage || e.errorCode || ''}>
                        {e.errorCode ? (
                          <span>
                            <span className="font-mono text-red-600 font-semibold">{e.errorCode}</span>
                            {e.errorMessage && <span className="text-gray-400 ml-1">({e.errorMessage})</span>}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                        {fmtDate(e.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          {canRetry && (
                            <button
                              type="button"
                              onClick={() => handleRetry(e)}
                              disabled={isActing}
                              className="btn btn-secondary text-xs px-2.5 py-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              title={t('adminEinvoices.retry')}
                            >
                              <HiOutlineRefresh className={`w-3.5 h-3.5 mr-1 ${isActing ? 'animate-spin' : ''}`} />
                              {t('adminEinvoices.retry')}
                            </button>
                          )}
                          {canResend && (
                            <button
                              type="button"
                              onClick={() => handleResendEmail(e)}
                              disabled={isActing}
                              className="btn btn-secondary text-xs px-2.5 py-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                              title={t('adminEinvoices.resendEmail')}
                            >
                              <HiOutlineMail className={`w-3.5 h-3.5 mr-1 ${isActing ? 'animate-spin' : ''}`} />
                              {t('adminEinvoices.resendEmail')}
                            </button>
                          )}
                          {!canRetry && !canResend && (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-gray-100 flex items-center justify-between gap-4">
            <p className="text-xs text-gray-500">
              {t('adminEinvoices.displaying', {
                from: (page - 1) * PAGE_SIZE + 1,
                to: Math.min(page * PAGE_SIZE, total),
                total,
              })}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isLoading}
                className="btn btn-secondary text-xs px-3 py-1.5"
              >
                {t('adminEinvoices.previous')}
              </button>
              <span className="text-xs text-gray-600">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || isLoading}
                className="btn btn-secondary text-xs px-3 py-1.5"
              >
                {t('adminEinvoices.next')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminEinvoicesPage;
