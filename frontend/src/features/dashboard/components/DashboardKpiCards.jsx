import { Link } from 'react-router-dom';
import { useI18n } from '../../../i18n';

const formatNumber = (value, locale = 'vi') =>
  Number(value || 0).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');
const formatPercent = (value, locale = 'vi') =>
  `${Number(value || 0).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN', { maximumFractionDigits: 1 })}%`;

const ICONS = {
  sent: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
  ),
  failed: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  ),
  email: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  customers: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

/**
 * Thẻ số liệu. `values` có 1 phần tử → một số lớn; có 2 phần tử → hai số cạnh nhau, mỗi số kèm chú thích ngắn.
 */
const KpiCard = ({ testId, label, values, icon, gradient, text, sub, isEmpty, emptyHint, emptyTo, startText }) => (
  <div
    data-testid={testId}
    className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-md transition-all duration-200 group"
  >
    {/* Colored top strip */}
    <div className={`bg-gradient-to-r ${gradient} px-5 pt-4 pb-3`}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-white/80 uppercase tracking-wider">{label}</p>
        <div className="p-1.5 bg-white/20 rounded-lg text-white">
          {icon}
        </div>
      </div>
      <div className={`mt-2 flex items-end gap-6 ${isEmpty ? 'opacity-40' : ''}`}>
        {values.map((item) => (
          <div key={item.caption || 'value'} className="min-w-0">
            {item.caption && (
              <p className="text-[11px] font-medium text-white/80 leading-tight">{item.caption}</p>
            )}
            <p className={`${values.length > 1 ? 'text-[26px]' : 'text-[32px]'} font-bold leading-none tracking-tight text-white ${item.caption ? 'mt-1' : ''}`}>
              {item.value}
            </p>
          </div>
        ))}
      </div>
    </div>

    {/* Bottom section */}
    <div className="px-5 py-3">
      {isEmpty && emptyHint ? (
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-gray-400">{emptyHint}</p>
          {emptyTo && (
            <Link to={emptyTo} className={`text-[11px] font-semibold ${text} hover:underline`}>
              {startText}
            </Link>
          )}
        </div>
      ) : (
        <div className="text-[11px] text-gray-500 leading-relaxed">{sub}</div>
      )}
    </div>
  </div>
);

/** Các chip "Kênh số" — chỉ kênh > 0. */
const ChannelChips = ({ rows, valueKey, label, fn }) => {
  const visible = (rows || []).filter((row) => Number(row[valueKey] || 0) > 0);
  if (visible.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((row) => (
        <span key={row.channel} data-testid={`chip-${row.channel}`} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
          {label(row.channel)}
          <strong className="font-semibold text-gray-800">{fn(row[valueKey])}</strong>
        </span>
      ))}
    </div>
  );
};

/**
 * 4 thẻ của trang Báo cáo (theo bộ lọc): Đã gửi · Chưa gửi được · Email đã mở / đã bấm link · Khách phản hồi.
 * Thẻ email ẩn khi kỳ không có thư nào (tỉ lệ trên 0 thư vô nghĩa).
 *
 * @param {{ overview: { sent, failed, email, clicks, orders }|null }} props
 */
const DashboardKpiCards = ({ overview }) => {
  const { t, locale } = useI18n();
  const fn = (value) => formatNumber(value, locale);
  const channelLabel = (channel) => t(`dashboardReport.channel.${channel}`);

  const sent = overview?.sent || {};
  const failed = overview?.failed || {};
  const email = overview?.email || {};
  const clicks = overview?.clicks || {};
  const orders = overview?.orders || {};

  const sentTotal = Number(sent.total || 0);
  const friendRequests = Number(sent.friendRequests || 0);
  const emailSent = Number(email.sent || 0);
  const ordersByChannel = orders.byChannel || [];
  const orderLine = (key, title) => {
    const parts = ordersByChannel
      .filter((row) => Number(row[key] || 0) > 0)
      .map((row) => `${channelLabel(row.channel)} ${fn(row[key])}`);
    return parts.length > 0 ? <p key={key}>{title}: {parts.join(' · ')}</p> : null;
  };

  const cards = [
    {
      key: 'sent',
      testId: 'kpi-sent',
      label: t('dashboardReport.cards.sent'),
      gradient: 'from-indigo-500 to-indigo-600',
      text: 'text-indigo-600',
      icon: ICONS.sent,
      values: [{ value: fn(sentTotal) }],
      isEmpty: sentTotal === 0 && friendRequests === 0,
      emptyHint: t('dashboard.runCampaignToSend'),
      sub: (
        <div className="space-y-1.5">
          <ChannelChips rows={sent.byChannel} valueKey="sent" label={channelLabel} fn={fn} />
          {friendRequests > 0 && (
            <p data-testid="kpi-friend-requests">{t('dashboardReport.cards.friendRequests', { count: fn(friendRequests) })}</p>
          )}
        </div>
      ),
    },
    {
      key: 'failed',
      testId: 'kpi-failed',
      label: t('dashboardReport.cards.failed'),
      gradient: 'from-rose-500 to-red-500',
      text: 'text-rose-600',
      icon: ICONS.failed,
      values: [{ value: fn(failed.total) }],
      // 0 chưa gửi được là tin tốt, không phải "trạng thái trống".
      isEmpty: false,
      sub: <p>{t('dashboardReport.cards.failedHint')}</p>,
    },
    ...(emailSent > 0
      ? [{
        key: 'email',
        testId: 'kpi-email',
        label: t('dashboardReport.cards.emailEngagement'),
        gradient: 'from-sky-500 to-cyan-500',
        text: 'text-sky-600',
        icon: ICONS.email,
        values: [
          { caption: t('dashboardReport.cards.emailOpened'), value: formatPercent(email.openRate, locale) },
          { caption: t('dashboardReport.cards.emailClicked'), value: formatPercent(email.clickRate, locale) },
        ],
        isEmpty: false,
        sub: (
          <div className="space-y-0.5">
            <p>{t('dashboardReport.cards.emailBase', { count: fn(emailSent) })}</p>
            {Number(clicks.total || 0) > 0 && (
              <p data-testid="kpi-clicks-total">{t('dashboardReport.cards.clicksAllChannels', { count: fn(clicks.total) })}</p>
            )}
          </div>
        ),
      }]
      : []),
    {
      key: 'customers',
      testId: 'kpi-customers',
      label: t('dashboardReport.cards.customers'),
      gradient: 'from-emerald-500 to-green-600',
      text: 'text-emerald-600',
      icon: ICONS.customers,
      values: [
        { caption: t('dashboardReport.cards.leftInfo'), value: fn(orders.pending) },
        { caption: t('dashboardReport.cards.purchased'), value: fn(orders.completed) },
      ],
      isEmpty: Number(orders.pending || 0) === 0 && Number(orders.completed || 0) === 0,
      emptyHint: t('dashboardReport.cards.customersEmpty'),
      sub: (
        <div className="space-y-0.5" data-testid="kpi-customers-by-channel">
          {orderLine('pending', t('dashboardReport.cards.leftInfo'))}
          {orderLine('completed', t('dashboardReport.cards.purchased'))}
        </div>
      ),
    },
  ];

  return (
    <div
      data-testid="dashboard-kpi-cards"
      className={`grid grid-cols-1 sm:grid-cols-2 ${cards.length >= 4 ? 'xl:grid-cols-4' : 'xl:grid-cols-3'} gap-4`}
    >
      {cards.map(({ key, ...card }) => (
        <KpiCard key={key} {...card} startText={t('dashboard.getStarted')} />
      ))}
    </div>
  );
};

export default DashboardKpiCards;
