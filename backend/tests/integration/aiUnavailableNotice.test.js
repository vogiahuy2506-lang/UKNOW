/**
 * G3b (A P1-6) — chatbot không trả lời được khách. Chạy trên PostgreSQL test THẬT:
 *  1. SQL của kho mốc (migration 277): claim nguyên tử, cooldown, lui mốc, dọn, chủ hợp lệ, cascade;
 *  2. mốc sống qua "restart" (bộ nhớ trống, DB có mốc) → không báo lại chủ / không xin lỗi lại khách;
 *  3. bản tin tuần KHÔNG đếm câu xin lỗi là "AI trả lời" ở cả 3 nguồn (web, Zalo cá nhân, kênh).
 */
import { describe, it, expect, afterAll, beforeEach, jest } from '@jest/globals';

const db = (await import('../../src/config/database.js')).default;
const { default: noticeRepo, NOTICE_KIND_OWNER_EMAIL, NOTICE_KIND_VISITOR_APOLOGY } = await import(
  '../../src/repositories/chatbot/aiUnavailableNotice.repository.js'
);
const {
  notifyOwnerAiUnavailable,
  handleAiUnavailable,
  OWNER_EMAIL_COOLDOWN_MS,
  VISITOR_APOLOGY_COOLDOWN_MS,
} = await import('../../src/services/chatbot/aiUnavailableNotice.service.js');
const { default: chatbotDigestRepository } = await import('../../src/repositories/chatbot/chatbotDigest.repository.js');
const { VISITOR_CHAT_UNAVAILABLE_MESSAGE, VISITOR_CHAT_ERROR_MESSAGE } = await import(
  '../../src/services/ai/aiCreditMeter.service.js'
);
const { truncateAll, createUser } = await import('./helpers/db.js');

afterAll(async () => {
  await db.pool.end();
});

