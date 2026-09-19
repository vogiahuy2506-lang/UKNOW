import { useState } from 'react';
import { FaTimes, FaDesktop, FaMobile, FaCheck } from 'react-icons/fa';
import { HiOutlineMail } from 'react-icons/hi';
import { renderNotificationHtml } from '../utils/notificationPreview.util';

export default function EmailPreviewModal({ isOpen, onClose, notification }) {
  const [previewType, setPreviewType] = useState('desktop');
  const [activeLang, setActiveLang] = useState('vi');

  const html = renderNotificationHtml({
    notification,
    locale: activeLang,
    device: previewType
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden mx-4">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <HiOutlineMail className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Xem trước Email</h2>
                <p className="text-orange-100 text-xs">Xem trước nội dung thông báo trước khi gửi</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              aria-label="Đóng"
            >
              <FaTimes className="text-white w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 font-medium">Ngôn ngữ:</span>
            <div className="flex gap-1 bg-white rounded-lg p-1 border border-gray-200">
              <button
                onClick={() => setActiveLang('vi')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                  activeLang === 'vi'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <span>🇻🇳</span>
                Tiếng Việt
              </button>
              <button
                onClick={() => setActiveLang('en')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                  activeLang === 'en'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <span>🇺🇸</span>
                English
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 font-medium">Thiết bị:</span>
            <div className="flex gap-1 bg-white rounded-lg p-1 border border-gray-200">
              <button
                onClick={() => setPreviewType('desktop')}
                className={`p-2.5 rounded-lg transition-all ${
                  previewType === 'desktop'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
                title="Desktop"
              >
                <FaDesktop className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPreviewType('mobile')}
                className={`p-2.5 rounded-lg transition-all ${
                  previewType === 'mobile'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
                title="Mobile"
              >
                <FaMobile className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Preview Container (render qua iframe từ helper) */}
        <div className="flex-1 overflow-auto p-4 bg-gray-50">
          <iframe
            title="Email Preview"
            srcDoc={html}
            sandbox=""
            className="mx-auto bg-white rounded-2xl shadow-xl h-[760px] border-0"
            style={{
              width: previewType === 'mobile' ? '375px' : '100%',
              maxWidth: '680px'
            }}
          />
        </div>

        {/* Footer toolbar */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              <FaCheck className="w-4 h-4 text-green-500 inline mr-1" />
              Đây là phiên bản xem trước. Email thực tế có thể có một số khác biệt nhỏ.
            </p>
            <button
              onClick={onClose}
              className="px-5 py-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all font-medium text-sm shadow-sm"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
