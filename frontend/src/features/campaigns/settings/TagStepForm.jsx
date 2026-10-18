import { useEffect, useMemo, useRef, useState } from 'react';
import useAsyncResource from '../simple/useAsyncResource';
import customerApiService from '../../customers/services/customerApi.service';
import { TAG_NAME_MAX, isTagStepChanged, validateTagStep } from './sections';

const INPUT_CLASS =
  'w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 hover:bg-white focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 dark:border-dk-border dark:bg-dk-inset dark:text-dk-text dark:placeholder:text-dk-muted dark:hover:bg-dk-surface dark:focus:bg-dk-inset';

const CHIP_LIMIT = 30;

/**
 * Biểu mẫu riêng của bước "Gắn tag" (mục Sau khi gửi): chọn Gắn / Gỡ, rồi chọn tag có sẵn của workspace hoặc gõ tên mới. Nguồn danh bạ do
 * hệ thống tự điền (`writeTagStep`) nên biểu mẫu không hỏi. Không biết gì về sơ đồ — trả lại `{ action, name }`.
 *
 * @param {object} props
 * @param {{ action: 'add'|'remove', name: string }} props.value `readTagStep()`
 * @param {(value: { action: string, name: string }) => Promise<void>|void} props.onSave
 * @param {() => void} props.onCancel
 * @param {(dirty: boolean) => void} props.onDirtyChange
 * @param {boolean} [props.busy]
 */
export default function TagStepForm({ nodeId, value, onSave, onCancel, onDirtyChange, busy = false, t }) {
  const initial = useRef(value).current;
  const [action, setAction] = useState(value.action);
  const [name, setName] = useState(value.name);
  const tags = useAsyncResource(() => customerApiService.getTags().then((res) => res.data?.data || []), []);

  const current = useMemo(() => ({ action, name }), [action, name]);
  const dirty = isTagStepChanged(current, initial);
  const validity = validateTagStep(current);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const canSave = dirty && validity.ok && !busy;
  const existing = tags.status === 'ready' ? tags.data : [];
  const trimmed = name.replace(/\s+/g, ' ').trim().toLowerCase();

  return (
    <div data-testid="settings-tag-form" className="min-w-0 space-y-4">
      <div className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-dk-border" role="group" aria-label={t('campaignSettings.tagForm.actionAria')}>
        {['add', 'remove'].map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={action === id}
            onClick={() => setAction(id)}
            data-testid={`settings-tag-action-${id}`}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${action === id ? 'bg-primary-500 text-white' : 'text-slate-700 hover:bg-slate-100 dark:text-dk-text dark:hover:bg-dk-raised'}`}
          >
            {t(`campaignSettings.tagForm.action.${id}`)}
          </button>
        ))}
      </div>

      <div className="min-w-0">
        <label htmlFor={`settings-tag-name-${nodeId}`} className="mb-1 block text-sm font-semibold text-slate-900 dark:text-dk-text">
          {t('campaignSettings.tagForm.nameLabel')}
        </label>
        <input
          id={`settings-tag-name-${nodeId}`}
          type="text"
          value={name}
          maxLength={TAG_NAME_MAX + 20}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('campaignSettings.tagForm.namePlaceholder')}
          data-testid="settings-tag-name"
          className={INPUT_CLASS}
        />
        {dirty && !validity.ok && (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300" data-testid="settings-tag-problem">
            {t(`campaignSettings.tagForm.problem.${validity.problem}`, { max: TAG_NAME_MAX })}
          </p>
        )}
      </div>

      <div className="min-w-0" data-testid="settings-tag-existing">
        <p className="mb-1.5 text-xs font-medium text-slate-500 dark:text-dk-text2">{t('campaignSettings.tagForm.pickExisting')}</p>
        {tags.status === 'loading' && <p className="text-xs text-slate-500 dark:text-dk-text2">{t('campaignSettings.tagForm.loading')}</p>}
        {tags.status === 'error' && <p className="text-xs text-rose-600 dark:text-rose-400">{t('customers.tags.loadFailed')}</p>}
        {tags.status === 'ready' && existing.length === 0 && (
          <p className="text-xs text-slate-500 dark:text-dk-text2">{t('customers.tags.noneYet')}</p>
        )}
        {existing.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {existing.slice(0, CHIP_LIMIT).map((tag) => (
              <li key={tag.id}>
                <button
                  type="button"
                  onClick={() => setName(tag.name)}
                  aria-pressed={trimmed === String(tag.name).toLowerCase()}
                  data-testid={`settings-tag-pick-${tag.id}`}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${trimmed === String(tag.name).toLowerCase() ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-950/30 dark:text-primary-300' : 'border-slate-200 text-slate-700 hover:border-primary-300 hover:bg-slate-50 dark:border-dk-border dark:text-dk-text dark:hover:bg-dk-raised'}`}
                >
                  {tag.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-1 text-xs text-slate-500 dark:text-dk-text2" data-testid="settings-tag-hint">
        <p>{t(action === 'remove' ? 'campaignSettings.tagForm.hintRemove' : 'campaignSettings.tagForm.hintAdd')}</p>
        <p>{t('campaignSettings.tagForm.hintSaveFirst')}</p>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:text-dk-text dark:hover:bg-dk-raised"
          data-testid="settings-tag-cancel"
        >
          {t('campaignSettings.section.cancel')}
        </button>
        <button
          type="button"
          onClick={() => onSave(current)}
          disabled={!canSave}
          data-testid="settings-tag-save"
          className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('campaignSettings.section.save')}
        </button>
      </div>
    </div>
  );
}
