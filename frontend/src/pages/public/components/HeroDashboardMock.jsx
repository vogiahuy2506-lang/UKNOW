import founderaiLogo from '../../../assets/icons/founderai-logo.png';

// ── Sparkline SVG ────────────────────────────────────────────────────────────

function Sparkline({ data, color = '#f97316', height = 36 }) {
  const w = 120, h = height;
  const min = Math.min(...data), max = Math.max(...data);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / (max - min || 1)) * (h - 4) - 2;
    return `${x},${y}`;
  });
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Mini bar chart ────────────────────────────────────────────────────────────

function MiniBarChart({ data, color = '#f97316' }) {
  const max = Math.max(...data.map(d => d.value));
  return (
    <div className="flex items-end gap-1 h-16">
      {data.map((d, i) => (
        <div key={i} className="flex flex-col items-center gap-0.5 flex-1">
          <div
            className="w-full rounded-t"
            style={{ height: `${(d.value / max) * 52}px`, backgroundColor: i === data.length - 1 ? color : `${color}55` }}
          />
          <span className="text-[8px] text-neutral-400">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, trend, trendUp, gradient, chart }) {
  return (
    <div className="bg-white rounded-xl overflow-hidden border border-neutral-100">
      <div className={`bg-gradient-to-r ${gradient} px-3 pt-2.5 pb-2`}>
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-semibold text-white/80 uppercase tracking-wider">{label}</span>
          {trend && (
            <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full ${trendUp ? 'bg-white/20 text-white' : 'bg-white/20 text-white'}`}>
              {trendUp ? '↑' : '↓'} {trend}
            </span>
          )}
        </div>
        <div className="text-[20px] font-bold text-white leading-none mt-1">{value}</div>
      </div>
      <div className="px-3 py-2">
        <div className="text-[8px] text-neutral-400">{sub}</div>
        {chart && <div className="mt-1">{chart}</div>}
      </div>
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

const NAV = [
  { label: 'Dashboard', active: true },
  { label: 'Thiết lập', sub: ['Kênh gửi', 'Mẫu tin nhắn'] },
  { label: 'Landing page', sub: ['Trang HTML', 'Danh sách khách'] },
  { label: 'Chiến dịch', sub: ['Quản lý', 'Tạo mới', 'Chạy'] },
  { label: 'Khách hàng' },
];

function MockSidebar() {
  return (
    <div className="w-36 shrink-0 bg-white border-r border-neutral-100 flex flex-col h-full">
      {/* Logo */}
      <div className="px-3 py-3 border-b border-neutral-100 flex items-center gap-2">
        <img src={founderaiLogo} alt="logo" className="w-6 h-6 object-contain" />
        <div>
          <div className="text-[10px] font-bold text-neutral-800 leading-tight">Founder AI</div>
          <div className="text-[8px] text-neutral-400 leading-tight">Campaign Mgmt</div>
        </div>
      </div>
      {/* User */}
      <div className="px-3 py-2 border-b border-neutral-100 flex items-center gap-1.5">
        <div className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center shrink-0">
          <span className="text-white text-[8px] font-bold">N</span>
        </div>
        <div>
          <div className="text-[9px] font-semibold text-neutral-700">Nhật Minh</div>
          <div className="text-[8px] text-neutral-400">Cá nhân</div>
        </div>
      </div>
      {/* Nav */}
      <nav className="flex-1 px-2 py-2 flex flex-col gap-0.5 overflow-hidden">
        {NAV.map((item) => (
          <div key={item.label}>
            <div className={`px-2 py-1.5 rounded-lg text-[9px] font-semibold flex items-center gap-1.5 ${item.active ? 'bg-orange-50 text-orange-600' : 'text-neutral-600'}`}>
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: item.active ? '#f97316' : '#d1d5db' }} />
              {item.label}
            </div>
            {item.sub && (
              <div className="ml-4 flex flex-col gap-0.5 mt-0.5">
                {item.sub.map(s => (
                  <div key={s} className="text-[8.5px] text-neutral-400 px-2 py-0.5">{s}</div>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

const EMAIL_DATA = [
  { label: 'T3', value: 420 }, { label: 'T4', value: 680 }, { label: 'T5', value: 540 },
  { label: 'T6', value: 810 }, { label: 'T7', value: 720 }, { label: 'T8', value: 950 },
  { label: 'T9', value: 1180 }, { label: 'T10', value: 1040 }, { label: 'T11', value: 1320 },
];

const SPARK_CAMPAIGNS  = [12, 18, 14, 22, 19, 24, 20, 28, 24];
const SPARK_SENT       = [2400, 3100, 2800, 4200, 3800, 5100, 4600, 6200, 5840];
const SPARK_OPEN       = [28, 34, 31, 38, 36, 41, 38, 44, 39];
const SPARK_REVENUE    = [12, 22, 18, 31, 27, 38, 34, 45, 42];

const CAMPAIGNS = [
  { name: 'Flash Sale Tháng 5', type: 'Email', status: 'Đang chạy', sent: '3,240', open: '41.2%', revenue: '24.8tr' },
  { name: 'Zalo CSKH Hè 2026', type: 'Zalo', status: 'Đã xong', sent: '1,820', open: '67.5%', revenue: '18.2tr' },
  { name: 'Webinar Marketing AI', type: 'Email', status: 'Đang chạy', sent: '2,100', open: '38.1%', revenue: '11.5tr' },
  { name: 'Re-engage Q2', type: 'Zalo', status: 'Nháp', sent: '—', open: '—', revenue: '—' },
];

function StatusBadge({ status }) {
  const map = {
    'Đang chạy': 'bg-green-50 text-green-600',
    'Đã xong': 'bg-blue-50 text-blue-500',
    'Nháp': 'bg-neutral-100 text-neutral-400',
  };
  return <span className={`text-[8px] font-medium px-1.5 py-0.5 rounded-full ${map[status]}`}>{status}</span>;
}

export default function HeroDashboardMock() {
  return (
    /* Browser frame */
    <div className="w-full max-w-[860px] mx-auto px-3 sm:px-4">
      <div className="rounded-t-2xl overflow-hidden shadow-2xl" style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.25)' }}>

        {/* Browser chrome */}
        <div className="bg-neutral-800 px-3 py-2 flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
          </div>
          <div className="flex-1 bg-neutral-700 rounded-md px-3 py-1 text-[9px] text-neutral-400 mx-2">
            founderai.biz/app/dashboard
          </div>
        </div>

        {/* App content */}
        <div className="flex bg-neutral-50" style={{ height: 380 }}>
          <MockSidebar />

          {/* Main content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Top bar */}
            <div className="bg-white border-b border-neutral-100 px-4 py-2.5 flex items-center justify-between">
              <div>
                <div className="text-[13px] font-bold text-neutral-900">Campaign Dashboard</div>
                <div className="text-[8.5px] text-neutral-400">01/03/2026 — 15/05/2026</div>
              </div>
              <div className="flex items-center gap-1.5">
                <button className="text-[8.5px] text-neutral-500 border border-neutral-200 rounded-md px-2 py-1">Bộ lọc</button>
                <button className="text-[8.5px] text-white bg-orange-500 rounded-md px-2.5 py-1 font-medium">⚡ Phân tích</button>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 p-3 overflow-hidden">
              {/* Stat cards */}
              <div className="grid grid-cols-3 gap-2 mb-2.5">
                <StatCard label="Tổng chiến dịch" value="24" sub="8 lượt chạy • 3 đang chạy" trend="12.5%" trendUp gradient="from-blue-500 to-blue-600"
                  chart={<Sparkline data={SPARK_CAMPAIGNS} color="#fff" />} />
                <StatCard label="Tổng gửi" value="12,840" sub="Email: 8.2K • Zalo: 3.1K • Group: 1.5K" trend="23.4%" trendUp gradient="from-indigo-500 to-indigo-600"
                  chart={<Sparkline data={SPARK_SENT} color="#fff" />} />
                <StatCard label="Email Open Rate" value="38.5%" sub="3,157 lượt mở" trend="4.2%" trendUp gradient="from-sky-500 to-cyan-500"
                  chart={<Sparkline data={SPARK_OPEN} color="#fff" />} />
              </div>
              <div className="grid grid-cols-3 gap-2 mb-2.5">
                <StatCard label="Click Rate" value="12.3%" sub="Email: 8.1% • Zalo: 18.5%" trend="2.1%" trendUp={false} gradient="from-violet-500 to-purple-600"
                  chart={<Sparkline data={[8,11,9,13,11,14,12,15,13]} color="#fff" />} />
                <StatCard label="Đơn chờ" value="47" sub="Email: 23 • Zalo: 18 • Group: 6" trend="8 hôm nay" trendUp gradient="from-orange-500 to-amber-500" />
                <StatCard label="Đã mua" value="189" sub="Doanh thu: 54.5 triệu" trend="31.2%" trendUp gradient="from-emerald-500 to-green-600"
                  chart={<Sparkline data={SPARK_REVENUE} color="#fff" />} />
              </div>

              {/* Chart + table row */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white rounded-xl p-3 border border-neutral-100">
                  <div className="text-[9.5px] font-semibold text-neutral-700 mb-0.5">Đơn hàng theo thời gian</div>
                  <div className="text-[8px] text-neutral-400 mb-2">Tổng hợp tất cả kênh</div>
                  <MiniBarChart data={EMAIL_DATA} color="#f97316" />
                </div>
                <div className="bg-white rounded-xl p-3 border border-neutral-100">
                  <div className="text-[9.5px] font-semibold text-neutral-700 mb-1.5">Chiến dịch gần đây</div>
                  <div className="flex flex-col gap-1">
                    {CAMPAIGNS.map((c) => (
                      <div key={c.name} className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="text-[8.5px] font-medium text-neutral-700 truncate">{c.name}</div>
                          <div className="text-[7.5px] text-neutral-400">{c.type} • {c.sent} gửi</div>
                        </div>
                        <StatusBadge status={c.status} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
