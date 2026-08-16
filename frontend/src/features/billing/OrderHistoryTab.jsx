import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  HiOutlineClipboardList,
  HiOutlineCheckCircle,
  HiOutlineBan,
  HiOutlineClock,
} from 'react-icons/hi';
import { getMyOrders } from '../auth/services/authApi.service';

const STATUS_MAP = (t) => ({
  success:   { label: t('accountProfileModal.success'), cls: 'text-green-600 bg-green-50 border-green-200', icon: HiOutlineCheckCircle },
  pending:   { label: t('accountProfileModal.pending'), cls: 'text-amber-600 bg-amber-50 border-amber-200', icon: HiOutlineClock },
  cancelled: { label: t('accountProfileModal.cancelled'), cls: 'text-gray-400 bg-gray-50 border-gray-200', icon: HiOutlineBan },
});

const TOPUP_ITEM_LABEL_KEYS = {
  zalo_messages: 'topup.items.zaloMessages',
  emails: 'topup.items.emails',
  ai_credits: 'topup.items.aiCredits',
  zalo_accounts: 'topup.items.zaloAccounts',
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

function renderInvoiceStatus(invoice, orderCode, t) {
  if (!invoice || !invoice.status) {
    return (
      <span className="text-xs text-gray-400">
        {t('invoiceVat.history.none')}
      </span>
    );
  }

  const { status, soHdon } = invoice;

  if (status === 'pending' || status === 'processing') {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 border border-amber-200">
        {t('invoiceVat.history.pending')}
      </span>
    );
  }

  if (status === 'issued') {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">
          {t('invoiceVat.history.issued', { soHdon: soHdon || '—' })}
        </span>
        <Link
          to={`/invoices/${orderCode}`}
          className="inline-flex items-center text-xs font-semibold text-primary-600 hover:text-primary-700 underline"
        >
          {t('invoiceVat.history.view')}
        </Link>
      </div>
    );
  }

  if (status === 'cqt_ok') {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">
          {t('invoiceVat.history.cqtOk')}
        </span>
        <Link
          to={`/invoices/${orderCode}`}
          className="inline-flex items-center text-xs font-semibold text-primary-600 hover:text-primary-700 underline"
        >
          {t('invoiceVat.history.view')}
        </Link>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <span className="inline-flex items-center rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700 border border-rose-200">
        {t('invoiceVat.history.failed')}
      </span>
    );
  }

  if (status === 'cqt_rejected') {
    return (
      <span className="inline-flex items-center rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700 border border-rose-200">
        {t('invoiceVat.history.cqtRejected')}
      </span>
    );
  }

  return (
    <span className="text-xs text-gray-400">
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
      <div className="py-12 text-center text-gray-400 text-sm">
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
        <HiOutlineClipboardList className="w-10 h-10 text-gray-200 mx-auto mb-2" />
        <p className="text-sm text-gray-400">{t('accountProfileModal.noOrdersYet')}</p>
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
          <div key={order.id} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {order.kind === 'topup'
                    ? t('accountProfileModal.topupOrderTitle')
                    : (order.plan?.name || t('accountProfileModal.unknownPlan'))}
                </p>
                {order.kind === 'topup' && order.topup?.items?.length > 0 && (
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {formatTopupItemsSummary(order.topup.items, t)}
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">
                  {t('accountProfileModal.orderCode')} <span className="font-mono">{order.orderCode}</span>
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-primary-600">
                  {order.amount > 0 ? `${Number(order.amount).toLocaleString('vi-VN')} ₫` : t('accountProfileModal.free')}
                </p>
                <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 text-xs font-medium rounded-full border ${st.cls}`}>
                  <Icon className="w-3 h-3" />
                  {st.label}
                </span>
              </div>
            </div>
            {order.kind !== 'topup' && order.plan && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-3 text-xs text-gray-500">
                <span>{t('accountProfileModal.emailPerDay')} <strong className="text-gray-700">{order.plan.dailyEmailLimit ?? t('accountProfileModal.unlimitedShort')}</strong></span>
                <span>{t('accountProfileModal.emailPerMonth')} <strong className="text-gray-700">{order.plan.monthlyEmailLimit ?? t('accountProfileModal.unlimitedShort')}</strong></span>
                <span>{t('accountProfileModal.zaloPerDay')} <strong className="text-gray-700">{order.plan.dailyZaloLimit ?? t('accountProfileModal.unlimitedShort')}</strong></span>
                <span>{t('accountProfileModal.zaloPerMonth')} <strong className="text-gray-700">{order.plan.monthlyZaloLimit ?? t('accountProfileModal.unlimitedShort')}</strong></span>
              </div>
            )}

            {/* Electronic invoice status row */}
            <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs text-gray-500 font-medium">
                {t('invoiceVat.history.invoiceLabel')}:
              </span>
              <div>
                {renderInvoiceStatus(order.invoice, order.orderCode, t)}
              </div>
            </div>

            <p className="text-xs text-gray-400 mt-2">
              {new Date(order.createdAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        );
      })}
    </div>
  );
}
