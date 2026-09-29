/**
 * P3 bước 4 — báo chủ tài khoản khi kênh mất kết nối. Đồng hồ do test truyền vào (`now`), mọi mốc tính
 * tương đối từ nó — không phụ thuộc ngày thật của máy chạy.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../../../repositories/chatbot/channelDisconnectAlert.repository.js', () => ({
  default: {},
}));

const {
  scanAndNotify,
  selectAlertable,
  nextDisconnectedSince,
  buildChannelDisconnectEmail,
  channelSettingsUrl,
  DISCONNECT_AFTER_MINUTES,
} = await import('../channelDisconnectAlert.service.js');

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const T0 = new Date(Date.UTC(2026, 8, 1, 3, 0, 0)); // mốc tuỳ ý — mọi thứ khác tương đối so với T0
const at = (offsetMs) => new Date(T0.getTime() + offsetMs);

/** Repo giả có trạng thái, đúng hình dạng hàng thật (snake_case, ISO/Date). */
function makeFakeRepo({ zalo = [], telegram = [], whatsapp = [], owners = {} } = {}) {
  const states = new Map(); // `${channel}|${ref}` -> row
  const repo = {
    listZaloSnapshot: jest.fn(async () => zalo),
    listTelegramAccounts: jest.fn(async () => telegram),
    listWhatsappSessions: jest.fn(async () => whatsapp),
    listStatesByChannel: jest.fn(async (channel) =>
      [...states.values()].filter((r) => r.channel === channel)
    ),
    syncChannel: jest.fn(async (channel, entries) => {
      const keep = new Set(entries.map((e) => e.accountRef));
      for (const e of entries) {
        const key = `${channel}|${e.accountRef}`;
        const prev = states.get(key);
        states.set(key, {
          channel,
          account_ref: e.accountRef,
          id_user: e.idUser,
          account_label: e.label,
          disconnected_since: e.disconnectedSince,
          last_alerted_at: prev?.last_alerted_at || null,
        });
      }
      for (const [key, row] of [...states.entries()]) {
        if (row.channel === channel && !keep.has(row.account_ref)) states.delete(key);
      }
    }),
    listDisconnectedWithOwner: jest.fn(async () =>
      [...states.values()]
        .filter((r) => r.disconnected_since && owners[r.id_user])
        .map((r) => ({ ...r, email: owners[r.id_user].email, full_name: owners[r.id_user].name }))
    ),
    markAlerted: jest.fn(async (items, now) => {
      for (const it of items) states.get(`${it.channel}|${it.account_ref}`).last_alerted_at = now;
    }),
  };
  return { repo, states };
}

function makeDeps(fake, { listening = new Set(), tgOn = true, waStatus = {} } = {}) {
  return {
    repo: fake.repo,
    sendEmail: jest.fn(async () => ({ messageId: 'x' })),
    getTelegramManager: () => (tgOn ? { isListening: (id) => listening.has(String(id)) } : null),
    getWhatsappSession: (key) => (waStatus[key] ? { status: waStatus[key], userName: 'Shop A' } : null),
  };
}

const TG = (ref, idUser = 1, hint = null) => ({ account_ref: ref, id_user: idUser, label: `tg${ref}`, since_hint: hint });

describe('nextDisconnectedSince', () => {
  it('đang nối → null', () => {
    expect(nextDisconnectedSince({ down: false, existing: { disconnected_since: at(-HOUR) }, now: T0 })).toBeNull();
  });
  it('đang mất, đã có mốc → giữ mốc', () => {
    const since = at(-HOUR);
    expect(nextDisconnectedSince({ down: true, existing: { disconnected_since: since }, now: T0 })).toEqual(since);
  });
  it('lần đầu thấy → dùng gợi ý nếu hợp lệ, không thì now', () => {
    expect(nextDisconnectedSince({ down: true, existing: null, sinceHint: at(-2 * DAY), now: T0 })).toEqual(at(-2 * DAY));
    expect(nextDisconnectedSince({ down: true, existing: null, sinceHint: at(HOUR), now: T0 })).toEqual(T0);
    expect(nextDisconnectedSince({ down: true, existing: null, sinceHint: null, now: T0 })).toEqual(T0);
  });
  it('vừa chuyển từ nối sang mất (dòng có, mốc null) → now, không dùng gợi ý cũ', () => {
    expect(
      nextDisconnectedSince({ down: true, existing: { disconnected_since: null }, sinceHint: at(-3 * DAY), now: T0 })
    ).toEqual(T0);
  });
});

