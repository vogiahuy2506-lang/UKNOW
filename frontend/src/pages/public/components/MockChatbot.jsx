import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  HiOutlineSparkles,
  HiOutlinePaperAirplane,
  HiOutlineMail,
  HiOutlineUser,
  HiOutlineUsers,
  HiOutlineViewGrid,
  HiOutlineDocumentText,
  HiOutlinePhotograph,
  HiOutlinePlay,
  HiOutlinePencil,
  HiOutlineSave,
  HiOutlineChevronRight,
  HiOutlineCheck,
  HiOutlineX,
  HiOutlineChip,
  HiOutlineCode,
} from 'react-icons/hi';

// Mock icons for different channel types
const ChannelIcon = ({ type, size = 'md' }) => {
  const sizeClass = size === 'sm' ? 'w-5 h-5' : 'w-8 h-8';
  const colors = {
    email: 'bg-blue-100 text-blue-600',
    zalo: 'bg-blue-500 text-white',
    zalo_group: 'bg-purple-100 text-purple-600',
    sms: 'bg-green-100 text-green-600',
  };

  return (
    <div className={`${sizeClass} rounded-lg flex items-center justify-center ${colors[type] || 'bg-gray-100 text-gray-600'}`}>
      {type === 'email' && <HiOutlineMail className="w-4 h-4" />}
      {type === 'zalo' && <span className="text-xs font-bold">Z</span>}
      {type === 'zalo_group' && <HiOutlineUsers className="w-4 h-4" />}
      {type === 'sms' && <HiOutlineDocumentText className="w-4 h-4" />}
    </div>
  );
};

