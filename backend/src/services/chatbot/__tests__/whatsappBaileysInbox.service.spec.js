/**
 * WhatsApp Baileys inbox — khoá tài nguyên + trần lượt trả lời (29/09/2026).
 *
 * Cổng chạy ở `_processWhatsAppBaileysBatch` (điểm xả đợt gom, ngay trước khi gọi AI),
 * KHÔNG chạy ở vòng từng tin: 3 tin trong 1 đợt gom chỉ được đếm 1 lượt.
 *
 * Dựng: emitter giả gắn qua registerSessionHandlers → phát tin → debounce giả gom tin theo key
 * và chỉ xả khi test gọi flush().
 */
import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resolveUrl = (rel) => path.resolve(__dirname, '..', '..', '..', rel).replace(/\\/g, '/');

const SESSION_KEY = '42-default';
const CHATBOT_ID = 55;

let m;
let mod;

function inbound(id, text) {
  return { key: { remoteJid: '84901234567@s.whatsapp.net', id, fromMe: false }, message: { conversation: text }, pushName: 'Alice' };
}

async function sendTexts(texts) {
  const emitter = new EventEmitter();
  m.sessions = [{ sessionKey: SESSION_KEY, emitter }];
  mod.registerSessionHandlers(SESSION_KEY);
  texts.forEach((t, i) => emitter.emit('message', { sessionKey: SESSION_KEY, message: inbound(`mid-${i}`, t) }));
  // processIncomingMessage là async, chờ hết chuỗi await DB giả.
  for (let i = 0; i < 40; i += 1) await new Promise((r) => setImmediate(r));
}

async function flush() {
  const pending = [...m.buckets.values()];
  m.buckets.clear();
  for (const b of pending) await b.flushCallback({ messages: b.messages, waitMs: 0, reason: 'quiet_window' });
}

