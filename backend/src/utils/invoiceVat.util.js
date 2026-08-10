/**
 * VAT invoice helpers for checkout (additive VAT on net after discount).
 * BE is source of truth for amounts — never trust FE net/vat/gross/amount.
 */

export const DEFAULT_INVOICE_VAT_RATE = 10;
export const MAX_TAX_CODE_LEN = 14;
export const MAX_ID_NUMBER_LEN = 12;

/** Master switch — OFF until Mat Bao issue path is live (PR2). */
export function isInvoiceVatEnabled() {
  const v = String(process.env.INVOICE_VAT_ENABLED || '').trim().toLowerCase();
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
 * Validate + normalize client invoiceInfo against authoritative net.
 * Ignores any client-supplied amount/net/vat/gross/vatRate.
 * When INVOICE_VAT_ENABLED is off, always returns net-only (ignores wantInvoice).
 *
 * @param {object|null|undefined} raw
 * @param {number} netAfterDiscount
 * @returns {{ amount: number, invoiceInfo: object|null }}
 */
export function resolveOrderAmountWithInvoice(raw, netAfterDiscount) {
  const net = Math.round(Number(netAfterDiscount) || 0);

  // Free / 100% voucher: no VAT invoice (no cash collection).
  if (net <= 0) {
    return { amount: 0, invoiceInfo: null };
  }

  // Feature gate — refuse to charge VAT until e-invoice issuance is enabled.
  if (!isInvoiceVatEnabled()) {
    return { amount: net, invoiceInfo: null };
  }

  const wantInvoice = Boolean(raw && raw.wantInvoice === true);
  if (!wantInvoice) {
    return { amount: net, invoiceInfo: null };
  }

  const buyerType = raw.buyerType === 'personal' ? 'personal' : 'company';
  const email = trimStr(raw.email);
  if (!email || !isLikelyEmail(email)) {
    throw { status: 400, message: 'Email nhận hoá đơn không hợp lệ' };
  }

  const phone = trimStr(raw.phone) || undefined;
  const address = trimStr(raw.address) || undefined;
  const { vatRate, vatAmount, gross } = computeVatBreakdown(net);

  /** @type {Record<string, unknown>} */
  const invoiceInfo = {
    wantInvoice: true,
    buyerType,
    email,
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
