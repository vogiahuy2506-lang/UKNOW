import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * PR-2 an ninh (nối tiếp c8cbd190) — Việc 3: CHỐT CHẶN TÁI DIỄN.
 *
 * Gốc lỗ hổng: buildMailAttachments (emailSettings.controller.js) và
 * prepareZaloAttachmentSources (campaignZaloSender.service.js) đều có tham số ownerUserId
 * TÙY CHỌN (giữ tương thích ngược — xem docstring 2 hàm đó) để lọc key không thuộc workspace
 * chủ. Optional nghĩa là im lặng bỏ qua nếu quên truyền — đúng kiểu lỗi campaignRun.service.js
 * và zaloPersonal.adapter.js mắc trước PR này (2 nơi gọi thật thiếu owner id, phát hiện qua
 * rà soát thủ công, không phải qua test). Spec này thay việc rà soát thủ công bằng một phép
 * quét mã nguồn: mọi lời gọi MỚI thêm vào sau này mà quên tham số thứ 2 sẽ làm spec đỏ ngay,
 * không phải chờ audit thủ công lần sau.
 *
 * Loại trừ có chủ đích:
 * - Định nghĩa hàm (`async buildMailAttachments(` / `async prepareZaloAttachmentSources(`)
 *   không có dấu `.` phía trước tên hàm — không khớp regex bên dưới (regex bắt buộc có
 *   `<định danh>.` đứng trước), nên tự động không bị quét.
 * - Lời gọi qua `deps.buildMailAttachments(` (emailSettingsSmtp.service.js) — đây là gọi một
 *   HÀM ĐÃ ĐÓNG GÓI (closure) do nơi khác tạo ra với ownerUserId cài sẵn (xem
 *   emailSettings.controller.js:633 và campaignQuickSend.service.js:96, cả hai ĐỀU bị quét bởi
 *   chính spec này vì viết dạng `this.buildMailAttachments(items, workspaceOwnerId)` /
 *   `emailSettingsController.buildMailAttachments(items, workspaceOwnerId)`). Bản thân
 *   `deps.buildMailAttachments(attachments)` chỉ có 1 đối số vì owner id đã nằm sẵn trong
 *   closure — không phải lỗ hổng, quét theo tên biến `deps` sẽ báo động nhầm nên loại trừ
 *   tường minh, KHÔNG loại trừ theo tên file (loại theo tên file dễ bị quên cập nhật khi có
 *   thêm nơi tương tự).
 * - File test (`__tests__/`, `*.spec.js`).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../..');

const TARGET_FUNCTIONS = ['buildMailAttachments', 'prepareZaloAttachmentSources'];
// Object/hàm bao ngoài coi là closure đã cài sẵn owner id — xem giải thích ở trên.
const WRAPPER_CALLER_NAMES = new Set(['deps']);

function listJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.js') && !entry.name.endsWith('.spec.js')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Trích văn bản bên trong cặp ngoặc tròn cân bằng, bắt đầu từ vị trí `openParenIndex`
 * (chính là ký tự `(`). Trả về null nếu không cân bằng (không nên xảy ra với JS hợp lệ).
 */
function extractBalancedParens(source, openParenIndex) {
  let depth = 0;
  for (let i = openParenIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(openParenIndex + 1, i);
    }
  }
  return null;
}

/**
 * Tách chuỗi đối số thành mảng theo dấu phẩy Ở CẤP CAO NHẤT (không tách trong ngoặc/chuỗi
 * lồng bên trong từng đối số) — vd `"a, {x: 1}, b"` → `["a", " {x: 1}", " b"]`.
 */
