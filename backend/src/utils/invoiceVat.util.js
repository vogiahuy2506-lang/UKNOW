/**
 * VAT invoice helpers for checkout (additive VAT on net after discount).
 * BE is source of truth for amounts — never trust FE net/vat/gross/amount.
 */

import { isMatbaoConfigured } from './matbaoHddtClient.util.js';

/** Mã thuế suất Mắt Bão: -1 = KCT (không chịu thuế). Tài liệu mục DSHHDVu/TSuat. */
export const INVOICE_TAX_RATE_KCT = -1;
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

/**
 * KCT — không chịu thuế. Tiền thuế luôn 0, tổng thanh toán = tiền hàng.
 * Giữ nguyên tên hàm + hình dạng trả về để không phải sửa nơi gọi.
 * @param {number} net
 * @returns {{ net: number, vatAmount: number, gross: number, vatRate: number }}
 */
export function computeVatBreakdown(net) {
  const n = Math.round(Number(net) || 0);
  return { net: n, vatAmount: 0, gross: n, vatRate: INVOICE_TAX_RATE_KCT };
}

function trimStr(v) {
  return String(v ?? '').trim();
}

function isLikelyEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validate required buyer fields without checking feature flags / Mat Bao readiness.
 * Used for both intake validation and saving invoice profile.
 * @throws {{ status: number, message: string }}
 */
export function assertBuyerFieldsValid(rawInvoiceInfo) {
  if (!rawInvoiceInfo || typeof rawInvoiceInfo !== 'object') {
    throw { status: 400, message: 'Vui lòng cung cấp thông tin xuất hoá đơn VAT' };
  }

  if (rawInvoiceInfo.buyerType === 'consumer') return;

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
 * Clean & normalize buyer invoice profile for storage in users.invoice_profile.
 * Strips any money/calculation fields (net, vat, gross, vatRate) and saveProfile flag.
 * @param {object} raw
 * @returns {object}
 */
export function normalizeBuyerInvoiceProfile(raw) {
  assertBuyerFieldsValid(raw);
  const buyerType = raw.buyerType === 'personal' ? 'personal' : 'company';
  const phone = trimStr(raw.phone) || undefined;
  const address = trimStr(raw.address) || undefined;
  const savedAt = new Date().toISOString();

  if (buyerType === 'company') {
    const taxCode = trimStr(raw.taxCode).replace(/\s+/g, '');
    const companyName = trimStr(raw.companyName);
    const companyAddress = trimStr(raw.companyAddress) || undefined;
    return {
      buyerType: 'company',
      taxCode,
      companyName,
      companyAddress,
      phone,
      address,
      savedAt,
    };
  }

  const fullName = trimStr(raw.fullName);
  const idNumber = trimStr(raw.idNumber).replace(/\s+/g, '');
  return {
    buyerType: 'personal',
    fullName,
    idNumber,
    phone,
    address,
    savedAt,
  };
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

  assertBuyerFieldsValid(rawInvoiceInfo);
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

  const isConsumer = raw?.buyerType === 'consumer' || raw?.wantInvoice === false;

  if (!isConsumer) {
    // Validate required intake fields (company or personal) and Mat Bao readiness
    assertInvoiceIntakeAllowed(raw);
  }

  const accountEmail = trimStr(options.accountEmail);
  const email = accountEmail || trimStr(raw?.email);
  if (!email || !isLikelyEmail(email)) {
    throw { status: 400, message: 'Email nhận hoá đơn không hợp lệ' };
  }
  // Prefer server account email; never trust client override when accountEmail is set.
  const recipientEmail = accountEmail && isLikelyEmail(accountEmail) ? accountEmail : email;

  const { vatRate, vatAmount, gross } = computeVatBreakdown(net);

  if (isConsumer) {
    return {
      amount: gross,
      invoiceInfo: {
        wantInvoice: true,
        deliverEmail: false,
        taxType: 'KCT',
        buyerType: 'consumer',
        email: recipientEmail,
        vatRate,
        net,
        vatAmount,
        gross,
      },
    };
  }

  const buyerType = raw.buyerType === 'personal' ? 'personal' : 'company';
  const phone = trimStr(raw.phone) || undefined;
  const address = trimStr(raw.address) || undefined;

  /** @type {Record<string, unknown>} */
  const invoiceInfo = {
    wantInvoice: true,
    taxType: 'KCT',
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
