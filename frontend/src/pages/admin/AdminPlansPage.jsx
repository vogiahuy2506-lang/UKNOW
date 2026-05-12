import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { HiOutlinePlus, HiOutlineRefresh, HiOutlineSparkles } from 'react-icons/hi';
import adminPlansApiService from '../../features/admin/services/adminPlansApi.service';
import { renderModal, MODAL_SM } from '../../features/admin/plans/planUtils.jsx';
import { PlanCard, CustomPlanCard } from '../../features/admin/plans/PlanCards';
import { PlanFormModal, AssignModal, CustomPlanModal, CustomPlanEditModal } from '../../features/admin/plans/PlanModals';

const SkeletonGrid = () => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
    {[...Array(3)].map((_, i) => <div key={i} className="card p-5 h-52 animate-pulse bg-gray-50" />)}
  </div>
);

const AdminPlansPage = () => {
  const [tab, setTab]                 = useState('public');
  const [plans, setPlans]             = useState([]);
  const [customPlans, setCustomPlans] = useState([]);
  const [isLoading, setIsLoading]     = useState(true);
  const [editPlan, setEditPlan]       = useState(null);
  const [assignPlan, setAssignPlan]   = useState(null);
  const [deletePlan, setDeletePlan]   = useState(null);
  const [isDeleting, setIsDeleting]   = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [showHidden, setShowHidden]           = useState(false);

  const fetchPlans = async () => {
    setIsLoading(true);
    try {
      const res = await adminPlansApiService.getPlans();
      setPlans(res.data.data || []);
    } catch { toast.error('Không thể tải danh sách gói dịch vụ'); }
    finally { setIsLoading(false); }
  };

  const fetchCustomPlans = async (hidden = showHidden) => {
    setIsLoading(true);
    try {
      const res = await adminPlansApiService.getCustomPlans(hidden);
      setCustomPlans(res.data.data || []);
    } catch { toast.error('Không thể tải danh sách gói riêng'); }
    finally { setIsLoading(false); }
  };

  useEffect(() => {
    if (tab === 'public') fetchPlans();
    else fetchCustomPlans(showHidden);
  }, [tab, showHidden]);

  const handleRefresh = () => tab === 'public' ? fetchPlans() : fetchCustomPlans();

  const handleActivate = async (plan) => {
    if (!plan.assignedEmail) return;
    try {
      await adminPlansApiService.assignPlan(plan.id, plan.assignedEmail);
      toast.success(`Đã kích hoạt gói "${plan.name}" cho ${plan.assignedEmail}`);
      fetchCustomPlans();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Không thể kích hoạt gói');
    }
  };

  const handleToggleVisibility = async (plan) => {
    try {
      await adminPlansApiService.updatePlan(plan.id, {
        name: plan.name,
        price: parseInt(plan.price, 10),
        description: plan.description,
        features: plan.features || [],
        maxEmployees: parseInt(plan.maxEmployees ?? 0, 10),
        isActive: !plan.isActive,
        dailyEmailLimit: plan.dailyEmailLimit ?? null,
        monthlyEmailLimit: plan.monthlyEmailLimit ?? null,
        dailyZaloLimit: plan.dailyZaloLimit ?? null,
        monthlyZaloLimit: plan.monthlyZaloLimit ?? null,
      });
      toast.success(plan.isActive ? 'Đã ẩn gói dịch vụ' : 'Đã hiển thị gói dịch vụ');
      fetchPlans();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Không thể cập nhật trạng thái gói');
    }
  };

  const handleRestore = async (plan) => {
    try {
      await adminPlansApiService.updatePlan(plan.id, {
        name: plan.name,
        price: parseInt(plan.price, 10),
        description: plan.description,
        features: plan.features || [],
        maxEmployees: parseInt(plan.maxEmployees ?? 0, 10),
        isActive: true,
        dailyEmailLimit: plan.dailyEmailLimit ?? null,
        monthlyEmailLimit: plan.monthlyEmailLimit ?? null,
        dailyZaloLimit: plan.dailyZaloLimit ?? null,
        monthlyZaloLimit: plan.monthlyZaloLimit ?? null,
      });
      toast.success(`Đã khôi phục gói "${plan.name}"`);
      fetchCustomPlans();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Không thể khôi phục gói');
    }
  };

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      const res = await adminPlansApiService.deletePlan(deletePlan.id);
      const data = res?.data;
      const isSoftDelete = data?.data?.mode === 'soft';
      const message = data?.message || (isSoftDelete ? 'Đã ẩn gói' : 'Đã xóa gói dịch vụ');
      if (isSoftDelete) {
        toast(message, { icon: 'ℹ️', duration: 5000 });
      } else {
        toast.success(message);
      }
      setDeletePlan(null);
      handleRefresh();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Không thể xóa gói');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quản lý gói dịch vụ</h1>
          <p className="text-gray-500 mt-1">Chỉnh sửa giá, hạn mức và tính năng các gói.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleRefresh} className="btn btn-secondary" disabled={isLoading}>
            <HiOutlineRefresh className="w-4 h-4 mr-2" />
            Làm mới
          </button>
          {tab === 'custom' ? (
            <button type="button" onClick={() => setShowCustomModal(true)} className="btn btn-primary">
              <HiOutlineSparkles className="w-4 h-4 mr-2" />
              Tạo gói riêng
            </button>
          ) : (
            <button type="button" onClick={() => setEditPlan('new')} className="btn btn-primary">
              <HiOutlinePlus className="w-4 h-4 mr-2" />
              Tạo gói mới
            </button>
          )}
        </div>
      </div>

      {/* Toggle tabs */}
      <div className="flex bg-gray-100 rounded-lg p-1 w-fit">
        {[
          { key: 'public', label: 'Gói đại trà' },
          { key: 'custom', label: 'Gói riêng doanh nghiệp', count: customPlans.length },
        ].map(({ key, label, count }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-5 py-2 rounded-md text-sm font-medium transition-all ${tab === key ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {label}
            {count > 0 && (
              <span className="ml-2 text-xs bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded-full">
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab: Gói đại trà */}
      {tab === 'public' && (
        isLoading ? <SkeletonGrid /> :
        plans.length === 0 ? (
          <div className="card p-10 text-center text-gray-400">Chưa có gói dịch vụ nào.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {plans.map((plan) => (
              <PlanCard key={plan.id} plan={plan}
                onEdit={(p)   => setEditPlan(p)}
                onDelete={(p) => setDeletePlan(p)}
                onAssign={(p) => setAssignPlan(p)}
                onToggle={(p) => handleToggleVisibility(p)}
              />
            ))}
          </div>
        )
      )}

      {/* Tab: Gói riêng */}
      {tab === 'custom' && (
        <>
          <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
            <input
              type="checkbox"
              className="w-4 h-4 text-primary-600 rounded"
              checked={showHidden}
              onChange={(e) => setShowHidden(e.target.checked)}
            />
            <span className="text-sm text-gray-500">Hiện gói đã ẩn</span>
          </label>
          {isLoading ? <SkeletonGrid /> :
          customPlans.length === 0 ? (
            <div className="card p-10 text-center text-gray-400">
              <p>Chưa có gói riêng nào.</p>
              <button type="button" onClick={() => setShowCustomModal(true)} className="btn btn-primary mt-4">
                <HiOutlineSparkles className="w-4 h-4 mr-2" />
                Tạo gói riêng đầu tiên
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {customPlans.map((plan) => (
                <CustomPlanCard key={plan.id} plan={plan}
                  onEdit={(p)     => setEditPlan(p)}
                  onDelete={(p)   => setDeletePlan(p)}
                  onActivate={(p) => handleActivate(p)}
                  onRestore={(p)  => handleRestore(p)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {showCustomModal && (
        <CustomPlanModal onClose={() => setShowCustomModal(false)} onSaved={fetchCustomPlans} />
      )}
      {editPlan && (
        editPlan !== 'new' && editPlan.is_custom
          ? <CustomPlanEditModal plan={editPlan} onClose={() => setEditPlan(null)} onSaved={handleRefresh} />
          : <PlanFormModal plan={editPlan === 'new' ? null : editPlan} onClose={() => setEditPlan(null)} onSaved={handleRefresh} />
      )}
      {assignPlan && (
        <AssignModal plan={assignPlan} onClose={() => setAssignPlan(null)} onAssigned={fetchPlans} />
      )}
      {deletePlan && renderModal(
        (() => {
          const isCustom = deletePlan.isCustom ?? deletePlan.is_custom;
          const hasUsers = (deletePlan.user_count > 0) || !!deletePlan.assignedEmail;
          return (
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Xác nhận xoá gói</h2>
              <p className="text-sm text-gray-600 mt-2">
                Xoá gói <strong>{deletePlan.name}</strong>?
              </p>

              {isCustom && hasUsers && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm">
                  <p className="font-medium text-red-700">Gói riêng — sẽ <u>chấm dứt</u> với khách hàng</p>
                  <p className="text-red-600 mt-1">
                    {deletePlan.assignedEmail
                      ? <>Khách <strong>{deletePlan.assignedEmail}</strong> sẽ bị gỡ gói ngay lập tức và mất quyền dùng dịch vụ.</>
                      : <>{deletePlan.user_count} khách đang dùng sẽ bị gỡ gói.</>}
                  </p>
                  <p className="text-gray-500 italic text-xs mt-2">
                    Lịch sử đơn hàng vẫn được giữ để đối soát.
                  </p>
                </div>
              )}

              {!isCustom && hasUsers && (
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
                  <p className="font-medium text-amber-700">Gói đại trà — vẫn cho khách cũ dùng tiếp</p>
                  <p className="text-amber-600 mt-1">
                    {deletePlan.user_count > 0 && <>{deletePlan.user_count} khách đang dùng vẫn được phục vụ đến hết kỳ.</>}
                    {' '}Khách mới sẽ không còn thấy gói này trên trang Bảng giá.
                  </p>
                </div>
              )}

              {!hasUsers && (
                <p className="text-xs text-gray-400 italic mt-2">
                  Chưa có khách dùng — gói sẽ bị <strong>xoá vĩnh viễn</strong>.
                </p>
              )}

              <div className="flex justify-end gap-2 mt-6">
                <button type="button" className="btn btn-secondary" onClick={() => setDeletePlan(null)} disabled={isDeleting}>Hủy</button>
                <button type="button"
                  className="btn btn-primary bg-red-600 hover:bg-red-700 border-red-600"
                  onClick={handleDelete} disabled={isDeleting}
                >
                  {isDeleting ? 'Đang xoá...' : (isCustom && hasUsers ? 'Xoá & chấm dứt' : 'Xác nhận xoá')}
                </button>
              </div>
            </div>
          );
        })(),
        () => { if (!isDeleting) setDeletePlan(null); },
        MODAL_SM
      )}
    </div>
  );
};

export default AdminPlansPage;
