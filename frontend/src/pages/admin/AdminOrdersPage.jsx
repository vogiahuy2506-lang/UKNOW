import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';
import { HiOutlineRefresh, HiOutlineSearch, HiOutlineBan, HiOutlineShoppingBag } from 'react-icons/hi';
import PageContainer from '../../components/common/PageContainer';
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
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        data-testid={testId}
        className={`card p-5 text-left transition-colors ${active ? 'ring-2 ring-primary-500' : 'hover:bg-gray-50'}`}
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
  return <span className={`badge ${s.className} text-xs`}>{s.label}</span>;
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
        <p className="text-xs text-gray-500" data-testid="orders-kpi-period">
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
          <label className="block text-xs text-gray-500 mb-1">{t('adminOrders.search')}</label>
          <div className="relative">
            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
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
          <label className="block text-xs text-gray-500 mb-1">{t('orders.status')}</label>
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
          <label className="block text-xs text-gray-500 mb-1">{t('adminOrders.fromDate')}</label>
          <input
            type="date"
            className="input w-full"
            value={draft.dateFrom}
            onChange={(e) => setDraft((p) => ({ ...p, dateFrom: e.target.value }))}
          />
        </div>

        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-gray-500 mb-1">{t('adminOrders.toDate')}</label>
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
        <div className="flex items-center gap-3 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800" data-testid="orders-attention-chip">
          <span>{t(`adminOrders.attention.${filters.attention}`)}</span>
          <button type="button" className="underline" onClick={() => setAttention('')}>
            {t('adminOrders.attention.clear')}
          </button>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {[t('adminOrders.orderCode'), t('adminOrders.servicePackage'), t('adminOrders.billingPeriod'), t('adminOrders.promotion'), t('adminOrders.customer'), t('adminOrders.amount'), t('adminOrders.createdAt'), t('adminOrders.status'), t('adminOrders.actions')].map((h) => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">
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
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-gray-400">
                    {t('adminOrders.noOrders')}
                  </td>
                </tr>
              ) : orders.map((o) => (
                <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{o.orderCode}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-gray-800">{o.planName || '—'}</span>
                      {o.isCustom && (
                        <span className="text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full font-medium">
                          {t('adminOrders.custom')}
                        </span>
                      )}
                    </div>
                    {o.planCode && <p className="text-xs text-gray-400">#{o.planCode}</p>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="badge badge-gray text-xs">
                      {o.isTopup
                        ? t('adminOrders.topup')
                        : o.billingPeriod === 'yearly' ? t('adminOrders.yearly') : t('adminOrders.monthly')}
                    </span>
                  </td>
                  <td className="px-4 py-3 min-w-[150px]">
                    {o.voucherCode ? (
                      <>
                        <p className="font-mono text-xs font-semibold text-violet-700">{o.voucherCode}</p>
                        {Number(o.discountAmount) > 0 && <p className="text-xs text-gray-500">-{fmtVnd(o.discountAmount)}</p>}
                      </>
                    ) : o.discountLabel || o.discountSource === 'automatic' ? (
                      <span className="text-xs text-violet-700">{o.discountLabel || t('adminOrders.automaticPromotion')}</span>
                    ) : (
                      <span className="text-xs text-gray-400">{t('adminOrders.noVoucher')}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-gray-800">{o.userFullName || o.userEmail}</p>
                    {o.userFullName && <p className="text-xs text-gray-400">{o.userEmail}</p>}
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">
                    {fmtVnd(o.amount)}
                    <p className="text-[11px] font-normal text-gray-400">{paymentLabel(o, t)}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                    {fmtDate(o.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={o.status} />
                    {hasUnhandledPaidAfterCancelled(o) && (
                      <span className="mt-1 block w-fit rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium uppercase text-rose-700">
                        {t('adminOrders.paidAfterCancelledBadge')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
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
                              className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                            >
                              {t('adminOrders.cancel')}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setCancellingCode(o.orderCode)}
                            title={t('adminOrders.cancelOrderAndDisableQR')}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <HiOutlineBan className="w-4 h-4" />
                          </button>
                        )
                      )}
                      {hasUnhandledPaidAfterCancelled(o) && (
                        <button
                          type="button"
                          onClick={() => handleMarkPaidAfterCancelledHandled(o.orderCode)}
                          className="text-xs px-2 py-1 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
                        >
                          {t('adminOrders.markPaidAfterCancelledHandled')}
                        </button>
                      )}
                      {canOfferRefund(o) && (
                        <button
                          type="button"
                          onClick={() => setRefundingCode(String(o.orderCode))}
                          className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
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
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
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
