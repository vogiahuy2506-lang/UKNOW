import { useCallback, useEffect, useState } from 'react';
import { HiOutlineRefresh } from 'react-icons/hi';
import adminAlertsApiService from '../../features/admin/services/adminAlertsApi.service';

const fmtDate = (d) => (d ? new Date(d).toLocaleString('vi-VN') : '—');

const AdminCronStatusPanel = () => {
  const [latest, setLatest] = useState([]);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminAlertsApiService.getCronStatus({ limit: 40 });
      const data = res?.data?.data || res?.data || {};
      setLatest(data.latest || []);
      setRecent(data.recent || []);
    } catch (err) {
      setError(err?.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="card p-8 text-center text-gray-500">Đang tải cron…</div>;
  if (error) return <div className="card p-8 text-red-500">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button type="button" className="btn btn-secondary" onClick={load}>
          <HiOutlineRefresh className="w-4 h-4 mr-2" /> Làm mới
        </button>
      </div>
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 font-semibold">Lần chạy gần nhất theo job</div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Bắt đầu</th>
                <th>Kết thúc</th>
                <th>ms</th>
                <th>Status</th>
                <th>Kết quả</th>
              </tr>
            </thead>
            <tbody>
              {latest.length === 0 && (
                <tr><td colSpan={6} className="text-center text-gray-400 py-6">Chưa có dữ liệu cron</td></tr>
              )}
              {latest.map((r) => (
                <tr key={r.id}>
                  <td className="font-mono text-xs">{r.jobCode}</td>
                  <td className="text-sm whitespace-nowrap">{fmtDate(r.startedAt)}</td>
                  <td className="text-sm whitespace-nowrap">{fmtDate(r.finishedAt)}</td>
                  <td className="text-sm">{r.durationMs ?? '—'}</td>
                  <td>
                    <span className={`badge ${
                      r.status === 'failure' ? 'badge-danger'
                        : r.status === 'noop' ? 'badge-warning' : 'badge-success'
                    }`}>{r.status}</span>
                  </td>
                  <td className="text-xs text-gray-500 max-w-xs truncate">
                    {r.errorMessage || JSON.stringify(r.result || {})}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 font-semibold">Lịch sử gần đây</div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Thời điểm</th>
                <th>Status</th>
                <th>synced</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id}>
                  <td className="font-mono text-xs">{r.jobCode}</td>
                  <td className="text-sm">{fmtDate(r.startedAt)}</td>
                  <td className="text-sm">{r.status}</td>
                  <td className="text-sm">{r.result?.synced ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminCronStatusPanel;
