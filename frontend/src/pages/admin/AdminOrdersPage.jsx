import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';
import { HiOutlineRefresh, HiOutlineSearch, HiOutlineBan, HiOutlineShoppingBag, HiOutlineEye, HiOutlineClipboardCopy } from 'react-icons/hi';
import PageContainer from '../../components/common/PageContainer';
import Modal from '../../components/Modal';
import adminOrdersApiService from '../../features/admin/services/adminOrdersApi.service';
import RefundOrderModal from '../../features/admin/components/RefundOrderModal';
import { orderStatusBadge } from './orderStatus.util';

const fmtVnd = (n) => Number(n || 0).toLocaleString('vi-VN') + ' đ';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const paymentLabel = (o, t) => {
  if (o.paymentMethod === 'voucher') return t('adminOrders.paymentVoucher');
  if (o.paymentMethod === 'manual') return t('adminOrders.paymentManual');
  if (o.paymentMethod === 'free') return t('adminOrders.paymentFree');
  return o.paymentMethod || 'PayOS';
};

const EMPTY_FILTERS = { status: '', search: '', dateFrom: '', dateTo: '', attention: '' };
const ATTENTION_VALUES = ['paid_after_cancelled', 'needs_action'];

const pad2 = (n) => String(n).padStart(2, '0');
/** Ngày 'YYYY-MM-DD' theo lịch máy (admin ở giờ VN) — chuỗi thuần, không qua Date/UTC nên không lệch ngày. */
const ymd = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
/** 'YYYY-MM-DD' → 'DD/MM/YYYY' bằng cắt chuỗi (không dựng Date: tránh lùi một ngày do múi giờ). */
const ymdToVn = (value) => String(value).split('-').reverse().join('/');

/**
 * Bộ lọc ban đầu: mặc định "tháng này" (từ mùng 1 tới hôm nay) để cả danh sách lẫn KPI cùng nói về một kỳ. Liên kết từ
 * Tổng quan (`?attention=paid_after_cancelled`) chỉ muốn đúng những đơn đó — mọi tháng — nên có `attention` hoặc mốc
 * ngày trên URL thì KHÔNG áp mặc định tháng này.
 */
function initialFiltersFromUrl(searchParams, today = new Date()) {
  const attention = ATTENTION_VALUES.includes(searchParams.get('attention')) ? searchParams.get('attention') : '';
  const dateFrom = searchParams.get('dateFrom') || '';
  const dateTo = searchParams.get('dateTo') || '';
  const status = searchParams.get('status') || '';
  if (attention || dateFrom || dateTo) return { ...EMPTY_FILTERS, status, attention, dateFrom, dateTo };
  return { ...EMPTY_FILTERS, status, dateFrom: ymd(new Date(today.getFullYear(), today.getMonth(), 1)), dateTo: ymd(today) };
}

// "Nợ nhỏ" PR-4 (26/09) — payment.service.js gắn tag PAID_AFTER_CANCELLED vào note (text thô, không
// phải cột riêng) khi PayOS báo đơn đã trả dù đơn đã cancelled/failed. Admin bấm nút xử lý sẽ nối
// thêm PAID_AFTER_CANCELLED_HANDLED — badge/nút chỉ hiện khi có tag gốc và CHƯA có tag đã xử lý.
const hasUnhandledPaidAfterCancelled = (order) => {
  const note = order?.note || '';
  return note.includes('PAID_AFTER_CANCELLED') && !note.includes('PAID_AFTER_CANCELLED_HANDLED');
};

// PLAN_HOAN_TIEN_DON_HANG PR-3 — chỉ để quyết định có HIỆN nút; điều kiện thật (và lý do từ chối)
// do server kiểm trên dòng đã khoá, modal hiện lý do nếu preview báo không đủ điều kiện.
const canOfferRefund = (order) => {
  if (order.isTopup) return false;
  if (order.status === 'success') {
    return Number(order.amount) > 0 && !['free', 'voucher'].includes(order.paymentMethod);
  }
  return ['cancelled', 'failed'].includes(order.status) && (order.note || '').includes('PAID_AFTER_CANCELLED');
};

