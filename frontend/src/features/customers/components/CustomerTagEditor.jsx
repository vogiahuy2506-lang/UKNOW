import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useI18n } from '../../../i18n';
import customerApiService from '../services/customerApi.service';
import CustomerTagChip from './CustomerTagChip';

/**
 * Thêm/bỏ tag của MỘT khách ngay trong hồ sơ (gọi API ngay, không chờ nút Lưu của form).
 *
 * @param {object} props
 * @param {number} props.customerId
 * @param {{ id: number, name: string, color?: string|null }[]} props.initialTags tag hiện có (từ hàng danh sách)
 * @param {{ id: number, name: string, color?: string|null }[]} props.allTags mọi tag của workspace
 * @param {() => void} [props.onChanged] báo danh sách ngoài tải lại (tag mới có thể vừa được tạo)
 */
export default function CustomerTagEditor({ customerId, initialTags, allTags, onChanged }) {
  const { t } = useI18n();
  const [tags, setTags] = useState(initialTags || []);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTags(initialTags || []);
  }, [customerId, initialTags]);

  const have = new Set(tags.map((tag) => tag.id));
  const addable = allTags.filter((tag) => !have.has(tag.id));
  const fail = (error) => toast.error(error?.response?.data?.message || t('customers.tags.failed'));

  const refresh = async () => {
    const res = await customerApiService.getCustomerTags(customerId);
    setTags(res.data?.data || []);
    onChanged?.();
  };

  const add = async ({ tagIds = [], tagNames = [] }) => {
    setBusy(true);
    try {
      await customerApiService.assignTags({ customerIds: [customerId], tagIds, tagNames });
      await refresh();
      setDraft('');
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (tag) => {
    setBusy(true);
    try {
      await customerApiService.unassignTags({ customerIds: [customerId], tagIds: [tag.id] });
      await refresh();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="customer-tag-editor">
      <p className="label">{t('customers.tags.profileLabel')}</p>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {tags.length === 0 && <span className="text-xs text-gray-400 dark:text-dk-muted">{t('customers.tags.profileNone')}</span>}
        {tags.map((tag) => (
          <CustomerTagChip key={tag.id} tag={tag} onRemove={busy ? undefined : () => remove(tag)} />
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        {addable.length > 0 && (
          <select
            className="input sm:w-44"
            value=""
            disabled={busy}
            aria-label={t('customers.tags.profileAdd')}
            onChange={(e) => {
              const id = Number(e.target.value);
              if (id) add({ tagIds: [id] });
            }}
          >
            <option value="">{t('customers.tags.profileAdd')}</option>
            {addable.map((tag) => (
              <option key={tag.id} value={tag.id}>{tag.name}</option>
            ))}
          </select>
        )}
        <input
          className="input flex-1"
          value={draft}
          maxLength={60}
          disabled={busy}
          placeholder={t('customers.tags.newTagPlaceholder')}
          aria-label={t('customers.tags.newTagLabel')}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const name = draft.trim();
              if (name) add({ tagNames: [name] });
            }
          }}
        />
      </div>
    </div>
  );
}
