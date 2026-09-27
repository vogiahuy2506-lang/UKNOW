import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, jest } from '@jest/globals';

/**
 * PR-7b (PLAN_ON_DINH_GUI_CHIEN_DICH_2026-09-26), SỬA 27/09 lần 3 — cửa sổ chống trùng liên-run.
 *
 * Khoá LUÔN có id_node (không còn nhánh "chiến dịch có >1 node cùng kênh"): lưu flow đổi id_node
 * là gửi nội dung MỚI cố ý (vụ 396); chỉ dừng lượt rồi tạo lượt mới ngay — CÙNG id_node — mới là
 * trùng thật (vụ 376→377: 118 người).
 *
 * Ba nhóm test:
 * 1. Repository-level (email + zalo), CSDL thật — biên cửa sổ 24h + khoá id_node.
 * 2. Full integration qua campaignRunService.executeCampaign() thật (chỉ mock nodemailer).
 * 3. Múi giờ: describe riêng chạy với process.env.TZ='UTC' (mô phỏng container production) — vì
 *    mốc cửa sổ tính bằng LOCALTIMESTAMP trong SQL (không nhận JS Date), và giờ gửi cũ đọc bằng
 *    `created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'` ép kiểu timestamptz tường minh, cả hai đều phải
 *    cho kết quả ĐÚNG bất kể process.env.TZ là gì.
 *
 * [CHÚ THÍCH NÀY VIẾT TRƯỚC PR-T1 (27/09 chiều), NAY ĐÃ SAI MỘT PHẦN — giữ lại để thấy lý do gốc
 * của Mutation (b), không xoá]: lúc viết, CSDL 5433 (bootstrap.sql) còn khai báo
 * email_messages/zalo_messages.created_at là TIMESTAMPTZ (khác production, TIMESTAMP không múi
 * giờ — xem project_email_sent_at_luu_gio_utc), nên trên cột TIMESTAMPTZ, so sánh bằng tham số JS
 * Date vẫn ra ĐÚNG kết quả dù process.env.TZ là gì (node-pg luôn gửi kèm offset chính xác cho kiểu
 * có múi giờ) — một test "gửi email thật, kiểm dữ liệu 25 tuổi" khi đó KHÔNG thể phân biệt được 2
 * cách viết. Từ PR-T1 (commit 21c1c0b9, 27/09 chiều), bootstrap.sql đã đổi 2 cột này sang TIMESTAMP
 * đúng như production, nên bug NAY CŨNG lộ trên CSDL test — nhưng Mutation (b) vẫn giữ nguyên bằng
 * test kiểm THẲNG câu SQL/tham số (spy vào db.query, xem describe "Mutation (b)" cuối file) vì đó
 * là cách bắt lỗi ở tầng code, không phụ thuộc timing/độ trễ của dữ liệu thật.
 */

const mockSendMail = jest.fn().mockResolvedValue({
  messageId: '<test-pr7b@uknow.test>',
  accepted: ['recipient@example.com'],
});
const mockCreateTransport = jest.fn().mockReturnValue({
  verify: jest.fn().mockResolvedValue(true),
  sendMail: mockSendMail,
});

jest.unstable_mockModule('nodemailer', () => ({
  default: { createTransport: mockCreateTransport },
  createTransport: mockCreateTransport,
}));

const savedInitialEnv = {
  SMTP_SECRET_KEY: process.env.SMTP_SECRET_KEY,
  TEST_SEND_EMAIL: process.env.TEST_SEND_EMAIL,
  BULLMQ_ENABLED: process.env.BULLMQ_ENABLED,
};
process.env.SMTP_SECRET_KEY = process.env.SMTP_SECRET_KEY || 'integration-test-smtp-secret-key';
process.env.TEST_SEND_EMAIL = '1';
process.env.BULLMQ_ENABLED = 'false';

const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser } = await import('./helpers/db.js');
const campaignRunService = (await import('../../src/services/campaign/campaignRun.service.js')).default;
const { encryptSmtpSecret } = await import('../../src/utils/smtpSecretCrypto.js');
const emailSettingsRepository = (await import('../../src/repositories/email/emailSettings.repository.js')).default;
const zaloMessageRepository = (await import('../../src/repositories/campaign/zaloMessage.repository.js')).default;
const { registerOutboundMessageProcessors } = await import('../../src/services/queue/outboundMessageProcessorRegistry.js');

registerOutboundMessageProcessors();

