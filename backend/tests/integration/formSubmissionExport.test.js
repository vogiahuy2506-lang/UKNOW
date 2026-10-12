/**
 * Integration: xuất CSV bài nộp biểu mẫu + khách landing — PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, PR-8c.
 *
 * HTTP thật + DB thật: tab "Từ biểu mẫu" (GET /api/forms/submissions/export.csv), trang bài nộp từng biểu mẫu
 * (GET /api/forms/:id/submissions/export.csv), tab "Từ landing page" (GET /api/leads/export.csv) và Excel sẵn có (nay cũng ghi nhật ký).
 * Chứng minh: BOM + CRLF + trích dẫn RFC 4180, chống formula injection trên dữ liệu khách THẬT, cột theo nhãn (khối hiển thị bị bỏ),
 * bộ lọc đúng như danh sách, quyền leads/forms, workspace khác không xuất được (404 / không có dữ liệu), nhân viên xuất dữ liệu workspace chủ,
 * trần 20.000 dòng + cờ cắt, và dòng nhật ký hoạt động cho MỖI lần xuất.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { settlePendingFormSubmissionBells } from '../../src/services/formSubmissionBell.service.js';
import { truncateAll, createUser } from './helpers/db.js';

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

afterEach(async () => {
  await settlePendingFormSubmissionBells();
});

// ─── Helper ────────────────────────────────────────────────────────────────────────────────────────

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  return res.body.data.accessToken;
}

async function addEmployee(ownerId, employeeId, permissions) {
  await db.query(
    `INSERT INTO user_members (owner_id, employee_id, permissions, status)
     VALUES ($1, $2, $3::jsonb, 'active')`,
    [ownerId, employeeId, JSON.stringify(permissions)]
  );
}

const binaryParser = (res, callback) => {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
};

/** GET trả Buffer thô (để kiểm byte BOM). */
function getCsv(url, token, ownerId) {
  const req = request(app).get(url).set('Authorization', `Bearer ${token}`).buffer(true).parse(binaryParser);
  return ownerId ? req.set('X-Owner-Context', String(ownerId)) : req;
}

