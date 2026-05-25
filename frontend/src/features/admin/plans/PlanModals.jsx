import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';
import { HiOutlineDuplicate, HiOutlineCheck } from 'react-icons/hi';
import adminPlansApiService from '../services/adminPlansApi.service';
import { renderModal, emptyForm, fmtVnd, MODAL_SM, MODAL_PANEL } from './planUtils.jsx';
import { PriceInput, FeatureEditor, EmailAutocomplete, SendLimitsFields, EmployeeInput, ResourceLimitsFields, DurationInput } from './PlanInputs';

// ── PlanFormModal — tạo mới + chỉnh sửa gói đại trà ─────────────────────────
export const PlanFormModal = ({ plan, onClose, onSaved }) => {
  const isEdit = !!plan?.id;
  const [form, setForm] = useState(plan ? {
    code: plan.code || '',
    name: plan.name || '',
    price: plan.price ?? 0,
    priceYearly: plan.priceYearly ?? '',
    description: plan.description || '',
    maxEmployees: plan.maxEmployees ?? -1,
    isActive: plan.isActive ?? true,
    features: plan.features || [],
    durationDays: plan.durationDays ?? '',
    dailyEmailLimit: plan.dailyEmailLimit ?? '',
    monthlyEmailLimit: plan.monthlyEmailLimit ?? '',
    dailyZaloLimit: plan.dailyZaloLimit ?? '',
    monthlyZaloLimit: plan.monthlyZaloLimit ?? '',
    maxLandingPages: plan.maxLandingPages ?? '',
    maxCampaigns: plan.maxCampaigns ?? '',
    maxZaloAccounts: plan.maxZaloAccounts ?? '',
    maxEmailAccounts: plan.maxEmailAccounts ?? '',
    maxEmailTemplates: plan.maxEmailTemplates ?? '',
    maxZaloTemplates: plan.maxZaloTemplates ?? '',
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Giá tháng (VNĐ) *</label>
          <PriceInput value={form.price} onChange={(v) => set('price', v)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Giá năm (VNĐ)</label>
          <PriceInput value={form.priceYearly || 0} onChange={(v) => set('priceYearly', v || '')} />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Thời hạn gói</label>
          <DurationInput value={form.durationDays} onChange={(v) => set('durationDays', v)} />
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

      <ResourceLimitsFields form={form} set={set} hint="Để trống = không giới hạn. Áp dụng ngay khi user được gán gói này." />

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
  const [email, setEmail]               = useState('');
  const [paymentMethod, setPaymentMethod] = useState('free');
  const [note, setNote]                 = useState('');
  const [isLoading, setIsLoading]       = useState(false);

  const handleAssign = async (e) => {
    e.preventDefault();
    if (!email.trim()) { toast.error('Vui lòng nhập email'); return; }
    try {
      setIsLoading(true);
      const res = await adminPlansApiService.assignPlan(plan.id, email.trim(), {
        paymentMethod,
        note: note.trim() || null,
      });
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
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Hình thức thanh toán *</label>
        <select className="input w-full" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
          <option value="free">Miễn phí / Demo (không tính doanh thu)</option>
          <option value="manual">Đã thu tiền ngoài (tính vào doanh thu)</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
        <input
          className="input w-full"
          placeholder="VD: Chuyển khoản MB Bank 12/05/2026..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
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
    priceYearly: plan.priceYearly ?? '',
    description: plan.description || '',
    maxEmployees: plan.maxEmployees ?? -1,
    durationDays: plan.durationDays ?? '',
    dailyEmailLimit: plan.dailyEmailLimit ?? '',
    monthlyEmailLimit: plan.monthlyEmailLimit ?? '',
    dailyZaloLimit: plan.dailyZaloLimit ?? '',
    monthlyZaloLimit: plan.monthlyZaloLimit ?? '',
    maxLandingPages: plan.maxLandingPages ?? '',
    maxCampaigns: plan.maxCampaigns ?? '',
    maxZaloAccounts: plan.maxZaloAccounts ?? '',
    maxEmailAccounts: plan.maxEmailAccounts ?? '',
    maxEmailTemplates: plan.maxEmailTemplates ?? '',
    maxZaloTemplates: plan.maxZaloTemplates ?? '',
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
        {plan.assignedEmail && (
          <p className="text-sm text-gray-500 mt-1">Doanh nghiệp: <strong>{plan.assignedName || plan.assignedEmail}</strong></p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Tên gói</label>
          <input type="text" className="input w-full" value={form.name}
            onChange={(e) => set('name', e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Giá tháng (VNĐ)</label>
          <PriceInput value={form.price} onChange={(v) => set('price', v)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Giá năm (VNĐ)</label>
          <PriceInput value={form.priceYearly || 0} onChange={(v) => set('priceYearly', v || '')} />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Thời hạn gói</label>
          <DurationInput value={form.durationDays} onChange={(v) => set('durationDays', v)} />
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

      <ResourceLimitsFields form={form} set={set} hint="Để trống = không giới hạn. Áp dụng ngay khi user được gán gói này." />

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
const PaymentResultModal = ({ qrCode, checkoutUrl, orderCode, planName, userEmail, onClose, onPaid }) => {
  const [qrImageUrl, setQrImageUrl] = useState(null);
  const [copied, setCopied] = useState(false);
  // Trạng thái đơn hàng được poll từ backend: pending | success | cancelled
  const [paymentStatus, setPaymentStatus] = useState('pending');

  useEffect(() => {
    if (qrCode) {
      QRCode.toDataURL(qrCode, { width: 200, margin: 1 }).then(setQrImageUrl);
    }
  }, [qrCode]);

  // Polling mỗi 3s để biết khách đã thanh toán hay chưa
  useEffect(() => {
    if (!orderCode || paymentStatus !== 'pending') return;
    const intervalId = setInterval(async () => {
      try {
        const res = await fetch(`/api/payments/status/${orderCode}`);
        const data = await res.json();
        if (data.status === 'success') {
          setPaymentStatus('success');
          toast.success(`Khách hàng ${userEmail} đã thanh toán thành công!`, { duration: 6000 });
          onPaid?.();
        } else if (data.status === 'cancelled') {
          setPaymentStatus('cancelled');
          toast.error('Khách hàng đã huỷ giao dịch');
        }
      } catch {
        // Bỏ qua lỗi mạng tạm thời, tiếp tục poll
      }
    }, 3000);
    return () => clearInterval(intervalId);
  }, [orderCode, paymentStatus, userEmail, onPaid]);

  const handleCopy = () => {
    navigator.clipboard.writeText(checkoutUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const isPaid = paymentStatus === 'success';
  const isCancelled = paymentStatus === 'cancelled';

  return renderModal(
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">
          {isPaid ? 'Đã thanh toán thành công' : isCancelled ? 'Giao dịch đã huỷ' : 'Link thanh toán đã sẵn sàng'}
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Gói <strong>{planName}</strong> — {isPaid
            ? <>đã kích hoạt cho <strong>{userEmail}</strong>.</>
            : <>gửi QR hoặc link này cho <strong>{userEmail}</strong> qua Zalo.</>}
        </p>
      </div>

      {/* Trạng thái polling — chỉ hiện khi chưa thanh toán */}
      {!isPaid && !isCancelled && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-700">
          <div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <span>Đang chờ khách hàng thanh toán… (tự cập nhật mỗi 3s)</span>
        </div>
      )}

      {isPaid && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-3 text-sm text-green-700">
          <HiOutlineCheck className="w-5 h-5 shrink-0" />
          <span>Gói đã được gán cho khách hàng. Đóng modal này để xem lại trong danh sách gói.</span>
        </div>
      )}

      {/* QR code — chỉ hiện khi chưa thanh toán */}
      {!isPaid && (
        <div className="flex flex-col items-center gap-3">
          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm w-52 h-52 flex items-center justify-center">
            {qrImageUrl
              ? <img src={qrImageUrl} alt="QR thanh toán" className="w-44 h-44 rounded-lg" />
              : <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
            }
          </div>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-widest">Quét để thanh toán</p>
        </div>
      )}

      {/* Order code */}
      <div
        onClick={() => { navigator.clipboard.writeText(String(orderCode)); toast.success('Đã copy mã đơn hàng'); }}
        className={`cursor-pointer flex items-center justify-between text-white rounded-xl px-4 py-3 ${
          isPaid ? 'bg-green-600' : isCancelled ? 'bg-gray-500' : 'bg-orange-500'
        }`}
      >
        <div>
          <p className="text-[10px] font-bold text-white/70 uppercase mb-0.5">Mã đơn hàng</p>
          <p className="font-bold text-lg">{orderCode}</p>
        </div>
        <HiOutlineDuplicate className="w-5 h-5 text-white/70" />
      </div>

      {/* Checkout URL — chỉ hiện khi chưa thanh toán */}
      {!isPaid && (
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
      )}

      <button type="button" className={`btn w-full ${isPaid ? 'btn-primary bg-green-600 hover:bg-green-700 border-green-600' : 'btn-primary'}`} onClick={onClose}>
        {isPaid ? 'Đóng' : 'Đóng (tiếp tục chờ ở background)'}
      </button>
    </div>,
    onClose,
    MODAL_PANEL
  );
};

// ── CustomPlanModal — tạo gói riêng + gán ngay hoặc tạo link PayOS ───────────
export const CustomPlanModal = ({ onClose, onSaved }) => {
  const [form, setForm] = useState({
    userEmail: '', name: '', code: '', price: 0, priceYearly: '',
    description: '', maxEmployees: -1,
    durationDays: '',
    dailyEmailLimit: '', monthlyEmailLimit: '',
    dailyZaloLimit: '', monthlyZaloLimit: '',
    maxLandingPages: '', maxCampaigns: '',
    maxZaloAccounts: '', maxEmailAccounts: '',
    maxEmailTemplates: '', maxZaloTemplates: '',
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
        onPaid={onSaved}
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Giá năm (VNĐ)</label>
          <PriceInput value={form.priceYearly || 0} onChange={(v) => set('priceYearly', v || '')} />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Thời hạn gói</label>
          <DurationInput value={form.durationDays} onChange={(v) => set('durationDays', v)} />
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

      <ResourceLimitsFields form={form} set={set} hint="Để trống = không giới hạn. Áp dụng ngay khi user được gán gói này." />

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
