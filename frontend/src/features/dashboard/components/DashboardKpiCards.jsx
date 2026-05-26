import { Link } from 'react-router-dom';
import { useI18n } from '../../../i18n';

const formatNumber = (value) => Number(value || 0).toLocaleString('vi-VN');
const formatPercent = (value) => `${Number(value || 0).toFixed(1)}%`;

const CARDS_CONFIG = (t) => [
  {
    key: 'campaign',
    label: t('dashboard.totalCampaigns'),
    gradient: 'from-blue-500 to-blue-600',
    bg: 'bg-blue-50',
    text: 'text-blue-600',
    emptyHint: t('dashboard.createFirstCampaign'),
    emptyTo: '/app/campaigns/new',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2zm-8-4a2 2 0 00-2 2v2h4V5a2 2 0 00-2-2z" />
      </svg>
    ),
  },
  {
    key: 'sent',
    label: t('dashboard.totalSent'),
    gradient: 'from-indigo-500 to-indigo-600',
    bg: 'bg-indigo-50',
    text: 'text-indigo-600',
    emptyHint: t('dashboard.runCampaignToSend'),
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
      </svg>
    ),
  },
  {
    key: 'openRate',
    label: t('dashboard.emailOpenRate'),
    gradient: 'from-sky-500 to-cyan-500',
    bg: 'bg-sky-50',
    text: 'text-sky-600',
    emptyHint: t('dashboard.noEmailsOpened'),
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    key: 'clickRate',
    label: t('dashboard.clickRate'),
    gradient: 'from-violet-500 to-purple-600',
    bg: 'bg-violet-50',
    text: 'text-violet-600',
    emptyHint: t('dashboard.noClicks'),
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
      </svg>
    ),
  },
  {
    key: 'pending',
    label: t('dashboard.pendingOrders'),
    gradient: 'from-orange-500 to-amber-500',
    bg: 'bg-orange-50',
    text: 'text-orange-600',
    emptyHint: t('dashboard.noOrders'),
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: 'completed',
    label: t('dashboard.completedOrders'),
    gradient: 'from-emerald-500 to-green-600',
    bg: 'bg-emerald-50',
    text: 'text-emerald-600',
    emptyHint: t('dashboard.noCompletedOrders'),
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

const KpiCard = ({ label, value, sub, icon, gradient, text, isEmpty, emptyHint, emptyTo, startText }) => {
  const { t } = useI18n();
  const _startText = startText || t('dashboardKpiCards.getStarted');

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-md transition-all duration-200 group">
      {/* Colored top strip */}
      <div className={`bg-gradient-to-r ${gradient} px-5 pt-4 pb-3`}>
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-white/80 uppercase tracking-wider">{label}</p>
          <div className="p-1.5 bg-white/20 rounded-lg text-white">
            {icon}
          </div>
        </div>
        <p className={`text-[32px] font-bold leading-none tracking-tight text-white mt-2 ${isEmpty ? 'opacity-40' : ''}`}>
          {value}
        </p>
      </div>

      {/* Bottom section */}
      <div className="px-5 py-3">
        {isEmpty ? (
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-gray-400">{emptyHint}</p>
            {emptyTo && (
              <Link to={emptyTo} className={`text-[11px] font-semibold ${text} hover:underline`}>
                {_startText}
              </Link>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-gray-500 leading-relaxed">{sub}</p>
        )}
      </div>
    </div>
  );
};

const DashboardKpiCards = ({ overview }) => {
  const { t } = useI18n();
  const cardsConfig = CARDS_CONFIG(t);

  const headline = overview?.headline || {};
  const email = overview?.channels?.email || {};
  const zalo = overview?.channels?.zalo || {};
  const zaloGroup = overview?.channels?.zaloGroup || {};
  const journey = overview?.journeyEvents || {};

  const emailSent = journey.emailSent || 0;
  const zaloSent = journey.zaloSent || 0;
  const zaloGroupSent = journey.zaloGroupSent || 0;
  const totalSent = emailSent + zaloSent + zaloGroupSent;

  const emailOpened = journey.emailOpened || 0;
  const emailClicked = journey.emailClicked || 0;
  const zaloClicked = journey.zaloClicked || 0;
  const zaloGroupClicked = journey.zaloGroupClicked || 0;
  const orderPending = journey.orderPending || 0;

  const emailOpenRate = emailSent > 0 ? (emailOpened / emailSent) * 100 : 0;
  const emailClickRate = emailSent > 0 ? (emailClicked / emailSent) * 100 : 0;

  const emailPending = email.pendingOrderCount || 0;
  const zaloPending = zalo.pendingOrderCount || 0;
  const zaloGroupPending = zaloGroup.pendingOrderCount || 0;

  const emailCompleted = email.completedOrderCount || 0;
  const zaloCompleted = zalo.completedOrderCount || 0;
  const zaloGroupCompleted = zaloGroup.completedOrderCount || 0;
  const totalCompleted = emailCompleted + zaloCompleted + zaloGroupCompleted;

  const cards = [
    {
      key: 'campaign',
      value: formatNumber(headline.totalCampaigns),
      sub: `${formatNumber(headline.totalRuns)} ${t('dashboard.runs')} • ${formatNumber(headline.runningRuns || 0)} ${t('dashboard.running')}`,
      isEmpty: !headline.totalCampaigns,
    },
    {
      key: 'sent',
      value: formatNumber(totalSent),
      sub: t('dashboardKpiCards.channelBreakdown', {
        email: formatNumber(emailSent),
        zalo: formatNumber(zaloSent),
        group: formatNumber(zaloGroupSent),
      }),
      isEmpty: !totalSent,
    },
    {
      key: 'openRate',
      value: emailSent > 0 ? formatPercent(emailOpenRate) : formatNumber(emailOpened),
      sub: `${formatNumber(emailOpened)} ${t('dashboard.opened')}`,
      isEmpty: !emailOpened,
    },
    {
      key: 'clickRate',
      value: emailSent > 0 ? formatPercent(emailClickRate) : formatNumber(emailClicked),
      sub: t('dashboardKpiCards.channelBreakdown', {
        email: formatNumber(emailClicked),
        zalo: formatNumber(zaloClicked),
        group: formatNumber(zaloGroupClicked),
      }),
      isEmpty: !emailClicked && !zaloClicked,
    },
    {
      key: 'pending',
      value: formatNumber(orderPending),
      sub: t('dashboardKpiCards.channelBreakdown', {
        email: formatNumber(emailPending),
        zalo: formatNumber(zaloPending),
        group: formatNumber(zaloGroupPending),
      }),
      isEmpty: !orderPending,
    },
    {
      key: 'completed',
      value: formatNumber(totalCompleted),
      sub: t('dashboardKpiCards.channelBreakdown', {
        email: formatNumber(emailCompleted),
        zalo: formatNumber(zaloCompleted),
        group: formatNumber(zaloGroupCompleted),
      }),
      isEmpty: !totalCompleted,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {cards.map((card) => {
        const { key, ...cardProps } = card;
        const cfg = cardsConfig.find(c => c.key === key);
        return (
          <KpiCard
            key={key}
            {...cardProps}
            label={cfg?.label || key}
            icon={cfg?.icon}
            gradient={cfg?.gradient}
            text={cfg?.text}
            emptyHint={cfg?.emptyHint}
            emptyTo={cfg?.emptyTo}
            startText={t('dashboard.getStarted')}
          />
        );
      })}
    </div>
  );
};

export default DashboardKpiCards;
