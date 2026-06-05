import customerReadRepository from '../../repositories/customer/customerRead.repository.js';
import customerHelperService from './customerHelper.service.js';

class CustomerJourneyService {
  /**
   * Validate customer ownership by user.
   *
   * @param {number} customerId
   * @param {number} userId
   * @returns {Promise<void>}
   */
  async assertCustomerOwnership(customerId, userId) {
    if (!Number.isFinite(customerId)) {
      const error = new Error('ID khách hàng không hợp lệ');
      error.statusCode = 400;
      throw error;
    }

    const customer = await customerReadRepository.findOwnedCustomer(customerId, userId);
    if (!customer) {
      const error = new Error('Không tìm thấy khách hàng');
      error.statusCode = 404;
      throw error;
    }
  }

  /**
   * Get campaign participation list for one customer.
   *
   * @param {object} input
   * @returns {Promise<Array<object>>}
   */
  async getCampaignParticipations({ userId, customerId }) {
    await this.assertCustomerOwnership(customerId, userId);

    const participationRows = await customerReadRepository.getCustomerCampaignParticipations(customerId, userId);

    return participationRows.map((item) => ({
      campaignId: item.id_campaign,
      campaignName: item.campaign_name,
      campaignStatus: item.campaign_status,
      joinedAt: item.joined_at,
      emailReceivedCount: item.email_received_count,
      emailOpenedCount: item.email_opened_count,
      emailClickedCount: item.email_clicked_count,
      hasOpened: item.has_opened,
      hasClicked: item.has_clicked,
      firstEmailSentAt: item.first_email_sent_at,
      lastEmailSentAt: item.last_email_sent_at,
      firstEmailOpenedAt: item.first_email_opened_at,
      lastEmailOpenedAt: item.last_email_opened_at,
      firstEmailClickedAt: item.first_email_clicked_at,
      lastEmailClickedAt: item.last_email_clicked_at,
      lastActivityAt: item.last_activity_at,
    }));
  }

  /**
   * Get timeline journey for one customer (optionally filtered by campaign).
   *
   * @param {object} input
   * @returns {Promise<{timeline:Array<object>,summary:object}>}
   */
  async getJourney({ userId, customerId, campaignId }) {
    await this.assertCustomerOwnership(customerId, userId);

    const campaignIdNum = Number.isFinite(parseInt(campaignId, 10))
      ? parseInt(campaignId, 10)
      : null;

    const [journeyEvents, emailMessages, participationRows] = await Promise.all([
      customerReadRepository.getJourneyEvents({ customerId, campaignIdNum }),
      customerReadRepository.getJourneyEmailMessages({ customerId, campaignIdNum }),
      customerReadRepository.getJourneyCampaignParticipations({ customerId, userId, campaignIdNum }),
    ]);

    const rawJourneyEvents = journeyEvents.map((row) => customerHelperService.mapJourneyEvent(row));
    const existingEventKeys = new Set(
      rawJourneyEvents
        .filter((event) => event.idEmailMessage)
        .map((event) => `${event.eventType}:${event.idEmailMessage}`)
    );

    const derivedEmailEvents = [];
    emailMessages.forEach((message) => {
      const sentAt = message.sent_at || message.created_at;
      if (sentAt && !existingEventKeys.has(`email_sent:${message.id}`)) {
        derivedEmailEvents.push({
          id: `email-sent-${message.id}`,
          eventType: 'email_sent',
          eventChannel: 'email',
          eventData: {
            subject: message.subject,
            emailMessageId: message.id,
            openCount: message.open_count || 0,
            clickCount: message.click_count || 0,
            campaignId: message.id_campaign,
          },
          eventAt: sentAt,
          createdAt: sentAt,
          campaignId: message.id_campaign,
          campaignName: message.campaign_name || null,
          description: `Đã gửi email "${message.subject || 'Không có tiêu đề'}"`,
        });
      }

      if ((message.open_count || 0) > 0 && !existingEventKeys.has(`email_opened:${message.id}`)) {
        const openedAt = message.last_opened_at || message.first_opened_at || sentAt;
        derivedEmailEvents.push({
          id: `email-opened-${message.id}`,
          eventType: 'email_opened',
          eventChannel: 'email',
          eventData: {
            subject: message.subject,
            emailMessageId: message.id,
            openCount: message.open_count || 0,
            campaignId: message.id_campaign,
          },
          eventAt: openedAt,
          createdAt: openedAt,
          campaignId: message.id_campaign,
          campaignName: message.campaign_name || null,
          description: `Đã mở email "${message.subject || 'Không có tiêu đề'}" (${message.open_count || 0} lần)`,
        });
      }

      if ((message.click_count || 0) > 0 && !existingEventKeys.has(`email_clicked:${message.id}`)) {
        const clickedAt = message.first_clicked_at || message.last_opened_at || sentAt;
        derivedEmailEvents.push({
          id: `email-clicked-${message.id}`,
          eventType: 'email_clicked',
          eventChannel: 'email',
          eventData: {
            subject: message.subject,
            emailMessageId: message.id,
            clickCount: message.click_count || 0,
            campaignId: message.id_campaign,
          },
          eventAt: clickedAt,
          createdAt: clickedAt,
          campaignId: message.id_campaign,
          campaignName: message.campaign_name || null,
          description: `Đã click link trong email "${message.subject || 'Không có tiêu đề'}" (${message.click_count || 0} lần)`,
        });
      }
    });

    const timeline = [...rawJourneyEvents, ...derivedEmailEvents]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const summary = {
      campaigns: participationRows.map((item) => ({
        campaignId: item.id_campaign,
        campaignName: item.campaign_name,
        campaignStatus: item.campaign_status,
        joinedAt: item.joined_at,
        emailReceivedCount: item.email_received_count,
        emailOpenedCount: item.email_opened_count,
        emailClickedCount: item.email_clicked_count,
        hasOpened: item.has_opened,
        hasClicked: item.has_clicked,
        lastActivityAt: item.last_activity_at,
      })),
      emailJourney: emailMessages.map((message, index) => ({
        emailIndex: index + 1,
        emailMessageId: message.id,
        campaignId: message.id_campaign,
        campaignName: message.campaign_name,
        subject: message.subject,
        status: message.status,
        sentAt: message.sent_at,
        firstOpenedAt: message.first_opened_at,
        lastOpenedAt: message.last_opened_at,
        openCount: message.open_count || 0,
        firstClickedAt: message.first_clicked_at,
        clickCount: message.click_count || 0,
        hasOpened: (message.open_count || 0) > 0,
        hasClicked: (message.click_count || 0) > 0,
        bodyHtml: message.body_html || null,
        bodyText: message.body_text || null,
      })),
    };

    return { timeline, summary };
  }
}

export default new CustomerJourneyService();
