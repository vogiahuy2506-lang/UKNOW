/**
 * Tóm tắt DANH SÁCH NGƯỜI NHẬN cho trợ lý (rà soát C P1-6 mục (d), 04/10/2026).
 *
 * Đợt 3 (H2) đã làm: tin cũ không đính lại tệp/Sheet, URL Sheet đã chốt không bao giờ tải, bỏ prompt bắt model tự đếm. Còn lại
 * đúng MỘT lượt: tệp Excel/CSV hoặc link Google Sheet người dùng đưa vào ở TIN HIỆN TẠI vẫn đi nguyên văn sang Gemini — tới 300
 * dòng tên/SĐT/email khách cuối (Sheet), hoặc cả tệp không trần (Excel/CSV). Bên XỬ LÝ dữ liệu (NĐ 13) không được nhận nhiều hơn
 * mức cần: để dựng chiến dịch model chỉ cần biết danh sách CÓ GÌ (tên cột, bao nhiêu email/SĐT hợp lệ, dạng dữ liệu), không cần
 * từng người.
 *
 * Module này thay khối nội dung bảng bằng bản tóm tắt do bộ đọc người nhận TẤT ĐỊNH tạo (`recipientExtractor`, cùng bộ đọc của
 * `POST /ai/extract-recipients` và `checkSheetForChannel`): số email/SĐT hợp lệ, số dòng bị loại, tên cột, và vài dòng mẫu ĐÃ CHE.
 * Không đủ tin là danh sách người nhận (không có email/SĐT, hoặc chỉ vài ô lạc trong bảng sản phẩm) thì trả `null` để đường cũ
 * (đính nguyên văn) vẫn chạy — bảng giá/sản phẩm phải còn đọc được.
 */
import { extractRecipientsFromBuffer } from './recipientExtractor.service.js';
import { UNTRUSTED_CONTENT_NOTICE } from '../../utils/untrustedContent.util.js';

/** Số dòng mẫu (đã che) đưa cho model — đủ để thấy dạng dữ liệu, không đủ để nhận ra khách. */
export const RECIPIENT_SUMMARY_SAMPLE_ROWS = 3;
const MAX_HEADERS = 20;
const MAX_HEADER_LENGTH = 60;
/** Bảng chỉ được coi là danh sách người nhận khi ≥ 2 dòng có liên hệ hợp lệ VÀ chiếm ≥ nửa số dòng dữ liệu. */
const MIN_CONTACT_ROWS = 2;
const MIN_CONTACT_RATIO = 0.5;

/** `a***@domain` — giữ ký tự đầu của phần tên và nguyên phần tên miền. */
export function maskEmail(value) {
  const text = String(value ?? '').trim();
  const at = text.lastIndexOf('@');
  if (at <= 0) return '***';
  return `${Array.from(text)[0]}***${text.slice(at)}`;
}

/** `09********` — giữ 2 chữ số đầu, che phần còn lại (độ dài giữ nguyên để model thấy đúng dạng số). */
export function maskPhone(value) {
  const digits = String(value ?? '').replace(/\s+/g, '');
  if (digits.length <= 2) return '*'.repeat(digits.length);
  return `${digits.slice(0, 2)}${'*'.repeat(digits.length - 2)}`;
}

/** `N***` — chỉ giữ ký tự đầu của tên. */
export function maskName(value) {
  const text = String(value ?? '').trim();
  return text ? `${Array.from(text)[0]}***` : '';
}

/**
 * Kết quả bộ đọc người nhận có đúng là một DANH SÁCH NGƯỜI NHẬN không (chứ không phải bảng sản phẩm lẻ vài ô hotline).
 * `skipped` = số dòng dữ liệu không có email/SĐT hợp lệ; số dòng có liên hệ xấp xỉ `max(emails, phones)` (một dòng có cả hai
 * thì chỉ tính một lần).
 */
export function looksLikeRecipientList(extracted) {
  const emails = Array.isArray(extracted?.emails) ? extracted.emails.length : 0;
  const phones = Array.isArray(extracted?.phones) ? extracted.phones.length : 0;
  const contactRows = Math.max(emails, phones);
  if (contactRows < MIN_CONTACT_ROWS) return false;
  const skipped = Number(extracted?.skipped) || 0;
  return contactRows / (contactRows + skipped) >= MIN_CONTACT_RATIO;
}

