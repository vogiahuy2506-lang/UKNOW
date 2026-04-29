import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';

// ── Tooltip ───────────────────────────────────────────────────────────────────
const Tooltip = ({ label, children }) => (
  <div className="relative group inline-flex">
    {children}
    <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-20">
      {label}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
    </div>
  </div>
);
import {
  HiOutlineRefresh, HiOutlineSearch,
  HiOutlineLockClosed, HiOutlineLockOpen, HiOutlineShieldCheck,
  HiOutlineCurrencyDollar,
} from 'react-icons/hi';
import adminMembersApiService from '../../features/admin/services/adminMembersApi.service';
import adminPlansApiService from '../../features/admin/services/adminPlansApi.service';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('vi-VN') : '—';

const MODAL_OVERLAY = 'fixed inset-0 z-[9999] flex items-center justify-center p-4';
const MODAL_SM = 'relative z-10 w-full max-w-md rounded-xl bg-white shadow-xl p-6';
const MODAL_MD = 'relative z-10 w-full max-w-lg rounded-xl bg-white shadow-xl p-6';

const renderModal = (content, onClose, cls = MODAL_SM) =>
  createPortal(
    <div className={MODAL_OVERLAY}>
      <button type="button" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={cls}>{content}</div>
    </div>,
    document.body
  );

