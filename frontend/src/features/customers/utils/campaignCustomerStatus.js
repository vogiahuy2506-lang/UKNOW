/**
 * Resolve campaign-specific display status for customer list.
 *
 * @param {object} customer
 * @returns {string|null}
 */
export const resolveCampaignStatus = (customer = {}) => {
  const orderStatus = String(customer.orderStatus || '')
    .trim()
    .toLowerCase()
    .replace('onhold', 'on-hold');

  if (['completed', 'purchased', 'processing'].includes(orderStatus)) return 'completed';
  if (['on-hold', 'on_hold', 'lead', 'interested'].includes(orderStatus)) return 'on-hold';

  if (customer.campaignHasClicked) return 'campaign_clicked';
  if (customer.campaignHasOpened) return 'campaign_opened';
  if ((customer.campaignEmailReceivedCount ?? 0) > 0) return 'campaign_sent';
  return null;
};

/**
 * Map status key to campaign-aware badge label.
 *
 * @param {string|null|undefined} status
 * @param {{ campaignType?: string }} [options]
 * @returns {{ label: string, cls: string } | null}
 */
export const getCampaignStatusMeta = (status, options = {}) => {
  if (!status) return null;

  const campaignType = String(options?.campaignType || '').trim().toLowerCase();
  const isZaloCampaign = campaignType === 'zalo' || campaignType === 'zalo_group';

  const map = {
    completed: { label: 'Đã mua', cls: 'badge-success' },
    purchased: { label: 'Đã mua', cls: 'badge-success' },
    processing: { label: 'Đã mua', cls: 'badge-success' },
    'on-hold': { label: 'Để lại thông tin', cls: 'badge-warning' },
    onhold: { label: 'Để lại thông tin', cls: 'badge-warning' },
    on_hold: { label: 'Để lại thông tin', cls: 'badge-warning' },
    lead: { label: 'Để lại thông tin', cls: 'badge-warning' },
    campaign_clicked: {
      label: isZaloCampaign ? 'Đã nhấp link' : 'Đã click link',
      cls: 'badge-info',
    },
    campaign_opened: {
      label: isZaloCampaign ? 'Đã có tương tác' : 'Đã xem email',
      cls: 'badge-info',
    },
    campaign_sent: {
      label: isZaloCampaign ? 'Đã nhận tin Zalo' : 'Đã nhận email',
      cls: 'badge-gray',
    },
  };

  return map[status] || { label: String(status), cls: 'badge-gray' };
};
