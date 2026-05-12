import { useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { HiOutlineRefresh, HiOutlineUsers, HiOutlineCurrencyDollar, HiOutlineClipboardList, HiOutlineChartBar, HiOutlinePrinter } from 'react-icons/hi';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { useAdminStats } from '../../features/admin/hooks/useAdminStats';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt    = (n) => Number(n || 0).toLocaleString('vi-VN');
const fmtVnd = (n) => `${fmt(n)} đ`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('vi-VN') : '—';

const STATUS_LABEL = { completed: 'Hoàn thành', pending: 'Chờ thanh toán', cancelled: 'Đã hủy' };
const STATUS_CLASS  = { completed: 'badge-success', pending: 'badge-warning', cancelled: 'badge-gray' };
const PLAN_COLORS  = ['#f97316', '#3b82f6', '#8b5cf6', '#10b981'];

// ── Skeleton ──────────────────────────────────────────────────────────────────
const Sk = ({ className = '' }) => <div className={`bg-gray-100 rounded-xl animate-pulse ${className}`} />;
const DashboardSkeleton = () => (
  <div className="space-y-6">
    <div className="flex items-center justify-between">
      <div className="space-y-2"><Sk className="h-7 w-48" /><Sk className="h-4 w-64" /></div>
      <Sk className="h-9 w-24 rounded-lg" />
    </div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => <Sk key={i} className="h-28" />)}
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Sk className="h-64" /><Sk className="h-64" />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Sk className="h-72" /><Sk className="h-72" />
    </div>
  </div>
);

// ── KPI Card ──────────────────────────────────────────────────────────────────
const KpiCard = ({ icon: Icon, label, value, sub, color = 'text-primary-600', bg = 'bg-primary-50' }) => (
  <div className="card p-5 flex items-start gap-4">
    <div className={`${bg} rounded-xl p-3 shrink-0`}>
      <Icon className={`w-6 h-6 ${color}`} />
    </div>
    <div className="min-w-0">
      <p className="text-sm text-gray-500 truncate">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  </div>
);

// ── Custom Tooltip cho BarChart ───────────────────────────────────────────────
const RevenueTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium text-gray-700 mb-1">{label}</p>
      <p className="text-primary-600">Doanh thu: <strong>{fmtVnd(payload[0]?.value)}</strong></p>
      <p className="text-gray-500">Đơn hoàn thành: <strong>{payload[1]?.value}</strong></p>
    </div>
  );
};

