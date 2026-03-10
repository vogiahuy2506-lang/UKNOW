import db from '../../config/database.js';
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

    const customerResult = await db.query(
      'SELECT id FROM customers WHERE id = $1 AND id_user = $2',
      [customerId, userId]
    );
    if (customerResult.rows.length === 0) {
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

    const participationResult = await db.query(
      `SELECT cc.id_campaign,
              c.campaign_name,
              c.status AS campaign_status,
              cc.joined_at,
              cc.email_received_count,
              cc.email_opened_count,
              cc.email_clicked_count,
              cc.has_opened,
              cc.has_clicked,
              cc.first_email_sent_at,
              cc.last_email_sent_at,
              cc.first_email_opened_at,
              cc.last_email_opened_at,
              cc.first_email_clicked_at,
              cc.last_email_clicked_at,
              cc.last_activity_at
       FROM campaign_customers cc
       JOIN campaigns c ON c.id = cc.id_campaign
       WHERE cc.id_customer = $1
         AND c.id_user = $2
       ORDER BY cc.last_activity_at DESC NULLS LAST, cc.joined_at DESC`,
      [customerId, userId]
    );

    return participationResult.rows.map((item) => ({
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

    const eventParams = [customerId];
    let eventFilter = '';
    if (Number.isFinite(campaignIdNum)) {
      eventParams.push(campaignIdNum);
      eventFilter = ` AND cj.id_campaign = $${eventParams.length}`;
    }

    const journeyEventsResult = await db.query(
      `SELECT cj.*,
              c.campaign_name
       FROM customer_journey cj
       LEFT JOIN campaigns c ON c.id = cj.id_campaign
       WHERE cj.id_customer = $1
         AND cj.id_run IS NOT NULL
         ${eventFilter}
       ORDER BY cj.event_at DESC
       LIMIT 200`,
      eventParams
    );

    const emailParams = [customerId];
    let emailFilter = '';
    if (Number.isFinite(campaignIdNum)) {
      emailParams.push(campaignIdNum);
      emailFilter = ` AND em.id_campaign = $${emailParams.length}`;
    }

    const emailMessagesResult = await db.query(
      `SELECT em.id,
              em.id_campaign,
              c.campaign_name,
              em.subject,
              em.status,
              em.sent_at,
              em.first_opened_at,
              em.last_opened_at,
              em.open_count,
              em.first_clicked_at,
              em.click_count,
              em.body_html,
              em.body_text,
              em.created_at
       FROM email_messages em
       LEFT JOIN campaigns c ON c.id = em.id_campaign
       WHERE em.id_customer = $1
         AND em.id_run IS NOT NULL
         ${emailFilter}
       ORDER BY COALESCE(em.sent_at, em.created_at) DESC
       LIMIT 200`,
      emailParams
    );

    const participationParams = [customerId, userId];
    let participationFilter = '';
    if (Number.isFinite(campaignIdNum)) {
      participationParams.push(campaignIdNum);
      participationFilter = ` AND cc.id_campaign = $${participationParams.length}`;
    }

    const participationResult = await db.query(
      `SELECT cc.id_campaign,
              c.campaign_name,
              c.status AS campaign_status,
              cc.joined_at,
              cc.email_received_count,
              cc.email_opened_count,
              cc.email_clicked_count,
              cc.has_opened,
              cc.has_clicked,
              cc.last_activity_at
       FROM campaign_customers cc
       JOIN campaigns c ON c.id = cc.id_campaign
       WHERE cc.id_customer = $1
         AND c.id_user = $2
         ${participationFilter}
       ORDER BY cc.last_activity_at DESC NULLS LAST, cc.joined_at DESC`,
      participationParams
    );

    const rawJourneyEvents = journeyEventsResult.rows.map((row) => customerHelperService.mapJourneyEvent(row));
    const existingEventKeys = new Set(
      rawJourneyEvents
        .filter((event) => event.idEmailMessage)
        .map((event) => `${event.eventType}:${event.idEmailMessage}`)
    );

    const derivedEmailEvents = [];
    emailMessagesResult.rows.forEach((message) => {
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
      campaigns: participationResult.rows.map((item) => ({
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
      emailJourney: emailMessagesResult.rows.map((message, index) => ({
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