beforeEach(async () => {
  await truncateAll();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

const T0 = new Date('2026-10-03T03:00:00.000Z');
const at = (ms) => new Date(T0.getTime() + ms);
const HOUR = 60 * 60 * 1000;

async function ownerRow(idUser) {
  return noticeRepo.find({ idUser, kind: NOTICE_KIND_OWNER_EMAIL });
}

describe('aiUnavailableNotice.repository — SQL thật', () => {
  it('claim: lần đầu được; trong cooldown không; đủ cooldown được và send_count tăng', async () => {
    const owner = await createUser({ username: 'notice_claim_owner' });
    const base = { idUser: owner.id, kind: NOTICE_KIND_VISITOR_APOLOGY, noticeKey: 'zalo_personal:1', cooldownMs: 6 * HOUR };

    expect(await noticeRepo.claim({ ...base, now: T0 })).toBe(true);
    expect(await noticeRepo.claim({ ...base, now: at(6 * HOUR - 1) })).toBe(false);
    expect(await noticeRepo.claim({ ...base, now: at(6 * HOUR) })).toBe(true);

    const row = await noticeRepo.find(base);
    expect(row.send_count).toBe(2);
    expect(new Date(row.last_sent_at).getTime()).toBe(at(6 * HOUR).getTime());
  });

  it('claim NGUYÊN TỬ: 12 tiến trình tranh nhau cùng một mốc → đúng MỘT bên thắng', async () => {
    const owner = await createUser({ username: 'notice_race_owner' });
    const results = await Promise.all(Array.from({ length: 12 }, () => noticeRepo.claim({
      idUser: owner.id, kind: NOTICE_KIND_OWNER_EMAIL, now: T0, cooldownMs: 24 * HOUR,
    })));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await ownerRow(owner.id)).send_count).toBe(1);
  });

  it('mốc theo (chủ, loại, khoá): khách khác / loại khác / chủ khác không chặn nhau', async () => {
    const a = await createUser({ username: 'notice_key_a' });
    const b = await createUser({ username: 'notice_key_b' });
    const claim = (idUser, kind, noticeKey) => noticeRepo.claim({ idUser, kind, noticeKey, now: T0, cooldownMs: 6 * HOUR });

    expect(await claim(a.id, NOTICE_KIND_VISITOR_APOLOGY, 'zalo_personal:1')).toBe(true);
    expect(await claim(a.id, NOTICE_KIND_VISITOR_APOLOGY, 'zalo_personal:2')).toBe(true);
    expect(await claim(a.id, NOTICE_KIND_VISITOR_APOLOGY, 'telegram_personal:1')).toBe(true);
    expect(await claim(a.id, NOTICE_KIND_OWNER_EMAIL, '')).toBe(true);
    expect(await claim(b.id, NOTICE_KIND_VISITOR_APOLOGY, 'zalo_personal:1')).toBe(true);
    expect(await claim(a.id, NOTICE_KIND_VISITOR_APOLOGY, 'zalo_personal:1')).toBe(false);
  });

  it('rewind chỉ lùi đúng dòng mình vừa chiếm; mốc của tiến trình khác (claimedAt khác) không bị đụng', async () => {
    const owner = await createUser({ username: 'notice_rewind_owner' });
    const key = { idUser: owner.id, kind: NOTICE_KIND_OWNER_EMAIL };
    await noticeRepo.claim({ ...key, now: T0, cooldownMs: 24 * HOUR });

    await noticeRepo.rewind({ ...key, claimedAt: at(5000), retryAt: at(-1000) }); // không khớp → bỏ qua
    expect(new Date((await ownerRow(owner.id)).last_sent_at).getTime()).toBe(T0.getTime());

    await noticeRepo.rewind({ ...key, claimedAt: T0, retryAt: at(-1000) });
    expect(new Date((await ownerRow(owner.id)).last_sent_at).getTime()).toBe(at(-1000).getTime());
  });

  it('purgeStaleVisitorApologies xoá câu xin lỗi cũ của ĐÚNG chủ, không đụng mốc email hay chủ khác', async () => {
    const a = await createUser({ username: 'notice_purge_a' });
    const b = await createUser({ username: 'notice_purge_b' });
    await noticeRepo.claim({ idUser: a.id, kind: NOTICE_KIND_VISITOR_APOLOGY, noticeKey: 'old', now: at(-10 * 24 * HOUR), cooldownMs: 6 * HOUR });
    await noticeRepo.claim({ idUser: a.id, kind: NOTICE_KIND_VISITOR_APOLOGY, noticeKey: 'fresh', now: at(-1 * HOUR), cooldownMs: 6 * HOUR });
    await noticeRepo.claim({ idUser: a.id, kind: NOTICE_KIND_OWNER_EMAIL, noticeKey: '', now: at(-10 * 24 * HOUR), cooldownMs: 24 * HOUR });
    await noticeRepo.claim({ idUser: b.id, kind: NOTICE_KIND_VISITOR_APOLOGY, noticeKey: 'old', now: at(-10 * 24 * HOUR), cooldownMs: 6 * HOUR });

    await noticeRepo.purgeStaleVisitorApologies({ idUser: a.id, olderThan: at(-7 * 24 * HOUR) });

    expect(await noticeRepo.find({ idUser: a.id, kind: NOTICE_KIND_VISITOR_APOLOGY, noticeKey: 'old' })).toBeNull();
    expect(await noticeRepo.find({ idUser: a.id, kind: NOTICE_KIND_VISITOR_APOLOGY, noticeKey: 'fresh' })).not.toBeNull();
    expect(await noticeRepo.find({ idUser: a.id, kind: NOTICE_KIND_OWNER_EMAIL })).not.toBeNull();
    expect(await noticeRepo.find({ idUser: b.id, kind: NOTICE_KIND_VISITOR_APOLOGY, noticeKey: 'old' })).not.toBeNull();
  });

  it('findOwnerContact: chỉ chủ đang hoạt động và có email', async () => {
    const active = await createUser({ username: 'notice_contact_active', email: 'active@example.com', fullName: 'Chủ Hoạt Động' });
    const locked = await createUser({ username: 'notice_contact_locked', email: 'locked@example.com', status: 'inactive' });

    expect(await noticeRepo.findOwnerContact(active.id)).toEqual({ email: 'active@example.com', full_name: 'Chủ Hoạt Động' });
    expect(await noticeRepo.findOwnerContact(locked.id)).toBeNull();
    expect(await noticeRepo.findOwnerContact(999999999)).toBeNull();
  });

  it('xoá chủ thì mốc đi theo (ON DELETE CASCADE)', async () => {
    const owner = await createUser({ username: 'notice_cascade_owner' });
    await noticeRepo.claim({ idUser: owner.id, kind: NOTICE_KIND_OWNER_EMAIL, now: T0, cooldownMs: 24 * HOUR });
    await db.query('DELETE FROM users WHERE id = $1', [owner.id]);
    const { rows } = await db.query('SELECT 1 FROM ai_unavailable_notices WHERE id_user = $1', [owner.id]);
    expect(rows).toHaveLength(0);
  });

  it('kind lạ bị CSDL từ chối (CHECK)', async () => {
    const owner = await createUser({ username: 'notice_check_owner' });
    await expect(noticeRepo.claim({ idUser: owner.id, kind: 'khong_biet', now: T0, cooldownMs: HOUR })).rejects.toThrow();
  });
});

