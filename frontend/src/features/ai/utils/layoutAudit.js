/**
 * Bộ đo hiển thị landing trong trình duyệt (PLAN_LANDING_TU_KIEM_HIEN_THI_TU_SUA_2026-09-20.md, PR-1).
 *
 * Lỗi bố cục là lỗi hình học: model nhận ảnh + HTML nhưng không đo được, nên đoán rồi tự báo "đã sửa".
 * Trình duyệt của khách là engine layout miễn phí → render trang trong iframe ẩn, đo chữ bị che / bị
 * cắt / tràn màn hình, trả findings về cho vòng tự sửa. Số đo là kênh MÁY ↔ AI; người dùng chỉ thấy
 * câu tiếng người từ `describeFindingsForUser`.
 *
 * File này KHÔNG import gì: e2e/layout-audit nạp thẳng file thật vào Chromium.
 */

// ── Dựng tài liệu đầy đủ ─────────────────────────────────────────────────────────────────────────

/**
 * Tách nguyên văn từ LandingPageCard.jsx (thêm Tailwind CDN nếu thiếu, bọc fragment). Hành vi KHÔNG
 * đổi — spec ghim cùng input → cùng output như bản cũ.
 */
export function buildFullLandingHtml(page) {
  const rawHtml = page?.html || '';
  const isFullDocument = /<!doctype\s+html/i.test(rawHtml) || /<html[\s>]/i.test(rawHtml);
  return isFullDocument
    ? rawHtml.replace(/<head([^>]*)>/i, (m, attrs) => {
        const hasTailwind = rawHtml.includes('cdn.tailwindcss.com');
        const tailwindTag = hasTailwind ? '' : '\n  <script src="https://cdn.tailwindcss.com"></script>';
        const cssTag = page.css ? `\n  <style>${page.css}</style>` : '';
        return `<head${attrs}>${tailwindTag}${cssTag}`;
      })
    : `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${page?.title || 'Landing Page'}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { margin: 0; padding: 0; }
    ${page?.css || ''}
  </style>
</head>
<body>
  ${rawHtml}
</body>
</html>`;
}

// ── Script đo chạy TRONG iframe ──────────────────────────────────────────────────────────────────

export const LAYOUT_AUDIT_MESSAGE_TYPE = 'founderai-layout-audit';

/**
 * JS thuần, chạy trong srcdoc (iframe không có allow-same-origin nên cha không đọc được
 * contentDocument → kết quả về cha bằng parent.postMessage). Đọc nonce từ
 * `window.__FOUNDERAI_AUDIT_NONCE__` do buildLayoutAuditSrcDoc đặt ngay trước.
 *
 * Cấm backtick / dấu đô-la-ngoặc-nhọn / thẻ đóng script trong chuỗi này (String.raw + nhúng vào HTML).
 *
 * Lệch có chủ ý so với plan (đã đo bằng Chromium 20/09, xem báo cáo PR-1):
 * - iframe ẩn/ngoài màn hình bị Chromium throttle requestAnimationFrame (đo: 0 lần trong 1 giây) →
 *   chờ frame bằng đua rAF với timer, không bao giờ treo.
 * - "có <style> trong head" luôn đúng vì trang tự có <style> → chờ marker `tailwindcss` trong style;
 *   thiếu Tailwind thì báo lỗi thay vì đo trang trần (đo trang trần cho dương tính giả hàng loạt).
 * - overlapPx = giao hai hình chữ nhật (chữ ∩ phần tử che), không phải số mẫu × bề rộng / 7.
 * - Khử trùng theo (phần tử, kind): 6 mốc cùng selector vẫn ra 6 finding.
 * - Bỏ qua: phần tử che trong suốt (opacity ~0), fixed/sticky (thanh dính), chữ pointer-events:none
 *   (elementFromPoint không kiểm được), chữ sr-only (hộp ≤ 1px).
 * - "cắt" chỉ tính overflow hidden/clip (auto/scroll là cuộn hợp lệ); "tràn" bỏ qua phần tử nằm hẳn
 *   ngoài màn hình (ngăn kéo, slide) và phần tử trong vùng cuộn/cắt trung gian.
 */