// ── Custom Label cho PieChart ─────────────────────────────────────────────────
const PieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────
const AdminDashboard = () => {
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
      <button onClick={refetch} className="btn btn-primary">Thử lại</button>
    </div>
  );

  const { kpi, monthlyRevenue, planDistribution, recentOrders, recentMembers } = data;

  const chartRevenue = monthlyRevenue.map((r) => ({
    month:   r.month,
    revenue: Number(r.revenue),
    orders:  Number(r.completedOrders),
  }));

  const chartPlan = planDistribution
    .filter((p) => Number(p.userCount) > 0)
    .map((p) => ({ name: p.name, value: Number(p.userCount) }));

  const printDate = new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard hệ thống</h1>
          <p className="text-gray-500 mt-1">Tổng quan toàn bộ nền tảng Founder AI</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            title="In / PDF: chọn «Lưu dưới dạng PDF». Bỏ chọn «Đầu trang và chân trang» để ẩn URL và ngày."
            className="btn btn-secondary"
          >
            <HiOutlinePrinter className="w-4 h-4 mr-2" />
            In / PDF
          </button>
          <button type="button" onClick={refetch} className="btn btn-secondary">
            <HiOutlineRefresh className="w-4 h-4 mr-2" />
            Làm mới
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          icon={HiOutlineUsers}
          label="Thành viên có gói"
          value={fmt(kpi.activeMembers)}
          sub={`/ ${fmt(kpi.totalMembers)} tổng thành viên`}
          color="text-blue-600" bg="bg-blue-50"
        />
        <KpiCard
          icon={HiOutlineCurrencyDollar}
          label="Doanh thu tháng này"
          value={fmtVnd(kpi.revenueThisMonth)}
          sub={`${fmt(kpi.completedOrdersThisMonth)} đơn hoàn thành`}
          color="text-green-600" bg="bg-green-50"
        />
        <KpiCard
          icon={HiOutlineClipboardList}
          label="Đơn hàng tháng này"
          value={fmt(kpi.ordersThisMonth)}
          sub={`${fmt(kpi.pendingOrdersThisMonth)} chờ thanh toán`}
          color="text-orange-600" bg="bg-orange-50"
        />
        <KpiCard
          icon={HiOutlineChartBar}
          label="Tổng nhân viên"
          value={fmt(kpi.totalEmployees)}
          sub={`${fmt(kpi.totalMembers)} chủ tài khoản`}
          color="text-purple-600" bg="bg-purple-50"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Doanh thu 6 tháng */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Doanh thu 6 tháng gần nhất</h2>
          {chartRevenue.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">Chưa có dữ liệu</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartRevenue} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}M`} width={42} />
                <Tooltip content={<RevenueTooltip />} />
                <Bar dataKey="revenue" name="Doanh thu" fill="#f97316" radius={[4, 4, 0, 0]} />
                <Bar dataKey="orders"  name="Đơn hoàn thành" fill="#fed7aa" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Phân bố gói */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Phân bố theo gói dịch vụ</h2>
          {chartPlan.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">Chưa có dữ liệu</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={chartPlan}
                  cx="50%" cy="50%"
                  innerRadius={55} outerRadius={90}
                  dataKey="value"
                  labelLine={false}
                  label={<PieLabel />}
                >
                  {chartPlan.map((_, i) => (
                    <Cell key={i} fill={PLAN_COLORS[i % PLAN_COLORS.length]} />
                  ))}
                </Pie>
                <Legend formatter={(v) => <span className="text-sm text-gray-600">{v}</span>} />
                <Tooltip formatter={(v, name) => [`${v} thành viên`, name]} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Đơn hàng gần nhất */}
        <div className="card">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Đơn hàng gần nhất</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {recentOrders.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Chưa có đơn hàng</p>
            ) : recentOrders.map((o) => (
              <div key={o.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{o.userEmail}</p>
                  <p className="text-xs text-gray-400">{o.planName || '—'} · {fmtDate(o.createdAt)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-gray-900">{fmtVnd(o.amount)}</p>
                  <span className={`badge text-xs ${STATUS_CLASS[o.status] || 'badge-gray'}`}>
                    {STATUS_LABEL[o.status] || o.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Thành viên mới */}
        <div className="card">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Thành viên mới nhất</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {recentMembers.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Chưa có thành viên</p>
            ) : recentMembers.map((m) => (
              <div key={m.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                    <span className="text-primary-600 text-sm font-semibold">
                      {(m.full_name || m.username || '?')[0].toUpperCase()}
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
                    : <span className="badge badge-gray text-xs">Chưa có gói</span>
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
            <h1 className="text-2xl font-bold">Dashboard hệ thống — Founder AI</h1>
            <p className="text-sm text-gray-500 mt-0.5">Xuất lúc {printDate}</p>
          </div>
          <p className="text-xs text-gray-400">founderai.biz</p>
        </div>

        {/* KPI grid */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Thành viên có gói',   value: `${fmt(kpi.activeMembers)} / ${fmt(kpi.totalMembers)}` },
            { label: 'Doanh thu tháng này', value: fmtVnd(kpi.revenueThisMonth) },
            { label: 'Đơn tháng này',       value: fmt(kpi.ordersThisMonth) },
            { label: 'Tổng nhân viên',      value: fmt(kpi.totalEmployees) },
          ].map(({ label, value }) => (
            <div key={label} className="border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
              <p className="text-xl font-bold">{value}</p>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Doanh thu 6 tháng gần nhất</h2>
            <BarChart width={500} height={220} data={chartRevenue} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}M`} width={38} />
              <Tooltip content={<RevenueTooltip />} />
              <Bar dataKey="revenue" fill="#f97316" radius={[4, 4, 0, 0]} />
              <Bar dataKey="orders"  fill="#fed7aa" radius={[4, 4, 0, 0]} />
            </BarChart>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Phân bố theo gói dịch vụ</h2>
            <PieChart width={480} height={220}>
              <Pie data={chartPlan} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                dataKey="value" labelLine={false} label={<PieLabel />}>
                {chartPlan.map((_, i) => <Cell key={i} fill={PLAN_COLORS[i % PLAN_COLORS.length]} />)}
              </Pie>
              <Legend formatter={(v) => <span className="text-sm text-gray-600">{v}</span>} />
            </PieChart>
          </div>
        </div>

        {/* Tables */}
        <div className="grid grid-cols-2 gap-6">
          {/* Đơn hàng gần nhất */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Đơn hàng gần nhất</h2>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  {['Email', 'Gói', 'Số tiền', 'Trạng thái'].map((h) => (
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
                    <td className="px-2 py-1.5 border border-gray-200">{STATUS_LABEL[o.status] || o.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Thành viên mới */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Thành viên mới nhất</h2>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  {['Tên', 'Email', 'Gói', 'Ngày đăng ký'].map((h) => (
                    <th key={h} className="text-left px-2 py-1.5 border border-gray-200 font-medium text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentMembers.map((m) => (
                  <tr key={m.id} className="border-b border-gray-100">
                    <td className="px-2 py-1.5 border border-gray-200">{m.fullName || m.username}</td>
                    <td className="px-2 py-1.5 border border-gray-200 truncate max-w-[120px]">{m.email}</td>
                    <td className="px-2 py-1.5 border border-gray-200">{m.planName || 'Chưa có gói'}</td>
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
