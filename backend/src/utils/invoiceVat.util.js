/**
 * VAT invoice helpers for checkout (additive VAT on net after discount).
 * BE is source of truth for amounts — never trust FE net/vat/gross/amount.
 */

import { isMatbaoConfigured } from './matbaoHddtClient.util.js';

export const DEFAULT_INVOICE_VAT_RATE = 10;
export const MAX_TAX_CODE_LEN = 14;
export const MAX_ID_NUMBER_LEN = 12;

/** Master switch — OFF until Mat Bao issue path is live (PR2). */
export function isInvoiceVatEnabled() {
  const v = String(process.env.INVOICE_VAT_ENABLED || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** Dispatch/retry gate — not a durable-intent gate. */
export function isMatbaoEinvoiceWorkerEnabled() {
  const v = String(process.env.MATBAO_EINVOICE_WORKER_ENABLED || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function getInvoiceVatRate() {
  const raw = Number(process.env.INVOICE_VAT_RATE);
  if (Number.isFinite(raw) && raw >= 0 && raw <= 100) return Math.round(raw);
  return DEFAULT_INVOICE_VAT_RATE;
}

/**
 * @param {number} net
 * @param {number} [vatRate]
 * @returns {{ net: number, vatAmount: number, gross: number, vatRate: number }}
 */
export function computeVatBreakdown(net, vatRate = getInvoiceVatRate()) {
  const n = Math.round(Number(net) || 0);
  const rate = Math.round(Number(vatRate) || 0);
  const vatAmount = Math.round((n * rate) / 100);
  return { net: n, vatAmount, gross: n + vatAmount, vatRate: rate };
}

function trimStr(v) {
  return String(v ?? '').trim();
}

function isLikelyEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Fail-closed before INSERT/PayOS when client asks for VAT invoice.
 * @throws {{ status: number, message: string, code: string }}
 */
export function assertInvoiceIntakeAllowed(rawInvoiceInfo) {
  const wantInvoice = Boolean(rawInvoiceInfo && rawInvoiceInfo.wantInvoice === true);
  if (!wantInvoice) return;

  if (!isInvoiceVatEnabled()) {
    throw {
      status: 503,
      message: 'Xuất hoá đơn VAT tạm thời không khả dụng',
      code: 'INVOICE_UNAVAILABLE',
    };
  }
  if (!isMatbaoEinvoiceWorkerEnabled() || !isMatbaoConfigured()) {
    throw {
      status: 503,
      message: 'Xuất hoá đơn VAT tạm thời không khả dụng',
      code: 'INVOICE_UNAVAILABLE',
    };
  }
}

/**
 * Validate + normalize client invoiceInfo against authoritative net.
 * Ignores any client-supplied amount/net/vat/gross/vatRate.
 * Recipient email is server-owned via options.accountEmail when provided.
 *
 * @param {object|null|undefined} raw
 * @param {number} netAfterDiscount
 * @param {{ accountEmail?: string|null }} [options]
 * @returns {{ amount: number, invoiceInfo: object|null }}
 */
export function resolveOrderAmountWithInvoice(raw, netAfterDiscount, options = {}) {
  const net = Math.round(Number(netAfterDiscount) || 0);

  // Free / 100% voucher: no VAT invoice (no cash collection).
  if (net <= 0) {
    return { amount: 0, invoiceInfo: null };
  }

  const wantInvoice = Boolean(raw && raw.wantInvoice === true);
  if (wantInvoice) {
    assertInvoiceIntakeAllowed(raw);
  }

  // Feature gate — refuse to charge VAT until e-invoice issuance is enabled.
  if (!isInvoiceVatEnabled()) {
    return { amount: net, invoiceInfo: null };
  }

  if (!wantInvoice) {
    return { amount: net, invoiceInfo: null };
  }

  const buyerType = raw.buyerType === 'personal' ? 'personal' : 'company';
  const accountEmail = trimStr(options.accountEmail);
  const email = accountEmail || trimStr(raw.email);
  if (!email || !isLikelyEmail(email)) {
    throw { status: 400, message: 'Email nhận hoá đơn không hợp lệ' };
  }
  // Prefer server account email; never trust client override when accountEmail is set.
  const recipientEmail = accountEmail && isLikelyEmail(accountEmail) ? accountEmail : email;

  const phone = trimStr(raw.phone) || undefined;
  const address = trimStr(raw.address) || undefined;
  const { vatRate, vatAmount, gross } = computeVatBreakdown(net);

  /** @type {Record<string, unknown>} */
  const invoiceInfo = {
    wantInvoice: true,
    buyerType,
    email: recipientEmail,
    vatRate,
    net,
    vatAmount,
    gross,
  };
  if (phone) invoiceInfo.phone = phone;
  if (address) invoiceInfo.address = address;

  if (buyerType === 'company') {
    const taxCode = trimStr(raw.taxCode);
    const companyName = trimStr(raw.companyName);
    const companyAddress = trimStr(raw.companyAddress) || undefined;
    if (!taxCode) throw { status: 400, message: 'Thiếu mã số thuế' };
    if (taxCode.length > MAX_TAX_CODE_LEN) {
      throw { status: 400, message: `Mã số thuế tối đa ${MAX_TAX_CODE_LEN} ký tự` };
    }
    if (!companyName) throw { status: 400, message: 'Thiếu tên công ty' };
    invoiceInfo.taxCode = taxCode;
    invoiceInfo.companyName = companyName;
    if (companyAddress) invoiceInfo.companyAddress = companyAddress;
  } else {
    const fullName = trimStr(raw.fullName);
    const idNumber = trimStr(raw.idNumber).replace(/\s+/g, '');
    if (!fullName) throw { status: 400, message: 'Thiếu họ tên người mua' };
    if (!idNumber) throw { status: 400, message: 'Thiếu số CCCD/CMND' };
    if (idNumber.length > MAX_ID_NUMBER_LEN) {
      throw { status: 400, message: `CCCD/CMND tối đa ${MAX_ID_NUMBER_LEN} ký tự` };
    }
    invoiceInfo.fullName = fullName;
    invoiceInfo.idNumber = idNumber;
  }

  return { amount: gross, invoiceInfo };
}
