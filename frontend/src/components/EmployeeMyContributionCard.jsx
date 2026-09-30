import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useI18n } from '../i18n';
import userManagementApiService from '../features/users/services/userManagementApi.service';
import {
  formatAiCredits,
  formatPeriodNote,
  formatRunningCampaigns,
  formatSentThisMonth,
} from '../features/users/utils/teamOverview.util';

/**
 * D4 — nhân viên xem số của chính mình (không thấy người khác).
 *
 * PR-7 (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30): đây chính là dòng của nhân viên trong bảng "Hoạt động nhóm" của chủ —
 * cùng hàm backend, cùng định nghĩa, cùng hàm định dạng (features/users/utils/teamOverview.util.js).
 */
const EmployeeMyContributionCard = () => {
  const { t } = useI18n();
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
        // Phong bì { success, data }: `data: null` nghĩa là chưa thuộc nhóm nào → ẩn thẻ (không rơi về cả phong bì rồi
        // hiện toàn số 0). Không có khoá `data` thì coi cả body là dữ liệu (backend cũ).
        const body = res?.data;
        const payload = body && Object.prototype.hasOwnProperty.call(body, 'data') ? body.data : body;
        if (!cancelled) setData(payload ?? null);
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
    return <div className="card p-4 text-sm text-gray-400">{t('employee.myContribution.loading')}</div>;
  }
  if (!data) return null;

  return (
    <div className="card p-5">
      <div className="mb-3">
        <h2 className="text-base font-semibold text-gray-800">{t('employee.myContribution.title')}</h2>
        <p className="text-xs text-gray-400 mt-0.5">{formatPeriodNote(data.aiCycle, t)}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-gray-500">{t('employee.teamColRunning')}</p>
          <p className="text-xl font-bold text-gray-900">{formatRunningCampaigns(data, t)}</p>
        </div>
        <div>
          <p className="text-gray-500">{t('employee.teamColSent')}</p>
          <p className="text-xl font-bold text-gray-900">{formatSentThisMonth(data, t)}</p>
        </div>
        <div>
          <p className="text-gray-500">{t('employee.teamColAi')}</p>
          <p className="text-xl font-bold text-gray-900">{formatAiCredits(data)}</p>
        </div>
      </div>
    </div>
  );
};

export default EmployeeMyContributionCard;
