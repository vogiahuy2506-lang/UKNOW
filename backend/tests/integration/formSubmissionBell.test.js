/**
 * Integration: chuông "Có bài nộp mới" của Biểu mẫu — PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, PR-8c.
 *
 * HTTP thật + DB thật + dispatcher thật: nộp bài công khai → 1 chuông cho CHỦ (nêu tên biểu mẫu + người nộp đầu, bấm mở trang bài nộp);
 * 3 bài trong 10 phút → vẫn 1 chuông; biểu mẫu khác → chuông riêng; công tắc chuông của super admin tắt được; nhân viên KHÔNG nhận (chỉ chủ);
 * chuông lỗi KHÔNG làm hỏng bài nộp (vẫn 201 + bài nằm trong DB); migration 302 chạy lại không lỗi và không ghi đè cấu hình super admin.
 *
 * Chuông bắn fire-and-forget (Set promise) nên MỌI ca gọi `settlePendingFormSubmissionBells()` trước khi đọc DB — và `afterEach` cũng gọi,
 * kẻo chuông trễ rơi vào ca sau (bài học PR-4b).
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import userNotificationRepository from '../../src/repositories/notification/userNotification.repository.js';
import { clearEventSettingsCache, getEffectiveEventSettings } from '../../src/services/notification/notificationDispatch.service.js';
import {
  FORM_SUBMISSION_BELL_EVENT,
  FORM_SUBMISSION_BELL_WINDOW_MS,
  settlePendingFormSubmissionBells,
} from '../../src/services/formSubmissionBell.service.js';
import { truncateAll, createUser } from './helpers/db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_302 = path.resolve(here, '../../migrations/302_form_submission_notification_event.sql');

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  clearEventSettingsCache();
});

afterEach(async () => {
  await settlePendingFormSubmissionBells();
  jest.restoreAllMocks();
});

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  return res.body.data.accessToken;
}

async function createPublishedForm(token, title = 'Đăng ký tư vấn') {
  const createRes = await request(app)
    .post('/api/forms')
    .set('Authorization', `Bearer ${token}`)
    .send({ title, fields: [{ label: 'Họ tên', type: 'short_text', required: true, role: 'name' }] });
  expect(createRes.status).toBe(201);
  const form = createRes.body.data;
  const publishRes = await request(app).put(`/api/forms/${form.id}/publish`).set('Authorization', `Bearer ${token}`).send({ isPublished: true });
  expect(publishRes.status).toBe(200);
  return { ...form, nameKey: form.fields[0].key };
}

const submit = (form, name) =>
  request(app).post(`/api/public/forms/${form.publicKey}/submissions`).send({ answers: { [form.nameKey]: name } });

const bellsOf = async (userId) =>
  (await db.query(`SELECT * FROM user_notifications WHERE user_id = $1 AND event_type = $2 ORDER BY id`, [userId, FORM_SUBMISSION_BELL_EVENT])).rows;

/**
 * Cửa sổ gộp là 10 phút cố định theo đồng hồ: nếu sắp sang cửa sổ mới thì đợi qua mép, để các bài nộp của một ca không bị tách đôi ngẫu nhiên.
 */
async function waitForSafeBellWindow(marginMs = 20_000) {
  const msToBoundary = FORM_SUBMISSION_BELL_WINDOW_MS - (Date.now() % FORM_SUBMISSION_BELL_WINDOW_MS);
  if (msToBoundary < marginMs) await new Promise((resolve) => setTimeout(resolve, msToBoundary + 250));
}

