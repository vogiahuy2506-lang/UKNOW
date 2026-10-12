/**
 * Integration: hiện / ẩn ô theo câu trả lời (`field.showIf`) của Biểu mẫu — PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, PR-8a.
 *
 * Đi qua HTTP thật + DB thật: lưu biểu mẫu có điều kiện (chuẩn hoá, tham chiếu tới sau / không tồn tại → 400, PUT lỗi không đổi bản
 * đã lưu), GET công khai trả `showIf`, nộp bài với ô ẩn / hiện (ô ẩn không bắt buộc + câu trả lời bị bỏ + vai trò email của ô ẩn
 * không thành người nộp; ô hiện vẫn bắt buộc như cũ), ô tải tệp bị ẩn không đòi tệp, node chiến dịch đọc bài nộp.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';
import campaignNodeDataService from '../../src/services/campaign/campaignNodeData.service.js';

let app;
const savedEnv = {};

function setEnv(name, value) {
  if (!(name in savedEnv)) savedEnv[name] = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  setEnv('FORM_FILE_UPLOAD_ENABLED', 'true');
  await truncateAll();
});

afterAll(() => {
  for (const [name, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  return res.body.data.accessToken;
}

const cond = (fieldKey, operator, value) => ({ fieldKey, operator, ...(value !== undefined ? { value } : {}) });
const showIf = (conditions, match = 'all') => ({ match, conditions });

// Khoá viết sẵn: nguồn của điều kiện phải có khoá biết trước (trình soạn tự cấp khoá cho ô mới làm nguồn).
const FIELDS = [
  { key: 'q_name', label: 'Họ và tên', type: 'short_text', required: true, role: 'name' },
  { key: 'q_car', label: 'Bạn có xe không?', type: 'yes_no', required: true },
  { key: 'q_plate', label: 'Biển số xe', type: 'short_text', required: true, showIf: showIf([cond('q_car', 'equals', 'yes')]) },
  { key: 'q_mail', label: 'Email liên hệ', type: 'email', required: true, role: 'email', showIf: showIf([cond('q_car', 'equals', 'no')]) },
  {
    key: 'q_doc',
    label: 'Giấy tờ xe',
    type: 'file',
    required: true,
    fileConfig: { kinds: ['image', 'pdf'], maxBytes: 1048576, maxFiles: 1 },
    showIf: showIf([cond('q_car', 'equals', 'yes')]),
  },
];

async function createForm(token, fields = FIELDS, extra = {}) {
  return request(app)
    .post('/api/forms')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Form điều kiện', fields, ...extra });
}

async function createAndPublish(token, fields = FIELDS) {
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

const submit = (form, answers, extraBody = {}) =>
  request(app).post(`/api/public/forms/${form.publicKey}/submissions`).send({ answers, ...extraBody });

const rows = (formId) => db.query('SELECT answers, respondent_email FROM form_submissions WHERE form_id = $1 ORDER BY id', [formId]);

describe('Biểu mẫu — hiện / ẩn ô theo câu trả lời (PR-8a)', () => {
  it('tạo + GET công khai: `showIf` được chuẩn hoá và lưu đúng, ô không điều kiện không có khoá showIf', async () => {
    const owner = await createUser({ username: 'owner_si_1' });
    const token = await loginAs(owner);
    const form = await createAndPublish(token);

    const byKey = (k) => form.fields.find((f) => f.key === k);
    expect(byKey('q_plate').showIf).toEqual({ match: 'all', conditions: [{ fieldKey: 'q_car', operator: 'equals', value: 'yes' }] });
    expect(byKey('q_name')).not.toHaveProperty('showIf');
    expect(byKey('q_car')).not.toHaveProperty('showIf');

    const pub = await request(app).get(`/api/public/forms/${form.publicKey}`);
    expect(pub.status).toBe(200);
    expect(pub.body.data.fields.find((f) => f.key === 'q_mail').showIf.conditions[0]).toEqual({ fieldKey: 'q_car', operator: 'equals', value: 'no' });
    expect(pub.body.data.fields.find((f) => f.key === 'q_car')).not.toHaveProperty('showIf');
  });

  it('chuẩn hoá lúc lưu: tham chiếu tới trường đứng SAU / không tồn tại / giá trị không có thật → 400 rõ ràng (POST lẫn PUT); PUT lỗi KHÔNG đổi bản đã lưu', async () => {
    const owner = await createUser({ username: 'owner_si_2' });
    const token = await loginAs(owner);
    const created = await createForm(token);
    expect(created.status).toBe(201);
    const id = created.body.data.id;

    const after = await createForm(token, [
      { key: 'q_a', label: 'A', type: 'short_text', showIf: showIf([cond('q_b', 'answered')]) },
      { key: 'q_b', label: 'B', type: 'short_text' },
    ]);
    expect(after.status).toBe(400);
    expect(after.body.message).toMatch(/đứng SAU/);

    const missing = await createForm(token, [
      { key: 'q_a', label: 'A', type: 'short_text' },
      { key: 'q_b', label: 'B', type: 'short_text', showIf: showIf([cond('khong_co', 'answered')]) },
    ]);
    expect(missing.status).toBe(400);
    expect(missing.body.message).toMatch(/không tồn tại/);

    const badValue = await createForm(token, [
      { key: 'q_a', label: 'Dịch vụ', type: 'select', options: ['Spa', 'Gội'] },
      { key: 'q_b', label: 'B', type: 'short_text', showIf: showIf([cond('q_a', 'equals', 'Cắt tóc')]) },
    ]);
    expect(badValue.status).toBe(400);
    expect(badValue.body.message).toMatch(/giá trị của điều kiện thứ 1 không hợp lệ/);

    const put = await request(app)
      .put(`/api/forms/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fields: [{ key: 'q_a', label: 'A', type: 'short_text', showIf: showIf([cond('q_a', 'answered')]) }] });
    expect(put.status).toBe(400);

    const reread = await request(app).get(`/api/forms/${id}`).set('Authorization', `Bearer ${token}`);
    expect(reread.body.data.fields.map((f) => f.key)).toEqual(FIELDS.map((f) => f.key));
    expect(reread.body.data.fields.find((f) => f.key === 'q_plate').showIf.conditions).toHaveLength(1);
  });

  it('sửa biểu mẫu: PUT gửi lại fields đã lưu (kèm showIf) cho cùng kết quả; PUT bỏ showIf thì ô luôn hiện', async () => {
    const owner = await createUser({ username: 'owner_si_3' });
    const token = await loginAs(owner);
    const form = (await createForm(token)).body.data;

    const same = await request(app).put(`/api/forms/${form.id}`).set('Authorization', `Bearer ${token}`).send({ fields: form.fields });
    expect(same.status).toBe(200);
    expect(same.body.data.fields).toEqual(form.fields);

    const stripped = form.fields.map(({ showIf: _showIf, ...rest }) => rest);
    const put = await request(app).put(`/api/forms/${form.id}`).set('Authorization', `Bearer ${token}`).send({ fields: stripped });
    expect(put.status).toBe(200);
    for (const f of put.body.data.fields) expect(f).not.toHaveProperty('showIf');
  });

  describe('nộp bài công khai', () => {
    it('trả lời "Không": ô Biển số xe và Giấy tờ xe (bắt buộc) ẩn → không đòi; Email hiện → bắt buộc; câu trả lời lén của ô ẩn BỊ BỎ', async () => {
      const owner = await createUser({ username: 'owner_si_4' });
      const token = await loginAs(owner);
      const form = await createAndPublish(token);

      // thiếu Email (hiện, bắt buộc) → 400
      const missing = await submit(form, { q_name: 'Lan', q_car: 'no' });
      expect(missing.status).toBe(400);
      expect(missing.body.message).toContain('Email liên hệ');
      expect((await rows(form.id)).rows).toHaveLength(0);

      const ok = await submit(form, { q_name: 'Lan', q_car: 'no', q_mail: 'Lan@Example.com', q_plate: '51A-12345', q_doc: ['không-phải-uuid'] }, { fileSkip: { q_doc: 'token-lén' } });
      expect(ok.status).toBe(201);
      const saved = (await rows(form.id)).rows;
      expect(saved).toHaveLength(1);
      expect(Object.keys(saved[0].answers).sort()).toEqual(['q_car', 'q_mail', 'q_name']);
      expect(saved[0].answers.q_mail.value).toBe('lan@example.com');
      expect(saved[0].respondent_email).toBe('lan@example.com');
    });

    it('trả lời "Có": Biển số xe + Giấy tờ xe hiện và bắt buộc như cũ (thiếu → 400, không lưu bài nộp)', async () => {
      const owner = await createUser({ username: 'owner_si_5' });
      const token = await loginAs(owner);
      const form = await createAndPublish(token);

      const noPlate = await submit(form, { q_name: 'Lan', q_car: 'yes' });
      expect(noPlate.status).toBe(400);
      expect(noPlate.body.message).toContain('Biển số xe');

      const noDoc = await submit(form, { q_name: 'Lan', q_car: 'yes', q_plate: '51A-12345' });
      expect(noDoc.status).toBe(400);
      expect(noDoc.body.message).toContain('Giấy tờ xe');
      expect((await rows(form.id)).rows).toHaveLength(0);
    });

    it('trả lời "Có" (biểu mẫu không có ô tệp): Email ẩn nên giá trị rác của nó không bị kiểm, không vào answers, không thành người nộp', async () => {
      const owner = await createUser({ username: 'owner_si_5b' });
      const token = await loginAs(owner);
      const form = await createAndPublish(token, FIELDS.filter((f) => f.type !== 'file'));

      const res = await submit(form, { q_name: 'Lan', q_car: 'yes', q_plate: '51A-12345', q_mail: 'không-phải-email' });
      expect(res.status).toBe(201);
      const saved = (await rows(form.id)).rows[0];
      expect(Object.keys(saved.answers).sort()).toEqual(['q_car', 'q_name', 'q_plate']);
      expect(saved.respondent_email).toBeNull();
    });

    it('Ô tải tệp ẩn + cờ tệp bật: nộp không tệp vẫn thành công; bài nộp không có khoá tệp', async () => {
      const owner = await createUser({ username: 'owner_si_6' });
      const token = await loginAs(owner);
      const form = await createAndPublish(token);

      const res = await submit(form, { q_name: 'Lan', q_car: 'no', q_mail: 'lan@example.com' });
      expect(res.status).toBe(201);
      const saved = (await rows(form.id)).rows[0];
      expect(saved.answers).not.toHaveProperty('q_doc');
    });

    it('nguồn chưa trả lời + ô not_equals: ô hiện và bắt buộc; ẩn lan theo chuỗi', async () => {
      const owner = await createUser({ username: 'owner_si_7' });
      const token = await loginAs(owner);
      const form = await createAndPublish(token, [
        { key: 'q_opt', label: 'Có xe? (không bắt buộc)', type: 'yes_no' },
        { key: 'q_b', label: 'Ô cho người không phải có xe', type: 'short_text', required: true, showIf: showIf([cond('q_opt', 'not_equals', 'yes')]) },
        { key: 'q_c', label: 'Ô theo ô B', type: 'short_text', required: true, showIf: showIf([cond('q_b', 'answered')]) },
      ]);

      // q_opt chưa trả lời → q_b hiện + bắt buộc
      const noB = await submit(form, {});
      expect(noB.status).toBe(400);
      expect(noB.body.message).toContain('Ô cho người không phải có xe');

      // q_opt = yes → q_b ẩn → q_c ẩn dù client gửi q_b: bài hợp lệ, chỉ giữ q_opt
      const hiddenChain = await submit(form, { q_opt: 'yes', q_b: 'lén', q_c: 'lén' });
      expect(hiddenChain.status).toBe(201);
      expect(Object.keys((await rows(form.id)).rows[0].answers)).toEqual(['q_opt']);

      // q_opt chưa trả lời + q_b có → q_c hiện và bắt buộc
      const needC = await submit(form, { q_b: 'có' });
      expect(needC.status).toBe(400);
      expect(needC.body.message).toContain('Ô theo ô B');
    });

    it('node chiến dịch đọc bài nộp: ô ẩn không có giá trị trong item', async () => {
      const owner = await createUser({ username: 'owner_si_8' });
      const token = await loginAs(owner);
      const form = await createAndPublish(token);

      const res = await submit(form, { q_name: 'Lan', q_car: 'no', q_mail: 'lan@example.com', q_plate: 'lén' }, { marketingConsent: 'true' });
      expect(res.status).toBe(201);

      const node = { id: 'n_si', node_subtype: 'read_form_submissions', config: { formId: form.id } };
      const { items } = await campaignNodeDataService.getCustomersFromDataNode(node, owner.id, []);
      expect(items).toHaveLength(1);
      expect(items[0].email).toBe('lan@example.com');
      expect(items[0].q_car).toBe('no');
      expect(items[0].q_plate ?? null).toBeNull();
    });
  });
});
