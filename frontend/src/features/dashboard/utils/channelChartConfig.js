/**
 * Cấu hình đường/tab của biểu đồ tương tác theo kênh (DashboardChannelTabs). Tách khỏi component để file
 * component chỉ export component (react-refresh) và để unit test được.
 */

/**
 * Build chart line config based on active channel.
 * Each channel shows its sent count + engagement metrics + its own order breakdown.
 *
 * @param {'all'|'email'|'zalo'|'zalo_group'|'telegram'|'whatsapp'} activeChannel
 * @param {function} [t]
 * @param {{hasTelegram?: boolean, hasWhatsapp?: boolean}} [presence] - "Tất cả" chỉ vẽ đường Telegram/WhatsApp khi có dữ liệu
 * @returns {Array<{key: string, name: string, color: string}>}
 */
export const buildChartConfig = (activeChannel, t, { hasTelegram = false, hasWhatsapp = false } = {}) => {
  const sent = t ? t('sent') : 'Gửi';
  const opened = t ? t('opened') : 'Mở';
  const clicked = t ? t('clicked') : 'Click';
  const downloaded = t ? t('downloaded') : 'Tải tệp';
  const pendingOrders = t ? t('pendingOrders') : 'Đơn chờ';
  const completedOrders = t ? t('completedOrders') : 'Đơn đặt';

  if (activeChannel === 'email') {
    return [
      { key: 'emailSent', name: `${sent} (Email)`, color: '#06b6d4' },
      { key: 'emailOpened', name: `${opened} (Email)`, color: '#0ea5e9' },
      { key: 'emailClicked', name: `${clicked} (Email)`, color: '#6366f1' },
      { key: 'emailDownloads', name: `${downloaded} (Email)`, color: '#f59e0b' },
      { key: 'emailPendingOrders', name: `${pendingOrders} (Email)`, color: '#fb923c' },
      { key: 'emailCompletedOrders', name: `${completedOrders} (Email)`, color: '#22c55e' },
    ];
  }
  if (activeChannel === 'zalo') {
    return [
      { key: 'zaloSent', name: `${sent} (Zalo)`, color: '#2563eb' },
      { key: 'zaloClicks', name: `${clicked} (Zalo)`, color: '#3b82f6' },
      { key: 'zaloPendingOrders', name: `${pendingOrders} (Zalo)`, color: '#fb923c' },
      { key: 'zaloCompletedOrders', name: `${completedOrders} (Zalo)`, color: '#22c55e' },
    ];
  }
  if (activeChannel === 'zalo_group') {
    return [
      { key: 'zaloGroupSent', name: `${sent} (Zalo Group)`, color: '#7c3aed' },
      { key: 'zaloGroupClicks', name: `${clicked} (Zalo Group)`, color: '#8b5cf6' },
      { key: 'zaloGroupPendingOrders', name: `${pendingOrders} (Zalo Group)`, color: '#fb923c' },
      { key: 'zaloGroupCompletedOrders', name: `${completedOrders} (Zalo Group)`, color: '#22c55e' },
    ];
  }
  // Telegram/WhatsApp (P2): chỉ có số tin ĐÃ GỬI theo ngày (campaign_channel_messages) — không có mở/click/đơn.
  if (activeChannel === 'telegram') {
    return [{ key: 'telegramSent', name: `${sent} (Telegram)`, color: '#0891b2' }];
  }
  if (activeChannel === 'whatsapp') {
    return [{ key: 'whatsappSent', name: `${sent} (WhatsApp)`, color: '#16a34a' }];
  }
  // All channels — show sent + engagement metrics (orders are in the dedicated chart)
  return [
    { key: 'emailSent', name: `${sent} (Email)`, color: '#06b6d4' },
    { key: 'emailOpened', name: `${opened} (Email)`, color: '#0ea5e9' },
    { key: 'emailClicked', name: `${clicked} (Email)`, color: '#6366f1' },
    { key: 'emailDownloads', name: `${downloaded} (Email)`, color: '#f59e0b' },
    { key: 'zaloSent', name: `${sent} (Zalo)`, color: '#2563eb' },
    { key: 'zaloClicks', name: `${clicked} (Zalo)`, color: '#3b82f6' },
    { key: 'zaloGroupSent', name: `${sent} (Zalo Group)`, color: '#7c3aed' },
    { key: 'zaloGroupClicks', name: `${clicked} (Zalo Group)`, color: '#8b5cf6' },
    ...(hasTelegram ? [{ key: 'telegramSent', name: `${sent} (Telegram)`, color: '#0891b2' }] : []),
    ...(hasWhatsapp ? [{ key: 'whatsappSent', name: `${sent} (WhatsApp)`, color: '#16a34a' }] : []),
  ];
};

/**
 * Tab kênh hiển thị: 4 tab cũ luôn có; Telegram/WhatsApp chỉ khi khoảng thời gian đã chọn CÓ tin gửi của kênh đó
 * (hoặc đang đứng ở tab đó — không để tab đang chọn biến mất khi đổi khoảng ngày). Tránh làm rối khách không dùng.
 *
 * @param {{hasTelegram: boolean, hasWhatsapp: boolean, activeChannel: string, t: function}} input
 * @returns {Array<{id: string, label: string, color: string}>}
 */
export const buildChannelTabs = ({ hasTelegram, hasWhatsapp, activeChannel, t }) => [
  { id: 'all', label: t('all'), color: 'gray' },
  { id: 'email', label: t('email'), color: 'sky' },
  { id: 'zalo', label: t('zalo'), color: 'blue' },
  { id: 'zalo_group', label: t('zaloGroup'), color: 'purple' },
  ...(hasTelegram || activeChannel === 'telegram' ? [{ id: 'telegram', label: t('telegram'), color: 'cyan' }] : []),
  ...(hasWhatsapp || activeChannel === 'whatsapp' ? [{ id: 'whatsapp', label: t('whatsapp'), color: 'green' }] : []),
];
