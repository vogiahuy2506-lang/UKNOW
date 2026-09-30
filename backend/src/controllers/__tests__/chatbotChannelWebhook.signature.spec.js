/**
 * Webhook kênh chatbot — kiểm chữ ký và bước bắt tay verify token.
 *
 * Dùng adapter THẬT (Facebook / Zalo OA / WhatsApp) để kiểm đúng công thức chữ ký; chỉ mock tầng
 * DB/AI. "Được xử lý" = controller đi tới bước lưu tin khách (getOrCreateConversation/addMessage).
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import crypto from 'crypto';

const mockFindByWebhookToken = jest.fn();
const mockGetOrCreateConversation = jest.fn();
const mockAddMessage = jest.fn();
const mockUpdateLastActivity = jest.fn();
const mockFindChatbotById = jest.fn();
const mockEnqueue = jest.fn();

jest.unstable_mockModule('../../repositories/ai/chatbotChannel.repository.js', () => ({
  default: {
    findByWebhookToken: mockFindByWebhookToken,
    getOrCreateConversation: mockGetOrCreateConversation,
    addMessage: mockAddMessage,
    updateLastActivity: mockUpdateLastActivity,
    findActiveChannelById: jest.fn(),
    getLatestMessageId: jest.fn(),
    getChannelPageAccessToken: jest.fn(),
    getChatbotChannelAccessToken: jest.fn(),
  },
}));
jest.unstable_mockModule('../../repositories/ai/chatbot.repository.js', () => ({
  default: { findChatbotById: mockFindChatbotById },
}));
jest.unstable_mockModule('../../repositories/chatbot/chatbotWhatsAppAccount.repository.js', () => ({
  default: { isEnabledForChatbot: jest.fn() },
}));
jest.unstable_mockModule('../../repositories/ai/unifiedInbox.repository.js', () => ({
  default: { isAiPaused: jest.fn() },
}));
jest.unstable_mockModule('../../services/chatbot/chatbotRateLimit.service.js', () => ({
  default: { checkBeforeAi: jest.fn(), markRateLimitNotified: jest.fn() },
}));
jest.unstable_mockModule('../../services/chatbot/chatRouter.service.js', () => ({
  default: { routeChatbotMessage: jest.fn() },
}));
jest.unstable_mockModule('../../services/chatbot/inboundReplyDebounce.service.js', () => ({
  default: { enqueue: mockEnqueue, cancelByPrefix: jest.fn() },
}));
// Adapter WhatsApp THẬT kéo theo Baileys — chặn ở ranh giới như whatsapp.adapter.media.spec.js.
jest.unstable_mockModule('../../services/chatbot/whatsappBaileys.service.js', () => ({
  sendMessage: jest.fn(),
  sendMedia: jest.fn(),
  sendImage: jest.fn(),
}));
jest.unstable_mockModule('../../services/campaign/campaignZaloSender.service.js', () => ({
  default: { prepareZaloAttachmentSources: jest.fn() },
}));

const { default: controller } = await import('../chatbotChannelWebhook.controller.js');
const { _resetWarnOnceForTests } = await import('../../utils/webhookVerification.util.js');

const ENV_KEYS = [
  'FACEBOOK_APP_SECRET',
  'FACEBOOK_WEBHOOK_VERIFY_TOKEN',
  'FACEBOOK_VERIFY_TOKEN',
  'ZALO_OA_SECRET_KEY',
  'ZALO_OA_APP_ID',
  'ZALO_OA_WEBHOOK_VERIFY_TOKEN',
  'ZALO_OA_VERIFY_TOKEN',
  'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
];
const savedEnv = {};

let warnSpy;
beforeEach(() => {
  jest.clearAllMocks();
  _resetWarnOnceForTests();
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  mockFindChatbotById.mockResolvedValue({ id: 8, id_user: 1, is_active: true });
  mockGetOrCreateConversation.mockResolvedValue({ id: 300 });
  mockAddMessage.mockResolvedValue({ id: 1 });
  mockUpdateLastActivity.mockResolvedValue();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  jest.restoreAllMocks();
});

const flush = () => new Promise((resolve) => setImmediate(resolve));
const makeRes = () => {
  const res = { statusCode: 200, body: undefined };
  res.status = jest.fn((code) => { res.statusCode = code; return res; });
  res.send = jest.fn((body) => { res.body = body; return res; });
  return res;
};

// ── Facebook ───────────────────────────────────────────────────────────

const FB_APP_SECRET = 'fb-app-secret-for-test';
const fbChannel = (credentials = {}) => ({
  id: 20, id_chatbot: 8, channel_type: 'facebook', credentials: { verify_token: 'fb-verify-123', ...credentials },
});
const fbBody = {
  object: 'page',
  entry: [{ messaging: [{ sender: { id: 'psid_1' }, recipient: { id: 'page_1' }, message: { mid: 'm_1', text: 'Alo' } }] }],
};
function fbRequest({ body = fbBody, secret = FB_APP_SECRET, signature } = {}) {
  const rawBody = Buffer.from(JSON.stringify(body));
  const sig = signature !== undefined
    ? signature
    : `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const headers = sig === null ? {} : { 'x-hub-signature-256': sig };
  return { params: { token: 'fb_tok' }, body, rawBody, headers, query: {} };
}

describe('Facebook Messenger — chữ ký X-Hub-Signature-256', () => {
  it('FACEBOOK_APP_SECRET + chữ ký đúng → xử lý tin', async () => {
    process.env.FACEBOOK_APP_SECRET = FB_APP_SECRET;
    mockFindByWebhookToken.mockResolvedValue(fbChannel());
    const res = makeRes();
    await controller.handleFacebook(fbRequest(), res);
    await flush();
    expect(res.send).toHaveBeenCalledWith('ok');
    expect(mockAddMessage).toHaveBeenCalledWith(300, expect.objectContaining({ role: 'visitor', content: 'Alo' }));
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
  });

  it('chữ ký sai / thiếu / sai định dạng → vẫn ack 200 nhưng KHÔNG xử lý', async () => {
    process.env.FACEBOOK_APP_SECRET = FB_APP_SECRET;
    mockFindByWebhookToken.mockResolvedValue(fbChannel());
    for (const req of [
      fbRequest({ secret: 'another-secret' }),
      fbRequest({ signature: null }),
      fbRequest({ signature: 'sha1=abcdef' }),
      fbRequest({ signature: `sha256=${'0'.repeat(64)}` }),
    ]) {
      const res = makeRes();
      await controller.handleFacebook(req, res);
      expect(res.send).toHaveBeenCalledWith('ok');
    }
    expect(mockFindChatbotById).not.toHaveBeenCalled();
    expect(mockAddMessage).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('body bị sửa sau khi ký → không xử lý', async () => {
    process.env.FACEBOOK_APP_SECRET = FB_APP_SECRET;
    mockFindByWebhookToken.mockResolvedValue(fbChannel());
    const req = fbRequest();
    req.rawBody = Buffer.from(JSON.stringify({ ...fbBody, extra: 1 }));
    await controller.handleFacebook(req, makeRes());
    expect(mockAddMessage).not.toHaveBeenCalled();
  });

  it('credentials.app_secret riêng của kênh cũng được chấp nhận', async () => {
    process.env.FACEBOOK_APP_SECRET = FB_APP_SECRET;
    mockFindByWebhookToken.mockResolvedValue(fbChannel({ app_secret: 'tenant-app-secret' }));
    await controller.handleFacebook(fbRequest({ secret: 'tenant-app-secret' }), makeRes());
    expect(mockAddMessage).toHaveBeenCalledTimes(1);
  });

  it('chưa cấu hình secret nào → xử lý như cũ + cảnh báo MỘT lần nêu FACEBOOK_APP_SECRET', async () => {
    mockFindByWebhookToken.mockResolvedValue(fbChannel());
    await controller.handleFacebook(fbRequest({ signature: null }), makeRes());
    await controller.handleFacebook(fbRequest({ signature: null }), makeRes());
    expect(mockAddMessage).toHaveBeenCalledTimes(2);
    const warnings = warnSpy.mock.calls.filter(([line]) => String(line).includes('FACEBOOK_APP_SECRET'));
    expect(warnings).toHaveLength(1);
  });

  it('token của kênh loại khác (WhatsApp) gọi vào đường Facebook → bỏ qua', async () => {
    process.env.FACEBOOK_APP_SECRET = FB_APP_SECRET;
    mockFindByWebhookToken.mockResolvedValue({ ...fbChannel(), channel_type: 'whatsapp' });
    await controller.handleFacebook(fbRequest(), makeRes());
    expect(mockAddMessage).not.toHaveBeenCalled();
  });
});

describe('Facebook Messenger — bắt tay GET verify token', () => {
  const verifyReq = (query) => ({ params: { token: 'fb_tok' }, query });

  it('hub.* (dấu chấm, như Meta gửi) + token của kênh → trả challenge', async () => {
    mockFindByWebhookToken.mockResolvedValue(fbChannel());
    const res = makeRes();
    await controller.verifyFacebook(
      verifyReq({ 'hub.mode': 'subscribe', 'hub.verify_token': 'fb-verify-123', 'hub.challenge': 'CH1' }),
      res
    );
    expect(res.send).toHaveBeenCalledWith('CH1');
  });

  it('kênh không có token + không có biến môi trường → 403 (không còn giá trị mặc định "founderai")', async () => {
    mockFindByWebhookToken.mockResolvedValue({ id: 20, id_chatbot: 8, channel_type: 'facebook', credentials: {} });
    const res = makeRes();
    await controller.verifyFacebook(
      verifyReq({ 'hub.mode': 'subscribe', 'hub.verify_token': 'founderai', 'hub.challenge': 'CH' }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('kênh không có token → dùng FACEBOOK_WEBHOOK_VERIFY_TOKEN; giá trị mặc định công khai bị bỏ qua', async () => {
    mockFindByWebhookToken.mockResolvedValue({ id: 20, id_chatbot: 8, channel_type: 'facebook', credentials: {} });
    process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN = 'env-verify-xyz';
    const ok = makeRes();
    await controller.verifyFacebook(
      verifyReq({ 'hub.mode': 'subscribe', 'hub.verify_token': 'env-verify-xyz', 'hub.challenge': 'CH2' }),
      ok
    );
    expect(ok.send).toHaveBeenCalledWith('CH2');

    process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN = 'founderai';
    const rejected = makeRes();
    await controller.verifyFacebook(
      verifyReq({ 'hub.mode': 'subscribe', 'hub.verify_token': 'founderai', 'hub.challenge': 'CH3' }),
      rejected
    );
    expect(rejected.status).toHaveBeenCalledWith(403);
  });

  it('token sai → 403', async () => {
    mockFindByWebhookToken.mockResolvedValue(fbChannel());
    const res = makeRes();
    await controller.verifyFacebook(
      verifyReq({ 'hub.mode': 'subscribe', 'hub.verify_token': 'fb-verify-124', 'hub.challenge': 'CH' }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ── Zalo OA ────────────────────────────────────────────────────────────

const OA_KEY = 'zalo-oa-secret-key-for-test';
const zaloChannel = (credentials = {}) => ({
  id: 10,
  id_chatbot: 8,
  channel_type: 'zalo_oa',
  external_channel_id: '4411',
  credentials: { zalo_app_id: '4411', verify_token: 'zalo-verify-1', ...credentials },
});
const zaloBody = {
  app_id: '4411',
  event_name: 'user_send_text',
  sender: { id: 'zuser_1' },
  message: { text: 'Chào shop' },
  message_id: 'zm_1',
  timestamp: '1759200000000',
};
function zaloRequest({ body = zaloBody, key = OA_KEY, signature } = {}) {
  const rawBody = Buffer.from(JSON.stringify(body));
  const mac = crypto
    .createHash('sha256')
    .update(`${body.app_id}${rawBody.toString('utf8')}${body.timestamp}${key}`)
    .digest('hex');
  const sig = signature !== undefined ? signature : `mac=${mac}`;
  const headers = sig === null ? {} : { 'x-zevent-signature': sig };
  return { params: { token: 'zalo_tok' }, body, rawBody, headers, query: {} };
}

describe('Zalo OA — chữ ký X-ZEvent-Signature', () => {
  it('credentials.oa_secret_key + mac đúng → xử lý tin', async () => {
    mockFindByWebhookToken.mockResolvedValue(zaloChannel({ oa_secret_key: OA_KEY }));
    await controller.handleZaloOA(zaloRequest(), makeRes());
    expect(mockAddMessage).toHaveBeenCalledWith(300, expect.objectContaining({ role: 'visitor', content: 'Chào shop' }));
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
  });

  it('mac sai / thiếu header / thiếu timestamp → không xử lý', async () => {
    mockFindByWebhookToken.mockResolvedValue(zaloChannel({ oa_secret_key: OA_KEY }));
    const noTimestamp = { ...zaloBody };
    delete noTimestamp.timestamp;
    for (const req of [
      zaloRequest({ key: 'wrong-key' }),
      zaloRequest({ signature: null }),
      zaloRequest({ signature: 'sha256=abc' }),
      zaloRequest({ body: noTimestamp }),
    ]) {
      const res = makeRes();
      await controller.handleZaloOA(req, res);
      expect(res.send).toHaveBeenCalledWith('ok');
    }
    expect(mockFindChatbotById).not.toHaveBeenCalled();
    expect(mockAddMessage).not.toHaveBeenCalled();
  });

  it('ZALO_OA_SECRET_KEY áp cho kênh thuộc app nền tảng (ZALO_OA_APP_ID khớp)', async () => {
    process.env.ZALO_OA_SECRET_KEY = OA_KEY;
    process.env.ZALO_OA_APP_ID = '4411';
    mockFindByWebhookToken.mockResolvedValue(zaloChannel());
    await controller.handleZaloOA(zaloRequest({ key: 'forged' }), makeRes());
    expect(mockAddMessage).not.toHaveBeenCalled();
    await controller.handleZaloOA(zaloRequest(), makeRes());
    expect(mockAddMessage).toHaveBeenCalledTimes(1);
  });

  it('ZALO_OA_SECRET_KEY KHÔNG áp cho kênh app khác → xử lý như cũ + cảnh báo một lần', async () => {
    process.env.ZALO_OA_SECRET_KEY = OA_KEY;
    process.env.ZALO_OA_APP_ID = '9999';
    mockFindByWebhookToken.mockResolvedValue(zaloChannel());
    await controller.handleZaloOA(zaloRequest({ signature: null }), makeRes());
    await controller.handleZaloOA(zaloRequest({ signature: null }), makeRes());
    expect(mockAddMessage).toHaveBeenCalledTimes(2);
    const warnings = warnSpy.mock.calls.filter(([line]) => String(line).includes('ZALO_OA_SECRET_KEY'));
    expect(warnings).toHaveLength(1);
  });

  it('token của kênh Facebook gọi vào đường Zalo OA → bỏ qua', async () => {
    mockFindByWebhookToken.mockResolvedValue({ ...zaloChannel(), channel_type: 'facebook' });
    await controller.handleZaloOA(zaloRequest({ signature: null }), makeRes());
    expect(mockAddMessage).not.toHaveBeenCalled();
  });
});

describe('Zalo OA — bắt tay GET verify token', () => {
  const verifyReq = (query) => ({ params: { token: 'zalo_tok' }, query });

  it('token của kênh → trả challenge; token sai → 403', async () => {
    mockFindByWebhookToken.mockResolvedValue(zaloChannel());
    const ok = makeRes();
    await controller.verifyZaloOA(verifyReq({ verify_token: 'zalo-verify-1', challenge: 'Z1' }), ok);
    expect(ok.send).toHaveBeenCalledWith('Z1');
    const bad = makeRes();
    await controller.verifyZaloOA(verifyReq({ verify_token: 'zalo-verify-2', challenge: 'Z1' }), bad);
    expect(bad.status).toHaveBeenCalledWith(403);
  });

  it('kênh không có token + không có biến môi trường → 403 (không còn "uknow_zalo_oa_verify")', async () => {
    mockFindByWebhookToken.mockResolvedValue({ ...zaloChannel(), credentials: { zalo_app_id: '4411' } });
    const res = makeRes();
    await controller.verifyZaloOA(verifyReq({ verify_token: 'uknow_zalo_oa_verify', challenge: 'Z' }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('kênh không có token → ZALO_OA_WEBHOOK_VERIFY_TOKEN', async () => {
    mockFindByWebhookToken.mockResolvedValue({ ...zaloChannel(), credentials: { zalo_app_id: '4411' } });
    process.env.ZALO_OA_WEBHOOK_VERIFY_TOKEN = 'zalo-env-verify';
    const res = makeRes();
    await controller.verifyZaloOA(verifyReq({ verify_token: 'zalo-env-verify', challenge: 'Z2' }), res);
    expect(res.send).toHaveBeenCalledWith('Z2');
  });
});

// ── WhatsApp Cloud ─────────────────────────────────────────────────────

describe('WhatsApp Cloud — bắt tay GET verify token', () => {
  const verifyReq = (query) => ({ params: { token: 'wa_tok' }, query });
  const waChannel = (credentials = {}) => ({ id: 30, id_chatbot: 9, channel_type: 'whatsapp', credentials });

  it('kênh không có token + không có WHATSAPP_WEBHOOK_VERIFY_TOKEN → 403 (không còn "uknow_whatsapp_verify")', async () => {
    mockFindByWebhookToken.mockResolvedValue(waChannel());
    const res = makeRes();
    await controller.verifyWhatsApp(
      verifyReq({ 'hub.mode': 'subscribe', 'hub.verify_token': 'uknow_whatsapp_verify', 'hub.challenge': 'W' }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('token của kênh → trả challenge; biến môi trường là dự phòng', async () => {
    mockFindByWebhookToken.mockResolvedValue(waChannel({ verify_token: 'wa-channel-token' }));
    const ok = makeRes();
    await controller.verifyWhatsApp(
      verifyReq({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wa-channel-token', 'hub.challenge': 'W1' }),
      ok
    );
    expect(ok.send).toHaveBeenCalledWith('W1');

    mockFindByWebhookToken.mockResolvedValue(waChannel());
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'wa-env-token';
    const viaEnv = makeRes();
    await controller.verifyWhatsApp(
      verifyReq({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wa-env-token', 'hub.challenge': 'W2' }),
      viaEnv
    );
    expect(viaEnv.send).toHaveBeenCalledWith('W2');
  });

  it('whatsappOAuth getConfig().verifyToken không còn giá trị viết cứng', async () => {
    const { default: whatsappOAuthService } = await import('../../services/chatbot/whatsappOAuth.service.js');
    expect(whatsappOAuthService.getConfig().verifyToken).toBeNull();
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'wa-env-token';
    expect(whatsappOAuthService.getConfig().verifyToken).toBe('wa-env-token');
  });
});
