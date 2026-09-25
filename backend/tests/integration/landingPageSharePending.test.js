/**
 * PR-1 share notification (2026-09-25).
 *
 * Phạm vi:
 *  - share với email đã có user → status='active', mail gửi với subject "đã chia sẻ"
 *  - share với email ngoài hệ thống → status='pending', id_recipient=NULL, mail gửi
 *    với subject "muốn chia sẻ"
 *  - share 2 lần cùng email ngoài cùng landing → chỉ 1 row pending (UPDATE không INSERT)
 *  - user đăng ký với email đang pending → auto-claim, share xuất hiện trong
 *    getSharedWithMe của user mới
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';

const mockSendMail = jest.fn().mockResolvedValue({ messageId: '<sys@test>' });
const mockCreateTransport = jest.fn().mockReturnValue({
  verify: jest.fn().mockResolvedValue(true),
  sendMail: mockSendMail,
});
jest.unstable_mockModule('nodemailer', () => ({
  default: { createTransport: mockCreateTransport },
  createTransport: mockCreateTransport,
}));

const request = (await import('supertest')).default;
const { createApp } = await import('../../src/app.js');
const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser } = await import('../integration/helpers/db.js');

let app;
let originalSendGridKey;

beforeAll(() => {
  app = createApp();
  originalSendGridKey = process.env.SENDGRID_API_KEY;
  process.env.SENDGRID_API_KEY = 'SG.test-key-for-landing-share-only';
  // Test này kiểm tra sendMail được gọi (kiểm chứng email builder chạy đúng),
  // và tránh SMTP thật.
  process.env.TEST_SEND_EMAIL = '1';
});

afterAll(() => {
  if (originalSendGridKey === undefined) delete process.env.SENDGRID_API_KEY;
  else process.env.SENDGRID_API_KEY = originalSendGridKey;
  delete process.env.TEST_SEND_EMAIL;
});

beforeEach(async () => {
  await truncateAll();
  mockSendMail.mockClear();
});

async function loginUser(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword || 'Passw0rd!' });
  expect(res.status).toBe(200);
  return res.body.data.accessToken;
}

async function createLandingPage(owner, { slug, title = 'Landing share test' } = {}) {
  // Random suffix để tránh trùng slug giữa các test khi truncateAll.
  const finalSlug = slug || `lp-share-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const res = await request(app)
    .post('/api/admin/landing-pages')
    .set('Authorization', `Bearer ${owner.token}`)
    .send({
      slug: finalSlug,
      title,
      htmlContent: '<h1>Hello</h1>',
      isPublished: false,
    });
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`createLandingPage failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  // Trả về { id } đúng — service DTO trả cả bigint mở rộng (response có thể là object).
  // Lookup id từ DB cho chắc (test integration không ép phải match shape DTO).
  if (res.body?.data?.id) return { id: Number(res.body.data.id), ...res.body.data };
  // Fallback: query DB theo slug.
  const { rows } = await db.query(
    `SELECT id FROM landing_pages WHERE slug = $1 ORDER BY id DESC LIMIT 1`,
    [finalSlug]
  );
  if (!rows[0]) throw new Error(`Không tìm thấy landing vừa tạo (slug=${finalSlug})`);
  return { id: Number(rows[0].id) };
}

describe('POST /api/admin/landing-pages/:id/share (PR-1)', () => {
  it('share với email đã có user → status=active, mail "đã chia sẻ"', async () => {
    const owner = await createUser({ email: 'owner-share-active@test.local' });
    const recipient = await createUser({ email: 'recipient-share-active@test.local' });
    owner.token = await loginUser(owner);
    const lp = await createLandingPage(owner);

    const res = await request(app)
      .post(`/api/admin/landing-pages/${lp.id}/share`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ recipientEmail: recipient.email, shareType: 'view' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isExistingUser).toBe(true);
    expect(res.body.data.recipient.email).toBe(recipient.email);
    expect(res.body.data.share.status).toBe('active');
    expect(res.body.data.share.id_recipient).toBe(recipient.id);

    // Đợi fire-and-forget mail
    await new Promise((r) => setTimeout(r, 200));
    expect(mockSendMail).toHaveBeenCalled();
    const call = mockSendMail.mock.calls[mockSendMail.mock.calls.length - 1][0];
    expect(call.to).toBe(recipient.email);
    expect(call.subject).toContain('đã chia sẻ');
    expect(call.subject).not.toContain('muốn chia sẻ');
    expect(call.html).toContain('Mở landing page');
  });

  it('share với email NGOÀI hệ thống → status=pending, id_recipient=NULL, mail "muốn chia sẻ"', async () => {
    const owner = await createUser({ email: 'owner-share-pending@test.local' });
    owner.token = await loginUser(owner);
    const lp = await createLandingPage(owner);
    const pendingEmail = 'pending-recipient@test.local';

    const res = await request(app)
      .post(`/api/admin/landing-pages/${lp.id}/share`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ recipientEmail: pendingEmail, shareType: 'edit' });

    expect(res.status).toBe(200);
    expect(res.body.data.isExistingUser).toBe(false);
    expect(res.body.data.recipient).toBe(null);
    expect(res.body.data.share.status).toBe('pending');
    expect(res.body.data.share.id_recipient).toBe(null);

    await new Promise((r) => setTimeout(r, 200));
    expect(mockSendMail).toHaveBeenCalled();
    const call = mockSendMail.mock.calls[mockSendMail.mock.calls.length - 1][0];
    expect(call.to).toBe(pendingEmail);
    expect(call.subject).toContain('muốn chia sẻ');
    expect(call.html).toContain('Đăng ký để xem');
  });

  it('share 2 lần cùng email ngoài → de-dup, chỉ 1 row pending', async () => {
    const owner = await createUser({ email: 'owner-share-dedup@test.local' });
    owner.token = await loginUser(owner);
    const lp = await createLandingPage(owner);
    const pendingEmail = 'pending-dedup@test.local';

    const r1 = await request(app)
      .post(`/api/admin/landing-pages/${lp.id}/share`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ recipientEmail: pendingEmail, shareType: 'view' });
    const r2 = await request(app)
      .post(`/api/admin/landing-pages/${lp.id}/share`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ recipientEmail: pendingEmail.toUpperCase(), shareType: 'edit' });

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    const { rows } = await db.query(
      `SELECT id, status, share_type, recipient_email
       FROM landing_page_shares
       WHERE id_landing_page = $1 AND LOWER(recipient_email) = $2`,
      [lp.id, pendingEmail.toLowerCase()]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('pending');
    // Lần 2 nên cập nhật share_type lên 'edit'
    expect(rows[0].share_type).toBe('edit');
  });
});

describe('Auto-claim landing page share khi user đăng ký', () => {
  it('user mới claim tất cả share pending cho email của họ', async () => {
    // Bước 1: tạo owner, share cho email NGOÀI hệ thống → 1 pending share.
    const owner = await createUser({ email: 'owner-claim@test.local' });
    owner.token = await loginUser(owner);
    const lp = await createLandingPage(owner);
    const claimEmail = 'claimer-after@test.local';

    const shareRes = await request(app)
      .post(`/api/admin/landing-pages/${lp.id}/share`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ recipientEmail: claimEmail, shareType: 'view' });
    expect(shareRes.status).toBe(200);
    const shareId = shareRes.body.data.share.id;

    // Bước 2: tạo verification code để đăng ký.
    await db.query(
      `INSERT INTO verification_codes (email, code, type, is_used, expires_at, created_at)
       VALUES ($1, '654321', 'email_verification', FALSE, NOW() + INTERVAL '10 minutes', NOW())`,
      [claimEmail]
    );

    // Bước 3: đăng ký với email đó.
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        username: `claimer${Date.now()}`,
        email: claimEmail,
        password: 'Passw0rd!',
        confirmPassword: 'Passw0rd!',
        fullName: 'Claimer',
        emailVerificationCode: '654321',
        consents: { terms: true, privacy: true, dpa: true },
        phone: `0901234567`,
      });
    expect(regRes.status).toBe(201);
    const newUserId = regRes.body.data.user.id;

    // Bước 4: claim đã chạy → share giờ thuộc về user mới, status='active'.
    const { rows } = await db.query(
      `SELECT id_recipient, status FROM landing_page_shares WHERE id = $1`,
      [shareId]
    );
    expect(rows[0].id_recipient).toBe(newUserId);
    expect(rows[0].status).toBe('active');
    // Bước 5 (bỏ qua GET /shared/with-me trong test này — endpoint yêu cầu active plan,
    // user mới chưa gán gói trong môi trường test; phần "user thấy landing trong tab
    // Được chia sẻ" đã được auto-claim verify qua DB ở bước 4).
  });
});
