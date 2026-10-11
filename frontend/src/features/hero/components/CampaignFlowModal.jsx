import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  HiOutlineX, HiOutlineMail, HiOutlineChatAlt2, HiOutlineUserGroup,
  HiOutlineCheckCircle, HiOutlineLightningBolt,
} from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import { FLOWS } from '../campaignFlowData';

/**
 * Modal mô phỏng flow campaign chạy trong hệ thống Founder AI.
 * Các bước (FLOWS) nằm ở ../campaignFlowData.js và CHỈ gồm node có thật ở trình tạo chiến dịch
 * (CampaignBuilderFlowNodes.jsx). Không có node chờ / điều kiện / rẽ nhánh theo hành vi mở email: độ trễ giữa các tin
 * nằm trong cấu hình node gửi.
 */

// Màu sắc cho từng loại node (theo CampaignBuilderFlowNodes.jsx)
const NODE_COLORS = {
  indigo: { bg: 'bg-indigo-100 dark:bg-indigo-950/40', icon: 'text-indigo-600 dark:text-indigo-400', ring: 'ring-indigo-300 dark:ring-indigo-800' },
  amber: { bg: 'bg-amber-100 dark:bg-amber-950/40', icon: 'text-amber-600 dark:text-amber-400', ring: 'ring-amber-300 dark:ring-amber-800' },
  pink: { bg: 'bg-pink-100 dark:bg-pink-950/40', icon: 'text-pink-600 dark:text-pink-400', ring: 'ring-pink-300 dark:ring-pink-800' },
  orange: { bg: 'bg-orange-100 dark:bg-orange-950/40', icon: 'text-orange-600 dark:text-orange-400', ring: 'ring-orange-300 dark:ring-orange-800' },
  blue: { bg: 'bg-blue-100 dark:bg-blue-950/40', icon: 'text-blue-600 dark:text-blue-400', ring: 'ring-blue-300 dark:ring-blue-800' },
  green: { bg: 'bg-green-100 dark:bg-green-950/40', icon: 'text-green-600 dark:text-green-400', ring: 'ring-green-300 dark:ring-green-800' },
  gray: { bg: 'bg-gray-100 dark:bg-dk-raised', icon: 'text-gray-600 dark:text-dk-text2', ring: 'ring-gray-300 dark:ring-dk-border-strong' },
  violet: { bg: 'bg-violet-100 dark:bg-violet-950/40', icon: 'text-violet-600 dark:text-violet-400', ring: 'ring-violet-300 dark:ring-violet-800' },
};

function NodeCard({ node, isActive, isCompleted, index }) {
  const Icon = node.icon;
  const colors = NODE_COLORS[node.color] || NODE_COLORS.indigo;

  return (
    <div
      className={`relative bg-white dark:bg-dk-surface rounded-xl border-2 transition-all duration-500 ${
        isActive
          ? `border-current ${colors.ring} ring-4 shadow-lg scale-105`
          : isCompleted
          ? 'border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-950/30'
          : 'border-slate-200 dark:border-dk-border opacity-60'
      }`}
      style={{ animationDelay: `${index * 100}ms` }}
    >
      {/* Connection line on top */}
      {index > 0 && (
        <div className={`absolute -top-2 left-1/2 -translate-x-1/2 w-0.5 h-2 ${isCompleted || isActive ? 'bg-green-400' : 'bg-slate-300 dark:bg-dk-border-strong'}`} />
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
            <span className="text-[10px] font-mono text-slate-400 dark:text-dk-muted">
              {String(index + 1).padStart(2, '0')}
            </span>
            <h4 className={`text-xs font-semibold leading-tight ${isActive ? 'text-slate-900 dark:text-dk-text' : 'text-slate-700 dark:text-dk-text2'}`}>
              {node.label}
            </h4>
          </div>
          <p className="text-[10px] text-slate-500 dark:text-dk-muted leading-tight mt-0.5 line-clamp-2">
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
            <p className="text-[11px] text-slate-600 dark:text-dk-text2 mt-0.5">{flow.subtitle}</p>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-slate-500 dark:text-dk-muted">{t('heroPage.campaignFlow.nodes') || 'Số node'}</div>
            <div className={`text-lg font-bold ${flow.textClass} tabular-nums`}>
              {flow.nodes.length}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-dk-muted mb-1">
            <span>{t('heroPage.campaignFlow.executing') || 'Đang thực thi'}</span>
            <span className="font-semibold">
              {Math.max(0, activeIndex)} / {flow.nodes.length}
            </span>
          </div>
          <div className="h-1.5 bg-white dark:bg-dk-surface rounded-full overflow-hidden">
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
            <span
              data-testid="campaign-flow-sample-badge"
              className="ml-auto px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[10px] font-semibold"
            >
              {t('heroPage.campaignFlow.sampleData') || 'Số liệu minh hoạ'}
            </span>
          </div>
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${flow.stats.length}, minmax(0, 1fr))` }}
          >
            {flow.stats.map((stat) => (
              <div key={stat.label} className="bg-white/70 dark:bg-dk-surface/70 rounded-lg p-2 text-center">
                <div className="text-[9px] text-slate-500 dark:text-dk-muted leading-tight">{stat.label}</div>
                <div className={`text-base font-bold ${flow.textClass} tabular-nums leading-tight mt-0.5`}>
                  {stat.value}
                </div>
                {stat.rate && (
                  <div className="text-[9px] text-slate-400 dark:text-dk-muted mt-0.5">{stat.rate}</div>
                )}
              </div>
            ))}
          </div>
          <p data-testid="campaign-flow-sample-note" className="mt-2 text-[10px] leading-snug text-slate-500 dark:text-dk-muted">
            {t('heroPage.campaignFlow.sampleDataNote')}
          </p>
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
      <div className="bg-white dark:bg-dk-surface rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-dk-border flex items-center justify-between bg-gradient-to-r from-slate-50 dark:from-dk-bg to-orange-50/30 dark:to-orange-950/30">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-dk-text">
              {t('heroPage.campaignFlow.title') || 'Mô phỏng chiến dịch'}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-dk-muted mt-0.5">
              {t('heroPage.campaignFlow.subtitle') || 'Các node chạy theo flow thật trong hệ thống'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-dk-raised flex items-center justify-center text-slate-500 dark:text-dk-muted"
            aria-label="Close"
          >
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-5 pt-3 pb-2 border-b border-slate-100 dark:border-dk-border">
          <div className="flex gap-1.5">
            {tabs.map((tab) => {
              const TabIcon = tab.icon;
              const isActive = activeTab === tab.key;
              const colorMap = {
                blue: isActive ? 'bg-blue-500 text-white' : 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-950/60',
                emerald: isActive ? 'bg-emerald-500 text-white' : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-950/60',
                violet: isActive ? 'bg-violet-500 text-white' : 'bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-950/60',
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
        <div className="px-5 py-3 border-t border-slate-100 dark:border-dk-border bg-slate-50/50 dark:bg-dk-inset/50 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-dk-muted">
            <HiOutlineLightningBolt className="w-3 h-3 text-orange-500" />
            <span>{t('heroPage.campaignFlow.footerNote') || 'Mô phỏng minh hoạ, có thể khác cấu hình thật'}</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-900 dark:bg-dk-strong hover:bg-slate-800 dark:hover:bg-dk-border-strong text-white text-xs font-semibold rounded-lg transition-colors"
          >
            {t('heroPage.campaignFlow.close') || 'Đóng'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}