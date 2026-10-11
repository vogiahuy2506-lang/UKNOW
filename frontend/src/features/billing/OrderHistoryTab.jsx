import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  HiOutlineClipboardList,
  HiOutlineCheckCircle,
  HiOutlineBan,
  HiOutlineClock,
  HiOutlineReceiptRefund,
} from 'react-icons/hi';
import { getMyOrders } from '../auth/services/authApi.service';

const STATUS_MAP = (t) => ({
  success:   { label: t('accountProfileModal.success'), cls: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800', icon: HiOutlineCheckCircle },
  pending:   { label: t('accountProfileModal.pending'), cls: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800', icon: HiOutlineClock },
  cancelled: { label: t('accountProfileModal.cancelled'), cls: 'text-gray-400 dark:text-dk-muted bg-gray-50 dark:bg-dk-raised border-gray-200 dark:border-dk-border', icon: HiOutlineBan },
  // PLAN_HOAN_TIEN_DON_HANG PR-3 — khoá orders.refunded có sẵn ở vi.js/en.js.
  refunded: { label: t('orders.refunded'), cls: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800', icon: HiOutlineReceiptRefund },
});

const TOPUP_ITEM_LABEL_KEYS = {
  zalo_messages: 'topup.items.zaloMessages',
  telegram_messages: 'topup.items.telegramMessages',
  whatsapp_messages: 'topup.items.whatsappMessages',
  emails: 'topup.items.emails',
  ai_credits: 'topup.items.aiCredits',
  zalo_accounts: 'topup.items.zaloAccounts',
  telegram_accounts: 'topup.items.telegramAccounts',
  whatsapp_accounts: 'topup.items.whatsappAccounts',
  email_accounts: 'topup.items.emailAccounts',
  landing_pages: 'topup.items.landingPages',
  chatbots: 'topup.items.chatbots',
  employees: 'topup.items.employees',
};

function formatTopupItemsSummary(items, t) {
  if (!Array.isArray(items) || items.length === 0) return '';
  return items
    .filter((it) => Number(it.qty) > 0)
    .map((it) => {
      const labelKey = TOPUP_ITEM_LABEL_KEYS[it.itemKey];
      const label = labelKey ? t(labelKey) : it.itemKey;
      return `${Number(it.qty).toLocaleString('vi-VN')} ${label}`;
    })
    .join(' · ');
}

function renderInvoiceStatus(invoice, orderCode, t, orderStatus) {
  if (!invoice || !invoice.status) {
    return (
      <span className="text-xs text-gray-400 dark:text-dk-muted">
        {t('invoiceVat.history.none')}
      </span>
    );
  }

  const { status, soHdon } = invoice;

  if (status === 'pending' || status === 'processing') {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 dark:bg-amber-950/40 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
        {t('invoiceVat.history.pending')}
      </span>
    );
  }

  if (status === 'issued') {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          {t('invoiceVat.history.issued', { soHdon: soHdon || '—' })}
        </span>
        <Link
          to={`/invoices/${orderCode}`}
          className="inline-flex items-center text-xs font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 underline"
        >
          {t('invoiceVat.history.view')}
        </Link>
      </div>
    );
  }

  if (status === 'cqt_ok') {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          {t('invoiceVat.history.cqtOk')}
        </span>
        <Link
          to={`/invoices/${orderCode}`}
          className="inline-flex items-center text-xs font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 underline"
        >
          {t('invoiceVat.history.view')}
        </Link>
      </div>
    );
  }

  // Đơn đã hoàn: hoá đơn chưa xuất bị CHỦ Ý dừng (failed / ORDER_REFUNDED) — "Xuất lỗi — hệ thống
  // đang thử lại" là sai với khách, hệ thống sẽ không thử lại.
  if (status === 'failed' && orderStatus === 'refunded') {
    return (
      <span className="text-xs text-gray-500 dark:text-dk-text2">
        {t('invoiceVat.history.refundedNoInvoice')}
      </span>
    );
  }

  if (status === 'failed') {
    return (
      <span className="inline-flex items-center rounded-full bg-rose-50 dark:bg-rose-950/40 px-2.5 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
        {t('invoiceVat.history.failed')}
      </span>
    );
  }

  if (status === 'cqt_rejected') {
    return (
      <span className="inline-flex items-center rounded-full bg-rose-50 dark:bg-rose-950/40 px-2.5 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
        {t('invoiceVat.history.cqtRejected')}
      </span>
    );
  }

  return (
    <span className="text-xs text-gray-400 dark:text-dk-muted">
      {t('invoiceVat.history.none')}
    </span>
  );
}

