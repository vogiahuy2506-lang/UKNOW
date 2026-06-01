import { useState } from 'react';
import toast from 'react-hot-toast';
import adminPlansApiService from '../services/adminPlansApi.service';
import { renderModal, fmtVnd, MODAL_SM } from './planUtils.jsx';
import { EmailAutocomplete } from './PlanInputs';
import { useI18n } from '../../../i18n';

// ── AssignModal — gán gói đại trà cho 1 user ─────────────────────────────────
export const AssignModal = ({ plan, onClose, onAssigned }) => {
  const { t } = useI18n();
  const [email, setEmail]               = useState('');
  const [paymentMethod, setPaymentMethod] = useState('free');
  const [note, setNote]                 = useState('');
  const [isLoading, setIsLoading]       = useState(false);

  const handleAssign = async (e) => {
    e.preventDefault();
    if (!email.trim()) { toast.error(t('adminMembers.emailRequired')); return; }
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
      toast.error(err?.response?.data?.message || t('adminMembers.assignFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  return renderModal(
    <form onSubmit={handleAssign} className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">{t('adminMembers.assignPlan')}</h2>
        <p className="text-sm text-gray-500 mt-1">Gói: <strong>{plan.name}</strong> · {fmtVnd(plan.price)}</p>
      </div>
      <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
        Thao tác này sẽ gán gói trực tiếp, bỏ qua quy trình thanh toán.
      </p>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('adminMembers.emailLabel')} *</label>
        <EmailAutocomplete value={email} onChange={setEmail} />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('adminMembers.paymentMethod')}</label>
        <select className="input w-full" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
          <option value="free">{t('adminMembers.freeDemo')}</option>
          <option value="manual">{t('adminMembers.manualPayment')}</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('adminMembers.note')}</label>
        <input
          className="input w-full"
          placeholder={t('adminMembers.placeholderNote')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isLoading}>{t('common.cancel')}</button>
        <button type="submit" className="btn btn-primary" disabled={isLoading}>
          {isLoading ? t('adminMembers.confirming') : t('adminMembers.confirmAssign')}
        </button>
      </div>
    </form>,
    () => { if (!isLoading) onClose(); },
    MODAL_SM
  );
};
