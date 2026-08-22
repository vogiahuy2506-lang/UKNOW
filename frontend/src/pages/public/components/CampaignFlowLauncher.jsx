import { useState } from 'react';
import {
  HiOutlineMail,
  HiOutlineChatAlt2,
  HiOutlineUserGroup,
  HiOutlinePlay,
  HiOutlineSparkles,
} from 'react-icons/hi';

/**
 * 3-up grid of "campaign preview" buttons that dispatch a window event to
 * open the matching CampaignFlowModal on the parent page (HeroPage listens
 * via a window 'open-campaign-flow' CustomEvent).
 *
 * Kept in its own file because HeroPage already carries 4 other sections
 * and the data + UI here is independent of them.
 */
export default function CampaignFlowLauncher({ t }) {
  const [hovered, setHovered] = useState(null);

  const campaigns = [
    {
      key: 'email',
      title: t('heroPage.campaignDemo.emailTitle') || 'Email Marketing',
      desc: t('heroPage.campaignDemo.emailDesc') || 'Gửi email hàng loạt, theo dõi mở/click/chuyển đổi',
      icon: HiOutlineMail,
      gradient: 'from-orange-400 via-orange-500 to-amber-500',
      border: 'border-orange-200',
      hoverBorder: 'hover:border-orange-400',
      iconBg: 'bg-orange-100',
      iconColor: 'text-orange-600',
      btnBg: 'bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600',
      chipBg: 'bg-orange-50 text-orange-700',
      stats: ['1.250 khách', '8 node', '~12 phút'],
    },
    {
      key: 'zalo',
      title: t('heroPage.campaignDemo.zaloPersonalTitle') || 'Zalo cá nhân',
      desc: t('heroPage.campaignDemo.zaloPersonalDesc') || 'Gửi tin nhắn qua Zalo OA đến từng khách hàng',
      icon: HiOutlineChatAlt2,
      gradient: 'from-orange-500 to-red-500',
      border: 'border-orange-200',
      hoverBorder: 'hover:border-red-400',
      iconBg: 'bg-orange-100',
      iconColor: 'text-red-500',
      btnBg: 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600',
      chipBg: 'bg-orange-50 text-orange-700',
      stats: ['480 khách', '8 node', '~14 phút'],
    },
    {
      key: 'zalo_group',
      title: t('heroPage.campaignDemo.zaloGroupTitle') || 'Zalo nhóm',
      desc: t('heroPage.campaignDemo.zaloGroupDesc') || 'Đăng bài vào các nhóm Zalo đã tham gia',
      icon: HiOutlineUserGroup,
      gradient: 'from-red-500 to-rose-600',
      border: 'border-red-200',
      hoverBorder: 'hover:border-rose-400',
      iconBg: 'bg-red-100',
      iconColor: 'text-red-600',
      btnBg: 'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700',
      chipBg: 'bg-red-50 text-red-700',
      stats: ['25 nhóm', '7 node', '~16 phút'],
    },
  ];

  const openFlow = (key) => {
    window.dispatchEvent(new CustomEvent('open-campaign-flow', { detail: { flowKey: key } }));
  };

  return (
    <div>
      {/* Header text */}
      <div className="text-center mb-10">
        <span className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-orange-100 text-orange-700 rounded-full text-xs font-bold uppercase tracking-wider mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
          {t('heroPage.campaignDemoBadge') || 'Live Demo'}
        </span>
        <h2 className="text-3xl md:text-4xl font-semibold text-slate-900 mb-4">
          {t('heroPage.campaignDemoTitle') || 'Chiến dịch chạy như thế nào?'}
        </h2>
        <p className="text-slate-600 max-w-2xl mx-auto">
          {t('heroPage.campaignDemoSubtitle') || 'Xem chi tiết các bước (node) mà mỗi chiến dịch sẽ chạy trong hệ thống Founder AI. Bấm vào từng loại để xem mô phỏng trực quan.'}
        </p>
      </div>

      {/* 3 campaign buttons */}
      <div className="grid md:grid-cols-3 gap-5">
        {campaigns.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => openFlow(c.key)}
              onMouseEnter={() => setHovered(c.key)}
              onMouseLeave={() => setHovered(null)}
              className={`group relative text-left bg-white rounded-2xl border-2 ${c.border} ${c.hoverBorder} p-6 transition-all hover:shadow-xl hover:-translate-y-1 overflow-hidden`}
            >
              {/* Decorative gradient strip */}
              <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${c.gradient}`} />

              <div className={`w-14 h-14 rounded-xl ${c.iconBg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                <Icon className={`w-7 h-7 ${c.iconColor}`} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">{c.title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed mb-4 min-h-[3rem]">
                {c.desc}
              </p>

              <div className="flex items-center gap-2 text-[10px] text-slate-500 mb-4">
                {c.stats.map((s, i) => (
                  <span key={i} className={`px-2 py-0.5 ${c.chipBg} rounded-md font-medium`}>
                    {s}
                  </span>
                ))}
              </div>

              <div className={`flex items-center justify-between px-4 py-2.5 ${c.btnBg} text-white rounded-xl font-semibold text-sm shadow-sm group-hover:shadow-md transition-all`}>
                <span className="flex items-center gap-2">
                  <HiOutlinePlay className="w-4 h-4" />
                  Xem mô phỏng
                </span>
                <HiOutlineSparkles className={`w-4 h-4 transition-transform ${hovered === c.key ? 'translate-x-1' : ''}`} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
