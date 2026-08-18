import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  HiOutlineX, HiOutlinePlay, HiOutlineMail, HiOutlineChatAlt2, HiOutlineUserGroup,
  HiOutlineTable,
  HiOutlineUserAdd, HiOutlineClock, HiOutlineCheckCircle, HiOutlineLightningBolt,
  HiOutlineSparkles, HiOutlineGlobe, HiOutlineUsers,
} from 'react-icons/hi';
import { useI18n } from '../../../i18n';

/**
 * Modal mô phỏng flow campaign chạy trong hệ thống Founder AI.
 * Hiển thị các node theo schema thật của campaign builder:
 * - Trigger (manual_trigger)
 * - Data nodes (read_sheet, read_courses_db, read_products_db, read_landing_leads, read_interested_customers, save_customer)
 * - Action nodes (send_email | send_zalo_personal | send_zalo_group | send_zalo_friend_request)
 * - Logic (delay, wait, condition, branch)
 *
 * Source: campaignBuilderFlow.js + CampaignBuilderFlowNodes.jsx
 */

// Định nghĩa flow cho 3 loại campaign theo schema thật
const FLOWS = {
  email: {
    type: 'email',
    title: 'Chiến dịch Email Marketing',
    subtitle: 'Gửi email hàng loạt, theo dõi mở/click/chuyển đổi',
    color: 'blue',
    bgClass: 'bg-blue-50',
    borderClass: 'border-blue-200',
    textClass: 'text-blue-700',
    barClass: 'bg-blue-500',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    nodes: [
      { id: 'trigger', type: 'trigger', label: 'Kích hoạt thủ công', icon: HiOutlinePlay, desc: 'Bắt đầu chiến dịch khi nhấn nút chạy', color: 'indigo' },
      { id: 'data1', type: 'data', label: 'Đọc danh sách khách hàng', icon: HiOutlineTable, desc: 'Lấy từ CRM hoặc Landing Page leads', color: 'amber' },
      { id: 'filter', type: 'logic', label: 'Lọc theo điều kiện', icon: HiOutlineSparkles, desc: 'VD: Khách VIP, đã mua > 1 lần', color: 'pink' },
      { id: 'action', type: 'action', label: 'Gửi Email', icon: HiOutlineMail, desc: 'Template email cá nhân hóa với {{ten_khach}}', color: 'orange' },
      { id: 'wait', type: 'logic', label: 'Chờ 24 giờ', icon: HiOutlineClock, desc: 'Đợi khách hàng mở email', color: 'gray' },
      { id: 'check', type: 'logic', label: 'Kiểm tra đã mở?', icon: HiOutlineCheckCircle, desc: 'Rẽ nhánh: đã mở / chưa mở', color: 'pink' },
      { id: 'follow', type: 'action', label: 'Gửi Email nhắc', icon: HiOutlineMail, desc: 'Email thứ 2 cho khách chưa mở', color: 'orange' },
      { id: 'end', type: 'end', label: 'Kết thúc', icon: HiOutlineCheckCircle, desc: 'Tổng kết kết quả chiến dịch', color: 'green' },
    ],
    stats: [
      { label: 'Khách nhận', value: '1.250' },
      { label: 'Đã mở', value: '687', rate: '55%' },
      { label: 'Click', value: '156', rate: '23%' },
      { label: 'Chuyển đổi', value: '19', rate: '12%' },
    ],
  },
  zalo: {
    type: 'zalo',
    title: 'Chiến dịch Zalo cá nhân',
    subtitle: 'Gửi tin nhắn Zalo OA đến từng khách hàng',
    color: 'emerald',
    bgClass: 'bg-emerald-50',
    borderClass: 'border-emerald-200',
    textClass: 'text-emerald-700',
    barClass: 'bg-emerald-500',
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
    nodes: [
      { id: 'trigger', type: 'trigger', label: 'Kích hoạt thủ công', icon: HiOutlinePlay, desc: 'Bắt đầu chiến dịch', color: 'indigo' },
      { id: 'account', type: 'data', label: 'Chọn tài khoản Zalo OA', icon: HiOutlineUserAdd, desc: 'Chọn 1 hoặc nhiều tài khoản Zalo', color: 'blue' },
      { id: 'friends', type: 'data', label: 'Lấy danh sách bạn bè', icon: HiOutlineUsers, desc: 'Lấy danh sách friend từ tài khoản Zalo', color: 'amber' },
      { id: 'data', type: 'data', label: 'Đọc danh sách khách từ CRM', icon: HiOutlineTable, desc: 'Khách hàng mục tiêu từ hệ thống', color: 'amber' },
      { id: 'merge', type: 'logic', label: 'Đối chiếu & Lọc', icon: HiOutlineSparkles, desc: 'Chỉ gửi cho khách đã kết bạn Zalo OA', color: 'pink' },
      { id: 'delay', type: 'logic', label: 'Delay chống spam', icon: HiOutlineClock, desc: '30-60s giữa mỗi tin nhắn (an toàn Zalo)', color: 'gray' },
      { id: 'action', type: 'action', label: 'Gửi tin nhắn cá nhân', icon: HiOutlineChatAlt2, desc: 'Template Zalo OA với tên khách', color: 'blue' },
      { id: 'end', type: 'end', label: 'Kết thúc', icon: HiOutlineCheckCircle, desc: 'Lưu lịch sử chat vào CRM', color: 'green' },
    ],
    stats: [
      { label: 'Khách nhận', value: '480' },
      { label: 'Gửi thành công', value: '451', rate: '94%' },
      { label: 'Đã đọc', value: '352', rate: '78%' },
      { label: 'Phản hồi', value: '77', rate: '22%' },
    ],
  },
  zalo_group: {
    type: 'zalo_group',
    title: 'Chiến dịch Zalo nhóm',
    subtitle: 'Đăng bài vào các nhóm Zalo đã tham gia',
    color: 'violet',
    bgClass: 'bg-violet-50',
    borderClass: 'border-violet-200',
    textClass: 'text-violet-700',
    barClass: 'bg-violet-500',
    iconBg: 'bg-violet-100',
    iconColor: 'text-violet-600',
    nodes: [
      { id: 'trigger', type: 'trigger', label: 'Kích hoạt thủ công', icon: HiOutlinePlay, desc: 'Bắt đầu chiến dịch', color: 'indigo' },
      { id: 'account', type: 'data', label: 'Chọn tài khoản Zalo', icon: HiOutlineUserAdd, desc: 'Tài khoản đã tham gia nhóm', color: 'blue' },
      { id: 'groups', type: 'data', label: 'Lấy danh sách nhóm', icon: HiOutlineUserGroup, desc: 'Các nhóm Zalo đang tham gia', color: 'amber' },
      { id: 'filter', type: 'logic', label: 'Lọc nhóm mục tiêu', icon: HiOutlineSparkles, desc: 'VD: Nhóm > 100 thành viên, chủ đề phù hợp', color: 'pink' },
      { id: 'delay', type: 'logic', label: 'Delay 5-10 phút', icon: HiOutlineClock, desc: 'Tránh spam giữa các nhóm', color: 'gray' },
      { id: 'action', type: 'action', label: 'Đăng bài vào nhóm', icon: HiOutlineGlobe, desc: 'Nội dung + hình ảnh + link', color: 'violet' },
      { id: 'end', type: 'end', label: 'Kết thúc', icon: HiOutlineCheckCircle, desc: 'Tổng kết reactions và comments', color: 'green' },
    ],
    stats: [
      { label: 'Số nhóm', value: '25' },
      { label: 'Đăng thành công', value: '25', rate: '100%' },
      { label: 'Tổng thành viên', value: '8.450' },
      { label: 'Reactions', value: '342', rate: '4%' },
    ],
  },
};

