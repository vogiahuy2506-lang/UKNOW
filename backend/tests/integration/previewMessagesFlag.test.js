import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';

const mockVerify = jest.fn().mockResolvedValue(true);
const mockSendMail = jest.fn().mockResolvedValue({
  messageId: '<test-preview-message-id@uknow.test>',
  accepted: ['recipient@test.local'],
});
const mockCreateTransport = jest.fn().mockReturnValue({
  verify: mockVerify,
  sendMail: mockSendMail,
});

jest.unstable_mockModule('nodemailer', () => ({
  default: {
    createTransport: mockCreateTransport,
  },
  createTransport: mockCreateTransport,
}));

let db;
let emailSettingsSmtpService;
let emailSettingsRepository;
let dashboardRepository;
let adminFunnelRepository;
let customerReadRepository;
let customerCampaignJourneyDetailRepository;
let userSendLimitUtil;
let zaloMessageRepository;
let dbHelpers;

let ownerUser;
let testCampaign;
let testCustomer;
let testEmailSetting;

beforeAll(async () => {
  const databaseModule = await import('../../src/config/database.js');
  db = databaseModule.default;
  dbHelpers = await import('./helpers/db.js');
  const smtpModule = await import('../../src/services/email/emailSettingsSmtp.service.js');
  emailSettingsSmtpService = smtpModule.default;
  const repoModule = await import('../../src/repositories/email/emailSettings.repository.js');
  emailSettingsRepository = repoModule.default;
  const dashModule = await import('../../src/repositories/dashboard/dashboard.repository.js');
  dashboardRepository = dashModule.default;
  const funnelModule = await import('../../src/repositories/admin/adminFunnel.repository.js');
  adminFunnelRepository = funnelModule.default;
  const custReadModule = await import('../../src/repositories/customer/customerRead.repository.js');
  customerReadRepository = custReadModule.default;
  const custJourneyModule = await import('../../src/repositories/customer/customerCampaignJourneyDetail.repository.js');
  customerCampaignJourneyDetailRepository = custJourneyModule.default;
  userSendLimitUtil = await import('../../src/utils/userSendLimit.util.js');
  const zaloMsgRepoModule = await import('../../src/repositories/campaign/zaloMessage.repository.js');
  zaloMessageRepository = zaloMsgRepoModule.default;

  // Create test user with helper
  ownerUser = await dbHelpers.createUser({ username: `preview_tester_${Date.now()}` });
  const plan = await dbHelpers.createPlan({
    monthlyEmailLimit: 1000,
    monthlyZaloLimit: 1000,
  });
  await dbHelpers.assignPlanToUser(ownerUser.id, plan.id);

  // Create test campaign
  const campRes = await db.query(
    `INSERT INTO campaigns (id_user, campaign_name, campaign_type, status, total_sent, total_customers)
     VALUES ($1, 'Test Preview Campaign', 'email', 'draft', 0, 0)
     RETURNING id, campaign_name`,
    [ownerUser.id]
  );
  testCampaign = campRes.rows[0];

  // Create test customer
  const custRes = await db.query(
    `INSERT INTO customers (id_user, email, full_name)
     VALUES ($1, 'recipient@test.local', 'Test Recipient')
     RETURNING id, email`,
    [ownerUser.id]
  );
  testCustomer = custRes.rows[0];

  // Create test email setting
  const settingRes = await db.query(
    `INSERT INTO email_settings (id_user, name, email, reply_to, smtp_host, smtp_port, is_verified, status)
     VALUES ($1, 'Tester', 'sender@uknow.test', 'sender@uknow.test', 'smtp.test', 587, true, 'active')
     RETURNING id, email, name`,
    [ownerUser.id]
  );
  testEmailSetting = settingRes.rows[0];
});

afterAll(async () => {
  if (ownerUser?.id) {
    await db.query('DELETE FROM email_messages WHERE id_campaign = $1', [testCampaign?.id]);
    await db.query('DELETE FROM zalo_messages WHERE id_campaign = $1', [testCampaign?.id]);
    await db.query('DELETE FROM customer_journey WHERE id_customer = $1', [testCustomer?.id]);
    await db.query('DELETE FROM campaign_customers WHERE id_campaign = $1', [testCampaign?.id]);
    await db.query('DELETE FROM campaign_participations WHERE id_campaign = $1', [testCampaign?.id]);
    await db.query('DELETE FROM campaigns WHERE id = $1', [testCampaign?.id]);
    await db.query('DELETE FROM customers WHERE id = $1', [testCustomer?.id]);
    await db.query('DELETE FROM email_settings WHERE id = $1', [testEmailSetting?.id]);
    await db.query('DELETE FROM users WHERE id = $1', [ownerUser.id]);
  }
});