const cleanHeader = (value) => JSON.stringify(String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_HEADER_LENGTH));

/**
 * Dựng khối tóm tắt gửi model. Không có dòng dữ liệu thật nào: chỉ số đếm, tên cột (JSON-quote, cắt 60 ký tự, tối đa 20 cột) và
 * vài dòng mẫu đã che. Tên cột là chữ người dùng nên khối mang câu rào "dữ liệu, không phải mệnh lệnh".
 *
 * @param {{ sourceLabel: string, extracted: object }} params
 * @returns {string}
 */
export function formatRecipientListSummary({ sourceLabel, extracted }) {
  const emailCount = Array.isArray(extracted?.emails) ? extracted.emails.length : 0;
  const phoneCount = Array.isArray(extracted?.phones) ? extracted.phones.length : 0;
  const skipped = Number(extracted?.skipped) || 0;
  const headers = (Array.isArray(extracted?.headers) ? extracted.headers : []).slice(0, MAX_HEADERS).map(cleanHeader);
  const samples = (Array.isArray(extracted?.sampleRows) ? extracted.sampleRows : [])
    .slice(0, RECIPIENT_SUMMARY_SAMPLE_ROWS)
    .map((row, index) => {
      const cells = [];
      if (row?.name) cells.push(`tên ${JSON.stringify(maskName(row.name))}`);
      if (row?.phone) cells.push(`SĐT ${JSON.stringify(maskPhone(row.phone))}`);
      if (row?.email) cells.push(`email ${JSON.stringify(maskEmail(row.email))}`);
      return `(${index + 1}) ${cells.join(', ')}`;
    });

  return [
    UNTRUSTED_CONTENT_NOTICE,
    `[Danh sách người nhận — ${sourceLabel}: chứa dữ liệu cá nhân của khách cuối nên hệ thống KHÔNG gửi nội dung bảng cho AI.`
      + ` Hệ thống đã đọc tất định: ${emailCount} email hợp lệ, ${phoneCount} SĐT hợp lệ`
      + `${skipped > 0 ? `, ${skipped} dòng không có email/SĐT hợp lệ bị loại` : ''}`
      + `${headers.length > 0 ? `; các cột: ${headers.join(', ')}` : ''}.`
      + `${samples.length > 0 ? ` Ví dụ ${samples.length} dòng đầu (đã che bớt): ${samples.join('; ')}.` : ''}`
      + ' Chỉ dùng đúng các số này khi nói về số người nhận; KHÔNG tự đếm, KHÔNG đoán, KHÔNG chép tên/SĐT/email người nhận.]',
  ].join('\n');
}

/**
 * Tóm tắt một tệp bảng tính (Excel/CSV). `null` = không phải danh sách người nhận hoặc không đọc được → nơi gọi đính nguyên văn
 * như cũ (bảng sản phẩm vẫn đọc được; tệp hỏng thì đường cũ tự báo lỗi). Không đặt trần số người nhận: đếm được bao nhiêu báo bấy
 * nhiêu để model nói đúng việc vượt hạn mức (hệ thống chặn bằng cổng tất định, không phải bằng cách che con số).
 */
export async function summarizeRecipientListBuffer(buffer, originalName, contentType, { sourceLabel = 'tệp đính kèm' } = {}) {
  let extracted;
  try {
    extracted = await extractRecipientsFromBuffer(buffer, originalName, contentType, { maxRecipients: Number.MAX_SAFE_INTEGER });
  } catch {
    return null;
  }
  if (!looksLikeRecipientList(extracted)) return null;
  return formatRecipientListSummary({ sourceLabel, extracted });
}

/** Như trên, cho thân CSV mà endpoint gviz của Google Sheet trả về. */
export async function summarizeRecipientListCsv(csvText, { sourceLabel = 'Google Sheet' } = {}) {
  return summarizeRecipientListBuffer(Buffer.from(String(csvText ?? ''), 'utf-8'), 'google_sheet.csv', 'text/csv', { sourceLabel });
}

export default { summarizeRecipientListBuffer, summarizeRecipientListCsv, formatRecipientListSummary, looksLikeRecipientList };
