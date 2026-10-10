import { useI18n } from '../../../i18n';
import {
  formatAiCredits,
  formatCount,
  formatDateTimeVn,
  formatPeriodNote,
  formatRunningCampaigns,
  formatSentThisMonth,
} from '../utils/teamOverview.util';

/**
 * Khối "Hoạt động nhóm" của trang Nhân viên — PR-7 (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30).
 *
 * Bảng 5 cột, mọi số do backend tính bằng CÙNG định nghĩa với các màn khác (services/user/teamOverview.service.js):
 * dòng "Bạn" → từng nhân viên → "Khác" (chỉ khi có) → "Cả công ty" (in đậm, cộng khớp các dòng phía trên).
 *
 * @param {{ overview: null|{ aiCycle: null|{ end: string }, owner: object|null, employees: object[],
 *   other: object|null, company: object|null }, loading: boolean }} props
 */
const TeamActivityCard = ({ overview, loading }) => {
  const { t } = useI18n();
  const employees = Array.isArray(overview?.employees) ? overview.employees : [];

  // Khối chỉ có ý nghĩa khi chủ có nhân viên (đã chấp nhận): chưa có ai thì ẩn như trước.
  if (employees.length === 0 && !loading) return null;

  const rows = [];
  if (overview?.owner) rows.push({ key: 'owner', kind: 'owner', data: overview.owner });
  employees.forEach((employee) => rows.push({ key: `employee-${employee.id}`, kind: 'employee', data: employee }));
  if (overview?.other) rows.push({ key: 'other', kind: 'other', data: overview.other });
  if (overview?.company) rows.push({ key: 'company', kind: 'company', data: overview.company });

  return (
    <div className="card">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-gray-800 dark:text-dk-text">{t('employee.teamActivity')}</h2>
        <p className="text-xs text-gray-400 dark:text-dk-muted mt-0.5">{formatPeriodNote(overview?.aiCycle, t)}</p>
        <p className="text-xs text-gray-400 dark:text-dk-muted">{t('employee.teamActivityScope')}</p>
      </div>
      {loading ? (
        <div className="h-32 flex items-center justify-center"><div className="spinner w-6 h-6" /></div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>{t('employee.teamColEmployee')}</th>
                <th className="!text-center">{t('employee.teamColRunning')}</th>
                <th className="!text-center">{t('employee.teamColSent')}</th>
                <th className="!text-center">{t('employee.teamColAi')}</th>
                <th>{t('employee.lastActive')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ key, kind, data }) => (
                <TeamActivityRow key={key} kind={kind} data={data} t={t} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const EMPTY_CELL = <span className="text-gray-300 dark:text-dk-muted">—</span>;

function TeamActivityRow({ kind, data, t }) {
  const isTotal = kind === 'company';
  const hasPerson = kind === 'owner' || kind === 'employee';
  const lastActive = hasPerson ? formatDateTimeVn(data.lastActiveAt) : null;

  return (
    <tr
      data-testid={`team-row-${kind}`}
      className={isTotal ? 'bg-gray-50 dark:bg-dk-raised/60 font-semibold text-gray-900 dark:text-dk-text' : 'hover:bg-gray-50 dark:hover:bg-dk-strong'}
    >
      <td>
        {kind === 'owner' && <div className="font-medium text-gray-800 dark:text-dk-text">{t('employee.teamRowYou')}</div>}
        {kind === 'employee' && (
          <>
            <div className="font-medium text-gray-800 dark:text-dk-text">{data.fullName || data.username}</div>
            <div className="text-xs text-gray-400 dark:text-dk-muted">@{data.username}</div>
          </>
        )}
        {kind === 'other' && <div className="text-gray-600 dark:text-dk-text2">{t('employee.teamRowOther')}</div>}
        {isTotal && <div>{t('employee.teamRowCompany')}</div>}
      </td>
      <td className="text-center text-sm">
        {hasPerson ? (
          data.runningCampaigns > 0 ? (
            <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              {formatRunningCampaigns(data, t)}
            </span>
          ) : (
            <span className="text-gray-400 dark:text-dk-muted">{formatCount(0)}</span>
          )
        ) : EMPTY_CELL}
      </td>
      <td className={`text-center text-sm ${isTotal ? '' : 'text-gray-700 dark:text-dk-text'}`}>
        {formatSentThisMonth(data, t)}
      </td>
      <td className={`text-center text-sm ${isTotal ? '' : 'text-gray-700 dark:text-dk-text'}`}>
        {formatAiCredits(data)}
      </td>
      <td className="text-sm text-gray-500 dark:text-dk-text2">
        {hasPerson ? (lastActive || <span className="text-gray-300 dark:text-dk-muted">—</span>) : null}
      </td>
    </tr>
  );
}

export default TeamActivityCard;
