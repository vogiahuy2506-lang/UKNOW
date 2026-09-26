/**
 * Integration: PR-5 Việc 5.1 (PLAN_VA_LOI_LUONG_TIEN_2026-09-26) — retryFailedEinvoices() không
 * còn tự khoá chính nó bằng cách claim hai lần.
 *
 * Bug gốc: retryFailedEinvoices() gọi claimNextEinvoiceJob() (đặt processing_started_at=NOW())
 * rồi dispatchPreparedEinvoice() bên dưới lại tự claim LẦN HAI bằng claimEinvoiceByIdForIssue() —
 * lần hai luôn thấy row vừa mới "processing" nên trả not_claimable, không bao giờ gọi Mắt Bão,
 * nhưng lần đầu đã làm mới processing_started_at nên hàng không bao giờ bị tính stale ở lượt cron
 * kế — kẹt vĩnh viễn. Sửa: retryFailedEinvoices() chỉ liệt kê id đủ điều kiện (đọc thuần), để
 * dispatchPreparedEinvoice() claim đúng MỘT lần bên trong nó.
 *
 * Mat Bao HTTP is mocked; Postgres is real.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';

const mockCreateInvoices = jest.fn();

jest.unstable_mockModule('../../src/utils/matbaoHddtClient.util.js', () => ({
  isMatbaoConfigured: () => true,
  getMatbaoSeriesConfig: () => ({ khmshdon: '1', khhdon: 'C26TAT' }),
  matbaoCreateInvoices: mockCreateInvoices,
  matbaoDownloadInvoicePdf: jest.fn(),
  matbaoLogin: jest.fn(),
  matbaoListTemplates: jest.fn(),
  parseCreateInvoiceItemResult: (body) => body,
  _resetMatbaoTokenCacheForTests: jest.fn(),
}));

const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser } = await import('./helpers/db.js');
const { retryFailedEinvoices } = await import('../../src/services/payment/matbaoInvoice.service.js');

let prevWorker;

beforeAll(() => {
  prevWorker = process.env.MATBAO_EINVOICE_WORKER_ENABLED;
  process.env.MATBAO_EINVOICE_WORKER_ENABLED = 'true';
});

afterAll(() => {
  if (prevWorker === undefined) delete process.env.MATBAO_EINVOICE_WORKER_ENABLED;
  else process.env.MATBAO_EINVOICE_WORKER_ENABLED = prevWorker;
});

beforeEach(async () => {
  await truncateAll();
  mockCreateInvoices.mockReset();
});

async function insertPaidOrder({ user, orderCode }) {
  const { rows } = await db.query(
    `INSERT INTO orders (order_code, amount, user_email, user_id, status, payment_method, invoice_info)
     VALUES ($1, 299000, $2, $3, 'success', 'payos', $4::jsonb)
     RETURNING *`,
    [
      orderCode,
      user.email,
      user.id,
      JSON.stringify({ wantInvoice: true, buyerType: 'consumer', deliverEmail: false }),
    ],
  );
  return rows[0];
}

// email_status='pending' (KHÔNG dùng 'skipped'): migration 124 có bug thật — khối DROP constraint
// theo mẫu tên `%status%` (dòng 26-44) vô tình xoá luôn einvoices_email_status_check rồi add lại
// bằng định nghĩa CŨ (thiếu 'skipped', xem migrations/124_einvoice_delivery_state.sql:46-58) —
// nếu file einvoice.test.js (replay migration 124 để kiểm idempotent) chạy TRƯỚC trong cùng tiến
// trình jest, DB test sẽ còn constraint bị thu hẹp và INSERT 'skipped' sẽ vỡ CHECK. Ngoài phạm vi
// PR-5 nên không sửa migration 124 ở đây — chỉ tránh giá trị bị ảnh hưởng. Email PDF nền
// (setImmediate sau markEinvoiceIssued) có thể tự thử gửi và tự lỗi (bắt riêng, không văng ra
// test) vì matbaoDownloadInvoicePdf() ở đây không trả dữ liệu thật — vô hại, chỉ là log ồn.
async function insertEinvoice(order, overrides = {}) {
  const maTraCuu = overrides.ma_tra_cuu || `UK${order.order_code}`;
  const { rows } = await db.query(
    `INSERT INTO einvoices (
       order_id, ma_tra_cuu, mtchieu, khmshdon, khhdon,
       status, error_code, processing_started_at, next_attempt_at, attempt_count, email_status
     ) VALUES ($1, $2, $3, '1', 'C26TAT', $4, $5, $6, $7, $8, 'pending')
     RETURNING *`,
    [
      order.id,
      maTraCuu,
      maTraCuu.slice(0, 20),
      overrides.status || 'failed',
      overrides.error_code ?? null,
      overrides.processing_started_at ?? null,
      overrides.next_attempt_at ?? null,
      overrides.attempt_count ?? 0,
    ],
  );
  return rows[0];
}

// retryFailedEinvoices() no-op khi NODE_ENV==='test' (guard cho cron thật ngoài production) —
// suite integration luôn chạy với NODE_ENV=test nên phải đẩy tạm sang giá trị khác để gọi được
// đúng hàm cron đang muốn kiểm, rồi khôi phục ngay sau — không đụng gì khác trong process.
async function runCronForReal(opts) {
  const prevNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'integration-test-einvoice-cron';
  try {
    return await retryFailedEinvoices(opts);
  } finally {
    process.env.NODE_ENV = prevNodeEnv;
  }
}

describe('PR-5 Việc 5.1 — retryFailedEinvoices không tự khoá chính nó bằng double-claim', () => {
  it('failed/timeout quá hạn → Mắt Bão (mock) được gọi ĐÚNG 1 lần, row thành issued; chạy lần 2 không gọi thêm', async () => {
    const user = await createUser({ username: 'einvoice-retry-1' });
    const order = await insertPaidOrder({ user, orderCode: 9100001 });
    await insertEinvoice(order, {
      status: 'failed',
      error_code: 'timeout',
      next_attempt_at: null,
    });

    mockCreateInvoices.mockResolvedValue({
      status: 200,
      body: { errorCode: '200', maSoHdon: 'MSO-1', soHdon: '1', pdfUrl: 'https://x/1.pdf' },
    });

    const first = await runCronForReal({ limit: 20 });
    expect(mockCreateInvoices).toHaveBeenCalledTimes(1);
    expect(first.issued).toBe(1);
    expect(first.scanned).toBe(1);

    const afterFirst = (
      await db.query('SELECT status FROM einvoices WHERE order_id = $1', [order.id])
    ).rows[0];
    expect(afterFirst.status).toBe('issued');

    const second = await runCronForReal({ limit: 20 });
    expect(mockCreateInvoices).toHaveBeenCalledTimes(1);
    expect(second.issued).toBe(0);
    expect(second.scanned).toBe(0);
  });

  it('processing quá hạn lease (row từng bị "claim rồi bỏ rơi" — đúng dạng bug gốc) vẫn được nhặt lại và gọi Mắt Bão đúng 1 lần', async () => {
    const user = await createUser({ username: 'einvoice-retry-2' });
    const order = await insertPaidOrder({ user, orderCode: 9100002 });
    await insertEinvoice(order, {
      status: 'processing',
      processing_started_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
      attempt_count: 1,
    });

    mockCreateInvoices.mockResolvedValue({
      status: 200,
      body: { errorCode: '200', maSoHdon: 'MSO-2', soHdon: '2', pdfUrl: 'https://x/2.pdf' },
    });

    const result = await runCronForReal({ limit: 20 });
    expect(mockCreateInvoices).toHaveBeenCalledTimes(1);
    expect(result.issued).toBe(1);

    const row = (
      await db.query('SELECT status, attempt_count FROM einvoices WHERE order_id = $1', [order.id])
    ).rows[0];
    expect(row.status).toBe('issued');
    // claim đúng 1 lần bên trong dispatchPreparedEinvoice (không còn lần claim thứ hai bị chặn).
    expect(Number(row.attempt_count)).toBe(2);
  });

  it('còn trong lease (processing mới, chưa quá hạn) → KHÔNG bị nhặt, không gọi Mắt Bão', async () => {
    const user = await createUser({ username: 'einvoice-retry-3' });
    const order = await insertPaidOrder({ user, orderCode: 9100003 });
    await insertEinvoice(order, {
      status: 'processing',
      processing_started_at: new Date().toISOString(),
      attempt_count: 1,
    });

    const result = await runCronForReal({ limit: 20 });
    expect(mockCreateInvoices).not.toHaveBeenCalled();
    expect(result.scanned).toBe(0);
  });
});
