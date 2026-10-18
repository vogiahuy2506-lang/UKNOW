import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useI18n } from '../../../i18n';
import customerApiService from '../services/customerApi.service';
import BaseModal from './CustomerModalBase';

const MAX_NEW_NAME = 60;

/**
 * Gắn hoặc bỏ tag cho nhiều khách đã chọn. Gắn: chọn tag có sẵn và/hoặc gõ tên mới (backend tự tạo, dùng lại tag
 * trùng tên không phân biệt hoa/thường). Bỏ: chỉ chọn trong tag có sẵn.
 *
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {'assign'|'unassign'} props.mode
 * @param {number[]} props.customerIds
 * @param {{ id: number, name: string, color?: string|null, customerCount?: number }[]} props.tags
 * @param {() => void} props.onClose
 * @param {() => void} props.onDone gọi sau khi thành công (tải lại danh sách + danh sách tag)
 */
export default function CustomerTagAssignModal({ isOpen, mode, customerIds, tags, onClose, onDone }) {
  const { t } = useI18n();
  const isAssign = mode !== 'unassign';
  const [pickedIds, setPickedIds] = useState([]);
  const [newNames, setNewNames] = useState([]);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setPickedIds([]);
    setNewNames([]);
    setDraft('');
    setSaving(false);
  }, [isOpen, mode]);

  const togglePicked = (id) => setPickedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const commitDraft = () => {
    const name = draft.replace(/\s+/g, ' ').trim();
    if (!name) return;
    const lower = name.toLowerCase();
    // Trùng tag có sẵn (không phân biệt hoa/thường) thì chọn tag đó thay vì thêm tên mới.
    const existing = tags.find((tag) => tag.name.toLowerCase() === lower);
    if (existing) {
      setPickedIds((prev) => (prev.includes(existing.id) ? prev : [...prev, existing.id]));
    } else {
      setNewNames((prev) => (prev.some((n) => n.toLowerCase() === lower) ? prev : [...prev, name]));
    }
    setDraft('');
  };

  const nothingPicked = pickedIds.length === 0 && newNames.length === 0 && !draft.trim();

  const handleSubmit = async (event) => {
    event.preventDefault();
    const extraName = draft.replace(/\s+/g, ' ').trim();
    const names = extraName && !newNames.some((n) => n.toLowerCase() === extraName.toLowerCase())
      ? [...newNames, extraName]
      : newNames;
    if (pickedIds.length === 0 && names.length === 0) {
      toast.error(t('customers.tags.nothingPicked'));
      return;
    }
    setSaving(true);
    try {
      if (isAssign) {
        const res = await customerApiService.assignTags({ customerIds, tagIds: pickedIds, tagNames: names });
        toast.success(t('customers.tags.assignSuccess', { assigned: res?.data?.data?.assigned ?? 0 }));
      } else {
        const res = await customerApiService.unassignTags({ customerIds, tagIds: pickedIds });
        toast.success(t('customers.tags.unassignSuccess', { removed: res?.data?.data?.removed ?? 0 }));
      }
      onDone?.();
      onClose?.();
    } catch (error) {
      toast.error(error?.response?.data?.message || t('customers.tags.failed'));
      setSaving(false);
    }
  };

  const title = t(isAssign ? 'customers.tags.assignTitle' : 'customers.tags.unassignTitle', { count: customerIds.length });

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={saving ? () => {} : onClose}
      title={title}
      contentStyle={{ maxWidth: '520px', height: 'auto', maxHeight: '90vh' }}
    >
      <form onSubmit={handleSubmit} className="space-y-4 p-6" noValidate>
        <div>
          <p className="label">{t('customers.tags.pickExisting')}</p>
          {tags.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-dk-text2">{t('customers.tags.noneYet')}</p>
          ) : (
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('customers.tags.pickExisting')}>
              {tags.map((tag) => {
                const on = pickedIds.includes(tag.id);
                return (
                  <label
                    key={tag.id}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                      on
                        ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-950/40 dark:text-primary-300'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-dk-border dark:bg-dk-raised dark:text-dk-text'
                    }`}
                  >
                    <input type="checkbox" className="sr-only" checked={on} onChange={() => togglePicked(tag.id)} />
                    <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color || '#94a3b8' }} />
                    <span className="max-w-[180px] truncate">{tag.name}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {isAssign && (
          <div>
            <label className="label" htmlFor="customer-tag-new-name">{t('customers.tags.newTagLabel')}</label>
            <div className="flex gap-2">
              <input
                id="customer-tag-new-name"
                className="input flex-1"
                value={draft}
                maxLength={MAX_NEW_NAME}
                placeholder={t('customers.tags.newTagPlaceholder')}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitDraft();
                  }
                }}
              />
              <button type="button" className="btn btn-secondary shrink-0" onClick={commitDraft} disabled={!draft.trim()}>
                {t('customers.tags.addNew')}
              </button>
            </div>
            {newNames.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {newNames.map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-primary-400 px-2.5 py-1 text-xs font-medium text-primary-700 dark:text-primary-300"
                  >
                    {name}
                    <button
                      type="button"
                      aria-label={t('customers.tags.removeTag', { name })}
                      onClick={() => setNewNames((prev) => prev.filter((n) => n !== name))}
                      className="text-primary-500 hover:text-primary-700"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving || nothingPicked}>
            {saving ? t('customers.form.saving') : t(isAssign ? 'customers.tags.assign' : 'customers.tags.unassign')}
          </button>
        </div>
      </form>
    </BaseModal>
  );
}
