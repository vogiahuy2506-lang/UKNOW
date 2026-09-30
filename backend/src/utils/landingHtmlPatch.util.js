/**
 * Ghép các bản vá `{find, replace}` do AI trả về vào HTML landing hiện tại (hàm thuần, không I/O).
 * PLAN_SUA_LANDING_THEO_DOAN_2026-09-30: AI chỉ trả phần đổi thay vì viết lại cả trang; backend tự
 * ghép rồi chạy nguyên các chốt kiểm hiện có.
 */

function patchError(code, message, index) {
  const err = new Error(message);
  err.code = code;
  err.details = { index };
  return err;
}

/** Đếm số vị trí BẮT ĐẦU của `find` trong `html` (đếm cả chồng lấn: bước idx + 1). */
function findExactPositions(html, find) {
  const positions = [];
  let idx = html.indexOf(find);
  while (idx !== -1) {
    positions.push(idx);
    idx = html.indexOf(find, idx + 1);
  }
  return positions;
}

/**
 * Regex khớp nới khoảng trắng: AI hay chép sai thụt lề/xuống dòng. Bỏ khoảng trắng sát sau `>` và
 * sát trước `<`, escape ký tự đặc biệt regex, mỗi đoạn khoảng trắng → `\s+`, rồi cho phép khoảng
 * trắng tuỳ ý sau mọi `>` và trước mọi `<`.
 *
 * Review 30/09 trên trang thật 66.753 ký tự (1.468 khối 1–6 dòng, chép lại kiểu AI: bỏ thụt lề,
 * nối dòng bằng dấu cách): khớp chính xác chỉ được 226; bản chỉ nới giữa `><` được 900 — hỏng mọi
 * khối có `">\n      Chữ…`; bản này 1.468/1.468, span đúng từng ký tự.
 * `\s*` ở HAI ĐẦU mẫu bị cắt bỏ: để lại thì span nuốt dấu cách ngoài đoạn, thẻ inline giữa câu
 * (`Xem <a>…</a> tại đây`) bị dính chữ sau khi thay.
 */
function buildLooseRegex(find) {
  const compact = find.trim().replace(/>\s+/g, '>').replace(/\s+</g, '<');
  const escaped = compact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = escaped
    .replace(/\s+/g, '\\s+')
    .replace(/>/g, '>\\s*')
    .replace(/</g, '\\s*<')
    .replace(/^\\s\*/, '')
    .replace(/\\s\*$/, '');
  return new RegExp(pattern, 'g');
}

/**
 * @param {string} html
 * @param {Array<{ find: string, replace: string }>} edits
 * @returns {{ html: string, applied: number }}
 * @throws {Error & { code: string, details: { index: number } }}
 *   LANDING_PATCH_EMPTY | LANDING_PATCH_INVALID | LANDING_PATCH_NOT_FOUND | LANDING_PATCH_AMBIGUOUS
 */
export function applyHtmlEdits(html, edits) {
  if (!Array.isArray(edits) || edits.length === 0) {
    throw patchError('LANDING_PATCH_EMPTY', 'Không có bản vá nào để áp dụng.', 0);
  }

  let current = String(html ?? '');

  edits.forEach((edit, index) => {
    const find = edit?.find;
    const replace = edit?.replace;
    if (typeof find !== 'string' || find.trim() === '' || typeof replace !== 'string') {
      throw patchError('LANDING_PATCH_INVALID', `Bản vá #${index + 1} thiếu "find" hoặc "replace" hợp lệ.`, index);
    }

    let start;
    let end;

    // Tầng 1: khớp chính xác.
    const positions = findExactPositions(current, find);
    if (positions.length > 1) {
      throw patchError('LANDING_PATCH_AMBIGUOUS', `Bản vá #${index + 1}: đoạn "find" xuất hiện ${positions.length} chỗ.`, index);
    }
    if (positions.length === 1) {
      start = positions[0];
      end = start + find.length;
    } else {
      // Tầng 2: khớp nới khoảng trắng.
      const matches = [...current.matchAll(buildLooseRegex(find))];
      if (matches.length === 0) {
        throw patchError('LANDING_PATCH_NOT_FOUND', `Bản vá #${index + 1}: không tìm thấy đoạn "find" trong trang.`, index);
      }
      if (matches.length > 1) {
        throw patchError('LANDING_PATCH_AMBIGUOUS', `Bản vá #${index + 1}: đoạn "find" khớp ${matches.length} chỗ.`, index);
      }
      start = matches[0].index;
      end = start + matches[0][0].length;
    }

    // Ghép bằng cắt chuỗi — KHÔNG dùng String.replace (chuỗi thay thế diễn giải `$&`, `$1`, `$$`).
    current = current.slice(0, start) + replace + current.slice(end);
  });

  return { html: current, applied: edits.length };
}
