/**
 * Integration: durable einvoice (migration 124) + claim race + owner PDF + SMTP PDF.
 *
 * Mat Bao HTTP is mocked; Postgres is real. Flags stay off in production env
 * examples — this file enables the worker only inside the process for email tests.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mockDownloadPdf = jest.fn();
const mockSendMail = jest.fn().mockResolvedValue({ messageId: '<einvoice@test>' });
const mockCreateTransport = jest.fn().mockReturnValue({
  verify: jest.fn().mockResolvedValue(true),
  sendMail: mockSendMail,
});

jest.unstable_mockModule('../../src/utils/matbaoHddtClient.util.js', () => ({
  isMatbaoConfigured: () => true,
  getMatbaoSeriesConfig: () => ({ khmshdon: '1', khhdon: 'C26TAT' }),
  matbaoCreateInvoices: jest.fn(),
  matbaoDownloadInvoicePdf: mockDownloadPdf,
  matbaoLogin: jest.fn(),
  matbaoListTemplates: jest.fn(),
  parseCreateInvoiceItemResult: () => ({ errorCode: '200' }),
  _resetMatbaoTokenCacheForTests: jest.fn(),
}));

jest.unstable_mockModule('nodemailer', () => ({
  default: { createTransport: mockCreateTransport },
  createTransport: mockCreateTransport,
}));

const request = (await import('supertest')).default;
const { createApp } = await import('../../src/app.js');
const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser } = await import('./helpers/db.js');
const { stripOuterTransactionStatements } = await import('../../src/utils/migrationRunner.util.js');
const {
  claimEinvoiceByIdForIssue,
  claimEinvoiceByIdForEmail,
  markEinvoiceIssued,
} = await import('../../src/repositories/payment/einvoice.repository.js');
const { sendInvoicePdfForEinvoice } = await import('../../src/services/payment/matbaoInvoice.service.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_124 = path.resolve(
  __dirname,
  '../../migrations/124_einvoice_delivery_state.sql',
);

const MIN_PDF = Buffer.from('%PDF-1.4 test');

let app;
let prevWorker;
let prevTestSendEmail;

beforeAll(() => {
  app = createApp();
  prevWorker = process.env.MATBAO_EINVOICE_WORKER_ENABLED;
  prevTestSendEmail = process.env.TEST_SEND_EMAIL;
  process.env.MATBAO_EINVOICE_WORKER_ENABLED = 'true';
  process.env.TEST_SEND_EMAIL = '1';
});

afterAll(() => {
  if (prevWorker === undefined) delete process.env.MATBAO_EINVOICE_WORKER_ENABLED;
  else process.env.MATBAO_EINVOICE_WORKER_ENABLED = prevWorker;
  if (prevTestSendEmail === undefined) delete process.env.TEST_SEND_EMAIL;
  else process.env.TEST_SEND_EMAIL = prevTestSendEmail;
});

beforeEach(async () => {
  await truncateAll();
  mockDownloadPdf.mockReset();
  mockSendMail.mockClear();
  mockDownloadPdf.mockResolvedValue({
    buffer: MIN_PDF,
    contentType: 'application/pdf',
  });
});

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  if (!res.body?.data?.accessToken) {
    throw new Error(`Login fail: ${JSON.stringify(res.body)}`);
  }
  return res.body.data.accessToken;
}

async function insertPaidOrder({ user, orderCode, invoiceInfo }) {
  const { rows } = await db.query(
    `INSERT INTO orders (
       order_code, amount, user_email, user_id, status, payment_method, invoice_info
     ) VALUES ($1, 110000, $2, $3, 'success', 'payos', $4::jsonb)
     RETURNING *`,
    [orderCode, user.email, user.id, JSON.stringify(invoiceInfo || { wantInvoice: true })],
  );
  return rows[0];
}

async function insertEinvoice(order, overrides = {}) {
  const maTraCuu = overrides.ma_tra_cuu || `UK${order.order_code}`;
  const { rows } = await db.query(
    `INSERT INTO einvoices (
       order_id, ma_tra_cuu, mtchieu, khmshdon, khhdon,
       status, email_status, ma_so_hdon, so_hdon, pdf_url
     ) VALUES ($1, $2, $3, '1', 'C26TAT', $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      order.id,
      maTraCuu,
      maTraCuu.slice(0, 20),
      overrides.status || 'pending',
      overrides.email_status || 'pending',
      overrides.ma_so_hdon || null,
      overrides.so_hdon || null,
      overrides.pdf_url || null,
    ],
  );
  return rows[0];
}

describe('migration 124 einvoice delivery state', () => {
  it('is idempotent on bootstrap schema and keeps 124 columns + checks', async () => {
    const sql = stripOuterTransactionStatements(fs.readFileSync(MIGRATION_124, 'utf8'));
    await db.query(sql);
    await db.query(sql);

    const cols = await db.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'einvoices'
         AND column_name = ANY($1::text[])
       ORDER BY column_name`,
      [[
        'processing_started_at',
        'attempt_count',
        'next_attempt_at',
        'email_status',
        'email_attempt_count',
        'email_last_attempt_at',
        'email_next_attempt_at',
        'email_sent_at',
        'email_last_error',
      ]],
    );
    expect(cols.rows.map((r) => r.column_name)).toEqual([
      'attempt_count',
      'email_attempt_count',
      'email_last_attempt_at',
      'email_last_error',
      'email_next_attempt_at',
      'email_sent_at',
      'email_status',
      'next_attempt_at',
      'processing_started_at',
    ]);

    await db.query(`INSERT INTO users (username, email, password_hash, status, is_verified, role)
      VALUES ('m124u', 'm124u@test.local', 'x', 'active', TRUE, 'user')`);
    const user = (await db.query(`SELECT id FROM users WHERE username = 'm124u'`)).rows[0];
    const order = (await db.query(
      `INSERT INTO orders (order_code, amount, user_email, user_id, status)
       VALUES (1240001, 1, 'm124u@test.local', $1, 'success') RETURNING id`,
      [user.id],
    )).rows[0];

    await expect(db.query(
      `INSERT INTO einvoices (order_id, ma_tra_cuu, mtchieu, status, email_status)
       VALUES ($1, 'UK1240001', 'UK1240001', 'processing', 'sending')`,
      [order.id],
    )).resolves.toBeTruthy();
  });
});

describe('einvoice concurrent claim', () => {
  it('only one worker claims the same issue job', async () => {
    const user = await createUser({ username: 'claim-owner' });
    const order = await insertPaidOrder({ user, orderCode: 2000001 });
    const row = await insertEinvoice(order, { status: 'pending' });

    const [a, b] = await Promise.all([
      claimEinvoiceByIdForIssue(row.id),
      claimEinvoiceByIdForIssue(row.id),
    ]);
    const won = [a, b].filter(Boolean);
    const lost = [a, b].filter((x) => !x);
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(won[0].status).toBe('processing');

    const fresh = await db.query('SELECT status, attempt_count FROM einvoices WHERE id = $1', [row.id]);
    expect(fresh.rows[0].status).toBe('processing');
    expect(Number(fresh.rows[0].attempt_count)).toBe(1);
  });

  it('only one worker claims the same email job', async () => {
    const user = await createUser({ username: 'claim-email' });
    const order = await insertPaidOrder({ user, orderCode: 2000002 });
    const row = await insertEinvoice(order, {
      status: 'issued',
      email_status: 'pending',
      ma_so_hdon: 'MSO',
    });

    const [a, b] = await Promise.all([
      claimEinvoiceByIdForEmail(row.id),
      claimEinvoiceByIdForEmail(row.id),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect([a, b].filter((x) => !x)).toHaveLength(1);

    const fresh = await db.query('SELECT email_status FROM einvoices WHERE id = $1', [row.id]);
    expect(fresh.rows[0].email_status).toBe('sending');
  });

  it('markEinvoiceIssued does not downgrade cqt_ok', async () => {
    const user = await createUser({ username: 'cqt-keep' });
    const order = await insertPaidOrder({ user, orderCode: 2000003 });
    const row = await insertEinvoice(order, {
      status: 'cqt_ok',
      ma_so_hdon: 'MSO',
    });
    await db.query(`UPDATE einvoices SET status = 'cqt_ok' WHERE id = $1`, [row.id]);

    const updated = await markEinvoiceIssued(row.id, { maSoHdon: 'MSO', soHdon: '9' });
    expect(updated.status).toBe('cqt_ok');
    expect(updated.so_hdon).toBe('9');
  });
});

describe('GET /api/payments/invoice/:orderCode/pdf', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/payments/invoice/2000004/pdf');
    expect(res.status).toBe(401);
    expect(mockDownloadPdf).not.toHaveBeenCalled();
  });

  it('404 for another user (owner-only)', async () => {
    const owner = await createUser({ username: 'pdf-owner' });
    const other = await createUser({ username: 'pdf-other' });
    const order = await insertPaidOrder({ user: owner, orderCode: 2000004 });
    await insertEinvoice(order, { status: 'issued', ma_so_hdon: 'MSO' });

    const token = await loginAs(other);
    const res = await request(app)
      .get('/api/payments/invoice/2000004/pdf')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(mockDownloadPdf).not.toHaveBeenCalled();
  });

  it('409 when invoice is not issued yet', async () => {
    const owner = await createUser({ username: 'pdf-pending' });
    const order = await insertPaidOrder({ user: owner, orderCode: 2000005 });
    await insertEinvoice(order, { status: 'pending' });
    const token = await loginAs(owner);

    const res = await request(app)
      .get('/api/payments/invoice/2000005/pdf')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INVOICE_PDF_NOT_READY');
    expect(mockDownloadPdf).not.toHaveBeenCalled();
  });

  it('200 streams PDF for owner and does not expose pdfUrl', async () => {
    const owner = await createUser({ username: 'pdf-ok' });
    const order = await insertPaidOrder({ user: owner, orderCode: 2000006 });
    await insertEinvoice(order, {
      status: 'issued',
      ma_so_hdon: 'MSO',
      pdf_url: 'https://demo-api-hddt.matbao.in/secret.pdf',
    });
    const token = await loginAs(owner);

    const res = await request(app)
      .get('/api/payments/invoice/2000006/pdf')
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((response, cb) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/pdf/);
    expect(res.headers['content-disposition']).toMatch(/hoa-don-2000006\.pdf/);
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.subarray(0, 4).toString('utf8')).toBe('%PDF');
    expect(mockDownloadPdf).toHaveBeenCalledTimes(1);

    const meta = await request(app)
      .get('/api/payments/invoice/2000006')
      .set('Authorization', `Bearer ${token}`);
    expect(meta.status).toBe(200);
    expect(meta.body.result.pdfUrl).toBeUndefined();
    expect(meta.body.result.canDownload).toBe(true);
  });
});

describe('invoice PDF SMTP attachment', () => {
  it('sends PDF buffer to orders.user_email and marks email sent', async () => {
    const owner = await createUser({ username: 'mail-owner', email: 'owner-mail@test.local' });
    const order = await insertPaidOrder({ user: owner, orderCode: 2000007 });
    const row = await insertEinvoice(order, {
      status: 'issued',
      email_status: 'pending',
      ma_so_hdon: 'MSO',
      so_hdon: '12',
    });

    const result = await sendInvoicePdfForEinvoice(row.id);
    expect(result.ok).toBe(true);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.to).toBe(owner.email);
    expect(mail.attachments).toHaveLength(1);
    expect(mail.attachments[0].filename).toBe('hoa-don-2000007.pdf');
    expect(mail.attachments[0].contentType).toBe('application/pdf');
    expect(Buffer.isBuffer(mail.attachments[0].content)).toBe(true);
    expect(mail.attachments[0].content.subarray(0, 4).toString('utf8')).toBe('%PDF');
    expect(mail.attachments[0].path).toBeUndefined();
    expect(mail.attachments[0].href).toBeUndefined();

    const fresh = await db.query(
      `SELECT email_status, email_sent_at FROM einvoices WHERE id = $1`,
      [row.id],
    );
    expect(fresh.rows[0].email_status).toBe('sent');
    expect(fresh.rows[0].email_sent_at).toBeTruthy();
  });
});
