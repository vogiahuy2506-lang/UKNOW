/**
 * Ghép ảnh từ bản dịch tiếng Anh về lại bản tiếng Việt của bài hướng dẫn.
 *
 * Bối cảnh (22/08/2026): nút "Seed" ghi đè body_html của mọi bài mẫu bằng bản
 * trong repo, xoá sạch ảnh admin đã chèn tay. seedHelpArticles() chỉ đụng
 * `locale = 'vi'` — bản 'en' (dịch từ bản VI SAU khi đã chèn ảnh) vẫn còn nguyên
 * thẻ <img> ở đúng vị trí. Đây là nguồn duy nhất còn lưu "ảnh nào nằm ở bước nào",
 * vì storage_objects không giữ liên kết ảnh ↔ bài (nó dò ngược từ body_html).
 *
 * VÌ SAO KHÔNG SO THEO KHỐI CẤP CAO NHẤT (cách làm đầu tiên, đã thất bại):
 * ảnh phần lớn nằm BÊN TRONG <li> — bản vá danh sách trước đó kéo chú thích vào
 * trong mục — nên bộ tách khối cấp cao không nhìn thấy chúng. Thêm nữa chỉ cần
 * bản EN lệch một khối là cả bài bị loại. Thực đo trên production: 8/8 bài bị từ
 * chối, 0 ảnh cứu được.
 *
 * CÁCH LÀM Ở ĐÂY: so chuỗi THẺ của hai bản, kèm độ sâu lồng nhau.
 *   1. Cắt cả hai bản thành dãy thẻ (`<p>`, `</li>`, `<img>`, …) kèm depth.
 *   2. Nhấc mọi "đơn vị ảnh" ra khỏi bản EN → phần còn lại là bộ khung.
 *   3. Khớp khung EN với khung VI bằng dãy con chung dài nhất (LCS) trên khoá
 *      `depth:tên-thẻ`. Depth làm khoá bớt nhập nhằng hơn hẳn tên thẻ trần.
 *   4. Mỗi ảnh nằm ở khe giữa hai thẻ khung; nếu CẢ HAI thẻ đó khớp sang bản VI
 *      và ở bản VI chúng cũng đứng liền nhau thì khe đó là duy nhất → đặt ảnh
 *      vào đúng đấy. Không thoả thì bỏ qua RIÊNG tấm ảnh ấy, không loại cả bài.
 *
 * Khe bên VI được phép chứa chú thích "[ẢNH: …]" — đó chính là chỗ ảnh từng
 * đứng. Số chú thích phải bằng đúng số ảnh thì mới thay, lệch là bỏ qua.
 */

const VOID_TAGS = new Set(['br', 'img', 'hr']);

/**
 * Thẻ được tính là "khung" của bài. Mọi thẻ INLINE (<strong>, <em>, <a>, <br>,
 * <code>, <u>, <s>) cố tình bị bỏ qua, coi như chữ.
 *
 * Vì sao: máy dịch xáo trộn thẻ in đậm và link rất nhiều — cùng một câu, bản EN
 * có thể bôi đậm khác chỗ hoặc gộp hai <strong> làm một. Các bài hướng dẫn này
 * lại dày đặc <strong>. Đo thử trên production khi còn tính cả thẻ inline: hai
 * bản chỉ khớp 51–72%, tất cả 8 bài đều bị loại — trong khi ở mức khối chúng
 * gần như trùng khít (21 khối so với 22).
 *
 * Vẫn giữ <li>, <td>… trong khung, nên ảnh nằm lồng bên trong chúng vẫn định vị
 * được — đó là điểm khác cốt lõi so với cách so khối cấp cao nhất.
 */
const STRUCTURAL_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'blockquote', 'pre',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'figure', 'figcaption', 'img', 'hr', 'div', 'section',
]);

