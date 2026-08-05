import { useCallback, useEffect, useState } from 'react';
import { HiOutlineBell, HiOutlineCheck, HiOutlineRefresh } from 'react-icons/hi';
import adminAlertsApiService from '../../features/admin/services/adminAlertsApi.service';

const fmtDate = (d) => (d ? new Date(d).toLocaleString('vi-VN') : '—');

const AdminAlertsPage = () => {
  const [rules, setRules] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminAlertsApiService.getOverview();
      const data = res?.data?.data || res?.data || {};
      setRules(data.rules || []);
      setEvents(data.events || []);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Không tải được cảnh báo');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleRule = async (rule) => {
    setBusyId(rule.id);
    try {
      await adminAlertsApiService.updateRule(rule.id, { enabled: !rule.enabled });
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err.message);
    } finally {
      setBusyId(null);
    }
  };

  const resolve = async (eventId) => {
    setBusyId(eventId);
    try {
      await adminAlertsApiService.resolveEvent(eventId);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err.message);
    } finally {
      setBusyId(null);
    }
  };

  const runNow = async () => {
    setBusyId('eval');
    try {
      await adminAlertsApiService.evaluateNow();
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err.message);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <div className="card p-10 text-center text-gray-500">Đang tải trung tâm cảnh báo…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <HiOutlineBell className="w-7 h-7 text-primary-600" />
            Trung tâm cảnh báo
          </h1>
          <p className="text-gray-500 mt-1">Quy tắc tự động + lịch sử đã bắn. Kênh gửi: email.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn btn-secondary" onClick={load}>
            <HiOutlineRefresh className="w-4 h-4 mr-2" /> Làm mới
          </button>
          <button type="button" className="btn btn-primary" onClick={runNow} disabled={busyId === 'eval'}>
            Chạy đánh giá ngay
          </button>
        </div>
      </div>

      {error && <div className="card p-4 text-red-600 text-sm">{error}</div>}

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Quy tắc</h2>
        </div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Mã</th>
                <th>Tên</th>
                <th>Ngưỡng</th>
                <th>Cửa sổ</th>
                <th>Mức</th>
                <th>Kênh</th>
                <th>Bật</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td className="text-xs font-mono text-gray-500">{r.code}</td>
                  <td>
                    <div className="font-medium text-gray-800">{r.name}</div>
                    <div className="text-xs text-gray-400 max-w-md">{r.description}</div>
                  </td>
                  <td className="text-sm">{r.thresholdValue ?? '—'}</td>
                  <td className="text-sm">{r.windowMinutes ? `${r.windowMinutes}p` : '—'}</td>
                  <td>
                    <span className={`badge ${r.severity === 'critical' ? 'badge-danger' : 'badge-warning'}`}>
                      {r.severity}
                    </span>
                  </td>
                  <td className="text-sm">{r.channel}</td>
                  <td>
                    <button
                      type="button"
                      className={`btn btn-sm ${r.enabled ? 'btn-primary' : 'btn-secondary'}`}
                      disabled={busyId === r.id}
                      onClick={() => toggleRule(r)}
                    >
                      {r.enabled ? 'Bật' : 'Tắt'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Lịch sử đã bắn</h2>
        </div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Thời điểm</th>
                <th>Quy tắc</th>
                <th>Giá trị</th>
                <th>Nội dung</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 && (
                <tr><td colSpan={5} className="text-center text-gray-400 py-8">Chưa có sự kiện</td></tr>
              )}
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="text-sm whitespace-nowrap">{fmtDate(e.firedAt)}</td>
                  <td className="text-sm font-medium">{e.ruleName}</td>
                  <td className="text-sm">{e.measuredValue ?? '—'}</td>
                  <td className="text-sm text-gray-600 max-w-lg">{e.message}</td>
                  <td>
                    {e.resolved ? (
                      <span className="badge badge-success">Đã xử lý</span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        disabled={busyId === e.id}
                        onClick={() => resolve(e.id)}
                      >
                        <HiOutlineCheck className="w-4 h-4 mr-1" /> Đánh dấu xử lý
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminAlertsPage;
