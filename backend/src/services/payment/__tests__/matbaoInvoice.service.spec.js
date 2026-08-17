import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFindByOrderId = jest.fn();
const mockFindJobWithOrder = jest.fn();
const mockInsertPending = jest.fn();
const mockClaimByIdForIssue = jest.fn();
const mockClaimByIdForEmail = jest.fn();
const mockMarkIssued = jest.fn();
const mockMarkFailed = jest.fn();
const mockCreateInvoices = jest.fn();
const mockDownloadPdf = jest.fn();
const mockSendSystemEmail = jest.fn();
const mockMarkEmailSent = jest.fn();
const mockMarkEmailFailed = jest.fn();

jest.unstable_mockModule('../../../repositories/payment/einvoice.repository.js', () => ({
  findEinvoiceByOrderId: mockFindByOrderId,
  findEinvoiceJobWithOrder: mockFindJobWithOrder,
  insertPendingEinvoice: mockInsertPending,
  markEinvoiceIssued: mockMarkIssued,
  markEinvoiceFailed: mockMarkFailed,
  claimEinvoiceByIdForIssue: mockClaimByIdForIssue,
  claimNextEinvoiceJob: jest.fn(),
  claimEinvoiceByIdForEmail: mockClaimByIdForEmail,
  claimNextEinvoiceEmailJob: jest.fn(),
  markEinvoiceEmailSent: mockMarkEmailSent,
  markEinvoiceEmailFailed: mockMarkEmailFailed,
  listMissingEinvoiceIntents: jest.fn(),
  listRetryableFailedEinvoices: jest.fn(),
  resetEinvoiceForRetry: jest.fn(),
  RETRYABLE_MATBAO_ERROR_CODES: new Set(['315', 'timeout']),
  findEinvoiceByMaTraCuu: jest.fn(),
}));

jest.unstable_mockModule('../../../utils/systemEmail.util.js', () => ({
  sendSystemEmail: mockSendSystemEmail,
  buildInvoiceIssuedEmail: ({ orderCode }) => ({
    subject: `HD ${orderCode}`,
    html: '<p>ok</p>',
    text: 'ok',
  }),
}));

const { parseCreateInvoiceItemResult } = await import('../../../utils/matbaoHddtClient.util.js');

const mockListTemplates = jest.fn();

jest.unstable_mockModule('../../../utils/matbaoHddtClient.util.js', () => ({
  isMatbaoConfigured: () => true,
  getMatbaoSeriesConfig: () => ({ khmshdon: '1', khhdon: 'C26TAT' }),
  matbaoCreateInvoices: mockCreateInvoices,
  matbaoDownloadInvoicePdf: mockDownloadPdf,
  parseCreateInvoiceItemResult,
  matbaoLogin: jest.fn(),
  matbaoListTemplates: mockListTemplates,
  _resetMatbaoTokenCacheForTests: jest.fn(),
}));

process.env.INVOICE_VAT_ENABLED = 'true';
process.env.MATBAO_EINVOICE_WORKER_ENABLED = 'true';

const {
  buildCreateInvoicePayload,
  buildMaTraCuu,
  buildMTChieu,
  formatMatbaoNLap,
  hasInvoiceIntent,
  issueInvoiceForOrder,
  shouldIssueInvoiceForOrder,
  sendInvoicePdfForEinvoice,
  dispatchPreparedEinvoice,
  checkEinvoiceSeries,
} = await import('../matbaoInvoice.service.js');

/** Shape from Postman demo create-invoice success. */
const POSTMAN_SUCCESS_BODY = {
  data: [
    {
      errorCode: 200,
      data: {
        maSoHDon: 'QVh5dWZsYksyS0l4YkFUL3BrZm5BbXk0OUd4OHVIcTZhM0EvOXZydExFQWNmRDVFM2hDV1I0Y1ZkQVVrT213UA==',
        shDon: 0,
        urlDownloadPDF: 'https://demo-api-hddt.matbao.in/download/sample.pdf',
      },
    },
  ],
};

function jobFromOrder(order, overrides = {}) {
  return {
    id: 7,
    status: 'processing',
    order_id: order.id,
    order_code: order.order_code,
    user_id: 1,
    user_email: order.user_email,
    note: order.note,
    invoice_info: order.invoice_info,
    amount: order.invoice_info.gross,
    attempt_count: 1,
    email_attempt_count: 1,
    ma_tra_cuu: `UK${order.order_code}`,
    ma_so_hdon: null,
    pdf_url: null,
    email_status: 'pending',
    ...overrides,
  };
}

