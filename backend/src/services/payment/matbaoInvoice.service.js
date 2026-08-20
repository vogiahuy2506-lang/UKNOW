/**
 * Issue VAT e-invoices via Mat Bao after paid orders (durable prepare + async dispatch).
 */
import {
  findEinvoiceByOrderId,
  findEinvoiceJobWithOrder,
  insertPendingEinvoice,
  markEinvoiceIssued,
  markEinvoiceFailed,
  claimEinvoiceByIdForIssue,
  claimNextEinvoiceJob,
  claimEinvoiceByIdForEmail,
  claimNextEinvoiceEmailJob,
  markEinvoiceEmailSent,
  markEinvoiceEmailFailed,
  listMissingEinvoiceIntents,
  RETRYABLE_MATBAO_ERROR_CODES,
} from '../../repositories/payment/einvoice.repository.js';
import {
  isMatbaoConfigured,
  getMatbaoSeriesConfig,
  matbaoCreateInvoices,
  matbaoListTemplates,
  matbaoDownloadInvoicePdf,
  parseCreateInvoiceItemResult,
} from '../../utils/matbaoHddtClient.util.js';
import {
  isInvoiceVatEnabled,
  isMatbaoEinvoiceWorkerEnabled,
  INVOICE_TAX_RATE_KCT,
} from '../../utils/invoiceVat.util.js';
import { vndAmountToVietnameseWords } from '../../utils/vndAmountWords.util.js';
import {
  sendSystemEmail,
  buildInvoiceIssuedEmail,
} from '../../utils/systemEmail.util.js';

export const EINVOICE_RECONCILE_JOB_CODE = 'einvoice_matbao_retry';
export const EINVOICE_EMAIL_JOB_CODE = 'einvoice_email_retry';
export const EINVOICE_REPAIR_JOB_CODE = 'einvoice_missing_intent_repair';
export const EINVOICE_SERIES_CHECK_JOB_CODE = 'einvoice_series_check';
export const DEFAULT_SERIES_LOW_THRESHOLD = 50;
const HANOI_TZ = 'Asia/Ho_Chi_Minh';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://founderai.vn';

export function buildMaTraCuu(orderCode) {
  return `UK${orderCode}`;
}

export function buildMTChieu(orderCode) {
  return buildMaTraCuu(orderCode).slice(0, 20);
}