const KpiCard = ({ label, value, sub, onClick, active, testId }) => {
  const body = (
    <>
      <p className="text-xs text-gray-400 dark:text-dk-text2 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-dk-text">{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-dk-muted mt-1">{sub}</p>}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        data-testid={testId}
        className={`card p-5 text-left transition-colors ${active ? 'ring-2 ring-primary-500' : 'hover:bg-gray-50 dark:hover:bg-dk-raised/40'}`}
      >
        {body}
      </button>
    );
  }
  return <div className="card p-5" data-testid={testId}>{body}</div>;
};

const StatusBadge = ({ status }) => {
  const { t } = useI18n();
  const s = orderStatusBadge(status, t);
  return <span className={`badge ${s.className} text-xs whitespace-nowrap`}>{s.label}</span>;
};

const DetailRow = ({ label, children, testId }) => (
  <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 py-2.5 sm:grid-cols-[160px_minmax(0,1fr)]" data-testid={testId}>
    <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-dk-text2">{label}</dt>
    <dd className="min-w-0 break-words text-sm text-gray-900 dark:text-dk-text">{children}</dd>
  </div>
);

// Modal chi tiết đơn — chỉ trình bày lại object đơn của dòng (không gọi API mới).
const OrderDetailModal = ({ order, onClose }) => {
  const { t } = useI18n();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(String(order.orderCode));
      toast.success(t('common.copied'));
    } catch {
      toast.error(t('adminOrders.detail.copyFailed'));
    }
  };

  const periodLabel = order.isTopup
    ? t('adminOrders.topup')
    : order.billingPeriod === 'yearly' ? t('adminOrders.yearly') : t('adminOrders.monthly');
  const hasDiscount = Number(order.discountAmount) > 0;
  const hasOriginal = order.originalAmount != null && Number(order.originalAmount) !== Number(order.amount);

  return (
    <Modal isOpen onClose={onClose} size="lg">
      <div className="space-y-4" data-testid="order-detail-modal">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-bold text-gray-900 dark:text-dk-text">{t('adminOrders.detail.title')}</h3>
          <StatusBadge status={order.status} />
        </div>

        <dl className="divide-y divide-gray-100 rounded-lg border border-gray-100 px-4 dark:divide-dk-border dark:border-dk-border dark:bg-dk-surface">
          <DetailRow label={t('adminOrders.orderCode')} testId="order-detail-code">
            <span className="inline-flex flex-wrap items-center gap-2">
              <span className="font-mono">{order.orderCode}</span>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline dark:text-primary-400"
              >
                <HiOutlineClipboardCopy className="h-3.5 w-3.5" />
                {t('common.copy')}
              </button>
            </span>
          </DetailRow>

          <DetailRow label={t('adminOrders.customer')}>
            {order.userFullName && <p className="font-medium">{order.userFullName}</p>}
            <p className={order.userFullName ? 'text-xs text-gray-500 dark:text-dk-text2' : ''}>{order.userEmail || '—'}</p>
            {order.userId != null && (
              <p className="text-xs text-gray-400 dark:text-dk-muted">{t('adminOrders.detail.userId', { id: order.userId })}</p>
            )}
          </DetailRow>

          <DetailRow label={t('adminOrders.servicePackage')}>
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <span className="font-medium">{order.planName || '—'}</span>
              {order.isCustom && (
                <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-600 dark:bg-purple-950/60 dark:text-purple-300">
                  {t('adminOrders.custom')}
                </span>
              )}
              {order.planCode && <span className="text-xs text-gray-400 dark:text-dk-muted">#{order.planCode}</span>}
            </span>
          </DetailRow>

          <DetailRow label={t('adminOrders.billingPeriod')}>{periodLabel}</DetailRow>

          <DetailRow label={t('adminOrders.promotion')}>
            {order.voucherCode ? (
              <span className="font-mono font-semibold text-violet-700 dark:text-violet-400">{order.voucherCode}</span>
            ) : order.discountLabel || order.discountSource === 'automatic' ? (
              <span className="text-violet-700 dark:text-violet-400">{order.discountLabel || t('adminOrders.automaticPromotion')}</span>
            ) : (
              <span className="text-gray-400 dark:text-dk-muted">{t('adminOrders.noVoucher')}</span>
            )}
          </DetailRow>

          {hasOriginal && (
            <DetailRow label={t('adminOrders.detail.originalAmount')}>{fmtVnd(order.originalAmount)}</DetailRow>
          )}
          {hasDiscount && (
            <DetailRow label={t('adminOrders.detail.discountAmount')}>-{fmtVnd(order.discountAmount)}</DetailRow>
          )}

          <DetailRow label={t('adminOrders.amount')}>
            <span className="font-semibold tabular-nums">{fmtVnd(order.amount)}</span>
          </DetailRow>
          <DetailRow label={t('adminOrders.detail.paymentMethod')}>{paymentLabel(order, t)}</DetailRow>
          <DetailRow label={t('adminOrders.createdAt')}>{fmtDate(order.createdAt)}</DetailRow>
          <DetailRow label={t('adminOrders.detail.updatedAt')}>{fmtDate(order.updatedAt)}</DetailRow>

          {hasUnhandledPaidAfterCancelled(order) && (
            <DetailRow label={t('adminOrders.detail.flag')}>
              <span className="inline-block rounded bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 dark:border dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300">
                {t('adminOrders.paidAfterCancelledBadge')}
              </span>
            </DetailRow>
          )}

          {order.note && (
            <DetailRow label={t('adminOrders.detail.note')}>
              <pre className="whitespace-pre-wrap break-words rounded bg-gray-50 p-2 font-mono text-xs text-gray-700 dark:bg-dk-inset dark:text-dk-text">{order.note}</pre>
            </DetailRow>
          )}
        </dl>

        <div className="flex justify-end">
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t('common.close')}</button>
        </div>
      </div>
    </Modal>
  );
};

