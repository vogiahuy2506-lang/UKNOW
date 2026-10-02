import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { HiOutlineExclamation } from 'react-icons/hi';
import { useI18n } from '../../../i18n';

/**
 * Modal hỏi khi rời trình soạn landing mà còn thay đổi chưa lưu
 * (PLAN_LANDING_GIU_NHAP_KHI_F5_2026-10-03.md, Việc 3): Lưu và rời đi · Không lưu · Ở lại.
 *
 * Tên trang trống → hiện ô nhập tên (điền sẵn `initialTitle`), bắt buộc khi bấm "Lưu và rời đi".
 */
export default function LeaveEditorModal({
  open,
  initialTitle = '',
  saving = false,
  error = null,
  onSave,
  onDiscard,
  onStay,
}) {
  const tc = useI18n('landingCanvas.leaveModal');
  const [name, setName] = useState(initialTitle);
  const [nameError, setNameError] = useState(false);
  const needsTitle = !String(initialTitle || '').trim();

  useEffect(() => {
    if (open) {
      setName(initialTitle || '');
      setNameError(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const handleSave = () => {
    if (needsTitle && !name.trim()) {
      setNameError(true);
      return;
    }
    setNameError(false);
    onSave?.(needsTitle ? name.trim() : undefined);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="leave-editor-title"
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
            <HiOutlineExclamation className="w-6 h-6 text-amber-600" />
          </div>
          <div className="min-w-0">
            <h2 id="leave-editor-title" className="text-[17px] font-semibold text-gray-900">
              {tc('title')}
            </h2>
            <p className="mt-1 text-[14px] text-gray-600">{tc('message')}</p>
          </div>
        </div>

        {needsTitle ? (
          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-1" htmlFor="leave-editor-name">
              {tc('nameLabel')}
            </label>
            <input
              id="leave-editor-name"
              type="text"
              value={name}
              maxLength={200}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(false);
              }}
              placeholder={tc('namePlaceholder')}
              className={`w-full h-10 px-3 rounded-lg border text-[14px] outline-none focus:ring-2 focus:ring-orange-500/20 ${
                nameError ? 'border-red-400' : 'border-gray-300 focus:border-orange-500'
              }`}
            />
            {nameError ? <p className="mt-1 text-[12px] text-red-600">{tc('nameRequired')}</p> : null}
          </div>
        ) : null}

        {error ? <p className="text-[13px] text-red-600">{error}</p> : null}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onStay}
            disabled={saving}
            className="inline-flex items-center justify-center h-10 px-4 rounded-lg bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 text-[14px] font-semibold disabled:opacity-50"
          >
            {tc('stay')}
          </button>
          <button
            type="button"
            onClick={onDiscard}
            disabled={saving}
            className="inline-flex items-center justify-center h-10 px-4 rounded-lg bg-white text-red-600 border border-red-200 hover:bg-red-50 text-[14px] font-semibold disabled:opacity-50"
          >
            {tc('discard')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center justify-center h-10 px-4 rounded-lg bg-orange-500 text-white hover:bg-orange-600 text-[14px] font-semibold disabled:opacity-50"
          >
            {saving ? tc('saving') : tc('saveAndLeave')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