export function formatMatbaoNLap(now = new Date()) {
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

/** Human-readable payment time for the non-monetary invoice detail line. */
export function formatMatbaoPaymentTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: HANOI_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

function parseInvoiceInfo(order) {
  let info = order?.invoice_info;
  if (typeof info === 'string') {
    try { info = JSON.parse(info); } catch { info = null; }
  }
  return info && typeof info === 'object' ? info : null;
}

/** Durable intent — does not require Matbao/worker readiness. */
export function hasInvoiceIntent(order) {
  const info = parseInvoiceInfo(order);
  if (!info || !order?.id || !order?.order_code) return false;
  // KCT: vatAmount luôn = 0, KHÔNG được dùng nó làm cổng ý định.
  // Đơn cũ (trước 17/08/2026) không có wantInvoice nhưng có vatAmount > 0.
  return info.wantInvoice === true || Number(info.vatAmount) > 0;
}

export function shouldIssueInvoiceForOrder(order) {
  if (!isInvoiceVatEnabled()) return false;
  if (!isMatbaoConfigured()) return false;
  if (!isMatbaoEinvoiceWorkerEnabled()) return false;
  return hasInvoiceIntent(order);
}

function lineDescription(order) {
  if (order?.note === 'topup') return 'Mua thêm hạn mức Founder AI';
  if (order?.note === 'custom_self_serve') return 'Gói tự chọn Founder AI';
  return 'Gói dịch vụ Founder AI';
}

function backoffMs(attemptCount) {
  const n = Math.max(1, Number(attemptCount) || 1);
  return Math.min(60 * 60 * 1000, (2 ** Math.min(n, 6)) * 60 * 1000);
}

/**
 * Build create-invoice array payload (1 invoice).
 * Buyer email: order.user_email first, then invoice_info.email for legacy.
 */
export function buildCreateInvoicePayload(order, info) {
  const { khmshdon, khhdon } = getMatbaoSeriesConfig();
  const net = Math.round(Number(info.net));
  const vatAmount = Math.round(Number(info.vatAmount));
  const gross = Math.round(Number(info.gross));
  // Đơn cũ trước 17/08/2026 có vatRate = 10; đơn mới là -1 (KCT).
  // Đọc từ ảnh chụp của chính đơn đó, KHÔNG áp mã KCT cho đơn cũ.
  const rawRate = Number(info.vatRate);
  const vatRate = Number.isFinite(rawRate) ? rawRate : INVOICE_TAX_RATE_KCT;
  const maTraCuu = buildMaTraCuu(order.order_code);
  const mtchieu = buildMTChieu(order.order_code);
  const accountEmail = String(order.user_email || '').trim();
  const buyerEmail = accountEmail || String(info.email || '').trim();
  const paymentTime = formatMatbaoPaymentTime(order.paid_at || order.updated_at || order.created_at);

  const isCompany = info.buyerType !== 'personal' && info.buyerType !== 'consumer';
  const isConsumer = info.buyerType === 'consumer';
  
  let nMuaTen = '';
  let nMuaMst = '';
  let nMuaDchi = '';
  let nMuaCccd = '';

  if (isConsumer) {
    nMuaTen = 'Bán cho người tiêu dùng';
  } else if (isCompany) {
    nMuaTen = info.companyName;
    nMuaMst = info.taxCode || '';
    nMuaDchi = info.companyAddress || info.address || '';
  } else {
    nMuaTen = info.fullName;
    nMuaDchi = info.address || '';
    if (info.idNumber) nMuaCccd = String(info.idNumber).slice(0, 12);
  }

  const buyer = {
    NMua_Ten: nMuaTen,
    NMua_MST: nMuaMst,
    NMua_DChi: nMuaDchi,
    NMua_DCTDTu: buyerEmail,
    NMua_SDThoai: info.phone || '',
  };
  if (nMuaCccd) {
    buyer.NMua_CCCDan = nMuaCccd;
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
      // TChat=4 is a note/detail row: it is rendered on the invoice but never
      // contributes to the monetary totals.
      {
        TChat: 4,
        STT: 2,
        THHDVu: `KH:\n${buyerEmail}\nThời gian TT: ${paymentTime}\nNote:`,
      },
    ],
    TgThTien: net,
    TTCKTMai: 0,
    TGTKhac: 0,
    TgTThue: vatAmount,
    TgTTTBSo: gross,
    TgTTTBChu: vndAmountToVietnameseWords(gross),
  };

  return { maTraCuu, mtchieu, khmshdon, khhdon, payload: [invoice] };
}

/**
 * DB-only prepare inside fulfillment transaction. No HTTP.
 * @returns {Promise<number|null>} einvoice id
 */
export async function prepareEinvoiceForPaidOrder(order, queryable) {
  if (!hasInvoiceIntent(order)) return null;

  const existing = await findEinvoiceByOrderId(order.id, queryable);
  if (existing) return existing.id;

  const { khmshdon, khhdon } = getMatbaoSeriesConfig();
  const maTraCuu = buildMaTraCuu(order.order_code);
  const mtchieu = buildMTChieu(order.order_code);

  const orderInfo = parseInvoiceInfo(order);
  const emailStatus = orderInfo?.deliverEmail === false ? 'skipped' : 'pending';

  const row = await insertPendingEinvoice({
    orderId: order.id,
    maTraCuu,
    mtchieu,
    khmshdon,
    khhdon,
    requestPayload: null,
    emailStatus,
  }, queryable);

  if (row) return row.id;
  const again = await findEinvoiceByOrderId(order.id, queryable);
  return again?.id || null;
}

/**
 * Fast-path after COMMIT — worker cron is the durable fallback.
 */
