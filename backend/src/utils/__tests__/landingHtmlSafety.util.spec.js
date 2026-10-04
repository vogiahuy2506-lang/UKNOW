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
 * B-1 (2) — chốt an toàn đầu ra AI landing. Mỗi ca "lách" ở đây là một chỗ mà bộ quét hiểu HTML KHÁC trình
 * duyệt sẽ để sót; ca sai-dương (trang hợp lệ bị chặn nhầm) cũng được ghim vì chặn nhầm khách là tác hại thật.
 */

const page = (body, head = '') =>
  `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>` +
  `<title>T</title><script src="https://cdn.tailwindcss.com"></script>${head}</head><body>${body}</body></html>`;

const kinds = (html, baselineHtml = '') => findUnsafeLandingHtml(html, { baselineHtml }).map((f) => f.kind);

describe('landingHtmlSafety — trang hợp lệ KHÔNG bị chặn nhầm (sinh mới, không bản cũ)', () => {
  it('trang Tailwind điển hình có form capture, liên kết, ảnh, JSON-LD → không có điểm lạ', () => {
    const html = page(
      '<h1 class="text-3xl">Khoá học</h1>' +
        '<a href="https://example.com/x?a=1&amp;b=2">Xem</a> <a href="/#gia">Giá</a> <a href="mailto:a@b.c">Mail</a> <a href="tel:0900000000">Gọi</a>' +
        '<img src="https://x.test/a.png" alt="a" class="w-10"/>' +
        '<form data-founderai-capture><input name="email" type="email"/><button type="submit">Gửi</button></form>' +
        '<div data-onclick="x" class="online once">onclick="văn bản thường" javascript:void(0) trong chữ</div>' +
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

  it('khối dữ liệu không chạy (ld+json, template, json) không bị chặn; module/không type/JS thì có', () => {
    expect(kinds('<script type="text/template"><div onclick="x()"></div></script>').filter((k) => k === 'script')).toEqual([]);
    expect(kinds('<script type="application/json">{"a":1}</script>')).toEqual([]);
    expect(kinds('<script type="module">import "x"</script>')).toEqual(['script']);
    expect(kinds('<script type="text/javascript">1</script>')).toEqual(['script']);
    expect(kinds('<script type=" TEXT/JAVASCRIPT ">1</script>')).toEqual(['script']);
    expect(kinds('<script>1</script>')).toEqual(['script']);
  });
});

describe('landingHtmlSafety — chặn script / on*= / javascript: / form action ngoài (sinh mới)', () => {
  it('script inline và script ngoài lạ', () => {
    expect(kinds(page('<script>alert(1)</script>'))).toEqual(['script']);
    expect(kinds(page('<script src="https://evil.test/x.js"></script>'))).toEqual(['script']);
    expect(kinds(page('<script>tailwind.config = { theme: {} }</script>'))).toEqual(['script']);
  });

  it('kẻ gian tự host lp-track.js / founderai-capture.js / form-embed.js KHÔNG được coi là script hệ thống', () => {
    for (const name of ['lp-track.js', 'founderai-capture.js', 'form-embed.js']) {
      expect(kinds(page(`<script src="https://evil.test/${name}" defer></script>`))).toEqual(['script']);
    }
  });

  it('script không đóng, tự đóng, viết hoa, chen khoảng trắng đều bị bắt', () => {
    expect(kinds('<div><script>alert(1)')).toEqual(['script']);
    expect(kinds('<SCRIPT SRC=//evil.test/x.js></SCRIPT>')).toEqual(['script']);
    expect(kinds('<script\n  src = "https://evil.test/x.js"\n></script>')).toEqual(['script']);
    expect(kinds('<svg><script/><img src=x></svg>')).toContain('script');
  });

  it('thuộc tính on*= mọi dạng', () => {
    expect(kinds('<img src="x" onerror="alert(1)">')).toEqual(['event']);
    expect(kinds('<BODY ONLOAD=alert(1)>')).toEqual(['event']);
    expect(kinds('<img/src=x onerror=alert(1)>')).toEqual(['event']);
    expect(kinds('<svg/onload=alert(1)>')).toEqual(['event']);
    // `/` trong giá trị KHÔNG nháy thuộc về giá trị (đúng tokenizer HTML5): đây là src="x/onerror=alert(1)", không có handler.
    expect(kinds('<img/src=x/onerror=alert(1)>')).toEqual([]);
    expect(kinds('<div onclick = "go()">x</div>')).toEqual(['event']);
    expect(kinds("<a href='#' onmouseover='a()'>x</a>")).toEqual(['event']);
    expect(kinds('<svg onload="a()"></svg>')).toEqual(['event']);
    expect(kinds('<button\nonclick\n=\n"a()">x</button>')).toEqual(['event']);
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

  it('srcdoc và thẻ chữ thô lồng quá sâu', () => {
    expect(kinds('<iframe srcdoc="<p>hi</p>"></iframe>')).toEqual(['srcdoc']);
    expect(kinds('<style>'.repeat(10) + 'x')).toContain('structure');
  });
});

describe('landingHtmlSafety — lối lách do parser hiểu khác trình duyệt (mỗi ca là một bài kiểm bộ quét)', () => {
  it('script nằm sau thuộc tính có `<!--` trong giá trị → vẫn là script thật', () => {
    expect(kinds('<a title="<!-- "></a><script>alert(1)</script><a title=" -->"></a>')).toEqual(['script']);
  });

  it('chú thích đóng sớm `<!-->` và `<!--->` không che được script phía sau', () => {
    expect(kinds('<!--><script>alert(1)</script>')).toEqual(['script']);
    expect(kinds('<!---><script>alert(1)</script>')).toEqual(['script']);
    expect(kinds('<!-- x --!><script>alert(1)</script>')).toEqual(['script']);
  });

  it('script thật nằm giữa hai chú thích có nháy kép → bắt được (chú thích đóng ở `-->` đầu tiên)', () => {
    expect(kinds('<!-- <a title=" --><script>alert(1)</script><!-- "> -->')).toEqual(['script']);
  });

  it('script bên trong chú thích thì KHÔNG phải script (trình duyệt không chạy)', () => {
    expect(kinds('<!-- <script>alert(1)</script> --><p>x</p>')).toEqual([]);
    expect(kinds('<!--[if IE]><script src="x.js"></script><![endif]--><p>x</p>')).toEqual([]);
  });

  it('thẻ chữ thô (iframe/noscript/title/style/textarea) không che được script thật sau đó', () => {
    expect(kinds('<iframe><a href="</iframe><script>alert(1)</script><a href=""></iframe>')).toContain('script');
    expect(kinds('<noscript><p title="</noscript><script>alert(1)</script>"></noscript>')).toContain('script');
    expect(kinds('<title><a href="</title><script>alert(1)</script><a href=""></title>')).toContain('script');
    expect(kinds('<style><a href="</style><script>alert(1)</script><a href=""></style>')).toContain('script');
    expect(kinds('<textarea><a href="</textarea><script>alert(1)</script><a href=""></textarea>')).toContain('script');
  });

  it('SVG: <title>/<style> là thẻ thường trong foreign content → handler bên trong vẫn bị bắt', () => {
    expect(kinds('<svg><title><img src=x onerror=alert(1)></title></svg>')).toContain('event');
    expect(kinds('<svg><style><img src=x onerror=alert(1)></style></svg>')).toContain('event');
  });

  it('thuộc tính trùng tên: trình duyệt giữ cái đầu tiên', () => {
    expect(kinds('<a href="/ok" href="javascript:alert(1)">x</a>')).toEqual([]);
    expect(kinds('<a href="javascript:alert(1)" href="/ok">x</a>')).toEqual(['jsurl']);
  });

  it('thẻ chưa đóng khi hết chuỗi bị trình duyệt bỏ → không tính', () => {
    expect(kinds('<p>x</p><img src=x onerror=alert(1)')).toEqual([]);
  });

  it('trang lớn quét xong nhanh, không bùng nổ với thẻ chữ thô lồng nhau', () => {
    const big = '<div class="a" id="b">chữ</div>\n'.repeat(15000) + '<style>'.repeat(5000);
    const started = Date.now();
    findUnsafeLandingHtml(big);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

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

  it('script inline của khách đã có: chỉ khác khoảng trắng/xuống dòng → qua; đổi nội dung → bị bắt', () => {
    const old = page('<script>\n  window.dataLayer = window.dataLayer || [];\n  gtag("js", new Date());\n</script>');
    const same = page('<script>window.dataLayer = window.dataLayer || []; gtag("js",   new Date());</script>');
    const changed = page('<script>window.dataLayer = window.dataLayer || []; gtag("js", new Date()); fetch("https://evil.test")</script>');
    expect(findUnsafeLandingHtml(same, { baselineHtml: old })).toEqual([]);
    expect(kinds(changed, old)).toEqual(['script']);
  });

  it('bản cũ có script A; bản mới có A + B → chỉ B bị báo', () => {
    const old = page('<script src="https://cdn.example.com/a.js"></script>');
    const next = page('<script src="https://cdn.example.com/a.js"></script><script src="https://evil.test/b.js"></script>');
    const found = findUnsafeLandingHtml(next, { baselineHtml: old });
    expect(found).toHaveLength(1);
    expect(found[0].sample).toContain('evil.test/b.js');
  });

  it('kẻ gian thêm bản "giả" của lp-track.js từ tên miền khác vào trang vốn có lp-track.js thật → bị bắt', () => {
    const old = page('<p>a</p>' + lpTrack);
    const next = page('<p>a</p>' + lpTrack + '<script src="https://evil.test/lp-track.js"></script>');
    expect(kinds(next, old)).toEqual(['script']);
  });

  it('on*= và form action ngoài đã có ở bản cũ → giữ nguyên là qua; thêm/đổi → bị bắt', () => {
    const old = page('<button onclick="openMenu()">m</button><form action="https://hooks.example.com/f" method="post"></form>');
    expect(findUnsafeLandingHtml(old, { baselineHtml: old })).toEqual([]);
    expect(kinds(old.replace('openMenu()', 'steal()'), old)).toEqual(['event']);
    expect(kinds(old.replace('hooks.example.com', 'evil.test'), old)).toEqual(['action']);
    expect(kinds(old.replace('<p>', '<p>') + '<img src=x onerror=alert(1)>', old)).toEqual(['event']);
  });

  it('`<script/>` tự đóng KHÔNG BAO GIỜ được bản cũ che chở', () => {
    const old = page('<svg><script/></svg>');
    expect(kinds(old, old)).toContain('script');
  });

  it('bản cũ có javascript: (khách tự dán) và AI giữ nguyên → qua; AI thêm cái mới → bị bắt', () => {
    const old = page('<a href="javascript:void(0)">x</a>');
    expect(findUnsafeLandingHtml(old, { baselineHtml: old })).toEqual([]);
    expect(kinds(old + '<a href="javascript:alert(1)">y</a>', old)).toEqual(['jsurl']);
  });
});

describe('landingHtmlSafety — lỗi trả về', () => {
  it('assertLandingHtmlSafe ném 422 mã LANDING_UNSAFE_OUTPUT, câu tiếng Việt, không lộ regex/hàm', () => {
    let err;
    try {
      assertLandingHtmlSafe('<script>alert(1)</script><img src=x onerror=a()>');
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(err.status).toBe(422);
    expect(err.code).toBe(LANDING_UNSAFE_OUTPUT_CODE);
    expect(err.message).toMatch(/AI vừa thêm mã chạy/);
    expect(err.message).toMatch(/thuộc tính chạy mã/);
    expect(err.message).toMatch(/trình soạn HTML/);
    expect(err.details.findings.map((f) => f.kind).sort()).toEqual(['event', 'script']);
  });

  it('HTML sạch → không ném', () => {
    expect(() => assertLandingHtmlSafe(page('<p>ok</p>'))).not.toThrow();
  });

  it('buildUnsafeRetryRule: sinh mới không nhắc "script đã có sẵn"; sửa thì có', () => {
    const f = [{ kind: 'script', sample: 'x' }];
    expect(buildUnsafeRetryRule(f, { regenerateWhat: 'Sinh lại toàn bộ trang' })).not.toMatch(/ĐÃ CÓ SẴN/);
    expect(buildUnsafeRetryRule(f, { regenerateWhat: 'Sinh lại kết quả sửa', hasExistingHtml: true })).toMatch(/ĐÃ CÓ SẴN/);
    expect(describeUnsafeKinds([{ kind: 'script' }, { kind: 'event' }, { kind: 'script' }])).toBe('script,event');
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
