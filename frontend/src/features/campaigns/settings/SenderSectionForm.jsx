import { useEffect, useState } from 'react';
import SenderAccountList from '../simple/SenderAccountList';

// Trang (CampaignBuilder) đã tải danh sách email active bằng đúng GET này; `api.js` khử trùng GET song song CÙNG khoá (method+url+params) nên
// lượt của thẻ này mà trùng sẽ HUỶ lượt của trang → form báo "chưa có SMTP". Khác `limit` để hai lượt không đè nhau.
export const SENDER_LOAD_OPTIONS = Object.freeze({ email: { params: { status: 'active', page: 1, limit: 99 } } });

/**
 * Biểu mẫu mục "Gửi từ": danh sách tài khoản của kênh (dùng lại `SenderAccountList` của trình từng bước), Lưu / Huỷ.
 * Email: không chọn gì = tài khoản mặc định (vẫn Lưu được). Kênh khác: phải chọn một tài khoản.
 *
 * @param {object} props
 * @param {'email'|'zalo'|'telegram'|'whatsapp'} props.channel
 * @param {{ id: number|string, label?: string }|null} props.initial tài khoản đang lưu
 * @param {(sender: { id: number|string, label: string }|null) => void} props.onSave
 * @param {() => void} props.onCancel
 * @param {(dirty: boolean) => void} props.onDirtyChange
 * @param {boolean} [props.busy]
 */
export default function SenderSectionForm({ channel, initial, onSave, onCancel, onDirtyChange, busy = false, t, locale }) {
  const [selected, setSelected] = useState(initial ? { id: initial.id, label: initial.label || '' } : null);
  const initialId = String(initial?.id ?? '');
  const dirty = String(selected?.id ?? '') !== initialId;

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const canSave = dirty && !busy && (channel === 'email' || Boolean(selected?.id));

  return (
    <div data-testid="settings-sender-form">
      <SenderAccountList
        channel={channel}
        selected={selected}
        onSelect={setSelected}
        t={t}
        locale={locale}
        className="min-w-0"
        loadOptions={SENDER_LOAD_OPTIONS}
        titleClassName="sr-only"
      />
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-dk-text dark:hover:bg-dk-raised"
          data-testid="settings-sender-cancel"
        >
          {t('campaignSettings.section.cancel')}
        </button>
        <button
          type="button"
          onClick={() => onSave(selected)}
          disabled={!canSave}
          data-testid="settings-sender-save"
          className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('campaignSettings.section.save')}
        </button>
      </div>
    </div>
  );
}