/** Chú thích chỗ-này-từng-có-ảnh do bộ chuyển Markdown sinh ra. */
const PLACEHOLDER_TEXT = /\[(?:ẢNH|ANH|IMAGE)\s*:/i;

/**
 * Hai ngưỡng khớp khung, đo theo hai chiều khác nhau vì chúng bắt hai lỗi khác nhau:
 *  - EN: gần như toàn bộ khung bản EN phải tìm được chỗ trong bản VI, nếu không
 *    thì bản EN đã dịch từ một phiên bản khác hẳn.
 *  - VI: bản VI được phép thừa ra (nó có chú thích "[ẢNH: …]" mà bản EN đã xoá,
 *    và có thể đã được seed bằng bản mới hơn) nên ngưỡng thấp hơn — nó chỉ dùng
 *    để chặn trường hợp hai bên không còn là cùng một bài.
 */
const MIN_COVERAGE_EN = 0.85;
const MIN_COVERAGE_VI = 0.6;

/**
 * Cắt HTML thành dãy thẻ KHUNG (xem `STRUCTURAL_TAGS`), kèm độ sâu lồng nhau và
 * vị trí trong chuỗi gốc. Chữ và thẻ inline không thành token — nội dung hai bản
 * khác ngôn ngữ nên không so được, chỉ khung mới so được.
 *
 * @param {string} html
 * @returns {Array<{name:string,closing:boolean,raw:string,start:number,end:number,depth:number,key:string}>}
 */
export function tokenizeTags(html) {
  const tokens = [];
  const re = /<(\/?)([a-z][a-z0-9]*)\b([^>]*)>/gi;
  let match;
  let depth = 0;
  while ((match = re.exec(html)) !== null) {
    const closing = match[1] === '/';
    const name = match[2].toLowerCase();
    if (!STRUCTURAL_TAGS.has(name)) continue;
    const selfClosing = VOID_TAGS.has(name) || /\/\s*$/.test(match[3]);
    let tokenDepth;
    if (selfClosing) {
      tokenDepth = depth;
    } else if (closing) {
      depth = Math.max(0, depth - 1);
      tokenDepth = depth;
    } else {
      tokenDepth = depth;
      depth += 1;
    }
    tokens.push({
      name,
      closing,
      raw: match[0],
      start: match.index,
      end: match.index + match[0].length,
      depth: tokenDepth,
      key: `${tokenDepth}:${closing ? '/' : ''}${name}`,
    });
  }
  return tokens;
}

/**
 * Tìm "đơn vị ảnh" trong bản EN: một <img> trần, hoặc cả khối <figure> có chứa
 * <img> (khi đó chú thích trong figcaption đi kèm luôn, không tách ra).
 *
 * @param {string} html
 * @param {ReturnType<typeof tokenizeTags>} tokens
 * @returns {Array<{from:number,to:number,html:string,src:string}>}
 */
export function findImageUnits(html, tokens) {
  const units = [];
  const consumed = new Set();
  for (let i = 0; i < tokens.length; i += 1) {
    if (consumed.has(i)) continue;
    const token = tokens[i];

    if (token.name === 'figure' && !token.closing) {
      let depth = 1;
      let close = -1;
      for (let j = i + 1; j < tokens.length; j += 1) {
        if (tokens[j].name !== 'figure') continue;
        depth += tokens[j].closing ? -1 : 1;
        if (depth === 0) { close = j; break; }
      }
      if (close > i && tokens.slice(i, close + 1).some((x) => x.name === 'img')) {
        const raw = html.slice(token.start, tokens[close].end);
        units.push({ from: i, to: close, html: raw, src: srcOf(raw) });
        for (let k = i; k <= close; k += 1) consumed.add(k);
        continue;
      }
    }

    if (token.name === 'img') {
      units.push({ from: i, to: i, html: token.raw, src: srcOf(token.raw) });
      consumed.add(i);
    }
  }
  return units;
}

function srcOf(html) {
  return html.match(/<img\b[^>]*\bsrc="([^"]*)"/i)?.[1] ?? '';
}

