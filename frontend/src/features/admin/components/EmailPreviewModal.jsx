import { useState } from 'react';
import { FaTimes, FaDesktop, FaMobile, FaCheck } from 'react-icons/fa';
import { HiOutlineBell, HiOutlineMail } from 'react-icons/hi';
import { TYPE_CONFIG } from './NotificationTypeSelector';

const SAMPLE_USER = {
  full_name: 'Nguyen Van Test',
  username: 'testuser',
  email: 'test@example.com',
  plan: 'pro',
  status: 'active'
};

// System config
const SYSTEM_EMAIL_NAME = 'Founder AI Platform';
const SYSTEM_LOGO_URL = '/logo.png'; // Sử dụng relative path, sẽ tự động lấy từ frontend

export default function EmailPreviewModal({ isOpen, onClose, notification }) {
  const [previewType, setPreviewType] = useState('desktop');
  const [activeLang, setActiveLang] = useState('vi');

  if (!isOpen) return null;

  const typeConfig = notification?.type ? TYPE_CONFIG[notification.type] : TYPE_CONFIG.announcement;

  const replaceVariables = (content) => {
    if (!content) return '';
    return content
      .replace(/\{\{user_name\}\}/g, SAMPLE_USER.full_name)
      .replace(/\{\{user_email\}\}/g, SAMPLE_USER.email)
      .replace(/\{\{user_plan\}\}/g, 'Pro')
      .replace(/\{\{product_name\}\}/g, 'FounderAI')
      .replace(/\{\{current_date\}\}/g, new Date().toLocaleDateString('vi-VN'))
      .replace(/\{\{dashboard_url\}\}/g, 'https://founderai.vn')
      .replace(/\{\{support_email\}\}/g, 'info@digiso.vn');
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

  const typeIcons = {
    warning: { icon: '⚠️', bg: 'bg-amber-500' },
    info: { icon: '📢', bg: 'bg-blue-500' },
    gift: { icon: '🎁', bg: 'bg-green-500' },
    alert: { icon: '🚨', bg: 'bg-red-500' },
    clock: { icon: '⏰', bg: 'bg-purple-500' },
    shield: { icon: '🔒', bg: 'bg-gray-700' }
  };

  const typeIcon = typeIcons[typeConfig.icon] || typeIcons.info;
  const year = new Date().getFullYear();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden mx-4">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <HiOutlineMail className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Xem truoc Email</h2>
                <p className="text-orange-100 text-xs">Xem truoc noi dung thong bao truoc khi gui</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
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
            {/* Email Preview - Professional Template */}
            <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
              {/* Header with gradient */}
              <div style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', padding: '24px 40px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {/* Logo hoặc Icon */}
                      {SYSTEM_LOGO_URL ? (
                        <div style={{ background: 'rgba(255,255,255,0.2)', padding: '6px', borderRadius: '8px' }}>
                          <img 
                            src={SYSTEM_LOGO_URL} 
                            alt={SYSTEM_EMAIL_NAME} 
                            style={{ maxHeight: '48px', maxWidth: '160px', objectFit: 'contain', display: 'block' }}
                          />
                        </div>
                      ) : (
                        <div style={{ width: '48px', height: '48px', background: 'rgba(255,255,255,.2)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', marginBottom: '8px' }}>
                          {typeIcon.icon}
                        </div>
                      )}
                      <div>
                        <h1 style={{ margin: 0, color: '#fff', fontSize: '22px', fontWeight: 700 }}>
                          {SYSTEM_EMAIL_NAME}
                        </h1>
                        <p style={{ margin: '2px 0 0', color: 'rgba(255,255,255,.85)', fontSize: '13px' }}>
                          {typeConfig.label}
                        </p>
                      </div>
                    </div>
                  </div>
                  {notification?.priority === 'urgent' && (
                    <span style={{
                      background: '#dc2626',
                      color: '#fff',
                      padding: '6px 14px',
                      borderRadius: '20px',
                      fontSize: '11px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Ưu tiên cao
                    </span>
                  )}
                  {notification?.priority === 'high' && notification?.priority !== 'urgent' && (
                    <span style={{
                      background: '#f59e0b',
                      color: '#fff',
                      padding: '6px 14px',
                      borderRadius: '20px',
                      fontSize: '11px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Ưu tiên
                    </span>
                  )}
                </div>
              </div>

              {/* Body */}
              <div style={{ padding: '40px' }}>
                {/* Greeting */}
                <div style={{ marginBottom: '24px' }}>
                  <p style={{ margin: 0, fontSize: '16px', color: '#374151', lineHeight: 1.6 }}>
                    Xin chào <strong style={{ color: '#f97316' }}>{SAMPLE_USER.full_name}</strong>,
                  </p>
                  <p style={{ margin: '8px 0 0', fontSize: '14px', color: '#6b7280', lineHeight: 1.6 }}>
                    {activeLang === 'vi' 
                      ? 'Chúng tôi có thông báo quan trọng dành cho bạn:'
                      : 'We have an important notification for you:'}
                  </p>
                </div>

                {/* Title Box */}
                <div style={{
                  background: typeConfig.bgColor || '#fff7ed',
                  border: `2px solid ${typeConfig.borderColor || '#fed7aa'}`,
                  borderRadius: '16px',
                  padding: '24px',
                  marginBottom: '24px'
                }}>
                  <div className="flex items-center gap-2 mb-3">
                    <HiOutlineBell className="w-4 h-4 text-orange-500" />
                    <p style={{
                      margin: 0,
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#92400e',
                      textTransform: 'uppercase',
                      letterSpacing: '1px'
                    }}>
                      {activeLang === 'vi' ? 'Tiêu đề thông báo' : 'Notification Title'}
                    </p>
                  </div>
                  <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#1f2937', lineHeight: 1.4 }}>
                    {title || (activeLang === 'vi' ? 'Tiêu đề thông báo' : 'Notification Title')}
                  </h2>
                </div>

                {/* Message Box */}
                <div style={{
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '16px',
                  padding: '24px',
                  marginBottom: '24px'
                }}>
                  <div className="flex items-center gap-2 mb-3">
                    <HiOutlineMail className="w-4 h-4 text-orange-500" />
                    <p style={{
                      margin: 0,
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '1px'
                    }}>
                      {activeLang === 'vi' ? 'Nội dung' : 'Content'}
                    </p>
                  </div>
                  <p style={{
                    margin: 0,
                    fontSize: '15px',
                    color: '#374151',
                    lineHeight: 1.8,
                    whiteSpace: 'pre-wrap'
                  }}>
                    {message || (activeLang === 'vi' ? 'Nội dung thông báo sẽ hiển thị ở đây...' : 'Notification content will appear here...')}
                  </p>
                </div>

                {/* CTA Button (optional) */}
                {notification?.type === 'promotion' && (
                  <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                    <a 
                      href="https://founderai.vn"
                      style={{
                        display: 'inline-block',
                        background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                        color: '#fff',
                        padding: '14px 32px',
                        borderRadius: '12px',
                        fontSize: '15px',
                        fontWeight: 600,
                        textDecoration: 'none',
                        boxShadow: '0 4px 14px rgba(249, 115, 22, 0.4)'
                      }}
                    >
                      {activeLang === 'vi' ? 'Khám phá ngay' : 'Explore now'}
                    </a>
                  </div>
                )}

                {/* Support */}
                <div style={{
                  background: '#f9fafb',
                  borderRadius: '12px',
                  padding: '20px',
                  marginBottom: '24px'
                }}>
                  <p style={{ margin: 0, fontSize: '14px', color: '#374151', lineHeight: 1.6 }}>
                    {activeLang === 'vi'
                      ? 'Nếu bạn có bất kỳ thắc mắc nào, vui lòng liên hệ với chúng tôi:'
                      : 'If you have any questions, please contact us:'}
                  </p>
                  <a 
                    href="mailto:info@digiso.vn" 
                    style={{ 
                      color: '#f97316',
                      fontWeight: 600,
                      textDecoration: 'none'
                    }}
                  >
                    info@digiso.vn
                  </a>
                </div>

                {/* User Info Card */}
                <div style={{
                  background: '#fff7ed',
                  borderRadius: '12px',
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '16px'
                  }}>
                    {SAMPLE_USER.full_name[0]}
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: '13px', color: '#92400e', fontWeight: 500 }}>
                      {SAMPLE_USER.full_name}
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#b45309' }}>
                      {SAMPLE_USER.email}
                    </p>
                  </div>
                  <div style={{ marginLeft: 'auto' }}>
                    <span style={{
                      background: '#f97316',
                      color: '#fff',
                      padding: '4px 12px',
                      borderRadius: '20px',
                      fontSize: '11px',
                      fontWeight: 600
                    }}>
                      Pro
                    </span>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div style={{ padding: '24px 40px', background: '#1f2937' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>FounderAI</span>
                      <span style={{ fontSize: '10px', color: '#9ca3af', background: '#374751', padding: '2px 6px', borderRadius: '8px' }}>
                        {year}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '12px', color: '#9ca3af' }}>
                      Email tự động, vui lòng không reply trực tiếp.
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <a href="#" style={{ color: '#9ca3af', textDecoration: 'none', fontSize: '12px' }}>
                      Chính sách bảo mật
                    </a>
                    <span style={{ color: '#4b5563' }}>·</span>
                    <a href="#" style={{ color: '#9ca3af', textDecoration: 'none', fontSize: '12px' }}>
                      Hủy đăng ký
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
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
