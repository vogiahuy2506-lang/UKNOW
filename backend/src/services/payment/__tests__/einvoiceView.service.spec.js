import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';

const mockFindByMaSo = jest.fn();
const mockFindByMaTraCuu = jest.fn();
const mockApplyCqt = jest.fn();
const mockFindOwner = jest.fn();

jest.unstable_mockModule('../../../repositories/payment/einvoice.repository.js', () => ({
  findEinvoiceByMaSoHdon: mockFindByMaSo,
  findEinvoiceByMaTraCuu: mockFindByMaTraCuu,
  applyCqtWebhook: mockApplyCqt,
  findOrderInvoiceForOwner: mockFindOwner,
  mapMaTTHDonToStatus: (code) => {
    const n = Number(code);
    if (n === 4) return 'cqt_ok';
    if (n === 6) return 'cqt_rejected';
    return 'issued';
  },
  einvoiceStatusRank: (s) => {
    if (s === 'pending') return 0;
    if (s === 'failed') return 1;
    if (s === 'issued') return 2;
    if (s === 'cqt_ok' || s === 'cqt_rejected') return 3;
    return 0;
  },
}));

const {
  verifyMatbaoWebhookSecret,
  handleMatbaoCqtWebhook,
  getInvoiceForOwner,
} = await import('../einvoiceView.service.js');

const {
  mapMaTTHDonToStatus,
  einvoiceStatusRank,
} = await import('../../../repositories/payment/einvoice.repository.js');

describe('einvoice CQT map', () => {
  it('maps MaTTHDon 4 → cqt_ok, 6 → cqt_rejected, else issued', () => {
    expect(mapMaTTHDonToStatus(4)).toBe('cqt_ok');
    expect(mapMaTTHDonToStatus('4')).toBe('cqt_ok');
    expect(mapMaTTHDonToStatus(6)).toBe('cqt_rejected');
    expect(mapMaTTHDonToStatus(3)).toBe('issued');
    expect(mapMaTTHDonToStatus(5)).toBe('issued');
  });

  it('status rank is forward-only friendly', () => {
    expect(einvoiceStatusRank('pending')).toBeLessThan(einvoiceStatusRank('issued'));
    expect(einvoiceStatusRank('issued')).toBeLessThan(einvoiceStatusRank('cqt_ok'));
    expect(einvoiceStatusRank('cqt_ok')).toBe(einvoiceStatusRank('cqt_rejected'));
  });
});

describe('verifyMatbaoWebhookSecret', () => {
  const prev = process.env.MATBAO_HDDT_WEBHOOK_SECRET;

  afterEach(() => {
    if (prev === undefined) delete process.env.MATBAO_HDDT_WEBHOOK_SECRET;
    else process.env.MATBAO_HDDT_WEBHOOK_SECRET = prev;
  });

  it('rejects empty env or mismatch', () => {
    delete process.env.MATBAO_HDDT_WEBHOOK_SECRET;
    expect(verifyMatbaoWebhookSecret('x')).toBe(false);
    process.env.MATBAO_HDDT_WEBHOOK_SECRET = 'secret-value';
    expect(verifyMatbaoWebhookSecret('wrong')).toBe(false);
    expect(verifyMatbaoWebhookSecret('secret-value')).toBe(true);
  });
});

describe('handleMatbaoCqtWebhook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('matches InvID first', async () => {
    mockFindByMaSo.mockResolvedValueOnce({ id: 1, status: 'issued' });
    mockApplyCqt.mockResolvedValueOnce({ id: 1, status: 'cqt_ok' });
    const r = await handleMatbaoCqtWebhook({
      InvID: 'MSO1',
      Fkey: 'UK123',
      No: 10,
      MCCQT: 'TAX',
      MaTTHDon: 4,
      TenTTHDon: 'ok',
    });
    expect(r.matched).toBe(true);
    expect(mockFindByMaTraCuu).not.toHaveBeenCalled();
    expect(mockApplyCqt).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ maSoHdon: 'MSO1', soHdon: 10, cqtCode: 'TAX', statusCode: 4 }),
    );
  });

  it('falls back to Fkey → ma_tra_cuu', async () => {
    mockFindByMaSo.mockResolvedValueOnce(null);
    mockFindByMaTraCuu.mockResolvedValueOnce({ id: 2, status: 'pending' });
    mockApplyCqt.mockResolvedValueOnce({ id: 2, status: 'issued' });
    const r = await handleMatbaoCqtWebhook({
      InvID: 'NEW',
      Fkey: 'UK999',
      MaTTHDon: 3,
    });
    expect(r.matched).toBe(true);
    expect(mockFindByMaTraCuu).toHaveBeenCalledWith('UK999');
    expect(mockApplyCqt).toHaveBeenCalledWith(
      2,
      expect.objectContaining({ maSoHdon: 'NEW', statusCode: 3 }),
    );
  });

  it('returns matched false when both miss', async () => {
    mockFindByMaSo.mockResolvedValueOnce(null);
    mockFindByMaTraCuu.mockResolvedValueOnce(null);
    const r = await handleMatbaoCqtWebhook({ InvID: 'x', Fkey: 'y' });
    expect(r.matched).toBe(false);
    expect(mockApplyCqt).not.toHaveBeenCalled();
  });
});

describe('getInvoiceForOwner', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns null when not owner / missing', async () => {
    mockFindOwner.mockResolvedValueOnce(null);
    expect(await getInvoiceForOwner(1, 9)).toBeNull();
  });

  it('hasInvoice false when no VAT', async () => {
    mockFindOwner.mockResolvedValueOnce({
      order_code: 1,
      invoice_info: null,
      einvoice_id: null,
    });
    const r = await getInvoiceForOwner(1, 9);
    expect(r).toEqual({ hasInvoice: false, orderCode: '1' });
  });

  it('pending when wantInvoice but no einvoice row yet', async () => {
    mockFindOwner.mockResolvedValueOnce({
      order_code: 55,
      invoice_info: {
        wantInvoice: true,
        buyerType: 'company',
        companyName: 'ABC',
        taxCode: '01',
        email: 'a@b.c',
        net: 100,
        vatAmount: 10,
        gross: 110,
        vatRate: 10,
      },
      einvoice_id: null,
    });
    const r = await getInvoiceForOwner(55, 9);
    expect(r.hasInvoice).toBe(true);
    expect(r.status).toBe('pending');
    expect(r.gross).toBe(110);
    expect(r.buyer.companyName).toBe('ABC');
  });

  it('returns einvoice fields when row exists', async () => {
    mockFindOwner.mockResolvedValueOnce({
      order_code: 55,
      invoice_info: { wantInvoice: true, net: 100, vatAmount: 10, gross: 110, vatRate: 10 },
      einvoice_id: 7,
      einvoice_status: 'cqt_ok',
      ma_so_hdon: 'MSO',
      so_hdon: '12',
      khhdon: 'C26TAT',
      cqt_code: 'TAX1',
      pdf_url: 'https://x/pdf',
      issued_at: '2026-01-01',
    });
    const r = await getInvoiceForOwner(55, 9);
    expect(r).toMatchObject({
      hasInvoice: true,
      status: 'cqt_ok',
      maSoHdon: 'MSO',
      pdfUrl: 'https://x/pdf',
      cqtCode: 'TAX1',
    });
  });
});
