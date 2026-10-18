import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { HiOutlineCheck, HiOutlinePencil, HiOutlineTrash, HiOutlineX } from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import ConfirmModal from '../../../components/common/ConfirmModal';
import customerApiService from '../services/customerApi.service';
import { CUSTOMER_TAG_COLORS } from '../utils/customerList.helpers';
import BaseModal from './CustomerModalBase';

function ColorPicker({ value, onChange, label }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={label}>
      <button
        type="button"
        role="radio"
        aria-checked={!value}
        aria-label={t('customers.tags.noColor')}
        title={t('customers.tags.noColor')}
        onClick={() => onChange(null)}
        className={`h-5 w-5 rounded-full border-2 bg-slate-300 ${!value ? 'border-slate-900 dark:border-dk-text' : 'border-transparent'}`}
      />
      {CUSTOMER_TAG_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={color}
          onClick={() => onChange(color)}
          className={`h-5 w-5 rounded-full border-2 ${value === color ? 'border-slate-900 dark:border-dk-text' : 'border-transparent'}`}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

/**
 * Quản lý tag của workspace: tạo, đổi tên, đổi màu, xoá (báo số khách đang mang).
 *
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {{ id: number, name: string, color?: string|null, customerCount?: number }[]} props.tags
 * @param {() => void} props.onClose
 * @param {() => void} props.onChanged gọi sau mỗi thay đổi thành công (tải lại tag + danh sách khách)
 */
export default function CustomerTagManageModal({ isOpen, tags, onClose, onChanged }) {
  const { t } = useI18n();
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null); // { id, name, color }
  const [savingEdit, setSavingEdit] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setNewName('');
    setNewColor(null);
    setEditing(null);
    setToDelete(null);
  }, [isOpen]);

  const errorMessage = (error) => error?.response?.data?.message || t('customers.tags.failed');

  const handleCreate = async (event) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await customerApiService.createTag({ name, color: newColor });
      setNewName('');
      setNewColor(null);
      onChanged?.();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setCreating(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editing || !editing.name.trim()) return;
    setSavingEdit(true);
    try {
      await customerApiService.updateTag(editing.id, { name: editing.name.trim(), color: editing.color });
      setEditing(null);
      onChanged?.();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await customerApiService.deleteTag(toDelete.id);
      toast.success(t('customers.tags.deleteSuccess'));
      setToDelete(null);
      onChanged?.();
    } catch (error) {
      toast.error(errorMessage(error));
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <BaseModal
        isOpen={isOpen}
        onClose={onClose}
        title={t('customers.tags.manageTitle')}
        contentStyle={{ maxWidth: '560px', height: 'auto', maxHeight: '90vh' }}
      >
        <div className="space-y-5 p-6">
          <p className="text-sm text-gray-500 dark:text-dk-text2">{t('customers.tags.manageHint')}</p>

          <form onSubmit={handleCreate} className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-dk-border">
            <div className="flex gap-2">
              <input
                className="input flex-1"
                value={newName}
                maxLength={60}
                placeholder={t('customers.tags.createPlaceholder')}
                aria-label={t('customers.tags.createPlaceholder')}
                onChange={(e) => setNewName(e.target.value)}
              />
              <button type="submit" className="btn btn-primary shrink-0" disabled={creating || !newName.trim()}>
                {t('customers.tags.create')}
              </button>
            </div>
            <ColorPicker value={newColor} onChange={setNewColor} label={t('customers.tags.color')} />
          </form>

          {tags.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-500 dark:text-dk-text2">{t('customers.tags.empty')}</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-dk-border" data-testid="customer-tag-manage-list">
              {tags.map((tag) => {
                const isEditing = editing?.id === tag.id;
                return (
                  <li key={tag.id} className="py-2.5">
                    {isEditing ? (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <input
                            className="input flex-1"
                            value={editing.name}
                            maxLength={60}
                            aria-label={t('customers.tags.rename')}
                            onChange={(e) => setEditing((prev) => ({ ...prev, name: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSaveEdit();
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="btn btn-primary shrink-0"
                            onClick={handleSaveEdit}
                            disabled={savingEdit || !editing.name.trim()}
                            aria-label={t('common.save')}
                          >
                            <HiOutlineCheck className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary shrink-0"
                            onClick={() => setEditing(null)}
                            aria-label={t('common.cancel')}
                          >
                            <HiOutlineX className="h-4 w-4" />
                          </button>
                        </div>
                        <ColorPicker
                          value={editing.color}
                          onChange={(color) => setEditing((prev) => ({ ...prev, color }))}
                          label={t('customers.tags.color')}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <span
                          aria-hidden="true"
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: tag.color || '#94a3b8' }}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 dark:text-dk-text">{tag.name}</span>
                        <span className="shrink-0 text-xs text-gray-500 dark:text-dk-text2">
                          {t('customers.tags.customerCount', { count: tag.customerCount ?? 0 })}
                        </span>
                        <button
                          type="button"
                          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:text-dk-text2 dark:hover:bg-dk-raised"
                          onClick={() => setEditing({ id: tag.id, name: tag.name, color: tag.color || null })}
                          aria-label={`${t('customers.tags.rename')}: ${tag.name}`}
                        >
                          <HiOutlinePencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30"
                          onClick={() => setToDelete(tag)}
                          aria-label={`${t('common.delete')}: ${tag.name}`}
                        >
                          <HiOutlineTrash className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </BaseModal>
      <ConfirmModal
        isOpen={Boolean(toDelete)}
        title={t('customers.tags.deleteTitle')}
        message={toDelete ? t('customers.tags.deleteConfirm', { name: toDelete.name, count: toDelete.customerCount ?? 0 }) : ''}
        confirmText={t('common.delete')}
        onConfirm={handleConfirmDelete}
        onCancel={() => setToDelete(null)}
        isLoading={deleting}
      />
    </>
  );
}