describe('matbaoInvoice.service', () => {
  const order = {
    id: 42,
    order_code: 172300000000001,
    note: 'custom_self_serve',
    user_email: 'buyer@example.com',
    invoice_info: {
      wantInvoice: true,
      taxType: 'KCT',
      buyerType: 'company',
      taxCode: '0312345678',
      companyName: 'Cong Ty ABC',
      companyAddress: 'HCM',
      email: 'a@b.com',
      vatRate: -1,
      net: 499000,
      vatAmount: 0,
      gross: 499000,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.INVOICE_VAT_ENABLED = 'true';
    process.env.MATBAO_EINVOICE_WORKER_ENABLED = 'true';
    mockSendSystemEmail.mockResolvedValue({ messageId: 'm1' });
    mockMarkEmailSent.mockResolvedValue({});
    mockDownloadPdf.mockResolvedValue({
      ok: true,
      buffer: Buffer.from('%PDF-1.4'),
      contentType: 'application/pdf',
    });
  });

  it('MaTraCuu / MTChieu from order_code within limits', () => {
    const ma = buildMaTraCuu(order.order_code);
    const mt = buildMTChieu(order.order_code);
    expect(ma).toBe(`UK${order.order_code}`);
    expect(mt.length).toBeLessThanOrEqual(20);
    expect(mt).toBe(ma.slice(0, 20));
  });

  it('NLap is VN datetime YYYY-MM-DDTHH:mm:ss (not UTC toISOString)', () => {
    const { payload } = buildCreateInvoicePayload(order, order.invoice_info);
    expect(payload[0].NLap).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    expect(payload[0].NLap).toBe(formatMatbaoNLap());
    expect(payload[0].NLap).not.toContain('Z');
  });

  it('formatMatbaoNLap uses Asia/Ho_Chi_Minh datetime around UTC day boundary', () => {
    expect(formatMatbaoNLap(new Date('2026-08-10T01:30:00.000Z'))).toBe('2026-08-10T08:30:00');
    expect(formatMatbaoNLap(new Date('2026-08-09T18:00:00.000Z'))).toBe('2026-08-10T01:00:00');
    expect(formatMatbaoNLap(new Date('2026-08-09T16:30:00.000Z'))).toBe('2026-08-09T23:30:00');
  });

  it('payload line totals match net/vat/gross with TSuat=-1 (KCT)', () => {
    const { payload } = buildCreateInvoicePayload(order, order.invoice_info);
    const inv = payload[0];
    const line = inv.DSHHDVu[0];
    expect(line.TSuat).toBe(-1);
    expect(line.DGia).toBe(499000);
    expect(line.TThue).toBe(0);
    expect(line.TgTien).toBe(499000);
    expect(inv.TgThTien).toBe(499000);
    expect(inv.TTCKTMai).toBe(0);
    expect(inv.TGTKhac).toBe(0);
    expect(inv.TgTThue).toBe(0);
    expect(inv.TgTTTBSo).toBe(499000);
    expect(inv.LoaiHDon).toBe(1);
    expect(inv.NMua_MST).toBe('0312345678');
    expect(inv.TgTTTBChu).toMatch(/đồng$/i);
  });

  it('personal buyer sets NMua_CCCDan', () => {
    const info = {
      ...order.invoice_info,
      buyerType: 'personal',
      fullName: 'Nguyen Van A',
      idNumber: '001099012345',
      taxCode: undefined,
      companyName: undefined,
    };
    const { payload } = buildCreateInvoicePayload(order, info);
    expect(payload[0].NMua_Ten).toBe('Nguyen Van A');
    expect(payload[0].NMua_CCCDan).toBe('001099012345');
    expect(payload[0].NMua_MST).toBe('');
  });

  it('skips when feature flag off', () => {
    process.env.INVOICE_VAT_ENABLED = 'false';
    expect(shouldIssueInvoiceForOrder(order)).toBe(false);
  });

  it('skips when worker flag off', () => {
    process.env.MATBAO_EINVOICE_WORKER_ENABLED = 'false';
    expect(shouldIssueInvoiceForOrder(order)).toBe(false);
  });

  it('marks issued from nested Postman success body (maSoHDon + shDon + pdf)', async () => {
    mockFindByOrderId.mockResolvedValueOnce({ id: 7, status: 'pending' });
    mockClaimByIdForIssue.mockResolvedValueOnce({ id: 7, status: 'processing' });
    mockFindJobWithOrder.mockResolvedValueOnce(jobFromOrder(order));
    mockCreateInvoices.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: POSTMAN_SUCCESS_BODY,
    });
    mockMarkIssued.mockResolvedValueOnce({ id: 7, status: 'issued' });

    const result = await issueInvoiceForOrder(order);
    expect(result.ok).toBe(true);
    expect(mockClaimByIdForIssue).toHaveBeenCalledWith(7);
    expect(mockMarkIssued).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        maSoHdon: POSTMAN_SUCCESS_BODY.data[0].data.maSoHDon,
        soHdon: '0',
        pdfUrl: POSTMAN_SUCCESS_BODY.data[0].data.urlDownloadPDF,
      }),
    );
    expect(mockMarkFailed).not.toHaveBeenCalled();
  });

  it('treats 304 as already issued', async () => {
    mockFindByOrderId.mockResolvedValueOnce({ id: 7, status: 'pending' });
    mockClaimByIdForIssue.mockResolvedValueOnce({ id: 7, status: 'processing' });
    mockFindJobWithOrder.mockResolvedValueOnce(jobFromOrder(order));
    mockCreateInvoices.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: { data: [{ errorCode: 304, errorMessage: 'duplicate', data: {} }] },
    });
    mockMarkIssued.mockResolvedValueOnce({ id: 7, status: 'issued' });

    const result = await issueInvoiceForOrder(order);
    expect(result.ok).toBe(true);
    expect(result.errorCode).toBe('304');
  });

  it('marks failed on API error without throwing', async () => {
    mockFindByOrderId.mockResolvedValueOnce({ id: 9, status: 'pending' });
    mockClaimByIdForIssue.mockResolvedValueOnce({ id: 9, status: 'processing' });
    mockFindJobWithOrder.mockResolvedValueOnce(jobFromOrder(order, { id: 9 }));
    mockCreateInvoices.mockResolvedValueOnce({
      ok: false,
      status: 400,
      body: { data: [{ errorCode: 327, errorMessage: 'het so' }] },
    });
    mockMarkFailed.mockResolvedValueOnce({ id: 9, status: 'failed' });

    const result = await issueInvoiceForOrder(order);
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('327');
    expect(mockMarkFailed).toHaveBeenCalled();
  });

  it('skips create when claim loses race (already issued)', async () => {
    mockClaimByIdForIssue.mockResolvedValueOnce(null);
    mockFindJobWithOrder.mockResolvedValueOnce(jobFromOrder(order, { id: 1, status: 'issued' }));
    const result = await dispatchPreparedEinvoice(1);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('already_issued');
    expect(mockCreateInvoices).not.toHaveBeenCalled();
  });

  it('skips create when another worker holds claim', async () => {
    mockClaimByIdForIssue.mockResolvedValueOnce(null);
    mockFindJobWithOrder.mockResolvedValueOnce(jobFromOrder(order, { status: 'processing' }));
    const result = await dispatchPreparedEinvoice(7);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('not_claimable');
    expect(mockCreateInvoices).not.toHaveBeenCalled();
  });

  it('emails PDF to orders.user_email after claim', async () => {
    mockClaimByIdForEmail.mockResolvedValueOnce({ id: 7, email_status: 'sending' });
    mockFindJobWithOrder.mockResolvedValueOnce(jobFromOrder(order, {
      status: 'issued',
      ma_so_hdon: 'MSO',
      so_hdon: '1',
      khhdon: 'C26TAT',
      email_status: 'sending',
      email_attempt_count: 1,
    }));

    const result = await sendInvoicePdfForEinvoice(7);
    expect(result.ok).toBe(true);
    expect(mockClaimByIdForEmail).toHaveBeenCalledWith(7);
    expect(mockSendSystemEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: order.user_email,
        attachments: expect.arrayContaining([
          expect.objectContaining({ filename: expect.stringContaining('hoa-don') }),
        ]),
      }),
    );
    expect(mockMarkEmailSent).toHaveBeenCalledWith(7);
  });

  it('sets email backoff on SMTP failure', async () => {
    mockClaimByIdForEmail.mockResolvedValueOnce({ id: 7, email_status: 'sending' });
    mockFindJobWithOrder.mockResolvedValueOnce(jobFromOrder(order, {
      status: 'issued',
      email_status: 'sending',
      email_attempt_count: 2,
    }));
    mockSendSystemEmail.mockRejectedValueOnce(new Error('smtp down'));

    const result = await sendInvoicePdfForEinvoice(7);
    expect(result.ok).toBe(false);
    expect(mockMarkEmailFailed).toHaveBeenCalledWith(
      7,
      'smtp down',
      expect.objectContaining({ nextAttemptAt: expect.any(String) }),
    );
  });

  it('skips email when claim loses race', async () => {
    mockClaimByIdForEmail.mockResolvedValueOnce(null);
    mockFindJobWithOrder.mockResolvedValueOnce(jobFromOrder(order, {
      status: 'issued',
      email_status: 'sending',
    }));
    const result = await sendInvoicePdfForEinvoice(7);
    expect(result.skipped).toBe(true);
    expect(mockSendSystemEmail).not.toHaveBeenCalled();
  });

  describe('checkEinvoiceSeries', () => {
    const prevEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = prevEnv;
    });

    it('returns disabled in test environment', async () => {
      process.env.NODE_ENV = 'test';
      const r = await checkEinvoiceSeries();
      expect(r.disabled).toBe(true);
    });

    it('warns when remaining count is low (<= threshold)', async () => {
      process.env.NODE_ENV = 'production';
      mockListTemplates.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: {
          data: [
            { khmshDon: '1', khhDon: 'C26TAT', cLai: 25 },
          ],
        },
      });

      const r = await checkEinvoiceSeries({ currentYear: 2026, threshold: 50 });
      expect(r.status).toBe('warning');
      expect(r.cLai).toBe(25);
      expect(r.isLow).toBe(true);
      expect(r.yearMismatch).toBe(false);
    });

    it('healthy when count is high and year matches', async () => {
      process.env.NODE_ENV = 'production';
      mockListTemplates.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: {
          data: [
            { khmshDon: '1', khhDon: 'C26TAT', cLai: 100 },
          ],
        },
      });

      const r = await checkEinvoiceSeries({ currentYear: 2026, threshold: 50 });
      expect(r.status).toBe('success');
      expect(r.isLow).toBe(false);
      expect(r.yearMismatch).toBe(false);
      expect(r.cLai).toBe(100);
    });

    it('warns when series year does not match current year (e.g. year 2027 vs C26TAT)', async () => {
      process.env.NODE_ENV = 'production';
      mockListTemplates.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: {
          data: [
            { khmshDon: '1', khhDon: 'C26TAT', cLai: 100 },
          ],
        },
      });

      const r = await checkEinvoiceSeries({ currentYear: 2027, threshold: 50 });
      expect(r.status).toBe('warning');
      expect(r.yearMismatch).toBe(true);
      expect(r.isLow).toBe(false);
    });

    it('warns when configured series not found in templates', async () => {
      process.env.NODE_ENV = 'production';
      mockListTemplates.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: {
          data: [
            { khmshDon: '1', khhDon: 'C26OTHER', cLai: 100 },
          ],
        },
      });

      const r = await checkEinvoiceSeries({ currentYear: 2026 });
      expect(r.status).toBe('warning');
      expect(r.notFound).toBe(true);
    });

    it('returns error when Mat Bao API fails (!res.ok)', async () => {
      process.env.NODE_ENV = 'production';
      mockListTemplates.mockResolvedValueOnce({
        ok: false,
        status: 502,
        body: { message: 'Bad gateway' },
      });

      const r = await checkEinvoiceSeries({ currentYear: 2026 });
      expect(r.status).toBe('error');
      expect(r.cLai).toBeNull();
      expect(r.error).toBe('Bad gateway');
    });
  });

  describe('KCT and backward compatibility (PR-D)', () => {
    it('T1: hasInvoiceIntent returns true with { wantInvoice: true, vatAmount: 0 }', () => {
      const kctOrder = {
        id: 101,
        order_code: 172300000000101,
        invoice_info: {
          wantInvoice: true,
          vatAmount: 0,
          net: 299000,
          gross: 299000,
        },
      };
      expect(hasInvoiceIntent(kctOrder)).toBe(true);
      expect(shouldIssueInvoiceForOrder(kctOrder)).toBe(true);
    });

    it('T2: hasInvoiceIntent returns true with legacy order { vatAmount: 49900 } without wantInvoice', () => {
      const legacyOrder = {
        id: 102,
        order_code: 172300000000102,
        invoice_info: {
          vatAmount: 49900,
          net: 499000,
          gross: 548900,
          vatRate: 10,
        },
      };
      expect(hasInvoiceIntent(legacyOrder)).toBe(true);
      expect(shouldIssueInvoiceForOrder(legacyOrder)).toBe(true);
    });

    it('T3: buildCreateInvoicePayload with info.vatRate = 10 (legacy order) produces TSuat: 10 and TThue: 49900', () => {
      const legacyOrder = {
        id: 103,
        order_code: 172300000000103,
        note: 'custom_self_serve',
        user_email: 'legacy@example.com',
      };
      const legacyInfo = {
        buyerType: 'company',
        taxCode: '0312345678',
        companyName: 'Legacy Corp',
        vatRate: 10,
        net: 499000,
        vatAmount: 49900,
        gross: 548900,
      };
      const { payload } = buildCreateInvoicePayload(legacyOrder, legacyInfo);
      const inv = payload[0];
      const line = inv.DSHHDVu[0];
      expect(line.TSuat).toBe(10);
      expect(line.TThue).toBe(49900);
      expect(line.TgTien).toBe(548900);
      expect(inv.TgTThue).toBe(49900);
      expect(inv.TgTTTBSo).toBe(548900);
    });
  });
});
