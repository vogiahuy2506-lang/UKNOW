import { useState, useRef, useCallback } from 'react';
import { HiOutlinePaperAirplane, HiOutlinePaperClip, HiOutlineX } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { useI18n } from '../../../i18n';
import api from '../../../services/api';
import useStorageQuota from '../../storage/useStorageQuota';
import { validateFilesBeforeUpload, getUploadValidationErrorMessage } from '../../storage/validateUpload';
import { notifyStorageQuotaRefresh } from '../../storage/storageEvents';

/**
 * Composer input cho chat panel:
 * - Enter để gửi, Shift+Enter để xuống dòng
 * - Đính kèm ảnh (.png,.jpg,.jpeg,.webp) hoặc tài liệu (.pdf,.docx,.pptx,.xlsx,.txt,.csv)
 * - Tải lên /uploads/temp với hạn mức lưu trữ
 * - Nếu chỉ có file mà không có prompt, tự điền filesOnlyPrompt
 * - Disabled khi isStreaming hoặc isUploading
 */
export default function ChatComposer({ onSend, disabled = false }) {
  const tc = useI18n('landingCanvas.chat');
  const { t, locale } = useI18n();
  const { usage: storageQuota } = useStorageQuota();

  const [value, setValue] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);

  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleFileSelect = async (e) => {
    const rawFiles = Array.from(e.target.files || []);
    e.target.value = '';
    if (!rawFiles.length) return;

    const validation = validateFilesBeforeUpload(rawFiles, storageQuota);
    if (!validation.ok) {
      toast.error(getUploadValidationErrorMessage(validation, t, locale));
      return;
    }

    setIsUploading(true);
    try {
      const results = await Promise.all(
        rawFiles.map(async (file) => {
          const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
          const fd = new FormData();
          fd.append('file', file);
          const res = await api.post('/uploads/temp', fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          return { ...res.data.data, previewUrl };
        })
      );
      setUploadedFiles((prev) => [...prev, ...results]);
      notifyStorageQuotaRefresh();
    } catch {
      toast.error(tc('uploadError') || 'Tải tệp lên thất bại');
    } finally {
      setIsUploading(false);
    }
  };

  const removeFile = (index) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    const hasFiles = uploadedFiles.length > 0;
    if ((!trimmed && !hasFiles) || disabled || isUploading) return;

    const promptToSend = trimmed || tc('filesOnlyPrompt');
    onSend?.({ prompt: promptToSend, files: uploadedFiles });
    setValue('');
    setUploadedFiles([]);
    textareaRef.current?.focus();
  }, [value, uploadedFiles, disabled, isUploading, onSend, tc]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const canSend = !disabled && !isUploading && (Boolean(value.trim()) || uploadedFiles.length > 0);

  return (
    <div className="border-t border-gray-200 p-4 shrink-0 bg-white">
      {uploadedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {uploadedFiles.map((f, i) => (
            <div
              key={f.tempId || i}
              className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 rounded-lg px-2.5 py-1 text-xs text-slate-700"
            >
              {f.previewUrl ? (
                <img src={f.previewUrl} alt="" className="w-5 h-5 object-cover rounded shrink-0" />
              ) : (
                <HiOutlinePaperClip className="w-3.5 h-3.5 text-orange-500 shrink-0" />
              )}
              <span className="truncate max-w-[140px] font-medium">{f.originalName || 'file'}</span>
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="p-0.5 text-slate-400 hover:text-red-500 transition-colors shrink-0"
                title={tc('removeFile')}
              >
                <HiOutlineX className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          rows={2}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tc('placeholder')}
          disabled={disabled || isUploading}
          className="flex-1 resize-none border border-gray-300 rounded-lg px-3.5 py-2.5 text-[15px] focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 disabled:bg-gray-50 disabled:cursor-not-allowed"
          style={{ maxHeight: 140 }}
        />

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".png,.jpg,.jpeg,.webp,.pdf,.docx,.pptx,.xlsx,.txt,.csv"
          onChange={handleFileSelect}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isUploading}
          className="inline-flex items-center justify-center w-11 h-11 rounded-lg border border-gray-300 text-gray-500 hover:text-orange-600 hover:border-orange-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          title={tc('attachHint') || tc('attach')}
        >
          {isUploading ? (
            <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          ) : (
            <HiOutlinePaperClip className="w-5 h-5" />
          )}
        </button>

        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          className="inline-flex items-center justify-center w-11 h-11 rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          title={tc('send')}
        >
          <HiOutlinePaperAirplane className="w-5 h-5 -rotate-45" />
        </button>
      </div>
    </div>
  );
}