export function scheduleDispatchEinvoiceAfterCommit(einvoiceId) {
  if (!einvoiceId) return;
  if (!isMatbaoEinvoiceWorkerEnabled() || !isMatbaoConfigured()) return;
  setImmediate(() => {
    dispatchPreparedEinvoice(einvoiceId).catch((err) => {
      console.error(
        `[MatBaoInvoice] dispatch failed einvoice=${einvoiceId}:`,
        err?.message || err,
      );
    });
  });
}

/** @deprecated Prefer scheduleDispatchEinvoiceAfterCommit(einvoiceId) */
export function scheduleIssueInvoiceAfterCommit(order) {
  if (!hasInvoiceIntent(order)) return;
  setImmediate(async () => {
    try {
      let id = null;
      const existing = await findEinvoiceByOrderId(order.id);
      if (existing) id = existing.id;
      else {
        // Legacy callers without prepare — best-effort prepare outside txn.
        id = await prepareEinvoiceForPaidOrder(order);
      }
      if (id) await dispatchPreparedEinvoice(id);
    } catch (err) {
      console.error(
        `[MatBaoInvoice] legacy schedule failed order=${order.order_code}:`,
        err?.message || err,
      );
    }
  });
}

/**
 * HTTP Mat Bao issue for a prepared row.
 * Always claims atomically first so fast-path + cron cannot double-create.
 */
export async function dispatchPreparedEinvoice(einvoiceId) {
  if (!isMatbaoEinvoiceWorkerEnabled() || !isMatbaoConfigured()) {
    return { skipped: true, reason: 'worker_disabled' };
  }

  const claimed = await claimEinvoiceByIdForIssue(einvoiceId);
  if (!claimed) {
    const existing = await findEinvoiceJobWithOrder(einvoiceId);
    if (!existing) return { skipped: true, reason: 'missing' };
    if (['issued', 'cqt_ok'].includes(existing.status)) {
      scheduleSendInvoiceEmailAfterIssue(existing.id);
      return { skipped: true, reason: 'already_issued', row: existing };
    }
    return { skipped: true, reason: 'not_claimable', status: existing.status };
  }

  const job = await findEinvoiceJobWithOrder(einvoiceId);
  if (!job) return { skipped: true, reason: 'missing' };

  const order = {
    id: job.order_id,
    order_code: job.order_code,
    invoice_info: job.invoice_info,
    amount: job.amount,
    note: job.note,
    user_email: job.user_email,
    paid_at: job.paid_at,
    created_at: job.created_at,
  };
  if (!hasInvoiceIntent(order)) return { skipped: true, reason: 'no_intent' };
  const info = parseInvoiceInfo(order);

  const built = buildCreateInvoicePayload(order, info);

  let api;
  try {
    api = await matbaoCreateInvoices(built.payload);
  } catch (err) {
    const code = /timeout|AbortError|ECONN|ETIMEDOUT|fetch failed/i.test(String(err?.message || err))
      ? 'timeout'
      : 'network';
    const next = new Date(Date.now() + backoffMs(job.attempt_count));
    await markEinvoiceFailed(job.id, {
      errorCode: code,
      errorMessage: err?.message || String(err),
      requestPayload: built.payload,
      nextAttemptAt: next.toISOString(),
    });
    return { ok: false, errorCode: code };
  }

  const parsed = parseCreateInvoiceItemResult(api.body);
  if (parsed.errorCode === '200' || parsed.errorCode === '304') {
    const updated = await markEinvoiceIssued(job.id, {
      maSoHdon: parsed.maSoHdon,
      soHdon: parsed.soHdon,
      pdfUrl: parsed.pdfUrl,
      responsePayload: api.body,
      requestPayload: built.payload,
    });
    scheduleSendInvoiceEmailAfterIssue(job.id);
    return { ok: true, row: updated, errorCode: parsed.errorCode };
  }

  const permanent = parsed.errorCode === '327';
  const next = permanent ? null : new Date(Date.now() + backoffMs(job.attempt_count));
  const updated = await markEinvoiceFailed(job.id, {
    errorCode: parsed.errorCode,
    errorMessage: parsed.errorMessage || `Mat Bao HTTP ${api.status}`,
    responsePayload: api.body,
    requestPayload: built.payload,
    nextAttemptAt: next ? next.toISOString() : null,
  });

  if (parsed.errorCode === '327') {
    console.error(
      `[MatBaoInvoice][OPS ALERT] Hết số hoá đơn (327) — order ${order.order_code}. `
      + 'Xin cấp thêm dải số / đổi MATBAO_HDDT_KHHDON.',
    );
  }

  return { ok: false, errorCode: parsed.errorCode, row: updated };
}

