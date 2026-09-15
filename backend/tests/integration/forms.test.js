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
const { truncateAll, createUser } = await import('./helpers/db.js');
const formRepository = (await import('../../src/repositories/form.repository.js')).default;

let app;

beforeAll(() => {
  process.env.TEST_SEND_EMAIL = '1';
  app = createApp();
});

afterAll(() => {
  delete process.env.TEST_SEND_EMAIL;
});

beforeEach(async () => {
  mockSendMail.mockClear();
  await truncateAll();
});

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  return res.body.data.accessToken;
}

async function addEmployeeMembership(ownerId, employeeId, permissions = {}) {
  await db.query(
    `INSERT INTO user_members (owner_id, employee_id, permissions, status)
     VALUES ($1, $2, $3::jsonb, 'active')`,
    [ownerId, employeeId, JSON.stringify(permissions)]
  );
}

describe('Forms and Submissions Backend Integration (PR-1a)', () => {
  it('Tạo form 3 trường (Họ tên, Email, Dịch vụ) → xuất bản → POST public → lưu 1 bài nộp đầy đủ', async () => {
    const owner = await createUser({ username: 'owner_form_1' });
    const token = await loginAs(owner);

    // 1. Tạo form
    const createRes = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Form Tư Vấn Khóa Học',
        description: 'Đăng ký nhận tư vấn lộ trình học tập',
        fields: [
          { label: 'Họ và tên', type: 'short_text', required: true, role: 'name' },
          { label: 'Email liên hệ', type: 'email', required: false, role: 'email' },
          {
            label: 'Dịch vụ quan tâm',
            type: 'select',
            required: true,
            options: ['Dịch vụ 1', 'Dịch vụ 2', 'Dịch vụ 3'],
          },
        ],
        settings: {
          notifyOwner: true,
          submitButtonText: 'Gửi thông tin ngay',
        },
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    const form = createRes.body.data;
    expect(form.id).toBeDefined();
    expect(form.publicKey).toBeDefined();
    expect(form.isPublished).toBe(false);
    expect(form.fields).toHaveLength(3);

    const nameField = form.fields.find((f) => f.role === 'name');
    const emailField = form.fields.find((f) => f.role === 'email');
    const serviceField = form.fields.find((f) => f.type === 'select');

    // 2. Xuất bản form
    const publishRes = await request(app)
      .put(`/api/forms/${form.id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isPublished: true });

    expect(publishRes.status).toBe(200);
    expect(publishRes.body.data.isPublished).toBe(true);

    // 3. Public GET lấy form
    const publicGetRes = await request(app).get(`/api/public/forms/${form.publicKey}`);
    expect(publicGetRes.status).toBe(200);
    expect(publicGetRes.body.success).toBe(true);
    expect(publicGetRes.body.data.title).toBe('Form Tư Vấn Khóa Học');
    expect(publicGetRes.body.data.settings.submitButtonText).toBe('Gửi thông tin ngay');

    // 4. Public POST nộp bài
    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({
        answers: {
          [nameField.key]: 'Nguyễn Văn A',
          [emailField.key]: 'nguyenvana@example.com',
          [serviceField.key]: 'Dịch vụ 2',
        },
        marketingConsent: 'true',
      });

    expect(submitRes.status).toBe(201);
    expect(submitRes.body.success).toBe(true);
    expect(submitRes.body.data.accessToken).toBeDefined();

    // 5. Chủ form gọi GET /api/forms/:id/submissions
    const submissionsRes = await request(app)
      .get(`/api/forms/${form.id}/submissions`)
      .set('Authorization', `Bearer ${token}`);

    expect(submissionsRes.status).toBe(200);
    expect(submissionsRes.body.data.total).toBe(1);
    expect(submissionsRes.body.data.submissions).toHaveLength(1);

    const submission = submissionsRes.body.data.submissions[0];
    expect(submission.respondentName).toBe('Nguyễn Văn A');
    expect(submission.respondentEmail).toBe('nguyenvana@example.com');
    expect(submission.marketingConsent).toBe(true);
    // Snapshot nhãn và kiểu trong answers
    expect(submission.answers[serviceField.key]).toEqual({
      label: 'Dịch vụ quan tâm',
      type: 'select',
      value: 'Dịch vụ 2',
    });
    expect(submission.status).toBe('submitted');
    // submitter_ip_hash để NULL và không trả ra trong danh sách của chủ
    expect(submission.submitterIpHash).toBeUndefined();

    // Danh sách form của chủ có đếm số bài nộp = 1
    const listRes = await request(app)
      .get('/api/forms')
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    const listedForm = listRes.body.data.find((f) => Number(f.id) === Number(form.id));
    expect(listedForm.submissionCount).toBe(1);

    // Kiểm tra submitter_ip_hash trong database là NULL
    const checkIpDb = await db.query('SELECT submitter_ip_hash FROM form_submissions WHERE form_id = $1', [form.id]);
    expect(checkIpDb.rows[0].submitter_ip_hash).toBeNull();
  });

  it('Thiếu Họ tên (trường bắt buộc) → trả về 400, không thêm dòng vào database', async () => {
    const owner = await createUser({ username: 'owner_form_req' });
    const token = await loginAs(owner);

    const createRes = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Form Test Bắt Buộc',
        fields: [
          { label: 'Họ và tên', type: 'short_text', required: true, role: 'name' },
          { label: 'Email', type: 'email', required: false, role: 'email' },
        ],
      });

    const form = createRes.body.data;
    await request(app)
      .put(`/api/forms/${form.id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isPublished: true });

    const emailField = form.fields.find((f) => f.role === 'email');

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({
        answers: {
          [emailField.key]: 'test@example.com',
        },
      });

    expect(submitRes.status).toBe(400);

    const countRes = await db.query('SELECT COUNT(*)::int AS count FROM form_submissions WHERE form_id = $1', [
      form.id,
    ]);
    expect(countRes.rows[0].count).toBe(0);
  });

  it('Kèm key lạ hack: "x" → 201, answers trong database không có hack', async () => {
    const owner = await createUser({ username: 'owner_form_hack' });
    const token = await loginAs(owner);

    const createRes = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Form Test Lọc Key Lạ',
        fields: [{ label: 'Họ và tên', type: 'short_text', required: true, role: 'name' }],
      });

    const form = createRes.body.data;
    await request(app)
      .put(`/api/forms/${form.id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isPublished: true });

    const nameField = form.fields[0];

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({
        answers: {
          [nameField.key]: 'Hacker B',
          hack: 'x',
          sql_injection: 'DROP TABLE users;',
        },
      });

    expect(submitRes.status).toBe(201);

    const rowRes = await db.query('SELECT answers, submitter_ip_hash FROM form_submissions WHERE form_id = $1', [form.id]);
    expect(rowRes.rows).toHaveLength(1);
    const answers = rowRes.rows[0].answers;
    expect(answers[nameField.key].value).toBe('Hacker B');
    expect(answers[nameField.key].label).toBe('Họ và tên');
    expect(answers.hack).toBeUndefined();
    expect(answers.sql_injection).toBeUndefined();
    expect(rowRes.rows[0].submitter_ip_hash).toBeNull();
  });

  it('Chọn giá trị ngoài danh sách lựa chọn → trả về 400', async () => {
    const owner = await createUser({ username: 'owner_form_opt' });
    const token = await loginAs(owner);

    const createRes = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Form Test Options',
        fields: [
          {
            label: 'Chọn gói dịch vụ',
            type: 'select',
            required: true,
            options: ['Gói 1', 'Gói 2', 'Gói 3'],
          },
        ],
      });

    const form = createRes.body.data;
    await request(app)
      .put(`/api/forms/${form.id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isPublished: true });

    const selectField = form.fields[0];

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({
        answers: {
          [selectField.key]: 'Gói Không Tồn Tại',
        },
      });

    expect(submitRes.status).toBe(400);
  });

  it('Form chưa xuất bản → public GET và POST trả về 404', async () => {
    const owner = await createUser({ username: 'owner_form_unpub' });
    const token = await loginAs(owner);

    const createRes = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Form Bản Nháp',
        fields: [{ label: 'Họ và tên', type: 'short_text', required: true }],
      });

    const form = createRes.body.data;

    const getRes = await request(app).get(`/api/public/forms/${form.publicKey}`);
    expect(getRes.status).toBe(404);

    const postRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({
        answers: { [form.fields[0].key]: 'Nguyễn Văn A' },
      });
    expect(postRes.status).toBe(404);
  });

  it('Public GET với ID số (/1) hoặc public_key sai 1 ký tự → trả về 404', async () => {
    const owner = await createUser({ username: 'owner_form_invalid_pk' });
    const token = await loginAs(owner);

    const createRes = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Form Kiểm Tra Key',
        fields: [{ label: 'Họ tên', type: 'short_text' }],
      });

    const form = createRes.body.data;
    await request(app)
      .put(`/api/forms/${form.id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isPublished: true });

    const resId = await request(app).get('/api/public/forms/1');
    expect(resId.status).toBe(404);

    const alteredKey = form.publicKey.slice(0, -1) + (form.publicKey.slice(-1) === 'a' ? 'b' : 'a');
    const resAltered = await request(app).get(`/api/public/forms/${alteredKey}`);
    expect(resAltered.status).toBe(404);
  });

  it('IDOR: Chủ A truy cập form của chủ B qua /api/forms/:id → trả về 404 (không dùng 403)', async () => {
    const ownerA = await createUser({ username: 'owner_a_idor' });
    const ownerB = await createUser({ username: 'owner_b_idor' });
    const tokenA = await loginAs(ownerA);
    const tokenB = await loginAs(ownerB);

    // Chủ B tạo form
    const createRes = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        title: 'Form Của Chủ B',
        fields: [{ label: 'Tên', type: 'short_text' }],
      });

    const formB = createRes.body.data;

    // Chủ A cố đọc form của chủ B
    const getRes = await request(app)
      .get(`/api/forms/${formB.id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(getRes.status).toBe(404);

    // Chủ A cố sửa form của chủ B
    const putRes = await request(app)
      .put(`/api/forms/${formB.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Hack Title' });
    expect(putRes.status).toBe(404);

    // Chủ A cố xem submissions của form B
    const subRes = await request(app)
      .get(`/api/forms/${formB.id}/submissions`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(subRes.status).toBe(404);

    // Chủ A cố xóa form của chủ B
    const delRes = await request(app)
      .delete(`/api/forms/${formB.id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(delRes.status).toBe(404);
  });

  it('Nhân viên không có quyền forms → 403; có quyền forms → thao tác bình thường', async () => {
    const owner = await createUser({ username: 'owner_emp_test' });
    const employee = await createUser({ username: 'emp_no_forms' });

    // Gán nhân viên không có quyền forms
    await addEmployeeMembership(owner.id, employee.id, { leads: true });

    const empToken = await loginAs(employee);

    const listRes = await request(app)
      .get('/api/forms')
      .set('Authorization', `Bearer ${empToken}`)
      .set('X-Owner-Context', String(owner.id));
    expect(listRes.status).toBe(403);

    const createRes = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${empToken}`)
      .set('X-Owner-Context', String(owner.id))
      .send({ title: 'Emp Form' });
    expect(createRes.status).toBe(403);

    // Bổ sung quyền forms cho nhân viên
    await db.query(
      `UPDATE user_members SET permissions = $1::jsonb WHERE owner_id = $2 AND employee_id = $3`,
      [JSON.stringify({ forms: true }), owner.id, employee.id]
    );

    const listAllowedRes = await request(app)
      .get('/api/forms')
      .set('Authorization', `Bearer ${empToken}`)
      .set('X-Owner-Context', String(owner.id));
    expect(listAllowedRes.status).toBe(200);
  });

  it('Trường bẫy bot (_hp_website) có giá trị → trả về 201 giả, không thêm dòng mới vào database', async () => {
    const owner = await createUser({ username: 'owner_bot_trap' });
    const token = await loginAs(owner);

    const createRes = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Form Chống Bot',
        fields: [{ label: 'Họ và tên', type: 'short_text', required: true, role: 'name' }],
      });

    const form = createRes.body.data;
    await request(app)
      .put(`/api/forms/${form.id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isPublished: true });

    const nameField = form.fields[0];

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({
        answers: {
          [nameField.key]: 'Spam Bot',
        },
        _hp_website: 'https://spam-bot.xyz',
      });

    expect(submitRes.status).toBe(201);
    expect(submitRes.body.success).toBe(true);

    const countRes = await db.query('SELECT COUNT(*)::int AS count FROM form_submissions WHERE form_id = $1', [
      form.id,
    ]);
    expect(countRes.rows[0].count).toBe(0);
  });

  it('PUT gửi kèm payment_config → lưu xong, cột payment_config trong DB vẫn NULL', async () => {
    const owner = await createUser({ username: 'owner_put_whitelist' });
    const token = await loginAs(owner);

    const createRes = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Form Tiêu Đề Gốc',
        fields: [{ label: 'Họ và tên', type: 'short_text', required: true }],
      });

    const form = createRes.body.data;

    // Cố ý gửi payment_config lên qua PUT
    const putRes = await request(app)
      .put(`/api/forms/${form.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Form Đã Đổi Tiêu Đề',
        payment_config: {
          bank_name: 'MBBank',
          account_number: '999999999',
        },
      });

    expect(putRes.status).toBe(200);
    expect(putRes.body.data.title).toBe('Form Đã Đổi Tiêu Đề');

    // Kiểm tra trực tiếp trong DB: payment_config phải vẫn là NULL
    const checkDb = await db.query('SELECT payment_config FROM forms WHERE id = $1', [form.id]);
    expect(checkDb.rows[0].payment_config).toBeNull();
  });

  it('Chủ đã quá subscription_expires_at + grace_period_days nhưng active_plan_id vẫn còn → public GET/POST trả về 503', async () => {
    const owner = await createUser({ username: 'owner_plan_expired' });
    const token = await loginAs(owner);

    const createRes = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Form Chủ Hết Hạn Gói',
        fields: [{ label: 'Họ tên', type: 'short_text', required: true }],
      });

    const form = createRes.body.data;
    await request(app)
      .put(`/api/forms/${form.id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isPublished: true });

    // Cập nhật subscription_expires_at về quá khứ (+ grace_period_days = 2 trên plans, hết hạn 5 ngày trước)
    await db.query(
      `UPDATE users
       SET subscription_expires_at = NOW() - INTERVAL '5 days'
       WHERE id = $1`,
      [owner.id]
    );
    await db.query(
      `UPDATE plans
       SET grace_period_days = 2
       WHERE id = (SELECT active_plan_id FROM users WHERE id = $1)`,
      [owner.id]
    );

    // Xác nhận active_plan_id vẫn còn
    const ownerCheck = await db.query('SELECT active_plan_id FROM users WHERE id = $1', [owner.id]);
    expect(ownerCheck.rows[0].active_plan_id).not.toBeNull();

    // Public GET phải trả 503
    const getRes = await request(app).get(`/api/public/forms/${form.publicKey}`);
    expect(getRes.status).toBe(503);

    // Public POST phải trả 503
    const postRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({
        answers: { [form.fields[0].key]: 'Test' },
      });
    expect(postRes.status).toBe(503);
  });

  it('Chủ không có gói (active_plan_id IS NULL) → public GET/POST trả về 503', async () => {
    const owner = await createUser({ username: 'owner_no_plan' });
    const token = await loginAs(owner);

    const createRes = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Form Không Gói',
        fields: [{ label: 'Họ tên', type: 'short_text', required: true }],
      });

    const form = createRes.body.data;
    await request(app)
      .put(`/api/forms/${form.id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isPublished: true });

    // Set active_plan_id = NULL
    await db.query(`UPDATE users SET active_plan_id = NULL WHERE id = $1`, [owner.id]);

    const getRes = await request(app).get(`/api/public/forms/${form.publicKey}`);
    expect(getRes.status).toBe(503);

    const postRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({
        answers: { [form.fields[0].key]: 'Test' },
      });
    expect(postRes.status).toBe(503);
  });

  it('Chủ quá hạn 1 ngày, gói có grace_period_days = 3 → public GET trả về 200 (trong thời gian ân hạn)', async () => {
    const owner = await createUser({ username: 'owner_grace_active' });
    const token = await loginAs(owner);

    const createRes = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Form Trong Thời Gian Ân Hạn',
        fields: [{ label: 'Họ tên', type: 'short_text', required: true }],
      });

    const form = createRes.body.data;
    await request(app)
      .put(`/api/forms/${form.id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isPublished: true });

    // Quá hạn 1 ngày
    await db.query(
      `UPDATE users
       SET subscription_expires_at = NOW() - INTERVAL '1 day'
       WHERE id = $1`,
      [owner.id]
    );
    // Gói có grace_period_days = 3
    await db.query(
      `UPDATE plans
       SET grace_period_days = 3
       WHERE id = (SELECT active_plan_id FROM users WHERE id = $1)`,
      [owner.id]
    );

    // Public GET phải trả 200 vì vẫn còn trong ân hạn 3 ngày
    const getRes = await request(app).get(`/api/public/forms/${form.publicKey}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.title).toBe('Form Trong Thời Gian Ân Hạn');
  });

  it('Response của public GET không chứa id, email, SĐT của chủ form', async () => {
    const owner = await createUser({
      username: 'owner_leak_check',
      email: 'secret_owner_email@example.com',
      phone: '0988776655',
    });
    const token = await loginAs(owner);

    const createRes = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Form Kiểm Tra Rò Rỉ Thông Tin Chủ',
        description: 'Mô tả an toàn',
        fields: [{ label: 'Ý kiến', type: 'long_text' }],
      });

    const form = createRes.body.data;
    await request(app)
      .put(`/api/forms/${form.id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isPublished: true });

    const publicRes = await request(app).get(`/api/public/forms/${form.publicKey}`);
    expect(publicRes.status).toBe(200);

    const responseBodyStr = JSON.stringify(publicRes.body);

    // Không chứa email hay SĐT của chủ
    expect(responseBodyStr).not.toContain('secret_owner_email@example.com');
    expect(responseBodyStr).not.toContain('0988776655');

    // Không chứa các khoá id của chủ
    expect(publicRes.body.data.workspaceOwnerId).toBeUndefined();
    expect(publicRes.body.data.createdByUserId).toBeUndefined();
    expect(publicRes.body.data.id).toBeUndefined();
    expect(publicRes.body.data.ownerEmail).toBeUndefined();
  });

  it('Chèn HTML vào họ tên người điền → HTML thư báo chủ được escape, không chứa thẻ thô', async () => {
    const owner = await createUser({ username: 'owner_html_escape', email: 'owner_esc@example.com' });
    const token = await loginAs(owner);

    const createRes = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Form Test XSS <img src=x onerror=alert(1)>',
        fields: [
          { label: 'Họ tên', type: 'short_text', required: true, role: 'name' },
          { label: 'Email', type: 'email', required: false, role: 'email' },
          { label: 'Số điện thoại', type: 'phone', required: false, role: 'phone' },
        ],
        settings: {
          notifyOwner: true,
        },
      });

    const form = createRes.body.data;
    await request(app)
      .put(`/api/forms/${form.id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isPublished: true });

    mockSendMail.mockClear();

    const nameField = form.fields.find((f) => f.role === 'name');
    const emailField = form.fields.find((f) => f.role === 'email');
    const phoneField = form.fields.find((f) => f.role === 'phone');

    const evilPayload = '<a href="https://evil.example">x</a>';
    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({
        answers: {
          [nameField.key]: evilPayload,
          [emailField.key]: 'evil@example.com',
          [phoneField.key]: '0901234567',
        },
      });

    expect(submitRes.status).toBe(201);

    // Đợi fire-and-forget gửi email
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const mailArgs = mockSendMail.mock.calls[0][0];
    expect(mailArgs.to).toBe('owner_esc@example.com');
    expect(mailArgs.subject).toContain('Founder AI');
    expect(mailArgs.subject).not.toContain('[UKNOW]');
    expect(mailArgs.html).toContain('&lt;a href=');
    expect(mailArgs.html).not.toContain('<a href="https://evil');
    expect(mailArgs.html).toContain('&lt;img src=x');
    expect(mailArgs.html).not.toContain('<img src=x');
  });

  it('Whitelist settings: redirectUrl hợp lệ / không hợp lệ, consentEnabled, lọc key lạ', async () => {
    const owner = await createUser({ username: 'owner_settings_check' });
    const token = await loginAs(owner);

    // 1. redirectUrl là javascript: -> 400
    const resJs = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Form Bad Redirect JS',
        settings: {
          redirectUrl: 'javascript:alert(1)',
        },
      });
    expect(resJs.status).toBe(400);

    // 2. redirectUrl là data: -> 400
    const resData = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Form Bad Redirect Data',
        settings: {
          redirectUrl: 'data:text/html,<script>alert(1)</script>',
        },
      });
    expect(resData.status).toBe(400);

    // 3. settings hợp lệ với redirectUrl https, consentEnabled, kèm key lạ hack: 1
    const resValid = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Form Good Settings',
        settings: {
          redirectUrl: 'https://example.com/cam-on',
          consentEnabled: true,
          hack: 1,
        },
      });
    expect(resValid.status).toBe(201);
    const form = resValid.body.data;

    // Key lạ 'hack' bị loại bỏ
    expect(form.settings.hack).toBeUndefined();
    expect(form.settings.redirectUrl).toBe('https://example.com/cam-on');
    expect(form.settings.consentEnabled).toBe(true);

    // Xuất bản form
    await request(app)
      .put(`/api/forms/${form.id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isPublished: true });

    // Public GET trả về redirectUrl và consentEnabled
    const publicRes = await request(app).get(`/api/public/forms/${form.publicKey}`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.data.settings.redirectUrl).toBe('https://example.com/cam-on');
    expect(publicRes.body.data.settings.consentEnabled).toBe(true);
    expect(publicRes.body.data.settings.hack).toBeUndefined();
  });

  it('Snapshot nhãn: Nộp bài → đổi nhãn và xoá trường → bài cũ vẫn giữ nguyên nhãn và giá trị cũ', async () => {
    const owner = await createUser({ username: 'owner_snapshot_labels' });
    const token = await loginAs(owner);

    // 1. Tạo form có Họ tên và Dịch vụ
    const createRes = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Form Đổi Nhãn',
        fields: [
          { label: 'Họ tên', type: 'short_text', required: true, role: 'name' },
          {
            label: 'Dịch vụ',
            type: 'select',
            required: true,
            options: ['Dịch vụ A', 'Dịch vụ B'],
          },
        ],
      });

    const form = createRes.body.data;
    await request(app)
      .put(`/api/forms/${form.id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isPublished: true });

    const nameField = form.fields.find((f) => f.label === 'Họ tên');
    const serviceField = form.fields.find((f) => f.label === 'Dịch vụ');

    // 2. Nộp bài
    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({
        answers: {
          [nameField.key]: 'Khách Hàng Ban Đầu',
          [serviceField.key]: 'Dịch vụ A',
        },
      });
    expect(submitRes.status).toBe(201);

    // 3. Chủ cập nhật form: đổi nhãn 'Họ tên' -> 'Tên khách' và xoá trường 'Dịch vụ'
    const updateRes = await request(app)
      .put(`/api/forms/${form.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        fields: [
          { key: nameField.key, label: 'Tên khách', type: 'short_text', required: true, role: 'name' },
        ],
      });
    expect(updateRes.status).toBe(200);

    // 4. Chủ lấy danh sách submissions: bài nộp cũ vẫn giữ nhãn 'Họ tên', 'Dịch vụ'
    const subRes = await request(app)
      .get(`/api/forms/${form.id}/submissions`)
      .set('Authorization', `Bearer ${token}`);

    expect(subRes.status).toBe(200);
    const sub = subRes.body.data.submissions[0];
    expect(sub.answers[nameField.key]).toEqual({
      label: 'Họ tên',
      type: 'short_text',
      value: 'Khách Hàng Ban Đầu',
    });
    expect(sub.answers[serviceField.key]).toEqual({
      label: 'Dịch vụ',
      type: 'select',
      value: 'Dịch vụ A',
    });
  });

  it('Title vượt quá 200 ký tự (201 ký tự) → 400 ở cả create và update', async () => {
    const owner = await createUser({ username: 'owner_title_len' });
    const token = await loginAs(owner);

    const longTitle = 'A'.repeat(201);

    // Create 201 ký tự -> 400
    const createRes = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: longTitle,
      });
    expect(createRes.status).toBe(400);

    // Create hợp lệ với 200 ký tự -> 201
    const validCreateRes = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'A'.repeat(200),
      });
    expect(validCreateRes.status).toBe(201);
    const formId = validCreateRes.body.data.id;

    // Update 201 ký tự -> 400
    const updateRes = await request(app)
      .put(`/api/forms/${formId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: longTitle,
      });
    expect(updateRes.status).toBe(400);
  });

  it('answers: null khi form có trường bắt buộc → trả về 400, không 500', async () => {
    const owner = await createUser({ username: 'owner_null_answers' });
    const token = await loginAs(owner);

    const createRes = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Form Bắt Buộc',
        fields: [{ label: 'Họ tên', type: 'short_text', required: true }],
      });

    const form = createRes.body.data;
    await request(app)
      .put(`/api/forms/${form.id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isPublished: true });

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({
        answers: null,
      });

    expect(submitRes.status).toBe(400);
  });

  it('Nộp ngày phi logic 2026-02-31 → trả về 400', async () => {
    const owner = await createUser({ username: 'owner_date_check' });
    const token = await loginAs(owner);

    const createRes = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Form Kiểm Tra Ngày',
        fields: [{ label: 'Ngày hẹn', type: 'date', required: true }],
      });

    const form = createRes.body.data;
    await request(app)
      .put(`/api/forms/${form.id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isPublished: true });

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({
        answers: {
          [form.fields[0].key]: '2026-02-31',
        },
      });

    expect(submitRes.status).toBe(400);
  });

  it('Độ dài short_text 501 ký tự / long_text 5001 ký tự → 400', async () => {
    const owner = await createUser({ username: 'owner_len_check' });
    const token = await loginAs(owner);

    const createRes = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Form Kiểm Tra Độ Dài Text',
        fields: [
          { label: 'Ghi chú ngắn', type: 'short_text', required: true },
          { label: 'Ghi chú dài', type: 'long_text', required: false },
        ],
      });

    const form = createRes.body.data;
    await request(app)
      .put(`/api/forms/${form.id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isPublished: true });

    // short_text 501 chars -> 400
    const resShort = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({
        answers: {
          [form.fields[0].key]: 's'.repeat(501),
        },
      });
    expect(resShort.status).toBe(400);

    // long_text 5001 chars -> 400
    const resLong = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({
        answers: {
          [form.fields[0].key]: 's'.repeat(10),
          [form.fields[1].key]: 'l'.repeat(5001),
        },
      });
    expect(resLong.status).toBe(400);
  });

  it('Xoá form → form và các bài nộp liên quan bị xoá cứng khỏi database (cascade)', async () => {
    const owner = await createUser({ username: 'owner_del_form' });
    const token = await loginAs(owner);

    const createRes = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Form Xoá',
        fields: [{ label: 'Họ tên', type: 'short_text', required: true, role: 'name' }],
      });

    const form = createRes.body.data;
    await request(app)
      .put(`/api/forms/${form.id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isPublished: true });

    // Nộp 1 bài
    await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({
        answers: { [form.fields[0].key]: 'Người Nộp Xoá' },
      });

    const subCountBefore = await db.query('SELECT COUNT(*)::int AS count FROM form_submissions WHERE form_id = $1', [
      form.id,
    ]);
    expect(subCountBefore.rows[0].count).toBe(1);

    // Xoá form
    const deleteRes = await request(app)
      .delete(`/api/forms/${form.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(deleteRes.status).toBe(200);

    // Kiểm tra DB
    const formCheck = await db.query('SELECT 1 FROM forms WHERE id = $1', [form.id]);
    expect(formCheck.rows).toHaveLength(0);

    const subCheck = await db.query('SELECT 1 FROM form_submissions WHERE form_id = $1', [form.id]);
    expect(subCheck.rows).toHaveLength(0);
  });
});

