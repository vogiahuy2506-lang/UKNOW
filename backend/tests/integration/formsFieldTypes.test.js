/**
 * Integration: loại trường & khối bố cục mới của Biểu mẫu (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, PR-4).
 *
 * Đi qua HTTP thật + DB thật: tạo/sửa biểu mẫu (chuẩn hoá + trần 30 trường nhập / 20 khối bố cục), GET công khai, nộp
 * bài (rating 1..5, yes_no, time, bỏ qua khối hiển thị, trường bắt buộc ở "trang 2" vẫn kiểm phía server), rồi đọc lại
 * qua node chiến dịch `read_form_submissions` + API preview cột.
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';
import campaignNodeDataService from '../../src/services/campaign/campaignNodeData.service.js';

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  return res.body.data.accessToken;
}

const MIXED_FIELDS = [
  { label: 'Thông tin liên hệ', type: 'heading', helpText: 'Chỉ mất một phút' },
  { label: 'Họ và tên', type: 'short_text', required: true, role: 'name', width: 'half' },
  { label: 'Email', type: 'email', required: true, role: 'email', width: 'half' },
  { label: 'Vui lòng điền chính xác để chúng tôi liên hệ.', type: 'paragraph' },
  { label: 'Bước 2', type: 'page_break' },
  { label: 'Mức hài lòng', type: 'rating', required: true },
  { label: 'Đã dùng thử?', type: 'yes_no' },
  { label: 'Giờ tiện gọi', type: 'time' },
];

async function createForm(token, fields = MIXED_FIELDS, extra = {}) {
  return request(app)
    .post('/api/forms')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Form nhiều bước', fields, ...extra });
}

async function createAndPublish(token, fields = MIXED_FIELDS) {
  const createRes = await createForm(token, fields);
  expect(createRes.status).toBe(201);
  const form = createRes.body.data;
  const publishRes = await request(app)
    .put(`/api/forms/${form.id}/publish`)
    .set('Authorization', `Bearer ${token}`)
    .send({ isPublished: true });
  expect(publishRes.status).toBe(200);
  return form;
}

const keyOf = (form, label) => form.fields.find((f) => f.label === label).key;

function answersFor(form, overrides = {}) {
  return {
    [keyOf(form, 'Họ và tên')]: 'Trần Lan',
    [keyOf(form, 'Email')]: 'lan@example.com',
    [keyOf(form, 'Mức hài lòng')]: 4,
    ...overrides,
  };
}

const submit = (form, answers, extraBody = {}) =>
  request(app).post(`/api/public/forms/${form.publicKey}/submissions`).send({ answers, ...extraBody });

describe('Biểu mẫu — loại trường & khối bố cục mới (PR-4)', () => {
  it('tạo biểu mẫu trộn 6 loại mới: chuẩn hoá đúng (khối hiển thị không required/role/options, width chỉ khi half) và GET công khai trả đủ', async () => {
    const owner = await createUser({ username: 'owner_ft_1' });
    const token = await loginAs(owner);
    const form = await createAndPublish(token);

    const byLabel = (label) => form.fields.find((f) => f.label === label);
    expect(byLabel('Thông tin liên hệ')).toMatchObject({ type: 'heading', required: false, role: null, options: [], helpText: 'Chỉ mất một phút' });
    expect(byLabel('Thông tin liên hệ')).not.toHaveProperty('width');
    expect(byLabel('Họ và tên')).toMatchObject({ type: 'short_text', required: true, role: 'name', width: 'half' });
    expect(byLabel('Vui lòng điền chính xác để chúng tôi liên hệ.')).toMatchObject({ type: 'paragraph', required: false });
    expect(byLabel('Bước 2')).toMatchObject({ type: 'page_break', required: false });
    expect(byLabel('Mức hài lòng')).toMatchObject({ type: 'rating', required: true, role: null });
    expect(byLabel('Đã dùng thử?')).toMatchObject({ type: 'yes_no' });
    expect(byLabel('Giờ tiện gọi')).toMatchObject({ type: 'time' });

    const pub = await request(app).get(`/api/public/forms/${form.publicKey}`);
    expect(pub.status).toBe(200);
    expect(pub.body.data.fields.map((f) => f.type)).toEqual([
      'heading', 'short_text', 'email', 'paragraph', 'page_break', 'rating', 'yes_no', 'time',
    ]);
    expect(pub.body.data.fields[1].width).toBe('half');
  });

  it('khối hiển thị gửi kèm required/role/options/width → bị bỏ; vai trò gửi kèm khối không "chiếm chỗ" của trường thật', async () => {
    const owner = await createUser({ username: 'owner_ft_2' });
    const token = await loginAs(owner);
    const res = await createForm(token, [
      { label: 'Tiêu đề', type: 'heading', required: true, role: 'name', options: ['x'], width: 'half' },
      { label: 'Họ tên', type: 'short_text', role: 'name' },
    ]);
    expect(res.status).toBe(201);
    expect(res.body.data.fields[0]).toMatchObject({ type: 'heading', required: false, role: null, options: [] });
    expect(res.body.data.fields[0]).not.toHaveProperty('width');
    expect(res.body.data.fields[1].role).toBe('name');
  });

  it('trần: 30 trường nhập + 20 khối được nhận; trường nhập thứ 31 hoặc khối thứ 21 → 400 với thông báo riêng (cả POST lẫn PUT)', async () => {
    const owner = await createUser({ username: 'owner_ft_3' });
    const token = await loginAs(owner);
    const inputs = Array.from({ length: 30 }, (_, i) => ({ label: `Câu ${i + 1}`, type: 'short_text' }));
    const blocks = Array.from({ length: 20 }, (_, i) => ({ label: `Khối ${i + 1}`, type: i % 2 ? 'page_break' : 'heading' }));

    const ok = await createForm(token, [...inputs, ...blocks]);
    expect(ok.status).toBe(201);
    expect(ok.body.data.fields).toHaveLength(50);

    const tooManyInputs = await createForm(token, [...inputs, { label: 'Thừa', type: 'short_text' }, ...blocks]);
    expect(tooManyInputs.status).toBe(400);
    expect(tooManyInputs.body.message).toContain('30 trường nhập liệu');

    const tooManyBlocks = await createForm(token, [...inputs, ...blocks, { label: 'Thừa', type: 'paragraph' }]);
    expect(tooManyBlocks.status).toBe(400);
    expect(tooManyBlocks.body.message).toContain('20 khối hiển thị');

    const putRes = await request(app)
      .put(`/api/forms/${ok.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fields: [...inputs, ...blocks, { label: 'Thừa', type: 'paragraph' }] });
    expect(putRes.status).toBe(400);
    expect(putRes.body.message).toContain('20 khối hiển thị');
  });

  it('width lạ → 400; nội dung đoạn chữ > 2000 ký tự → 400; page_break không nhãn vẫn được', async () => {
    const owner = await createUser({ username: 'owner_ft_4' });
    const token = await loginAs(owner);

    const badWidth = await createForm(token, [{ label: 'A', type: 'short_text', width: 'third' }]);
    expect(badWidth.status).toBe(400);
    expect(badWidth.body.message).toContain('Độ rộng');

    const longParagraph = await createForm(token, [{ label: 'x'.repeat(2001), type: 'paragraph' }, { label: 'A', type: 'short_text' }]);
    expect(longParagraph.status).toBe(400);

    const emptyBreak = await createForm(token, [{ label: 'A', type: 'short_text' }, { type: 'page_break' }, { label: 'B', type: 'short_text' }]);
    expect(emptyBreak.status).toBe(201);
    expect(emptyBreak.body.data.fields[1]).toMatchObject({ type: 'page_break', label: '' });
  });

  describe('nộp bài công khai', () => {
    it('hợp lệ: lưu rating (số), yes_no, time; KHÔNG có khoá nào của khối hiển thị trong answers kể cả khi client gửi kèm', async () => {
      const owner = await createUser({ username: 'owner_ft_5' });
      const token = await loginAs(owner);
      const form = await createAndPublish(token);

      const heading = form.fields.find((f) => f.type === 'heading');
      const pageBreak = form.fields.find((f) => f.type === 'page_break');
      const res = await submit(
        form,
        answersFor(form, {
          [keyOf(form, 'Đã dùng thử?')]: 'no',
          [keyOf(form, 'Giờ tiện gọi')]: '14:30',
          [heading.key]: 'cố tình',
          [pageBreak.key]: 'cố tình',
        })
      );
      expect(res.status).toBe(201);

      const row = await db.query('SELECT answers FROM form_submissions WHERE form_id = $1', [form.id]);
      const answers = row.rows[0].answers;
      expect(Object.keys(answers).sort()).toEqual(
        [keyOf(form, 'Họ và tên'), keyOf(form, 'Email'), keyOf(form, 'Mức hài lòng'), keyOf(form, 'Đã dùng thử?'), keyOf(form, 'Giờ tiện gọi')].sort()
      );
      expect(answers[keyOf(form, 'Mức hài lòng')]).toEqual({ label: 'Mức hài lòng', type: 'rating', value: 4 });
      expect(answers[keyOf(form, 'Đã dùng thử?')]).toEqual({ label: 'Đã dùng thử?', type: 'yes_no', value: 'no' });
      expect(answers[keyOf(form, 'Giờ tiện gọi')]).toEqual({ label: 'Giờ tiện gọi', type: 'time', value: '14:30' });
    });

    it.each([
      ['rating = 6', 'Mức hài lòng', 6],
      ['rating = 0', 'Mức hài lòng', 0],
      ['rating = "bốn"', 'Mức hài lòng', 'bốn'],
      ['yes_no = "maybe"', 'Đã dùng thử?', 'maybe'],
      ['time = "25:00"', 'Giờ tiện gọi', '25:00'],
      ['time = "9:5"', 'Giờ tiện gọi', '9:5'],
    ])('từ chối %s → 400, không lưu bài nộp', async (_name, label, value) => {
      const owner = await createUser({ username: `owner_ft_6_${label.length}${String(value).length}` });
      const token = await loginAs(owner);
      const form = await createAndPublish(token);

      const res = await submit(form, answersFor(form, { [keyOf(form, label)]: value }));
      expect(res.status).toBe(400);
      const count = await db.query('SELECT COUNT(*)::int AS n FROM form_submissions WHERE form_id = $1', [form.id]);
      expect(count.rows[0].n).toBe(0);
    });

    it('trường bắt buộc nằm SAU ngắt trang (trang 2) thiếu → 400 dù trang 1 đủ — server không tin việc chia trang của client', async () => {
      const owner = await createUser({ username: 'owner_ft_7' });
      const token = await loginAs(owner);
      const form = await createAndPublish(token);

      const answers = answersFor(form);
      delete answers[keyOf(form, 'Mức hài lòng')]; // rating bắt buộc, nằm ở trang 2
      const res = await submit(form, answers);
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Mức hài lòng');
    });
  });

  it('node chiến dịch read_form_submissions + preview cột: item có rating / yes_no / time, KHÔNG có khoá của khối hiển thị; cột preview bỏ khối hiển thị', async () => {
    const owner = await createUser({ username: 'owner_ft_8' });
    const token = await loginAs(owner);
    const form = await createAndPublish(token);
    const heading = form.fields.find((f) => f.type === 'heading');
    const paragraph = form.fields.find((f) => f.type === 'paragraph');
    const pageBreak = form.fields.find((f) => f.type === 'page_break');

    const res = await submit(
      form,
      answersFor(form, { [keyOf(form, 'Đã dùng thử?')]: 'yes', [keyOf(form, 'Giờ tiện gọi')]: '08:15' }),
      { marketingConsent: 'true' }
    );
    expect(res.status).toBe(201);

    const node = { id: 'n_ft', node_subtype: 'read_form_submissions', config: { formId: form.id } };
    const { items } = await campaignNodeDataService.getCustomersFromDataNode(node, owner.id, []);
    expect(items).toHaveLength(1);
    expect(items[0].email).toBe('lan@example.com');
    expect(items[0][keyOf(form, 'Mức hài lòng')]).toBe(4);
    expect(items[0][keyOf(form, 'Đã dùng thử?')]).toBe('yes');
    expect(items[0][keyOf(form, 'Giờ tiện gọi')]).toBe('08:15');
    for (const block of [heading, paragraph, pageBreak]) {
      expect(items[0]).not.toHaveProperty(block.key);
    }

    const preview = await request(app)
      .get(`/api/forms/${form.id}/campaign-preview`)
      .set('Authorization', `Bearer ${token}`);
    expect(preview.status).toBe(200);
    const columnTypes = preview.body.data.columns.map((c) => c.type);
    expect(columnTypes).toEqual(['short_text', 'email', 'rating', 'yes_no', 'time']);
    const columnKeys = preview.body.data.columns.map((c) => c.key);
    for (const block of [heading, paragraph, pageBreak]) {
      expect(columnKeys).not.toContain(block.key);
    }
  });
});
