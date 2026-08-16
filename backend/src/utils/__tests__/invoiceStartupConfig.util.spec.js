import { describe, expect, it } from '@jest/globals';
import { validateInvoiceEnv } from '../invoiceStartupConfig.util.js';

describe('invoice startup configuration', () => {
  it('allows startup when INVOICE_VAT_ENABLED is off', () => {
    expect(() => validateInvoiceEnv({
      INVOICE_VAT_ENABLED: 'false',
    })).not.toThrow();
  });

  it('rejects startup when INVOICE_VAT_ENABLED is on but worker is off', () => {
    expect(() => validateInvoiceEnv({
      INVOICE_VAT_ENABLED: 'true',
      MATBAO_EINVOICE_WORKER_ENABLED: 'false',
      MATBAO_HDDT_BASE_URL: 'https://demo.matbao.in',
      MATBAO_HDDT_MST: '0312345678',
      MATBAO_HDDT_USER: 'user',
      MATBAO_HDDT_PASS: 'pass',
      MATBAO_HDDT_KHHDON: 'C26TAT',
    })).toThrow('MATBAO_EINVOICE_WORKER_ENABLED');
  });

  it('rejects startup when INVOICE_VAT_ENABLED is on but credentials missing', () => {
    expect(() => validateInvoiceEnv({
      INVOICE_VAT_ENABLED: 'true',
      MATBAO_EINVOICE_WORKER_ENABLED: 'true',
      MATBAO_HDDT_BASE_URL: 'https://demo.matbao.in',
      MATBAO_HDDT_MST: '',
      MATBAO_HDDT_USER: 'user',
      MATBAO_HDDT_PASS: 'pass',
      MATBAO_HDDT_KHHDON: '',
    })).toThrow('MATBAO_HDDT_MST, MATBAO_HDDT_KHHDON');
  });

  it('passes startup when INVOICE_VAT_ENABLED is on and all credentials present', () => {
    expect(() => validateInvoiceEnv({
      INVOICE_VAT_ENABLED: 'true',
      MATBAO_EINVOICE_WORKER_ENABLED: 'true',
      MATBAO_HDDT_BASE_URL: 'https://demo.matbao.in',
      MATBAO_HDDT_MST: '0312345678',
      MATBAO_HDDT_USER: 'user',
      MATBAO_HDDT_PASS: 'pass',
      MATBAO_HDDT_KHHDON: 'C26TAT',
    })).not.toThrow();
  });
});