/** Bóc BOM rồi tách theo RFC 4180 (nháy kép, "" thành ", xuống dòng trong ô). */
function parseCsv(buffer) {
  expect([...buffer.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const text = buffer.toString('utf8').slice(1);
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\r' && text[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i += 1; }
    else cell += ch;
  }
  expect(cell).toBe(''); // file kết thúc bằng CRLF
  expect(row).toEqual([]);
  return rows;
}

async function createPublishedForm(token, title, fields, extra = {}) {
  const createRes = await request(app).post('/api/forms').set('Authorization', `Bearer ${token}`).send({ title, fields, ...extra });
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

async function submit(form, answers, body = {}) {
  const res = await request(app).post(`/api/public/forms/${form.publicKey}/submissions`).send({ answers, ...body });
  expect(res.status).toBe(201);
  const { rows } = await db.query(`SELECT id FROM form_submissions WHERE form_id = $1 ORDER BY id DESC LIMIT 1`, [form.id]);
  return rows[0].id;
}

const FIELDS_A = [
  { label: 'Họ tên', type: 'short_text', required: true, role: 'name' },
  { label: 'Email', type: 'email', required: false, role: 'email' },
  { label: 'Số điện thoại', type: 'phone', required: false, role: 'phone' },
  { label: 'Phần 2', type: 'heading' },
  { label: 'Nhu cầu', type: 'select', options: ['Gói A', 'Gói B'] },
  { label: 'Hài lòng', type: 'rating' },
  { label: 'Đồng ý liên hệ lại', type: 'yes_no' },
  { label: 'Ghi chú', type: 'long_text' },
];
const FIELDS_B = [{ label: 'Họ tên', type: 'short_text', required: true, role: 'name' }];

/**
 * Chủ + 2 biểu mẫu (nhãn "Họ tên" trùng) + bài nộp có dữ liệu "độc": công thức, dấu phẩy, nháy kép, xuống dòng.
 */
async function seedOwnerWithSubmissions() {
  const owner = await createUser({ username: 'exp_owner' });
  const token = await loginAs(owner);
  const formA = await createPublishedForm(token, 'Đăng ký học', FIELDS_A);
  const formB = await createPublishedForm(token, 'Khảo sát', FIELDS_B);

  const idA1 = await submit(formA, {
    [keyOf(formA, 'Họ tên')]: 'Nguyễn, "An"',
    [keyOf(formA, 'Email')]: 'an@example.com',
    [keyOf(formA, 'Số điện thoại')]: '0901234567',
    [keyOf(formA, 'Nhu cầu')]: 'Gói B',
    [keyOf(formA, 'Hài lòng')]: 4,
    [keyOf(formA, 'Đồng ý liên hệ lại')]: 'yes',
    [keyOf(formA, 'Ghi chú')]: 'dòng 1\ndòng 2',
  }, { marketingConsent: 'true' });
  const idA2 = await submit(formA, {
    [keyOf(formA, 'Họ tên')]: '=HYPERLINK("http://evil.example","bấm")',
    [keyOf(formA, 'Ghi chú')]: '@SUM(1+1)',
    [keyOf(formA, 'Nhu cầu')]: 'Gói A',
  }, { marketingConsent: 'false' });
  const idB1 = await submit(formB, { [keyOf(formB, 'Họ tên')]: '+cmd|calc' });

  await db.query(`UPDATE form_submissions SET landing_page_slug = 'khoa-hoc', utm_source = 'facebook' WHERE id = $1`, [idA1]);
  await db.query(
    `UPDATE form_submissions SET created_at = '2026-09-01T03:00:00Z' WHERE id = $1`,
    [idA2]
  );
  return { owner, token, formA, formB, ids: { idA1, idA2, idB1 } };
}

const auditRows = async (action) =>
  (await db.query(`SELECT * FROM audit_logs WHERE action = $1 ORDER BY id`, [action])).rows;

// ─── Tab "Từ biểu mẫu" ────────────────────────────────────────────────────────────────────────────

describe('GET /api/forms/submissions/export.csv — tab "Từ biểu mẫu"', () => {
  it('xuất mọi biểu mẫu của workspace: header tải tệp, BOM, CRLF, cột cố định + cột theo NHÃN, khối hiển thị bị bỏ', async () => {
    const { token } = await seedOwnerWithSubmissions();
    const res = await getCsv('/api/forms/submissions/export.csv', token);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv; charset=utf-8/);
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="khach-de-lai-thong-tin-bieu-mau-\d{8}-\d{4}\.csv"$/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-export-row-count']).toBe('3');
    expect(res.headers['x-export-total']).toBe('3');
    expect(res.headers['x-export-truncated']).toBe('false');
    // Mỗi dòng kết thúc CRLF (không có LF lẻ ngoài ô được bọc nháy).
    expect(res.body.toString('utf8').endsWith('\r\n')).toBe(true);

    const rows = parseCsv(res.body);
    expect(rows).toHaveLength(4); // 1 tiêu đề + 3 bài
    const header = rows[0];
    expect(header.slice(0, 13)).toEqual([
      'Thời gian', 'Biểu mẫu', 'Người nộp', 'Email', 'Số điện thoại', 'Nguồn landing',
      'UTM source', 'UTM medium', 'UTM campaign', 'UTM content', 'UTM term', 'Trạng thái', 'Đồng ý nhận tin',
    ]);
    // Cột câu trả lời theo nhãn; nhãn "Họ tên" trùng giữa hai biểu mẫu → kèm tên biểu mẫu; khối "Phần 2" không thành cột.
    expect(header.slice(13)).toEqual([
      'Họ tên (Đăng ký học)', 'Email (câu trả lời)', 'Số điện thoại (câu trả lời)', 'Nhu cầu', 'Hài lòng', 'Đồng ý liên hệ lại', 'Ghi chú',
      'Họ tên (Khảo sát)',
    ]);
    expect(header).not.toContain('Phần 2');
  });

  it('dữ liệu độc: dấu phẩy / nháy kép / xuống dòng quay vòng đúng; công thức bị vô hiệu bằng nháy đơn; rating, yes_no, giờ VN, đồng ý', async () => {
    const { token } = await seedOwnerWithSubmissions();
    const rows = parseCsv((await getCsv('/api/forms/submissions/export.csv', token)).body);
    const header = rows[0];
    const col = (name) => header.indexOf(name);

    const a1 = rows.slice(1).find((r) => r[col('Email')] === 'an@example.com');
    expect(a1[col('Người nộp')]).toBe('Nguyễn, "An"');
    expect(a1[col('Biểu mẫu')]).toBe('Đăng ký học');
    expect(a1[col('Số điện thoại')]).toBe('0901234567'); // số điện thoại thường: không phải ký tự công thức
    expect(a1[col('Ghi chú')]).toBe('dòng 1\ndòng 2');
    expect(a1[col('Nhu cầu')]).toBe('Gói B');
    expect(a1[col('Hài lòng')]).toBe('4/5');
    expect(a1[col('Đồng ý liên hệ lại')]).toBe('Có');
    expect(a1[col('Nguồn landing')]).toBe('khoa-hoc');
    expect(a1[col('UTM source')]).toBe('facebook');
    expect(a1[col('Trạng thái')]).toBe('Đã nhận');
    expect(a1[col('Đồng ý nhận tin')]).toBe('Có');
    expect(a1[col('Thời gian')]).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);

    // Chống formula injection trên dữ liệu khách thật: mọi ô bắt đầu bằng = + - @ đều thành văn bản.
    const a2 = rows.slice(1).find((r) => r[col('Biểu mẫu')] === 'Đăng ký học' && r[col('Email')] === '');
    expect(a2[col('Người nộp')]).toBe(`'=HYPERLINK("http://evil.example","bấm")`);
    expect(a2[col('Họ tên (Đăng ký học)')]).toBe(`'=HYPERLINK("http://evil.example","bấm")`);
    expect(a2[col('Ghi chú')]).toBe("'@SUM(1+1)");
    expect(a2[col('Đồng ý nhận tin')]).toBe('Không');
    expect(a2[col('Thời gian')]).toBe('01/09/2026 10:00'); // 03:00Z = 10:00 giờ VN

    const b1 = rows.slice(1).find((r) => r[col('Biểu mẫu')] === 'Khảo sát');
    expect(b1[col('Người nộp')]).toBe("'+cmd|calc");
    // Cột của biểu mẫu khác để trống.
    expect(b1[col('Nhu cầu')]).toBe('');
    expect(a1[col('Họ tên (Khảo sát)')]).toBe('');

    for (const row of rows.slice(1)) {
      for (const cell of row) {
        expect(cell).not.toMatch(/^[=+\-@\t\r]/); // không còn ô nào mở đầu bằng ký tự công thức
      }
    }
  });

  it('bộ lọc: formId · landingPageSlug · from/to (giờ VN) — và cột câu trả lời thu về đúng biểu mẫu được lọc', async () => {
    const { token, formB } = await seedOwnerWithSubmissions();

    const onlyB = parseCsv((await getCsv(`/api/forms/submissions/export.csv?formId=${formB.id}`, token)).body);
    expect(onlyB).toHaveLength(2);
    expect(onlyB[0].slice(13)).toEqual(['Họ tên']); // chỉ còn một biểu mẫu → không cần kèm tên biểu mẫu

    const bySlug = parseCsv((await getCsv('/api/forms/submissions/export.csv?landingPageSlug=%2FKhoa-Hoc%2F', token)).body);
    expect(bySlug).toHaveLength(2);
    expect(bySlug[1][bySlug[0].indexOf('Email')]).toBe('an@example.com');

    const september = parseCsv((await getCsv('/api/forms/submissions/export.csv?from=2026-09-01&to=2026-09-01', token)).body);
    expect(september).toHaveLength(2);
    expect(september[1][september[0].indexOf('Thời gian')]).toBe('01/09/2026 10:00');

    const none = await getCsv('/api/forms/submissions/export.csv?from=2020-01-01&to=2020-01-02', token);
    expect(none.status).toBe(200);
    expect(parseCsv(none.body)).toHaveLength(1); // chỉ có dòng tiêu đề
    expect(none.headers['x-export-row-count']).toBe('0');
  });

  it('tham số sai → 400 dạng JSON (không gửi nửa tệp)', async () => {
    const { token } = await seedOwnerWithSubmissions();
    const bad = await request(app).get('/api/forms/submissions/export.csv?from=hôm-qua').set('Authorization', `Bearer ${token}`);
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('INVALID_DATE');
    const badForm = await request(app).get('/api/forms/submissions/export.csv?formId=abc').set('Authorization', `Bearer ${token}`);
    expect(badForm.status).toBe(400);
    expect(badForm.body.code).toBe('INVALID_FORM_ID');
  });

  it('lang=en: tiêu đề, trạng thái, Yes/No bằng tiếng Anh', async () => {
    const { token } = await seedOwnerWithSubmissions();
    const rows = parseCsv((await getCsv('/api/forms/submissions/export.csv?lang=en', token)).body);
    expect(rows[0].slice(0, 3)).toEqual(['Time', 'Form', 'Respondent']);
    const a1 = rows.slice(1).find((r) => r[rows[0].indexOf('Email')] === 'an@example.com');
    expect(a1[rows[0].indexOf('Status')]).toBe('Received');
    expect(a1[rows[0].indexOf('Đồng ý liên hệ lại')]).toBe('Yes');
  });

  it('quyền: không token 401; nhân viên KHÔNG có quyền forms 403; nhân viên có quyền forms xuất dữ liệu workspace của chủ', async () => {
    const { owner } = await seedOwnerWithSubmissions();
    expect((await request(app).get('/api/forms/submissions/export.csv')).status).toBe(401);

    const denied = await createUser({ username: 'exp_emp_denied' });
    await addEmployee(owner.id, denied.id, { leads: true });
    const deniedRes = await request(app)
      .get('/api/forms/submissions/export.csv')
      .set('Authorization', `Bearer ${await loginAs(denied)}`)
      .set('X-Owner-Context', String(owner.id));
    expect(deniedRes.status).toBe(403);
    expect(await auditRows('FORM_SUBMISSIONS_EXPORTED')).toHaveLength(0);

    const allowed = await createUser({ username: 'exp_emp_ok' });
    await addEmployee(owner.id, allowed.id, { forms: true });
    const okRes = await getCsv('/api/forms/submissions/export.csv', await loginAs(allowed), owner.id);
    expect(okRes.status).toBe(200);
    expect(parseCsv(okRes.body)).toHaveLength(4);

    // Nhật ký ghi NHÂN VIÊN là người xuất, trong workspace của chủ.
    const [audit] = await auditRows('FORM_SUBMISSIONS_EXPORTED');
    expect(Number(audit.id_user)).toBe(Number(allowed.id));
    expect(Number(audit.owner_id)).toBe(Number(owner.id));
  });

  it('workspace khác: không lộ bài nộp của chủ khác; formId của chủ khác → 404', async () => {
    const { formA } = await seedOwnerWithSubmissions();
    const other = await createUser({ username: 'exp_other' });
    const otherToken = await loginAs(other);
    const otherForm = await createPublishedForm(otherToken, 'Form người khác', FIELDS_B);
    await submit(otherForm, { [keyOf(otherForm, 'Họ tên')]: 'Người lạ' });

    const mine = parseCsv((await getCsv('/api/forms/submissions/export.csv', otherToken)).body);
    expect(mine).toHaveLength(2);
    expect(mine[1][mine[0].indexOf('Người nộp')]).toBe('Người lạ');
    expect(JSON.stringify(mine)).not.toContain('an@example.com');

    const foreign = await request(app)
      .get(`/api/forms/submissions/export.csv?formId=${formA.id}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(foreign.status).toBe(404);
    expect(foreign.body.code).toBe('FORM_NOT_FOUND');
  });

  it('ghi nhật ký hoạt động: ai, loại, bộ lọc, số dòng', async () => {
    const { owner, token, formB } = await seedOwnerWithSubmissions();
    await getCsv(`/api/forms/submissions/export.csv?formId=${formB.id}&from=2026-01-01`, token);
    const rows = await auditRows('FORM_SUBMISSIONS_EXPORTED');
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].id_user)).toBe(Number(owner.id));
    expect(Number(rows[0].owner_id)).toBe(Number(owner.id));
    expect(rows[0].category).toBe('workspace');
    expect(rows[0].entity_type).toBe('form');
    expect(Number(rows[0].entity_id)).toBe(Number(formB.id));
    expect(rows[0].details).toMatchObject({
      exportType: 'form_submissions_workspace',
      rowCount: 1,
      totalMatched: 1,
      truncated: false,
      filters: { formId: Number(formB.id), from: '2026-01-01', to: null, landingPageSlug: null },
    });
  });

  it('bộ lọc sai hoặc bị từ chối thì KHÔNG ghi nhật ký (không có dữ liệu nào ra khỏi hệ thống)', async () => {
    const { token } = await seedOwnerWithSubmissions();
    await request(app).get('/api/forms/submissions/export.csv?from=xx').set('Authorization', `Bearer ${token}`);
    expect(await auditRows('FORM_SUBMISSIONS_EXPORTED')).toHaveLength(0);
  });

  it('trần 20.000 dòng: vượt thì cắt ở 20.000 (mới nhất trước), báo X-Export-Truncated + tổng, nhật ký ghi truncated', async () => {
    const owner = await createUser({ username: 'exp_cap_owner' });
    const token = await loginAs(owner);
    const form = await createPublishedForm(token, 'Form đông khách', FIELDS_B);
    const nameKey = keyOf(form, 'Họ tên');
    await db.query(
      `INSERT INTO form_submissions (form_id, workspace_owner_id, access_token, answers, respondent_name, status, created_at)
       SELECT $1, $2, md5(random()::text || g::text) || md5(g::text), jsonb_build_object($3::text, jsonb_build_object('label', 'Họ tên', 'type', 'short_text', 'value', 'Khách ' || g)),
              'Khách ' || g, 'submitted', TIMESTAMPTZ '2026-10-01 00:00:00+00' + (g || ' seconds')::interval
         FROM generate_series(1, 20001) AS g`,
      [form.id, owner.id, nameKey]
    );

    const res = await getCsv('/api/forms/submissions/export.csv', token);
    expect(res.status).toBe(200);
    expect(res.headers['x-export-truncated']).toBe('true');
    expect(res.headers['x-export-total']).toBe('20001');
    expect(res.headers['x-export-row-count']).toBe('20000');
    const rows = parseCsv(res.body);
    expect(rows).toHaveLength(20001); // 1 tiêu đề + 20.000
    expect(rows[1][rows[0].indexOf('Người nộp')]).toBe('Khách 20001'); // mới nhất trước
    expect(rows[20000][rows[0].indexOf('Người nộp')]).toBe('Khách 2'); // 'Khách 1' bị cắt

    const [audit] = await auditRows('FORM_SUBMISSIONS_EXPORTED');
    expect(audit.details).toMatchObject({ rowCount: 20000, totalMatched: 20001, truncated: true });
  }, 60000);
});

// ─── Trang bài nộp một biểu mẫu ───────────────────────────────────────────────────────────────────

describe('GET /api/forms/:id/submissions/export.csv — trang bài nộp một biểu mẫu', () => {
  it('cột = nhãn trường của biểu mẫu đó; chỉ bài của biểu mẫu đó; tên tệp bai-nop-<slug>-<stamp>.csv', async () => {
    const { token, formA } = await seedOwnerWithSubmissions();
    const res = await getCsv(`/api/forms/${formA.id}/submissions/export.csv`, token);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="bai-nop-dang-ky-hoc-\d{8}-\d{4}\.csv"$/);

    const rows = parseCsv(res.body);
    expect(rows).toHaveLength(3); // tiêu đề + 2 bài của form A (không lẫn bài form B)
    expect(rows[0]).toEqual([
      'Thời gian', 'Người nộp', 'Email', 'Số điện thoại', 'Trạng thái', 'Nguồn landing',
      'UTM source', 'UTM medium', 'UTM campaign', 'UTM content', 'UTM term', 'Đồng ý nhận tin',
      'Họ tên', 'Email (câu trả lời)', 'Số điện thoại (câu trả lời)', 'Nhu cầu', 'Hài lòng', 'Đồng ý liên hệ lại', 'Ghi chú',
    ]);
    expect(rows[0]).not.toContain('Phần 2');
    const a1 = rows.slice(1).find((r) => r[rows[0].indexOf('Email')] === 'an@example.com');
    expect(a1[rows[0].indexOf('Họ tên')]).toBe('Nguyễn, "An"');
    expect(a1[rows[0].indexOf('Hài lòng')]).toBe('4/5');
    expect(a1[rows[0].indexOf('Ghi chú')]).toBe('dòng 1\ndòng 2');
  });

  it('chống injection ở trang này cũng áp cho ô câu trả lời', async () => {
    const { token, formA } = await seedOwnerWithSubmissions();
    const rows = parseCsv((await getCsv(`/api/forms/${formA.id}/submissions/export.csv`, token)).body);
    const injected = rows.slice(1).find((r) => r[rows[0].indexOf('Ghi chú')].includes('SUM'));
    expect(injected[rows[0].indexOf('Ghi chú')]).toBe("'@SUM(1+1)");
    expect(injected[rows[0].indexOf('Họ tên')]).toBe(`'=HYPERLINK("http://evil.example","bấm")`);
  });

  it('biểu mẫu của workspace khác → 404; id sai → 400; không quyền forms → 403; không token → 401', async () => {
    const { owner, formA } = await seedOwnerWithSubmissions();
    const other = await createUser({ username: 'exp_form_other' });
    const otherToken = await loginAs(other);
    const res = await request(app).get(`/api/forms/${formA.id}/submissions/export.csv`).set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('FORM_NOT_FOUND');

    const bad = await request(app).get('/api/forms/abc/submissions/export.csv').set('Authorization', `Bearer ${otherToken}`);
    expect(bad.status).toBe(400);

    const denied = await createUser({ username: 'exp_form_denied' });
    await addEmployee(owner.id, denied.id, { leads: true });
    const deniedRes = await request(app)
      .get(`/api/forms/${formA.id}/submissions/export.csv`)
      .set('Authorization', `Bearer ${await loginAs(denied)}`)
      .set('X-Owner-Context', String(owner.id));
    expect(deniedRes.status).toBe(403);

    expect((await request(app).get(`/api/forms/${formA.id}/submissions/export.csv`)).status).toBe(401);
    expect(await auditRows('FORM_SUBMISSIONS_EXPORTED')).toHaveLength(0);
  });

  it('nhân viên có quyền forms xuất được biểu mẫu của chủ', async () => {
    const { owner, formA } = await seedOwnerWithSubmissions();
    const employee = await createUser({ username: 'exp_form_emp' });
    await addEmployee(owner.id, employee.id, { forms: true });
    const res = await getCsv(`/api/forms/${formA.id}/submissions/export.csv`, await loginAs(employee), owner.id);
    expect(res.status).toBe(200);
    expect(parseCsv(res.body)).toHaveLength(3);
  });

  it('ghi nhật ký: loại form_submissions_form + id biểu mẫu + bộ lọc date', async () => {
    const { owner, token, formA } = await seedOwnerWithSubmissions();
    const res = await getCsv(`/api/forms/${formA.id}/submissions/export.csv?date=2026-10-14`, token);
    expect(res.status).toBe(200);
    // Biểu mẫu không đặt lịch → không bài nào có lịch hẹn ngày đó: chỉ còn dòng tiêu đề (bộ lọc ngày lịch hẹn ĐƯỢC áp).
    expect(parseCsv(res.body)).toHaveLength(1);
    const [audit] = await auditRows('FORM_SUBMISSIONS_EXPORTED');
    expect(Number(audit.entity_id)).toBe(Number(formA.id));
    expect(Number(audit.id_user)).toBe(Number(owner.id));
    expect(audit.details).toMatchObject({ exportType: 'form_submissions_form', filters: { date: '2026-10-14' }, rowCount: 0 });
  });

  it('date sai định dạng → 400', async () => {
    const { token, formA } = await seedOwnerWithSubmissions();
    const res = await request(app).get(`/api/forms/${formA.id}/submissions/export.csv?date=14-10-2026`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_DATE');
  });
});

// ─── Tab "Từ landing page" ────────────────────────────────────────────────────────────────────────

async function insertLead(idUser, overrides = {}) {
  const row = {
    last_name: 'Nguyễn',
    first_name: 'An',
    email: `${Math.random().toString(36).slice(2)}@test.local`,
    phone: '0900000000',
    occupation: 'developer',
    interest_area: 'tech',
    marketing_consent: true,
    landing_page_slug: 'home',
    custom_fields: {},
    created_at: '2026-10-01T03:00:00Z',
    ...overrides,
  };
  const { rows } = await db.query(
    `INSERT INTO leads (last_name, first_name, email, phone, occupation, interest_area, marketing_consent, landing_page_slug, id_user, custom_fields, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11) RETURNING *`,
    [row.last_name, row.first_name, row.email, row.phone, row.occupation, row.interest_area, row.marketing_consent, row.landing_page_slug,
      idUser, JSON.stringify(row.custom_fields), row.created_at]
  );
  return rows[0];
}

const CF_HOBBY = {
  cf_hobby_one: { type: 'text', labelVi: 'Sở thích', labelEn: 'Hobby', value: 'đọc sách', displayVi: 'đọc sách', displayEn: 'reading' },
};

describe('GET /api/leads/export.csv — tab "Từ landing page"', () => {
  it('cột như bản Excel + trường tuỳ chỉnh; BOM, CRLF, trích dẫn, chống injection, giờ VN', async () => {
    const owner = await createUser({ username: 'exp_lead_owner' });
    const token = await loginAs(owner);
    await insertLead(owner.id, { first_name: '=cmd|calc', last_name: 'Lê, "B"', email: 'b@test.local', custom_fields: CF_HOBBY });
    await insertLead(owner.id, { email: 'a@test.local', marketing_consent: null, landing_page_slug: 'khac', created_at: '2026-10-02T03:00:00Z' });

    const res = await getCsv('/api/leads/export.csv', token);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv; charset=utf-8/);
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="khach-de-lai-thong-tin-landing-page-\d{8}-\d{4}\.csv"$/);
    expect(res.headers['x-export-row-count']).toBe('2');
    expect(res.headers['x-export-truncated']).toBe('false');

    const rows = parseCsv(res.body);
    expect(rows[0]).toEqual([
      'Họ và tên', 'Email', 'Điện thoại', 'Trang nguồn', 'Nghề', 'Lĩnh vực quan tâm', 'Đồng ý nhận tin', 'Thời gian đăng ký',
      'Sở thích (cf_hobby_one)',
    ]);
    expect(rows).toHaveLength(3);
    // Mới nhất trước.
    expect(rows[1][1]).toBe('a@test.local');
    expect(rows[1][6]).toBe('Chưa hỏi');
    expect(rows[1][8]).toBe(''); // lead này không có trường tuỳ chỉnh

    const b = rows[2];
    expect(b[0]).toBe('Lê, "B" =cmd|calc'); // "Họ Tên" = last + first; ô không bắt đầu bằng '=' nên không cần nháy
    expect(b[6]).toBe('Có');
    expect(b[7]).toBe('01/10/2026 10:00');
    expect(b[8]).toBe('đọc sách');
  });

  it('họ tên bắt đầu bằng ký tự công thức bị vô hiệu', async () => {
    const owner = await createUser({ username: 'exp_lead_inj' });
    const token = await loginAs(owner);
    await insertLead(owner.id, { last_name: '=HYPERLINK("http://evil.example")', first_name: '' });
    const rows = parseCsv((await getCsv('/api/leads/export.csv', token)).body);
    expect(rows[1][0]).toBe(`'=HYPERLINK("http://evil.example")`);
  });

  it('bộ lọc slug / khoảng ngày áp dụng đúng như danh sách', async () => {
    const owner = await createUser({ username: 'exp_lead_filter' });
    const token = await loginAs(owner);
    await insertLead(owner.id, { email: 'in@test.local', landing_page_slug: 'home', created_at: '2026-10-01T03:00:00Z' });
    await insertLead(owner.id, { email: 'other@test.local', landing_page_slug: 'khac', created_at: '2026-10-01T03:00:00Z' });
    await insertLead(owner.id, { email: 'old@test.local', landing_page_slug: 'home', created_at: '2026-01-01T03:00:00Z' });

    const bySlug = parseCsv((await getCsv(`/api/leads/export.csv?landingLeadsSlugs=${encodeURIComponent('["home"]')}`, token)).body);
    expect(bySlug.slice(1).map((r) => r[1]).sort()).toEqual(['in@test.local', 'old@test.local']);

    const byDate = parseCsv((await getCsv(
      '/api/leads/export.csv?landingLeadsUseDateRange=true&landingLeadsDateFrom=2026-09-30&landingLeadsDateTo=2026-10-02', token
    )).body);
    expect(byDate.slice(1).map((r) => r[1]).sort()).toEqual(['in@test.local', 'other@test.local']);
  });

  it('quyền leads: nhân viên không có leads 403, có leads xuất ĐÚNG lead của chủ; chủ khác không lộ', async () => {
    const owner = await createUser({ username: 'exp_lead_perm_owner' });
    const other = await createUser({ username: 'exp_lead_perm_other' });
    await insertLead(owner.id, { email: 'mine@test.local' });
    await insertLead(other.id, { email: 'theirs@test.local' });

    const noLeads = await createUser({ username: 'exp_lead_emp_no' });
    await addEmployee(owner.id, noLeads.id, { forms: true });
    const denied = await request(app)
      .get('/api/leads/export.csv')
      .set('Authorization', `Bearer ${await loginAs(noLeads)}`)
      .set('X-Owner-Context', String(owner.id));
    expect(denied.status).toBe(403);
    expect(await auditRows('LANDING_LEADS_EXPORTED')).toHaveLength(0);

    const withLeads = await createUser({ username: 'exp_lead_emp_yes' });
    await addEmployee(owner.id, withLeads.id, { leads: true });
    const ok = await getCsv('/api/leads/export.csv', await loginAs(withLeads), owner.id);
    expect(ok.status).toBe(200);
    const rows = parseCsv(ok.body);
    expect(rows.slice(1).map((r) => r[1])).toEqual(['mine@test.local']);
    expect(JSON.stringify(rows)).not.toContain('theirs@test.local');

    expect((await request(app).get('/api/leads/export.csv')).status).toBe(401);
  });

  it('ghi nhật ký LANDING_LEADS_EXPORTED: ai, loại, bộ lọc, số dòng', async () => {
    const owner = await createUser({ username: 'exp_lead_audit' });
    const token = await loginAs(owner);
    await insertLead(owner.id, { landing_page_slug: 'home' });
    await insertLead(owner.id, { landing_page_slug: 'khac' });
    await getCsv(`/api/leads/export.csv?landingLeadsSlugs=${encodeURIComponent('["home"]')}`, token);
    const rows = await auditRows('LANDING_LEADS_EXPORTED');
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].id_user)).toBe(Number(owner.id));
    expect(rows[0].entity_type).toBe('lead');
    expect(rows[0].details).toMatchObject({
      exportType: 'landing_leads_csv',
      rowCount: 1,
      totalMatched: 1,
      truncated: false,
      filters: { slugs: ['home'] },
    });
  });

  it('bản Excel sẵn có (GET /api/leads/export) nay cũng ghi nhật ký', async () => {
    const owner = await createUser({ username: 'exp_lead_xlsx' });
    const token = await loginAs(owner);
    await insertLead(owner.id);
    const res = await request(app).get('/api/leads/export').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const rows = await auditRows('LANDING_LEADS_EXPORTED');
    expect(rows).toHaveLength(1);
    expect(rows[0].details).toMatchObject({ exportType: 'landing_leads_xlsx', rowCount: 1, totalMatched: 1, truncated: false });
  });
});