export default function OrderHistoryTab({ isUserAdmin, t }) {
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isUserAdmin) { setIsLoading(false); return; }
    getMyOrders()
      .then((res) => setOrders(res.data || []))
      .catch(() => setOrders([]))
      .finally(() => setIsLoading(false));
  }, [isUserAdmin]);

  if (!isUserAdmin) {
    return (
      <div className="py-12 text-center text-gray-400 dark:text-dk-muted text-sm">
        {t('accountProfileModal.ordersFeatureOnlyForMembers')}
      </div>
    );
  }

  if (isLoading) {
    return <div className="py-10 flex justify-center"><div className="spinner w-7 h-7" /></div>;
  }

  if (orders.length === 0) {
    return (
      <div className="py-12 text-center">
        <HiOutlineClipboardList className="w-10 h-10 text-gray-200 dark:text-dk-border mx-auto mb-2" />
        <p className="text-sm text-gray-400 dark:text-dk-muted">{t('accountProfileModal.noOrdersYet')}</p>
      </div>
    );
  }

  const statusMap = STATUS_MAP(t);

  return (
    <div className="space-y-3">
      {orders.map((order) => {
        const st = statusMap[order.status] || statusMap.pending;
        const Icon = st.icon;
        return (
          <div key={order.id} className="rounded-xl border border-gray-200 dark:border-dk-border bg-white dark:bg-dk-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-dk-text truncate">
                  {order.kind === 'topup'
                    ? t('accountProfileModal.topupOrderTitle')
                    : (order.plan?.name || t('accountProfileModal.unknownPlan'))}
                </p>
                {order.kind === 'topup' && order.topup?.items?.length > 0 && (
                  <p className="text-xs text-gray-500 dark:text-dk-text2 mt-0.5 truncate">
                    {formatTopupItemsSummary(order.topup.items, t)}
                  </p>
                )}
                <p className="text-xs text-gray-400 dark:text-dk-muted mt-0.5">
                  {t('accountProfileModal.orderCode')} <span className="font-mono">{order.orderCode}</span>
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-primary-600 dark:text-primary-400">
                  {order.amount > 0 ? `${Number(order.amount).toLocaleString('vi-VN')} ₫` : t('accountProfileModal.free')}
                </p>
                <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 text-xs font-medium rounded-full border ${st.cls}`}>
                  <Icon className="w-3 h-3" />
                  {st.label}
                </span>
              </div>
            </div>
            {order.kind !== 'topup' && order.plan && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-3 text-xs text-gray-500 dark:text-dk-text2">
                <span>{t('accountProfileModal.emailPerDay')} <strong className="text-gray-700 dark:text-dk-text">{order.plan.dailyEmailLimit ?? t('accountProfileModal.unlimitedShort')}</strong></span>
                <span>{t('accountProfileModal.emailPerMonth')} <strong className="text-gray-700 dark:text-dk-text">{order.plan.monthlyEmailLimit ?? t('accountProfileModal.unlimitedShort')}</strong></span>
                <span>{t('accountProfileModal.zaloPerDay')} <strong className="text-gray-700 dark:text-dk-text">{order.plan.dailyZaloLimit ?? t('accountProfileModal.unlimitedShort')}</strong></span>
                <span>{t('accountProfileModal.zaloPerMonth')} <strong className="text-gray-700 dark:text-dk-text">{order.plan.monthlyZaloLimit ?? t('accountProfileModal.unlimitedShort')}</strong></span>
              </div>
            )}

            {/* Electronic invoice status row */}
            <div className="mt-3 pt-2.5 border-t border-gray-100 dark:border-dk-border flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs text-gray-500 dark:text-dk-text2 font-medium">
                {t('invoiceVat.history.invoiceLabel')}:
              </span>
              <div>
                {renderInvoiceStatus(order.invoice, order.orderCode, t, order.status)}
              </div>
            </div>

            <p className="text-xs text-gray-400 dark:text-dk-muted mt-2">
              {new Date(order.createdAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        );
      })}
    </div>
  );
}
