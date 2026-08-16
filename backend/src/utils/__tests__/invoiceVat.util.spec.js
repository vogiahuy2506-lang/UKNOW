import {
  computeVatBreakdown,
  resolveOrderAmountWithInvoice,
  assertBuyerFieldsValid,
  normalizeBuyerInvoiceProfile,
  DEFAULT_INVOICE_VAT_RATE,
} from '../invoiceVat.util.js';

describe('invoiceVat.util', () => {
  const prevEnabled = process.env.INVOICE_VAT_ENABLED;
  const prevWorker = process.env.MATBAO_EINVOICE_WORKER_ENABLED;
  const prevBase = process.env.MATBAO_HDDT_BASE_URL;
  const prevMst = process.env.MATBAO_HDDT_MST;
  const prevUser = process.env.MATBAO_HDDT_USER;
  const prevPass = process.env.MATBAO_HDDT_PASS;
  const prevKh = process.env.MATBAO_HDDT_KHHDON;

  beforeAll(() => {
    process.env.INVOICE_VAT_ENABLED = 'true';
    process.env.MATBAO_EINVOICE_WORKER_ENABLED = 'true';
    process.env.MATBAO_HDDT_BASE_URL = 'https://matbao.example';
    process.env.MATBAO_HDDT_MST = '0312345678';
    process.env.MATBAO_HDDT_USER = 'user';
    process.env.MATBAO_HDDT_PASS = 'pass';
    process.env.MATBAO_HDDT_KHHDON = 'C26TAT';
  });

  afterAll(() => {
    const restore = (key, val) => {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    };
    restore('INVOICE_VAT_ENABLED', prevEnabled);
    restore('MATBAO_EINVOICE_WORKER_ENABLED', prevWorker);
    restore('MATBAO_HDDT_BASE_URL', prevBase);
    restore('MATBAO_HDDT_MST', prevMst);
    restore('MATBAO_HDDT_USER', prevUser);
    restore('MATBAO_HDDT_PASS', prevPass);
    restore('MATBAO_HDDT_KHHDON', prevKh);
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

  test('INVOICE_VAT_ENABLED off keeps net and null invoice_info', () => {
    process.env.INVOICE_VAT_ENABLED = 'false';
    const r = resolveOrderAmountWithInvoice(companyOk, 499000);
    expect(r.amount).toBe(499000);
    expect(r.invoiceInfo).toBeNull();
    process.env.INVOICE_VAT_ENABLED = 'true';
  });

  test('missing or empty invoiceInfo throws 400 when enabled', () => {
    expect(() => resolveOrderAmountWithInvoice(null, 499000)).toThrow(
      expect.objectContaining({ status: 400 }),
    );
    expect(() => resolveOrderAmountWithInvoice({}, 499000)).toThrow(
      expect.objectContaining({ status: 400 }),
    );
  });

  test('accountEmail overrides client email', () => {
    const r = resolveOrderAmountWithInvoice(companyOk, 499000, {
      accountEmail: 'owner@account.com',
    });
    expect(r.invoiceInfo.email).toBe('owner@account.com');
  });

  test('company missing or invalid taxCode → 400', () => {
    expect(() => resolveOrderAmountWithInvoice({
      ...companyOk,
      taxCode: '',
    }, 499000)).toThrow(expect.objectContaining({ status: 400 }));

    expect(() => resolveOrderAmountWithInvoice({
      ...companyOk,
      taxCode: 'ABC1234567',
    }, 499000)).toThrow(expect.objectContaining({ status: 400 }));

    expect(() => resolveOrderAmountWithInvoice({
      ...companyOk,
      taxCode: '12345',
    }, 499000)).toThrow(expect.objectContaining({ status: 400 }));
  });

  test('company valid 10-digit or 13-digit branch taxCode', () => {
    const r1 = resolveOrderAmountWithInvoice({ ...companyOk, taxCode: '0312345678' }, 499000);
    expect(r1.invoiceInfo.taxCode).toBe('0312345678');

    const r2 = resolveOrderAmountWithInvoice({ ...companyOk, taxCode: '0312345678-001' }, 499000);
    expect(r2.invoiceInfo.taxCode).toBe('0312345678-001');
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

  test('personal missing or invalid idNumber → 400', () => {
    expect(() => resolveOrderAmountWithInvoice({
      ...personalOk,
      idNumber: '',
    }, 100000)).toThrow(expect.objectContaining({ status: 400 }));

    expect(() => resolveOrderAmountWithInvoice({
      ...personalOk,
      idNumber: 'ABC123456',
    }, 100000)).toThrow(expect.objectContaining({ status: 400 }));

    expect(() => resolveOrderAmountWithInvoice({
      ...personalOk,
      idNumber: '12345678', // 8 digits (too short)
    }, 100000)).toThrow(expect.objectContaining({ status: 400 }));

    expect(() => resolveOrderAmountWithInvoice({
      ...personalOk,
      idNumber: '1234567890123', // 13 digits (too long)
    }, 100000)).toThrow(expect.objectContaining({ status: 400 }));
  });

  test('personal ok with 9 or 12 digits', () => {
    const r1 = resolveOrderAmountWithInvoice(personalOk, 100000);
    expect(r1.amount).toBe(110000);
    expect(r1.invoiceInfo).toMatchObject({
      buyerType: 'personal',
      fullName: 'Nguyen Van A',
      idNumber: '001099012345',
      net: 100000,
      vatAmount: 10000,
      gross: 110000,
    });

    const r2 = resolveOrderAmountWithInvoice({ ...personalOk, idNumber: '123456789' }, 100000);
    expect(r2.invoiceInfo.idNumber).toBe('123456789');
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

  describe('assertBuyerFieldsValid & normalizeBuyerInvoiceProfile', () => {
    test('works even when INVOICE_VAT_ENABLED and worker are false', () => {
      process.env.INVOICE_VAT_ENABLED = 'false';
      process.env.MATBAO_EINVOICE_WORKER_ENABLED = 'false';

      expect(() => assertBuyerFieldsValid(companyOk)).not.toThrow();

      const profile = normalizeBuyerInvoiceProfile({
        ...companyOk,
        saveProfile: true,
        gross: 548900,
        vatAmount: 49900,
        net: 499000,
        vatRate: 10,
      });

      expect(profile).toMatchObject({
        buyerType: 'company',
        taxCode: '0312345678',
        companyName: 'Cong Ty ABC',
      });
      expect(profile.savedAt).toBeDefined();
      expect(profile.gross).toBeUndefined();
      expect(profile.net).toBeUndefined();
      expect(profile.vatAmount).toBeUndefined();
      expect(profile.vatRate).toBeUndefined();
      expect(profile.saveProfile).toBeUndefined();

      process.env.INVOICE_VAT_ENABLED = 'true';
      process.env.MATBAO_EINVOICE_WORKER_ENABLED = 'true';
    });

    test('personal buyer profile normalization', () => {
      const profile = normalizeBuyerInvoiceProfile({
        ...personalOk,
        phone: '0987654321',
        address: '123 HCM',
      });

      expect(profile).toMatchObject({
        buyerType: 'personal',
        fullName: 'Nguyen Van A',
        idNumber: '001099012345',
        phone: '0987654321',
        address: '123 HCM',
      });
    });

    test('invalid tax code throws 400', () => {
      expect(() => assertBuyerFieldsValid({ buyerType: 'company', taxCode: '123' })).toThrow(
        expect.objectContaining({ status: 400 })
      );
    });

    test('invalid idNumber throws 400', () => {
      expect(() => assertBuyerFieldsValid({ buyerType: 'personal', fullName: 'A', idNumber: '123' })).toThrow(
        expect.objectContaining({ status: 400 })
      );
    });
  });
});