describe('selectAlertable', () => {
  const row = (sinceOffset, alertedOffset = null) => ({
    disconnected_since: at(sinceOffset),
    last_alerted_at: alertedOffset === null ? null : at(alertedOffset),
  });
  it('chưa đủ 15 phút → chưa báo; đủ → báo', () => {
    expect(selectAlertable([row(-(DISCONNECT_AFTER_MINUTES - 1) * MIN)], T0)).toHaveLength(0);
    expect(selectAlertable([row(-(DISCONNECT_AFTER_MINUTES + 1) * MIN)], T0)).toHaveLength(1);
  });
  it('mất quá 7 ngày → không báo (bỏ dùng từ lâu)', () => {
    expect(selectAlertable([row(-(7 * DAY + MIN))], T0)).toHaveLength(0);
    expect(selectAlertable([row(-(7 * DAY - MIN))], T0)).toHaveLength(1);
  });
  it('đã báo trong 24h → không báo; quá 24h → báo lại', () => {
    expect(selectAlertable([row(-2 * HOUR, -(23 * HOUR))], T0)).toHaveLength(0);
    expect(selectAlertable([row(-2 * DAY, -(25 * HOUR))], T0)).toHaveLength(1);
  });
});

describe('scanAndNotify', () => {
  let fake;
  beforeEach(() => {
    fake = makeFakeRepo({
      telegram: [TG('111')],
      owners: { 1: { email: 'chu@example.com', name: 'Chu Shop' } },
    });
  });

  it('mất < 15 phút: chỉ ghi mốc, chưa email', async () => {
    const deps = makeDeps(fake);
    const r = await scanAndNotify({ now: T0, deps });
    expect(r.emails.sent).toBe(0);
    await scanAndNotify({ now: at(10 * MIN), deps });
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });

  it('mất > 15 phút: email chủ một lần, có tên tài khoản + link trang kênh; lượt kế trong 24h KHÔNG gửi lần 2', async () => {
    const deps = makeDeps(fake);
    await scanAndNotify({ now: T0, deps });
    const r1 = await scanAndNotify({ now: at(20 * MIN), deps });
    expect(r1.emails.sent).toBe(1);
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
    const mail = deps.sendEmail.mock.calls[0][0];
    expect(mail.to).toBe('chu@example.com');
    expect(mail.html).toContain('tg111');
    expect(mail.html).toContain(channelSettingsUrl('telegram'));

    await scanAndNotify({ now: at(30 * MIN), deps });
    await scanAndNotify({ now: at(12 * HOUR), deps });
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);

    // Sau 24h vẫn còn mất → nhắc lại
    await scanAndNotify({ now: at(20 * MIN + 25 * HOUR), deps });
    expect(deps.sendEmail).toHaveBeenCalledTimes(2);
  });

  it('nối lại rồi rớt lại trong 24h: cooldown giữ nguyên, không email lần 2', async () => {
    const listening = new Set();
    const deps = makeDeps(fake, { listening });
    await scanAndNotify({ now: T0, deps });
    await scanAndNotify({ now: at(20 * MIN), deps }); // gửi #1
    listening.add('111');
    await scanAndNotify({ now: at(HOUR), deps }); // nối lại
    expect(fake.states.get('telegram|111').disconnected_since).toBeNull();
    listening.delete('111');
    await scanAndNotify({ now: at(2 * HOUR), deps }); // rớt lại — mốc mới
    await scanAndNotify({ now: at(2 * HOUR + 20 * MIN), deps });
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
  });

  it('nhiều tài khoản cùng chủ → một email gộp; hai chủ → hai email', async () => {
    fake = makeFakeRepo({
      telegram: [TG('111', 1), TG('222', 1), TG('333', 2)],
      owners: { 1: { email: 'a@example.com', name: 'A' }, 2: { email: 'b@example.com', name: 'B' } },
    });
    const deps = makeDeps(fake);
    await scanAndNotify({ now: T0, deps });
    await scanAndNotify({ now: at(20 * MIN), deps });
    expect(deps.sendEmail).toHaveBeenCalledTimes(2);
    const toA = deps.sendEmail.mock.calls.find((c) => c[0].to === 'a@example.com')[0];
    expect(toA.html).toContain('tg111');
    expect(toA.html).toContain('tg222');
    expect(toA.html).not.toContain('tg333');
  });

  it('tài khoản đã nối (listening) không bị báo', async () => {
    const deps = makeDeps(fake, { listening: new Set(['111']) });
    await scanAndNotify({ now: T0, deps });
    await scanAndNotify({ now: at(HOUR), deps });
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });

  it('gửi email lỗi: KHÔNG ghi đã báo → lượt sau thử lại', async () => {
    const deps = makeDeps(fake);
    deps.sendEmail.mockRejectedValueOnce(new Error('smtp down'));
    await scanAndNotify({ now: T0, deps });
    const r1 = await scanAndNotify({ now: at(20 * MIN), deps });
    expect(r1.emails.failed).toBe(1);
    expect(fake.states.get('telegram|111').last_alerted_at).toBeNull();
    const r2 = await scanAndNotify({ now: at(30 * MIN), deps });
    expect(r2.emails.sent).toBe(1);
  });

  it('tài khoản mất từ > 7 ngày (gợi ý cũ) không bao giờ được báo', async () => {
    fake = makeFakeRepo({
      telegram: [TG('111', 1, at(-8 * DAY))],
      owners: { 1: { email: 'a@example.com', name: 'A' } },
    });
    const deps = makeDeps(fake);
    await scanAndNotify({ now: T0, deps });
    await scanAndNotify({ now: at(HOUR), deps });
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });

  it('tài khoản bị xoá/tắt (không còn trong snapshot) thì dòng bị dọn, không báo', async () => {
    const deps = makeDeps(fake);
    await scanAndNotify({ now: T0, deps });
    fake.repo.listTelegramAccounts.mockResolvedValue([]);
    await scanAndNotify({ now: at(20 * MIN), deps });
    expect(fake.states.size).toBe(0);
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });

  it('gateway Telegram chưa chạy: bỏ qua kênh, KHÔNG xoá dòng đã có', async () => {
    const deps = makeDeps(fake);
    await scanAndNotify({ now: T0, deps });
    const off = makeDeps(fake, { tgOn: false });
    await scanAndNotify({ now: at(HOUR), deps: off });
    expect(fake.states.has('telegram|111')).toBe(true);
    expect(off.sendEmail).not.toHaveBeenCalled();
  });

  it('WhatsApp: chủ lấy từ tiền tố sessionKey; open thì không báo, không open thì báo', async () => {
    fake = makeFakeRepo({
      whatsapp: [
        { session_key: '7-main', since_hint: null },
        { session_key: '7-second', since_hint: null },
      ],
      owners: { 7: { email: 'wa@example.com', name: 'W' } },
    });
    const deps = makeDeps(fake, { waStatus: { '7-main': 'open', '7-second': 'unrecoverable' } });
    await scanAndNotify({ now: T0, deps });
    await scanAndNotify({ now: at(20 * MIN), deps });
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
    const html = deps.sendEmail.mock.calls[0][0].html;
    expect(html).toContain('WhatsApp');
    expect(fake.states.get('whatsapp|7-main').disconnected_since).toBeNull();
    expect(fake.states.get('whatsapp|7-second').disconnected_since).not.toBeNull();
  });

  it('Zalo: cờ down từ truy vấn được tôn trọng', async () => {
    fake = makeFakeRepo({
      zalo: [
        { account_ref: '5', id_user: 1, label: 'Zalo Shop', down: true, since_hint: null },
        { account_ref: '6', id_user: 1, label: 'Zalo OK', down: false, since_hint: null },
      ],
      owners: { 1: { email: 'a@example.com', name: 'A' } },
    });
    const deps = makeDeps(fake);
    await scanAndNotify({ now: T0, deps });
    await scanAndNotify({ now: at(20 * MIN), deps });
    const html = deps.sendEmail.mock.calls[0][0].html;
    expect(html).toContain('Zalo Shop');
    expect(html).not.toContain('Zalo OK');
  });
});

describe('buildChannelDisconnectEmail', () => {
  it('escape tên tài khoản do người dùng đặt', () => {
    const { html } = buildChannelDisconnectEmail({
      fullName: '<b>x</b>',
      items: [{ channel: 'telegram', account_ref: '1', account_label: '<script>alert(1)</script>' }],
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