/**
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-7a — nguồn landing + UTM cho bài nộp Biểu mẫu.
 */
describe('Forms — nguồn landing + UTM (PR-7a)', () => {
  async function createAndPublishForm(token) {
    const createRes = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Form PR-7a',
        fields: [{ label: 'Email', type: 'email', required: false, role: 'email' }],
      });
    const form = createRes.body.data;
    await request(app)
      .put(`/api/forms/${form.id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isPublished: true });
    return form;
  }

  it('nộp kèm slug landing đã xuất bản của CHÍNH chủ form + utmSource có khoảng trắng thừa -> 201, landing_page_slug đúng, utm_source đã trim', async () => {
    const owner = await createUser({ username: 'owner_pr7a_1' });
    const token = await loginAs(owner);
    const form = await createAndPublishForm(token);

    await db.query(
      `INSERT INTO landing_pages (id_user, slug, title, is_published) VALUES ($1, 'khoa-hoc-ai', 'Khoá học AI', TRUE)`,
      [owner.id]
    );

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({
        answers: {},
        landingPageSlug: 'khoa-hoc-ai',
        utmSource: ' zalo ',
      });

    expect(submitRes.status).toBe(201);

    const dbRow = await db.query(
      'SELECT landing_page_slug, utm_source FROM form_submissions WHERE form_id = $1',
      [form.id]
    );
    expect(dbRow.rows[0].landing_page_slug).toBe('khoa-hoc-ai');
    expect(dbRow.rows[0].utm_source).toBe('zalo');
  });

  it('slug landing thuộc về CHỦ KHÁC -> 201, landing_page_slug NULL (không lộ/gán nhầm nguồn)', async () => {
    const owner = await createUser({ username: 'owner_pr7a_2' });
    const otherOwner = await createUser({ username: 'owner_pr7a_2_other' });
    const token = await loginAs(owner);
    const form = await createAndPublishForm(token);

    await db.query(
      `INSERT INTO landing_pages (id_user, slug, title, is_published) VALUES ($1, 'landing-cua-nguoi-khac', 'Của người khác', TRUE)`,
      [otherOwner.id]
    );

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: {}, landingPageSlug: 'landing-cua-nguoi-khac' });

    expect(submitRes.status).toBe(201);

    const dbRow = await db.query('SELECT landing_page_slug FROM form_submissions WHERE form_id = $1', [form.id]);
    expect(dbRow.rows[0].landing_page_slug).toBeNull();
  });

  it('slug không tồn tại -> 201, landing_page_slug NULL', async () => {
    const owner = await createUser({ username: 'owner_pr7a_3' });
    const token = await loginAs(owner);
    const form = await createAndPublishForm(token);

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: {}, landingPageSlug: 'slug-khong-ton-tai' });

    expect(submitRes.status).toBe(201);
    const dbRow = await db.query('SELECT landing_page_slug FROM form_submissions WHERE form_id = $1', [form.id]);
    expect(dbRow.rows[0].landing_page_slug).toBeNull();
  });

  it('slug landing CHƯA XUẤT BẢN (is_published=FALSE) của chính chủ -> 201, landing_page_slug NULL', async () => {
    const owner = await createUser({ username: 'owner_pr7a_4' });
    const token = await loginAs(owner);
    const form = await createAndPublishForm(token);

    await db.query(
      `INSERT INTO landing_pages (id_user, slug, title, is_published) VALUES ($1, 'landing-chua-xuat-ban', 'Chưa xuất bản', FALSE)`,
      [owner.id]
    );

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: {}, landingPageSlug: 'landing-chua-xuat-ban' });

    expect(submitRes.status).toBe(201);
    const dbRow = await db.query('SELECT landing_page_slug FROM form_submissions WHERE form_id = $1', [form.id]);
    expect(dbRow.rows[0].landing_page_slug).toBeNull();
  });

  it('utmCampaign dài 400 ký tự -> lưu đúng 255 ký tự (cắt bớt, không lỗi VARCHAR(255))', async () => {
    const owner = await createUser({ username: 'owner_pr7a_5' });
    const token = await loginAs(owner);
    const form = await createAndPublishForm(token);
    const longCampaign = 'x'.repeat(400);

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: {}, utmCampaign: longCampaign });

    expect(submitRes.status).toBe(201);
    const dbRow = await db.query('SELECT utm_campaign FROM form_submissions WHERE form_id = $1', [form.id]);
    expect(dbRow.rows[0].utm_campaign).toHaveLength(255);
    expect(dbRow.rows[0].utm_campaign).toBe('x'.repeat(255));
  });

  it('mọi bài nộp đều có unsubscribe_token khác nhau, không NULL (cột mới thêm, DEFAULT gen_random_uuid() áp cho từng dòng)', async () => {
    const owner = await createUser({ username: 'owner_pr7a_6' });
    const token = await loginAs(owner);
    const form = await createAndPublishForm(token);

    await request(app).post(`/api/public/forms/${form.publicKey}/submissions`).send({ answers: {} });
    await request(app).post(`/api/public/forms/${form.publicKey}/submissions`).send({ answers: {} });

    const dbRows = await db.query(
      'SELECT unsubscribe_token FROM form_submissions WHERE form_id = $1 ORDER BY id',
      [form.id]
    );
    expect(dbRows.rows).toHaveLength(2);
    expect(dbRows.rows[0].unsubscribe_token).toBeTruthy();
    expect(dbRows.rows[1].unsubscribe_token).toBeTruthy();
    expect(dbRows.rows[0].unsubscribe_token).not.toBe(dbRows.rows[1].unsubscribe_token);
  });

  it('danh sách bài nộp của chủ (GET /api/forms/:id/submissions) có landingPageSlug + utmSource, KHÔNG có unsubscribeToken', async () => {
    const owner = await createUser({ username: 'owner_pr7a_7' });
    const token = await loginAs(owner);
    const form = await createAndPublishForm(token);

    await db.query(
      `INSERT INTO landing_pages (id_user, slug, title, is_published) VALUES ($1, 'landing-list-test', 'Landing', TRUE)`,
      [owner.id]
    );
    await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: {}, landingPageSlug: 'landing-list-test', utmSource: 'fb' });

    const listRes = await request(app)
      .get(`/api/forms/${form.id}/submissions`)
      .set('Authorization', `Bearer ${token}`);

    expect(listRes.status).toBe(200);
    const submission = listRes.body.data.submissions[0];
    expect(submission.landingPageSlug).toBe('landing-list-test');
    expect(submission.utmSource).toBe('fb');
    expect(submission).not.toHaveProperty('unsubscribeToken');
  });
});

/**
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-7b — người nộp Biểu mẫu tự rút lại đồng ý nhận
 * tiếp thị qua `GET /api/public/forms/unsubscribe/:token`.
 */
describe('Forms — rút lại đồng ý nhận tiếp thị (PR-7b)', () => {
  async function createSimplePublishedForm(token, overrides = {}) {
    const createRes = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Form PR-7b',
        fields: [{ label: 'Email', type: 'email', required: false, role: 'email' }],
        ...overrides,
      });
    expect(createRes.status).toBe(201);
    const form = createRes.body.data;
    const publishRes = await request(app)
      .put(`/api/forms/${form.id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isPublished: true });
    expect(publishRes.status).toBe(200);
    return publishRes.body.data;
  }

  it('token sai định dạng (không phải UUID) → 404 HTML', async () => {
    const res = await request(app).get('/api/public/forms/unsubscribe/khong-phai-uuid');
    expect(res.status).toBe(404);
    expect(res.type).toContain('html');
    expect(res.text).toContain('Liên kết không hợp lệ');
  });

  it('token đúng định dạng UUID nhưng không tồn tại → 404 HTML', async () => {
    const res = await request(app).get('/api/public/forms/unsubscribe/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
    expect(res.type).toContain('html');
    expect(res.text).toContain('Liên kết không tồn tại');
  });

  it('bấm link đúng → 200 HTML; dòng marketing_consent=false, consent_withdrawn_at có giá trị', async () => {
    const owner = await createUser({ username: 'owner_unsub_1' });
    const token = await loginAs(owner);
    const form = await createSimplePublishedForm(token);
    const emailField = form.fields[0];

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: { [emailField.key]: 'a@b.com' }, marketingConsent: true });
    expect(submitRes.status).toBe(201);

    const before = await db.query(
      `SELECT unsubscribe_token, marketing_consent, consent_withdrawn_at FROM form_submissions WHERE access_token = $1`,
      [submitRes.body.data.accessToken]
    );
    expect(before.rows[0].marketing_consent).toBe(true);
    expect(before.rows[0].consent_withdrawn_at).toBeNull();
    const unsubscribeToken = before.rows[0].unsubscribe_token;

    const unsubRes = await request(app).get(`/api/public/forms/unsubscribe/${unsubscribeToken}`);
    expect(unsubRes.status).toBe(200);
    expect(unsubRes.type).toContain('html');
    expect(unsubRes.text).toContain('Rút lại đồng ý thành công');

    const after = await db.query(
      `SELECT marketing_consent, consent_withdrawn_at FROM form_submissions WHERE unsubscribe_token = $1`,
      [unsubscribeToken]
    );
    expect(after.rows[0].marketing_consent).toBe(false);
    expect(after.rows[0].consent_withdrawn_at).not.toBeNull();
  });

  it('bấm link LẦN 2 → 200 "đã ghi nhận trước đó", consent_withdrawn_at KHÔNG đổi', async () => {
    const owner = await createUser({ username: 'owner_unsub_2' });
    const token = await loginAs(owner);
    const form = await createSimplePublishedForm(token);
    const emailField = form.fields[0];

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: { [emailField.key]: 'a@b.com' }, marketingConsent: true });
    const before = await db.query(
      `SELECT unsubscribe_token FROM form_submissions WHERE access_token = $1`,
      [submitRes.body.data.accessToken]
    );
    const unsubscribeToken = before.rows[0].unsubscribe_token;

    const firstRes = await request(app).get(`/api/public/forms/unsubscribe/${unsubscribeToken}`);
    expect(firstRes.status).toBe(200);
    const firstWithdrawnAt = (
      await db.query(`SELECT consent_withdrawn_at FROM form_submissions WHERE unsubscribe_token = $1`, [unsubscribeToken])
    ).rows[0].consent_withdrawn_at;

    // Chờ 1 giây để nếu code lỡ ghi đè bằng NOW() mới thì mốc thời gian chắc chắn khác đi (không
    // phải trùng ngẫu nhiên trong cùng mili-giây).
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const secondRes = await request(app).get(`/api/public/forms/unsubscribe/${unsubscribeToken}`);
    expect(secondRes.status).toBe(200);
    expect(secondRes.text).toContain('đã được ghi nhận trước đó');

    const secondWithdrawnAt = (
      await db.query(`SELECT consent_withdrawn_at FROM form_submissions WHERE unsubscribe_token = $1`, [unsubscribeToken])
    ).rows[0].consent_withdrawn_at;
    expect(new Date(secondWithdrawnAt).getTime()).toBe(new Date(firstWithdrawnAt).getTime());
  });

  /**
   * Test HTTP tuần tự ở trên đi qua service `withdrawSubmissionConsent`, có chốt "đã rút thì trả
   * về sớm, không UPDATE lại" ở TẦNG SERVICE — mốc thời gian không đổi ở ca đó có thể chỉ vì
   * UPDATE thứ hai KHÔNG BAO GIỜ chạy, không thật sự chứng minh COALESCE trong SQL. Gọi thẳng
   * `formRepository.withdrawSubmissionConsentById` HAI LẦN (bỏ qua chốt tầng service) mới phơi
   * đúng lớp phòng thủ COALESCE — kịch bản thật của nó là HAI request đua nhau cùng đọc thấy
   * "chưa rút" trước khi request nào kịp UPDATE (race), không phải double-click tuần tự.
   */
  it('gọi thẳng formRepository.withdrawSubmissionConsentById HAI LẦN (mô phỏng race, bỏ qua chốt service) → consent_withdrawn_at giữ mốc LẦN ĐẦU', async () => {
    const owner = await createUser({ username: 'owner_unsub_2b' });
    const token = await loginAs(owner);
    const form = await createSimplePublishedForm(token);
    const emailField = form.fields[0];

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: { [emailField.key]: 'race@b.com' }, marketingConsent: true });
    const before = await db.query(
      `SELECT id FROM form_submissions WHERE access_token = $1`,
      [submitRes.body.data.accessToken]
    );
    const submissionId = before.rows[0].id;

    const first = await formRepository.withdrawSubmissionConsentById(submissionId);
    expect(first.consentWithdrawnAt).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const second = await formRepository.withdrawSubmissionConsentById(submissionId);
    expect(new Date(second.consentWithdrawnAt).getTime()).toBe(new Date(first.consentWithdrawnAt).getTime());
  });

  it('rút ở bài A không ảnh hưởng bài B của cùng form', async () => {
    const owner = await createUser({ username: 'owner_unsub_3' });
    const token = await loginAs(owner);
    const form = await createSimplePublishedForm(token);
    const emailField = form.fields[0];

    const subA = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: { [emailField.key]: 'a@b.com' }, marketingConsent: true });
    const subB = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: { [emailField.key]: 'b@b.com' }, marketingConsent: true });

    const rowA = await db.query(`SELECT unsubscribe_token FROM form_submissions WHERE access_token = $1`, [subA.body.data.accessToken]);
    const unsubRes = await request(app).get(`/api/public/forms/unsubscribe/${rowA.rows[0].unsubscribe_token}`);
    expect(unsubRes.status).toBe(200);

    const rowB = await db.query(`SELECT marketing_consent FROM form_submissions WHERE access_token = $1`, [subB.body.data.accessToken]);
    expect(rowB.rows[0].marketing_consent).toBe(true);
  });

  it('form đã bị ẨN (super admin adminDisabledAt) → link vẫn rút được (200)', async () => {
    const owner = await createUser({ username: 'owner_unsub_4' });
    const token = await loginAs(owner);
    const form = await createSimplePublishedForm(token);
    const emailField = form.fields[0];

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: { [emailField.key]: 'a@b.com' }, marketingConsent: true });
    const row = await db.query(`SELECT unsubscribe_token FROM form_submissions WHERE access_token = $1`, [submitRes.body.data.accessToken]);

    await db.query(`UPDATE forms SET admin_disabled_at = NOW() WHERE id = $1`, [form.id]);

    const unsubRes = await request(app).get(`/api/public/forms/unsubscribe/${row.rows[0].unsubscribe_token}`);
    expect(unsubRes.status).toBe(200);
  });

  it('form CHƯA XUẤT BẢN (chủ tắt sau khi nộp) → link vẫn rút được (200)', async () => {
    const owner = await createUser({ username: 'owner_unsub_5' });
    const token = await loginAs(owner);
    const form = await createSimplePublishedForm(token);
    const emailField = form.fields[0];

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: { [emailField.key]: 'a@b.com' }, marketingConsent: true });
    const row = await db.query(`SELECT unsubscribe_token FROM form_submissions WHERE access_token = $1`, [submitRes.body.data.accessToken]);

    await request(app)
      .put(`/api/forms/${form.id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isPublished: false });

    const unsubRes = await request(app).get(`/api/public/forms/unsubscribe/${row.rows[0].unsubscribe_token}`);
    expect(unsubRes.status).toBe(200);
  });

  it('chủ form ĐÃ HẾT GÓI → link vẫn rút được (200) — quyền người nộp không phụ thuộc gói của chủ', async () => {
    const owner = await createUser({ username: 'owner_unsub_6' });
    const token = await loginAs(owner);
    const form = await createSimplePublishedForm(token);
    const emailField = form.fields[0];

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: { [emailField.key]: 'a@b.com' }, marketingConsent: true });
    const row = await db.query(`SELECT unsubscribe_token FROM form_submissions WHERE access_token = $1`, [submitRes.body.data.accessToken]);

    await db.query(`UPDATE users SET subscription_expires_at = NOW() - INTERVAL '30 days' WHERE id = $1`, [owner.id]);
    await db.query(
      `UPDATE plans SET grace_period_days = 0 WHERE id = (SELECT active_plan_id FROM users WHERE id = $1)`,
      [owner.id]
    );

    const unsubRes = await request(app).get(`/api/public/forms/unsubscribe/${row.rows[0].unsubscribe_token}`);
    expect(unsubRes.status).toBe(200);
  });

  it('bài chưa từng tích đồng ý (marketing_consent NULL) → vẫn trả 200, ghi consent_withdrawn_at', async () => {
    const owner = await createUser({ username: 'owner_unsub_7' });
    const token = await loginAs(owner);
    const form = await createSimplePublishedForm(token);
    const emailField = form.fields[0];

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: { [emailField.key]: 'a@b.com' } });
    const row = await db.query(`SELECT unsubscribe_token, marketing_consent FROM form_submissions WHERE access_token = $1`, [submitRes.body.data.accessToken]);
    expect(row.rows[0].marketing_consent).toBeNull();

    const unsubRes = await request(app).get(`/api/public/forms/unsubscribe/${row.rows[0].unsubscribe_token}`);
    expect(unsubRes.status).toBe(200);

    const after = await db.query(`SELECT marketing_consent, consent_withdrawn_at FROM form_submissions WHERE unsubscribe_token = $1`, [row.rows[0].unsubscribe_token]);
    expect(after.rows[0].marketing_consent).toBe(false);
    expect(after.rows[0].consent_withdrawn_at).not.toBeNull();
  });

  it('danh sách bài nộp của chủ (GET /api/forms/:id/submissions) có consentWithdrawnAt', async () => {
    const owner = await createUser({ username: 'owner_unsub_8' });
    const token = await loginAs(owner);
    const form = await createSimplePublishedForm(token);
    const emailField = form.fields[0];

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: { [emailField.key]: 'a@b.com' }, marketingConsent: true });
    const row = await db.query(`SELECT unsubscribe_token FROM form_submissions WHERE access_token = $1`, [submitRes.body.data.accessToken]);
    await request(app).get(`/api/public/forms/unsubscribe/${row.rows[0].unsubscribe_token}`);

    const listRes = await request(app)
      .get(`/api/forms/${form.id}/submissions`)
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    const submission = listRes.body.data.submissions[0];
    expect(submission.consentWithdrawnAt).toBeTruthy();
    expect(submission).not.toHaveProperty('unsubscribeToken');
  });
});