/** @deprecated Prefer dispatchPreparedEinvoice */
export async function issueInvoiceForOrder(order) {
  if (!shouldIssueInvoiceForOrder(order) && !hasInvoiceIntent(order)) {
    return { skipped: true };
  }
  let id = (await findEinvoiceByOrderId(order.id))?.id || null;
  if (!id) id = await prepareEinvoiceForPaidOrder(order);
  if (!id) return { skipped: true };
  return dispatchPreparedEinvoice(id);
}

export function scheduleSendInvoiceEmailAfterIssue(einvoiceId) {
  if (!einvoiceId) return;
  if (!isMatbaoEinvoiceWorkerEnabled()) return;
  setImmediate(() => {
    sendInvoicePdfForEinvoice(einvoiceId).catch((err) => {
      console.error(
        `[MatBaoInvoice] email failed einvoice=${einvoiceId}:`,
        err?.message || err,
      );
    });
  });
}

export async function sendInvoicePdfForEinvoice(einvoiceId) {
  if (!isMatbaoEinvoiceWorkerEnabled()) {
    return { skipped: true, reason: 'worker_disabled' };
  }

  const claimed = await claimEinvoiceByIdForEmail(einvoiceId);
  if (!claimed) {
    const existing = await findEinvoiceJobWithOrder(einvoiceId);
    if (!existing) return { skipped: true, reason: 'missing' };
    if (existing.email_status === 'sent') {
      return { skipped: true, reason: 'already_sent' };
    }
    if (!['issued', 'cqt_ok'].includes(existing.status)) {
      return { skipped: true, reason: 'not_issued' };
    }
    return { skipped: true, reason: 'not_claimable' };
  }

  const job = await findEinvoiceJobWithOrder(einvoiceId);
  if (!job) return { skipped: true, reason: 'missing' };

  const to = String(job.user_email || '').trim();
  if (!to) {
    // Permanent — no email_next_attempt_at → cron will not retry.
    await markEinvoiceEmailFailed(job.id, 'Missing orders.user_email', { nextAttemptAt: null });
    return { ok: false, reason: 'no_recipient' };
  }

  let pdf;
  try {
    pdf = await matbaoDownloadInvoicePdf({
      maTraCuu: job.ma_tra_cuu,
      maSoHdon: job.ma_so_hdon,
      pdfUrl: job.pdf_url,
    });
  } catch (err) {
    const next = new Date(Date.now() + backoffMs(job.email_attempt_count));
    await markEinvoiceEmailFailed(job.id, err?.message || String(err), {
      nextAttemptAt: next.toISOString(),
    });
    return { ok: false, reason: 'pdf_fetch' };
  }

  const info = parseInvoiceInfo(job);
  const orderCode = job.order_code;
  const email = buildInvoiceIssuedEmail({
    orderCode,
    soHdon: job.so_hdon,
    khhdon: job.khhdon,
    amount: info?.gross ?? job.amount,
    invoiceUrl: `${FRONTEND_URL}/invoices/${orderCode}`,
    cqtOk: job.status === 'cqt_ok',
  });

  try {
    await sendSystemEmail({
      to,
      subject: email.subject,
      html: email.html,
      attachments: [{
        filename: `hoa-don-${orderCode}.pdf`,
        content: pdf.buffer,
        contentType: 'application/pdf',
      }],
      messageId: `<einvoice-${job.id}-${orderCode}@founderai.biz>`,
    });
    await markEinvoiceEmailSent(job.id);
    return { ok: true };
  } catch (err) {
    const next = new Date(Date.now() + backoffMs(job.email_attempt_count));
    await markEinvoiceEmailFailed(job.id, err?.message || String(err), {
      nextAttemptAt: next.toISOString(),
    });
    return { ok: false, reason: 'smtp' };
  }
}