/**
 * Dãy con chung dài nhất giữa hai dãy khoá → bản đồ chỉ số a → chỉ số b.
 * Chỉ ghép hai phần tử có khoá GIỐNG HỆT, và giữ đúng thứ tự (đơn điệu).
 *
 * @param {string[]} a
 * @param {string[]} b
 * @returns {Map<number, number>}
 */
export function alignSequences(a, b) {
  const n = a.length;
  const m = b.length;
  const width = m + 1;
  const table = new Int32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] = a[i] === b[j]
        ? table[(i + 1) * width + (j + 1)] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + (j + 1)]);
    }
  }
  const map = new Map();
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      map.set(i, j);
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j] >= table[i * width + (j + 1)]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return map;
}

/**
 * Đoạn văn mà TOÀN BỘ nội dung nằm trong một cặp ngoặc vuông. Nhận diện chú thích
 * ảnh không phụ thuộc ngôn ngữ: "[ẢNH: …]", "[IMAGE: …]", "[Screenshot: …]" đều
 * lọt, vì máy dịch giữ dấu ngoặc kể cả khi dịch chữ bên trong.
 */
const CAPTION_LIKE = /^\s*\[[^\]]*\]\s*$/;

/**
 * Chỉ số các token tạo nên một đoạn chú thích ảnh.
 *
 * Dùng hai chỗ, với hai độ chặt khác nhau:
 *  - mẫu số khi đo độ khớp khung, và khoá khớp: dùng `CAPTION_LIKE` (lỏng, không
 *    phụ thuộc ngôn ngữ) vì phải nhận ra chú thích ở CẢ hai bản.
 *  - quyết định XOÁ một đoạn bên VI: dùng `PLACEHOLDER_TEXT` (chặt) — xoá nhầm
 *    một đoạn văn thật là mất chữ, không lấy lại được.
 *
 * @param {string} html
 * @param {ReturnType<typeof tokenizeTags>} tokens
 * @param {RegExp} pattern
 * @returns {Set<number>}
 */
function placeholderTokenIndices(html, tokens, pattern) {
  const indices = new Set();
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const open = tokens[i];
    const close = tokens[i + 1];
    if (open.name !== 'p' || open.closing) continue;
    if (close.name !== 'p' || !close.closing) continue;
    if (!pattern.test(html.slice(open.end, close.start))) continue;
    indices.add(i);
    indices.add(i + 1);
  }
  return indices;
}

/**
 * Khoá khớp cho từng token. `markCaptions = true` gắn thêm dấu vào đoạn chú thích
 * để nó không bị khớp với một đoạn văn thường.
 *
 * @param {string} html
 * @param {ReturnType<typeof tokenizeTags>} tokens
 * @param {boolean} markCaptions
 * @returns {string[]}
 */
function matchKeys(html, tokens, markCaptions) {
  if (!markCaptions) return tokens.map((token) => token.key);
  const captions = placeholderTokenIndices(html, tokens, CAPTION_LIKE);
  return tokens.map((token, i) => (captions.has(i) ? `${token.key}#anh` : token.key));
}

/** Số đoạn chú thích còn sót lại — dùng để chấm điểm hai cách khớp. */
function countCaptions(html) {
  const tokens = tokenizeTags(html);
  return placeholderTokenIndices(html, tokens, PLACEHOLDER_TEXT).size / 2;
}

/**
 * Mô tả khe tương ứng bên bản VI.
 *
 * Khe được phép có CHỮ (đó là bản dịch của chữ nằm cùng khe bên EN), nhưng thẻ
 * duy nhất được phép xuất hiện là các đoạn chú thích "[ẢNH: …]" liền nhau —
 * chính chỗ tấm ảnh từng đứng. Bất kỳ thẻ nào khác nghĩa là hai bên không còn
 * nói về cùng một vị trí nữa.
 *
 * @returns {{start:number,end:number,placeholders:number,span:{start:number,end:number}|null}|null}
 */