describe('aiUnavailableNotice.service + DB thật — mốc sống qua restart', () => {
  it('chủ hết credit: email đúng MỘT lần trong 24 giờ, mốc nằm trong DB', async () => {
    const owner = await createUser({ username: 'notice_svc_owner', email: 'chu_notice@example.com', fullName: 'Chủ Notice' });
    const sendEmail = jest.fn(async () => ({}));
    const deps = { sendEmail, buildBillingUrl: () => 'https://founderai.test/app/billing' };

    const first = await notifyOwnerAiUnavailable({ ownerUserId: owner.id, reason: 'credit_exhausted', now: T0, deps });
    const second = await notifyOwnerAiUnavailable({ ownerUserId: owner.id, reason: 'credit_exhausted', now: at(2 * HOUR), deps });

    expect(first).toEqual({ sent: true });
    expect(second).toEqual({ sent: false, skipped: 'cooldown' });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].to).toBe('chu_notice@example.com');
    expect((await ownerRow(owner.id)).send_count).toBe(1);
  });

  it('RESTART: bộ nhớ trống nhưng DB đã có mốc từ trước → KHÔNG báo lại chủ, KHÔNG xin lỗi lại khách', async () => {
    const owner = await createUser({ username: 'notice_restart_owner', email: 'restart@example.com' });
    // Tiến trình CŨ đã báo chủ và xin lỗi khách 1 giờ trước, rồi bị deploy giết.
    await noticeRepo.claim({ idUser: owner.id, kind: NOTICE_KIND_OWNER_EMAIL, now: at(-1 * HOUR), cooldownMs: OWNER_EMAIL_COOLDOWN_MS });
    await noticeRepo.claim({ idUser: owner.id, kind: NOTICE_KIND_VISITOR_APOLOGY, noticeKey: 'zalo_personal:42', now: at(-1 * HOUR), cooldownMs: VISITOR_APOLOGY_COOLDOWN_MS });

    // Tiến trình MỚI (module vừa nạp, không giữ gì trong RAM).
    const sendEmail = jest.fn(async () => ({}));
    const out = await handleAiUnavailable({
      ownerUserId: owner.id, reason: 'credit_exhausted', channel: 'zalo_personal', conversationId: 42, now: T0, deps: { sendEmail },
    });
    await out.ownerNotice;

    expect(out.send).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('khách nhắn 10 tin khi chủ hết credit: đúng 1 câu xin lỗi + 1 email chủ; khách khác vẫn nhận; sau 6 giờ lại nhận', async () => {
    const owner = await createUser({ username: 'notice_flow_owner', email: 'flow@example.com' });
    const sendEmail = jest.fn(async () => ({}));
    const handle = (conversationId, now) => handleAiUnavailable({
      ownerUserId: owner.id, reason: 'credit_exhausted', channel: 'telegram_personal', conversationId, now, deps: { sendEmail },
    });

    const burst = await Promise.all(Array.from({ length: 10 }, () => handle(7, T0)));
    await Promise.all(burst.map((r) => r.ownerNotice));
    expect(burst.filter((r) => r.send)).toHaveLength(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);

    expect((await handle(8, at(60_000))).send).toBe(true);
    expect((await handle(7, at(6 * HOUR - 1))).send).toBe(false);
    expect((await handle(7, at(6 * HOUR))).send).toBe(true);
  });
});

