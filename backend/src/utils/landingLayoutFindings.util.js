/**
 * Findings của bộ đo hiển thị landing (frontend `layoutAudit.js`, PLAN_LANDING_TU_KIEM_HIEN_THI_TU_SUA
 * mục 10) — phía server chỉ NHẬN DỮ LIỆU: client đo và đưa findings, server tự viết lệnh sửa.
 * Client không bao giờ được đưa câu lệnh vào đường "sửa tự động không trừ credit".
 */

export const LAYOUT_FINDING_KINDS = ['text_covered', 'text_clipped', 'text_offscreen'];
export const LAYOUT_FINDING_SIDES = ['left', 'right', 'top', 'bottom', 'middle', 'all'];
export const MAX_LAYOUT_FINDINGS = 12;
/** Trần số lượt sửa tự động (không trừ credit) cho mỗi tin landing. */
export const AUTO_LAYOUT_FIX_MAX_ROUNDS = 2;

const MAX_FIELD_CHARS = 300;
const MAX_INSPECTED = 50;
const MAX_CHANGE_SUMMARY_CHARS = 200;

// Chữ tới từ trang của khách (do AI sinh) nhưng đi qua client → vào prompt. Ép mỗi trường về MỘT
// dòng trơn: không xuống dòng/ký tự điều khiển, không dấu " (prompt bọc yêu cầu trong """ và câu
// lệnh tự bọc chữ trong "…"), để một finding giả không thoát khỏi vị trí của nó trong câu lệnh.
function cleanField(value) {
  let flat = '';
  for (const ch of String(value)) {
    const code = ch.charCodeAt(0);
    flat += code < 32 || code === 127 ? ' ' : ch;
  }
  return flat.replace(/"/g, "'").replace(/\s+/g, ' ').trim().slice(0, MAX_FIELD_CHARS);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNumberIn(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function normalizeOne(raw) {
  if (!isPlainObject(raw)) return null;
  if (!LAYOUT_FINDING_KINDS.includes(raw.kind)) return null;
  if (!isNumberIn(raw.width, 200, 4000)) return null;
  if (!isNumberIn(raw.overlapPx, 0, 10000)) return null;
  if (typeof raw.text !== 'string' || typeof raw.selector !== 'string') return null;

  const text = cleanField(raw.text);
  const selector = cleanField(raw.selector).replace(/\s+/g, '');
  if (!text || !selector) return null;

  if (raw.sectionTitle != null && typeof raw.sectionTitle !== 'string') return null;

  let coveredBy = null;
  if (raw.coveredBy != null) {
    if (!isPlainObject(raw.coveredBy)) return null;
    if (typeof raw.coveredBy.text !== 'string' || typeof raw.coveredBy.selector !== 'string') return null;
    const coverSelector = cleanField(raw.coveredBy.selector).replace(/\s+/g, '');
    if (!coverSelector) return null;
    coveredBy = { text: cleanField(raw.coveredBy.text), selector: coverSelector };
  }

  let side = null;
  if (raw.side != null) {
    if (!LAYOUT_FINDING_SIDES.includes(raw.side)) return null;
    side = raw.side;
  }

  return {
    kind: raw.kind,
    width: Math.round(raw.width),
    text,
    selector,
    sectionTitle: raw.sectionTitle ? cleanField(raw.sectionTitle) : '',
    coveredBy,
    overlapPx: Math.round(raw.overlapPx),
    side,
  };
}

/**
 * Lọc findings client gửi về đúng hình dạng thật của PR-1: phần tử sai kiểu bị BỎ (không sửa hộ),
 * quá 12 thì lấy 12 đầu hợp lệ. Trả mảng rỗng nếu đầu vào không phải mảng. Idempotent.
 *
 * @param {unknown} input
 * @returns {Array<{kind:string,width:number,text:string,selector:string,sectionTitle:string,
 *   coveredBy:{text:string,selector:string}|null,overlapPx:number,side:string|null}>}
 */
export function normalizeLayoutFindings(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const raw of input.slice(0, MAX_INSPECTED)) {
    const one = normalizeOne(raw);
    if (one) out.push(one);
    if (out.length >= MAX_LAYOUT_FINDINGS) break;
  }
  return out;
}

const SIDE_TEXT = {
  left: ' ở mép trái',
  right: ' ở mép phải',
  top: ' ở mép trên',
  bottom: ' ở mép dưới',
  middle: ' ở giữa',
};