function describeViGap(viHtml, viTokens, prevIdx, nextIdx) {
  const start = prevIdx < 0 ? 0 : viTokens[prevIdx].end;
  const end = nextIdx >= viTokens.length ? viHtml.length : viTokens[nextIdx].start;
  const inner = viTokens.slice(prevIdx + 1, nextIdx);

  if (inner.length === 0) return { start, end, placeholders: 0, span: null };
  if (inner.length % 2 !== 0) return null;

  let placeholders = 0;
  let spanStart = null;
  let spanEnd = null;
  for (let k = 0; k < inner.length; k += 2) {
    const open = inner[k];
    const close = inner[k + 1];
    if (open.name !== 'p' || open.closing) return null;
    if (close.name !== 'p' || !close.closing) return null;
    if (!PLACEHOLDER_TEXT.test(viHtml.slice(open.end, close.start))) return null;
    // Các chú thích phải nằm liền nhau thì mới thay cả cụm được mà không nuốt chữ.
    if (spanEnd !== null && viHtml.slice(spanEnd, open.start).trim() !== '') return null;
    if (spanStart === null) spanStart = open.start;
    spanEnd = close.end;
    placeholders += 1;
  }
  return { start, end, placeholders, span: { start: spanStart, end: spanEnd } };
}

/**
 * Đếm thẻ khung theo tên — để báo cáo khi hai bản không khớp.
 * @param {string} html
 * @returns {Map<string, number>}
 */
export function structuralTagCounts(html) {
  const counts = new Map();
  for (const token of tokenizeTags(html)) {
    if (token.closing) continue;
    counts.set(token.name, (counts.get(token.name) ?? 0) + 1);
  }
  return counts;
}

/**
 * Liệt kê các thẻ khung có số lượng khác nhau giữa hai bản, dạng `p 34/31`.
 * In ra khi từ chối ghép để biết hai bản lệch ở đâu mà không phải dump cả HTML.
 *
 * @param {string} viHtml
 * @param {string} enHtml
 * @returns {string}
 */
export function describeStructureMismatch(viHtml, enHtml) {
  const vi = structuralTagCounts(viHtml);
  const en = structuralTagCounts(enHtml);
  const names = [...new Set([...vi.keys(), ...en.keys()])].sort();
  const diffs = names
    .filter((name) => (vi.get(name) ?? 0) !== (en.get(name) ?? 0))
    .map((name) => `${name} ${vi.get(name) ?? 0}/${en.get(name) ?? 0}`);
  return diffs.length ? `vi/en: ${diffs.join(', ')}` : 'số thẻ khung hai bên bằng nhau';
}

/**
 * Dựng bản tiếng Việt mới có ảnh, từ bản VI hiện tại + bản EN còn ảnh.
 *
 * Không bao giờ đoán: ảnh nào không xác định được chỗ đặt duy nhất thì bỏ qua
 * riêng tấm đó và ghi lý do, phần còn lại vẫn ghép.
 *
 * @param {string} viHtml body_html bản tiếng Việt (đã mất ảnh)
 * @param {string} enHtml body_html bản tiếng Anh (còn ảnh)
 * @returns {{ok:boolean, reason?:string, html:string, textReference:string,
 *            restored:Array<{src:string,replacedCaption:boolean}>,
 *            skipped:Array<{src:string,reason:string}>, coverage:number}}
 */
