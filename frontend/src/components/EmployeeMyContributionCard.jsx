import { useEffect, useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import userManagementApiService from '../../features/users/services/userManagementApi.service';

/**
 * D4 — nhân viên xem số của chính mình (không thấy người khác).
 */
const EmployeeMyContributionCard = () => {
  const user = useAuthStore((s) => s.user);
  const isEmployee = user?.activeContext?.type === 'employee' || user?.role === 'employee';
  const [data, setData] = useState(undefined);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isEmployee) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await userManagementApiService.getMyContribution();
        if (!cancelled) setData(res?.data?.data ?? res?.data ?? null);
      } catch (err) {
        if (!cancelled) setError(err?.response?.data?.message || err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [isEmployee]);

  if (!isEmployee) return null;
  if (error) {
    return (
      <div className="card p-4 text-sm text-red-500">{error}</div>
    );
  }
  if (data === undefined) {
    return <div className="card p-4 text-sm text-gray-400">Đang tải tiến độ của bạn…</div>;
  }
  if (!data) return null;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-base font-semibold text-gray-800">Tiến độ của bạn (tháng này)</h2>
        <span className="text-[10px] text-amber-600">Theo người tạo chiến dịch</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div>
          <p className="text-gray-500">Chiến dịch đang chạy</p>
          <p className="text-xl font-bold text-gray-900">{data.runningCampaigns ?? 0}</p>
        </div>
        <div>
          <p className="text-gray-500">Tỉ lệ thành công</p>
          <p className="text-xl font-bold text-gray-900">
            {data.successRate != null ? `${data.successRate}%` : '—'}
          </p>
        </div>
        <div>
          <p className="text-gray-500">Mẫu đã soạn</p>
          <p className="text-xl font-bold text-gray-900">{data.templatesThisMonth ?? 0}</p>
        </div>
        <div>
          <p className="text-gray-500">Tín dụng AI</p>
          <p className="text-xl font-bold text-gray-900">{data.aiCreditsThisMonth ?? 0}</p>
        </div>
      </div>
    </div>
  );
};

export default EmployeeMyContributionCard;