beforeEach(async () => {
  jest.resetModules();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  m = {
    sessions: [],
    buckets: new Map(),
    locked: false,
    rate: { allowed: true },
    callAi: jest.fn(async () => ({ text: 'Giá áo thun size L là 199.000đ ạ' })),
    sendReply: jest.fn(async () => ({ success: true })),
    checkBeforeAi: jest.fn(async () => m.rate),
    markRateLimitNotified: jest.fn(async () => {}),
    botInserts: [],
    visitorInserts: [],
    settingsSqls: [],
    repliesEnabled: undefined,
    paused: false,
    pausedAt: null,
    autoResume: null,
    ownerConvs: [{ id: 101, id_channel: 9, visitor_name: 'Alice' }],
    recent: {},
    inserts: [],
    pauseUpdates: [],
    resumeClears: 0,
    bindUpdates: [],
    sse: [],
    prepareCredit: jest.fn(async () => ({ creditContext: { ctx: 1 } })),
    chargeCredit: jest.fn(async () => {}),
    getOwnerContact: jest.fn(async () => ({ phone: '0900000000' })),
  };

  jest.unstable_mockModule(resolveUrl('config/database.js'), () => ({
    default: {
      query: jest.fn(async (sql, params) => {
        const s = String(sql);
        if (/FROM chatbot_whatsapp_baileys_settings/i.test(s)) m.settingsSqls.push(s);
        if (/FROM chatbot_whatsapp_baileys_settings/i.test(s) && /s\.id_chatbot = \$2/i.test(s)) {
          return { rows: [{ id_chatbot: CHATBOT_ID, system_instruction: 'x', ai_model: 'gemini-2.5-flash', id_user: 42, chatbot_name: 'Bot', active_hours: null }] };
        }
        if (/FROM chatbot_whatsapp_baileys_settings/i.test(s)) {
          return { rows: [{ id_chatbot: CHATBOT_ID, active_hours: null, replies_enabled: m.repliesEnabled }] };
        }
        if (/FROM channel_connections/i.test(s)) return { rows: [{ id: 9 }] };
        if (/UPDATE channel_conversations/i.test(s) && /SET ai_paused = \$2/i.test(s)) {
          m.pauseUpdates.push(params[0]);
          return { rows: [{ ai_paused: true, ai_paused_at: new Date() }] };
        }
        if (/UPDATE channel_conversations/i.test(s) && /SET ai_paused = false/i.test(s)) {
          m.resumeClears += 1;
          return { rows: [] };
        }
        if (/UPDATE channel_messages SET external_id/i.test(s)) {
          m.bindUpdates.push(params);
          return { rows: [] };
        }
        if (/FROM users/i.test(s) && /ai_handoff_auto_resume_minutes/i.test(s)) {
          return { rows: [{ ai_handoff_auto_resume_minutes: m.autoResume }] };
        }
        if (/FROM channel_conversations/i.test(s) && /starts_with/i.test(s)) return { rows: m.ownerConvs };
        if (/FROM channel_messages/i.test(s) && /role IN/i.test(s)) return { rows: m.recent[params[0]] || [] };
        if (/FROM channel_conversations/i.test(s) && /ai_paused/i.test(s)) {
          return { rows: [{ ai_paused: m.paused, ai_paused_at: m.pausedAt, id_user: 42 }] };
        }
        if (/FROM channel_conversations/i.test(s)) return { rows: [{ id: 101 }] };
        if (/FROM channel_messages/i.test(s) && /external_id = \$2/i.test(s)) return { rows: [] };
        if (/INSERT INTO channel_messages/i.test(s)) {
          m.inserts.push(params);
          if (params[3] === 'bot') m.botInserts.push(params[4]);
          if (params[3] === 'visitor') m.visitorInserts.push(params[4]);
          return { rows: [{ id: 1000 + m.botInserts.length + Math.floor(Math.random() * 1e6) }] };
        }
        return { rows: [] };
      }),
    },
  }));
  jest.unstable_mockModule(resolveUrl('services/sse.service.js'), () => ({
    default: { broadcast: (...a) => m.sse.push(a) },
  }));
  jest.unstable_mockModule(resolveUrl('services/chatbot/whatsappBaileys.service.js'), () => ({
    listSessions: () => m.sessions,
  }));
  jest.unstable_mockModule(resolveUrl('services/chatbot/channelAdapters/whatsapp.adapter.js'), () => ({
    default: { sendReply: (...a) => m.sendReply(...a) },
  }));
  jest.unstable_mockModule(resolveUrl('services/ai/aiCreditMeter.service.js'), () => ({
    VISITOR_CHAT_ERROR_MESSAGE: 'loi-chung',
    default: { isLimitError: (e) => e?.code === 'CREDIT_LIMIT' },
  }));
  jest.unstable_mockModule(resolveUrl('services/ai/aiUsageMeter.service.js'), () => ({
    default: { isLimitError: (e) => e?.code === 'USAGE_LIMIT' },
  }));
  jest.unstable_mockModule(resolveUrl('repositories/chatbot/chatbotContactAlert.repository.js'), () => ({
    default: { getOwnerContact: (...a) => m.getOwnerContact(...a) },
  }));
  jest.unstable_mockModule(resolveUrl('services/chatbot/subAssistant.service.js'), () => ({ default: { getById: async () => null } }));
  jest.unstable_mockModule(resolveUrl('services/chatbot/ragEngine.service.js'), () => ({ default: { buildContext: async () => '' } }));
  jest.unstable_mockModule(resolveUrl('services/ai/businessProfile.service.js'), () => ({
    default: { getFormattedProfileForPrompt: async () => '' },
  }));
  jest.unstable_mockModule(resolveUrl('services/chatbot/chatRouter.service.js'), () => ({
    default: {
      buildSystemPrompt: (...a) => { m.systemPromptArgs = a[0]; return 'sys'; },
      _callAI: (...a) => m.callAi(...a),
      _prepareChatCredit: (...a) => m.prepareCredit(...a),
      _chargeChatCredit: (...a) => m.chargeCredit(...a),
    },
  }));
  jest.unstable_mockModule(resolveUrl('services/chatbot/inboundReplyDebounce.service.js'), () => ({
    default: {
      enqueue: ({ key, message, flushCallback }) => {
        const b = m.buckets.get(key) || { messages: [], flushCallback };
        b.messages.push(message);
        m.buckets.set(key, b);
      },
    },
  }));
  jest.unstable_mockModule(resolveUrl('services/chatbot/chatbotActiveHours.service.js'), () => ({
    default: {
      // Phản chiếu cổng thật: repliesEnabled===false → chặn (bỏ tham số ở nơi gọi thì ca replies_enabled đỏ).
      checkBeforeAi: async (p) => (p?.repliesEnabled === false
        ? { allowed: false, reason: 'replies_disabled', shouldNotify: false, staticReply: null }
        : { allowed: true, shouldNotify: false }),
      markNotified: async () => {},
    },
  }));
  jest.unstable_mockModule(resolveUrl('services/chatbot/chatbotRateLimit.service.js'), () => ({
    default: {
      checkBeforeAi: (...a) => m.checkBeforeAi(...a),
      markRateLimitNotified: (...a) => m.markRateLimitNotified(...a),
    },
  }));
  jest.unstable_mockModule(resolveUrl('utils/topupLockGate.util.js'), () => ({
    resourceIsLocked: async () => m.locked,
  }));

  mod = await import('../whatsappBaileysInbox.service.js');
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('WhatsApp Baileys — cổng khoá + trần lượt tại điểm xả đợt gom', () => {
  it('chatbot bị khoá: không gọi AI, không gửi gì', async () => {
    m.locked = true;
    await sendTexts(['xin chào']);
    await flush();
    expect(m.callAi).not.toHaveBeenCalled();
    expect(m.sendReply).not.toHaveBeenCalled();
    expect(m.checkBeforeAi).not.toHaveBeenCalled();
  });

  it('trần lượt: allowed=false + shouldNotify=true → gửi đúng staticReply 1 lần, markRateLimitNotified, không gọi AI', async () => {
    m.rate = { allowed: false, shouldNotify: true, staticReply: 'het-luot', reason: 'per_hour' };
    await sendTexts(['xin chào']);
    await flush();
    expect(m.callAi).not.toHaveBeenCalled();
    expect(m.sendReply).toHaveBeenCalledTimes(1);
    expect(m.sendReply).toHaveBeenCalledWith({ channelId: SESSION_KEY, externalId: '84901234567', message: 'het-luot' });
    expect(m.botInserts).toEqual(['het-luot']);
    expect(m.markRateLimitNotified).toHaveBeenCalledTimes(1);
    expect(m.markRateLimitNotified).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'whatsapp_baileys', ownerUserId: 42, chatbotId: CHATBOT_ID, reason: 'per_hour' })
    );
  });

  it('trần lượt: allowed=false + shouldNotify=false → không gửi gì, không gọi AI', async () => {
    m.rate = { allowed: false, shouldNotify: false, staticReply: 'het-luot' };
    await sendTexts(['xin chào']);
    await flush();
    expect(m.callAi).not.toHaveBeenCalled();
    expect(m.sendReply).not.toHaveBeenCalled();
    expect(m.markRateLimitNotified).not.toHaveBeenCalled();
  });

  it('được phép: gọi AI như cũ và gửi câu trả lời AI', async () => {
    await sendTexts(['Cho mình hỏi giá áo thun size L là bao nhiêu vậy shop']);
    await flush();
    expect(m.callAi).toHaveBeenCalledTimes(1);
    expect(m.sendReply).toHaveBeenCalledTimes(1);
    expect(m.sendReply.mock.calls[0][0].message).toBe('Giá áo thun size L là 199.000đ ạ');
    expect(m.checkBeforeAi).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'whatsapp_baileys', ownerUserId: 42, chatbotId: CHATBOT_ID, senderKey: '84901234567' })
    );
  });

  it('3 tin trong 1 đợt gom → checkBeforeAi gọi đúng 1 lần', async () => {
    await sendTexts(['một', 'hai', 'ba']);
    expect(m.checkBeforeAi).not.toHaveBeenCalled(); // chưa xả đợt thì chưa đếm
    await flush();
    expect(m.checkBeforeAi).toHaveBeenCalledTimes(1);
    expect(m.callAi).toHaveBeenCalledTimes(1);
  });
});