export function planImageRecovery(viHtml, enHtml) {
  const empty = {
    ok: false, html: viHtml, textReference: viHtml, restored: [], skipped: [], coverage: 0,
  };
  if (typeof viHtml !== 'string' || typeof enHtml !== 'string') {
    return { ...empty, reason: 'đầu vào không phải chuỗi' };
  }

  const enTokens = tokenizeTags(enHtml);
  const units = findImageUnits(enHtml, enTokens);
  if (units.length === 0) return { ...empty, reason: 'bản EN không có ảnh' };

  const inUnit = new Set();
  for (const unit of units) {
    for (let k = unit.from; k <= unit.to; k += 1) inUnit.add(k);
  }

  // Bộ khung EN = mọi thẻ KHÔNG thuộc đơn vị ảnh, kèm số thẻ khung đứng trước
  // mỗi token (để tính khe của từng ảnh mà không phải quét lại).
  const skeleton = [];
  const skeletonCountBefore = new Int32Array(enTokens.length + 1);
  for (let i = 0; i < enTokens.length; i += 1) {
    skeletonCountBefore[i] = skeleton.length;
    if (!inUnit.has(i)) skeleton.push(enTokens[i]);
  }
  skeletonCountBefore[enTokens.length] = skeleton.length;

  const viTokens = tokenizeTags(viHtml);
  const context = { viHtml, enHtml, enTokens, units, skeleton, skeletonCountBefore, viTokens, empty };

  // Thử hai cách khớp rồi lấy cái tốt hơn, vì không biết trước máy dịch đã làm gì
  // với chú thích "[ẢNH: …]" bên bản EN:
  //  - khoá TRẦN: đúng khi bản EN còn giữ chú thích (dù đã dịch mất dấu ngoặc).
  //  - khoá CÓ ĐÁNH DẤU: đúng khi bản EN đã xoá chú thích để chèn ảnh đè lên —
  //    khoá trần khi đó dễ khớp lệch một nhịp, đẩy ảnh ra cạnh chú thích thay vì
  //    vào đúng chỗ nó.
  const attempts = [false, true].map((mark) => buildPlan(context, mark));
  return attempts.reduce(pickBetterPlan);
}

/** Nhiều ảnh hơn thì thắng; bằng nhau thì cái để sót ít chú thích hơn thắng. */
function pickBetterPlan(current, candidate) {
  if (candidate.ok !== current.ok) return candidate.ok ? candidate : current;
  if (candidate.restored.length !== current.restored.length) {
    return candidate.restored.length > current.restored.length ? candidate : current;
  }
  if (!candidate.ok) return current;
  return countCaptions(candidate.html) < countCaptions(current.html) ? candidate : current;
}