// Action buttons card
const ActionButtonsCard = ({ options, onSelect }) => (
  <div className="flex flex-wrap gap-2 mt-3">
    {options.map((opt) => (
      <button
        key={opt.id}
        onClick={() => onSelect(opt.id)}
        className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
          opt.variant === 'primary'
            ? 'bg-orange-500 text-white hover:bg-orange-600'
            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
        }`}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

// Channel picker card
const ChannelPickerCard = ({ options, onSelect }) => (
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
    {options.map((opt) => (
      <button
        key={opt.id}
        onClick={() => onSelect(opt.id)}
        className="flex flex-col items-center gap-2 p-4 bg-white border border-slate-200 rounded-xl hover:border-orange-300 hover:shadow-md transition-all"
      >
        <ChannelIcon type={opt.id} />
        <span className="text-sm font-medium text-slate-700">{opt.label}</span>
      </button>
    ))}
  </div>
);

// Data source picker card
const DataSourcePickerCard = ({ options, onSelect }) => (
  <div className="flex flex-col gap-2 mt-3">
    {options.map((opt) => (
      <button
        key={opt.id}
        onClick={() => onSelect(opt.id)}
        className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg hover:border-orange-300 hover:shadow-sm transition-all text-left"
      >
        <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
          {opt.icon === 'landing' && <HiOutlineViewGrid className="w-4 h-4 text-slate-600" />}
          {opt.icon === 'sheet' && <HiOutlineDocumentText className="w-4 h-4 text-slate-600" />}
          {opt.icon === 'db' && <HiOutlineUsers className="w-4 h-4 text-slate-600" />}
        </div>
        <span className="text-sm font-medium text-slate-700">{opt.label}</span>
        <HiOutlineChevronRight className="w-4 h-4 text-slate-400 ml-auto" />
      </button>
    ))}
  </div>
);

// Template suggestions card
const TemplateSuggestionsCard = ({ suggestions, onSelect }) => (
  <div className="flex flex-col gap-2 mt-3">
    {suggestions.map((suggestion, idx) => (
      <button
        key={idx}
        onClick={() => onSelect(suggestion)}
        className="p-3 bg-white border border-slate-200 rounded-lg hover:border-orange-300 hover:shadow-sm transition-all text-left text-sm"
      >
        {suggestion}
      </button>
    ))}
  </div>
);

// Template type picker card
const TemplateTypePickerCard = ({ options, onSelect }) => (
  <div className="grid grid-cols-2 gap-2 mt-3">
    {options.map((opt) => (
      <button
        key={opt.id}
        onClick={() => onSelect(opt.id)}
        className="flex items-center gap-2 p-3 bg-white border border-slate-200 rounded-lg hover:border-orange-300 hover:shadow-sm transition-all text-left"
      >
        <span className="text-sm font-medium text-slate-700">{opt.label}</span>
      </button>
    ))}
  </div>
);

// Product picker card
const ProductPickerCard = ({ options, onSelect }) => (
  <div className="grid grid-cols-2 gap-2 mt-3">
    {options.map((opt) => (
      <button
        key={opt.id}
        onClick={() => onSelect(opt.id)}
        className="flex items-center gap-2 p-3 bg-white border border-slate-200 rounded-lg hover:border-orange-300 hover:shadow-sm transition-all text-left"
      >
        <span className="text-sm font-medium text-slate-700">{opt.label}</span>
      </button>
    ))}
  </div>
);

// Campaign result card
const CampaignResultCard = ({ stats }) => (
  <div className="mt-3 overflow-hidden rounded-2xl border border-green-200 bg-white shadow-sm">
    {/* Header */}
    <div className="bg-gradient-to-r from-green-500 to-emerald-500 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
        </div>
        <div>
          <div className="text-white font-semibold text-sm">Chiến dịch đang được gửi</div>
          <div className="text-white/70 text-[10px]">Đang xử lý danh sách khách hàng...</div>
        </div>
      </div>
      {/* Progress indicator */}
      <div className="flex flex-col items-end gap-1">
        <div className="text-white font-bold text-sm">
          {stats.pending > 0
            ? `${Math.round((stats.delivered / (stats.delivered + stats.pending)) * 100)}%`
            : '100%'}
        </div>
        <div className="w-16 h-1.5 bg-white/30 rounded-full overflow-hidden">
          <div
            className="h-full bg-white rounded-full transition-all duration-500"
            style={{
              width: stats.pending > 0
                ? `${(stats.delivered / (stats.delivered + stats.pending)) * 100}%`
                : '100%',
            }}
          />
        </div>
      </div>
    </div>

    {/* Stats grid */}
    <div className="p-4">
      <div className="grid grid-cols-3 gap-3">
        {/* Pending */}
        <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
          <div className="w-8 h-8 bg-amber-100 rounded-full mx-auto mb-2 flex items-center justify-center">
            <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <div className="text-xl font-bold text-slate-700">{stats.pending}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Đang chờ</div>
        </div>

        {/* Delivered */}
        <div className="bg-green-50 rounded-xl p-3 text-center border border-green-100">
          <div className="w-8 h-8 bg-green-100 rounded-full mx-auto mb-2 flex items-center justify-center">
            <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </div>
          <div className="text-xl font-bold text-green-600">{stats.delivered}</div>
          <div className="text-[10px] text-green-600 mt-0.5">Đã gửi</div>
        </div>

        {/* Failed */}
        <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
          <div className="w-8 h-8 bg-red-100 rounded-full mx-auto mb-2 flex items-center justify-center">
            <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </div>
          <div className="text-xl font-bold text-slate-700">{stats.failed}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Thất bại</div>
        </div>
      </div>

      {/* Real-time feed simulation */}
      <div className="mt-3 pt-3 border-t border-slate-100">
        <div className="flex items-center gap-1.5 mb-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-[10px] text-slate-500 font-medium">Đang cập nhật real-time...</span>
        </div>
        <div className="space-y-1.5">
          {[
            { name: 'Nguyễn Văn A', time: '2s trước', status: 'delivered' },
            { name: 'Trần Thị B', time: '5s trước', status: 'delivered' },
            { name: 'Lê Văn C', time: '8s trước', status: 'pending' },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-between text-[10px] text-slate-600 bg-slate-50 rounded-lg px-2 py-1.5">
              <span className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${item.status === 'delivered' ? 'bg-green-500' : 'bg-amber-400'}`} />
                {item.name}
              </span>
              <span className="text-slate-400">{item.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

// Landing preview card
const LandingPreviewCard = ({ title, features, locale = 'vi' }) => {
  const previewLabel = locale === 'en' ? 'Landing Page Preview' : 'Xem trước Landing Page';

  return (
    <div className="mt-3 rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-sm">
      {/* Browser chrome */}
      <div className="bg-gradient-to-r from-slate-100 to-slate-50 px-4 py-2.5 flex items-center gap-2 border-b border-slate-200">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-400" />
          <span className="w-3 h-3 rounded-full bg-yellow-400" />
          <span className="w-3 h-3 rounded-full bg-green-400" />
        </div>
        <div className="flex-1 flex justify-center">
          <div className="bg-white rounded-md px-3 py-1 text-[11px] text-slate-400 border border-slate-200 w-48 text-center truncate">
            uknow.vn/landing-{title.split(' ').slice(0, 3).join('-').toLowerCase()}
          </div>
        </div>
        <div className="w-12" />
      </div>

      {/* Mini landing page mockup */}
      <div className="relative bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 overflow-hidden">
        {/* Hero overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-black/40" />

        <div className="relative px-5 py-6 text-center">
          {/* Badge */}
          <span className="inline-block bg-white/20 backdrop-blur-sm text-white text-[10px] font-semibold px-3 py-1 rounded-full mb-3 uppercase tracking-wider">
            {locale === 'en' ? 'New Course' : 'Khóa học mới'}
          </span>

          {/* Headline */}
          <h2 className="text-white text-base font-bold leading-tight mb-2">
            {title}
          </h2>

          {/* Subheadline */}
          <p className="text-white/80 text-[10px] mb-4 max-w-xs mx-auto">
            {locale === 'en'
              ? 'Learn programming from scratch with expert guidance'
              : 'Học lập trình từ con số 0 cùng chuyên gia hàng đầu'}
          </p>

          {/* Mini form */}
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 mb-4 max-w-[220px] mx-auto border border-white/20">
            <div className="bg-white rounded-lg overflow-hidden shadow-lg">
              <div className="bg-slate-100 px-3 py-2 border-b border-slate-200">
                <div className="h-2 bg-slate-300 rounded w-3/4 mx-auto mb-1.5" />
                <div className="h-1.5 bg-slate-200 rounded w-full mb-1.5" />
                <div className="h-1.5 bg-slate-200 rounded w-5/6" />
              </div>
              <div className="p-2 space-y-1.5">
                <div className="h-2 bg-slate-200 rounded w-full" />
                <div className="h-2 bg-slate-200 rounded w-full" />
                <div className="h-7 bg-orange-500 rounded text-white text-[9px] font-semibold flex items-center justify-center mt-2">
                  {locale === 'en' ? 'Register Free Trial' : 'Đăng ký học thử'}
                </div>
              </div>
            </div>
          </div>

          {/* Trust indicators */}
          <div className="flex items-center justify-center gap-3 text-white/70 text-[9px]">
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
              {locale === 'en' ? 'Free trial' : 'Học thử miễn phí'}
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
              {locale === 'en' ? 'Expert instructors' : 'Giảng viên chuyên gia'}
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
              {locale === 'en' ? 'Certificate' : 'Chứng chỉ'}
            </span>
          </div>
        </div>

        {/* Features section mockup */}
        <div className="bg-white px-4 py-4">
          <div className="text-center mb-3">
            <div className="h-3 bg-slate-800 rounded w-32 mx-auto mb-1.5" />
            <div className="h-1.5 bg-slate-300 rounded w-48 mx-auto mb-3" />
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-slate-50 rounded-lg p-2 text-center">
                <div className="w-6 h-6 bg-indigo-100 rounded-full mx-auto mb-1 flex items-center justify-center">
                  <svg className="w-3 h-3 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                </div>
                <div className="h-1 bg-slate-200 rounded w-full mb-0.5" />
                <div className="h-1 bg-slate-100 rounded w-3/4 mx-auto" />
              </div>
            ))}
          </div>
          {/* Pricing teaser */}
          <div className="bg-gradient-to-r from-orange-50 to-red-50 rounded-lg p-2.5 flex items-center justify-between">
            <div>
              <div className="h-1.5 bg-slate-300 rounded w-16 mb-0.5" />
              <div className="h-1 bg-slate-200 rounded w-12" />
            </div>
                <div className="bg-orange-500 text-white text-[9px] font-bold px-3 py-1.5 rounded-lg">
                  {locale === 'en' ? 'Try for Free' : 'Trải nghiệm miễn phí'}
            </div>
          </div>
        </div>

        {/* Real features tags */}
        <div className="bg-slate-50 px-4 py-3 border-t border-slate-200">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
            {locale === 'en' ? 'Features included' : 'Tính năng bao gồm'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {features.map((feature, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 text-[10px] bg-white text-slate-600 px-2 py-0.5 rounded-full border border-slate-200 shadow-sm"
              >
                <svg className="w-2.5 h-2.5 text-green-500 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                {feature}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// Code preview card for landing page
const CodePreviewCard = ({ onViewHtml, locale = 'vi' }) => {
  const viHtml = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Khóa Học Lập Trình</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
</head>
<body class="bg-gradient-to-br from-slate-900 to-slate-800 min-h-screen">
  <!-- Hero Section -->
  <section class="py-20 px-6 text-center">
    <span class="inline-block bg-orange-500/20 text-orange-400 px-4 py-1 rounded-full text-sm mb-4">Cho người mới bắt đầu</span>
    <h1 class="text-4xl md:text-5xl font-bold text-white mb-4">Học Lập Trình Từ Con Số 0</h1>
    <p class="text-slate-400 text-lg mb-8 max-w-2xl mx-auto">Khóa học được thiết kế riêng cho người chưa biết gì về lập trình</p>
    <a href="#register" class="inline-block bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 px-8 rounded-lg transition">Đăng ký học thử miễn phí</a>
  </section>
  <!-- Features -->
  <section class="py-16 px-6 bg-slate-800/50">
    <div class="max-w-4xl mx-auto grid md:grid-cols-3 gap-8">
      <div class="bg-slate-800 p-6 rounded-xl"><h3 class="text-xl font-bold text-white mb-2">100+ Bài học</h3><p class="text-slate-400">Từ cơ bản đến nâng cao</p></div>
      <div class="bg-slate-800 p-6 rounded-xl"><h3 class="text-xl font-bold text-white mb-2">Hỗ trợ 24/7</h3><p class="text-slate-400">Giảng viên luôn sẵn sàng</p></div>
      <div class="bg-slate-800 p-6 rounded-xl"><h3 class="text-xl font-bold text-white mb-2">Chứng chỉ</h3><p class="text-slate-400">Hoàn thành khóa học</p></div>
    </div>
  </section>
  <!-- CTA Form -->
  <section id="register" class="py-16 px-6 text-center">
    <div class="max-w-md mx-auto bg-slate-800 p-8 rounded-2xl">
      <h2 class="text-2xl font-bold text-white mb-6">Đăng ký học thử</h2>
      <form class="space-y-4">
        <input type="text" placeholder="Họ và tên" class="w-full px-4 py-3 rounded-lg bg-slate-700 text-white border border-slate-600 focus:border-orange-500 outline-none">
        <input type="email" placeholder="Email" class="w-full px-4 py-3 rounded-lg bg-slate-700 text-white border border-slate-600 focus:border-orange-500 outline-none">
        <input type="tel" placeholder="Số điện thoại" class="w-full px-4 py-3 rounded-lg bg-slate-700 text-white border border-slate-600 focus:border-orange-500 outline-none">
        <button type="submit" class="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-lg transition">Gửi đăng ký</button>
      </form>
    </div>
  </section>
</body>
</html>`;

  const enHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Programming Course</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
</head>
<body class="bg-gradient-to-br from-slate-900 to-slate-800 min-h-screen">
  <!-- Hero Section -->
  <section class="py-20 px-6 text-center">
    <span class="inline-block bg-orange-500/20 text-orange-400 px-4 py-1 rounded-full text-sm mb-4">For Beginners</span>
    <h1 class="text-4xl md:text-5xl font-bold text-white mb-4">Learn Programming From Scratch</h1>
    <p class="text-slate-400 text-lg mb-8 max-w-2xl mx-auto">Course designed for people who know nothing about programming</p>
    <a href="#register" class="inline-block bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 px-8 rounded-lg transition">Sign Up for Free Trial</a>
  </section>
  <!-- Features -->
  <section class="py-16 px-6 bg-slate-800/50">
    <div class="max-w-4xl mx-auto grid md:grid-cols-3 gap-8">
      <div class="bg-slate-800 p-6 rounded-xl"><h3 class="text-xl font-bold text-white mb-2">100+ Lessons</h3><p class="text-slate-400">From beginner to advanced</p></div>
      <div class="bg-slate-800 p-6 rounded-xl"><h3 class="text-xl font-bold text-white mb-2">24/7 Support</h3><p class="text-slate-400">Instructors always available</p></div>
      <div class="bg-slate-800 p-6 rounded-xl"><h3 class="text-xl font-bold text-white mb-2">Certificate</h3><p class="text-slate-400">Upon course completion</p></div>
    </div>
  </section>
  <!-- CTA Form -->
  <section id="register" class="py-16 px-6 text-center">
    <div class="max-w-md mx-auto bg-slate-800 p-8 rounded-2xl">
      <h2 class="text-2xl font-bold text-white mb-6">Sign Up for Free Trial</h2>
      <form class="space-y-4">
        <input type="text" placeholder="Full name" class="w-full px-4 py-3 rounded-lg bg-slate-700 text-white border border-slate-600 focus:border-orange-500 outline-none">
        <input type="email" placeholder="Email" class="w-full px-4 py-3 rounded-lg bg-slate-700 text-white border border-slate-600 focus:border-orange-500 outline-none">
        <input type="tel" placeholder="Phone number" class="w-full px-4 py-3 rounded-lg bg-slate-700 text-white border border-slate-600 focus:border-orange-500 outline-none">
        <button type="submit" class="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-lg transition">Submit</button>
      </form>
    </div>
  </section>
</body>
</html>`;

  const htmlCode = locale === 'en' ? enHtml : viHtml;
  const viewLabel = locale === 'en' ? 'View details' : 'Xem chi tiết';
  const previewLabel = locale === 'en' ? 'HTML Preview' : 'HTML Preview';

  return (
    <div className="mt-3">
      <div className="bg-gradient-to-r from-orange-500 to-red-500 p-3 rounded-xl text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HiOutlineCode className="w-5 h-5" />
            <span className="font-medium">{previewLabel}</span>
          </div>
          <button
            onClick={() => onViewHtml?.(htmlCode)}
            className="px-4 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm transition"
          >
            {viewLabel}
          </button>
        </div>
      </div>
      <pre className="mt-2 p-3 bg-slate-900 rounded-lg text-xs text-slate-300 overflow-x-auto max-h-48">
        <code>{htmlCode}</code>
      </pre>
    </div>
  );
};

// Audience/Goal picker card
const PickerCard = ({ options, onSelect, title }) => (
  <div className="grid grid-cols-2 gap-2 mt-3">
    {options.map((opt) => (
      <button
        key={opt.id}
        onClick={() => onSelect(opt.id)}
        className="flex items-center gap-2 p-3 bg-white border border-slate-200 rounded-lg hover:border-orange-300 hover:shadow-sm transition-all"
      >
        <span className="text-sm font-medium text-slate-700">{opt.label}</span>
      </button>
    ))}
  </div>
);

// Typing indicator
const TypingIndicator = () => (
  <div className="flex items-center gap-1 mt-2">
    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
  </div>
);

// Render card based on type
const renderCard = (card, onAction, locale = 'vi') => {
  if (!card) return null;

  switch (card.type) {
    case 'action_buttons':
      return <ActionButtonsCard options={card.options} onSelect={onAction} />;
    case 'channel_picker':
      return <ChannelPickerCard options={card.options} onSelect={onAction} />;
    case 'data_source_picker':
      return <DataSourcePickerCard options={card.options} onSelect={onAction} />;
    case 'template_suggestions':
      return <TemplateSuggestionsCard suggestions={card.suggestions} onSelect={onAction} />;
    case 'template_type_picker':
      return <TemplateTypePickerCard options={card.options} onSelect={onAction} />;
    case 'product_picker':
      return <ProductPickerCard options={card.options} onSelect={onAction} />;
    case 'campaign_result':
      return <CampaignResultCard stats={card.stats} />;
    case 'landing_preview':
      return <LandingPreviewCard title={card.title} features={card.features} locale={locale} />;
    case 'code_preview':
      return <CodePreviewCard onViewHtml={onAction} locale={locale} />;
    case 'audience_picker':
    case 'goal_picker':
      return <PickerCard options={card.options} onSelect={onAction} />;
    default:
      return null;
  }
};

// Main MockChatbot component
export default function MockChatbot({ flow, initialMessage, onComplete, locale = 'vi' }) {
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [userSelections, setUserSelections] = useState({});
  const [previewHtml, setPreviewHtml] = useState(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const timersRef = useRef([]);
  const flowKeyRef = useRef(null);
  const advancingLockRef = useRef(false);

  const steps = initialMessage?.steps || [];
  const flowKey = initialMessage?.id || steps[0]?.content || null;

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach((id) => clearTimeout(id));
      timersRef.current = [];
    };
  }, []);

  // Reset state ONLY when flow actually changes (key check)
  useEffect(() => {
    if (flowKey === flowKeyRef.current) return;
    flowKeyRef.current = flowKey;

    timersRef.current.forEach((id) => clearTimeout(id));
    timersRef.current = [];
    advancingLockRef.current = false;
    setMessages([]);
    setIsTyping(false);
    setUserSelections({});
    setStepIndex(0);
    setIsAdvancing(false);

    // Auto-start: show first bot message after small delay
    if (steps.length > 0) {
      const id = setTimeout(() => {
        timersRef.current = timersRef.current.filter((t) => t !== id);
        setMessages([{ ...steps[0] }]);
        setStepIndex(1);
      }, 500);
      timersRef.current.push(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowKey]);

  // Smart scroll: only auto-scroll if user is near bottom (within 120px)
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages]);

  // Helper to schedule timed actions with cleanup
  const scheduleTimer = (fn, delay) => {
    const id = setTimeout(() => {
      timersRef.current = timersRef.current.filter((t) => t !== id);
      fn();
    }, delay);
    timersRef.current.push(id);
    return id;
  };

  // Find next step from current index (optionally filtered by role)
  const findNextStepFrom = (startIndex, role = null) => {
    for (let i = startIndex; i < steps.length; i += 1) {
      if (role === null || steps[i].role === role) return i;
    }
    return -1;
  };

  // Advance through consecutive bot messages with no interactive cards
  const advanceThroughBots = (fromIndex) => {
    let idx = fromIndex;
    const tick = () => {
      const next = steps[idx];
      if (!next || next.role !== 'bot') return;
      // Stop if this bot has interactive cards — DON'T advance further
      if (next.cards?.length > 0) {
        setStepIndex(idx); // Mark we've seen this bot so click lands AFTER it
        return;
      }

      setIsTyping(true);
      const isTypingOnly = next.typingOnly === true;
      scheduleTimer(() => {
        setIsTyping(false);
        if (!isTypingOnly) {
          setMessages((prev) => [...prev, next]);
        }
        setStepIndex(idx + 1);
        idx += 1;
        scheduleTimer(tick, 1200);
      }, 1000);
    };
    tick();
  };

  const handleUserAction = (actionId, cardIndex = 0) => {
    // Synchronous lock to prevent rapid double-clicks before state batches
    if (advancingLockRef.current) return;
    advancingLockRef.current = true;
    setIsAdvancing(true);

    const currentMessage = messages[messages.length - 1];
    const card = currentMessage?.cards?.[cardIndex];
    const selectedOption = card?.options?.find((o) => o.id === actionId || o.label === actionId);
    const displayLabel = selectedOption?.label || actionId;

    setUserSelections((prev) => ({ ...prev, [stepIndex]: { actionId, card } }));

    // Mark current message as consumed → hides cards immediately to prevent re-click
    if (currentMessage) {
      setMessages((prev) => {
        const updated = [...prev];
        const idx = updated.length - 1;
        if (updated[idx] && !updated[idx].consumed) {
          updated[idx] = { ...updated[idx], consumed: true };
        }
        return updated;
      });
    }

    // Look at upcoming steps to determine what happens next
    // Find the NEXT script step AFTER the current position (stepIndex)
    // We need to look past any already-rendered messages
    const nextScriptIdx = findNextStepFrom(stepIndex, null); // any role

    if (nextScriptIdx === -1) {
      // No more steps — add user bubble and end
      setMessages((prev) => [...prev, { role: 'user', content: displayLabel, displayed: displayLabel }]);
      if (actionId === 'restart') {
        scheduleTimer(() => {
          advancingLockRef.current = false;
          setMessages([]);
          setStepIndex(0);
          setIsAdvancing(false);
          scheduleTimer(() => {
            setMessages([{ ...steps[0] }]);
            setStepIndex(1);
          }, 400);
        }, 600);
        return;
      }
      if (actionId === 'signup') {
        scheduleTimer(() => {
          advancingLockRef.current = false;
          setIsAdvancing(false);
          if (typeof window !== 'undefined') window.location.href = '/register';
        }, 800);
        return;
      }
      advancingLockRef.current = false;
      setIsAdvancing(false);
      if (onComplete) scheduleTimer(onComplete, 1500);
      return;
    }

    const nextScript = steps[nextScriptIdx];

    if (nextScript.role === 'user') {
      // Scripted user bubble next — skip it (user already clicked), go to bot
      const afterUserIdx = nextScriptIdx + 1;
      const nextBotIdx = findNextStepFrom(afterUserIdx, 'bot');

      // Show the user's actual click as the bubble (not the scripted template)
      setMessages((prev) => [...prev, { role: 'user', content: displayLabel, displayed: displayLabel }]);

      scheduleTimer(() => {
        // Skip typing-only bots
        let realIdx = nextBotIdx;
        while (
          realIdx < steps.length &&
          steps[realIdx].role === 'bot' &&
          steps[realIdx].typingOnly === true
        ) {
          setIsTyping(true);
          realIdx += 1;
        }
        setIsTyping(true);
        scheduleTimer(() => {
          setIsTyping(false);
          if (realIdx >= steps.length) {
            setStepIndex(realIdx);
            advancingLockRef.current = false;
            setIsAdvancing(false);
            return;
          }
          const botStep = steps[realIdx];
          setMessages((prev) => [...prev, botStep]);
          setStepIndex(realIdx + 1);
          advancingLockRef.current = false;
          setIsAdvancing(false);

          // Continue through consecutive non-interactive bots
          const tailIdx = realIdx + 1;
          const hasInteractiveAfter = steps
            .slice(tailIdx)
            .some((s) => s.role === 'bot' && s.cards?.length > 0 && !s.typingOnly);
          if (!hasInteractiveAfter) {
            advanceThroughBots(tailIdx);
          }
        }, 1200);
      }, 400);
      return;
    }

    // nextScript.role === 'bot' — the next bot step is already queued
    // Just add user bubble; the bot is already shown via advanceThroughBots
    setMessages((prev) => [...prev, { role: 'user', content: displayLabel, displayed: displayLabel }]);
    advancingLockRef.current = false;
    setIsAdvancing(false);
  };

  const handleCardAction = (cardIndex) => (actionId) => {
    handleUserAction(actionId, cardIndex);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Chat header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl flex items-center justify-center">
          <HiOutlineSparkles className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="font-semibold text-slate-800">Founder AI Assistant</div>
          <div className="text-xs text-slate-500 flex items-center gap-1">
            <span className="w-2 h-2 bg-green-500 rounded-full" />
            Demo Mode
          </div>
        </div>
      </div>

      {/* Messages area */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, msgIndex) => (
          <div key={msgIndex} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex gap-2 max-w-[85%] ${message.role === 'user' ? 'flex-row-reverse' : ''}`}>
              {/* Avatar */}
              {message.role === 'bot' ? (
                <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl flex items-center justify-center shrink-0">
                  <HiOutlineSparkles className="w-4 h-4 text-white" />
                </div>
              ) : (
                <div className="w-8 h-8 bg-slate-200 rounded-xl flex items-center justify-center shrink-0">
                  <HiOutlineUser className="w-4 h-4 text-slate-500" />
                </div>
              )}

              {/* Message content */}
              <div className="flex flex-col gap-1">
                <div
                  className={`px-4 py-3 rounded-2xl ${
                    message.role === 'user'
                      ? 'bg-orange-500 text-white rounded-tr-sm'
                      : 'bg-white text-slate-700 rounded-tl-sm border border-slate-200'
                  }`}
                >
                  <div className="text-sm whitespace-pre-wrap leading-relaxed">
                    {message.content.split('\n').map((line, i) => {
                      // Handle bold text (markdown style)
                      if (line.includes('**')) {
                        const parts = line.split(/(\*\*[^*]+\*\*)/g);
                        return (
                          <span key={i}>
                            {parts.map((part, j) => {
                              if (part.startsWith('**') && part.endsWith('**')) {
                                return <strong key={j} className="font-semibold">{part.slice(2, -2)}</strong>;
                              }
                              return part;
                            })}
                            {i < message.content.split('\n').length - 1 && <br />}
                          </span>
                        );
                      }
                      return (
                        <span key={i}>
                          {line}
                          {i < message.content.split('\n').length - 1 && <br />}
                        </span>
                      );
                    })}
                  </div>

                  {/* Render cards (hidden once consumed to prevent re-click) */}
                  {!message.consumed && message.cards?.map((card, cardIndex) => (
                    <div key={`card-${cardIndex}-${card.type}`} className="mt-3">
                      {renderCard(card, handleCardAction(cardIndex), locale)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isTyping && (
          <div className="flex justify-start">
            <div className="flex gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl flex items-center justify-center shrink-0">
                <HiOutlineSparkles className="w-4 h-4 text-white" />
              </div>
              <div className="bg-white border border-slate-200 px-4 py-3 rounded-2xl rounded-tl-sm">
                <TypingIndicator />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area (disabled for demo) */}
      <div className="bg-white border-t border-slate-200 p-3">
        <div className="flex items-center gap-2 px-3 py-2 bg-slate-100 rounded-xl text-slate-400 text-sm">
          <HiOutlineChip className="w-4 h-4" />
          <span>{locale === 'en' ? 'Demo mode - Click the buttons to interact' : 'Demo mode - Nhấn vào các nút để trải nghiệm'}</span>
        </div>
      </div>

      {/* HTML Preview Modal */}
      {previewHtml && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setPreviewHtml(null)}>
          <div className="bg-white rounded-2xl w-full max-w-4xl h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="font-semibold text-slate-800">
                {locale === 'en' ? 'Landing Page Preview' : 'Xem trước Landing Page'}
              </h3>
              <button onClick={() => setPreviewHtml(null)} className="p-2 hover:bg-slate-100 rounded-lg">
                <HiOutlineX className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="flex-1 p-0">
              <iframe
                srcDoc={previewHtml}
                className="w-full h-full border-0"
                title="Landing Page Preview"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
