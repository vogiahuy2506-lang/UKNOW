import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { useReactToPrint } from 'react-to-print';
import {
  HiOutlineRefresh, HiOutlineUsers, HiOutlineCurrencyDollar, HiOutlineClipboardList, HiOutlinePrinter,
  HiOutlineReceiptTax, HiOutlineClock, HiOutlineExclamationCircle,
} from 'react-icons/hi';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useAdminStats } from '../../features/admin/hooks/useAdminStats';
import { useI18n } from '../../i18n';
import { orderStatusBadge } from './orderStatus.util';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt    = (n) => Number(n || 0).toLocaleString('vi-VN');
const fmtVnd = (n) => `${fmt(n)} đ`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('vi-VN') : '—';
// Trục tiền theo triệu, giữ một chữ số thập phân: `toFixed(0)` làm tròn 400.000 thành "0M" và 600.000 thành "1M".
const fmtMillions = (v) => `${(Number(v || 0) / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}M`;

// ── Skeleton ──────────────────────────────────────────────────────────────────
const Sk = ({ className = '' }) => <div className={`bg-gray-100 rounded-xl animate-pulse ${className}`} />;
const DashboardSkeleton = () => (
  <div className="space-y-6">
    <div className="flex items-center justify-between">
      <div className="space-y-2"><Sk className="h-7 w-48" /><Sk className="h-4 w-64" /></div>
      <Sk className="h-9 w-24 rounded-lg" />
    </div>
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {[...Array(6)].map((_, i) => <Sk key={i} className="h-28" />)}
    </div>
    <Sk className="h-64" />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Sk className="h-72" /><Sk className="h-72" />
    </div>
  </div>
);

