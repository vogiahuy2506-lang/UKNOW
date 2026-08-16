/**
 * VAT invoice helpers for checkout (additive VAT on net after discount).
 * BE is source of truth for amounts — never trust FE net/vat/gross/amount.
 */

import { isMatbaoConfigured } from './matbaoHddtClient.util.js';

export const DEFAULT_INVOICE_VAT_RATE = 10;
export const MAX_TAX_CODE_LEN = 14;
export const MAX_ID_NUMBER_LEN = 12;
export const TAX_CODE_REGEX = /^\d{10}(-\d{3})?$/;
export const ID_NUMBER_REGEX = /^\d{9,12}$/;

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
 * Fail-closed before INSERT/PayOS on missing/invalid buyer data or unconfigured Mat Bao.
 * @throws {{ status: number, message: string, code: string }}
 */
export function assertInvoiceIntakeAllowed(rawInvoiceInfo) {
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

  if (!rawInvoiceInfo || typeof rawInvoiceInfo !== 'object') {
    throw { status: 400, message: 'Vui lòng cung cấp thông tin xuất hoá đơn VAT' };
  }

  const buyerType = rawInvoiceInfo.buyerType === 'personal' ? 'personal' : 'company';
  if (buyerType === 'company') {
    const taxCode = trimStr(rawInvoiceInfo.taxCode).replace(/\s+/g, '');
    const companyName = trimStr(rawInvoiceInfo.companyName);
    if (!taxCode) throw { status: 400, message: 'Thiếu mã số thuế' };
    if (!TAX_CODE_REGEX.test(taxCode)) {
      throw { status: 400, message: 'Mã số thuế không hợp lệ (10 số hoặc 13 số dạng xxxxxxxxxx-xxx)' };
    }
    if (!companyName) throw { status: 400, message: 'Thiếu tên công ty' };
  } else {
    const fullName = trimStr(rawInvoiceInfo.fullName);
    const idNumber = trimStr(rawInvoiceInfo.idNumber).replace(/\s+/g, '');
    if (!fullName) throw { status: 400, message: 'Thiếu họ tên người mua' };
    if (!idNumber) throw { status: 400, message: 'Thiếu số CCCD/CMND' };
    if (!ID_NUMBER_REGEX.test(idNumber)) {
      throw { status: 400, message: 'Số CCCD/CMND không hợp lệ (gồm 9 đến 12 chữ số)' };
    }
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

  // Feature gate — refuse to charge VAT until e-invoice issuance is enabled.
  if (!isInvoiceVatEnabled()) {
    return { amount: net, invoiceInfo: null };
  }

  // Validate required intake fields (company or personal) and Mat Bao readiness
  assertInvoiceIntakeAllowed(raw);

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
    const taxCode = trimStr(raw.taxCode).replace(/\s+/g, '');
    const companyName = trimStr(raw.companyName);
    const companyAddress = trimStr(raw.companyAddress) || undefined;
    invoiceInfo.taxCode = taxCode;
    invoiceInfo.companyName = companyName;
    if (companyAddress) invoiceInfo.companyAddress = companyAddress;
  } else {
    const fullName = trimStr(raw.fullName);
    const idNumber = trimStr(raw.idNumber).replace(/\s+/g, '');
    invoiceInfo.fullName = fullName;
    invoiceInfo.idNumber = idNumber;
  }

  return { amount: gross, invoiceInfo };
}
