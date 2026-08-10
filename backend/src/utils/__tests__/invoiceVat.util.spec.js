import {
  computeVatBreakdown,
  resolveOrderAmountWithInvoice,
  DEFAULT_INVOICE_VAT_RATE,
} from '../invoiceVat.util.js';

describe('invoiceVat.util', () => {
  const prevEnabled = process.env.INVOICE_VAT_ENABLED;

  beforeAll(() => {
    process.env.INVOICE_VAT_ENABLED = 'true';
  });

  afterAll(() => {
    if (prevEnabled === undefined) delete process.env.INVOICE_VAT_ENABLED;
    else process.env.INVOICE_VAT_ENABLED = prevEnabled;
  });

  const companyOk = {
    wantInvoice: true,
    buyerType: 'company',
    taxCode: '0312345678',
    companyName: 'Cong Ty ABC',
    email: 'billing@example.com',
  };

  const personalOk = {
    wantInvoice: true,
    buyerType: 'personal',
    fullName: 'Nguyen Van A',
    idNumber: '001099012345',
    email: 'a@example.com',
  };

  test('499000 + 10% = 548900', () => {
    const { net, vatAmount, gross, vatRate } = computeVatBreakdown(499000, 10);
    expect(vatRate).toBe(10);
    expect(net).toBe(499000);
    expect(vatAmount).toBe(49900);
    expect(gross).toBe(548900);
  });

  test('default vat rate is 10', () => {
    expect(DEFAULT_INVOICE_VAT_RATE).toBe(10);
    expect(computeVatBreakdown(1000).vatAmount).toBe(100);
  });

  test('wantInvoice false keeps net and null invoice_info', () => {
    const r = resolveOrderAmountWithInvoice({ wantInvoice: false }, 499000);
    expect(r.amount).toBe(499000);
    expect(r.invoiceInfo).toBeNull();
  });

  test('INVOICE_VAT_ENABLED off ignores wantInvoice', () => {
    process.env.INVOICE_VAT_ENABLED = 'false';
    const r = resolveOrderAmountWithInvoice(companyOk, 499000);
    expect(r.amount).toBe(499000);
    expect(r.invoiceInfo).toBeNull();
    process.env.INVOICE_VAT_ENABLED = 'true';
  });

  test('company missing taxCode → 400', () => {
    expect(() => resolveOrderAmountWithInvoice({
      ...companyOk,
      taxCode: '',
    }, 499000)).toThrow(expect.objectContaining({ status: 400 }));
  });

  test('company ok stores breakdown and ignores forged amount', () => {
    const r = resolveOrderAmountWithInvoice({
      ...companyOk,
      amount: 1,
      net: 1,
      vatAmount: 1,
      gross: 1,
      vatRate: 99,
    }, 499000);
    expect(r.amount).toBe(548900);
    expect(r.invoiceInfo).toMatchObject({
      wantInvoice: true,
      buyerType: 'company',
      taxCode: '0312345678',
      companyName: 'Cong Ty ABC',
      email: 'billing@example.com',
      vatRate: 10,
      net: 499000,
      vatAmount: 49900,
      gross: 548900,
    });
  });

  test('personal missing idNumber → 400', () => {
    expect(() => resolveOrderAmountWithInvoice({
      ...personalOk,
      idNumber: '',
    }, 100000)).toThrow(expect.objectContaining({ status: 400 }));
  });

  test('personal ok', () => {
    const r = resolveOrderAmountWithInvoice(personalOk, 100000);
    expect(r.amount).toBe(110000);
    expect(r.invoiceInfo).toMatchObject({
      buyerType: 'personal',
      fullName: 'Nguyen Van A',
      idNumber: '001099012345',
      net: 100000,
      vatAmount: 10000,
      gross: 110000,
    });
  });

  test('VAT on net after voucher', () => {
    const netAfterVoucher = 400000;
    const r = resolveOrderAmountWithInvoice(companyOk, netAfterVoucher);
    expect(r.invoiceInfo.net).toBe(400000);
    expect(r.invoiceInfo.vatAmount).toBe(40000);
    expect(r.amount).toBe(440000);
  });

  test('net 0 skips invoice even if wantInvoice', () => {
    const r = resolveOrderAmountWithInvoice(companyOk, 0);
    expect(r.amount).toBe(0);
    expect(r.invoiceInfo).toBeNull();
  });
});