describe('chuông "Có bài nộp mới"', () => {
  it('nộp bài → đúng 1 chuông cho CHỦ: nêu tên biểu mẫu + người nộp, link mở thẳng trang bài nộp của biểu mẫu', async () => {
    await waitForSafeBellWindow();
    const owner = await createUser({ username: 'bell_owner' });
    const form = await createPublishedForm(await loginAs(owner));

    const res = await submit(form, 'Nguyễn Văn An');
    expect(res.status).toBe(201);
    await settlePendingFormSubmissionBells();

    const bells = await bellsOf(owner.id);
    expect(bells).toHaveLength(1);
    expect(bells[0].title).toContain('Đăng ký tư vấn');
    expect(bells[0].message).toContain('Nguyễn Văn An');
    expect(bells[0].message).toContain('Đăng ký tư vấn');
    expect(bells[0].title_en).toContain('Đăng ký tư vấn');
    expect(bells[0].link).toBe(`/app/forms/${form.id}/submissions`);
    expect(bells[0].severity).toBe('info');
    expect(bells[0].read_at).toBeNull();
    expect(bells[0].metadata).toMatchObject({ formId: String(form.id), formTitle: 'Đăng ký tư vấn' });
    expect(bells[0].dedupe_key).toMatch(new RegExp(`^form_submission:${form.id}:\\d+$`));
  });

  it('3 bài nộp liên tiếp trong 10 phút → vẫn đúng 1 chuông (nêu người nộp ĐẦU TIÊN); cả 3 bài đều nằm trong DB', async () => {
    await waitForSafeBellWindow();
    const owner = await createUser({ username: 'bell_owner_merge' });
    const form = await createPublishedForm(await loginAs(owner));

    for (const name of ['Khách Một', 'Khách Hai', 'Khách Ba']) {
      const res = await submit(form, name);
      expect(res.status).toBe(201);
      await settlePendingFormSubmissionBells();
    }

    const bells = await bellsOf(owner.id);
    expect(bells).toHaveLength(1);
    expect(bells[0].message).toContain('Khách Một');
    expect(bells[0].message).not.toContain('Khách Hai');
    const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM form_submissions WHERE form_id = $1`, [form.id]);
    expect(rows[0].n).toBe(3);
  });

  it('bài nộp đồng thời (song song) cũng chỉ ra 1 chuông', async () => {
    await waitForSafeBellWindow();
    const owner = await createUser({ username: 'bell_owner_parallel' });
    const form = await createPublishedForm(await loginAs(owner));

    const results = await Promise.all(['A', 'B', 'C', 'D'].map((name) => submit(form, `Khách ${name}`)));
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201]);
    await settlePendingFormSubmissionBells();

    expect(await bellsOf(owner.id)).toHaveLength(1);
  });

  it('hai biểu mẫu khác nhau → mỗi biểu mẫu một chuông riêng (không gộp chéo), mỗi chuông trỏ đúng biểu mẫu của nó', async () => {
    await waitForSafeBellWindow();
    const owner = await createUser({ username: 'bell_owner_two' });
    const token = await loginAs(owner);
    const formA = await createPublishedForm(token, 'Biểu mẫu A');
    const formB = await createPublishedForm(token, 'Biểu mẫu B');

    await submit(formA, 'Khách A');
    await submit(formB, 'Khách B');
    await settlePendingFormSubmissionBells();

    const bells = await bellsOf(owner.id);
    expect(bells).toHaveLength(2);
    expect(bells.map((b) => b.link).sort()).toEqual([`/app/forms/${formA.id}/submissions`, `/app/forms/${formB.id}/submissions`].sort());
  });

  it('sang cửa sổ 10 phút kế tiếp thì báo lại: khoá chống trùng đổi theo cửa sổ', async () => {
    await waitForSafeBellWindow();
    const owner = await createUser({ username: 'bell_owner_next' });
    const form = await createPublishedForm(await loginAs(owner));
    await submit(form, 'Khách Một');
    await settlePendingFormSubmissionBells();
    expect(await bellsOf(owner.id)).toHaveLength(1);

    // Mô phỏng cửa sổ trước đã qua: dời khoá của chuông cũ về cửa sổ cũ hơn.
    await db.query(`UPDATE user_notifications SET dedupe_key = $2 WHERE user_id = $1`, [owner.id, `form_submission:${form.id}:1`]);
    await submit(form, 'Khách Hai');
    await settlePendingFormSubmissionBells();

    const bells = await bellsOf(owner.id);
    expect(bells).toHaveLength(2);
    expect(bells[1].message).toContain('Khách Hai');
  });

  it('chỉ CHỦ nhận chuông: nhân viên có quyền forms KHÔNG nhận; chủ workspace khác không nhận', async () => {
    await waitForSafeBellWindow();
    const owner = await createUser({ username: 'bell_owner_only' });
    const employee = await createUser({ username: 'bell_employee' });
    const stranger = await createUser({ username: 'bell_stranger' });
    await db.query(
      `INSERT INTO user_members (owner_id, employee_id, permissions, status) VALUES ($1, $2, $3::jsonb, 'active')`,
      [owner.id, employee.id, JSON.stringify({ forms: true })]
    );
    const form = await createPublishedForm(await loginAs(owner));

    await submit(form, 'Khách lạ');
    await settlePendingFormSubmissionBells();

    expect(await bellsOf(owner.id)).toHaveLength(1);
    expect(await bellsOf(employee.id)).toHaveLength(0);
    expect(await bellsOf(stranger.id)).toHaveLength(0);
  });

  it('super admin tắt chuông của sự kiện → không có dòng chuông, bài nộp vẫn nhận bình thường', async () => {
    await waitForSafeBellWindow();
    const owner = await createUser({ username: 'bell_owner_off' });
    const form = await createPublishedForm(await loginAs(owner));
    // truncateAll() xoá cả bảng cấu hình sự kiện → tạo dòng cấu hình với chuông TẮT (như super admin bấm tắt ở tab "Cấu hình kênh").
    await db.query(
      `INSERT INTO notification_event_settings (event_type, in_app_enabled, email_enabled, user_can_disable_email)
       VALUES ($1, false, false, true)
       ON CONFLICT (event_type) DO UPDATE SET in_app_enabled = false`,
      [FORM_SUBMISSION_BELL_EVENT]
    );
    clearEventSettingsCache();

    const res = await submit(form, 'Khách');
    expect(res.status).toBe(201);
    await settlePendingFormSubmissionBells();

    expect(await bellsOf(owner.id)).toHaveLength(0);
    const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM form_submissions WHERE form_id = $1`, [form.id]);
    expect(rows[0].n).toBe(1);
  });

  it('chuông LỖI (ghi in-app hỏng) không làm hỏng bài nộp: vẫn 201, bài nằm trong DB, không có chuông', async () => {
    await waitForSafeBellWindow();
    const owner = await createUser({ username: 'bell_owner_fail' });
    const form = await createPublishedForm(await loginAs(owner));
    jest.spyOn(userNotificationRepository, 'insertMany').mockRejectedValue(new Error('DB chuông sập'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await submit(form, 'Khách vẫn nộp được');
    expect(res.status).toBe(201);
    expect(res.body.data.accessToken).toBeTruthy();
    await settlePendingFormSubmissionBells();

    expect(userNotificationRepository.insertMany).toHaveBeenCalled();
    const { rows } = await db.query(`SELECT respondent_name FROM form_submissions WHERE form_id = $1`, [form.id]);
    expect(rows.map((r) => r.respondent_name)).toEqual(['Khách vẫn nộp được']);
    expect(await bellsOf(owner.id)).toHaveLength(0);
  });

  it('cấu hình hiệu lực mặc định: chuông BẬT, email TẮT (thư báo riêng của biểu mẫu notifyOwner đã có, không báo hai lần)', async () => {
    // Chưa có dòng cấu hình (truncateAll) → dispatcher dùng mặc định catalog.
    expect(await getEffectiveEventSettings(FORM_SUBMISSION_BELL_EVENT)).toEqual({
      inAppEnabled: true,
      emailEnabled: false,
      userCanDisableEmail: true,
    });
  });
});

describe('migration 302', () => {
  const sql = fs.readFileSync(MIGRATION_302, 'utf8');

  it('chạy lại nhiều lần không lỗi, vẫn đúng một dòng', async () => {
    await db.query(sql);
    await db.query(sql);
    const { rows } = await db.query(`SELECT * FROM notification_event_settings WHERE event_type = $1`, [FORM_SUBMISSION_BELL_EVENT]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ in_app_enabled: true, email_enabled: false, user_can_disable_email: true });
  });

  it('không ghi đè cấu hình super admin đã chỉnh', async () => {
    await db.query(sql); // dòng mặc định (truncateAll đã xoá bảng cấu hình)
    await db.query(`UPDATE notification_event_settings SET email_enabled = true, in_app_enabled = false WHERE event_type = $1`, [FORM_SUBMISSION_BELL_EVENT]);
    await db.query(sql);
    const { rows } = await db.query(`SELECT in_app_enabled, email_enabled FROM notification_event_settings WHERE event_type = $1`, [FORM_SUBMISSION_BELL_EVENT]);
    expect(rows[0]).toEqual({ in_app_enabled: false, email_enabled: true });
  });

  it('chạy được cả khi bảng đang trống (DB mới) — chèn đúng dòng mặc định', async () => {
    expect((await db.query(`SELECT 1 FROM notification_event_settings WHERE event_type = $1`, [FORM_SUBMISSION_BELL_EVENT])).rows).toHaveLength(0);
    await db.query(sql);
    const { rows } = await db.query(`SELECT in_app_enabled, email_enabled, user_can_disable_email FROM notification_event_settings WHERE event_type = $1`, [
      FORM_SUBMISSION_BELL_EVENT,
    ]);
    expect(rows).toEqual([{ in_app_enabled: true, email_enabled: false, user_can_disable_email: true }]);
  });
});