/**
 * Cron: claim + dispatch pending/failed/lease-expired jobs.
 */
export async function retryFailedEinvoices({ limit = 20 } = {}) {
  if (process.env.NODE_ENV === 'test') {
    return { scanned: 0, retried: 0, issued: 0, skipped: 0 };
  }
  if (!isMatbaoEinvoiceWorkerEnabled() || !isMatbaoConfigured()) {
    return { scanned: 0, retried: 0, issued: 0, skipped: 0, disabled: true };
  }

  const claimed = await claimNextEinvoiceJob({ limit });
  const summary = {
    scanned: claimed.length,
    retried: claimed.length,
    issued: 0,
    skipped: 0,
    errors: 0,
  };

  for (const row of claimed) {
    if (row.error_code && !RETRYABLE_MATBAO_ERROR_CODES.has(String(row.error_code))
      && row.status === 'failed') {
      summary.skipped += 1;
      continue;
    }
    try {
      const result = await dispatchPreparedEinvoice(row.id);
      if (result?.ok) summary.issued += 1;
    } catch (err) {
      summary.errors += 1;
      console.error(`[MatBaoInvoice] retry error id=${row.id}:`, err.message);
    }
  }

  summary.status = summary.issued > 0 ? 'success' : 'noop';
  summary.synced = summary.issued;
  return summary;
}

export async function retryEinvoiceEmails({ limit = 20 } = {}) {
  if (process.env.NODE_ENV === 'test') {
    return { scanned: 0, sent: 0, errors: 0 };
  }
  if (!isMatbaoEinvoiceWorkerEnabled()) {
    return { scanned: 0, sent: 0, errors: 0, disabled: true };
  }

  const claimed = await claimNextEinvoiceEmailJob({ limit });
  const summary = { scanned: claimed.length, sent: 0, errors: 0 };
  for (const row of claimed) {
    try {
      const result = await sendInvoicePdfForEinvoice(row.id);
      if (result?.ok) summary.sent += 1;
    } catch (err) {
      summary.errors += 1;
      console.error(`[MatBaoInvoice] email retry id=${row.id}:`, err.message);
    }
  }
  summary.status = summary.sent > 0 ? 'success' : 'noop';
  summary.synced = summary.sent;
  return summary;
}

export async function repairMissingEinvoiceIntents({ limit = 20 } = {}) {
  if (process.env.NODE_ENV === 'test') {
    return { scanned: 0, prepared: 0, reportedOnly: true };
  }
  const fromIso = String(process.env.EINVOICE_REPAIR_FROM || '').trim();
  if (!fromIso) {
    return { scanned: 0, prepared: 0, reportedOnly: true, missingCutoff: true };
  }

  const rows = await listMissingEinvoiceIntents({ fromIso, limit });
  const summary = { scanned: rows.length, prepared: 0, errors: 0, reportedOnly: false };
  for (const order of rows) {
    const info = parseInvoiceInfo(order);
    if (!hasInvoiceIntent(order) || info?.net == null || info?.gross == null) {
      console.warn(`[MatBaoInvoice][OPS] Missing intent incomplete snapshot order=${order.order_code}`);
      continue;
    }
    try {
      const id = await prepareEinvoiceForPaidOrder(order);
      if (id) {
        summary.prepared += 1;
        scheduleDispatchEinvoiceAfterCommit(id);
      }
    } catch (err) {
      summary.errors += 1;
      console.error(`[MatBaoInvoice] repair error order=${order.order_code}:`, err.message);
    }
  }
  summary.status = summary.prepared > 0 ? 'success' : 'noop';
  summary.synced = summary.prepared;
  return summary;
}

/**
 * Cron: Check series availability and calendar year matching for Mat Bao invoice series.
 */
