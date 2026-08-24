import { useState, useRef, useEffect } from 'react';
import { HiOutlineUpload, HiOutlineX, HiOutlineCamera } from 'react-icons/hi';
import toast from 'react-hot-toast';
import api from '../../../services/api';

const MAX_FILE_SIZE_MB = 5;

/**
 * Image uploader component - supports both URL input and file upload.
 * Used for chatbot avatar and widget logo.
 *
 * @param {object}   props
 * @param {string}   props.value     - current image URL
 * @param {Function} props.onChange  - called with the new URL
 * @param {string}   [props.label]   - field label shown above
 * @param {string}   [props.help]    - helper text shown below
 * @param {number}   [props.maxSize]  - max file size in MB (default: 5)
 */
export default function ImageUrlInput({
  value,
  onChange,
  label = 'Ảnh đại diện',
  placeholder = 'https://example.com/image.png',
  help,
  maxSize = MAX_FILE_SIZE_MB,
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState(value || '');
  const fileInputRef = useRef(null);

  // Sync preview when value changes externally
  useEffect(() => {
    if (value && value !== preview) {
      setPreview(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const validateFile = (file) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Vui lòng chọn file ảnh (jpg, png, webp, gif)');
      return false;
    }
    if (file.size > maxSize * 1024 * 1024) {
      toast.error(`File quá lớn. Vui lòng chọn ảnh dưới ${maxSize}MB`);
      return false;
    }
    return true;
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!validateFile(file)) {
      e.target.value = '';
      return;
    }

    // Show local preview immediately
    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);
    setIsUploading(true);

    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/uploads/image', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const uploadedUrl = res.data?.data?.url || res.data?.url;
      if (uploadedUrl) {
        onChange?.(uploadedUrl);
        setPreview(uploadedUrl);
        toast.success('Tải ảnh lên thành công!');
      } else {
        throw new Error('Không nhận được URL từ server');
      }
    } catch (err) {
      console.error('[ImageUrlInput] Upload failed:', err);
      toast.error('Tải ảnh lên thất bại. Vui lòng thử lại.');
      setPreview('');
      onChange?.('');
      e.target.value = '';
    } finally {
      setIsUploading(false);
    }
  };

  const handleUrlChange = (e) => {
    const url = e.target.value;
    setPreview(url);
    onChange?.(url);
  };

  const handleUrlBlur = () => {
    if (preview && !preview.startsWith('http')) {
      toast.error('Vui lòng nhập URL hợp lệ (bắt đầu bằng http:// hoặc https://)');
    }
  };

  const handleRemove = () => {
    setPreview('');
    onChange?.('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && fileInputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInputRef.current.files = dt.files;
      fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  return (
    <div className="space-y-3">
      {label && <p className="text-sm font-medium text-slate-700">{label}</p>}

      {/* Preview */}
      {preview && (
        <div className="relative w-24 h-24 rounded-xl overflow-hidden border-2 border-slate-200 bg-slate-50 group">
          <img
            src={preview}
            alt="Preview"
            className="w-full h-full object-cover"
            onError={() => {
              setPreview('');
              toast.error('Không thể tải ảnh từ URL này');
            }}
          />
          {/* Remove button */}
          <button
            type="button"
            onClick={handleRemove}
            className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-red-600"
            title="Xóa ảnh"
          >
            <HiOutlineX className="w-4 h-4" />
          </button>
          {/* Upload overlay */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            title="Đổi ảnh"
          >
            <HiOutlineCamera className="w-6 h-6 text-white" />
          </button>
        </div>
      )}

      {/* Upload button (when no preview) */}
      {!preview && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="w-24 h-24 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 hover:border-slate-400 transition-colors cursor-pointer flex flex-col items-center justify-center gap-1"
          onClick={() => fileInputRef.current?.click()}
        >
          <HiOutlineUpload className="w-6 h-6 text-slate-400" />
          <span className="text-xs text-slate-500 text-center px-1">
            Upload ảnh
          </span>
          <span className="text-[10px] text-slate-400">
            tối đa {maxSize}MB
          </span>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Upload status */}
      {isUploading && (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <div className="w-4 h-4 border-2 border-slate-300 border-t-primary-500 rounded-full animate-spin" />
          Đang tải lên...
        </div>
      )}

      {/* URL input */}
      <div className="space-y-1">
        <input
          type="url"
          value={preview}
          onChange={handleUrlChange}
          onBlur={handleUrlBlur}
          placeholder={placeholder}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-slate-100 disabled:cursor-not-allowed"
          disabled={isUploading}
        />
        <p className="text-xs text-slate-400">
          Hoặc dán URL ảnh. Kích thước khuyến nghị: 256×256px
        </p>
      </div>

      {help && <p className="text-xs text-slate-400">{help}</p>}
    </div>
  );
}