describe('WhatsApp Baileys — công tắc trả lời của chatbot (replies_enabled) — PLAN_CONG_TAC_TRANG_THAI_CHATBOT PR-2', () => {
  it('replies_enabled=false: lưu tin khách, không gọi AI, không hỏi trần lượt, không gửi gì', async () => {
    m.repliesEnabled = false;
    await sendTexts(['Cho mình hỏi giá áo thun size L là bao nhiêu vậy shop']);
    await flush();
    expect(m.visitorInserts).toEqual(['Cho mình hỏi giá áo thun size L là bao nhiêu vậy shop']);
    expect(m.callAi).not.toHaveBeenCalled();
    expect(m.checkBeforeAi).not.toHaveBeenCalled();
    expect(m.sendReply).not.toHaveBeenCalled();
    expect(m.botInserts).toEqual([]);
  });

  it('cả hai câu SQL đọc cài đặt chatbot đều SELECT cb.replies_enabled (mock DB không tự chứng minh được cột)', async () => {
    await sendTexts(['Cho mình hỏi giá áo thun size L là bao nhiêu vậy shop']);
    await flush();
    expect(m.settingsSqls.length).toBeGreaterThanOrEqual(2);
    for (const sql of m.settingsSqls) expect(sql).toContain('cb.replies_enabled');
  });

  it('replies_enabled=true: gọi AI như cũ', async () => {
    m.repliesEnabled = true;
    await sendTexts(['Cho mình hỏi giá áo thun size L là bao nhiêu vậy shop']);
    await flush();
    expect(m.callAi).toHaveBeenCalledTimes(1);
  });
});

