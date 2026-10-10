import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { HiOutlinePhotograph, HiOutlineX } from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import {
  SUPPORT_IMAGE_MIMES,
  SUPPORT_MAX_ATTACHMENTS,
  apiErrorMessage,
  validateImageFile,
} from '../utils/supportConstants';

/**
 * Chọn / kéo-thả tối đa 3 ảnh đính kèm. Ảnh được tải lên NGAY khi chọn (`uploadFn(file)` → `{ storageObjectId, name, ... }`),
 * rồi cha gom `storageObjectId` vào `attachmentIds`. Ảnh thứ 4 bị chặn ngay ở đây, KHÔNG gọi upload.
 *
 * `value` là mảng `{ storageObjectId, name, previewUrl }`; `onChange` nhận hàm cập nhật dạng `setState(prev => next)`.
 *
 * @param {object} props
 * @param {Array<{ storageObjectId: number|string, name: string, previewUrl: string }>} props.value
 * @param {(updater: (prev: Array) => Array) => void} props.onChange
 * @param {(file: File) => Promise<{ storageObjectId: number|string, name?: string }>} props.uploadFn
 * @param {(busy: boolean) => void} [props.onUploadingChange]
 * @param {boolean} [props.disabled]
 */
export default function SupportImagePicker({ value, onChange, uploadFn, onUploadingChange, disabled = false }) {
  const { t } = useI18n();
  const inputRef = useRef(null);
  const pendingRef = useRef(0);
  const objectUrlsRef = useRef(new Set());
  const [uploading, setUploading] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    onUploadingChange?.(uploading > 0);
  }, [uploading, onUploadingChange]);

  useEffect(() => {
    const urls = objectUrlsRef.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL?.(url));
      urls.clear();
    };
  }, []);

  const isFull = value.length + uploading >= SUPPORT_MAX_ATTACHMENTS;

  const makePreview = (file) => {
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return '';
    const url = URL.createObjectURL(file);
    objectUrlsRef.current.add(url);
    return url;
  };

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0 || disabled) return;

    // Chỗ còn trống = trần − ảnh đã có − ảnh đang tải. Hết chỗ thì chặn NGAY, không gọi upload.
    const slots = SUPPORT_MAX_ATTACHMENTS - value.length - pendingRef.current;
    if (slots <= 0) {
      toast.error(t('support.attachments.errors.limit', { max: SUPPORT_MAX_ATTACHMENTS }));
      return;
    }
    if (files.length > slots) toast.error(t('support.attachments.errors.limit', { max: SUPPORT_MAX_ATTACHMENTS }));

    const accepted = [];
    for (const file of files.slice(0, slots)) {
      const problem = validateImageFile(file);
      if (problem) toast.error(t(`support.attachments.errors.${problem}`, { name: file.name }));
      else accepted.push(file);
    }
    if (accepted.length === 0) return;

    pendingRef.current += accepted.length;
    setUploading((n) => n + accepted.length);
    await Promise.all(
      accepted.map(async (file) => {
        try {
          const uploaded = await uploadFn(file);
          if (!uploaded?.storageObjectId) throw new Error('missing storageObjectId');
          const item = {
            storageObjectId: uploaded.storageObjectId,
            name: uploaded.name || file.name,
            previewUrl: makePreview(file),
          };
          onChange((prev) => [...prev, item]);
        } catch (error) {
          toast.error(apiErrorMessage(error) || t('support.attachments.uploadFailed', { name: file.name }));
        } finally {
          pendingRef.current -= 1;
          setUploading((n) => n - 1);
        }
      }),
    );
  };

  const removeItem = (item) => {
    if (item.previewUrl) {
      URL.revokeObjectURL?.(item.previewUrl);
      objectUrlsRef.current.delete(item.previewUrl);
    }
    onChange((prev) => prev.filter((entry) => entry.storageObjectId !== item.storageObjectId));
  };

  return (
    <div className="space-y-2">
      <div
        data-testid="support-dropzone"
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          handleFiles(event.dataTransfer?.files);
        }}
        className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-4 text-center text-xs transition-colors ${
          dragOver ? 'border-orange-400 bg-orange-50' : 'border-slate-200 bg-slate-50'
        } ${disabled ? 'opacity-60' : ''}`}
      >
        <HiOutlinePhotograph className="h-5 w-5 text-slate-400" aria-hidden="true" />
        <span className="text-slate-500">{t('support.attachments.dropHere')}</span>
        <button
          type="button"
          disabled={disabled || isFull}
          onClick={() => inputRef.current?.click()}
          className="font-semibold text-orange-600 hover:text-orange-700 disabled:cursor-not-allowed disabled:text-slate-400"
        >
          {t('support.attachments.add')}
        </button>
        <span className="text-[11px] text-slate-400">
          {t('support.attachments.hint', { max: SUPPORT_MAX_ATTACHMENTS })} ·{' '}
          {t('support.attachments.count', { n: value.length, max: SUPPORT_MAX_ATTACHMENTS })}
          {uploading > 0 ? ` · ${t('support.attachments.uploading')}` : ''}
        </span>
        <input
          ref={inputRef}
          data-testid="support-file-input"
          type="file"
          multiple
          accept={SUPPORT_IMAGE_MIMES.join(',')}
          className="hidden"
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = '';
          }}
        />
      </div>

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((item) => (
            <li key={item.storageObjectId} className="relative h-16 w-16 overflow-hidden rounded-lg border border-slate-200 bg-white">
              {item.previewUrl ? (
                <img src={item.previewUrl} alt={item.name} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center p-1 text-center text-[10px] text-slate-500 break-all">
                  {item.name}
                </span>
              )}
              <button
                type="button"
                onClick={() => removeItem(item)}
                aria-label={t('support.attachments.remove', { name: item.name })}
                className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
              >
                <HiOutlineX className="h-3 w-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
