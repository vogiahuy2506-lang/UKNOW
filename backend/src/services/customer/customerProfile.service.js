import customerReadRepository from '../../repositories/customer/customerRead.repository.js';
import customerHelperService from './customerHelper.service.js';

class CustomerProfileService {
  /**
   * Get customer detail profile with purchases and journey summary.
   *
   * @param {object} input
   * @returns {Promise<object|null>}
   */
  async getById({ userId, customerId }) {
    const customer = await customerReadRepository.getCustomerProfile(customerId, userId);
    if (!customer) return null;

    const purchaseOrderStatusExpr = await customerHelperService.resolvePurchaseOrderStatusExpr('cp');
    const [
      purchases,
      campaignParticipationsRows,
      emailMessages,
      journeyRows,
    ] = await Promise.all([
      customerReadRepository.getCustomerPurchases(customerId, purchaseOrderStatusExpr),
      customerReadRepository.getCustomerCampaignParticipations(customerId, userId),
      customerReadRepository.getCustomerEmailMessages(customerId),
      customerReadRepository.getCustomerRecentJourneyEvents(customerId),
    ]);

    const campaignParticipations = campaignParticipationsRows.map((item) => ({
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

    const emailJourney = emailMessages.map((em, index) => ({
      emailIndex: index + 1,
      emailMessageId: em.id,
      campaignId: em.id_campaign,
      campaignName: em.campaign_name,
      emailTemplateId: em.id_email_template,
      emailTemplateName: em.email_template_name,
      sequenceOrder: em.sequence_message_order,
      subject: em.subject,
      status: em.status,
      sentAt: em.sent_at,
      deliveredAt: em.delivered_at,
      firstOpenedAt: em.first_opened_at,
      lastOpenedAt: em.last_opened_at,
      openCount: em.open_count,
      firstClickedAt: em.first_clicked_at,
      clickCount: em.click_count,
      hasOpened: (em.open_count || 0) > 0,
      hasClicked: (em.click_count || 0) > 0,
    }));

    const emailsReceived = campaignParticipations.reduce((sum, item) => sum + (item.emailReceivedCount || 0), 0);
    const emailsOpened = campaignParticipations.reduce((sum, item) => sum + (item.emailOpenedCount || 0), 0);
    const emailsClicked = campaignParticipations.reduce((sum, item) => sum + (item.emailClickedCount || 0), 0);

    return {
      id: customer.id,
      email: customer.email,
      phone: customer.phone,
      zaloId: customer.zalo_id,
      zaloPhone: customer.zalo_phone,
      fullName: customer.full_name,
      gender: customer.gender,
      customerSource: customer.customer_source,
      hasPurchased: customer.has_purchased,
      totalOrders: customer.total_orders,
      totalSpent: customer.total_spent,
      lastOrderAt: customer.last_order_at,
      emailSubscribed: customer.email_subscribed,
      lastEmailSentAt: customer.last_email_sent_at,
      lastEmailOpenedAt: customer.last_email_opened_at,
      lastZaloSentAt: customer.last_zalo_sent_at,
      emailsReceived,
      emailsOpened,
      emailsClicked,
      notes: customer.notes,
      customFields: customer.custom_fields,
      createdAt: customer.created_at,
      updatedAt: customer.updated_at,
      tags: [],
      purchases: purchases.map((p) => {
        const normalizedOrderStatus = String(p.order_status || '')
          .trim()
          .toLowerCase()
          .replace('onhold', 'on-hold');
        const isInterested =
          normalizedOrderStatus === 'on-hold' ||
          String(p.product_type || '').toLowerCase() === 'interested';
        const statuses = [];
        if (isInterested) {
          statuses.push('Quan tâm');
        } else {
          statuses.push('Đã mua');
        }
        if ((p.email_received_count || 0) > 0) statuses.push('Đã nhận email');
        if (Boolean(p.purchase_event_data?.attributedFromClick) || (p.email_clicked_count || 0) > 0) {
          statuses.push('Đã nhận link khóa học');
        }

        return {
          id: p.id,
          orderId: p.order_id,
          orderStatus: p.order_status || (isInterested ? 'on-hold' : 'completed'),
          productName: p.product_name,
          courseName: p.course_name,
          courseCode: p.course_code,
          amount: p.amount,
          currency: p.currency,
          paymentMethod: p.payment_method,
          purchaseDate: p.purchase_date,
          campaignId: p.id_campaign,
          campaignName: p.campaign_name,
          itemStatus: isInterested ? 'interested' : 'complete',
          statuses,
          emailReceivedCount: p.email_received_count || 0,
          emailClickedCount: p.email_clicked_count || 0,
          attributedFromClick: Boolean(p.purchase_event_data?.attributedFromClick),
          clickAt: p.purchase_event_data?.clickAt || null,
          clickUrl: p.purchase_event_data?.clickUrl || null,
        };
      }),
      campaignParticipations,
      emailJourney,
      journey: journeyRows.map((j) => ({
        id: j.id,
        eventType: j.event_type,
        eventChannel: j.event_channel,
        eventData: j.event_data,
        eventAt: j.event_at,
      })),
    };
  }
}

export default new CustomerProfileService();