describe('Integration — PR-7b cửa sổ chống trùng liên-run (CAMPAIGN_CROSS_RUN_DEDUPE_HOURS)', () => {
  let user;

  beforeEach(async () => {
    await truncateAll();
    mockSendMail.mockClear();
    user = await createUser({
      email: `pr7b_owner_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`,
    });
  });

  afterEach(() => {
    campaignRunService.activeRunIds.clear();
    campaignRunService.continuousRunIds.clear();
  });

  afterAll(() => {
    for (const [key, val] of Object.entries(savedInitialEnv)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
  });

  // ── Fixture helpers ─────────────────────────────────────────────────────────

  async function insertCampaign(campaignType = 'email') {
    const { rows } = await db.query(
      `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name, campaign_type, status)
       VALUES ($1, $1, 'PR-7b Campaign', $2, 'active') RETURNING id`,
      [user.id, campaignType]
    );
    return rows[0].id;
  }

  async function insertRun(campaignId) {
    const { rows } = await db.query(
      `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, run_type, status)
       VALUES ($1, $2, 'manual', 'running') RETURNING id`,
      [campaignId, user.id]
    );
    return rows[0].id;
  }

  async function insertOldEmailMessage({ campaignId, runId, nodeId, recipientEmail, emailStep = 1, hoursAgo }) {
    const { rows } = await db.query(
      `INSERT INTO email_messages (id_campaign, id_run, id_node, recipient_email, email_step, status, sent_at, created_at)
       VALUES ($1, $2, $3, $4, $5, 'sent', NOW() - ($6::text || ' hours')::interval, NOW() - ($6::text || ' hours')::interval)
       RETURNING id, (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS created_at`,
      [campaignId, runId, nodeId, recipientEmail, emailStep, hoursAgo]
    );
    return rows[0];
  }

  async function insertOldZaloMessage({ campaignId, runId, nodeId, channel, recipientValue, stepIndex = 1, hoursAgo }) {
    const { rows } = await db.query(
      `INSERT INTO zalo_messages (
         id_campaign, id_run, id_node, channel, recipient_type, recipient_value, tracking_token,
         tracking_metadata, sent_at, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, 'phone', $5, $6, $7::jsonb,
         NOW() - ($8::text || ' hours')::interval, NOW() - ($8::text || ' hours')::interval, NOW()
       ) RETURNING id, (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS created_at`,
      [
        campaignId, runId, nodeId, channel, recipientValue,
        `tok_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        JSON.stringify({ status: 'sent', stepIndex }),
        hoursAgo,
      ]
    );
    return rows[0];
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 1. Repository-level — query mới chạy thật trên CSDL 5433, khoá LUÔN có id_node
  // ═════════════════════════════════════════════════════════════════════════

  describe('emailSettingsRepository.findExistingSentCampaignEmailCrossRun', () => {
    it('run A sent 2h trước, CÙNG id_node → tìm thấy', async () => {
      const campaignId = await insertCampaign('email');
      const runA = await insertRun(campaignId);
      const runB = await insertRun(campaignId);
      const recipientEmail = `pr7b_repo_2h_${Date.now()}@example.com`;
      await insertOldEmailMessage({ campaignId, runId: runA, nodeId: 111, recipientEmail, hoursAgo: 2 });

      const found = await emailSettingsRepository.findExistingSentCampaignEmailCrossRun({
        ownRunId: runB,
        campaignId,
        nodeId: 111,
        recipientEmail,
        emailStep: 1,
        windowHours: 24,
      });

      expect(found).not.toBeNull();
      expect(found.id_run).toBe(runA);
    });

    it('run A sent 25h trước (ngoài cửa sổ 24h) → không tìm thấy', async () => {
      const campaignId = await insertCampaign('email');
      const runA = await insertRun(campaignId);
      const runB = await insertRun(campaignId);
      const recipientEmail = `pr7b_repo_25h_${Date.now()}@example.com`;
      await insertOldEmailMessage({ campaignId, runId: runA, nodeId: 111, recipientEmail, hoursAgo: 25 });

      const found = await emailSettingsRepository.findExistingSentCampaignEmailCrossRun({
        ownRunId: runB,
        campaignId,
        nodeId: 111,
        recipientEmail,
        emailStep: 1,
        windowHours: 24,
      });

      expect(found).toBeNull();
    });

    it('id_node KHÔNG khớp (lưu flow đổi id_node) → không tìm thấy dù trong 2h', async () => {
      const campaignId = await insertCampaign('email');
      const runA = await insertRun(campaignId);
      const runB = await insertRun(campaignId);
      const recipientEmail = `pr7b_repo_nodemismatch_${Date.now()}@example.com`;
      await insertOldEmailMessage({ campaignId, runId: runA, nodeId: 222, recipientEmail, hoursAgo: 2 });

      const found = await emailSettingsRepository.findExistingSentCampaignEmailCrossRun({
        ownRunId: runB,
        campaignId,
        nodeId: 333,
        recipientEmail,
        emailStep: 1,
        windowHours: 24,
      });

      expect(found).toBeNull();
    });
  });

  describe('zaloMessageRepository.findExistingSentCampaignZaloMessageCrossRun', () => {
    it('run A sent 2h trước, CÙNG id_node → tìm thấy', async () => {
      const campaignId = await insertCampaign('zalo');
      const runA = await insertRun(campaignId);
      const runB = await insertRun(campaignId);
      const phone = `0900${Date.now().toString().slice(-6)}`;
      await insertOldZaloMessage({
        campaignId, runId: runA, nodeId: 111, channel: 'zalo_personal', recipientValue: phone, hoursAgo: 2,
      });

      const found = await zaloMessageRepository.findExistingSentCampaignZaloMessageCrossRun({
        ownRunId: runB,
        campaignId,
        nodeId: 111,
        channel: 'zalo_personal',
        recipientKey: phone,
        zaloStep: 1,
        windowHours: 24,
      });

      expect(found).not.toBeNull();
      expect(found.id_run).toBe(runA);
    });

    it('run A sent 25h trước (ngoài cửa sổ 24h) → không tìm thấy', async () => {
      const campaignId = await insertCampaign('zalo');
      const runA = await insertRun(campaignId);
      const runB = await insertRun(campaignId);
      const phone = `0901${Date.now().toString().slice(-6)}`;
      await insertOldZaloMessage({
        campaignId, runId: runA, nodeId: 111, channel: 'zalo_personal', recipientValue: phone, hoursAgo: 25,
      });

      const found = await zaloMessageRepository.findExistingSentCampaignZaloMessageCrossRun({
        ownRunId: runB,
        campaignId,
        nodeId: 111,
        channel: 'zalo_personal',
        recipientKey: phone,
        zaloStep: 1,
        windowHours: 24,
      });

      expect(found).toBeNull();
    });

    it('id_node KHÔNG khớp (lưu flow đổi id_node) → không tìm thấy dù trong 2h', async () => {
      const campaignId = await insertCampaign('zalo');
      const runA = await insertRun(campaignId);
      const runB = await insertRun(campaignId);
      const phone = `0902${Date.now().toString().slice(-6)}`;
      await insertOldZaloMessage({
        campaignId, runId: runA, nodeId: 222, channel: 'zalo_friend_request', recipientValue: phone, hoursAgo: 2,
      });

      const found = await zaloMessageRepository.findExistingSentCampaignZaloMessageCrossRun({
        ownRunId: runB,
        campaignId,
        nodeId: 333,
        channel: 'zalo_friend_request',
        recipientKey: phone,
        zaloStep: 1,
        windowHours: 24,
      });

      expect(found).toBeNull();
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 2. Full integration qua campaignRunService.executeCampaign() thật (send_email)
  // ═════════════════════════════════════════════════════════════════════════

  describe('send_email node qua executeCampaign() thật', () => {
    async function setupEmailCampaign() {
      const campaignId = await insertCampaign('email');
      const senderEmail = `pr7b_sender_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`;
      const { rows: sRows } = await db.query(
        `INSERT INTO email_settings (id_user, name, email, smtp_host, smtp_port, smtp_username, smtp_password, status, is_verified)
         VALUES ($1, 'PR-7b Sender', $2, 'smtp.example.com', 465, $2, $3, 'active', true) RETURNING id`,
        [user.id, senderEmail, encryptSmtpSecret('secret123')]
      );
      return { campaignId, emailSettingId: sRows[0].id };
    }

    async function insertEmailNode(campaignId, { recipientEmails, executionOrder, fromEmailId }) {
      const { rows } = await db.query(
        `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, config, execution_order)
         VALUES ($1, 'action', 'send_email', 'Send Email', $2, $3) RETURNING id`,
        [
          campaignId,
          JSON.stringify({
            recipientSource: 'manual',
            recipientEmails,
            fromEmailId,
            emailSubject: 'PR-7b Subject',
            emailBody: '<p>Body</p>',
          }),
          executionOrder,
        ]
      );
      return rows[0].id;
    }

    it('lưu flow giữa 2 lượt (id_node đổi) → GỬI (nội dung mới, cố ý — vụ 396)', async () => {
      const { campaignId, emailSettingId } = await setupEmailCampaign();
      const recipientEmail = `pr7b_e2e_flowsaved_${Date.now()}@example.com`;
      const nodeId = await insertEmailNode(campaignId, {
        recipientEmails: recipientEmail, executionOrder: 1, fromEmailId: emailSettingId,
      });

      const runA = await insertRun(campaignId);
      // id_node CỐ Ý khác node hiện tại — mô phỏng lưu flow giữa run A và B (node cũ đã bị xoá,
      // thay bằng node mới id khác dù cùng vị trí trong flow).
      await insertOldEmailMessage({
        campaignId, runId: runA, nodeId: nodeId + 987654, recipientEmail, hoursAgo: 2,
      });

      const runB = await insertRun(campaignId);
      await campaignRunService.executeCampaign(campaignId, runB, user.id);

      expect(mockSendMail).toHaveBeenCalledTimes(1);
    }, 20000);

    it('dừng lượt A rồi tạo lượt B cùng flow trong 2h (CÙNG id_node) → bỏ qua (mẫu trùng thật 376→377)', async () => {
      const { campaignId, emailSettingId } = await setupEmailCampaign();
      const recipientEmail = `pr7b_e2e_samenode_2h_${Date.now()}@example.com`;
      const nodeId = await insertEmailNode(campaignId, {
        recipientEmails: recipientEmail, executionOrder: 1, fromEmailId: emailSettingId,
      });

      const runA = await insertRun(campaignId);
      // KHÔNG lưu flow giữa 2 lượt — id_node của dòng cũ CHÍNH LÀ node đang chạy ở run B.
      await insertOldEmailMessage({ campaignId, runId: runA, nodeId, recipientEmail, hoursAgo: 2 });

      const runB = await insertRun(campaignId);
      await campaignRunService.executeCampaign(campaignId, runB, user.id);

      expect(mockSendMail).not.toHaveBeenCalled();
      const { rows } = await db.query('SELECT COUNT(*)::int AS c FROM email_messages WHERE id_run = $1', [runB]);
      expect(rows[0].c).toBe(0);
    }, 20000);

    it('run B sau 25h (cùng id_node) → cửa sổ hết hạn, gửi lại bình thường', async () => {
      const { campaignId, emailSettingId } = await setupEmailCampaign();
      const recipientEmail = `pr7b_e2e_25h_${Date.now()}@example.com`;
      const nodeId = await insertEmailNode(campaignId, {
        recipientEmails: recipientEmail, executionOrder: 1, fromEmailId: emailSettingId,
      });

      const runA = await insertRun(campaignId);
      await insertOldEmailMessage({ campaignId, runId: runA, nodeId, recipientEmail, hoursAgo: 25 });

      const runB = await insertRun(campaignId);
      await campaignRunService.executeCampaign(campaignId, runB, user.id);

      expect(mockSendMail).toHaveBeenCalledTimes(1);
    }, 20000);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 3. Múi giờ — process.env.TZ='UTC' mô phỏng container production
  // ═════════════════════════════════════════════════════════════════════════

  describe('Múi giờ — process.env.TZ=UTC (mô phỏng container production)', () => {
    let savedTz;

    beforeAll(() => {
      savedTz = process.env.TZ;
      process.env.TZ = 'UTC';
    });

    afterAll(() => {
      if (savedTz === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = savedTz;
      }
    });

    it('dòng 25h tuổi (TZ=UTC) → cửa sổ tính bằng LOCALTIMESTAMP vẫn đúng, GỬI lại', async () => {
      const campaignId = await insertCampaign('email');
      const runA = await insertRun(campaignId);
      const runB = await insertRun(campaignId);
      const recipientEmail = `pr7b_tzutc_25h_${Date.now()}@example.com`;
      await insertOldEmailMessage({ campaignId, runId: runA, nodeId: 111, recipientEmail, hoursAgo: 25 });

      const found = await emailSettingsRepository.findExistingSentCampaignEmailCrossRun({
        ownRunId: runB,
        campaignId,
        nodeId: 111,
        recipientEmail,
        emailStep: 1,
        windowHours: 24,
      });

      expect(found).toBeNull(); // ngoài cửa sổ → phải null → caller sẽ gửi lại
    });

    it('dòng 2h tuổi (TZ=UTC) → mốc bước sau khi đồng bộ liên-run KHÔNG lệch 7h', async () => {
      const campaignId = await insertCampaign('email');
      const runA = await insertRun(campaignId);
      const runB = await insertRun(campaignId);
      const recipientEmail = `pr7b_tzutc_no7hdrift_${Date.now()}@example.com`;
      const oldRow = await insertOldEmailMessage({
        campaignId, runId: runA, nodeId: 111, recipientEmail, hoursAgo: 2,
      });
      const realCreatedAtMs = new Date(oldRow.created_at).getTime();

      const found = await emailSettingsRepository.findExistingSentCampaignEmailCrossRun({
        ownRunId: runB,
        campaignId,
        nodeId: 111,
        recipientEmail,
        emailStep: 1,
        windowHours: 24,
      });

      expect(found).not.toBeNull();
      // sent_at_tz phải là CÙNG một thời điểm thật với created_at đã ghi — sai bằng ::timestamptz
      // (thay vì AT TIME ZONE trần) sẽ lệch đúng 7h dưới TZ=UTC (đã xác nhận bằng thực nghiệm).
      const diffMs = Math.abs(new Date(found.sent_at_tz).getTime() - realCreatedAtMs);
      expect(diffMs).toBeLessThan(1000);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // Mutation (a) — bỏ id_node khỏi khoá → ca "lưu flow giữa 2 lượt → GỬI" ở trên phải đỏ.
  // (không cần test riêng — chính test "lưu flow giữa 2 lượt" ở nhóm 2 bắt được mutation này:
  // bỏ id_node thì hàm sẽ TÌM THẤY dòng cũ id_node khác → không gửi → mockSendMail không được gọi.)
  //
  // Mutation (b) — mốc cửa sổ bằng JS Date như cũ. Trên CSDL 5433 (TIMESTAMPTZ), so sánh bằng JS
  // Date vẫn ra ĐÚNG kết quả bất kể process.env.TZ (đã xác nhận bằng thực nghiệm: node-pg luôn gửi
  // kèm offset chính xác cho tham số kiểu có múi giờ) — nên một test dữ liệu-thật không phân biệt
  // được 2 cách viết trên máy này (bug chỉ lộ trên cột KHÔNG múi giờ như production). Bắt mutation
  // này bằng cách kiểm THẲNG câu SQL thật sự chạy (spy db.query, không thay hành vi).
  // ═════════════════════════════════════════════════════════════════════════

  describe('Mutation (b) — mốc cửa sổ PHẢI tính trong SQL bằng LOCALTIMESTAMP, không nhận Date từ JS', () => {
    it('findExistingSentCampaignEmailCrossRun: SQL dùng LOCALTIMESTAMP + make_interval, không bind object Date', async () => {
      const campaignId = await insertCampaign('email');
      const runB = await insertRun(campaignId);
      const querySpy = jest.spyOn(db, 'query');

      await emailSettingsRepository.findExistingSentCampaignEmailCrossRun({
        ownRunId: runB,
        campaignId,
        nodeId: 1,
        recipientEmail: 'probe@example.com',
        emailStep: 1,
        windowHours: 24,
      });

      const call = querySpy.mock.calls.find(([sql]) => sql.includes('FROM email_messages') && sql.includes('id_run <>'));
      expect(call).toBeDefined();
      const [sql, params] = call;
      expect(sql).toMatch(/LOCALTIMESTAMP/);
      expect(sql).toMatch(/make_interval/);
      expect(params.some((p) => p instanceof Date)).toBe(false);

      querySpy.mockRestore();
    });

    it('findExistingSentCampaignZaloMessageCrossRun: SQL dùng LOCALTIMESTAMP + make_interval, không bind object Date', async () => {
      const campaignId = await insertCampaign('zalo');
      const runB = await insertRun(campaignId);
      const querySpy = jest.spyOn(db, 'query');

      await zaloMessageRepository.findExistingSentCampaignZaloMessageCrossRun({
        ownRunId: runB,
        campaignId,
        nodeId: 1,
        channel: 'zalo_personal',
        recipientKey: '0900000000',
        zaloStep: 1,
        windowHours: 24,
      });

      const call = querySpy.mock.calls.find(([sql]) => sql.includes('FROM zalo_messages') && sql.includes('id_run <>'));
      expect(call).toBeDefined();
      const [sql, params] = call;
      expect(sql).toMatch(/LOCALTIMESTAMP/);
      expect(sql).toMatch(/make_interval/);
      expect(params.some((p) => p instanceof Date)).toBe(false);

      querySpy.mockRestore();
    });
  });
});