// Màu sắc cho từng loại node (theo CampaignBuilderFlowNodes.jsx)
const NODE_COLORS = {
  indigo: { bg: 'bg-indigo-100', icon: 'text-indigo-600', ring: 'ring-indigo-300' },
  amber: { bg: 'bg-amber-100', icon: 'text-amber-600', ring: 'ring-amber-300' },
  pink: { bg: 'bg-pink-100', icon: 'text-pink-600', ring: 'ring-pink-300' },
  orange: { bg: 'bg-orange-100', icon: 'text-orange-600', ring: 'ring-orange-300' },
  blue: { bg: 'bg-blue-100', icon: 'text-blue-600', ring: 'ring-blue-300' },
  green: { bg: 'bg-green-100', icon: 'text-green-600', ring: 'ring-green-300' },
  gray: { bg: 'bg-gray-100', icon: 'text-gray-600', ring: 'ring-gray-300' },
  violet: { bg: 'bg-violet-100', icon: 'text-violet-600', ring: 'ring-violet-300' },
};

function NodeCard({ node, isActive, isCompleted, index }) {
  const Icon = node.icon;
  const colors = NODE_COLORS[node.color] || NODE_COLORS.indigo;

  return (
    <div
      className={`relative bg-white rounded-xl border-2 transition-all duration-500 ${
        isActive
          ? `border-current ${colors.ring} ring-4 shadow-lg scale-105`
          : isCompleted
          ? 'border-green-200 bg-green-50/30'
          : 'border-slate-200 opacity-60'
      }`}
      style={{ animationDelay: `${index * 100}ms` }}
    >
      {/* Connection line on top */}
      {index > 0 && (
        <div className={`absolute -top-2 left-1/2 -translate-x-1/2 w-0.5 h-2 ${isCompleted || isActive ? 'bg-green-400' : 'bg-slate-300'}`} />
      )}

      <div className="p-3 flex items-center gap-2.5">
        <div className={`relative w-9 h-9 rounded-lg ${colors.bg} flex items-center justify-center shrink-0`}>
          <Icon className={`w-4 h-4 ${colors.icon}`} />
          {isActive && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 rounded-full animate-ping" />
          )}
          {isActive && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 rounded-full" />
          )}
          {isCompleted && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full flex items-center justify-center">
              <HiOutlineCheckCircle className="w-2.5 h-2.5 text-white" />
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-slate-400">
              {String(index + 1).padStart(2, '0')}
            </span>
            <h4 className={`text-xs font-semibold leading-tight ${isActive ? 'text-slate-900' : 'text-slate-700'}`}>
              {node.label}
            </h4>
          </div>
          <p className="text-[10px] text-slate-500 leading-tight mt-0.5 line-clamp-2">
            {node.desc}
          </p>
        </div>
        {isActive && (
          <div className="shrink-0">
            <div className="flex gap-0.5">
              <div className="w-1 h-3 bg-orange-400 rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
              <div className="w-1 h-3 bg-orange-400 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
              <div className="w-1 h-3 bg-orange-400 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FlowAnimation({ flowKey, onClose: _onClose }) {
  const { t } = useI18n();
  const flow = FLOWS[flowKey];
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    setActiveIndex(-1);
    let i = 0;
    const interval = setInterval(() => {
      setActiveIndex(i);
      i += 1;
      if (i > flow.nodes.length) {
        clearInterval(interval);
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [flowKey, flow.nodes.length]);

  return (
    <div className="space-y-3">
      {/* Header card với type info */}
      <div className={`${flow.bgClass} border ${flow.borderClass} rounded-xl p-4`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg ${flow.iconBg} flex items-center justify-center`}>
            {flowKey === 'email' && <HiOutlineMail className={`w-5 h-5 ${flow.iconColor}`} />}
            {flowKey === 'zalo' && <HiOutlineChatAlt2 className={`w-5 h-5 ${flow.iconColor}`} />}
            {flowKey === 'zalo_group' && <HiOutlineUserGroup className={`w-5 h-5 ${flow.iconColor}`} />}
          </div>
          <div className="flex-1">
            <h3 className={`text-sm font-bold ${flow.textClass}`}>{flow.title}</h3>
            <p className="text-[11px] text-slate-600 mt-0.5">{flow.subtitle}</p>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-slate-500">{t('heroPage.campaignFlow.nodes') || 'Số node'}</div>
            <div className={`text-lg font-bold ${flow.textClass} tabular-nums`}>
              {flow.nodes.length}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
            <span>{t('heroPage.campaignFlow.executing') || 'Đang thực thi'}</span>
            <span className="font-semibold">
              {Math.max(0, activeIndex)} / {flow.nodes.length}
            </span>
          </div>
          <div className="h-1.5 bg-white rounded-full overflow-hidden">
            <div
              className={`h-full ${flow.barClass} transition-all duration-500 ease-out`}
              style={{ width: `${(Math.max(0, activeIndex) / flow.nodes.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Flow nodes */}
      <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
        {flow.nodes.map((node, i) => (
          <NodeCard
            key={node.id}
            node={node}
            index={i}
            isActive={i === activeIndex}
            isCompleted={i < activeIndex || activeIndex >= flow.nodes.length}
          />
        ))}
      </div>

      {/* Stats khi hoàn thành */}
      {activeIndex >= flow.nodes.length && (
        <div className={`${flow.bgClass} border ${flow.borderClass} rounded-xl p-4 animate-in fade-in duration-500`}>
          <div className="flex items-center gap-2 mb-3">
            <HiOutlineCheckCircle className={`w-4 h-4 ${flow.iconColor}`} />
            <h4 className={`text-xs font-bold ${flow.textClass}`}>
              {t('heroPage.campaignFlow.results') || 'Kết quả chiến dịch'}
            </h4>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {flow.stats.map((stat) => (
              <div key={stat.label} className="bg-white/70 rounded-lg p-2 text-center">
                <div className="text-[9px] text-slate-500 leading-tight">{stat.label}</div>
                <div className={`text-base font-bold ${flow.textClass} tabular-nums leading-tight mt-0.5`}>
                  {stat.value}
                </div>
                {stat.rate && (
                  <div className="text-[9px] text-slate-400 mt-0.5">{stat.rate}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CampaignFlowModal({ open, flowKey, onClose }) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState('email');

  useEffect(() => {
    if (flowKey && FLOWS[flowKey]) {
      setActiveTab(flowKey);
    }
  }, [flowKey]);

  if (!open) return null;

  const tabs = [
    { key: 'email', label: 'Email', icon: HiOutlineMail, color: 'blue' },
    { key: 'zalo', label: 'Zalo cá nhân', icon: HiOutlineChatAlt2, color: 'emerald' },
    { key: 'zalo_group', label: 'Zalo nhóm', icon: HiOutlineUserGroup, color: 'violet' },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-orange-50/30">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {t('heroPage.campaignFlow.title') || 'Mô phỏng chiến dịch'}
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {t('heroPage.campaignFlow.subtitle') || 'Các node chạy theo flow thật trong hệ thống'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500"
            aria-label="Close"
          >
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-5 pt-3 pb-2 border-b border-slate-100">
          <div className="flex gap-1.5">
            {tabs.map((tab) => {
              const TabIcon = tab.icon;
              const isActive = activeTab === tab.key;
              const colorMap = {
                blue: isActive ? 'bg-blue-500 text-white' : 'bg-blue-50 text-blue-600 hover:bg-blue-100',
                emerald: isActive ? 'bg-emerald-500 text-white' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100',
                violet: isActive ? 'bg-violet-500 text-white' : 'bg-violet-50 text-violet-600 hover:bg-violet-100',
              };
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${colorMap[tab.color]}`}
                >
                  <TabIcon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <FlowAnimation key={activeTab} flowKey={activeTab} onClose={onClose} />
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <HiOutlineLightningBolt className="w-3 h-3 text-orange-500" />
            <span>{t('heroPage.campaignFlow.autoLoop') || 'Tự động chạy lại'}</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            {t('heroPage.campaignFlow.close') || 'Đóng'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}