function buildPlan(context, markCaptions) {
  const {
    viHtml, enHtml, enTokens, units, skeleton, skeletonCountBefore, viTokens, empty,
  } = context;

  const map = alignSequences(
    matchKeys(enHtml, skeleton, markCaptions),
    matchKeys(viHtml, viTokens, markCaptions),
  );
  const coverage = map.size / Math.max(skeleton.length, 1);
  const viStructural = viTokens.length - placeholderTokenIndices(viHtml, viTokens, CAPTION_LIKE).size;
  const coverageVi = map.size / Math.max(viStructural, 1);
  if (coverage < MIN_COVERAGE_EN || coverageVi < MIN_COVERAGE_VI) {
    return {
      ...empty,
      coverage,
      reason: `khung hai bản lệch quá nhiều (khớp ${Math.round(coverage * 100)}% phía EN,`
        + ` ${Math.round(coverageVi * 100)}% phía VI)`,
    };
  }

  // Gom ảnh theo khe: nhiều ảnh liền nhau nằm cùng một khe khung.
  const byGap = new Map();
  for (const unit of units) {
    const anchor = skeletonCountBefore[unit.from];
    if (!byGap.has(anchor)) byGap.set(anchor, []);
    byGap.get(anchor).push(unit);
  }

  const restored = [];
  const skipped = [];
  const edits = [];
  const claimedGaps = new Set();

  for (const [anchor, gapUnits] of byGap) {
    const skip = (reason) => {
      for (const unit of gapUnits) skipped.push({ src: unit.src, reason });
    };

    // Bên EN: các ảnh trong cùng một khe phải đứng liền nhau, và phải nằm hẳn về
    // một phía của chữ trong khe (đầu khe hoặc cuối khe). Có chữ ở CẢ HAI phía
    // nghĩa là ảnh chèn giữa câu — không suy ra được chỗ tương ứng bên VI.
    const enGapStart = anchor === 0 ? 0 : skeleton[anchor - 1].end;
    const enGapEnd = anchor >= skeleton.length ? enHtml.length : skeleton[anchor].start;
    const firstUnit = gapUnits[0];
    const lastUnit = gapUnits[gapUnits.length - 1];
    const unitsStart = enTokens[firstUnit.from].start;
    const unitsEnd = enTokens[lastUnit.to].end;
    let contiguous = true;
    for (let k = 1; k < gapUnits.length; k += 1) {
      const between = enHtml.slice(enTokens[gapUnits[k - 1].to].end, enTokens[gapUnits[k].from].start);
      if (between.trim() !== '') contiguous = false;
    }
    if (!contiguous) {
      skip('các ảnh bên EN bị chữ chen giữa — không đặt lại được cả cụm');
      continue;
    }
    const enTextBefore = enHtml.slice(enGapStart, unitsStart).trim();
    const enTextAfter = enHtml.slice(unitsEnd, enGapEnd).trim();
    if (enTextBefore !== '' && enTextAfter !== '') {
      skip('ảnh nằm giữa câu bên EN — không xác định được chỗ đặt');
      continue;
    }

    const prevSkel = anchor - 1;
    const nextSkel = anchor;
    const viPrev = prevSkel < 0 ? -1 : map.get(prevSkel);
    const viNext = nextSkel >= skeleton.length ? viTokens.length : map.get(nextSkel);
    if (viPrev === undefined || viNext === undefined) {
      skip('thẻ bao quanh ảnh không khớp được sang bản VI');
      continue;
    }
    // Hai khe khác nhau bên EN mà dồn về cùng một khe bên VI thì thứ tự đặt ảnh
    // không còn xác định — nhường tấm đầu, bỏ qua phần sau.
    const gapKey = `${viPrev}:${viNext}`;
    if (claimedGaps.has(gapKey)) {
      skip('nhiều nhóm ảnh cùng đổ về một chỗ bên VI — không xác định được thứ tự');
      continue;
    }

    const gap = describeViGap(viHtml, viTokens, viPrev, viNext);
    if (!gap) {
      skip('chỗ tương ứng bên VI có nội dung khác — bỏ qua cho an toàn');
      continue;
    }
    if (gap.placeholders !== 0 && gap.placeholders !== gapUnits.length) {
      skip(`bên VI có ${gap.placeholders} chú thích nhưng bên EN có ${gapUnits.length} ảnh — lệch`);
      continue;
    }

    // Có chú thích → ảnh về đúng chỗ chú thích đang đứng (bản EN đã xoá chú thích
    // đó khi admin chèn ảnh đè lên). Không có → bám theo phía mà bên EN đặt ảnh.
    const html = gapUnits.map((u) => u.html).join('');
    const target = gap.placeholders > 0
      ? gap.span
      : (enTextAfter === '' ? { start: gap.end, end: gap.end } : { start: gap.start, end: gap.start });
    edits.push({ start: target.start, end: target.end, insert: html, deleteOnly: '' });
    claimedGaps.add(gapKey);
    for (const unit of gapUnits) {
      restored.push({ src: unit.src, replacedCaption: gap.placeholders > 0 });
    }
  }

  if (restored.length === 0) {
    return { ...empty, coverage, reason: 'không đặt lại được tấm nào', skipped };
  }

  const apply = (field) => {
    let out = viHtml;
    for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
      out = out.slice(0, edit.start) + edit[field] + out.slice(edit.end);
    }
    return out;
  };

  return {
    ok: true,
    coverage,
    html: apply('insert'),
    // Bản VI đã xoá chú thích nhưng CHƯA chèn ảnh — mốc để chứng minh chữ không đổi.
    textReference: apply('deleteOnly'),
    restored,
    skipped,
  };
}
