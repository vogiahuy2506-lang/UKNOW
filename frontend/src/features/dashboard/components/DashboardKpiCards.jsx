const formatNumber = (value) => Number(value || 0).toLocaleString('vi-VN');
const formatPercent = (value) => `${Number(value || 0).toFixed(1)}%`;

/** Icon: briefcase */
const IconCampaign = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2zm-8-4a2 2 0 00-2 2v2h4V5a2 2 0 00-2-2z" />
  </svg>
);

/** Icon: paper plane (send) */
const IconSend = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
  </svg>
);

/** Icon: mail open */
const IconMailOpen = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

/** Icon: cursor click */
const IconClick = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
  </svg>
);

/** Icon: clock (pending order) */
const IconPending = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

/** Icon: check circle (purchased/completed) */
const IconPurchased = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const CARD_STYLES = {
  blue:   { icon: 'bg-blue-50 text-blue-500',   accent: 'border-blue-100' },
  indigo: { icon: 'bg-indigo-50 text-indigo-500', accent: 'border-indigo-100' },
  sky:    { icon: 'bg-sky-50 text-sky-500',      accent: 'border-sky-100' },
  purple: { icon: 'bg-purple-50 text-purple-500', accent: 'border-purple-100' },
  orange: { icon: 'bg-orange-50 text-orange-500', accent: 'border-orange-100' },
  green:  { icon: 'bg-green-50 text-green-500',  accent: 'border-green-100' },
};

/**
 * Single KPI card.
 *
 * @param {object} props
 * @param {string} props.label
 * @param {string} props.value
 * @param {string} props.sub
 * @param {JSX.Element} props.icon
 * @param {'blue'|'indigo'|'sky'|'purple'|'orange'|'green'} props.color
 * @returns {JSX.Element}
 */
const KpiCard = ({ label, value, sub, icon, color = 'blue' }) => {
  const style = CARD_STYLES[color] || CARD_STYLES.blue;
  return (
    <div className={`card p-5 hover:shadow-md transition-shadow duration-200 border-t-2 ${style.accent}`}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-gray-500 leading-tight">{label}</p>
        <div className={`p-2 rounded-lg ${style.icon} shrink-0`}>{icon}</div>
      </div>
      <p className="text-[28px] font-bold leading-none tracking-tight text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-2 leading-relaxed">{sub}</p>}
    </div>
  );
};

/**
 * KPI cards grid — 6 cards: gửi/mở/click từ tổng dòng customer_journey; đơn mua/chờ từ customer_purchases.
 *
 * Card 1: Tổng chiến dịch (campaigns / campaign_runs)
 * Card 2: Tổng gửi (email_sent + zalo_sent trên hành trình)
 * Card 3: Email Open Rate (email_opened / email_sent, cùng nguồn hành trình)
 * Card 4: Click Rate (email_clicked + zalo_clicked trên hành trình)
 * Card 5: Đơn chờ (order_pending trên hành trình + chi tiết kênh từ channels)
 * Card 6: Đã mua (customer_purchases qua overview.channels)
 *
 * @param {object} props
 * @param {object} props.overview
 * @returns {JSX.Element}
 */
const DashboardKpiCards = ({ overview }) => {
  const headline = overview?.headline || {};
  const email = overview?.channels?.email || {};
  const zalo = overview?.channels?.zalo || {};
  const zaloGroup = overview?.channels?.zaloGroup || {};
  const journey = overview?.journeyEvents || {};

  // Journey-sourced metrics
  const emailSent = journey.emailSent || 0;
  const zaloSent = journey.zaloSent || 0;
  const zaloGroupSent = journey.zaloGroupSent || 0;
  const totalSent = emailSent + zaloSent + zaloGroupSent;

  const emailOpened = journey.emailOpened || 0;
  const emailClicked = journey.emailClicked || 0;
  const zaloClicked = journey.zaloClicked || 0;
  const zaloGroupClicked = journey.zaloGroupClicked || 0;
  const orderPending = journey.orderPending || 0;

  // Rates computed from journey counts
  const emailOpenRate = emailSent > 0 ? (emailOpened / emailSent) * 100 : 0;
  const emailClickRate = emailSent > 0 ? (emailClicked / emailSent) * 100 : 0;

  // Per-channel order stats from customer_purchases (via channels)
  const emailPending = email.pendingOrderCount || 0;
  const zaloPending = zalo.pendingOrderCount || 0;
  const zaloGroupPending = zaloGroup.pendingOrderCount || 0;

  const emailCompleted = email.completedOrderCount || 0;
  const zaloCompleted = zalo.completedOrderCount || 0;
  const zaloGroupCompleted = zaloGroup.completedOrderCount || 0;
  const totalCompleted = emailCompleted + zaloCompleted + zaloGroupCompleted;

  const cards = [
    {
      label: 'Tổng chiến dịch',
      value: formatNumber(headline.totalCampaigns),
      sub: `${formatNumber(headline.totalRuns)} lượt chạy • ${formatNumber(headline.runningRuns || 0)} đang chạy`,
      icon: <IconCampaign />,
      color: 'blue',
    },
    {
      label: 'Tổng gửi',
      value: formatNumber(totalSent),
      sub: `Email: ${formatNumber(emailSent)} • Zalo: ${formatNumber(zaloSent)} • Zalo Group: ${formatNumber(zaloGroupSent)}`,
      icon: <IconSend />,
      color: 'indigo',
    },
    {
      label: 'Email Open Rate',
      value: emailSent > 0 ? formatPercent(emailOpenRate) : formatNumber(emailOpened),
      sub: `${formatNumber(emailOpened)} mở`,
      icon: <IconMailOpen />,
      color: 'sky',
    },
    {
      label: 'Click Rate',
      value: emailSent > 0 ? formatPercent(emailClickRate) : formatNumber(emailClicked),
      sub: `Email: ${formatNumber(emailClicked)} • Zalo: ${formatNumber(zaloClicked)} • Zalo Group: ${formatNumber(zaloGroupClicked)}`,
      icon: <IconClick />,
      color: 'purple',
    },
    {
      label: 'Đơn chờ',
      value: formatNumber(orderPending),
      sub: `Email: ${formatNumber(emailPending)} • Zalo: ${formatNumber(zaloPending)} • Zalo Group: ${formatNumber(zaloGroupPending)}`,
      icon: <IconPending />,
      color: 'orange',
    },
    {
      label: 'Đã mua',
      value: formatNumber(totalCompleted),
      sub: `Email: ${formatNumber(emailCompleted)} • Zalo: ${formatNumber(zaloCompleted)} • Zalo Group: ${formatNumber(zaloGroupCompleted)}`,
      icon: <IconPurchased />,
      color: 'green',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {cards.map((card) => (
        <KpiCard key={card.label} {...card} />
      ))}
    </div>
  );
};

export default DashboardKpiCards;
