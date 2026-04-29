import { HiOutlineCheck, HiOutlinePencil, HiOutlineTrash, HiOutlineUserAdd } from 'react-icons/hi';
import { fmtVnd, fmtEmp, fmtLimit } from './planUtils.jsx';

// ── PlanCard — gói đại trà ────────────────────────────────────────────────────
export const PlanCard = ({ plan, onEdit, onDelete, onAssign }) => (
  <div className={`card p-5 flex flex-col gap-4 ${!plan.is_active ? 'opacity-60' : ''}`}>
    <div className="flex items-start justify-between gap-2">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-gray-900">{plan.name}</h3>
          {!plan.is_active && <span className="badge badge-gray text-xs">Ẩn</span>}
        </div>
        {plan.code && <p className="text-xs text-gray-400 mt-0.5">#{plan.code}</p>}
      </div>
      <p className="text-xl font-bold text-primary-600 shrink-0">{fmtVnd(plan.price)}</p>
    </div>

    <div className="flex items-center gap-4 text-sm text-gray-500">
      <span>{fmtEmp(plan.max_employees)}</span>
      <span className="text-gray-200">|</span>
      <span>{plan.user_count ?? 0} thành viên đang dùng</span>
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
        Chỉnh sửa
      </button>
      <button onClick={() => onAssign(plan)} className="btn btn-secondary text-sm px-3" title="Gán cho người dùng">
        <HiOutlineUserAdd className="w-4 h-4" />
      </button>
      <button onClick={() => onDelete(plan)} className="btn btn-secondary text-sm px-3 text-red-500 hover:bg-red-50" title="Xóa gói">
        <HiOutlineTrash className="w-4 h-4" />
      </button>
    </div>
  </div>
);

// ── CustomPlanCard — gói riêng doanh nghiệp ──────────────────────────────────
export const CustomPlanCard = ({ plan, onEdit, onDelete }) => (
  <div className="card p-5 flex flex-col gap-4">
    <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shrink-0">
        <span className="text-white font-bold text-sm">
          {(plan.assigned_name?.[0] || plan.assigned_email?.[0] || '?').toUpperCase()}
        </span>
      </div>
      <div className="min-w-0">
        {plan.assigned_name && <p className="text-sm font-semibold text-gray-800 truncate">{plan.assigned_name}</p>}
        <p className="text-xs text-gray-400 truncate">{plan.assigned_email ?? 'Chưa gán'}</p>
      </div>
    </div>

    <div className="flex items-start justify-between gap-2">
      <h3 className="text-sm font-semibold text-gray-900">{plan.name}</h3>
      <p className="text-base font-bold text-primary-600 shrink-0">{fmtVnd(plan.price)}</p>
    </div>

    {plan.description && <p className="text-xs text-gray-400 italic -mt-2">{plan.description}</p>}

    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
      <span>Email/ngày: <strong className="text-gray-700">{fmtLimit(plan.daily_email_limit)}</strong></span>
      <span>Email/tháng: <strong className="text-gray-700">{fmtLimit(plan.monthly_email_limit)}</strong></span>
      <span>Zalo/ngày: <strong className="text-gray-700">{fmtLimit(plan.daily_zalo_limit)}</strong></span>
      <span>Zalo/tháng: <strong className="text-gray-700">{fmtLimit(plan.monthly_zalo_limit)}</strong></span>
      <span className="col-span-2">Nhân viên: <strong className="text-gray-700">{fmtEmp(plan.max_employees)}</strong></span>
    </div>

    <div className="flex items-center gap-2 pt-1 border-t border-gray-100 mt-auto">
      <button onClick={() => onEdit(plan)} className="btn btn-secondary flex-1 text-sm">
        <HiOutlinePencil className="w-4 h-4 mr-1.5" />
        Chỉnh sửa
      </button>
      <button onClick={() => onDelete(plan)} className="btn btn-secondary text-sm px-3 text-red-500 hover:bg-red-50" title="Xóa gói">
        <HiOutlineTrash className="w-4 h-4" />
      </button>
    </div>
  </div>
);
