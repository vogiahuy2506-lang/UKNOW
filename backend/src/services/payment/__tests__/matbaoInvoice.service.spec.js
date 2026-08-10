import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFindByOrderId = jest.fn();
const mockInsertPending = jest.fn();
const mockMarkIssued = jest.fn();
const mockMarkFailed = jest.fn();
const mockCreateInvoices = jest.fn();

jest.unstable_mockModule('../../../repositories/payment/einvoice.repository.js', () => ({
  findEinvoiceByOrderId: mockFindByOrderId,
  insertPendingEinvoice: mockInsertPending,
  markEinvoiceIssued: mockMarkIssued,
  markEinvoiceFailed: mockMarkFailed,
  listRetryableFailedEinvoices: jest.fn(),
  resetEinvoiceForRetry: jest.fn(),
  RETRYABLE_MATBAO_ERROR_CODES: new Set(['315', 'timeout']),
  findEinvoiceByMaTraCuu: jest.fn(),
}));

const { parseCreateInvoiceItemResult } = await import('../../../utils/matbaoHddtClient.util.js');

jest.unstable_mockModule('../../../utils/matbaoHddtClient.util.js', () => ({
  isMatbaoConfigured: () => true,
  getMatbaoSeriesConfig: () => ({ khmshdon: '1', khhdon: 'C26TAT' }),
  matbaoCreateInvoices: mockCreateInvoices,
  // Use real parser so nested Postman shape is exercised end-to-end.
  parseCreateInvoiceItemResult,
  matbaoLogin: jest.fn(),
  matbaoListTemplates: jest.fn(),
  _resetMatbaoTokenCacheForTests: jest.fn(),
}));

process.env.INVOICE_VAT_ENABLED = 'true';

const {
  buildCreateInvoicePayload,
  buildMaTraCuu,
  buildMTChieu,
  formatMatbaoNLap,
  issueInvoiceForOrder,
  shouldIssueInvoiceForOrder,
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

describe('matbaoInvoice.service', () => {
  const order = {
    id: 42,
    order_code: 172300000000001,
    note: 'custom_self_serve',
    invoice_info: {
      wantInvoice: true,
      buyerType: 'company',
      taxCode: '0312345678',
      companyName: 'Cong Ty ABC',
      companyAddress: 'HCM',
      email: 'a@b.com',
      vatRate: 10,
      net: 499000,
      vatAmount: 49900,
      gross: 548900,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.INVOICE_VAT_ENABLED = 'true';
  });

  it('MaTraCuu / MTChieu from order_code within limits', () => {
    const ma = buildMaTraCuu(order.order_code);
    const mt = buildMTChieu(order.order_code);
    expect(ma).toBe(`UK${order.order_code}`);
    expect(mt.length).toBeLessThanOrEqual(20);
    expect(mt).toBe(ma.slice(0, 20));
  });

  it('NLap is VN calendar date T00:00:00 (not UTC toISOString)', () => {
    const { payload } = buildCreateInvoicePayload(order, order.invoice_info);
    expect(payload[0].NLap).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00$/);
    expect(payload[0].NLap).toBe(formatMatbaoNLap());
    // UTC midnight trick must not leak a Z suffix or shifted day via toISOString
    expect(payload[0].NLap).not.toContain('Z');
  });

  it('formatMatbaoNLap uses Asia/Ho_Chi_Minh around UTC day boundary', () => {
    // 2026-08-10 01:30 UTC = 08:30 VN same calendar day
    expect(formatMatbaoNLap(new Date('2026-08-10T01:30:00.000Z'))).toBe('2026-08-10T00:00:00');
    // 2026-08-09 18:00 UTC = 2026-08-10 01:00 VN → must be Aug 10 (not Aug 9)
    expect(formatMatbaoNLap(new Date('2026-08-09T18:00:00.000Z'))).toBe('2026-08-10T00:00:00');
    // 2026-08-09 16:30 UTC = 2026-08-09 23:30 VN → still Aug 9
    expect(formatMatbaoNLap(new Date('2026-08-09T16:30:00.000Z'))).toBe('2026-08-09T00:00:00');
  });

  it('payload line totals match net/vat/gross with TSuat=10', () => {
    const { payload } = buildCreateInvoicePayload(order, order.invoice_info);
    const inv = payload[0];
    const line = inv.DSHHDVu[0];
    expect(line.TSuat).toBe(10);
    expect(line.DGia).toBe(499000);
    expect(line.TThue).toBe(49900);
    expect(line.TgTien).toBe(548900);
    expect(inv.TgThTien).toBe(499000);
    expect(inv.TgTThue).toBe(49900);
    expect(inv.TgTTTBSo).toBe(548900);
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

  it('marks issued from nested Postman success body (maSoHDon + shDon + pdf)', async () => {
    mockFindByOrderId.mockResolvedValueOnce(null);
    mockInsertPending.mockResolvedValueOnce({ id: 7, status: 'pending' });
    mockCreateInvoices.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: POSTMAN_SUCCESS_BODY,
    });
    mockMarkIssued.mockResolvedValueOnce({ id: 7, status: 'issued' });

    const result = await issueInvoiceForOrder(order);
    expect(result.ok).toBe(true);
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
    mockFindByOrderId.mockResolvedValueOnce(null);
    mockInsertPending.mockResolvedValueOnce({ id: 9, status: 'pending' });
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

  it('does not double-issue when already issued', async () => {
    mockFindByOrderId.mockResolvedValueOnce({ id: 1, status: 'issued' });
    const result = await issueInvoiceForOrder(order);
    expect(result.skipped).toBe(true);
    expect(mockCreateInvoices).not.toHaveBeenCalled();
  });
});
