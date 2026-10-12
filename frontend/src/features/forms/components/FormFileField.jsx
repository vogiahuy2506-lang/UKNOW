import { HiOutlinePaperClip, HiOutlineX, HiOutlineCheckCircle, HiOutlineExclamationCircle } from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import { buildAcceptAttribute, describeAllowedExtensions, formatFileSize } from '../utils/formFileKinds.util';

/**
 * Ô "Tải tệp" của biểu mẫu công khai (trường `file`, PR-4b) — phần giao diện thuần của FormRenderer:
 * khung chọn tệp (`accept` theo nhóm chủ cho phép), danh sách tệp đã chọn kèm thanh tiến độ khi đang tải, nút xoá từng tệp,
 * câu báo nhẹ khi chủ biểu mẫu hết dung lượng.
 *
 * Biểu mẫu LUÔN nền sáng (trang công khai, bản nhúng, xem trước trong trình soạn) nên KHÔNG có lớp `dark:`.
 * Logic chọn/kiểm/tải nằm ở FormRenderer; component này chỉ vẽ trạng thái được truyền vào.
 *
 * @param {object} props
 * @param {{ key: string, label: string, required?: boolean }} props.field
 * @param {{ kinds: string[], maxBytes: number, maxFiles: number }} props.config cấu hình đã chuẩn hoá (readFileConfig)
 * @param {Array<{ id: string, name: string, size: number, status: 'uploading'|'done'|'error', progress: number, error?: string }>} props.items
 * @param {boolean} props.quotaSkipped chủ hết dung lượng → tệp chưa nhận được (khách vẫn gửi được biểu mẫu)
 * @param {boolean} [props.error] trường đang có lỗi (chỉ để đổi viền; câu lỗi do FormRenderer in dưới trường)
 * @param {boolean} props.disabled
 * @param {string} [props.controlId] id của <input type="file"> (khớp htmlFor của nhãn trường)
 * @param {string} [props.describedBy]
 * @param {(files: File[]) => void} props.onSelect
 * @param {(itemId: string) => void} props.onRemove
 */
export default function FormFileField({
  field,
  config,
  items,
  quotaSkipped,
  error,
  disabled,
  controlId,
  describedBy,
  onSelect,
  onRemove,
}) {
  const { t, locale } = useI18n();
  const activeCount = items.filter((item) => item.status !== 'error').length;
  const full = activeCount >= config.maxFiles;
  const maxSize = formatFileSize(config.maxBytes, locale);

  return (
    <div className="space-y-2" data-testid={`file-field-${field.key}`}>
      <label
        htmlFor={controlId}
        className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors ${
          disabled || full
            ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
            : error
              ? 'border-red-300 bg-red-50/40 text-gray-700 cursor-pointer hover:bg-red-50'
              : 'border-gray-300 bg-gray-50/60 text-gray-700 cursor-pointer hover:border-gray-400 hover:bg-gray-50'
        }`}
      >
        <HiOutlinePaperClip className="h-6 w-6" aria-hidden="true" />
        <span className="text-sm font-medium">
          {config.maxFiles > 1 ? t('publicForm.file.choosePlural') : t('publicForm.file.choose')}
        </span>
        <span className="text-xs text-gray-500 break-words max-w-full">
          {t('publicForm.file.hint', {
            types: describeAllowedExtensions(config.kinds),
            size: maxSize,
          })}
          {config.maxFiles > 1 ? ` · ${t('publicForm.file.hintMaxFiles', { count: config.maxFiles })}` : ''}
        </span>
        <input
          id={controlId}
          type="file"
          className="sr-only"
          accept={buildAcceptAttribute(config.kinds)}
          multiple={config.maxFiles > 1}
          disabled={disabled || full}
          aria-describedby={describedBy}
          onChange={(event) => {
            const picked = Array.from(event.target.files || []);
            // Xoá giá trị để chọn lại CÙNG một tệp (sau khi xoá/lỗi) vẫn kích hoạt onChange.
            event.target.value = '';
            if (picked.length > 0) onSelect(picked);
          }}
        />
      </label>

      {items.length > 0 && (
        <ul className="space-y-1.5" aria-label={field.label}>
          {items.map((item) => (
            <li
              key={item.id}
              className={`rounded-xl border px-3 py-2 text-sm ${
                item.status === 'error' ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium text-gray-800" title={item.name}>
                  {item.name}
                </span>
                <span className="shrink-0 text-xs text-gray-500">{formatFileSize(item.size, locale)}</span>
                {item.status === 'done' && (
                  <HiOutlineCheckCircle className="h-4 w-4 shrink-0 text-green-600" aria-label={t('publicForm.file.uploaded')} />
                )}
                {item.status === 'error' && (
                  <HiOutlineExclamationCircle className="h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
                )}
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  disabled={disabled}
                  className="shrink-0 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={t('publicForm.file.remove', { name: item.name })}
                >
                  <HiOutlineX className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              {item.status === 'uploading' && (
                <div className="mt-1.5">
                  <div
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={item.progress}
                    aria-label={t('publicForm.file.uploadingName', { name: item.name })}
                    className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200"
                  >
                    <div
                      className="h-full rounded-full bg-[color:var(--form-primary,#df5c0e)] transition-all"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">{t('publicForm.file.uploading', { percent: item.progress })}</p>
                </div>
              )}
              {item.status === 'error' && item.error && <p className="mt-1 text-xs text-red-600">{item.error}</p>}
            </li>
          ))}
        </ul>
      )}

      {quotaSkipped && (
        <p
          role="status"
          data-testid={`file-quota-note-${field.key}`}
          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          {t('publicForm.file.quotaNote')}
        </p>
      )}
    </div>
  );
}