// ── AssignPlanModal ───────────────────────────────────────────────────────────
const AssignPlanModal = ({ member, plans, onClose, onDone }) => {
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleAssign = async () => {
    if (!selectedPlanId) { toast.error('Vui lòng chọn gói'); return; }
    try {
      setIsSaving(true);
      await adminPlansApiService.assignPlan(Number(selectedPlanId), member.email);
      toast.success('Gán gói thành công');
      onDone();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Không thể gán gói');
    } finally {
      setIsSaving(false);
    }
  };

  return renderModal(
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Gán gói dịch vụ</h2>
        <p className="text-sm text-gray-500 mt-1">
          Thành viên: <strong>{member.full_name || member.username}</strong> ({member.email})
        </p>
        {member.plan_name && (
          <p className="text-sm text-gray-400 mt-0.5">Gói hiện tại: <strong>{member.plan_name}</strong></p>
        )}
      </div>
      <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
        Thao tác này gán gói trực tiếp, bỏ qua quy trình thanh toán.
      </p>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Chọn gói *</label>
        <select className="input w-full" value={selectedPlanId} onChange={(e) => setSelectedPlanId(e.target.value)}>
          <option value="">-- Chọn gói --</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} {p.price > 0 ? `— ${Number(p.price).toLocaleString('vi-VN')} đ` : '— Miễn phí'}
              {!p.is_active ? ' (ẩn)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSaving}>Hủy</button>
        <button type="button" className="btn btn-primary" onClick={handleAssign} disabled={isSaving}>
          {isSaving ? 'Đang xử lý...' : 'Xác nhận gán'}
        </button>
      </div>
    </div>,
    () => { if (!isSaving) onClose(); },
    MODAL_MD
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
const AdminMembersPage = () => {
  const [members, setMembers]     = useState([]);
  const [plans, setPlans]         = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [search, setSearch]       = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');


  // Modals
  const [assignMember, setAssignMember]   = useState(null);
  const [promoteConfirm, setPromoteConfirm] = useState(null);
  const [isPromoting, setIsPromoting]     = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState(null);

  const fetchMembers = async () => {
    setIsLoading(true);
    try {
      const params = {};
      if (search)       params.search = search;
      if (planFilter)   params.planId = planFilter;
      if (statusFilter) params.status = statusFilter;
      const res = await adminMembersApiService.getMembers(params);
      setMembers(res.data.data || []);
    } catch {
      toast.error('Không thể tải danh sách thành viên');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPlans = async () => {
    try {
      const res = await adminPlansApiService.getPlans();
      setPlans(res.data.data || []);
    } catch { /* plans không bắt buộc */ }
  };

  useEffect(() => {
    fetchMembers();
    fetchPlans();
  }, []);

  // Re-fetch khi filter thay đổi (debounce không cần thiết ở đây vì có nút tìm kiếm)
  const handleSearch = (e) => {
    e.preventDefault();
    fetchMembers();
  };

  const handleToggleStatus = async (member) => {
    setActiveMenu(null);
    try {
      setStatusUpdatingId(member.id);
      await adminMembersApiService.toggleStatus(member.id);
      toast.success('Cập nhật trạng thái thành công');
      fetchMembers();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Không thể cập nhật trạng thái');
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const handlePromote = async () => {
    try {
      setIsPromoting(true);
      const res = await adminMembersApiService.promote(promoteConfirm.id);
      toast.success(res.data.message);
      setPromoteConfirm(null);
      fetchMembers();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Không thể nâng cấp tài khoản');
    } finally {
      setIsPromoting(false);
    }
  };


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quản lý thành viên</h1>
          <p className="text-gray-500 mt-1">Danh sách tất cả tài khoản user_admin trên hệ thống.</p>
        </div>
        <button type="button" onClick={() => { fetchMembers(); fetchPlans(); }} className="btn btn-secondary" disabled={isLoading}>
          <HiOutlineRefresh className="w-4 h-4 mr-2" />
          Làm mới
        </button>
      </div>

      {/* Filters — 1 hàng */}
      <div className="card p-3">
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <div className="flex flex-[2] min-w-0 items-center rounded-lg border border-gray-300 bg-white px-3 focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500">
            <HiOutlineSearch className="w-4 h-4 text-gray-400 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên, email..."
              className="flex-1 py-1.5 pl-2 text-sm border-0 bg-transparent focus:ring-0 focus:outline-none"
            />
          </div>
          <select
            className="input py-1.5 text-sm flex-1 min-w-0"
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
          >
            <option value="">Tất cả gói</option>
            <option value="none">Chưa có gói</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            className="input py-1.5 text-sm flex-1 min-w-0"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="active">Đang hoạt động</option>
            <option value="inactive">Đã khóa</option>
          </select>
          <button type="submit" className="btn btn-primary py-1.5 text-sm whitespace-nowrap shrink-0">Tìm kiếm</button>
        </form>
      </div>

      {/* Table */}
      <div className="card">
        {isLoading ? (
          <div className="h-56 flex items-center justify-center"><div className="spinner w-8 h-8" /></div>
        ) : members.length === 0 ? (
          <div className="py-16 text-center text-gray-400">Không tìm thấy thành viên nào.</div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Thành viên</th>
                  <th>Gói dịch vụ</th>
                  <th>Nhân viên</th>
                  <th>Trạng thái</th>
                  <th>Ngày đăng ký</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const isActive = m.status === 'active';
                  return (
                    <tr key={m.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                            <span className="text-primary-600 text-sm font-semibold">
                              {(m.full_name || m.username || '?')[0].toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{m.full_name || m.username}</p>
                            <p className="text-xs text-gray-400 truncate">{m.email}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        {m.plan_name
                          ? <span className="badge badge-success">{m.plan_name}</span>
                          : <span className="badge badge-gray">Chưa có gói</span>
                        }
                      </td>
                      <td className="text-sm text-gray-600">{m.employee_count ?? 0}</td>
                      <td>
                        <span className={`badge ${isActive ? 'badge-success' : 'badge-gray'}`}>
                          {isActive ? 'Hoạt động' : 'Đã khóa'}
                        </span>
                      </td>
                      <td className="text-sm text-gray-500">{fmtDate(m.created_at)}</td>
                      <td>
                        <div className="flex items-center gap-1">
                          {/* Gán gói */}
                          <Tooltip label="Gán gói dịch vụ">
                            <button
                              onClick={() => setAssignMember(m)}
                              className="p-2 rounded hover:bg-gray-100 transition-colors text-gray-500 hover:text-primary-600"
                            >
                              <HiOutlineCurrencyDollar className="w-5 h-5" />
                            </button>
                          </Tooltip>

                          {/* Khóa / Mở khóa */}
                          <Tooltip label={isActive ? 'Khóa tài khoản' : 'Mở khóa'}>
                            <button
                              onClick={() => handleToggleStatus(m)}
                              disabled={statusUpdatingId === m.id}
                              className={`p-2 rounded hover:bg-gray-100 transition-colors ${isActive ? 'text-yellow-500 hover:text-yellow-600' : 'text-green-500 hover:text-green-600'}`}
                            >
                              {statusUpdatingId === m.id
                                ? <div className="spinner w-5 h-5" />
                                : isActive
                                  ? <HiOutlineLockClosed className="w-5 h-5" />
                                  : <HiOutlineLockOpen className="w-5 h-5" />
                              }
                            </button>
                          </Tooltip>

                          {/* Nâng Super Admin */}
                          <Tooltip label="Nâng lên Super Admin">
                            <button
                              onClick={() => setPromoteConfirm(m)}
                              className="p-2 rounded hover:bg-purple-50 transition-colors text-gray-400 hover:text-purple-600"
                            >
                              <HiOutlineShieldCheck className="w-5 h-5" />
                            </button>
                          </Tooltip>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary */}
        {!isLoading && members.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 text-sm text-gray-400">
            {members.length} thành viên
          </div>
        )}
      </div>

      {/* Modal gán gói */}
      {assignMember && (
        <AssignPlanModal
          member={assignMember}
          plans={plans}
          onClose={() => setAssignMember(null)}
          onDone={fetchMembers}
        />
      )}

      {/* Modal confirm nâng super_admin */}
      {promoteConfirm && renderModal(
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
              <HiOutlineShieldCheck className="w-5 h-5 text-purple-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">Nâng lên Super Admin</h2>
          </div>
          <p className="text-sm text-gray-600">
            Bạn sắp nâng <strong>{promoteConfirm.full_name || promoteConfirm.username}</strong> ({promoteConfirm.email}) lên quyền <strong>Super Admin</strong>.
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Tài khoản này sẽ có toàn quyền quản trị hệ thống. Hành động này không thể hoàn tác qua giao diện.
          </p>
          <div className="flex justify-end gap-2 mt-6">
            <button type="button" className="btn btn-secondary" onClick={() => setPromoteConfirm(null)} disabled={isPromoting}>Hủy</button>
            <button
              type="button"
              className="btn btn-primary bg-purple-600 hover:bg-purple-700 border-purple-600"
              onClick={handlePromote}
              disabled={isPromoting}
            >
              {isPromoting ? 'Đang xử lý...' : 'Xác nhận nâng cấp'}
            </button>
          </div>
        </div>,
        () => { if (!isPromoting) setPromoteConfirm(null); }
      )}
    </div>
  );
};

export default AdminMembersPage;
