/**
 * aiUnavailableNotice.service (G3b, A P1-6): email báo chủ (24 giờ / chủ), câu xin lỗi (6 giờ / khách), nhãn, và "không bao
 * giờ ném lỗi ra đường trả lời khách". Kho mốc là bản giả phản chiếu ngữ nghĩa SQL (fakeAiUnavailableNoticeRepo.js); SQL
 * thật chạy ở tests/integration/aiUnavailableNotice.test.js.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createFakeNoticeRepo } from './fakeAiUnavailableNoticeRepo.js';

const {
  handleAiUnavailable,
  notifyOwnerAiUnavailable,
  claimVisitorApology,
  buildAiUnavailableOwnerEmail,
  OWNER_EMAIL_COOLDOWN_MS,
  VISITOR_APOLOGY_COOLDOWN_MS,
  OWNER_EMAIL_RETRY_MS,
} = await import('../aiUnavailableNotice.service.js');

const T0 = new Date('2026-10-03T03:00:00.000Z');
const at = (ms) => new Date(T0.getTime() + ms);

let repo;
let sendEmail;
let deps;

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  repo = createFakeNoticeRepo({ owner: { email: 'chu@shop.vn', full_name: 'Nguyễn Văn Chủ' } });
  sendEmail = jest.fn(async () => ({ messageId: 'x' }));
  deps = { repo, sendEmail, buildBillingUrl: () => 'https://founderai.test/app/billing' };
});

describe('notifyOwnerAiUnavailable — email báo chủ, mốc 24 giờ', () => {
  it('gửi ĐÚNG MỘT email tới chủ: nêu lý do, tên chủ, nút tới trang Gói & thanh toán', async () => {
    const out = await notifyOwnerAiUnavailable({ ownerUserId: 7, reason: 'credit_exhausted', now: T0, deps });

    expect(out).toEqual({ sent: true });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = sendEmail.mock.calls[0][0];
    expect(mail.to).toBe('chu@shop.vn');
    expect(mail.subject).toContain('Chatbot không trả lời được khách');
    expect(mail.subject).toContain('hết lượt AI');
    expect(mail.html).toContain('Nguyễn Văn Chủ');
    expect(mail.html).toContain('https://founderai.test/app/billing');
    expect(mail.html).toContain('Hộp thư');
  });

  it('trong 24 giờ KHÔNG gửi lại (kể cả 1 mili giây trước hạn); đủ 24 giờ thì gửi lần hai', async () => {
    await notifyOwnerAiUnavailable({ ownerUserId: 7, reason: 'credit_exhausted', now: T0, deps });
    const soon = await notifyOwnerAiUnavailable({ ownerUserId: 7, reason: 'credit_exhausted', now: at(OWNER_EMAIL_COOLDOWN_MS - 1), deps });
    expect(soon).toEqual({ sent: false, skipped: 'cooldown' });
    expect(sendEmail).toHaveBeenCalledTimes(1);

    const later = await notifyOwnerAiUnavailable({ ownerUserId: 7, reason: 'credit_exhausted', now: at(OWNER_EMAIL_COOLDOWN_MS), deps });
    expect(later).toEqual({ sent: true });
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it('mốc đã nằm trong kho từ trước (tiến trình mới sau restart, bộ nhớ trống) → KHÔNG gửi lại', async () => {
    repo.rows.set('7|owner_email|', { last_sent_at: at(-60 * 60 * 1000), send_count: 1 });

    const out = await notifyOwnerAiUnavailable({ ownerUserId: 7, reason: 'credit_exhausted', now: T0, deps });

    expect(out).toEqual({ sent: false, skipped: 'cooldown' });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('hai chủ khác nhau có mốc riêng', async () => {
    await notifyOwnerAiUnavailable({ ownerUserId: 7, reason: 'credit_exhausted', now: T0, deps });
    await notifyOwnerAiUnavailable({ ownerUserId: 8, reason: 'credit_exhausted', now: T0, deps });
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it('gửi email THẤT BẠI (SMTP lỗi): lui mốc để thử lại sau 10 phút, không bị cooldown 24 giờ nuốt mất', async () => {
    sendEmail.mockRejectedValueOnce(new Error('SMTP 421'));

    const failed = await notifyOwnerAiUnavailable({ ownerUserId: 7, reason: 'credit_exhausted', now: T0, deps });
    expect(failed).toEqual({ sent: false, skipped: 'send_failed' });

    const tooSoon = await notifyOwnerAiUnavailable({ ownerUserId: 7, reason: 'credit_exhausted', now: at(OWNER_EMAIL_RETRY_MS - 1000), deps });
    expect(tooSoon).toEqual({ sent: false, skipped: 'cooldown' });

    const retry = await notifyOwnerAiUnavailable({ ownerUserId: 7, reason: 'credit_exhausted', now: at(OWNER_EMAIL_RETRY_MS + 1000), deps });
    expect(retry).toEqual({ sent: true });
    expect(sendEmail).toHaveBeenCalledTimes(2);

    // Gửi được rồi thì cooldown 24 giờ tính từ lần thành công.
    const after = await notifyOwnerAiUnavailable({ ownerUserId: 7, reason: 'credit_exhausted', now: at(OWNER_EMAIL_RETRY_MS + 2000), deps });
    expect(after).toEqual({ sent: false, skipped: 'cooldown' });
  });

  it('chủ không còn hoạt động / không có email: không gửi và GIỮ mốc (không thử lại mỗi lần có khách nhắn)', async () => {
    repo.ownerContact = null;

    const out = await notifyOwnerAiUnavailable({ ownerUserId: 7, reason: 'credit_exhausted', now: T0, deps });
    const again = await notifyOwnerAiUnavailable({ ownerUserId: 7, reason: 'credit_exhausted', now: at(1000), deps });

    expect(out).toEqual({ sent: false, skipped: 'no_email' });
    expect(again).toEqual({ sent: false, skipped: 'cooldown' });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('dọn câu xin lỗi cũ của chủ này (best-effort) khi chiếm được mốc email', async () => {
    await notifyOwnerAiUnavailable({ ownerUserId: 7, reason: 'credit_exhausted', now: T0, deps });
    expect(repo.purgeStaleVisitorApologies).toHaveBeenCalledWith({
      idUser: 7,
      olderThan: new Date(T0.getTime() - 7 * 24 * 60 * 60 * 1000),
    });
  });
});

describe('buildAiUnavailableOwnerEmail', () => {
  it('mỗi lý do có câu nguyên nhân + việc cần làm riêng; tên chủ được escape HTML', () => {
    const credit = buildAiUnavailableOwnerEmail({ fullName: 'A', reason: 'credit_exhausted', billingUrl: 'https://x/app/billing' });
    const expired = buildAiUnavailableOwnerEmail({ fullName: 'A', reason: 'subscription_expired', billingUrl: 'https://x/app/billing' });
    const token = buildAiUnavailableOwnerEmail({ fullName: 'A', reason: 'ai_token_limit', billingUrl: 'https://x/app/billing' });

    expect(credit.subject).toContain('hết lượt AI');
    expect(expired.subject).toContain('hết hạn');
    expect(token.subject).toContain('hạn mức AI');
    expect(credit.html).toContain('Nạp thêm lượt AI');
    expect(expired.html).toContain('Gia hạn gói');

    const xss = buildAiUnavailableOwnerEmail({ fullName: '<script>alert(1)</script>', reason: 'credit_exhausted', billingUrl: 'https://x/"onmouseover="y' });
    expect(xss.html).not.toContain('<script>alert(1)</script>');
    expect(xss.html).toContain('&lt;script&gt;');
    expect(xss.html).not.toContain('href="https://x/"onmouseover="y"');
  });
});

describe('claimVisitorApology — tối đa 1 câu / khách / 6 giờ', () => {
  const claim = (over = {}) => claimVisitorApology({ ownerUserId: 7, channel: 'zalo_personal', conversationId: 501, now: T0, deps, ...over });

  it('lần đầu được, lần hai trong 6 giờ không; đúng 6 giờ thì lại được', async () => {
    expect(await claim()).toBe(true);
    expect(await claim({ now: at(VISITOR_APOLOGY_COOLDOWN_MS - 1) })).toBe(false);
    expect(await claim({ now: at(VISITOR_APOLOGY_COOLDOWN_MS) })).toBe(true);
  });

  it('khoá theo (kênh, hội thoại): khách khác / kênh khác có mốc riêng', async () => {
    await claim();
    expect(await claim({ conversationId: 502 })).toBe(true);
    expect(await claim({ channel: 'telegram_personal' })).toBe(true);
    expect(await claim({ ownerUserId: 8 })).toBe(true);
  });

  it('10 tin dồn dập từ một khách: đúng 1 câu xin lỗi', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => claim()));
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

describe('handleAiUnavailable', () => {
  const handle = (over = {}) => handleAiUnavailable({
    ownerUserId: 7, reason: 'credit_exhausted', channel: 'zalo_personal', conversationId: 501, now: T0, deps, ...over,
  });

  it('hết credit: gửi câu xin lỗi + nhãn ai_unavailable (+ lý do) + báo chủ', async () => {
    const out = await handle();
    await out.ownerNotice;

    expect(out.send).toBe(true);
    expect(out.source).toBe('ai_unavailable');
    expect(out.reason).toBe('credit_exhausted');
    expect(out.metadata).toEqual({ source: 'ai_unavailable', reason: 'credit_exhausted' });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('AI lỗi tạm thời (ai_error): có câu xin lỗi + nhãn nhưng KHÔNG email chủ', async () => {
    const out = await handle({ reason: 'ai_error' });
    await out.ownerNotice;

    expect(out.send).toBe(true);
    expect(out.metadata.reason).toBe('ai_error');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('lý do lạ được đưa về ai_error (không báo chủ nhầm)', async () => {
    const out = await handle({ reason: 'gi_do_la' });
    await out.ownerNotice;
    expect(out.reason).toBe('ai_error');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('khách đã nhận câu xin lỗi trong 6 giờ: send=false nhưng NHÃN vẫn có; chủ vẫn không bị báo lại trong 24 giờ', async () => {
    await (await handle()).ownerNotice;
    const second = await handle({ now: at(60 * 1000) });
    await second.ownerNotice;

    expect(second.send).toBe(false);
    expect(second.source).toBe('ai_unavailable');
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('widget (không kênh/hội thoại): luôn send=true, không giới hạn câu xin lỗi theo khách, VẪN báo chủ', async () => {
    const a = await handle({ channel: null, conversationId: null });
    const b = await handle({ channel: null, conversationId: null });
    await Promise.all([a.ownerNotice, b.ownerNotice]);

    expect(a.send).toBe(true);
    expect(b.send).toBe(true);
    expect(repo.rows.has('7|visitor_apology|null:null')).toBe(false);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('kho mốc hỏng (DB lỗi): KHÔNG ném lỗi, khách vẫn nhận câu xin lỗi, chủ không bị báo', async () => {
    repo.claim.mockRejectedValue(new Error('connection terminated'));

    const out = await handle();
    await out.ownerNotice;

    expect(out.send).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('SMTP hỏng: ownerNotice KHÔNG reject (không làm hỏng đường trả lời khách)', async () => {
    sendEmail.mockRejectedValue(new Error('SMTP down'));

    const out = await handle();
    await expect(out.ownerNotice).resolves.toEqual({ sent: false, skipped: 'send_failed' });
    expect(out.send).toBe(true);
  });

  it('thiếu ownerUserId: không chiếm mốc nào, không báo ai', async () => {
    const out = await handle({ ownerUserId: null });
    await out.ownerNotice;
    expect(out.send).toBe(true);
    expect(repo.claim).not.toHaveBeenCalled();
  });
});
