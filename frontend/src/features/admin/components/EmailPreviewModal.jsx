import { useState, useEffect, useRef } from 'react';
import { FaTimes, FaDesktop, FaMobile, FaCheck, FaSpinner } from 'react-icons/fa';
import { HiOutlineMail } from 'react-icons/hi';
import adminNotificationApi from '../services/adminNotificationApi.service';

// Debounce delay (ms) — tránh gọi API mỗi keystroke khi admin đang gõ tiêu đề/nội dung.
const DEBOUNCE_MS = 400;

export default function EmailPreviewModal({ isOpen, onClose, notification }) {
  const [previewType, setPreviewType] = useState('desktop');
  const [activeLang, setActiveLang] = useState('vi');
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);
  const lastRequestIdRef = useRef(0);

  // Fetch HTML từ BE mỗi khi notification/locale/device đổi.
  // BE là NGUỒN SỰ THẬT — email thực gửi qua SMTP và iframe preview phải y chang.
  useEffect(() => {
    if (!isOpen || !notification) {
      setHtml('');
      return;
    }

    // Debounce: gõ liên tục → chỉ gửi request cuối sau 400ms im lặng.
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      const requestId = ++lastRequestIdRef.current;
      setLoading(true);
      setError(null);
      try {
        const res = await adminNotificationApi.previewEmailHtml({
          type: notification.type,
          priority: notification.priority,
          title: notification.title,
          message: notification.message,
          html_content: notification.html_content ?? null,
          locale: activeLang,
          device: previewType
        });
        // Bỏ qua response cũ nếu user đã trigger request mới (race condition).
        if (requestId !== lastRequestIdRef.current) return;
        setHtml(res?.data?.html || '');
      } catch (err) {
        if (requestId !== lastRequestIdRef.current) return;
        console.error('[EmailPreviewModal] preview-email-html failed:', err);
        setError(err?.response?.data?.message || err?.message || 'Không thể tải preview');
        setHtml('');
      } finally {
        if (requestId === lastRequestIdRef.current) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [isOpen, notification, activeLang, previewType]);

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
                <p className="text-orange-100 text-xs">Render từ server — y chang email thực gửi qua SMTP</p>
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

        {/* Preview Container */}
        <div className="flex-1 overflow-auto p-4 bg-gray-50">
          {loading && !html && (
            <div className="flex items-center justify-center h-[760px] text-gray-400">
              <FaSpinner className="w-6 h-6 animate-spin mr-2" />
              Đang tải preview từ server...
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center h-[760px] text-red-500 text-sm">
              {error}
            </div>
          )}
          {!loading && !error && html && (
            <iframe
              key={`${activeLang}-${previewType}`}
              title="Email Preview"
              srcDoc={html}
              sandbox=""
              className="mx-auto bg-white rounded-2xl shadow-xl h-[760px] border-0"
              style={{
                width: previewType === 'mobile' ? '375px' : '100%',
                maxWidth: '680px'
              }}
            />
          )}
        </div>

        {/* Footer toolbar */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              <FaCheck className="w-4 h-4 text-green-500 inline mr-1" />
              Preview render từ BE — khớp 100% với email thực mà khách nhận.
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
