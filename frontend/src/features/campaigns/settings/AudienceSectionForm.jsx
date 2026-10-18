import { useCallback, useEffect, useMemo, useState } from 'react';
import AudienceChooser from '../simple/AudienceChooser';
import { EMPTY_AUDIENCE } from '../simple/simpleCampaign.helpers';
import { validateAudience } from './sections/audienceSection';
import { sameValue } from './sections/sectionUtils';

// Số khách và TÊN tag chỉ do panel "Khách hàng đã lưu" tự điền khi mở — không phải thay đổi của người dùng (id tag mới là dữ liệu).
const withoutCounters = (audience) => ({ ...audience, customerTotal: null, tagNames: [] });

/**
 * Biểu mẫu mục "Gửi cho ai": thẻ nguồn + PANEL NHẬP của trình từng bước (ô nhập email / số điện thoại, link Google Sheet, chọn landing,
 * biểu mẫu, bạn bè, nhóm…) với state dạng `EMPTY_AUDIENCE`. KHÔNG nhúng form khối. Lưu chỉ mở được khi qua đúng hàm kiểm của trình từng bước.
 *
 * @param {object} props
 * @param {'email'|'zalo'|'telegram'|'whatsapp'} props.channel
 * @param {Array<string>} props.types các nguồn của kênh
 * @param {object} props.initial trạng thái panel đang lưu (dạng `EMPTY_AUDIENCE`)
 * @param {{ id: number|string, label: string }|null} props.sender tài khoản gửi (bạn bè / nhóm là của tài khoản này)
 * @param {(audience: object) => void} props.onSave
 * @param {() => void} [props.onCancel] bỏ → không có nút Huỷ (khung chiến dịch trống)
 * @param {(dirty: boolean) => void} props.onDirtyChange
 * @param {string} [props.saveLabel]
 * @param {boolean} [props.busy]
 * @param {(type: string) => boolean} [props.isLocked]
 * @param {(type: string) => void} [props.onLockedClick]
 */
export default function AudienceSectionForm({
  channel,
  types,
  initial,
  sender,
  onSave,
  onCancel,
  onDirtyChange,
  saveLabel,
  busy = false,
  isLocked,
  onLockedClick,
  t,
  locale,
}) {
  const [audience, setAudience] = useState(() => ({ ...EMPTY_AUDIENCE, ...initial }));
  const initialSnapshot = useMemo(() => withoutCounters({ ...EMPTY_AUDIENCE, ...initial }), [initial]);
  const dirty = !sameValue(withoutCounters(audience), initialSnapshot);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const onSelectType = useCallback((type) => {
    setAudience((prev) => (prev.type === type ? prev : { ...EMPTY_AUDIENCE, type }));
  }, []);
  const patchAudience = useCallback((patch) => setAudience((prev) => ({ ...prev, ...patch })), []);

  const canSave = dirty && !busy && Boolean(validateAudience(channel, audience));

  return (
    <div data-testid="settings-audience-editor">
      <AudienceChooser
        channel={channel}
        types={types}
        audience={audience}
        sender={sender}
        onSelectType={onSelectType}
        patchAudience={patchAudience}
        t={t}
        locale={locale}
        gridClassName="grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3"
        testIdPrefix="settings-audience"
        isLocked={isLocked}
        onLockedClick={onLockedClick}
        accountHint={t('campaignSettings.section.audience.needSender')}
      />
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-dk-text dark:hover:bg-dk-raised"
            data-testid="settings-audience-cancel"
          >
            {t('campaignSettings.section.cancel')}
          </button>
        )}
        <button
          type="button"
          onClick={() => onSave(audience)}
          disabled={!canSave}
          data-testid="settings-audience-save"
          className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saveLabel || t('campaignSettings.section.save')}
        </button>
      </div>
    </div>
  );
}