describe('bản tin tuần — câu xin lỗi KHÔNG phải "AI trả lời" (SQL thật, 3 nguồn)', () => {
  const inPeriod = '2026-09-10T10:00:00.000Z';
  const range = { startIso: '2026-09-07T00:00:00.000Z', endIso: '2026-09-14T00:00:00.000Z' };

  async function seed() {
    const owner = await createUser({ username: 'notice_digest_owner', email: 'digest_notice@example.com' });
    const { rows: [widget] } = await db.query(
      'INSERT INTO web_widget_configs (id_user, widget_key) VALUES ($1, $2) RETURNING id', [owner.id, `key_${Date.now()}`]
    );
    const { rows: [webConv] } = await db.query(
      `INSERT INTO webchat_conversations (id_user, id_widget_config, session_id, visitor_name)
       VALUES ($1, $2, 'sess_notice', 'Khách Web') RETURNING id`, [owner.id, widget.id]
    );
    const { rows: [zaloSetting] } = await db.query(
      `INSERT INTO zalo_settings (id_user, zalo_user_id, display_name) VALUES ($1, 'zalo_notice', 'Zalo') RETURNING id`, [owner.id]
    );
    const { rows: [zaloConv] } = await db.query(
      `INSERT INTO zalo_personal_conversations (id_user, id_zalo_setting, external_id, visitor_name)
       VALUES ($1, $2, 'zalo_ext_notice', 'Khách Zalo') RETURNING id`, [owner.id, zaloSetting.id]
    );
    const { rows: [conn] } = await db.query(
      `INSERT INTO channel_connections (id_user, channel, external_channel_id, display_name)
       VALUES ($1, 'telegram', 'tg_notice', 'Telegram') RETURNING id`, [owner.id]
    );
    const { rows: [chConv] } = await db.query(
      `INSERT INTO channel_conversations (id_user, id_channel, channel, external_id, visitor_name)
       VALUES ($1, $2, 'telegram', 'tg_ext_notice', 'Khách TG') RETURNING id`, [owner.id, conn.id]
    );
    return { owner, webConv: webConv.id, zaloSetting: zaloSetting.id, zaloConv: zaloConv.id, conn: conn.id, chConv: chConv.id };
  }

  const web = (s, role, content, metadata = {}) => db.query(
    `INSERT INTO webchat_messages (id_user, id_conversation, role, content, metadata, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
    [s.owner.id, s.webConv, role, content, JSON.stringify(metadata), inPeriod]
  );
  const zalo = (s, role, content, metadata = {}) => db.query(
    `INSERT INTO zalo_personal_messages (id_user, id_zalo_setting, id_conversation, role, content, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [s.owner.id, s.zaloSetting, s.zaloConv, role, content, JSON.stringify(metadata), inPeriod]
  );
  const channel = (s, role, content, metadata = {}) => db.query(
    `INSERT INTO channel_messages (id_user, id_channel, id_conversation, role, content, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [s.owner.id, s.conn, s.chConv, role, content, JSON.stringify(metadata), inPeriod]
  );
  const stats = (s) => chatbotDigestRepository.getDigestStats(s.owner.id, range);
  const aiOf = (st, ch) => st.byChannel.find((c) => c.channel === ch)?.aiReplies;

  it('tin có NHÃN ai_unavailable (nội dung bất kỳ) không được đếm — ở cả 3 nguồn; câu trả lời thật vẫn đếm', async () => {
    const s = await seed();
    await web(s, 'visitor', 'Chào shop');
    await web(s, 'assistant', 'Dạ có ạ');
    await web(s, 'assistant', 'nội dung khác hẳn', { source: 'ai_unavailable', reason: 'ai_token_limit' });
    await zalo(s, 'visitor', 'Chào shop');
    await zalo(s, 'agent', 'Dạ giá 100k ạ', { source: 'ai_auto_reply' });
    await zalo(s, 'agent', 'nội dung khác hẳn', { source: 'ai_unavailable', reason: 'credit_exhausted' });
    await channel(s, 'visitor', 'Chào shop');
    await channel(s, 'bot', 'Dạ còn hàng ạ');
    await channel(s, 'bot', 'nội dung khác hẳn', { source: 'ai_unavailable', reason: 'credit_exhausted' });

    const st = await stats(s);

    expect(aiOf(st, 'web')).toBe(1);
    expect(aiOf(st, 'zalo_personal')).toBe(1);
    expect(aiOf(st, 'telegram')).toBe(1);
    expect(st.aiReplies).toBe(3);
  });

  it('tin xin lỗi CŨ (ghi trước khi có nhãn: nhãn ai_auto_reply / role bot, không metadata) cũng bị loại theo đầu câu cố định', async () => {
    const s = await seed();
    await web(s, 'assistant', VISITOR_CHAT_ERROR_MESSAGE);
    await zalo(s, 'agent', VISITOR_CHAT_UNAVAILABLE_MESSAGE, { source: 'ai_auto_reply' });
    await zalo(s, 'agent', `${VISITOR_CHAT_ERROR_MESSAGE}\n\nĐã ghi nhận số điện thoại 0912345678. Chủ doanh nghiệp sẽ liên hệ lại với bạn sớm.`, { source: 'ai_auto_reply' });
    await channel(s, 'bot', VISITOR_CHAT_UNAVAILABLE_MESSAGE);
    await zalo(s, 'agent', 'Dạ giá 100k ạ', { source: 'ai_auto_reply' }); // câu thật duy nhất

    const st = await stats(s);

    expect(st.aiReplies).toBe(1);
    expect(aiOf(st, 'zalo_personal')).toBe(1);
  });

  it('tin bot nội dung rỗng (ảnh) hoặc metadata NULL vẫn được đếm — bộ lọc (NULL-an toàn) không nuốt nhầm', async () => {
    const s = await seed();
    await db.query(
      `INSERT INTO channel_messages (id_user, id_channel, id_conversation, role, content, metadata, created_at)
       VALUES ($1, $2, $3, 'bot', '', NULL, $4)`, [s.owner.id, s.conn, s.chConv, inPeriod]
    );
    await db.query(
      `INSERT INTO webchat_messages (id_user, id_conversation, role, content, metadata, created_at)
       VALUES ($1, $2, 'assistant', 'Dạ ạ', NULL, $3)`, [s.owner.id, s.webConv, inPeriod]
    );

    const st = await stats(s);

    expect(aiOf(st, 'telegram')).toBe(1);
    expect(aiOf(st, 'web')).toBe(1);
  });
});