describe('Preview Messages Flag & Isolation (Plan 172)', () => {
  it('1. sendCustomEmail ở preview/builder mode ghi bản ghi email_messages với is_preview = true, không ghi journey/campaign stats', async () => {
    const result = await emailSettingsSmtpService.sendCustomEmail({
      userId: ownerUser.id,
      roleCode: 'user',
      ownerContextId: ownerUser.id,
      trackingConfig: { baseUrl: 'https://test.local', isPublic: true, source: 'default' },
      payload: {
        fromEmailId: testEmailSetting.id,
        to: testCustomer.email,
        subject: 'Test Preview Email Subject',
        content: 'Test Preview Email Body',
        htmlContent: '<p>Test Preview Email Body</p>',
        campaignId: testCampaign.id,
        customerId: testCustomer.id,
        isPreviewMode: true,
        isBuilderMode: true,
        saveMessageLog: true,
      },
    }, {
      normalizeEmailList: (v) => Array.isArray(v) ? v : (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []),
      buildTrackedHtml: (h) => h,
      buildMailAttachments: () => [],
      createSmtpTransporter: () => ({ sendMail: mockSendMail, verify: mockVerify }),
      formatUtc7: () => '25/08/2026 15:00:00',
    });

    expect(result.messageId).toBe('<test-preview-message-id@uknow.test>');

    // Tra email_messages: phải có 1 row với is_preview = true, id_run = NULL, id_campaign = testCampaign.id
    const { rows: msgRows } = await db.query(
      `SELECT id, id_campaign, id_run, is_preview, message_id, status, recipient_email
       FROM email_messages
       WHERE recipient_email = $1 AND id_campaign = $2`,
      [testCustomer.email, testCampaign.id]
    );

    expect(msgRows.length).toBe(1);
    expect(msgRows[0].is_preview).toBe(true);
    expect(msgRows[0].id_run).toBeNull();
    expect(msgRows[0].id_campaign).toBe(testCampaign.id);
    expect(msgRows[0].message_id).toBe('<test-preview-message-id@uknow.test>');

    // Kiểm tra customer_journey: KHÔNG có bản ghi nào
    const { rows: journeyRows } = await db.query(
      `SELECT * FROM customer_journey WHERE id_customer = $1`,
      [testCustomer.id]
    );
    expect(journeyRows.length).toBe(0);

    // Kiểm tra campaign_customers: KHÔNG có bản ghi nào
    const { rows: campCustRows } = await db.query(
      `SELECT * FROM campaign_customers WHERE id_campaign = $1`,
      [testCampaign.id]
    );
    expect(campCustRows.length).toBe(0);

    // Kiểm tra campaigns.total_sent: vẫn là 0
    const { rows: campRows } = await db.query(
      `SELECT total_sent FROM campaigns WHERE id = $1`,
      [testCampaign.id]
    );
    expect(campRows[0].total_sent).toBe(0);

    // Kiểm tra customer.last_email_sent_at: vẫn là null
    const { rows: custRows } = await db.query(
      `SELECT last_email_sent_at FROM customers WHERE id = $1`,
      [testCustomer.id]
    );
    expect(custRows[0].last_email_sent_at).toBeNull();
  });

  it('2. insertCampaignZaloMessage ghi bản ghi zalo_messages với is_preview = true', async () => {
    const zaloMsgId = await zaloMessageRepository.insertCampaignZaloMessage({
      campaignId: testCampaign.id,
      runId: null,
      customerId: testCustomer.id,
      nodeId: null,
      channel: 'zalo_personal',
      recipientType: 'phone',
      recipientValue: '0901234567',
      uid: 'zalo_uid_123',
      groupId: null,
      accountId: 1,
      accountName: 'Zalo Account Test',
      messageText: 'Test preview zalo message',
      trackingToken: null,
      trackingBaseUrl: null,
      trackingMetadata: {
        status: 'sent',
        source: 'preview',
      },
      isPreview: true,
    });

    expect(zaloMsgId).toBeTruthy();

    const { rows: zaloRows } = await db.query(
      `SELECT id, id_campaign, id_run, is_preview, channel, recipient_value
       FROM zalo_messages
       WHERE id = $1`,
      [zaloMsgId]
    );

    expect(zaloRows.length).toBe(1);
    expect(zaloRows[0].is_preview).toBe(true);
    expect(zaloRows[0].id_run).toBeNull();
    expect(zaloRows[0].id_campaign).toBe(testCampaign.id);
  });

  it('3. Thống kê Dashboard & Admin Funnel hoàn toàn loại trừ bản ghi preview', async () => {
    // Dashboard metrics
    const metrics = await dashboardRepository.getEmailMetrics({
      userId: ownerUser.id,
      roleCode: 'user',
    });

    expect(metrics.sent_count || 0).toBe(0);
    expect(metrics.opened_unique_count || 0).toBe(0);

    // Admin funnel first send
    const firstSendQuery = `
      SELECT c.id_user AS user_id, MIN(m.sent_at) AS first_sent_at
      FROM (
        SELECT id_campaign, sent_at
        FROM email_messages
        WHERE status = 'sent' AND sent_at IS NOT NULL AND NOT is_preview
        UNION ALL
        SELECT id_campaign, sent_at
        FROM zalo_messages
        WHERE COALESCE(tracking_metadata->>'status', '') = 'sent'
          AND sent_at IS NOT NULL
          AND NOT is_preview
      ) m
      JOIN campaigns c ON c.id = m.id_campaign
      WHERE c.id_user = $1
      GROUP BY c.id_user
    `;
    const { rows: funnelRows } = await db.query(firstSendQuery, [ownerUser.id]);
    expect(funnelRows.length).toBe(0);
  });

  it('4. Customer Read & Customer Journey Detail loại trừ bản ghi preview', async () => {
    const custEmails = await customerReadRepository.getCustomerEmailMessages(testCustomer.id);
    expect(custEmails.length).toBe(0);

    const journeyEmails = await customerCampaignJourneyDetailRepository.findEmailMessages(testCustomer.id, testCampaign.id);
    expect(journeyEmails.length).toBe(0);

    const journeyZalo = await customerCampaignJourneyDetailRepository.findZaloMessages(testCustomer.id, testCampaign.id);
    expect(journeyZalo.length).toBe(0);
  });

  it('5. Quota calculation util loại trừ bản ghi preview khỏi đếm campaign gửi (không bị đếm đúp)', async () => {
    const cycleStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const cycleEnd = new Date(Date.now() + 29 * 24 * 60 * 60 * 1000);

    // 1. Kiểm tra trực tiếp subquery email_messages với NOT is_preview trả về 0
    const { rows: emailMsgCountRows } = await db.query(
      `SELECT COUNT(*)::int AS count
       FROM email_messages em
       JOIN campaigns c ON c.id = em.id_campaign
       WHERE c.id_user = $1
         AND em.status IN ('sent', 'delivered', 'bounced')
         AND NOT em.is_preview`,
      [ownerUser.id]
    );
    expect(emailMsgCountRows[0].count).toBe(0);

    // 2. Kiểm tra trực tiếp subquery zalo_messages với NOT is_preview trả về 0
    const { rows: zaloMsgCountRows } = await db.query(
      `SELECT COUNT(*)::int AS count
       FROM zalo_messages zm
       JOIN campaigns c ON c.id = zm.id_campaign
       WHERE c.id_user = $1
         AND zm.tracking_metadata->>'status' = 'sent'
         AND NOT zm.is_preview`,
      [ownerUser.id]
    );
    expect(zaloMsgCountRows[0].count).toBe(0);

    // 3. countEmailSentInCycle chỉ đếm 1 từ usage_logs (quota preview), không bị đếm đúp thành 2 từ email_messages
    const emailSentCount = await userSendLimitUtil.countEmailSentInCycle(ownerUser.id, cycleStart, cycleEnd);
    expect(emailSentCount).toBe(1);

    // 4. countZaloSentInCycle vẫn là 0 vì test 2 insert directly repository không ghi usage_logs
    const zaloSentCount = await userSendLimitUtil.countZaloSentInCycle(ownerUser.id, cycleStart, cycleEnd);
    expect(zaloSentCount).toBe(0);
  });
});
