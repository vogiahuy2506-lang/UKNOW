/**
 * PLAN_TACH_TANG_KENH_GUI_2026-09-27, PR-6 — Adapter Telegram tham chiếu (sau cờ, TẮT mặc định).
 *
 * a) cờ tắt: preflight node send_telegram -> 400 UNSUPPORTED_SEND_NODE; getAdapterChannelKeysByQuotaChannel('zalo')
 *    vẫn có 'telegram' (cờ chỉ chặn GỬI, không chặn ĐẾM).
 * b) cờ bật + stub -> preflight 400 TELEGRAM_STUB_TRANSPORT; gateway chưa cấu hình -> 400
 *    TELEGRAM_GATEWAY_NOT_CONFIGURED; tài khoản is_active=false hoặc của chủ khác -> 400 TELEGRAM_ACCOUNT_NOT_READY.
 * c) nguồn telegram_conversations: 3 hội thoại open + 1 closed của tài khoản, 1 open của tài khoản khác ->
 *    đúng 3 lần sendMessage với (telegram_user_id, Number(chat id), text đã render); 3 dòng ccm sent;
 *    countZaloSentToday của chủ tăng 3.
 * d) gateway ném Error("MtProtoTelegramClient.sendMessage failed: FLOOD_WAIT_1800") ở người 2 -> run
 *    'running', channelDeferredUntil ~ now+30' (+-60s), channelDeferredChannel='telegram', người 1 đã gửi
 *    được đếm.
 * e) "...failed: PEER_ID_INVALID" ở người 2 -> người 2 failed + ledger bỏ cuộc, người 3 vẫn gửi, run completed.
 * f) "...failed: AUTH_KEY_UNREGISTERED" -> run failed code CHANNEL_AUTH, failed_sends KHÔNG tăng cho bước đó.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

process.env.BULLMQ_ENABLED = 'false';
process.env.TZ = 'UTC';

const isConfiguredMock = jest.fn(() => true);
const sendMessageMock = jest.fn();
jest.unstable_mockModule('../../src/services/chatbot/telegramGateway.client.js', () => ({
  default: {
    isConfigured: isConfiguredMock,
    sendMessage: sendMessageMock,
  },
}));

const isStubOnlyMock = jest.fn(() => false);
jest.unstable_mockModule('../../src/services/chatbot/inProcChannelGateway/stubCheck.js', () => ({
  isStubOnly: isStubOnlyMock,
}));

const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser } = await import('./helpers/db.js');
const campaignRunService = (await import('../../src/services/campaign/campaignRun.service.js')).default;
const { validateCampaignPreflight } = await import('../../src/services/campaign/campaignPreflight.service.js');
const chatbotTelegramRepository = (await import('../../src/repositories/chatbot/chatbotTelegram.repository.js')).default;
const campaignChannelRegistry = (await import('../../src/services/campaign/campaignChannelRegistry.service.js')).default;
const { countZaloSentToday, _clearQuotaCache } = await import('../../src/utils/userSendLimit.util.js');

const SUBTYPE = 'send_telegram';

let owner;

beforeEach(async () => {
  await truncateAll();
  owner = await createUser({
    email: `pr6_owner_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`,
  });
  isConfiguredMock.mockReset().mockReturnValue(true);
  isStubOnlyMock.mockReset().mockReturnValue(false);
  sendMessageMock.mockReset();
  // Số mặc định env Telegram (5s/10s delay, quiet hours 23-6 VN) làm test chậm/chập chờn theo giờ
  // chạy thật — trung hoà để test xác định, không phụ thuộc đồng hồ máy CI. LƯU Ý: buildTelegramPolicyFromEnv
  // dùng `env || default` (đúng lệnh giao) nên '0' KHÔNG override được (0 là falsy) — phải dùng số
  // dương nhỏ (delay) / cặp bằng nhau khác 0 (quiet hours, coi là "không có khung" theo khuôn
  // isWithinQuietHours startHour===endHour).
  process.env.TELEGRAM_OUTBOUND_INTER_MESSAGE_MIN_MS = '1';
  process.env.TELEGRAM_OUTBOUND_INTER_MESSAGE_MAX_MS = '1';
  process.env.TELEGRAM_OUTBOUND_QUIET_HOURS_START = '12';
  process.env.TELEGRAM_OUTBOUND_QUIET_HOURS_END = '12';
  delete process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED;
  _clearQuotaCache();
});

afterEach(async () => {
  delete process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED;
  delete process.env.TELEGRAM_OUTBOUND_INTER_MESSAGE_MIN_MS;
  delete process.env.TELEGRAM_OUTBOUND_INTER_MESSAGE_MAX_MS;
  delete process.env.TELEGRAM_OUTBOUND_QUIET_HOURS_START;
  delete process.env.TELEGRAM_OUTBOUND_QUIET_HOURS_END;
  campaignRunService.activeRunIds.clear();
  campaignRunService.continuousRunIds.clear();
});

async function insertCampaign() {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name, campaign_type, status)
     VALUES ($1, $1, 'PR-6 telegram test', 'email', 'active') RETURNING id`,
    [owner.id]
  );
  return rows[0].id;
}

async function insertNode({ campaignId, config }) {
  const { rows } = await db.query(
    `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, config, execution_order)
     VALUES ($1, 'action', $2, $2, $3::jsonb, 1) RETURNING id`,
    [campaignId, SUBTYPE, JSON.stringify(config)]
  );
  return rows[0].id;
}

async function insertRun({ campaignId }) {
  const { rows } = await db.query(
    `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, run_type, status, run_metadata)
     VALUES ($1, $2, 'manual', 'running', '{}'::jsonb) RETURNING *`,
    [campaignId, owner.id]
  );
  return rows[0];
}

async function getRunRow(runId) {
  const { rows } = await db.query('SELECT * FROM campaign_runs WHERE id = $1', [runId]);
  return rows[0];
}

/**
 * Mọi lỗi thật từ MtProtoTelegramClient/stub đều là TelegramTransportError với `.status = 503`
 * BẤT KỂ nguyên nhân (mtProtoTelegramClient.js) — mock phải mang đúng field này, không chỉ message,
 * để đột biến "phân loại theo status 503" thật sự bắt được lỗi (nếu classify không cẩn thận đọc
 * `.status` thay vì parse chuỗi, mọi lỗi Telegram sẽ lẫn vào nhau).
 */
