import { useState } from 'react';
import { createPortal } from 'react-dom';
import { HiOutlineX, HiOutlineTemplate, HiOutlineGlobeAlt, HiOutlineLockClosed } from 'react-icons/hi';
import toast from 'react-hot-toast';
import api from '../../../services/api.js';

export default function SaveTemplateModal({ isOpen, onClose, htmlContent, landingPageTitle, onSuccess }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Vui lòng nhập tên template');
      return;
    }

    if (!htmlContent || !htmlContent.trim()) {
      toast.error('Không có nội dung để lưu');
      return;
    }

    setSaving(true);
    try {
      await api.post('/landing-templates', {
        name: name.trim(),
        description: description.trim() || `Template từ: ${landingPageTitle || 'Landing page'}`,
        htmlStructure: htmlContent,
        category: 'Custom',
        isPublic,
      });
      toast.success(`Đã lưu template ${isPublic ? 'công khai' : 'riêng tư'}`);
      onSuccess?.();
      onClose();
      setName('');
      setDescription('');
      setIsPublic(false);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Không thể lưu template');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
              <HiOutlineTemplate className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Lưu thành Template</h3>
              <p className="text-sm text-gray-500">Lưu landing page hiện tại để sử dụng lại</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <HiOutlineX className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Tên template <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="VD: Landing page bán hàng"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Mô tả
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Mô tả ngắn về template này..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quyền truy cập
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setIsPublic(true)}
                className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                  isPublic 
                    ? 'border-green-500 bg-green-50' 
                    : 'border-gray-200 hover:border-green-300'
                }`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  isPublic ? 'bg-green-100' : 'bg-gray-100'
                }`}>
                  <HiOutlineGlobeAlt className={`w-5 h-5 ${isPublic ? 'text-green-600' : 'text-gray-500'}`} />
                </div>
                <div className="text-left">
                  <div className={`font-medium text-sm ${isPublic ? 'text-green-700' : 'text-gray-700'}`}>
                    Công khai
                  </div>
                  <div className="text-xs text-gray-500">Mọi người đều xem được</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setIsPublic(false)}
                className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                  !isPublic 
                    ? 'border-purple-500 bg-purple-50' 
                    : 'border-gray-200 hover:border-purple-300'
                }`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  !isPublic ? 'bg-purple-100' : 'bg-gray-100'
                }`}>
                  <HiOutlineLockClosed className={`w-5 h-5 ${!isPublic ? 'text-purple-600' : 'text-gray-500'}`} />
                </div>
                <div className="text-left">
                  <div className={`font-medium text-sm ${!isPublic ? 'text-purple-700' : 'text-gray-700'}`}>
                    Riêng tư
                  </div>
                  <div className="text-xs text-gray-500">Chỉ mình bạn</div>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary text-sm"
            disabled={saving}
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="btn btn-primary text-sm flex items-center gap-2"
            disabled={saving || !name.trim()}
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Đang lưu...
              </>
            ) : (
              <>
                <HiOutlineTemplate className="w-4 h-4" />
                Lưu template
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
