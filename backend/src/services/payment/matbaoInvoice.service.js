/**
 * Issue VAT e-invoices via Mat Bao after paid orders (fire-and-forget, idempotent).
 */
import {
  findEinvoiceByOrderId,
  insertPendingEinvoice,
  markEinvoiceIssued,
  markEinvoiceFailed,
  listRetryableFailedEinvoices,
  resetEinvoiceForRetry,
  RETRYABLE_MATBAO_ERROR_CODES,
} from '../../repositories/payment/einvoice.repository.js';
import {
  isMatbaoConfigured,
  getMatbaoSeriesConfig,
  matbaoCreateInvoices,
  parseCreateInvoiceItemResult,
} from '../../utils/matbaoHddtClient.util.js';
import { isInvoiceVatEnabled } from '../../utils/invoiceVat.util.js';
import { vndAmountToVietnameseWords } from '../../utils/vndAmountWords.util.js';

export const EINVOICE_RECONCILE_JOB_CODE = 'einvoice_matbao_retry';
const HANOI_TZ = 'Asia/Ho_Chi_Minh';

export function buildMaTraCuu(orderCode) {
  return `UK${orderCode}`;
}

export function buildMTChieu(orderCode) {
  return buildMaTraCuu(orderCode).slice(0, 20);
}

/**
 * Invoice issue date for Mat Bao NLap — calendar date in Asia/Ho_Chi_Minh.
 * Never use Date#toISOString() (UTC) or setHours on a server in UTC.
 * @param {Date} [now]
 * @returns {string} `YYYY-MM-DDT00:00:00`
 */
