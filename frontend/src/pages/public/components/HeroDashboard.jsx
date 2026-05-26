import { useState } from 'react';
import { LuTrendingDown, LuTrendingUp, LuChevronDown, LuX } from 'react-icons/lu';
import HeroGauge from './HeroGauge';
import { useI18n } from '../../../i18n';

function TogglePill({ options, active, onChange }) {
  return (
    <div className="bg-neutral-100 rounded-full p-1 flex gap-1 mt-3">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`flex-1 text-[11px] font-medium px-3 py-1 rounded-full transition-all ${
            active === opt ? 'bg-white shadow text-neutral-900' : 'text-neutral-500'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function CardClicks({ t }) {
  const [activeTab, setActiveTab] = useState(t('heroDashboard.impressions') || 'Impressions');
  return (
    <div className="bg-white rounded-2xl p-5 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[13px] font-semibold text-[#ef4d23]">{t('heroDashboard.clicks') || 'Clicks'}</span>
        <span className="text-[13px] text-neutral-500">{t('dashboard.thisMonth') || 'This Month'}</span>
      </div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[28px] font-semibold text-neutral-900">6,896</span>
        <span className="inline-flex items-center gap-1 bg-red-50 text-red-600 rounded-full px-2 py-0.5 text-[11px]">
          <LuTrendingDown className="w-3 h-3" />
          -3,382 (33%)
        </span>
      </div>
      <p className="text-[11px] text-neutral-400 mb-3">{t('heroDashboard.comparedToYesterday') || 'Compared to yesterday'}</p>
      <p className="text-[12px] text-neutral-500 text-center mb-1">{t('heroDashboard.monthTarget') || 'Month Target achieved'}</p>
      <HeroGauge value={92} showLabels min="389K" max="425K" />
      <TogglePill options={[t('heroDashboard.impressions') || 'Impressions', t('heroDashboard.clicks') || 'Clicks']} active={activeTab} onChange={setActiveTab} />
    </div>
  );
}

function CardForm({ t }) {
  return (
    <div className="bg-white rounded-2xl p-5 flex flex-col gap-3">
      {[
        { label: t('heroDashboard.showFiguresFor') || 'Show figures for', value: t('dashboard.thisMonth') || 'This month' },
        { label: t('heroDashboard.comparePeriodBy') || 'Compare period by', value: t('heroDashboard.mtd') || 'Month-to-date (MTD)' },
      ].map(({ label, value }) => (
        <div key={label}>
          <p className="text-[12px] text-neutral-700 mb-1">{label}</p>
          <button className="w-full flex items-center justify-between border border-neutral-200 rounded-lg px-3 py-2 text-[13px] text-neutral-800">
            {value}
            <LuChevronDown className="w-4 h-4 text-neutral-400" />
          </button>
        </div>
      ))}
      {[
        { label: t('heroDashboard.setTargetsThisMonth') || 'Set targets (This month)', value: 10 },
        { label: t('heroDashboard.setTargetsThisYear') || 'Set targets (This year)', value: 100 },
      ].map(({ label, value }) => (
        <div key={label}>
          <p className="text-[12px] text-neutral-700 mb-1">{label}</p>
          <div className="flex items-center border border-neutral-200 rounded-lg px-3 py-2">
            <span className="text-neutral-400 mr-2 text-[13px]">#</span>
            <input
              defaultValue={value}
              className="w-full text-[13px] text-neutral-800 outline-none bg-transparent"
            />
          </div>
        </div>
      ))}
      <div className="flex items-center gap-3 mt-1">
        <button className="bg-[#ef4d23] text-white text-[13px] font-medium rounded-lg px-5 py-2">
          {t('common.save') || 'Save'}
        </button>
        <button className="text-[13px] text-neutral-500 underline">{t('common.cancel') || 'Cancel'}</button>
        <button className="ml-auto text-neutral-400 hover:text-neutral-600">
          <LuX className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function CardVideoStarts({ t }) {
  const [activeTab, setActiveTab] = useState(t('heroDashboard.videoClicks') || 'Video Clicks');
  return (
    <div className="bg-white rounded-2xl p-5 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[13px] font-semibold text-[#ef4d23]">{t('heroDashboard.videoStarts') || 'Video Starts'}</span>
        <span className="text-[13px] text-neutral-500">{t('dashboard.today') || 'today'}</span>
      </div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[28px] font-semibold text-neutral-900">0</span>
        <span className="inline-flex items-center gap-1 bg-neutral-100 text-neutral-500 rounded-full px-2 py-0.5 text-[11px]">
          <LuTrendingUp className="w-3 h-3" />
          0
        </span>
      </div>
      <p className="text-[11px] text-neutral-400 mb-3">{t('heroDashboard.comparedToYesterday') || 'Compared to yesterday'}</p>
      <HeroGauge value={68} color="#9ca3af" />
      <TogglePill options={[t('heroDashboard.videoClicks') || 'Video Clicks', t('heroDashboard.videoStarts') || 'Video Starts']} active={activeTab} onChange={setActiveTab} />
    </div>
  );
}

export default function HeroDashboard() {
  const { t } = useI18n();
  return (
    <div className="px-3 sm:px-4 w-full">
      <div className="bg-[#f5f2ee] rounded-3xl p-4 sm:p-6 w-full max-w-[880px] mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <CardClicks t={t} />
          <CardForm t={t} />
          <CardVideoStarts t={t} />
        </div>
      </div>
    </div>
  );
}