function telegramTransportError(message) {
  const err = new Error(message);
  err.status = 503;
  return err;
}

async function insertTelegramAccount({ userId = owner.id, telegramUserId, isActive = true }) {
  const { rows } = await db.query(
    `INSERT INTO telegram_accounts (id_user, telegram_user_id, phone, first_name, is_active)
     VALUES ($1, $2, '+84900000000', 'Bot', $3) RETURNING *`,
    [userId, telegramUserId, isActive]
  );
  // checkReadiness (chặn sớm phiên hỏng) đòi phiên còn khoá đăng nhập — dựng blob tối thiểu có authKeys.permanent.
  await chatbotTelegramRepository.saveSessionState(telegramUserId, {
    kv: {},
    authKeys: { permanent: { 2: { 0: 1 } }, temp: {} },
  });
  return rows[0];
}

async function insertConversation({ accountId, userId = owner.id, externalId, status = 'open' }) {
  await db.query(
    `INSERT INTO telegram_personal_conversations
       (id_user, id_telegram_account, external_id, display_name, status)
     VALUES ($1, $2, $3, $3, $4)`,
    [userId, accountId, externalId, status]
  );
}

describe('PR-6 — Adapter Telegram tham chiếu (sau cờ, TẮT mặc định)', () => {
  it('(a) cờ tắt: preflight UNSUPPORTED_SEND_NODE; getAdapterChannelKeysByQuotaChannel vẫn có telegram', async () => {
    const campaignId = await insertCampaign();
    await insertNode({
      campaignId,
      config: { telegramAccountId: 1, recipientSource: 'manual', recipientKeys: ['123'], steps: [{ message: 'B1' }] },
    });

    await expect(
      validateCampaignPreflight({ campaignId, workspaceOwnerId: owner.id })
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_SEND_NODE', statusCode: 400 });

    expect(campaignChannelRegistry.getAdapterChannelKeysByQuotaChannel('zalo')).toContain('telegram');
  });

  it('(b) cờ bật + stub -> TELEGRAM_STUB_TRANSPORT; chưa cấu hình -> TELEGRAM_GATEWAY_NOT_CONFIGURED; tài khoản không sẵn sàng -> TELEGRAM_ACCOUNT_NOT_READY', async () => {
    process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED = 'true';
    const account = await insertTelegramAccount({ telegramUserId: 111 });

    const campaignId = await insertCampaign();
    await insertNode({
      campaignId,
      config: { telegramAccountId: account.id, recipientSource: 'manual', recipientKeys: ['123'], steps: [{ message: 'B1' }] },
    });

    // 1) stub transport.
    isStubOnlyMock.mockReturnValue(true);
    await expect(
      validateCampaignPreflight({ campaignId, workspaceOwnerId: owner.id })
    ).rejects.toMatchObject({ code: 'TELEGRAM_STUB_TRANSPORT', statusCode: 400 });

    // 2) transport thật nhưng gateway chưa cấu hình (thiếu TELEGRAM_GATEWAY_SECRET).
    isStubOnlyMock.mockReturnValue(false);
    isConfiguredMock.mockReturnValue(false);
    await expect(
      validateCampaignPreflight({ campaignId, workspaceOwnerId: owner.id })
    ).rejects.toMatchObject({ code: 'TELEGRAM_GATEWAY_NOT_CONFIGURED', statusCode: 400 });

    // 3) transport + gateway sẵn sàng, nhưng tài khoản is_active=false.
    isConfiguredMock.mockReturnValue(true);
    await db.query('UPDATE telegram_accounts SET is_active = false WHERE id = $1', [account.id]);
    await expect(
      validateCampaignPreflight({ campaignId, workspaceOwnerId: owner.id })
    ).rejects.toMatchObject({ code: 'TELEGRAM_ACCOUNT_NOT_READY', statusCode: 400 });

    // 4) tài khoản is_active=true nhưng thuộc CHỦ KHÁC — getAccountById lọc theo userId nên coi như không có.
    await db.query('UPDATE telegram_accounts SET is_active = true WHERE id = $1', [account.id]);
    const otherOwner = await createUser({ email: `pr6_other_${Date.now()}@example.com` });
    const campaignId2 = await insertCampaign();
    await insertNode({
      campaignId: campaignId2,
      config: { telegramAccountId: account.id, recipientSource: 'manual', recipientKeys: ['123'], steps: [{ message: 'B1' }] },
    });
    await expect(
      validateCampaignPreflight({ campaignId: campaignId2, workspaceOwnerId: otherOwner.id })
    ).rejects.toMatchObject({ code: 'TELEGRAM_ACCOUNT_NOT_READY', statusCode: 400 });
  });

  it('(c) nguồn telegram_conversations: 3 open + 1 closed của tài khoản, 1 open của tài khoản khác -> đúng 3 lần sendMessage; 3 ccm sent; countZaloSentToday +3', async () => {
    process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED = 'true';
    const account = await insertTelegramAccount({ telegramUserId: 222 });
    const otherAccount = await insertTelegramAccount({ telegramUserId: 333 });

    await insertConversation({ accountId: account.id, externalId: '1001', status: 'open' });
    await insertConversation({ accountId: account.id, externalId: '1002', status: 'open' });
    await insertConversation({ accountId: account.id, externalId: '1003', status: 'open' });
    await insertConversation({ accountId: account.id, externalId: '1004', status: 'closed' });
    await insertConversation({ accountId: otherAccount.id, externalId: '2001', status: 'open' });

    sendMessageMock.mockImplementation(async () => ({ data: { messageId: `tg_${Math.random()}` } }));

    const campaignId = await insertCampaign();
    const nodeId = await insertNode({
      campaignId,
      config: {
        telegramAccountId: account.id,
        recipientSource: 'telegram_conversations',
        steps: [{ message: 'Xin chào từ chiến dịch' }],
      },
    });
    const run = await insertRun({ campaignId });

    const before = await countZaloSentToday(owner.id);
    await campaignRunService.executeCampaign(campaignId, run.id, owner.id);
    _clearQuotaCache();
    const after = await countZaloSentToday(owner.id);

    expect(sendMessageMock).toHaveBeenCalledTimes(3);
    const calledChatIds = sendMessageMock.mock.calls.map(([, chatId]) => chatId).sort((a, b) => a - b);
    expect(calledChatIds).toEqual([1001, 1002, 1003]);
    for (const [telegramUserId, , text] of sendMessageMock.mock.calls) {
      // telegram_accounts.telegram_user_id là BIGINT -> node-pg trả về STRING; adapter truyền
      // nguyên vẹn cho telegramGateway.sendMessage (facade thật tự Number() ở index.js:279, mock
      // ở đây thay hẳn facade nên thấy đúng kiểu string adapter gửi xuống).
      expect(String(telegramUserId)).toBe('222');
      expect(text).toBe('Xin chào từ chiến dịch');
    }

    const { rows: sentRows } = await db.query(
      `SELECT COUNT(*)::int AS n FROM campaign_channel_messages
       WHERE id_node = $1 AND channel = 'telegram' AND status = 'sent'`,
      [nodeId]
    );
    expect(sentRows[0].n).toBe(3);
    expect(after - before).toBe(3);

    const runRow = await getRunRow(run.id);
    expect(runRow.status).toBe('completed');
  });

  it('(d) FLOOD_WAIT_1800 ở người 2 -> run running, channelDeferredUntil ~ now+30\', channelDeferredChannel=telegram, người 1 đếm', async () => {
    process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED = 'true';
    const account = await insertTelegramAccount({ telegramUserId: 444 });

    sendMessageMock.mockImplementation(async (_telegramUserId, chatId) => {
      if (chatId === 2002) {
        throw telegramTransportError('MtProtoTelegramClient.sendMessage failed: FLOOD_WAIT_1800');
      }
      return { data: { messageId: `tg_${chatId}` } };
    });

    const campaignId = await insertCampaign();
    await insertNode({
      campaignId,
      config: {
        telegramAccountId: account.id,
        recipientSource: 'manual',
        recipientKeys: ['2001', '2002'],
        steps: [{ message: 'B1' }],
      },
    });
    const run = await insertRun({ campaignId });

    const beforeMs = Date.now();
    await campaignRunService.executeCampaign(campaignId, run.id, owner.id);

    const runRow = await getRunRow(run.id);
    expect(runRow.status).toBe('running');
    expect(runRow.successful_sends).toBe(1);
    const meta = runRow.run_metadata;
    expect(meta.channelDeferredReason).toBe('channel_rate_limit');
    expect(meta.channelDeferredChannel).toBe('telegram');
    const untilMs = Date.parse(meta.channelDeferredUntil);
    const expectedMs = beforeMs + 1800 * 1000;
    expect(Math.abs(untilMs - expectedMs)).toBeLessThanOrEqual(60000);
  });

  it('(e) PEER_ID_INVALID ở người 2 -> người 2 failed + ledger bỏ cuộc, người 3 vẫn gửi, run completed', async () => {
    process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED = 'true';
    const account = await insertTelegramAccount({ telegramUserId: 555 });

    sendMessageMock.mockImplementation(async (_telegramUserId, chatId) => {
      if (chatId === 3002) {
        throw telegramTransportError('MtProtoTelegramClient.sendMessage failed: Telegram API error 400: PEER_ID_INVALID');
      }
      return { data: { messageId: `tg_${chatId}` } };
    });

    const campaignId = await insertCampaign();
    const nodeId = await insertNode({
      campaignId,
      config: {
        telegramAccountId: account.id,
        recipientSource: 'manual',
        recipientKeys: ['3001', '3002', '3003'],
        steps: [{ message: 'B1' }],
      },
    });
    const run = await insertRun({ campaignId });

    await campaignRunService.executeCampaign(campaignId, run.id, owner.id);

    const runRow = await getRunRow(run.id);
    expect(runRow.status).toBe('completed');
    expect(runRow.successful_sends).toBe(2);
    expect(runRow.failed_sends).toBe(1);

    const { rows: ledgerRows } = await db.query(
      `SELECT is_fully_completed, meta FROM campaign_run_recipient_steps
       WHERE id_run = $1 AND id_node = $2 AND recipient_key = '3002'`,
      [run.id, String(nodeId)]
    );
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows[0].is_fully_completed).toBe(true);
    expect(ledgerRows[0].meta.lastFailureReason).toBe('hard');
  });

  it('(f) AUTH_KEY_UNREGISTERED -> run failed CHANNEL_AUTH, failed_sends KHÔNG tăng cho bước đó', async () => {
    process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED = 'true';
    const account = await insertTelegramAccount({ telegramUserId: 666 });

    sendMessageMock.mockImplementation(async () => {
      throw telegramTransportError('MtProtoTelegramClient.sendMessage failed: Telegram API error 401: AUTH_KEY_UNREGISTERED');
    });

    const campaignId = await insertCampaign();
    await insertNode({
      campaignId,
      config: {
        telegramAccountId: account.id,
        recipientSource: 'manual',
        recipientKeys: ['4001'],
        steps: [{ message: 'B1' }],
      },
    });
    const run = await insertRun({ campaignId });

    await campaignRunService.executeCampaign(campaignId, run.id, owner.id);

    const runRow = await getRunRow(run.id);
    expect(runRow.status).toBe('failed');
    // stopError.code='CHANNEL_AUTH' không tự nó vào error_message (chỉ error.message được
    // failRun ghi) — chứng minh gián tiếp qua chuỗi lỗi gốc AUTH_KEY_UNREGISTERED còn nguyên vẹn.
    expect(String(runRow.error_message || '')).toContain('AUTH_KEY_UNREGISTERED');
    expect(runRow.failed_sends).toBe(0);
  });
});
