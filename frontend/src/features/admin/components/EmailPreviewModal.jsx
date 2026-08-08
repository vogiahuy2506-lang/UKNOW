import { useState, useMemo } from 'react';
import { FaTimes, FaDesktop, FaMobile, FaCheck } from 'react-icons/fa';
import { HiOutlineMail } from 'react-icons/hi';
import { TYPE_CONFIG } from './NotificationTypeSelector';

const SAMPLE_USER = {
  full_name: 'Nguyễn Văn Test',
  username: 'testuser',
  email: 'test@example.com',
  plan: 'pro',
  status: 'active'
};

const MAIL_FROM_NAME = 'Founder AI Platform';
const SYSTEM_LOGO_URL = '/logo.png';
const SUPPORT_EMAIL = 'info@digiso.vn';
const DASHBOARD_URL = 'https://founderai.vn';

/**
 * Local badge palette khớp với NOTIFICATION_TYPE_CONFIG ở backend
 * (notification.service.js). Giữ FE độc lập để preview không phụ thuộc
 * network — backend là nguồn chuẩn khi gửi thật.
 */
const BADGE_PALETTE = {
  maintenance: { bg: '#fef2f2', border: '#fecaca', text: '#991b1b' },
  announcement: { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' },
  promotion: { bg: '#fff7ed', border: '#fed7aa', text: '#9a3412' },
  warning: { bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
  reminder: { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534' },
  security: { bg: '#fef2f2', border: '#fecaca', text: '#7f1d1d' }
};

export default function EmailPreviewModal({ isOpen, onClose, notification }) {
  const [previewType, setPreviewType] = useState('desktop');
  const [activeLang, setActiveLang] = useState('vi');

  const typeKey = notification?.type || 'announcement';
  const palette = useMemo(() => BADGE_PALETTE[typeKey] || BADGE_PALETTE.announcement, [typeKey]);
  const typeConfig = useMemo(() => TYPE_CONFIG[typeKey] || TYPE_CONFIG.announcement, [typeKey]);

  const replaceVariables = (content) => {
    if (!content) return '';
    return content
      .replace(/\{\{user_name\}\}/g, SAMPLE_USER.full_name)
      .replace(/\{\{user_email\}\}/g, SAMPLE_USER.email)
      .replace(/\{\{user_plan\}\}/g, 'Pro')
      .replace(/\{\{product_name\}\}/g, MAIL_FROM_NAME)
      .replace(/\{\{current_date\}\}/g, new Date().toLocaleDateString('vi-VN'))
      .replace(/\{\{dashboard_url\}\}/g, DASHBOARD_URL)
      .replace(/\{\{support_email\}\}/g, SUPPORT_EMAIL);
  };

  const title = replaceVariables(
    activeLang === 'vi'
      ? (notification?.title || notification?.title_en)
      : (notification?.title_en || notification?.title)
  );
  const message = replaceVariables(
    activeLang === 'vi'
      ? (notification?.message || notification?.message_en)
      : (notification?.message_en || notification?.message)
  );

  const isPromotion = typeKey === 'promotion';
  const isUrgent = notification?.priority === 'urgent';
  const isHigh = notification?.priority === 'high' && !isUrgent;
  const initial = (SAMPLE_USER.full_name || 'U').charAt(0).toUpperCase();

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

        {/* Preview Container */}
        <div className="flex-1 overflow-auto p-4">
          <div
            className={`mx-auto bg-white rounded-2xl shadow-xl overflow-hidden transition-all duration-300 ${
              previewType === 'mobile' ? 'max-w-[375px]' : 'max-w-[680px]'
            }`}
          >
            <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
              {/* Header gradient */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                  padding: '24px 40px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {SYSTEM_LOGO_URL ? (
                      <div style={{ background: 'rgba(255,255,255,0.2)', padding: '6px', borderRadius: '8px' }}>
                        <img
                          src={SYSTEM_LOGO_URL}
                          alt={MAIL_FROM_NAME}
                          style={{ maxHeight: '48px', maxWidth: '160px', objectFit: 'contain', display: 'block' }}
                        />
                      </div>
                    ) : (
                      <div
                        style={{
                          width: '48px',
                          height: '48px',
                          background: 'rgba(255,255,255,.2)',
                          borderRadius: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '24px'
                        }}
                      >
                        {typeConfig.icon?.name ? '📨' : '📨'}
                      </div>
                    )}
                    <div>
                      <h1 style={{ margin: 0, color: '#fff', fontSize: '22px', fontWeight: 700 }}>
                        {MAIL_FROM_NAME}
                      </h1>
                      <p style={{ margin: '2px 0 0', color: 'rgba(255,255,255,.85)', fontSize: '13px' }}>
                        {typeConfig.label}
                      </p>
                    </div>
                  </div>
                  {isUrgent && (
                    <span
                      style={{
                        background: '#dc2626',
                        color: '#fff',
                        padding: '6px 14px',
                        borderRadius: '20px',
                        fontSize: '11px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}
                    >
                      Ưu tiên cao
                    </span>
                  )}
                  {isHigh && (
                    <span
                      style={{
                        background: '#f59e0b',
                        color: '#fff',
                        padding: '6px 14px',
                        borderRadius: '20px',
                        fontSize: '11px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}
                    >
                      Ưu tiên
                    </span>
                  )}
                </div>
              </div>

              {/* Body */}
              <div style={{ padding: '40px' }}>
                {/* Greeting */}
                <p style={{ margin: '0 0 8px', fontSize: '16px', color: '#374151', lineHeight: 1.6 }}>
                  Xin chào <strong style={{ color: '#f97316' }}>{SAMPLE_USER.full_name}</strong>,
                </p>
                <p style={{ margin: '0 0 24px', fontSize: '14px', color: '#6b7280', lineHeight: 1.6 }}>
                  {activeLang === 'vi'
                    ? 'Bạn có một thông báo mới từ '
                    : 'You have a new notification from '}
                  <strong>{MAIL_FROM_NAME}</strong>:
                </p>

                {/* Title Box */}
                <div
                  style={{
                    background: palette.bg,
                    border: `2px solid ${palette.border}`,
                    borderRadius: '14px',
                    padding: '18px 22px',
                    marginBottom: '20px'
                  }}
                >
                  <p
                    style={{
                      margin: '0 0 6px',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: palette.text,
                      textTransform: 'uppercase',
                      letterSpacing: '1px'
                    }}
                  >
                    {typeConfig.label}
                  </p>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: '20px',
                      fontWeight: 700,
                      color: '#1f2937',
                      lineHeight: 1.4
                    }}
                  >
                    {title || (activeLang === 'vi' ? 'Tiêu đề thông báo' : 'Notification Title')}
                  </h2>
                </div>

                {/* Message Box */}
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '14px',
                    padding: '18px 22px',
                    marginBottom: '24px'
                  }}
                >
                  <p
                    style={{
                      margin: '0 0 6px',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#9ca3af',
                      textTransform: 'uppercase',
                      letterSpacing: '1px'
                    }}
                  >
                    📝 {activeLang === 'vi' ? 'Nội dung' : 'Content'}
                  </p>
                  <p style={{ margin: 0, fontSize: '15px', color: '#374151', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                    {message ||
                      (activeLang === 'vi' ? 'Nội dung thông báo sẽ hiển thị ở đây...' : 'Notification content will appear here...')}
                  </p>
                </div>

                {/* CTA cho promotion */}
                {isPromotion && (
                  <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                    <a
                      href={DASHBOARD_URL}
                      style={{
                        display: 'inline-block',
                        background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                        color: '#fff',
                        padding: '13px 32px',
                        borderRadius: '10px',
                        fontSize: '15px',
                        fontWeight: 600,
                        textDecoration: 'none',
                        boxShadow: '0 4px 12px rgba(249, 115, 22, 0.35)'
                      }}
                    >
                      {activeLang === 'vi' ? 'Khám phá ưu đãi →' : 'Explore now →'}
                    </a>
                  </div>
                )}

                {/* Support */}
                <p style={{ margin: '0 0 18px', fontSize: '13px', color: '#6b7280', lineHeight: 1.6 }}>
                  {activeLang === 'vi' ? 'Nếu có thắc mắc, vui lòng liên hệ ' : 'If you have questions, please contact '}
                  <a
                    href={`mailto:${SUPPORT_EMAIL}`}
                    style={{ color: '#f97316', textDecoration: 'none', fontWeight: 500 }}
                  >
                    {SUPPORT_EMAIL}
                  </a>
                  .
                </p>

                {/* User Info Chip */}
                <div
                  style={{
                    background: '#fff7ed',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}
                >
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: '14px',
                      flexShrink: 0
                    }}
                  >
                    {initial}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#92400e' }}>
                      {SAMPLE_USER.full_name}
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#b45309' }}>
                      {SAMPLE_USER.email}
                    </p>
                  </div>
                  <span
                    style={{
                      background: '#f97316',
                      color: '#fff',
                      padding: '3px 10px',
                      borderRadius: '20px',
                      fontSize: '11px',
                      fontWeight: 600,
                      flexShrink: 0
                    }}
                  >
                    Pro
                  </span>
                </div>
              </div>

              {/* Footer */}
              <div style={{ padding: '24px 40px', textAlign: 'center', fontSize: '11px', color: '#6b7280' }}>
                <p style={{ margin: '0 0 4px', fontWeight: 600 }}>
                  Đơn vị chủ quản: Công ty TNHH Giải pháp số Digiso
                </p>
                <p style={{ margin: '0 0 4px' }}>
                  Phòng I.101B Toà nhà A, Khu Công nghệ Phần mềm Đại học Quốc gia Tp. Hồ Chí Minh
                </p>
                <p style={{ margin: 0 }}>
                  Điện thoại: (+84) 879529079 (Hotline) | Email: info@digiso.vn
                </p>
              </div>
            </div>
          </div>
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