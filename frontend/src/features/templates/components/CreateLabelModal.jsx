import { useState } from 'react';
import { HiOutlineTag, HiOutlineTrash } from 'react-icons/hi';

const COLOR_OPTIONS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
  '#64748b', '#f59e0b', '#06b6d4', '#84cc16',
];

const CreateLabelModal = ({ isOpen, onClose, onCreated, onDeleted, existingLabels = [] }) => {
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLOR_OPTIONS[5]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      await onCreated({ name: name.trim(), color });
      setName('');
      setColor(COLOR_OPTIONS[5]);
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi tạo nhãn');
    } finally {
      setLoading(false);
    }
  };

  const isDeletable = (label) => label.name !== 'marketing' && label.name !== 'notification';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center text-primary-600">
            <HiOutlineTag className="w-4 h-4" />
          </div>
          <h3 className="text-base font-semibold text-gray-900">Quản lý nhãn template</h3>
          <button
            onClick={onClose}
            className="ml-auto w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Danh sách nhãn hiện có */}
          {existingLabels.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Nhãn hiện có</p>
              <div className="flex flex-wrap gap-2">
                {existingLabels.map((label) => (
                  <div
                    key={label.id}
                    className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium border"
                    style={{
                      borderColor: label.color + '60',
                      backgroundColor: label.color + '18',
                      color: label.color,
                    }}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: label.color }} />
                    {label.name}
                    {isDeletable(label) && onDeleted && (
                      <button
                        type="button"
                        onClick={() => onDeleted(label.id)}
                        className="ml-0.5 p-0.5 rounded-full hover:bg-black/10 transition-colors opacity-60 hover:opacity-100"
                        title="Xóa nhãn"
                      >
                        <HiOutlineTrash className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Form tạo nhãn mới */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Tên nhãn mới</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ví dụ: Upsell, Flash sale, Nhắc lịch..."
                className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all text-sm"
                autoFocus
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">Màu nhãn</label>
              <div className="flex flex-wrap gap-2.5">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-7 h-7 rounded-full transition-all ${
                      color === c ? 'ring-2 ring-offset-2 ring-gray-500 scale-110' : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
              {name.trim() && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-gray-500">Xem trước:</span>
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border"
                    style={{
                      borderColor: color + '60',
                      backgroundColor: color + '18',
                      color: color,
                    }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                    {name.trim()}
                  </span>
                </div>
              )}
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm transition-colors"
              >
                Đóng
              </button>
              <button
                type="submit"
                disabled={!name.trim() || loading}
                className="px-4 py-2 rounded-lg bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-60 text-sm transition-colors"
              >
                {loading ? 'Đang tạo...' : 'Tạo nhãn'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateLabelModal;
