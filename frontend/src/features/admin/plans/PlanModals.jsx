import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';
import { HiOutlineDuplicate, HiOutlineCheck } from 'react-icons/hi';
import adminPlansApiService from '../services/adminPlansApi.service';
import { renderModal, emptyForm, fmtVnd, MODAL_SM, MODAL_PANEL } from './planUtils.jsx';
import { PriceInput, FeatureEditor, EmailAutocomplete, SendLimitsFields, EmployeeInput } from './PlanInputs';

// ── PlanFormModal — tạo mới + chỉnh sửa gói đại trà ─────────────────────────
export const PlanFormModal = ({ plan, onClose, onSaved }) => {
  const isEdit = !!plan?.id;
  const [form, setForm] = useState(plan ? {
    code: plan.code || '',
    name: plan.name || '',
    price: plan.price ?? 0,
    description: plan.description || '',
    maxEmployees: plan.max_employees ?? -1,
    isActive: plan.is_active ?? true,
    features: plan.features || [],
    dailyEmailLimit: plan.daily_email_limit ?? '',
    monthlyEmailLimit: plan.monthly_email_limit ?? '',
    dailyZaloLimit: plan.daily_zalo_limit ?? '',
    monthlyZaloLimit: plan.monthly_zalo_limit ?? '',
  } : emptyForm());
  const [isSaving, setIsSaving] = useState(false);
  const set = (key, val) => setForm((p) => ({ ...p, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Vui lòng nhập tên gói'); return; }
    try {
      setIsSaving(true);
      if (isEdit) {
        await adminPlansApiService.updatePlan(plan.id, form);
        toast.success('Cập nhật gói thành công');
      } else {
        await adminPlansApiService.createPlan(form);
        toast.success('Tạo gói thành công');
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Không thể lưu gói dịch vụ');
    } finally {
      setIsSaving(false);
    }
  };

  return renderModal(
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">{isEdit ? 'Chỉnh sửa gói' : 'Tạo gói mới'}</h2>

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Tên gói *</label>
          <input type="text" className="input w-full" value={form.name}
            onChange={(e) => set('name', e.target.value)} placeholder="Gói Pro" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mã gói (code)</label>
          <input type="text" className="input w-full" value={form.code}
            onChange={(e) => set('code', e.target.value)} placeholder="pro" disabled={isEdit} />
          {isEdit && <p className="text-xs text-gray-400 mt-1">Mã gói không thể thay đổi sau khi tạo.</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Giá (VNĐ) *</label>
          <PriceInput value={form.price} onChange={(v) => set('price', v)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Số nhân viên tối đa</label>
          <EmployeeInput value={form.maxEmployees} onChange={(v) => set('maxEmployees', v)} />
        </div>
        <div className="flex items-center gap-3 pt-5">
          <input type="checkbox" id="isActive" className="w-4 h-4 text-primary-600 rounded"
            checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} />
          <label htmlFor="isActive" className="text-sm text-gray-700 cursor-pointer">Hiển thị công khai</label>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
        <textarea rows={2} className="input w-full resize-none" value={form.description}
          onChange={(e) => set('description', e.target.value)} placeholder="Mô tả ngắn về gói..." />
      </div>

      <SendLimitsFields form={form} set={set} hint="Để trống = không giới hạn. Backend sẽ chặn khi vượt ngưỡng." />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Tính năng hiển thị <span className="font-normal text-gray-400">(trang pricing)</span>
        </label>
        <FeatureEditor features={form.features} onChange={(f) => set('features', f)} />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSaving}>Hủy</button>
        <button type="submit" className="btn btn-primary" disabled={isSaving}>
          {isSaving ? 'Đang lưu...' : isEdit ? 'Lưu thay đổi' : 'Tạo gói'}
        </button>
      </div>
    </form>,
    () => { if (!isSaving) onClose(); }
  );
};

// ── AssignModal — gán gói đại trà cho 1 user ─────────────────────────────────
export const AssignModal = ({ plan, onClose, onAssigned }) => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleAssign = async (e) => {
    e.preventDefault();
    if (!email.trim()) { toast.error('Vui lòng nhập email'); return; }
    try {
      setIsLoading(true);
      const res = await adminPlansApiService.assignPlan(plan.id, email.trim());
      toast.success(`Đã gán gói "${plan.name}" cho ${res.data.data.email}`);
      onAssigned();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Không thể gán gói');
    } finally {
      setIsLoading(false);
    }
  };

  return renderModal(
    <form onSubmit={handleAssign} className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Gán gói cho người dùng</h2>
        <p className="text-sm text-gray-500 mt-1">Gói: <strong>{plan.name}</strong> · {fmtVnd(plan.price)}</p>
      </div>
      <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
        Thao tác này sẽ gán gói trực tiếp, bỏ qua quy trình thanh toán.
      </p>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Email người dùng *</label>
        <EmailAutocomplete value={email} onChange={setEmail} />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isLoading}>Hủy</button>
        <button type="submit" className="btn btn-primary" disabled={isLoading}>
          {isLoading ? 'Đang xử lý...' : 'Xác nhận gán gói'}
        </button>
      </div>
    </form>,
    () => { if (!isLoading) onClose(); },
    MODAL_SM
  );
};

// ── CustomPlanEditModal — chỉnh sửa gói riêng (không có code / tính năng) ────
export const CustomPlanEditModal = ({ plan, onClose, onSaved }) => {
  const [form, setForm] = useState({
    name: plan.name || '',
    price: plan.price ?? 0,
    description: plan.description || '',
    maxEmployees: plan.max_employees ?? -1,
    dailyEmailLimit: plan.daily_email_limit ?? '',
    monthlyEmailLimit: plan.monthly_email_limit ?? '',
    dailyZaloLimit: plan.daily_zalo_limit ?? '',
    monthlyZaloLimit: plan.monthly_zalo_limit ?? '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const set = (key, val) => setForm((p) => ({ ...p, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Vui lòng nhập tên gói'); return; }
    try {
      setIsSaving(true);
      await adminPlansApiService.updatePlan(plan.id, { ...form, isActive: false, features: [] });
      toast.success('Cập nhật gói thành công');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Không thể lưu gói');
    } finally {
      setIsSaving(false);
    }
  };

  return renderModal(
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Chỉnh sửa gói riêng</h2>
        {plan.assigned_email && (
          <p className="text-sm text-gray-500 mt-1">Doanh nghiệp: <strong>{plan.assigned_name || plan.assigned_email}</strong></p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Tên gói</label>
          <input type="text" className="input w-full" value={form.name}
            onChange={(e) => set('name', e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Giá (VNĐ)</label>
          <PriceInput value={form.price} onChange={(v) => set('price', v)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Số nhân viên tối đa</label>
          <EmployeeInput value={form.maxEmployees} onChange={(v) => set('maxEmployees', v)} />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả / Ghi chú</label>
          <textarea rows={2} className="input w-full resize-none" placeholder="Ghi chú nội bộ..."
            value={form.description} onChange={(e) => set('description', e.target.value)} />
        </div>
      </div>

      <SendLimitsFields form={form} set={set} />

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSaving}>Hủy</button>
        <button type="submit" className="btn btn-primary" disabled={isSaving}>
          {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
        </button>
      </div>
    </form>,
    () => { if (!isSaving) onClose(); }
  );
};

// ── PaymentResultModal — hiển thị QR thanh toán sau khi tạo link PayOS ────────
const PaymentResultModal = ({ qrCode, checkoutUrl, orderCode, planName, userEmail, onClose }) => {
  const [qrImageUrl, setQrImageUrl] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (qrCode) {
      QRCode.toDataURL(qrCode, { width: 200, margin: 1 }).then(setQrImageUrl);
    }
  }, [qrCode]);

  const handleCopy = () => {
    navigator.clipboard.writeText(checkoutUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return renderModal(
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Link thanh toán đã sẵn sàng</h2>
        <p className="text-sm text-gray-500 mt-1">
          Gói <strong>{planName}</strong> — gửi QR hoặc link này cho <strong>{userEmail}</strong> qua Zalo.
        </p>
      </div>

      {/* QR code */}
      <div className="flex flex-col items-center gap-3">
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm w-52 h-52 flex items-center justify-center">
          {qrImageUrl
            ? <img src={qrImageUrl} alt="QR thanh toán" className="w-44 h-44 rounded-lg" />
            : <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
          }
        </div>
        <p className="text-xs text-gray-400 font-medium uppercase tracking-widest">Quét để thanh toán</p>
      </div>

      {/* Order code */}
      <div
        onClick={() => { navigator.clipboard.writeText(String(orderCode)); toast.success('Đã copy mã đơn hàng'); }}
        className="cursor-pointer flex items-center justify-between bg-orange-500 text-white rounded-xl px-4 py-3"
      >
        <div>
          <p className="text-[10px] font-bold text-orange-200 uppercase mb-0.5">Mã đơn hàng</p>
          <p className="font-bold text-lg">{orderCode}</p>
        </div>
        <HiOutlineDuplicate className="w-5 h-5 text-white/70" />
      </div>

      {/* Checkout URL */}
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={checkoutUrl}
          className="input flex-1 text-xs text-gray-500 truncate"
        />
        <button type="button" onClick={handleCopy} className={`btn shrink-0 ${copied ? 'btn-primary' : 'btn-secondary'}`}>
          {copied
            ? <><HiOutlineCheck className="w-4 h-4 mr-1" />Đã copy</>
            : <><HiOutlineDuplicate className="w-4 h-4 mr-1" />Copy link</>
          }
        </button>
      </div>

      <p className="text-xs text-gray-400">
        Hệ thống tự động kích hoạt gói cho <strong>{userEmail}</strong> sau khi thanh toán thành công.
      </p>

      <button type="button" className="btn btn-primary w-full" onClick={onClose}>Xong</button>
    </div>,
    onClose,
    MODAL_PANEL
  );
};

// ── CustomPlanModal — tạo gói riêng + gán ngay hoặc tạo link PayOS ───────────
export const CustomPlanModal = ({ onClose, onSaved }) => {
  const [form, setForm] = useState({
    userEmail: '', name: '', code: '', price: 0,
    description: '', maxEmployees: -1,
    dailyEmailLimit: '', monthlyEmailLimit: '',
    dailyZaloLimit: '', monthlyZaloLimit: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [paymentResult, setPaymentResult] = useState(null);
  const set = (key, val) => setForm((p) => ({ ...p, [key]: val }));

  const validate = () => {
    if (!form.userEmail.trim()) { toast.error('Vui lòng nhập email người dùng'); return false; }
    if (!form.name.trim()) { toast.error('Vui lòng nhập tên gói'); return false; }
    return true;
  };

  const handleCreatePaymentLink = async () => {
    if (!validate()) return;
    if (!form.price || form.price <= 0) { toast.error('Cần nhập giá tiền để tạo link thanh toán'); return; }
    try {
      setIsSaving(true);
      const res = await adminPlansApiService.createCustomPlanWithPayment(form);
      onSaved();
      setPaymentResult({ ...res.data.data, planName: form.name, userEmail: form.userEmail });
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Không thể tạo link thanh toán');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAssignDirect = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    try {
      setIsSaving(true);
      const res = await adminPlansApiService.createCustomPlan(form);
      toast.success(res.data.message);
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Không thể tạo gói riêng');
    } finally {
      setIsSaving(false);
    }
  };

  if (paymentResult) {
    return (
      <PaymentResultModal
        qrCode={paymentResult.qrCode}
        checkoutUrl={paymentResult.checkoutUrl}
        orderCode={paymentResult.orderCode}
        planName={paymentResult.planName}
        userEmail={paymentResult.userEmail}
        onClose={onClose}
      />
    );
  }

  return renderModal(
    <form onSubmit={handleAssignDirect} className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Tạo gói riêng cho doanh nghiệp</h2>
        <p className="text-sm text-gray-500 mt-1">Gói sẽ không xuất hiện trên trang pricing.</p>
      </div>

      <div className="bg-primary-50 rounded-lg p-4 space-y-2">
        <label className="block text-sm font-semibold text-gray-700">Email khách hàng *</label>
        <EmailAutocomplete value={form.userEmail} onChange={(v) => set('userEmail', v)} placeholder="customer@example.com" excludeWithPlan />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Tên gói *</label>
          <input type="text" className="input w-full" placeholder="VD: Gói Enterprise - Công ty ABC"
            value={form.name} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Giá (VNĐ)/Tháng</label>
          <PriceInput value={form.price} onChange={(v) => set('price', v)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Số nhân viên tối đa</label>
          <EmployeeInput value={form.maxEmployees} onChange={(v) => set('maxEmployees', v)} />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả / Ghi chú</label>
          <textarea rows={2} className="input w-full resize-none" placeholder="Ghi chú nội bộ..."
            value={form.description} onChange={(e) => set('description', e.target.value)} />
        </div>
      </div>

      <SendLimitsFields form={form} set={set} />

      <div className="flex flex-col gap-2 pt-2">
        <button
          type="button"
          onClick={handleCreatePaymentLink}
          disabled={isSaving}
          className="btn btn-primary w-full"
        >
          {isSaving ? 'Đang xử lý...' : 'Tạo link thanh toán'}
        </button>
        {/* <button type="submit" disabled={isSaving} className="btn btn-secondary w-full text-sm">
          Gán ngay (bỏ qua thanh toán)
        </button> */}
        <button type="button" className="btn btn-secondary w-full text-sm" onClick={onClose} disabled={isSaving}>
          Hủy
        </button>
      </div>
    </form>,
    () => { if (!isSaving) onClose(); }
  );
};
