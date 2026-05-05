/**
 * Nhãn hiển thị và mã event_type tương ứng cho thống kê engagement trên trang chi tiết chiến dịch.
 * Khớp với bảng customer_journey (email_* / zalo_*).
 *
 * @param {string} campaignType - Giá trị campaign_type từ API (email | zalo | zalo_group | mixed | ...)
 * @returns {{
 *   sent: { label: string, eventType: string },
 *   opened: { label: string, eventType: string | null, unavailableReason: string | null },
 *   clicked: { label: string, eventType: string }
 * }}
 */
export const getCampaignEngagementStatDefinitions = (campaignType) => {
  const key = String(campaignType || '').trim().toLowerCase();

  if (key === 'zalo' || key === 'zalo_group') {
    return {
      sent: { label: 'Đã gửi', eventType: 'zalo_sent' },
      opened: {
        label: 'Đã mở',
        eventType: null,
        unavailableReason:
          'Kênh Zalo không tracking đã xem tin nhắn',
      },
      clicked: { label: 'Đã click', eventType: 'zalo_clicked' },
    };
  }

  // email, mixed, legacy hoặc không xác định: mặc định theo kênh email
  return {
    sent: { label: 'Đã gửi', eventType: 'email_sent' },
    opened: { label: 'Đã mở', eventType: 'email_opened', unavailableReason: null },
    clicked: { label: 'Đã click', eventType: 'email_clicked' },
  };
};