const PAGE_SIZE = 20;

const AdminOrdersPage = () => {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const [orders, setOrders] = useState([]);
  const [kpi, setKpi] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  const [initialFilters] = useState(() => initialFiltersFromUrl(searchParams));
  const [filters, setFilters] = useState(initialFilters);
  const [draft, setDraft] = useState(initialFilters);
  const [cancellingCode, setCancellingCode] = useState(null); // orderCode đang confirm huỷ
  const [refundingCode, setRefundingCode] = useState(null); // orderCode đang mở modal hoàn tiền
  const [detailOrderId, setDetailOrderId] = useState(null); // id đơn đang mở modal chi tiết

  const fetchOrders = useCallback(async (f, p) => {
    setIsLoading(true);
    try {
      const params = { page: p, limit: PAGE_SIZE, ...f };
      Object.keys(params).forEach((k) => { if (!params[k]) delete params[k]; });
      const res = await adminOrdersApiService.getOrders(params);
      const { orders: rows, total: t, kpi: k } = res.data.data;
      setOrders(rows);
      setTotal(t);
      setKpi(k);
    } catch {
      toast.error(t('orders.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchOrders(filters, page); }, [filters, page, fetchOrders]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    setFilters({ ...draft });
  };

  // "Xoá lọc" = toàn thời gian, không bộ lọc nào — nhãn kỳ ở KPI đổi thành "Toàn thời gian" cho khớp.
  const handleReset = () => {
    setDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setPage(1);
    if (searchParams.toString()) setSearchParams({}, { replace: true });
  };

  // Lọc "cần chú ý" (thẻ "Cần xử lý" / liên kết từ Tổng quan) chỉ thu hẹp danh sách; bấm lại thẻ = bỏ lọc.
  const setAttention = (attention) => {
    const next = { ...filters, attention };
    setDraft((d) => ({ ...d, attention }));
    setFilters(next);
    setPage(1);
  };

  const periodLabel = (() => {
    const from = filters.dateFrom ? ymdToVn(filters.dateFrom) : '';
    const to = filters.dateTo ? ymdToVn(filters.dateTo) : '';
    if (from && to) return t('adminOrders.kpi.periodRange', { from, to });
    if (from) return t('adminOrders.kpi.periodFrom', { from });
    if (to) return t('adminOrders.kpi.periodTo', { to });
    return t('adminOrders.kpi.periodAll');
  })();

  const handleCancel = async (orderCode) => {
    try {
      await adminOrdersApiService.cancelOrder(orderCode);
      toast.success(t('orders.cancelSuccess'));
      setCancellingCode(null);
      fetchOrders(filters, page);
    } catch (err) {
      toast.error(err?.response?.data?.message || t('orders.cancelFailed'));
    }
  };

  const handleMarkPaidAfterCancelledHandled = async (orderCode) => {
    try {
      await adminOrdersApiService.markPaidAfterCancelledHandled(orderCode);
      toast.success(t('adminOrders.paidAfterCancelledHandledSuccess'));
      fetchOrders(filters, page);
    } catch (err) {
      toast.error(err?.response?.data?.message || t('adminOrders.paidAfterCancelledHandledFailed'));
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  // Tra theo id trong danh sách hiện tại: tải lại sau huỷ/hoàn thì modal thấy dữ liệu mới, đổi trang thì tự đóng.
  const detailOrder = detailOrderId == null ? null : orders.find((o) => o.id === detailOrderId) || null;

  return (
    <PageContainer
      title={t('adminOrders.title')}
      subtitle={t('adminOrders.description')}
      icon={HiOutlineShoppingBag}
      actions={
        <button
          type="button"
          onClick={() => fetchOrders(filters, page)}
          className="btn btn-secondary"
          disabled={isLoading}
        >
          <HiOutlineRefresh className="w-4 h-4 mr-2" />
          {t('adminOrders.refresh')}
        </button>
      }
    >

      {/* KPI — THEO BỘ LỌC (khoảng ngày + tìm kiếm), nhãn kỳ ghi rõ ngay dưới */}
      <div className="space-y-2">
        <p className="text-xs text-gray-500 dark:text-dk-text2" data-testid="orders-kpi-period">
          {t('adminOrders.kpi.caption', { period: periodLabel })}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            testId="orders-kpi-revenue"
            label={t('adminOrders.kpi.revenue')}
            value={kpi ? fmtVnd(kpi.revenue) : '—'}
            sub={t('adminOrders.kpi.revenueHint')}
          />
          <KpiCard
            testId="orders-kpi-refunded"
            label={t('adminOrders.kpi.refunded')}
            value={kpi ? fmtVnd(kpi.refunded) : '—'}
            sub={t('adminOrders.kpi.refundedHint')}
          />
          <KpiCard
            testId="orders-kpi-paid"
            label={t('adminOrders.kpi.paidOrders')}
            value={kpi ? Number(kpi.paidOrders).toLocaleString('vi-VN') : '—'}
            sub={t('adminOrders.kpi.paidOrdersHint')}
          />
          <KpiCard
            testId="orders-kpi-needs-action"
            label={t('adminOrders.kpi.needsAction')}
            value={kpi ? Number(kpi.needsAction).toLocaleString('vi-VN') : '—'}
            sub={t('adminOrders.kpi.needsActionHint')}
            active={filters.attention === 'needs_action'}
            onClick={() => setAttention(filters.attention === 'needs_action' ? '' : 'needs_action')}
          />
        </div>
      </div>

      {/* Filter bar */}
      <form onSubmit={handleSearch} className="card p-4 flex flex-wrap items-end gap-3">
        <div className="flex-[2] min-w-[180px]">
          <label className="block text-xs text-gray-500 dark:text-dk-text2 mb-1">{t('adminOrders.search')}</label>
          <div className="relative">
            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-dk-muted" />
            <input
              type="text"
              className="input pl-9 w-full"
              placeholder={t('adminOrders.searchPlaceholder')}
              value={draft.search}
              onChange={(e) => setDraft((p) => ({ ...p, search: e.target.value }))}
            />
          </div>
        </div>

        <div className="flex-1 min-w-[130px]">
          <label className="block text-xs text-gray-500 dark:text-dk-text2 mb-1">{t('orders.status')}</label>
          <select
            className="input w-full"
            value={draft.status}
            onChange={(e) => setDraft((p) => ({ ...p, status: e.target.value }))}
          >
            <option value="">{t('adminOrders.all')}</option>
            <option value="success">{t('adminOrders.success')}</option>
            <option value="pending">{t('adminOrders.pending')}</option>
            <option value="cancelled">{t('adminOrders.cancelled')}</option>
            <option value="failed">{t('adminOrders.failed')}</option>
            <option value="refunded">{t('adminOrders.refunded')}</option>
          </select>
        </div>

        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-gray-500 dark:text-dk-text2 mb-1">{t('adminOrders.fromDate')}</label>
          <input
            type="date"
            className="input w-full"
            value={draft.dateFrom}
            onChange={(e) => setDraft((p) => ({ ...p, dateFrom: e.target.value }))}
          />
        </div>

        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-gray-500 dark:text-dk-text2 mb-1">{t('adminOrders.toDate')}</label>
          <input
            type="date"
            className="input w-full"
            value={draft.dateTo}
            onChange={(e) => setDraft((p) => ({ ...p, dateTo: e.target.value }))}
          />
        </div>

        <div className="flex gap-2 shrink-0">
          <button type="submit" className="btn btn-primary" disabled={isLoading}>{t('common.filter')}</button>
          <button type="button" className="btn btn-secondary" onClick={handleReset}>{t('adminOrders.clearFilters')}</button>
        </div>
      </form>

      {filters.attention && (
        <div className="flex items-center gap-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-transparent dark:border-amber-900/40 px-4 py-2 text-sm text-amber-800 dark:text-amber-300" data-testid="orders-attention-chip">
          <span>{t(`adminOrders.attention.${filters.attention}`)}</span>
          <button type="button" className="underline hover:text-amber-900 dark:hover:text-amber-200" onClick={() => setAttention('')}>
            {t('adminOrders.attention.clear')}
          </button>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-dk-raised border-b border-gray-200 dark:border-dk-border">
              <tr>
                {[
                  { label: t('adminOrders.orderCode') },
                  { label: t('adminOrders.packageAndPeriod') },
                  { label: t('adminOrders.promotion') },
                  { label: t('adminOrders.customer') },
                  { label: t('adminOrders.amount'), right: true },
                  { label: t('adminOrders.createdAt') },
                  { label: t('adminOrders.status') },
                  { label: t('adminOrders.actions') },
                ].map(({ label, right }) => (
                  <th
                    key={label}
                    className={`${right ? 'text-right' : 'text-left'} whitespace-nowrap text-xs font-semibold text-gray-500 dark:text-dk-text2 uppercase tracking-wide px-4 py-3`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-dk-border/60">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(8)].map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 dark:bg-dk-raised rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-400 dark:text-dk-muted">
                    {t('adminOrders.noOrders')}
                  </td>
                </tr>
              ) : orders.map((o) => (
                <tr key={o.id} className="hover:bg-gray-50 dark:hover:bg-dk-raised/40 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-dk-text2 whitespace-nowrap">{o.orderCode}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                      <span className="font-medium text-gray-800 dark:text-dk-text">{o.planName || '—'}</span>
                      {o.isCustom && (
                        <span className="text-[10px] bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-300 px-1.5 py-0.5 rounded-full font-medium">
                          {t('adminOrders.custom')}
                        </span>
                      )}
                    </div>
                    <p className="flex items-center gap-1 whitespace-nowrap text-xs text-gray-400 dark:text-dk-muted">
                      {o.planCode && <><span>#{o.planCode}</span><span aria-hidden="true">·</span></>}
                      <span>
                        {o.isTopup
                          ? t('adminOrders.topup')
                          : o.billingPeriod === 'yearly' ? t('adminOrders.yearly') : t('adminOrders.monthly')}
                      </span>
                    </p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {o.voucherCode ? (
                      <>
                        <p className="font-mono text-xs font-semibold text-violet-700 dark:text-violet-400">{o.voucherCode}</p>
                        {Number(o.discountAmount) > 0 && <p className="text-xs text-gray-500 dark:text-dk-text2">-{fmtVnd(o.discountAmount)}</p>}
                      </>
                    ) : o.discountLabel || o.discountSource === 'automatic' ? (
                      <span className="block max-w-[180px] truncate text-xs text-violet-700 dark:text-violet-400" title={o.discountLabel || t('adminOrders.automaticPromotion')}>
                        {o.discountLabel || t('adminOrders.automaticPromotion')}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300 dark:text-dk-muted" title={t('adminOrders.noVoucher')}>
                        <span aria-hidden="true">—</span>
                        <span className="sr-only">{t('adminOrders.noVoucher')}</span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="max-w-[220px] truncate text-gray-800 dark:text-dk-text" title={o.userFullName || o.userEmail}>{o.userFullName || o.userEmail}</p>
                    {o.userFullName && <p className="max-w-[220px] truncate text-xs text-gray-400 dark:text-dk-text2" title={o.userEmail}>{o.userEmail}</p>}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900 dark:text-dk-text whitespace-nowrap">
                    {fmtVnd(o.amount)}
                    <p className="text-[11px] font-normal text-gray-400 dark:text-dk-muted">{paymentLabel(o, t)}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-dk-text2 whitespace-nowrap text-xs">
                    {fmtDate(o.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={o.status} />
                    {hasUnhandledPaidAfterCancelled(o) && (
                      <span className="mt-1 block max-w-[180px] w-fit rounded bg-rose-50 dark:bg-rose-950/40 border border-transparent dark:border-rose-900/40 px-1.5 py-0.5 text-[10px] font-medium uppercase text-rose-700 dark:text-rose-300">
                        {t('adminOrders.paidAfterCancelledBadge')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 w-px whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setDetailOrderId(o.id)}
                        title={t('adminOrders.viewDetails')}
                        aria-label={t('adminOrders.viewDetails')}
                        className="p-1.5 text-gray-400 dark:text-dk-text2 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-100 dark:hover:bg-dk-raised rounded-lg transition-colors"
                      >
                        <HiOutlineEye className="w-4 h-4" />
                      </button>
                      {o.status === 'pending' && (
                        cancellingCode === o.orderCode ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleCancel(o.orderCode)}
                              className="text-xs px-2 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                            >
                              {t('adminOrders.confirm')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setCancellingCode(null)}
                              className="text-xs px-2 py-1 bg-gray-100 dark:bg-dk-raised text-gray-600 dark:text-dk-text rounded-lg hover:bg-gray-200 dark:hover:bg-dk-strong transition-colors"
                            >
                              {t('adminOrders.cancel')}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setCancellingCode(o.orderCode)}
                            title={t('adminOrders.cancelOrderAndDisableQR')}
                            className="p-1.5 text-gray-400 dark:text-dk-text2 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
                          >
                            <HiOutlineBan className="w-4 h-4" />
                          </button>
                        )
                      )}
                      {hasUnhandledPaidAfterCancelled(o) && (
                        <button
                          type="button"
                          onClick={() => handleMarkPaidAfterCancelledHandled(o.orderCode)}
                          className="text-xs px-2 py-1 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors whitespace-nowrap"
                        >
                          {t('adminOrders.markPaidAfterCancelledHandled')}
                        </button>
                      )}
                      {canOfferRefund(o) && (
                        <button
                          type="button"
                          onClick={() => setRefundingCode(String(o.orderCode))}
                          className="text-xs px-2 py-1 border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors whitespace-nowrap"
                        >
                          {t('adminOrders.refundButton')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 dark:border-dk-border flex items-center justify-between text-sm text-gray-500 dark:text-dk-text2">
            <span>
              {t('adminOrders.displaying', { from: (page - 1) * PAGE_SIZE + 1, to: Math.min(page * PAGE_SIZE, total), total })}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="btn btn-secondary px-3 py-1.5 text-xs disabled:opacity-40"
              >
                ← {t('adminOrders.previous')}
              </button>
              {[...Array(Math.min(totalPages, 5))].map((_, i) => {
                const pg = page <= 3 ? i + 1 : page - 2 + i;
                if (pg > totalPages) return null;
                return (
                  <button
                    key={pg}
                    type="button"
                    onClick={() => setPage(pg)}
                    className={`btn px-3 py-1.5 text-xs ${pg === page ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    {pg}
                  </button>
                );
              })}
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="btn btn-secondary px-3 py-1.5 text-xs disabled:opacity-40"
              >
                {t('adminOrders.next')} →
              </button>
            </div>
          </div>
        )}
      </div>

      {detailOrder && (
        <OrderDetailModal order={detailOrder} onClose={() => setDetailOrderId(null)} />
      )}

      {refundingCode && (
        <RefundOrderModal
          orderCode={refundingCode}
          onClose={() => setRefundingCode(null)}
          onRefunded={() => { setRefundingCode(null); fetchOrders(filters, page); }}
        />
      )}
    </PageContainer>
  );
};

export default AdminOrdersPage;