export const LAYOUT_AUDIT_SCRIPT = String.raw`(function () {
  var NONCE = window.__FOUNDERAI_AUDIT_NONCE__;
  var MAX_FINDINGS = 12;
  var LOAD_WAIT_MS = 2500;
  var TAILWIND_WAIT_MS = 1500;
  var FONT_WAIT_MS = 1200;
  // Hạn quét; buildLayoutAuditSrcDoc({ deadlineMs }) ghi đè được (dùng cho test quá hạn).
  var DEADLINE_MS = Number(window.__FOUNDERAI_AUDIT_DEADLINE_MS__) > 0 ? Number(window.__FOUNDERAI_AUDIT_DEADLINE_MS__) : 5200;
  var STARTED = Date.now();
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, TEXTAREA: 1, OPTION: 1, OPTGROUP: 1, HEAD: 1, TITLE: 1, IFRAME: 1 };
  var SOLID_MEDIA = { IMG: 1, VIDEO: 1, CANVAS: 1 };
  var sent = false;

  function send(findings, error) {
    if (sent) return;
    sent = true;
    var msg = { type: 'founderai-layout-audit', nonce: NONCE, width: Math.round(window.innerWidth), findings: findings };
    if (error) msg.error = String(error);
    try { parent.postMessage(msg, '*'); } catch (e) {}
  }

  function pause(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  function nextFrame() {
    return new Promise(function (resolve) {
      var done = false;
      function fire() { if (!done) { done = true; resolve(); } }
      try { requestAnimationFrame(fire); } catch (e) {}
      setTimeout(fire, 80);
    });
  }

  function waitLoad() {
    if (document.readyState === 'complete') return Promise.resolve();
    return new Promise(function (resolve) {
      window.addEventListener('load', resolve);
      setTimeout(resolve, LOAD_WAIT_MS);
    });
  }

  function tailwindApplied() {
    var styles = document.head ? document.head.querySelectorAll('style') : [];
    for (var i = 0; i < styles.length; i++) {
      if (/tailwindcss/i.test(styles[i].textContent || '')) return true;
    }
    return false;
  }

  // Trả null nếu sẵn sàng đo, ngược lại trả mã lỗi.
  async function waitTailwind() {
    if (!document.querySelector('script[src*="cdn.tailwindcss.com"]')) return null;
    if (typeof window.tailwind === 'undefined') return 'tailwind_not_loaded';
    var until = Date.now() + TAILWIND_WAIT_MS;
    while (!tailwindApplied()) {
      if (Date.now() > until) return 'tailwind_not_applied';
      await pause(50);
    }
    return null;
  }

  async function waitFonts() {
    if (document.fonts && document.fonts.ready) {
      await Promise.race([document.fonts.ready, pause(FONT_WAIT_MS)]);
    }
  }

  // ── Bộ nhớ đệm style (style không đổi trong lúc quét) ──
  var ownOpacity = new Map();
  var positioned = new Map();

  function effectiveOpacity(el) {
    var o = 1;
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
      var v = ownOpacity.get(n);
      if (v === undefined) {
        v = parseFloat(getComputedStyle(n).opacity);
        if (isNaN(v)) v = 1;
        ownOpacity.set(n, v);
      }
      o *= v;
      if (o < 0.01) return 0;
    }
    return o;
  }

  // Thanh dính / cố định (header, banner cookie, nút nổi) che chữ là chuyện cuộn bình thường.
  function inFixedOrSticky(el) {
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
      var v = positioned.get(n);
      if (v === undefined) {
        var p = getComputedStyle(n).position;
        v = p === 'fixed' || p === 'sticky';
        positioned.set(n, v);
      }
      if (v) return true;
    }
    return false;
  }

  function alphaOf(color) {
    if (!color || color === 'transparent') return 0;
    var m = /^rgba?\(([^)]*)\)/i.exec(color);
    if (m) {
      var parts = m[1].split(/[\s,\/]+/).filter(Boolean);
      return parts.length >= 4 ? parseFloat(parts[3]) : 1;
    }
    m = /\/\s*([\d.]+%?)\s*\)/.exec(color);
    if (m) return m[1].slice(-1) === '%' ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
    return 1;
  }

  function hasOwnText(el) {
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3 && /\S/.test(n.nodeValue)) return true;
    }
    return false;
  }

  function ownText(el, max) {
    var s = '';
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) s += ' ' + n.nodeValue;
    }
    return s.replace(/\s+/g, ' ').trim().slice(0, max);
  }

  // "Đặc" = che thật: có nền / ảnh nền / bóng / viền / chữ / ảnh-video-canvas, và không trong suốt.
  function isSolid(el) {
    if (effectiveOpacity(el) < 0.1) return false;
    if (inFixedOrSticky(el)) return false;
    var cs = getComputedStyle(el);
    if (alphaOf(cs.backgroundColor) > 0) return true;
    if (cs.backgroundImage && cs.backgroundImage !== 'none') return true;
    if (cs.boxShadow && cs.boxShadow !== 'none') return true;
    if (parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderRightWidth) > 0 ||
        parseFloat(cs.borderBottomWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0) return true;
    if (SOLID_MEDIA[el.tagName]) return true;
    return hasOwnText(el);
  }

  function cssPath(el) {
    var cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 6);
    var idx = 1;
    for (var s = el.previousElementSibling; s; s = s.previousElementSibling) {
      if (s.tagName === el.tagName) idx++;
    }
    return el.tagName.toLowerCase() + (cls.length ? '.' + cls.join('.') : '') + ':nth-of-type(' + idx + ')';
  }

  function cleanText(s, max) { return (s || '').replace(/\s+/g, ' ').trim().slice(0, max); }

  // Tiêu đề (h1–h3) để nói tiếng người "ở phần …": trong <section> gần nhất, không có thì tiêu đề đứng trước gần nhất.
  function sectionTitleOf(el) {
    var section = el.closest('section');
    if (section) {
      var h = section.querySelector('h1,h2,h3');
      if (h) return cleanText(h.textContent, 60);
    }
    var heads = document.querySelectorAll('h1,h2,h3');
    var found = null;
    for (var i = 0; i < heads.length; i++) {
      if (heads[i] === el || (heads[i].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) found = heads[i];
      else break;
    }
    return found ? cleanText(found.textContent, 60) : '';
  }

  function ownTextNodes(el) {
    var list = [];
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3 && /\S/.test(n.nodeValue)) list.push(n);
    }
    return list;
  }

  function usable(rect) { return rect.width >= 1 && rect.height >= 1; }

  function scrollInstant(top) {
    window.scrollTo({ top: Math.max(0, top), left: 0, behavior: 'instant' });
  }

  // ── Bị che ──
  function checkCovered(A, nodes) {
    if (getComputedStyle(A).pointerEvents === 'none') return null;
    var best = null;
    for (var ni = 0; ni < nodes.length; ni++) {
      var range = document.createRange();
      range.selectNodeContents(nodes[ni]);
      var rects = range.getClientRects();
      for (var i = 0; i < rects.length; i++) {
        var r = rects[i];
        if (!usable(r)) continue;
        if (r.top < 0 || r.bottom > window.innerHeight) {
          scrollInstant(r.top + window.scrollY - 200);
          rects = range.getClientRects();
          r = rects[i];
          if (!r || !usable(r)) continue;
        }
        var y = r.top + r.height / 2;
        if (y < 0 || y >= window.innerHeight) continue;
        var xs = [];
        for (var k = 0; k < 7; k++) xs.push(r.left + ((k + 0.5) / 7) * r.width);
        xs.push(r.right - 2, r.right - 6);
        var counts = new Map();
        for (var s = 0; s < xs.length; s++) {
          var x = xs[s];
          if (x < r.left || x > r.right || x < 0 || x >= window.innerWidth) continue;
          var B = document.elementFromPoint(x, y);
          if (!B || B === A || A.contains(B) || B.contains(A)) continue;
          counts.set(B, (counts.get(B) || 0) + 1);
        }
        counts.forEach(function (count, cand) {
          if (count < 2 || (best && best.count >= count)) return;
          if (!isSolid(cand)) return;
          best = { B: cand, count: count, rect: r };
        });
        if (best) break;
      }
      if (best) break;
    }
    if (!best) return null;
    var br = best.B.getBoundingClientRect();
    var r0 = best.rect;
    var ix0 = Math.max(r0.left, br.left), ix1 = Math.min(r0.right, br.right);
    var iy0 = Math.max(r0.top, br.top), iy1 = Math.min(r0.bottom, br.bottom);
    var iw = ix1 - ix0, ih = iy1 - iy0;
    var side;
    if (iw >= r0.width * 0.9 && ih >= r0.height * 0.9) side = 'all';
    else if (ih >= r0.height * 0.9) side = ix0 <= r0.left + 1 ? 'left' : ix1 >= r0.right - 1 ? 'right' : 'middle';
    else side = iy0 <= r0.top + 1 ? 'top' : iy1 >= r0.bottom - 1 ? 'bottom' : 'middle';
    return {
      overlapPx: Math.round(Math.max(0, Math.min(iw, ih))),
      side: side,
      coveredBy: { text: ownText(best.B, 40) || cleanText(best.B.textContent, 40), selector: cssPath(best.B) }
    };
  }

  function clips(cs) { return cs.overflowX === 'hidden' || cs.overflowX === 'clip'; }
  function scrollsOrClips(cs) { return clips(cs) || cs.overflowX === 'auto' || cs.overflowX === 'scroll'; }

  function textRects(nodes) {
    var out = [];
    for (var ni = 0; ni < nodes.length; ni++) {
      var range = document.createRange();
      range.selectNodeContents(nodes[ni]);
      var rects = range.getClientRects();
      for (var i = 0; i < rects.length; i++) if (usable(rects[i])) out.push(rects[i]);
    }
    return out;
  }

  // ── Bị cắt ──
  function checkClipped(A, rects) {
    var cs = getComputedStyle(A);
    if (clips(cs) && A.scrollWidth > A.clientWidth + 2) {
      return { overlapPx: A.scrollWidth - A.clientWidth };
    }
    var P = A.parentElement;
    while (P && P !== document.body && P !== document.documentElement && !clips(getComputedStyle(P))) P = P.parentElement;
    if (!P || P === document.body || P === document.documentElement) return null;
    var pr = P.getBoundingClientRect();
    for (var i = 0; i < rects.length; i++) {
      var r = rects[i];
      // Chữ nằm vắt ngang mép vùng cắt: bắt đầu bên trong, đuôi bị cắt. Slide nằm hẳn ngoài là chuyện cố ý.
      if (r.left >= pr.left - 2 && r.left < pr.right && r.right > pr.right + 2) {
        return { overlapPx: Math.round(r.right - pr.right) };
      }
    }
    return null;
  }

  // ── Tràn khỏi màn hình ──
  function checkOffscreen(A, rects) {
    var vw = window.innerWidth;
    for (var n = A; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      var cs = getComputedStyle(n);
      if (cs.position === 'fixed' || scrollsOrClips(cs)) return null;
    }
    for (var i = 0; i < rects.length; i++) {
      var r = rects[i];
      if (r.left >= vw || r.right <= 0) continue;
      if (r.right > vw + 2 || r.left < -2) {
        return { overlapPx: Math.round(Math.max(r.right - vw, -r.left)) };
      }
    }
    return null;
  }

  // Trả { findings, truncated }. truncated = quét bị cắt vì QUÁ HẠN (mạng chậm ăn hết thời gian chờ
  // Tailwind/font, hoặc trang quá lớn): phần chưa quét KHÔNG được coi là sạch — main() báo
  // 'scan_incomplete' để phía gọi không bao giờ hiện "đã kiểm tra ✓" cho một trang chưa kiểm xong.
  // Dừng vì đủ MAX_FINDINGS thì không tính: đã có lỗi để sửa, vòng đo sau sẽ quét tiếp.
  function scan() {
    var findings = [];
    var truncated = false;
    var seen = new Map();
    var deadline = STARTED + DEADLINE_MS;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    var A;
    function add(kind, el, extra) {
      var kinds = seen.get(el);
      if (!kinds) { kinds = {}; seen.set(el, kinds); }
      if (kinds[kind]) return;
      kinds[kind] = true;
      findings.push({
        kind: kind,
        width: Math.round(window.innerWidth),
        text: ownText(el, 60),
        selector: cssPath(el),
        coveredBy: extra.coveredBy || null,
        overlapPx: extra.overlapPx || 0,
        side: extra.side || null,
        sectionTitle: sectionTitleOf(el)
      });
    }
    while ((A = walker.nextNode())) {
      if (findings.length >= MAX_FINDINGS) break;
      if (Date.now() > deadline) { truncated = true; break; }
      if (SKIP_TAGS[A.tagName]) continue;
      var nodes = ownTextNodes(A);
      if (!nodes.length) continue;
      var box = A.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) continue;
      var cs = getComputedStyle(A);
      if (cs.visibility === 'hidden' || effectiveOpacity(A) < 0.05) continue;
      var rects = textRects(nodes);
      if (!rects.length) continue;
      var cut = checkClipped(A, rects);
      if (cut) add('text_clipped', A, cut);
      var off = checkOffscreen(A, rects);
      if (off) add('text_offscreen', A, off);
      var cov = checkCovered(A, nodes);
      if (cov) add('text_covered', A, cov);
    }
    scrollInstant(0);
    return { findings: findings, truncated: truncated };
  }

  async function main() {
    try {
      await waitLoad();
      var notReady = await waitTailwind();
      if (notReady) { send([], notReady); return; }
      await waitFonts();
      await nextFrame();
      await nextFrame();
      var result = scan();
      send(result.findings, result.truncated ? 'scan_incomplete' : null);
    } catch (e) {
      send([], 'audit_error: ' + (e && e.message ? e.message : e));
    }
  }

  main();
})();`;

