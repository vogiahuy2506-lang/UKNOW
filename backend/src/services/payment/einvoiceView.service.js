/**
 * E-invoice view + Mat Bao CQT webhook handlers (PR3).
 */
import crypto from 'crypto';
import {
  findEinvoiceByMaSoHdon,
  findEinvoiceByMaTraCuu,
  applyCqtWebhook,
  findOrderInvoiceForOwner,
} from '../../repositories/payment/einvoice.repository.js';
import { streamInvoicePdfForOwner } from './matbaoInvoice.service.js';

function parseInvoiceInfo(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return null;
}

export function verifyMatbaoWebhookSecret(provided) {
  const expected = String(process.env.MATBAO_HDDT_WEBHOOK_SECRET || '');
  if (!expected || !provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function buyerFromInvoiceInfo(info) {
  if (!info) return null;
  if (info.buyerType === 'personal') {
    return {
      buyerType: 'personal',
      fullName: info.fullName || null,
      idNumber: info.idNumber || null,
      // Do not echo recipient email — FE already has auth user email.
      phone: info.phone || null,
      address: info.address || null,
    };
  }
  return {
    buyerType: 'company',
    taxCode: info.taxCode || null,
    companyName: info.companyName || null,
    companyAddress: info.companyAddress || info.address || null,
    phone: info.phone || null,
  };
}

function amountsFromInvoiceInfo(info) {
  if (!info) return { net: null, vatAmount: null, gross: null, vatRate: null };
  return {
    net: info.net != null ? Number(info.net) : null,
    vatAmount: info.vatAmount != null ? Number(info.vatAmount) : null,
    gross: info.gross != null ? Number(info.gross) : null,
    vatRate: info.vatRate != null ? Number(info.vatRate) : null,
  };
}

/**
 * Handle Mat Bao CQT webhook body. Always safe to ack 200 after this returns.
 * @returns {{ matched: boolean, row?: object }}
 */
export async function handleMatbaoCqtWebhook(body = {}) {
  const invId = body.InvID ?? body.invId ?? body.MaSoHDon ?? null;
  const fkey = body.Fkey ?? body.fkey ?? body.MaTraCuu ?? null;
  const soHdon = body.No ?? body.SHDon ?? body.soHDon ?? null;
  const cqtCode = body.MCCQT ?? body.mccqt ?? null;
  const statusCode = body.MaTTHDon ?? body.maTTHDon ?? null;
  const statusText = body.TenTTHDon ?? body.tenTTHDon ?? null;

  let row = null;
  if (invId) row = await findEinvoiceByMaSoHdon(String(invId));
  if (!row && fkey) row = await findEinvoiceByMaTraCuu(String(fkey));

  if (!row) {
    console.warn(
      `[MatBaoWebhook] No einvoice for InvID=${invId || '-'} Fkey=${fkey || '-'}`,
    );
    return { matched: false };
  }

  const updated = await applyCqtWebhook(row.id, {
    maSoHdon: invId ? String(invId) : null,
    soHdon,
    cqtCode,
    statusCode,
    statusText,
    rawPayload: body,
  });

  return { matched: true, row: updated || row };
}

/**
 * Owner-facing invoice payload for GET /payments/invoice/:orderCode.
 * Does not expose pdfUrl / provider URLs / raw recipient.
 */
export async function getInvoiceForOwner(orderCode, userId) {
  const row = await findOrderInvoiceForOwner(orderCode, userId);
  if (!row) return null;

  const info = parseInvoiceInfo(row.invoice_info);
  const wantInvoice = Boolean(info?.wantInvoice);
  const amounts = amountsFromInvoiceInfo(info);
  const buyer = buyerFromInvoiceInfo(info);
  const canDownload = Boolean(
    row.einvoice_id && ['issued', 'cqt_ok'].includes(row.einvoice_status),
  );

  if (!row.einvoice_id) {
    if (!wantInvoice) {
      return { hasInvoice: false, orderCode: String(row.order_code) };
    }
    return {
      hasInvoice: true,
      orderCode: String(row.order_code),
      status: 'pending',
      maSoHdon: null,
      soHdon: null,
      khhdon: null,
      cqtCode: null,
      issuedAt: null,
      emailStatus: 'pending',
      emailSentAt: null,
      canDownload: false,
      buyer,
      ...amounts,
    };
  }

  return {
    hasInvoice: true,
    orderCode: String(row.order_code),
    status: row.einvoice_status,
    maSoHdon: row.ma_so_hdon || null,
    soHdon: row.so_hdon != null ? String(row.so_hdon) : null,
    khhdon: row.khhdon || null,
    cqtCode: row.cqt_code || null,
    issuedAt: row.issued_at || null,
    emailStatus: row.email_status || null,
    emailSentAt: row.email_sent_at || null,
    canDownload,
    buyer,
    ...amounts,
  };
}

export { streamInvoicePdfForOwner };