export function formatMatbaoNLap(now = new Date()) {
  // Ngày + GIỜ VN thật (không ép 00:00): Mắt Bão bắt NLap >= NLap hóa đơn liền kề
  // trước cùng ký hiệu (lỗi 333) → dùng giờ hiện tại để NLap luôn tăng dần.
  // hourCycle 'h23' để nửa đêm ra "00" (không phải "24"). Ngày pháp lý vẫn là ngày VN.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: HANOI_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}

function parseInvoiceInfo(order) {
  let info = order?.invoice_info;
  if (typeof info === 'string') {
    try { info = JSON.parse(info); } catch { info = null; }
  }
  return info && typeof info === 'object' ? info : null;
}

export function shouldIssueInvoiceForOrder(order) {
  if (!isInvoiceVatEnabled()) return false;
  if (!isMatbaoConfigured()) return false;
  const info = parseInvoiceInfo(order);
  return Boolean(info?.wantInvoice && order?.id && order?.order_code);
}

/**
 * Schedule Mat Bao HTTP AFTER the PayOS fulfill transaction commits.
 * Safe to call multiple times — issueInvoiceForOrder is idempotent.
 */
export function scheduleIssueInvoiceAfterCommit(order) {
  if (!shouldIssueInvoiceForOrder(order)) return;
  const snapshot = {
    id: order.id,
    order_code: order.order_code,
    invoice_info: order.invoice_info,
    amount: order.amount,
    note: order.note,
    user_email: order.user_email,
  };
  setImmediate(() => {
    issueInvoiceForOrder(snapshot).catch((err) => {
      console.error(
        `[MatBaoInvoice] issue failed order=${snapshot.order_code}:`,
        err?.message || err,
      );
    });
  });
}

function lineDescription(order) {
  if (order?.note === 'topup') return 'Mua thêm hạn mức Founder AI';
  if (order?.note === 'custom_self_serve') return 'Gói tự chọn Founder AI';
  return 'Gói dịch vụ Founder AI';
}

/**
 * Build create-invoice array payload (1 invoice).
 */
export function buildCreateInvoicePayload(order, info) {
  const { khmshdon, khhdon } = getMatbaoSeriesConfig();
  const net = Math.round(Number(info.net));
  const vatAmount = Math.round(Number(info.vatAmount));
  const gross = Math.round(Number(info.gross));
  const vatRate = Math.round(Number(info.vatRate) || 10);
  const maTraCuu = buildMaTraCuu(order.order_code);
  const mtchieu = buildMTChieu(order.order_code);

  const isCompany = info.buyerType !== 'personal';
  const buyer = {
    NMua_Ten: isCompany ? info.companyName : info.fullName,
    NMua_MST: isCompany ? (info.taxCode || '') : '',
    NMua_DChi: isCompany
      ? (info.companyAddress || info.address || '')
      : (info.address || ''),
    NMua_DCTDTu: info.email || '',
    NMua_SDThoai: info.phone || '',
  };
  if (!isCompany && info.idNumber) {
    buyer.NMua_CCCDan = String(info.idNumber).slice(0, 12);
  }

  const invoice = {
    KHMSHDon: khmshdon,
    KHHDon: khhdon,
    MaTraCuu: maTraCuu,
    MTChieu: mtchieu,
    NLap: formatMatbaoNLap(),
    LoaiHDon: 1,
    TCHDon: 0,
    DVTTe: 704,
    TGia: 1,
    HTTToan: 'CK',
    ...buyer,
    DSHHDVu: [
      {
        TChat: 1,
        STT: 1,
        THHDVu: lineDescription(order),
        DVTinh: 'Gói',
        SLuong: 1,
        DGia: net,
        ThTienChuaCK: net,
        TLCKhau: 0,
        STCKhau: 0,
        ThTien: net,
        TSuat: vatRate,
        TThue: vatAmount,
        TgTien: gross,
      },
    ],
    TgThTien: net,
    TgTThue: vatAmount,
    TgTTTBSo: gross,
    TgTTTBChu: vndAmountToVietnameseWords(gross),
  };

  return { maTraCuu, mtchieu, khmshdon, khhdon, payload: [invoice] };
}

/**
 * Issue (or re-issue failed) invoice for a paid order snapshot.
 */
export async function issueInvoiceForOrder(order) {
  if (!shouldIssueInvoiceForOrder(order)) {
    return { skipped: true };
  }

  const info = parseInvoiceInfo(order);
  if (!info?.wantInvoice) return { skipped: true };

  const built = buildCreateInvoicePayload(order, info);
  let row = await findEinvoiceByOrderId(order.id);

  if (row && ['issued', 'cqt_ok'].includes(row.status)) {
    return { skipped: true, reason: 'already_issued', row };
  }

  if (!row) {
    row = await insertPendingEinvoice({
      orderId: order.id,
      maTraCuu: built.maTraCuu,
      mtchieu: built.mtchieu,
      khmshdon: built.khmshdon,
      khhdon: built.khhdon,
      requestPayload: built.payload,
    });
    if (!row) {
      row = await findEinvoiceByOrderId(order.id);
      if (row && ['issued', 'cqt_ok'].includes(row.status)) {
        return { skipped: true, reason: 'already_issued', row };
      }
    }
  }

  if (!row) {
    throw new Error(`Không tạo được bản ghi einvoices cho order ${order.order_code}`);
  }

  let api;
  try {
    api = await matbaoCreateInvoices(built.payload);
  } catch (err) {
    const code = /timeout|AbortError|ECONN|ETIMEDOUT|fetch failed/i.test(String(err?.message || err))
      ? 'timeout'
      : 'network';
    await markEinvoiceFailed(row.id, {
      errorCode: code,
      errorMessage: err?.message || String(err),
      requestPayload: built.payload,
    });
    return { ok: false, errorCode: code, row };
  }

  const parsed = parseCreateInvoiceItemResult(api.body);
  // 304 = MaTraCuu already exists → treat as issued (idempotent)
  if (parsed.errorCode === '200' || parsed.errorCode === '304') {
    const updated = await markEinvoiceIssued(row.id, {
      maSoHdon: parsed.maSoHdon,
      soHdon: parsed.soHdon,
      pdfUrl: parsed.pdfUrl,
      responsePayload: api.body,
      requestPayload: built.payload,
    });
    return { ok: true, row: updated, errorCode: parsed.errorCode };
  }

  const updated = await markEinvoiceFailed(row.id, {
    errorCode: parsed.errorCode,
    errorMessage: parsed.errorMessage || `Mat Bao HTTP ${api.status}`,
    responsePayload: api.body,
    requestPayload: built.payload,
  });

  if (parsed.errorCode === '327') {
    console.error(
      `[MatBaoInvoice][OPS ALERT] Hết số hoá đơn (327) — order ${order.order_code}. `
      + 'Xin cấp thêm dải số / đổi MATBAO_HDDT_KHHDON.',
    );
  }

  return { ok: false, errorCode: parsed.errorCode, row: updated };
}

/**
 * Cron: retry failed einvoices with retryable error codes.
 */
export async function retryFailedEinvoices({ limit = 20 } = {}) {
  if (process.env.NODE_ENV === 'test') {
    return { scanned: 0, retried: 0, issued: 0, skipped: 0 };
  }
  if (!isInvoiceVatEnabled() || !isMatbaoConfigured()) {
    return { scanned: 0, retried: 0, issued: 0, skipped: 0, disabled: true };
  }

  const rows = await listRetryableFailedEinvoices({ limit });
  const summary = { scanned: rows.length, retried: 0, issued: 0, skipped: 0, errors: 0 };

  for (const row of rows) {
    if (!RETRYABLE_MATBAO_ERROR_CODES.has(String(row.error_code))) {
      summary.skipped += 1;
      continue;
    }
    await resetEinvoiceForRetry(row.id);
    summary.retried += 1;
    try {
      const result = await issueInvoiceForOrder({
        id: row.order_id,
        order_code: row.order_code,
        invoice_info: row.invoice_info,
        amount: row.amount,
        note: row.note,
        user_email: row.user_email,
      });
      if (result?.ok) summary.issued += 1;
    } catch (err) {
      summary.errors += 1;
      console.error(`[MatBaoInvoice] retry error order=${row.order_code}:`, err.message);
    }
  }

  summary.status = summary.issued > 0 ? 'success' : 'noop';
  summary.synced = summary.issued;
  return summary;
}