describe('WhatsApp Baileys — credit AI + xác nhận liên hệ', () => {
  it('kiểm credit đúng feature TRƯỚC khi gọi AI, thành công thì trừ đúng 1 lần với creditContext đã giữ', async () => {
    await sendTexts(['Cho mình hỏi giá áo thun size L']);
    await flush();
    expect(m.prepareCredit).toHaveBeenCalledWith(42, 'chatbot_whatsapp_baileys');
    expect(m.prepareCredit.mock.invocationCallOrder[0]).toBeLessThan(m.callAi.mock.invocationCallOrder[0]);
    expect(m.chargeCredit).toHaveBeenCalledTimes(1);
    expect(m.chargeCredit).toHaveBeenCalledWith(42, 'chatbot_whatsapp_baileys', { ctx: 1 });
  });

  it('hết credit (visitorMessage): gửi đúng câu đó, KHÔNG gọi AI, KHÔNG trừ', async () => {
    m.prepareCredit = jest.fn(async () => ({ visitorMessage: 'het-credit' }));
    await sendTexts(['Cho mình hỏi giá áo thun size L']);
    await flush();
    expect(m.callAi).not.toHaveBeenCalled();
    expect(m.chargeCredit).not.toHaveBeenCalled();
    expect(m.sendReply).toHaveBeenCalledTimes(1);
    expect(m.sendReply).toHaveBeenCalledWith({ channelId: SESSION_KEY, externalId: '84901234567', message: 'het-credit' });
    expect(m.botInserts).toEqual(['het-credit']);
  });

  it('AI ném lỗi giới hạn: gửi câu lỗi chung cho khách, KHÔNG trừ credit', async () => {
    m.callAi = jest.fn(async () => { const e = new Error('limit'); e.code = 'CREDIT_LIMIT'; throw e; });
    await sendTexts(['Cho mình hỏi giá áo thun size L']);
    await flush();
    expect(m.chargeCredit).not.toHaveBeenCalled();
    expect(m.sendReply).toHaveBeenCalledTimes(1);
    expect(m.sendReply.mock.calls[0][0].message).toBe('loi-chung');
  });

  it('AI ném lỗi thường: KHÔNG trừ credit (khách nhận câu lỗi chung như cũ)', async () => {
    m.callAi = jest.fn(async () => { throw new Error('gemini 500'); });
    await sendTexts(['Cho mình hỏi giá áo thun size L']);
    await flush();
    expect(m.chargeCredit).not.toHaveBeenCalled();
    expect(m.sendReply.mock.calls.map((c) => c[0].message)).toEqual(['loi-chung']);
  });

  it('khách để lại SĐT: contactNote đi vào prompt và footer xác nhận nối sau câu trả lời', async () => {
    await sendTexts(['Mình để lại số 0912345678 nhé, shop gọi lại giúp mình']);
    await flush();
    expect(m.getOwnerContact).toHaveBeenCalledWith(42);
    expect(m.systemPromptArgs.contactNote).toEqual(expect.any(String));
    expect(m.systemPromptArgs.contactNote.length).toBeGreaterThan(0);
    const sent = m.sendReply.mock.calls[0][0].message;
    expect(sent.startsWith('Giá áo thun size L là 199.000đ ạ')).toBe(true);
    expect(sent.length).toBeGreaterThan('Giá áo thun size L là 199.000đ ạ'.length);
    expect(sent).toMatch(/0912\s?345\s?678/);
  });

  it('khách không để lại liên hệ: không có footer, không tra liên hệ chủ', async () => {
    await sendTexts(['Cho mình hỏi giá áo thun size L']);
    await flush();
    expect(m.getOwnerContact).not.toHaveBeenCalled();
    expect(m.sendReply.mock.calls[0][0].message).toBe('Giá áo thun size L là 199.000đ ạ');
  });
});

