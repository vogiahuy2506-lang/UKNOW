import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useI18n } from '../../../i18n';
import customerApiService from '../services/customerApi.service';
import BaseModal from './CustomerModalBase';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMPTY_FORM = { fullName: '', email: '', phone: '', notes: '' };

/**
 * Thêm (customer = null) hoặc sửa khách. Chỉ gửi trường có giá trị: backend `COALESCE(giá trị mới, giá trị cũ)`
 * nên ô để trống nghĩa là "giữ nguyên" (và `POST` từ chối `phone` rỗng).
 *
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {object|null} props.customer khách đang sửa (hàng từ danh sách), null = thêm mới
 * @param {() => void} props.onClose
 * @param {() => void} props.onSaved gọi sau khi lưu thành công (tải lại danh sách)
 */
export default function CustomerFormModal({ isOpen, customer, onClose, onSaved }) {
  const { t } = useI18n();
  const isEdit = Boolean(customer?.id);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm(isEdit
      ? { fullName: customer.fullName || '', email: customer.email || '', phone: customer.phone || '', notes: '' }
      : EMPTY_FORM);
    setErrors({});
    setSaving(false);
  }, [isOpen, isEdit, customer]);

  const setField = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    const email = form.email.trim();
    const phone = form.phone.trim();
    const nextErrors = {};
    if (!email && !phone) nextErrors.contact = t('customers.form.needContact');
    if (email && !EMAIL_PATTERN.test(email)) nextErrors.email = t('customers.form.invalidEmail');
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const payload = {};
    const fullName = form.fullName.trim();
    const notes = form.notes.trim();
    if (fullName) payload.fullName = fullName;
    if (email) payload.email = email;
    if (phone) payload.phone = phone;
    if (notes) payload.notes = notes;

    setSaving(true);
    try {
      if (isEdit) {
        await customerApiService.updateCustomer(customer.id, payload);
        toast.success(t('customers.updateSuccess'));
      } else {
        await customerApiService.createCustomer(payload);
        toast.success(t('customers.addSuccess'));
      }
      onSaved?.();
      onClose?.();
    } catch (error) {
      toast.error(error?.response?.data?.message || t(isEdit ? 'customers.updateFailed' : 'customers.addFailed'));
      setSaving(false);
    }
  };

  const title = t(isEdit ? 'customers.form.editTitle' : 'customers.form.addTitle');

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={saving ? () => {} : onClose}
      title={title}
      contentStyle={{ maxWidth: '520px', height: 'auto', maxHeight: '90vh' }}
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-4" noValidate>
        <div>
          <label className="label" htmlFor="customer-form-fullName">{t('customers.form.fullName')}</label>
          <input
            id="customer-form-fullName"
            className="input"
            value={form.fullName}
            onChange={setField('fullName')}
            maxLength={255}
          />
        </div>
        <div>
          <label className="label" htmlFor="customer-form-email">{t('customers.form.email')}</label>
          <input
            id="customer-form-email"
            type="email"
            className={`input ${errors.email ? 'input-error' : ''}`}
            value={form.email}
            onChange={setField('email')}
            maxLength={254}
          />
          {errors.email && <p role="alert" className="mt-1 text-xs text-red-600">{errors.email}</p>}
        </div>
        <div>
          <label className="label" htmlFor="customer-form-phone">{t('customers.form.phone')}</label>
          <input
            id="customer-form-phone"
            type="tel"
            className="input"
            value={form.phone}
            onChange={setField('phone')}
            maxLength={50}
          />
        </div>
        {errors.contact && <p role="alert" className="text-xs text-red-600">{errors.contact}</p>}
        <div>
          <label className="label" htmlFor="customer-form-notes">{t('customers.form.notes')}</label>
          <textarea
            id="customer-form-notes"
            className="input"
            rows={3}
            value={form.notes}
            onChange={setField('notes')}
          />
        </div>
        {isEdit && <p className="text-xs text-gray-500 dark:text-dk-text2">{t('customers.form.editHint')}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? t('customers.form.saving') : t('common.save')}
          </button>
        </div>
      </form>
    </BaseModal>
  );
}