function makeNonce() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {
    // rơi xuống nonce dự phòng
  }
  return `n${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

// JSON an toàn để nhúng trong <script>: chặn thoát thẻ và dấu ngắt dòng Unicode.
function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(new RegExp(String.fromCharCode(0x2028), 'g'), '\\u2028')
    .replace(new RegExp(String.fromCharCode(0x2029), 'g'), '\\u2029');
}

/**
 * Nối script đo vào TRƯỚC thẻ </body> cuối cùng (không có thì nối cuối chuỗi). Nonce được đặt ở
 * `window.__FOUNDERAI_AUDIT_NONCE__` ngay trước script.
 */
export function buildLayoutAuditSrcDoc(fullHtml, { nonce, deadlineMs } = {}) {
  const html = String(fullHtml ?? '');
  const deadline = Number.isFinite(deadlineMs) && deadlineMs > 0 ? `window.__FOUNDERAI_AUDIT_DEADLINE_MS__=${Number(deadlineMs)};` : '';
  const tag = `<script>window.__FOUNDERAI_AUDIT_NONCE__=${safeJson(nonce ?? '')};${deadline}${LAYOUT_AUDIT_SCRIPT}</script>`;
  const at = html.toLowerCase().lastIndexOf('</body>');
  if (at === -1) return html + tag;
  return html.slice(0, at) + tag + html.slice(at);
}

// ── Chạy đo ở phía cha ───────────────────────────────────────────────────────────────────────────

const AUDIT_FRAME_HEIGHT = 2400;
const MAX_FINDINGS = 12;

/**
 * Đo `fullHtml` ở từng bề rộng, mỗi bề rộng một iframe ẩn riêng (khung xem trước trong panel chat
 * hẹp ~420px nên breakpoint `sm:` khác thật). Các bề rộng chạy song song.
 *
 * Trả `{ findings, timedOut, errors }`. KHÔNG bao giờ throw và không bao giờ chặn người dùng quá
 * `timeoutMs`: quá hạn thì bề rộng chưa xong bị bỏ và `timedOut: true` (findings của bề rộng đã xong
 * vẫn giữ). `errors` là mã lỗi từ script đo (vd `tailwind_not_loaded`, `scan_incomplete` khi quét bị
 * cắt vì quá hạn) để ghi telemetry — lỗi đo không im lặng nhưng cũng không được biến thành finding.
 * Findings gộp theo thứ tự `widths` (1280 trước 390), khử trùng theo kind+selector+text, tối đa 12.
 *
 * HỢP ĐỒNG CHO PHÍA GỌI (PR-3): chỉ được coi trang là "đã kiểm, sạch" khi
 * `findings.length === 0 && !timedOut && errors.length === 0`. Có `timedOut` hoặc `errors` nghĩa là
 * CHƯA KIỂM ĐƯỢC — im lặng bỏ qua (không ✓, không báo lỗi với người dùng), tuyệt đối không hiện ✓.
 * `deadlineMs` chỉ để test nhánh quá hạn quét.
 */
export function runLayoutAudit(fullHtml, { widths = [1280, 390], timeoutMs = 6000, deadlineMs } = {}) {
  if (typeof document === 'undefined' || !document.body) {
    return Promise.resolve({ findings: [], timedOut: false, errors: ['no_document'] });
  }

  return new Promise((resolve) => {
    const base = makeNonce();
    const pending = new Map(); // nonce → { width, iframe }
    const results = new Map(); // width → findings
    const errors = [];
    let finished = false;
    let timer = null;

    function cleanup() {
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      for (const { iframe } of pending.values()) iframe.remove();
    }

    function finish(timedOut) {
      if (finished) return;
      finished = true;
      cleanup();
      const merged = [];
      const seen = new Set();
      for (const width of widths) {
        for (const f of results.get(width) || []) {
          const key = `${f.kind}|${f.selector}|${f.text}`;
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(f);
        }
      }
      resolve({ findings: merged.slice(0, MAX_FINDINGS), timedOut, errors });
    }

    function onMessage(event) {
      const data = event?.data;
      if (!data || data.type !== LAYOUT_AUDIT_MESSAGE_TYPE) return;
      const entry = pending.get(data.nonce);
      if (!entry) return;
      // Chỉ nhận từ đúng iframe đã tạo: trang được đo (HTML do AI sinh) đọc được nonce trong chính
      // nó, nhưng cửa sổ/khung KHÁC thì không được mạo danh. Message tổng hợp (test) không có source.
      if (event.source && event.source !== entry.iframe.contentWindow) return;
      pending.delete(data.nonce);
      entry.iframe.remove();
      results.set(entry.width, Array.isArray(data.findings) ? data.findings : []);
      if (data.error) errors.push(String(data.error));
      if (pending.size === 0) finish(false);
    }

    window.addEventListener('message', onMessage);
    timer = setTimeout(() => finish(true), timeoutMs);

    widths.forEach((width) => {
      const nonce = `${base}-${width}`;
      const iframe = document.createElement('iframe');
      // KHÔNG allow-same-origin: script đo không đọc/ghi được gì của trang cha.
      iframe.setAttribute('sandbox', 'allow-scripts');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.setAttribute('tabindex', '-1');
      iframe.style.cssText =
        `position:fixed;left:-10000px;top:0;width:${width}px;height:${AUDIT_FRAME_HEIGHT}px;` +
        'border:0;visibility:hidden;pointer-events:none';
      iframe.srcdoc = buildLayoutAuditSrcDoc(fullHtml, { nonce, deadlineMs });
      pending.set(nonce, { width, iframe });
      document.body.appendChild(iframe);
    });

    if (pending.size === 0) finish(false);
  });
}

// ── Diễn đạt findings ────────────────────────────────────────────────────────────────────────────

const SIDE_TEXT = { left: ' ở mép trái', right: ' ở mép phải', top: ' ở mép trên', bottom: ' ở mép dưới', middle: ' ở giữa' };

function locate(f) {
  return `(${f.selector}${f.sectionTitle ? `, trong "${f.sectionTitle}"` : ''})`;
}

/**
 * Chuỗi tiếng Việt KỸ THUẬT cho model (kênh máy → AI, người dùng không thấy). Mỗi finding một dòng.
 */
export function describeFindingsForAi(findings) {
  if (!Array.isArray(findings) || findings.length === 0) return '';
  return findings
    .map((f) => {
      const head = `[Đo bố cục ở ${f.width}px] Chữ "${f.text}" ${locate(f)}`;
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
      if (f.kind === 'text_offscreen') {
        return `${head} tràn ra ngoài mép màn hình ${f.overlapPx}px.`;
      }
      return `${head} có lỗi hiển thị (${f.kind}).`;
    })
    .join('\n');
}

/**
 * Câu tiếng người, KHÔNG số đo/class/selector. `t` là hàm i18n đã gắn namespace (`useI18n(...)`),
 * gọi với các khoá PR-3 phải thêm vào vi.js/en.js:
 *   layoutStillCovered      {count} {section}   — chữ bị che, biết tên phần
 *   layoutStillCoveredPlain {count}             — chữ bị che, không biết tên phần
 *   layoutStillClipped      {count}             — chữ bị cắt
 *   layoutStillOffscreen    {count}             — chữ tràn khỏi màn hình
 * Đếm theo chữ+vị trí duy nhất (cùng một lỗi ở 1280 và 390 chỉ tính một). Trả '' nếu không có lỗi.
 */
export function describeFindingsForUser(findings, t) {
  if (!Array.isArray(findings) || findings.length === 0 || typeof t !== 'function') return '';

  const unique = (kind) => {
    const seen = new Map();
    for (const f of findings) {
      if (f.kind !== kind) continue;
      const key = `${f.selector}|${f.text}`;
      if (!seen.has(key)) seen.set(key, f);
    }
    return [...seen.values()];
  };

  const sentences = [];

  const covered = unique('text_covered');
  if (covered.length) {
    const bySection = new Map();
    for (const f of covered) bySection.set(f.sectionTitle || '', (bySection.get(f.sectionTitle || '') || 0) + 1);
    for (const [section, count] of bySection) {
      sentences.push(
        section ? t('layoutStillCovered', { count, section }) : t('layoutStillCoveredPlain', { count }),
      );
    }
  }

  const clipped = unique('text_clipped');
  if (clipped.length) sentences.push(t('layoutStillClipped', { count: clipped.length }));

  const offscreen = unique('text_offscreen');
  if (offscreen.length) sentences.push(t('layoutStillOffscreen', { count: offscreen.length }));

  return sentences.join(' ');
}