describe('WhatsApp Baileys — hội thoại đang tạm dừng AI', () => {
  it('ai_paused=true: tin khách VẪN được lưu vào Hộp thư, AI không được gọi', async () => {
    m.paused = true;
    await sendTexts(['Cho mình hỏi giá áo thun size L']);
    await flush();
    expect(m.visitorInserts).toEqual(['Cho mình hỏi giá áo thun size L']);
    expect(m.buckets.size).toBe(0);
    expect(m.callAi).not.toHaveBeenCalled();
    expect(m.sendReply).not.toHaveBeenCalled();
  });

  it('ai_paused=false: tin khách lưu đúng 1 lần (không lưu đôi sau khi dời lên trước kiểm tạm dừng)', async () => {
    await sendTexts(['Cho mình hỏi giá áo thun size L']);
    expect(m.visitorInserts).toEqual(['Cho mình hỏi giá áo thun size L']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// W6 — chủ trả lời từ điện thoại → dừng AI; khử echo; id tin đi; SSE.

const OWNER_JID = '84901234567@s.whatsapp.net';

function fromMe(id, text, { jid = OWNER_JID, type } = {}) {
  return { message: { key: { remoteJid: jid, id, fromMe: true }, message: { conversation: text } }, type };
}

async function emitRaw(events) {
  const emitter = new EventEmitter();
  m.sessions = [{ sessionKey: SESSION_KEY, emitter }];
  mod.registerSessionHandlers(SESSION_KEY);
  events.forEach((e) => emitter.emit('message', { sessionKey: SESSION_KEY, ...e }));
  for (let i = 0; i < 60; i += 1) await new Promise((r) => setImmediate(r));
}

const agentInserts = () => m.inserts.filter((p) => p[3] === 'agent');
const selfSse = () => m.sse.filter(([, ev, data]) => ev === 'inbox:new_message' && data.isSelf === true);

describe('WhatsApp Baileys — chủ trả lời từ điện thoại (fromMe)', () => {
  it('(a) fromMe có id khớp dòng bot vừa gửi → echo: không lưu, không dừng AI, không SSE', async () => {
    m.recent[101] = [{ external_id: 'BOT-ID-1', content: 'nội dung khác hẳn', created_at: new Date() }];
    await emitRaw([fromMe('BOT-ID-1', 'gõ gì đó')]);
    expect(agentInserts()).toHaveLength(0);
    expect(m.pauseUpdates).toHaveLength(0);
    expect(selfSse()).toHaveLength(0);
  });

  it('(b) fromMe nội dung trùng dòng bot trong 5 phút (chưa có id) → echo', async () => {
    m.recent[101] = [{ external_id: null, content: 'Dạ shop còn hàng ạ', created_at: new Date() }];
    await emitRaw([fromMe('LA-1', 'Dạ shop còn hàng ạ')]);
    expect(agentInserts()).toHaveLength(0);
    expect(m.pauseUpdates).toHaveLength(0);
  });

  it('(b2) nội dung trùng nhưng dòng bot đã quá 5 phút → KHÔNG phải echo', async () => {
    m.recent[101] = [{ external_id: null, content: 'Dạ shop còn hàng ạ', created_at: new Date(Date.now() - 10 * 60 * 1000) }];
    await emitRaw([fromMe('LA-2', 'Dạ shop còn hàng ạ')]);
    expect(m.pauseUpdates).toEqual([101]);
  });

  it('(c) fromMe lạ → dòng agent + ai_paused cho CẢ 2 hội thoại của 2 chatbot, SSE đúng 1 lần mỗi hội thoại', async () => {
    m.ownerConvs = [
      { id: 101, id_channel: 9, visitor_name: 'Alice' },
      { id: 102, id_channel: 9, visitor_name: 'Alice' },
    ];
    await emitRaw([fromMe('PHONE-1', 'Để mình tư vấn trực tiếp nhé', { type: 'notify' })]);
    const agents = agentInserts();
    expect(agents).toHaveLength(2);
    expect(agents.map((p) => p[0]).sort()).toEqual([101, 102]);
    expect(agents[0][4]).toBe('Để mình tư vấn trực tiếp nhé');
    expect(agents[0][5]).toBe('PHONE-1');
    expect(m.pauseUpdates.sort()).toEqual([101, 102]);
    const sse = selfSse();
    expect(sse).toHaveLength(2);
    expect(sse.map(([uid]) => uid)).toEqual(['42', '42']);
    expect(sse.map(([, , d]) => d.conversationId).sort()).toEqual([101, 102]);
    expect(sse[0][2]).toEqual(expect.objectContaining({ channel: 'whatsapp_baileys', type: 'channel', role: 'agent', aiPaused: true }));
  });

  it('(c2) echo nằm ở hội thoại của MỘT chatbot → không dừng nhầm hội thoại chatbot còn lại', async () => {
    m.ownerConvs = [
      { id: 101, id_channel: 9, visitor_name: 'Alice' },
      { id: 102, id_channel: 9, visitor_name: 'Alice' },
    ];
    m.recent[102] = [{ external_id: 'BOT-ID-9', content: 'x', created_at: new Date() }];
    await emitRaw([fromMe('BOT-ID-9', 'x')]);
    expect(m.pauseUpdates).toHaveLength(0);
    expect(agentInserts()).toHaveLength(0);
  });

  it('fromMe tới nhóm / broadcast, hoặc type=append (echo socket / tin cũ lúc offline) → bỏ', async () => {
    await emitRaw([
      fromMe('G-1', 'chào nhóm', { jid: '12036302@g.us' }),
      fromMe('B-1', 'chào', { jid: 'status@broadcast' }),
      fromMe('AP-1', 'tin cũ', { type: 'append' }),
    ]);
    expect(m.pauseUpdates).toHaveLength(0);
    expect(agentInserts()).toHaveLength(0);
  });

  it('fromMe khi chưa có hội thoại nào của số đó → không làm gì', async () => {
    m.ownerConvs = [];
    await emitRaw([fromMe('N-1', 'xin chào')]);
    expect(m.inserts).toHaveLength(0);
    expect(m.pauseUpdates).toHaveLength(0);
  });

  it('fromMe không đi đường AI: không tạo hàng đợi gom, không gọi AI', async () => {
    await emitRaw([fromMe('PHONE-2', 'mình trả lời tay')]);
    expect(m.buckets.size).toBe(0);
    expect(m.callAi).not.toHaveBeenCalled();
    expect(m.sendReply).not.toHaveBeenCalled();
  });
});

describe('WhatsApp Baileys — tự bật lại AI, id tin đi, SSE tin khách', () => {
  it('(d) tin khách sau khi chủ dừng AI (mới dừng): lưu, AI không được gọi', async () => {
    m.paused = true;
    m.pausedAt = new Date();
    m.autoResume = 30;
    await sendTexts(['Cho mình hỏi giá áo thun size L']);
    expect(m.visitorInserts).toHaveLength(1);
    expect(m.buckets.size).toBe(0);
    expect(m.resumeClears).toBe(0);
  });

  it('(e) ai_paused_at cũ hơn autoResumeMinutes → AI trả lời lại và cờ được xoá', async () => {
    m.paused = true;
    m.pausedAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    m.autoResume = 30;
    await sendTexts(['Cho mình hỏi giá áo thun size L']);
    expect(m.resumeClears).toBe(1);
    expect(m.buckets.size).toBe(1);
    await flush();
    expect(m.callAi).toHaveBeenCalledTimes(1);
  });

  it('(f) bot trả lời → dòng bot được ghi external_id = messageId của WhatsApp', async () => {
    m.sendReply = jest.fn(async () => ({ success: true, messageId: 'WA-BOT-77' }));
    await sendTexts(['Cho mình hỏi giá áo thun size L']);
    await flush();
    expect(m.bindUpdates).toHaveLength(1);
    expect(m.bindUpdates[0][1]).toBe('WA-BOT-77');
  });

  it('(f2) câu báo trần lượt (gửi rồi mới lưu) cũng mang external_id = messageId', async () => {
    m.sendReply = jest.fn(async () => ({ success: true, messageId: 'WA-RATE-1' }));
    m.rate = { allowed: false, shouldNotify: true, staticReply: 'het-luot', reason: 'per_hour' };
    await sendTexts(['xin chào']);
    await flush();
    const botRows = m.inserts.filter((p) => p[3] === 'bot');
    expect(botRows).toHaveLength(1);
    expect(botRows[0][5]).toBe('WA-RATE-1');
  });

  it('(g) tin khách → SSE inbox:new_message tới chủ session, đúng 1 lần mỗi hội thoại', async () => {
    await sendTexts(['Cho mình hỏi giá áo thun size L']);
    const events = m.sse.filter(([, ev]) => ev === 'inbox:new_message');
    expect(events).toHaveLength(1);
    expect(events[0][0]).toBe('42');
    expect(events[0][2]).toEqual(expect.objectContaining({
      conversationId: 101, type: 'channel', channel: 'whatsapp_baileys', message: 'Cho mình hỏi giá áo thun size L', role: 'visitor',
    }));
    expect(events[0][2].isSelf).toBeUndefined();
  });

  it('dòng tin khách lưu external_id = id tin WhatsApp (KHÔNG phải SĐT: SĐT làm id khiến tin thứ 2 bị coi trùng)', async () => {
    await sendTexts(['một']);
    const visitorRow = m.inserts.find((p) => p[3] === 'visitor');
    expect(visitorRow[5]).toBe('mid-0');
  });
});
