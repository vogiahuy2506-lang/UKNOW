import { useCallback, useEffect, useState } from 'react';
import { HiOutlineFilter, HiOutlineRefresh } from 'react-icons/hi';
import adminFunnelApiService from '../../features/admin/services/adminFunnelApi.service';

const STEP_LABELS = [
  { key: 'registered', label: 'Đăng ký' },
  { key: 'channelConnected', label: 'Nối kênh' },
  { key: 'campaignCreated', label: 'Tạo chiến dịch' },
  { key: 'campaignRunStarted', label: 'Chạy chiến dịch đầu' },
  { key: 'paid', label: 'Trả tiền' },
];

const AdminFunnelPage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFunnelApiService.getOverview();
      setData(res?.data?.data || res?.data || null);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Không tải được phễu');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="card p-10 text-center text-gray-500">Đang tải phễu kích hoạt…</div>;
  if (error) {
    return (
      <div className="card p-10 text-center">
        <p className="text-red-500 mb-3">{error}</p>
        <button type="button" className="btn btn-primary" onClick={load}>Thử lại</button>
      </div>
    );
  }

  const steps = data?.steps || {};
  const conv = data?.conversionFromRegistered || {};
  const ttf = data?.timeToFirstSend || {};
  const max = Math.max(1, Number(steps.registered || 0));
  const fmtOrDash = (v, suffix = '') => (
    v == null || Number.isNaN(Number(v))
      ? '—'
      : `${Number(v).toLocaleString('vi-VN')}${suffix}`
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <HiOutlineFilter className="w-7 h-7 text-primary-600" />
            Phễu kích hoạt
          </h1>
          <p className="text-gray-500 mt-1">
            Đăng ký → nối kênh → tạo chiến dịch → chạy → trả tiền.
            {data?.dataSince && (
              <span className="block text-xs text-amber-700 mt-1">
                Dữ liệu từ {data.dataSince}. {data.note}
              </span>
            )}
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={load}>
          <HiOutlineRefresh className="w-4 h-4 mr-2" /> Làm mới
        </button>
      </div>

      <div className="card p-5">
        <div className="mb-4">
          <h2 className="font-semibold text-gray-800">Thời gian tới tin đầu tiên</h2>
          <p className="text-xs text-gray-500 mt-1">
            Trung vị phút từ đăng ký tới email/Zalo campaign gửi thành công đầu tiên.
            Mục tiêu &lt; 10 phút. Số liệu hiện chủ yếu tài khoản nội bộ/test.
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Trung vị</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{fmtOrDash(ttf.medianMinutes, ' phút')}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide">≤ 10 phút</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{fmtOrDash(ttf.pctUnder10, '%')}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Đã gửi</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{Number(ttf.sentCount || 0).toLocaleString('vi-VN')}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Tổng TK</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{Number(ttf.totalUsers || 0).toLocaleString('vi-VN')}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {STEP_LABELS.map((s) => {
          const n = Number(steps[s.key] || 0);
          const pct = Math.round((n / max) * 100);
          return (
            <div key={s.key} className="card p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">{s.label}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{n.toLocaleString('vi-VN')}</p>
              <p className="text-xs text-gray-400 mt-1">
                {s.key === 'registered' ? '100%' : `${conv[s.key] ?? pct}% từ đăng ký`}
              </p>
              <div className="mt-3 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full bg-primary-500" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Cohort theo tháng đăng ký</h2>
        </div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Cohort</th>
                <th className="text-right">Đăng ký</th>
                <th className="text-right">Nối kênh</th>
                <th className="text-right">Tạo chiến dịch</th>
                <th className="text-right">Trả tiền</th>
              </tr>
            </thead>
            <tbody>
              {(data?.cohorts || []).length === 0 && (
                <tr><td colSpan={5} className="text-center text-gray-400 py-8">Chưa có cohort</td></tr>
              )}
              {(data?.cohorts || []).map((c) => (
                <tr key={c.cohort}>
                  <td className="font-medium">{c.cohort}</td>
                  <td className="text-right">{c.registered}</td>
                  <td className="text-right">{c.channelConnected}</td>
                  <td className="text-right">{c.campaignCreated}</td>
                  <td className="text-right">{c.paid}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminFunnelPage;