export async function checkEinvoiceSeries({
  currentYear = new Date().getFullYear(),
  threshold = Number(process.env.EINVOICE_SERIES_LOW_THRESHOLD) || DEFAULT_SERIES_LOW_THRESHOLD,
} = {}) {
  if (process.env.NODE_ENV === 'test') {
    return { scanned: 0, cLai: null, disabled: true };
  }
  if (!isMatbaoEinvoiceWorkerEnabled() || !isMatbaoConfigured()) {
    return { scanned: 0, cLai: null, disabled: true };
  }

  const res = await matbaoListTemplates(currentYear);
  if (!res.ok) {
    const errorMsg = res.body?.message || res.body?.errorMessage || `HTTP ${res.status}`;
    console.error('[MatBaoInvoice][OPS ALERT] Không lấy được danh sách templates từ Mắt Bão:', res.body);
    return {
      status: 'error',
      synced: 0,
      cLai: null,
      error: errorMsg,
    };
  }

  const list = res.body?.data || res.body?.Data || (Array.isArray(res.body) ? res.body : []);
  const seriesConfig = getMatbaoSeriesConfig();
  const cfgKhmshdon = String(seriesConfig.khmshdon || '').trim();
  const cfgKhhdon = String(seriesConfig.khhdon || '').trim();

  // Kiểm tra năm ký hiệu (KHHDon: C26TAT -> "26" vs 2 số cuối năm)
  const currentYear2Digits = String(currentYear).slice(-2);
  const seriesYear2Digits = cfgKhhdon.slice(1, 3);
  const yearMismatch = seriesYear2Digits !== currentYear2Digits;

  const matched = list.find((item) => {
    const itemKhmshdon = String(item.khmshDon ?? item.KHMSHDon ?? item.khmshdon ?? '').trim();
    const itemKhhdon = String(item.khhDon ?? item.KHHDon ?? item.khhdon ?? '').trim();
    return itemKhmshdon === cfgKhmshdon && itemKhhdon === cfgKhhdon;
  });

  if (!matched) {
    console.error(`[MatBaoInvoice][OPS ALERT] Không tìm thấy dải ký hiệu khớp cấu hình: KHMSHDon=${cfgKhmshdon}, KHHDon=${cfgKhhdon}`);
    return {
      status: 'warning',
      synced: 0,
      notFound: true,
      khhdon: cfgKhhdon,
      khmshdon: cfgKhmshdon,
      cLai: 0,
      yearMismatch,
    };
  }

  const rawCLai = matched.cLai ?? matched.CLai ?? matched.cl ?? 0;
  const cLai = Number(rawCLai) || 0;
  const isLow = cLai <= threshold;

  if (isLow) {
    console.error(`[MatBaoInvoice][OPS ALERT] Dải số hoá đơn sắp hết: còn lại ${cLai} số (ngưỡng <= ${threshold}).`);
  }
  if (yearMismatch) {
    console.error(`[MatBaoInvoice][OPS ALERT] Ký hiệu hoá đơn sai năm: đang dùng ${cfgKhhdon} (năm ${seriesYear2Digits}), năm hiện tại là ${currentYear}.`);
  }

  return {
    status: isLow || yearMismatch ? 'warning' : 'success',
    synced: 1,
    cLai,
    threshold,
    isLow,
    yearMismatch,
    notFound: false,
    khhdon: cfgKhhdon,
    khmshdon: cfgKhmshdon,
  };
}

export async function streamInvoicePdfForOwner(orderCode, userId) {
  const { findOrderInvoiceForOwner } = await import('../../repositories/payment/einvoice.repository.js');
  const row = await findOrderInvoiceForOwner(orderCode, userId);
  if (!row) return { status: 404 };
  if (!row.einvoice_id) return { status: 404 };
  if (!['issued', 'cqt_ok'].includes(row.einvoice_status)) {
    return { status: 409, code: 'INVOICE_PDF_NOT_READY' };
  }
  const pdf = await matbaoDownloadInvoicePdf({
    maTraCuu: row.ma_tra_cuu,
    maSoHdon: row.ma_so_hdon,
    pdfUrl: row.pdf_url,
  });
  return {
    status: 200,
    buffer: pdf.buffer,
    contentType: pdf.contentType,
    filename: `hoa-don-${orderCode}.pdf`,
  };
}