function splitTopLevelArgs(argsText) {
  const parts = [];
  let depth = 0;
  let inString = null;
  let start = 0;
  for (let i = 0; i < argsText.length; i += 1) {
    const ch = argsText[i];
    if (inString) {
      if (ch === '\\') { i += 1; continue; }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inString = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
    else if (ch === ',' && depth === 0) {
      parts.push(argsText.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(argsText.slice(start));
  // Đối số cuối rỗng (vd lời gọi 0 đối số "()") thì bỏ, không tính là "có đối số".
  if (parts.length === 1 && parts[0].trim() === '') return [];
  return parts;
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split('\n').length;
}

/**
 * Phép kiểm RIÊNG theo từng hàm — hai hàm không cùng hình dạng tham số:
 * - buildMailAttachments(items, ownerUserId): ownerUserId là đối số VỊ TRÍ thứ 2, giá trị có
 *   thể là bất kỳ biểu thức nào (vd `campaign.workspace_owner_id || campaign.id_user`) — không
 *   nhất thiết chứa chữ "ownerUserId". Chỉ cần CÓ đối số thứ 2 không rỗng là đủ.
 * - prepareZaloAttachmentSources(attachments, options): ownerUserId là một KEY bên trong object
 *   options thứ 2 (`{ ownerUserId: ... }` hoặc rút gọn `{ ownerUserId }`). "Có đối số thứ 2"
 *   KHÔNG đủ — campaignRun.service.js từng có sẵn đối số thứ 2 `{ cache: ... }` (phục vụ cache,
 *   không phải bảo mật) mà VẪN thiếu ownerUserId, là đúng lỗ hổng PR này vá. Bắt buộc soi chữ
 *   "ownerUserId" xuất hiện trong đối số thứ 2 trở đi.
 */
const VALIDATORS = {
  buildMailAttachments(argsText) {
    const parts = splitTopLevelArgs(argsText);
    return parts.length >= 2 && parts[1].trim().length > 0;
  },
  prepareZaloAttachmentSources(argsText) {
    const parts = splitTopLevelArgs(argsText);
    if (parts.length < 2) return false;
    return /\bownerUserId\b/.test(parts.slice(1).join(','));
  },
};

function findCallSites(source, functionName) {
  const sites = [];
  // Bắt buộc có `<định danh>.` ngay trước tên hàm — loại tự nhiên phần ĐỊNH NGHĨA hàm
  // (`async buildMailAttachments(` không có dấu chấm phía trước).
  const re = new RegExp(`([A-Za-z_$][\\w$]*)\\.${functionName}\\(`, 'g');
  let match;
  // eslint-disable-next-line no-cond-assign
  while ((match = re.exec(source)) !== null) {
    const callerName = match[1];
    if (WRAPPER_CALLER_NAMES.has(callerName)) continue;
    const openParenIndex = match.index + match[0].length - 1;
    const argsText = extractBalancedParens(source, openParenIndex);
    sites.push({
      callerName,
      line: lineNumberAt(source, match.index),
      argsText,
    });
  }
  return sites;
}

describe(`mọi lời gọi ${TARGET_FUNCTIONS.join('/')}() phải truyền ownerUserId (Việc 3 — chốt chặn tái diễn)`, () => {
  const files = listJsFiles(SRC);

  it('quét được số file hợp lý (chốt chặn không âm thầm quét rỗng)', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  for (const functionName of TARGET_FUNCTIONS) {
    describe(functionName, () => {
      const callSitesByFile = files
        .map((full) => ({ full, rel: path.relative(SRC, full), source: fs.readFileSync(full, 'utf8') }))
        .map(({ full, rel, source }) => ({ rel, sites: findCallSites(source, functionName).map((s) => ({ ...s, rel })) }))
        .filter(({ sites }) => sites.length > 0);

      it('tìm thấy ít nhất một nơi gọi thật (chốt chặn không âm thầm quét rỗng)', () => {
        const total = callSitesByFile.reduce((sum, { sites }) => sum + sites.length, 0);
        expect(total).toBeGreaterThan(0);
      });

      const flatSites = callSitesByFile.flatMap(({ sites }) => sites);

      it.each(flatSites.map((s) => [`${s.rel}:${s.line} (${s.callerName}.${functionName})`, s]))(
        '%s có truyền ownerUserId',
        (_label, site) => {
          expect(site.argsText).not.toBeNull();
          expect(VALIDATORS[functionName](site.argsText)).toBe(true);
        }
      );
    });
  }
});
