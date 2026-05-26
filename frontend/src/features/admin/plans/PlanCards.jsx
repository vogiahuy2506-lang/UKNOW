import { useI18n } from '../../../i18n';
import { HiOutlineCheck, HiOutlinePencil, HiOutlineTrash, HiOutlineUserAdd, HiOutlineLightningBolt, HiOutlineEye, HiOutlineEyeOff } from 'react-icons/hi';
import { fmtVnd, fmtEmp, fmtLimit } from './planUtils.jsx';

// ── PlanCard — gói đại trà ────────────────────────────────────────────────────
export const PlanCard = ({ plan, onEdit, onDelete, onAssign, onToggle }) => {
  const { t } = useI18n();
  return (
    <div className={`card p-5 flex flex-col gap-4 ${!plan.isActive ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-gray-900">{plan.name}</h3>
            {!plan.isActive && <span className="badge badge-gray text-xs">{t('plans.hiddenStatus')}</span>}
          </div>
          {plan.code && <p className="text-xs text-gray-400 mt-0.5">#{plan.code}</p>}
        </div>
        <p className="text-xl font-bold text-primary-600 shrink-0">{fmtVnd(plan.price)}</p>
      </div>

      <div className="flex items-center gap-4 text-sm text-gray-500">
        <span>{fmtEmp(plan.maxEmployees)}</span>
        <span className="text-gray-200">|</span>
        <span>{plan.user_count ?? 0} {t('plans.membersUsing')}</span>
      </div>

      {plan.features?.length > 0 && (
        <ul className="space-y-1">
          {plan.features.map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
              <HiOutlineCheck className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
              {f}
            </li>
          ))}
        </ul>
      )}

      {plan.description && <p className="text-xs text-gray-400 italic">{plan.description}</p>}

      <div className="flex items-center gap-2 pt-1 border-t border-gray-100 mt-auto">
        <button onClick={() => onEdit(plan)} className="btn btn-secondary flex-1 text-sm">
          <HiOutlinePencil className="w-4 h-4 mr-1.5" />
          {t('plans.edit')}
        </button>
        <button onClick={() => onToggle(plan)} className="btn btn-secondary text-sm px-3" title={plan.isActive ? t('plans.hidePlan') : t('plans.showPlanBack')}>
          {plan.isActive ? <HiOutlineEyeOff className="w-4 h-4" /> : <HiOutlineEye className="w-4 h-4" />}
        </button>
        <button onClick={() => onAssign(plan)} className="btn btn-secondary text-sm px-3" title={t('plans.assignToUser')}>
          <HiOutlineUserAdd className="w-4 h-4" />
        </button>
        <button onClick={() => onDelete(plan)} className="btn btn-secondary text-sm px-3 text-red-500 hover:bg-red-50" title={t('plans.deletePlan')}>
          <HiOutlineTrash className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// ── CustomPlanCard — gói riêng doanh nghiệp ──────────────────────────────────
// Hiển thị 3 trạng thái:
//   - Đã ẩn   (isActive === false)              — tag xám, card mờ, nút "Khôi phục"
//   - Đang dùng (isActivated && isActive)       — tag xanh
//   - Chờ kích hoạt (assigned chưa active plan) — tag vàng
export const CustomPlanCard = ({ plan, onEdit, onDelete, onActivate, onRestore }) => {
  const { t } = useI18n();
  const isHidden = plan.isActive === false;
  return (
    <div className={`card p-5 flex flex-col gap-4 transition-opacity ${isHidden ? 'opacity-60 bg-gray-50' : ''}`}>
      <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
          isHidden ? 'bg-gray-300' : 'bg-gradient-to-br from-orange-500 to-red-500'
        }`}>
          <span className="text-white font-bold text-sm">
            {(plan.assignedName?.[0] || plan.assignedEmail?.[0] || '?').toUpperCase()}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          {plan.assignedName && <p className="text-sm font-semibold text-gray-800 truncate">{plan.assignedName}</p>}
          <p className="text-xs text-gray-400 truncate">{plan.assignedEmail ?? t('adminMembers.noPlan')}</p>
        </div>
        {isHidden ? (
          <span className="shrink-0 flex items-center gap-1 text-xs font-medium text-gray-600 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">
            <HiOutlineEyeOff className="w-3 h-3" /> {t('plans.hiddenStatus')}
          </span>
        ) : plan.isActivated ? (
          <span className="shrink-0 flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
            <HiOutlineCheck className="w-3 h-3" /> {t('plans.activeStatus')}
          </span>
        ) : (
          <span className="shrink-0 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
            {t('plans.pendingStatus')}
          </span>
        )}
      </div>

      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">{plan.name}</h3>
        <p className="text-base font-bold text-primary-600 shrink-0">{fmtVnd(plan.price)}</p>
      </div>

      {plan.description && <p className="text-xs text-gray-400 italic -mt-2">{plan.description}</p>}

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
        <span>{t('plans.emailPerDay')}: <strong className="text-gray-700">{fmtLimit(plan.dailyEmailLimit)}</strong></span>
        <span>{t('plans.emailPerMonth')}: <strong className="text-gray-700">{fmtLimit(plan.monthlyEmailLimit)}</strong></span>
        <span>{t('plans.zaloPerDay')}: <strong className="text-gray-700">{fmtLimit(plan.dailyZaloLimit)}</strong></span>
        <span>{t('plans.zaloPerMonth')}: <strong className="text-gray-700">{fmtLimit(plan.monthlyZaloLimit)}</strong></span>
        <span className="col-span-2">{t('plans.employees')}: <strong className="text-gray-700">{fmtEmp(plan.maxEmployees)}</strong></span>
      </div>

      <div className="flex items-center gap-2 pt-1 border-t border-gray-100 mt-auto">
        {isHidden ? (
          <button
            onClick={() => onRestore?.(plan)}
            className="btn btn-secondary flex-1 text-sm text-green-600 hover:bg-green-50"
            title={t('plans.showPlan')}
          >
            <HiOutlineEye className="w-4 h-4 mr-1.5" />
            {t('plans.restore')}
          </button>
        ) : (
          <>
            {!plan.isActivated && plan.assignedEmail && (
              <button
                onClick={() => onActivate(plan)}
                className="btn btn-primary text-sm px-3"
                title={t('plans.assignNow')}
              >
                <HiOutlineLightningBolt className="w-4 h-4 mr-1" />
                {t('plans.activate')}
              </button>
            )}
            <button onClick={() => onEdit(plan)} className="btn btn-secondary flex-1 text-sm">
              <HiOutlinePencil className="w-4 h-4 mr-1.5" />
              {t('plans.edit')}
            </button>
            <button onClick={() => onDelete(plan)} className="btn btn-secondary text-sm px-3 text-red-500 hover:bg-red-50" title={t('plans.hideOrDelete')}>
              <HiOutlineTrash className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
