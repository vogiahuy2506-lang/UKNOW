import { HiOutlineCheck, HiOutlinePencil, HiOutlineTrash, HiOutlineUserAdd, HiOutlineLightningBolt, HiOutlineEye, HiOutlineEyeOff } from 'react-icons/hi';
import { fmtVnd, fmtEmp, fmtLimit } from './planUtils.jsx';

// ── PlanCard — gói đại trà ────────────────────────────────────────────────────
export const PlanCard = ({ plan, onEdit, onDelete, onAssign, onToggle }) => (
  <div className={`card p-5 flex flex-col gap-4 ${!plan.isActive ? 'opacity-60' : ''}`}>
    <div className="flex items-start justify-between gap-2">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-gray-900">{plan.name}</h3>
          {!plan.isActive && <span className="badge badge-gray text-xs">Ẩn</span>}
        </div>
        {plan.code && <p className="text-xs text-gray-400 mt-0.5">#{plan.code}</p>}
      </div>
      <p className="text-xl font-bold text-primary-600 shrink-0">{fmtVnd(plan.price)}</p>
    </div>

    <div className="flex items-center gap-4 text-sm text-gray-500">
      <span>{fmtEmp(plan.maxEmployees)}</span>
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
      <button onClick={() => onToggle(plan)} className="btn btn-secondary text-sm px-3" title={plan.isActive ? 'Ẩn gói' : 'Hiển thị gói'}>
        {plan.isActive ? <HiOutlineEyeOff className="w-4 h-4" /> : <HiOutlineEye className="w-4 h-4" />}
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
export const CustomPlanCard = ({ plan, onEdit, onDelete, onActivate }) => (
  <div className="card p-5 flex flex-col gap-4">
    <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shrink-0">
        <span className="text-white font-bold text-sm">
          {(plan.assignedName?.[0] || plan.assignedEmail?.[0] || '?').toUpperCase()}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        {plan.assignedName && <p className="text-sm font-semibold text-gray-800 truncate">{plan.assignedName}</p>}
        <p className="text-xs text-gray-400 truncate">{plan.assignedEmail ?? 'Chưa gán'}</p>
      </div>
      {plan.isActivated
        ? <span className="shrink-0 flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
            <HiOutlineCheck className="w-3 h-3" /> Đang dùng
          </span>
        : <span className="shrink-0 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
            Chờ kích hoạt
          </span>
      }
    </div>

    <div className="flex items-start justify-between gap-2">
      <h3 className="text-sm font-semibold text-gray-900">{plan.name}</h3>
      <p className="text-base font-bold text-primary-600 shrink-0">{fmtVnd(plan.price)}</p>
    </div>

    {plan.description && <p className="text-xs text-gray-400 italic -mt-2">{plan.description}</p>}

    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
      <span>Email/ngày: <strong className="text-gray-700">{fmtLimit(plan.dailyEmailLimit)}</strong></span>
      <span>Email/tháng: <strong className="text-gray-700">{fmtLimit(plan.monthlyEmailLimit)}</strong></span>
      <span>Zalo/ngày: <strong className="text-gray-700">{fmtLimit(plan.dailyZaloLimit)}</strong></span>
      <span>Zalo/tháng: <strong className="text-gray-700">{fmtLimit(plan.monthlyZaloLimit)}</strong></span>
      <span className="col-span-2">Nhân viên: <strong className="text-gray-700">{fmtEmp(plan.maxEmployees)}</strong></span>
    </div>

    <div className="flex items-center gap-2 pt-1 border-t border-gray-100 mt-auto">
      {!plan.isActivated && plan.assignedEmail && (
        <button
          onClick={() => onActivate(plan)}
          className="btn btn-primary text-sm px-3"
          title="Gán gói cho tài khoản này ngay, không cần chờ thanh toán"
        >
          <HiOutlineLightningBolt className="w-4 h-4 mr-1" />
          Kích hoạt
        </button>
      )}
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