// ── KPI Card ──────────────────────────────────────────────────────────────────
const KpiCard = ({ icon: Icon, label, value, sub, delta, deltaLabel, color = 'text-primary-600', bg = 'bg-primary-50', testId }) => (
  <div className="card p-5 flex items-start gap-4" data-testid={testId}>
    <div className={`${bg} rounded-xl p-3 shrink-0`}>
      <Icon className={`w-6 h-6 ${color}`} />
    </div>
    <div className="min-w-0">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
      {delta != null && (
        <p className={`text-xs mt-0.5 font-medium ${delta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
          {delta >= 0 ? '+' : ''}{delta}% {deltaLabel}
        </p>
      )}
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  </div>
);

// ── Cần xử lý: mỗi mục là một liên kết tới nơi xử lý ─────────────────────────────
const AttentionCard = ({ attention, t }) => {
  const rows = [
    {
      key: 'paid',
      count: attention.paidAfterCancelled.count,
      text: t('adminDashboard.attentionPaidAfterCancelled', {
        count: fmt(attention.paidAfterCancelled.count),
        amount: fmtVnd(attention.paidAfterCancelled.amount),
      }),
      to: '/admin/orders?attention=paid_after_cancelled',
    },
    {
      key: 'einvoice',
      count: attention.stuckEinvoices,
      text: t('adminDashboard.attentionStuckEinvoices', { count: fmt(attention.stuckEinvoices) }),
      to: '/admin/einvoices',
    },
    {
      key: 'withdrawal',
      count: attention.overdueWithdrawals,
      text: t('adminDashboard.attentionOverdueWithdrawals', { count: fmt(attention.overdueWithdrawals) }),
      to: '/admin/affiliate',
    },
  ];
  const open = rows.filter((r) => r.count > 0);
  const hasWork = open.length > 0;
  return (
    <div className="card p-5 flex items-start gap-4" data-testid="kpi-attention">
      <div className={`${hasWork ? 'bg-red-50' : 'bg-emerald-50'} rounded-xl p-3 shrink-0`}>
        <HiOutlineExclamationCircle className={`w-6 h-6 ${hasWork ? 'text-red-600' : 'text-emerald-600'}`} />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-gray-500">{t('adminDashboard.attentionTitle')}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5">{fmt(attention.total)}</p>
        {hasWork ? (
          <ul className="mt-1 space-y-0.5">
            {open.map((r) => (
              <li key={r.key} className="text-xs">
                <Link to={r.to} className="text-red-600 hover:underline">{r.text}</Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-gray-400 mt-0.5">{t('adminDashboard.attentionNone')}</p>
        )}
      </div>
    </div>
  );
};

// ── Custom Tooltip cho BarChart ───────────────────────────────────────────────
const RevenueTooltip = ({ active, payload, label, t }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium text-gray-700 mb-1">{label}</p>
      <p className="text-primary-600">{t('adminDashboard.revenue')}: <strong>{fmtVnd(payload[0]?.value)}</strong></p>
      <p className="text-gray-500">{t('adminDashboard.paidOrders')}: <strong>{payload[0]?.payload?.orders ?? 0}</strong></p>
    </div>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────
const AdminDashboard = () => {
  const { t } = useI18n();
  const printRef = useRef(null);
  const docTitleRef = useRef(typeof document !== 'undefined' ? document.title : '');
  const { data, isLoading, error, refetch } = useAdminStats();

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: () => '',
    pageStyle: `
      @page { margin: 12mm; }
      @media print {
        body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        .admin-print-root { position: static !important; left: auto !important; top: auto !important; width: 100% !important; }
      }
    `,
    onBeforePrint: async () => { docTitleRef.current = document.title; document.title = ''; },
    onAfterPrint:  ()       => { document.title = docTitleRef.current || ''; },
  });

  if (isLoading) return <DashboardSkeleton />;

  if (error) return (
    <div className="card p-10 text-center">
      <p className="text-red-500 mb-3">{error}</p>
      <button onClick={refetch} className="btn btn-primary">{t('adminDashboard.retry')}</button>
    </div>
  );

  const { kpi, monthlyRevenue, recentOrders, recentMembers, dataSince, dataSinceNote } = data;

  const chartRevenue = monthlyRevenue.map((r) => ({
    month:   r.month,
    revenue: Number(r.revenue),
    orders:  Number(r.paidOrders),
  }));

  const source = kpi.revenueBySource || { plan: 0, topup: 0, manual: 0 };
  const revenueSub = [
    t('adminDashboard.revenueSource', { plan: fmtVnd(source.plan), topup: fmtVnd(source.topup), manual: fmtVnd(source.manual) }),
    kpi.refundedThisMonth > 0 ? t('adminDashboard.refundedLine', { amount: fmtVnd(kpi.refundedThisMonth) }) : null,
  ].filter(Boolean).join(' · ');

  const printDate = new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('adminDashboard.title')}</h1>
          <p className="text-gray-500 mt-1">{t('adminDashboard.description')}</p>
          {(dataSince || dataSinceNote) && (
            <p className="text-xs text-amber-700 mt-1">
              {dataSince ? `Dữ liệu từ ${dataSince}. ` : ''}{dataSinceNote || ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            title={t('adminDashboard.pdfTip')}
            className="btn btn-secondary"
          >
            <HiOutlinePrinter className="w-4 h-4 mr-2" />
            {t('adminDashboard.printPdf')}
          </button>
          <button type="button" onClick={refetch} className="btn btn-secondary">
            <HiOutlineRefresh className="w-4 h-4 mr-2" />
            {t('adminDashboard.refresh')}
          </button>
        </div>
      </div>

      {/* 6 số */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard
          testId="kpi-revenue"
          icon={HiOutlineCurrencyDollar}
          label={t('adminDashboard.revenueMonth', { month: kpi.monthLabel })}
          value={fmtVnd(kpi.revenueThisMonth)}
          delta={kpi.revenueMomPct}
          deltaLabel={t('adminDashboard.vsSamePeriod', { day: kpi.todayLabel })}
          sub={revenueSub}
          color="text-green-600" bg="bg-green-50"
        />
        <KpiCard
          testId="kpi-paid-orders"
          icon={HiOutlineReceiptTax}
          label={t('adminDashboard.paidOrders')}
          value={fmt(kpi.paidOrdersThisMonth)}
          sub={t('adminDashboard.paidOrdersHint')}
          color="text-teal-600" bg="bg-teal-50"
        />
        <KpiCard
          testId="kpi-paying"
          icon={HiOutlineUsers}
          label={t('adminDashboard.payingCustomers')}
          value={fmt(kpi.payingCustomers)}
          sub={t('adminDashboard.trialLine', { trial: fmt(kpi.trialCustomers), total: fmt(kpi.totalCustomers) })}
          color="text-blue-600" bg="bg-blue-50"
        />
        <KpiCard
          testId="kpi-new"
          icon={HiOutlineClipboardList}
          label={t('adminDashboard.newCustomers')}
          value={fmt(kpi.newCustomersThisMonth)}
          delta={kpi.newCustomersMomPct}
          deltaLabel={t('adminDashboard.vsSamePeriod', { day: kpi.todayLabel })}
          sub={t('adminDashboard.newCustomersHint')}
          color="text-orange-600" bg="bg-orange-50"
        />
        <KpiCard
          testId="kpi-expiring"
          icon={HiOutlineClock}
          label={t('adminDashboard.expiringPaid')}
          value={fmt(kpi.expiringPaid7d)}
          sub={t('adminDashboard.expiringPaidHint')}
          color="text-purple-600" bg="bg-purple-50"
        />
        <AttentionCard attention={kpi.attention} t={t} />
      </div>

      {/* Doanh thu 6 tháng dương lịch */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">{t('adminDashboard.last6MonthsRevenue')}</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartRevenue} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtMillions} width={48} />
            <Tooltip content={<RevenueTooltip t={t} />} />
            <Bar dataKey="revenue" name={t('adminDashboard.revenue')} fill="#f97316" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Đơn hàng gần nhất */}
        <div className="card">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">{t('adminDashboard.recentOrders')}</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {recentOrders.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">{t('adminDashboard.noOrders')}</p>
            ) : recentOrders.map((o) => {
              const badge = orderStatusBadge(o.status, t);
              return (
                <div key={o.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{o.userEmail}</p>
                    <p className="text-xs text-gray-400">{o.planName || '—'} · {fmtDate(o.createdAt)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-gray-900">{fmtVnd(o.amount)}</p>
                    <span className={`badge text-xs ${badge.className}`}>{badge.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Khách mới */}
        <div className="card">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">{t('adminDashboard.recentMembers')}</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {recentMembers.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">{t('adminDashboard.noMembers')}</p>
            ) : recentMembers.map((m) => (
              <div key={m.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                    <span className="text-primary-600 text-sm font-semibold">
                      {(m.fullName || m.username || '?')[0].toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{m.fullName || m.username}</p>
                    <p className="text-xs text-gray-400 truncate">{m.email}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {m.planName
                    ? <span className="badge badge-success text-xs">{m.planName}</span>
                    : <span className="badge badge-gray text-xs">{t('adminDashboard.noPlan')}</span>
                  }
                  <p className="text-xs text-gray-400 mt-0.5">{fmtDate(m.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Hidden print content ── */}
      <div ref={printRef} className="admin-print-root absolute left-[-14000px] top-0 w-[1100px] bg-white text-gray-900 font-sans">
        {/* Title */}
        <div className="flex items-center justify-between border-b border-gray-300 pb-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">{t('adminDashboard.printTitle')}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{t('adminDashboard.printedAt')} {printDate}</p>
          </div>
          <p className="text-xs text-gray-400">founderai.biz</p>
        </div>

        {/* KPI grid */}
        <div className="grid grid-cols-5 gap-4 mb-8">
          {[
            { label: t('adminDashboard.revenueMonth', { month: kpi.monthLabel }), value: fmtVnd(kpi.revenueThisMonth) },
            { label: t('adminDashboard.paidOrders'), value: fmt(kpi.paidOrdersThisMonth) },
            { label: t('adminDashboard.payingCustomers'), value: `${fmt(kpi.payingCustomers)} (${t('adminDashboard.trialShort', { n: fmt(kpi.trialCustomers) })})` },
            { label: t('adminDashboard.newCustomers'), value: fmt(kpi.newCustomersThisMonth) },
            { label: t('adminDashboard.expiringPaid'), value: fmt(kpi.expiringPaid7d) },
          ].map(({ label, value }) => (
            <div key={label} className="border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
              <p className="text-xl font-bold">{value}</p>
            </div>
          ))}
        </div>

        {/* Chart */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">{t('adminDashboard.last6MonthsRevenue')}</h2>
          <BarChart width={720} height={220} data={chartRevenue} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtMillions} width={44} />
            <Tooltip content={<RevenueTooltip t={t} />} />
            <Bar dataKey="revenue" fill="#f97316" radius={[4, 4, 0, 0]} />
          </BarChart>
        </div>

        {/* Tables */}
        <div className="grid grid-cols-2 gap-6">
          {/* Đơn hàng gần nhất */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-2">{t('adminDashboard.recentOrders')}</h2>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  {[
                    t('adminDashboard.email'),
                    t('adminDashboard.plan'),
                    t('adminDashboard.amount'),
                    t('adminDashboard.status'),
                  ].map((h) => (
                    <th key={h} className="text-left px-2 py-1.5 border border-gray-200 font-medium text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((o) => (
                  <tr key={o.id} className="border-b border-gray-100">
                    <td className="px-2 py-1.5 border border-gray-200 truncate max-w-[120px]">{o.userEmail}</td>
                    <td className="px-2 py-1.5 border border-gray-200">{o.planName || '—'}</td>
                    <td className="px-2 py-1.5 border border-gray-200 whitespace-nowrap">{fmtVnd(o.amount)}</td>
                    <td className="px-2 py-1.5 border border-gray-200">{orderStatusBadge(o.status, t).label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Khách mới */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-2">{t('adminDashboard.recentMembers')}</h2>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  {[
                    t('adminDashboard.name'),
                    t('adminDashboard.email'),
                    t('adminDashboard.plan'),
                    t('adminDashboard.registrationDate'),
                  ].map((h) => (
                    <th key={h} className="text-left px-2 py-1.5 border border-gray-200 font-medium text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentMembers.map((m) => (
                  <tr key={m.id} className="border-b border-gray-100">
                    <td className="px-2 py-1.5 border border-gray-200">{m.fullName || m.username}</td>
                    <td className="px-2 py-1.5 border border-gray-200 truncate max-w-[120px]">{m.email}</td>
                    <td className="px-2 py-1.5 border border-gray-200">{m.planName || t('adminDashboard.noPlan')}</td>
                    <td className="px-2 py-1.5 border border-gray-200 whitespace-nowrap">{fmtDate(m.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
