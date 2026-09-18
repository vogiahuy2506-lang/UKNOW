import { useState, useRef, useCallback } from 'react';
import { HiOutlineX, HiOutlineMail } from 'react-icons/hi';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Input email dạng tag: gõ email + Enter/Comma để thêm thành tag.
 *
 * Props:
 *  - value: string[]                danh sách email đã chọn
 *  - onChange: (next: string[]) => void
 *  - placeholder?: string
 *  - maxTags?: number               (mặc định không giới hạn)
 *  - disabled?: boolean
 *  - error?: string                 chuỗi lỗi tổng (vd: "Email trùng")
 *  - autoFocus?: boolean
 */
export default function EmailTagsInput({
  value = [],
  onChange,
  placeholder = 'Nhập email và nhấn Enter...',
  maxTags,
  disabled = false,
  error,
  autoFocus = false,
}) {
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState('');
  const inputRef = useRef(null);

  const addEmail = useCallback(
    (raw) => {
      const email = String(raw || '').trim().toLowerCase();
      if (!email) return;
      if (!EMAIL_REGEX.test(email)) {
        setDraftError('Email không hợp lệ');
        return;
      }
      if (value.includes(email)) {
        setDraftError('Email đã được thêm');
        return;
      }
      if (maxTags && value.length >= maxTags) {
        setDraftError(`Tối đa ${maxTags} người nhận`);
        return;
      }
      onChange?.([...value, email]);
      setDraft('');
      setDraftError('');
    },
    [value, onChange, maxTags],
  );

  const removeEmail = (email) => {
    onChange?.(value.filter((e) => e !== email));
  };

  const handleKeyDown = (e) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addEmail(draft);
    } else if (e.key === 'Backspace' && !draft && value.length > 0) {
      removeEmail(value[value.length - 1]);
    }
  };

  const handlePaste = (e) => {
    if (disabled) return;
    const text = e.clipboardData.getData('text');
    if (!text || !text.includes('@')) return;
    e.preventDefault();
    const parts = text.split(/[\s,;]+/).filter(Boolean);
    parts.forEach((p) => addEmail(p));
  };

  return (
    <div>
      <div
        className={`flex flex-wrap items-center gap-1.5 min-h-[42px] w-full px-2 py-1.5 rounded-xl border bg-white transition-all ${
          error || draftError
            ? 'border-red-300'
            : 'border-gray-200 focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100'
        } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((email) => (
          <span
            key={email}
            className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md bg-orange-50 border border-orange-200 text-orange-800 text-sm"
          >
            <HiOutlineMail className="w-3.5 h-3.5" />
            <span className="max-w-[180px] truncate">{email}</span>
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeEmail(email);
                }}
                className="ml-0.5 p-0.5 rounded hover:bg-orange-200/70 text-orange-700"
                aria-label={`Xóa ${email}`}
              >
                <HiOutlineX className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (draftError) setDraftError('');
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={() => draft && addEmail(draft)}
          placeholder={value.length === 0 ? placeholder : ''}
          disabled={disabled}
          autoFocus={autoFocus}
          className="flex-1 min-w-[160px] px-1 py-1 text-sm bg-transparent outline-none placeholder:text-gray-400"
        />
      </div>
      {(error || draftError) && (
        <p className="mt-1.5 text-xs text-red-600">{error || draftError}</p>
      )}
    </div>
  );
}

EmailTagsInput.validate = EMAIL_REGEX;