function describeFinding(f) {
  const where = `${f.selector}${f.sectionTitle ? `, trong phần "${f.sectionTitle}"` : ''}`;
  const head = `[${f.width}px] Chữ "${f.text}" (${where})`;
  if (f.kind === 'text_covered') {
    const by = f.coveredBy
      ? `${f.coveredBy.selector}${f.coveredBy.text ? ` ("${f.coveredBy.text}")` : ''}`
      : 'một phần tử khác';
    return f.side === 'all'
      ? `${head} bị ${by} che gần hết.`
      : `${head} bị ${by} đè ${f.overlapPx}px${SIDE_TEXT[f.side] || ''}.`;
  }
  if (f.kind === 'text_clipped') {
    return `${head} bị cắt mất khoảng ${f.overlapPx}px (overflow ẩn hoặc text-overflow: ellipsis).`;
  }
  return `${head} tràn ra ngoài mép màn hình ${f.overlapPx}px.`;
}

/**
 * Lệnh sửa do SERVER viết từ findings đã chuẩn hoá — chỉ dùng các trường đã cắt/làm phẳng ở trên,
 * không có chỗ nào chèn chuỗi tự do của client. Dùng cho lượt sửa tự động (không trừ credit).
 * Trả '' nếu không còn finding hợp lệ.
 *
 * @param {unknown} findings
 * @returns {string}
 */
export function buildAutoLayoutFixInstruction(findings) {
  const list = normalizeLayoutFindings(findings);
  if (!list.length) return '';
  const lines = list.map((f, i) => `${i + 1}. ${describeFinding(f)}`).join('\n');
  return [
    'Hệ thống đã render trang trong trình duyệt ở nhiều bề rộng màn hình và đo được các lỗi hiển thị sau:',
    lines,
    'Hãy sửa TẤT CẢ các lỗi trên để chữ không bị che, không bị cắt, không tràn khỏi màn hình. Ưu tiên đổi khoảng cách, bề rộng cột, hoặc bỏ absolute/toạ độ âm; nếu chữ bị một phần tử trang trí đè lên thì dời phần tử đó hoặc chừa chỗ cho chữ. KHÔNG xoá chữ, KHÔNG đổi nội dung, KHÔNG đụng phần khác của trang, giữ nguyên form đăng ký và mọi phần không liên quan tới các lỗi trên.',
  ].join('\n');
}

/**
 * Ngữ cảnh đo cho đường sửa THƯỜNG (người dùng gõ "chữ bị đè", frontend đo trước khi gửi): server nối
 * đoạn này vào lệnh ĐƯA CHO AI, còn tin của người dùng và lời xác nhận lưu trong phiên chỉ giữ đúng
 * câu họ gõ. Review PR-3 (21/09): bản đầu để frontend tự nối findings vào `instruction` → server lưu
 * cả selector/pixel thành tin người dùng, tải lại phiên là lộ — phạm nguyên tắc 1 (khách không bao
 * giờ thấy class/pixel). Trả '' nếu không còn finding hợp lệ.
 *
 * @param {unknown} findings
 * @returns {string}
 */
export function buildLayoutFindingsContext(findings) {
  const list = normalizeLayoutFindings(findings);
  if (!list.length) return '';
  const lines = list.map((f, i) => `${i + 1}. ${describeFinding(f)}`).join('\n');
  return [
    'Hệ thống vừa render trang này trong trình duyệt và đo được các lỗi hiển thị sau (dùng để xác định ĐÚNG chỗ người dùng nói tới; nếu yêu cầu của họ là về lỗi hiển thị thì sửa cho hết các lỗi này, không xoá chữ, không đổi nội dung):',
    lines,
  ].join('\n');
}

// Câu báo cho NGƯỜI DÙNG không được lộ chuyện kỹ thuật (sếp chốt 20/09: không class/pixel/selector).
// Prompt đã cấm; đây là lưới cuối — model lỡ nhắc thì bỏ cả câu chứ không sửa hộ, phía gọi có lời
// dự phòng khi không có changeSummary.
// `em` chỉ tính khi dính liền số (1.5em): "cho 5 em học sinh" là tiếng Việt bình thường, không phải CSS.
const TECHNICAL_LEAK = /\d\s*(?:px|rem)\b|\d(?:\.\d+)?em\b|\b(?:class|css|tailwind|html|div|span|selector|absolute)\b|\b[a-z]+-\d+\b/i;

/**
 * `changeSummary` model trả về → chuỗi an toàn để hiện cho người dùng, hoặc '' nếu không dùng được:
 * không phải string, rỗng, hoặc nhắc class/px. Bỏ thẻ HTML, gộp khoảng trắng, cắt 200 ký tự.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeChangeSummary(value) {
  if (typeof value !== 'string') return '';
  const text = value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_CHANGE_SUMMARY_CHARS);
  if (!text || TECHNICAL_LEAK.test(text)) return '';
  return text;
}
