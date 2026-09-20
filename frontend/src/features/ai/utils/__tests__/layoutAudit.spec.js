import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildFullLandingHtml,
  buildLayoutAuditSrcDoc,
  runLayoutAudit,
  describeFindingsForAi,
  describeFindingsForUser,
  LAYOUT_AUDIT_SCRIPT,
  LAYOUT_AUDIT_MESSAGE_TYPE,
} from '../layoutAudit.js';

// jsdom không có layout → bộ đo THẬT (đo hình học) được nghiệm thu bằng Chromium ở
// e2e/layout-audit/layoutAudit.spec.js. Ở đây ghim phần thuần: dựng HTML, nhúng script, giao thức
// iframe ↔ cha, và câu diễn đạt.

// ── Bản gốc của LandingPageCard.jsx:52-76 (trước khi tách) — chuẩn để ghim "hành vi không đổi" ──
const legacyBuildFullHtml = (page) => {
  const rawHtml = page.html || '';
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
  <title>${page.title || 'Landing Page'}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { margin: 0; padding: 0; }
    ${page.css || ''}
  </style>
</head>
<body>
  ${rawHtml}
</body>
</html>`;
};

describe('buildFullLandingHtml', () => {
  it('fragment: bọc thành tài liệu đầy đủ, thêm Tailwind CDN + css + title', () => {
    const page = { html: '<section>Xin chào</section>', css: '.x{color:red}', title: 'Trang thử' };
    const out = buildFullLandingHtml(page);
    expect(out).toBe(legacyBuildFullHtml(page));
    expect(out.startsWith('<!DOCTYPE html>\n<html lang="vi">')).toBe(true);
    expect(out).toContain('<title>Trang thử</title>');
    expect(out).toContain('<script src="https://cdn.tailwindcss.com"></script>');
    expect(out).toContain('.x{color:red}');
    expect(out).toContain('<body>\n  <section>Xin chào</section>\n</body>');
  });

  it('fragment thiếu title/css: dùng "Landing Page", không chèn gì thừa', () => {
    const page = { html: '<p>a</p>' };
    const out = buildFullLandingHtml(page);
    expect(out).toBe(legacyBuildFullHtml(page));
    expect(out).toContain('<title>Landing Page</title>');
  });

  it('html rỗng / thiếu: vẫn bọc, không throw', () => {
    expect(buildFullLandingHtml({})).toBe(legacyBuildFullHtml({}));
    expect(buildFullLandingHtml({ html: '' })).toBe(legacyBuildFullHtml({ html: '' }));
  });

  it('tài liệu đầy đủ THIẾU Tailwind: chèn CDN + css ngay sau <head>', () => {
    const page = {
      html: '<!DOCTYPE html><html><head lang="vi"><title>t</title></head><body>x</body></html>',
      css: 'body{margin:0}',
    };
    const out = buildFullLandingHtml(page);
    expect(out).toBe(legacyBuildFullHtml(page));
    expect(out).toContain(
      '<head lang="vi">\n  <script src="https://cdn.tailwindcss.com"></script>\n  <style>body{margin:0}</style><title>t</title>',
    );
  });

  it('tài liệu đầy đủ ĐÃ có Tailwind + css: không chèn CDN lần hai, vẫn chèn css', () => {
    const page = {
      html: '<html><head><script src="https://cdn.tailwindcss.com"></script></head><body>x</body></html>',
      css: '.a{b:c}',
    };
    const out = buildFullLandingHtml(page);
    expect(out).toBe(legacyBuildFullHtml(page));
    expect(out.match(/cdn\.tailwindcss\.com/g)).toHaveLength(1);
    expect(out).toContain('<style>.a{b:c}</style>');
  });

  it('tài liệu đầy đủ không có <head>: giữ nguyên như bản cũ', () => {
    const page = { html: '<html><body>x</body></html>', css: '.a{}' };
    expect(buildFullLandingHtml(page)).toBe(legacyBuildFullHtml(page));
    expect(buildFullLandingHtml(page)).toBe(page.html);
  });
});

describe('buildLayoutAuditSrcDoc', () => {
  const html = '<!DOCTYPE html><html><head></head><body><p>a</p></body></html>';

  it('chèn script đo đúng 1 lần, ngay trước </body>, nonce đúng, phần còn lại giữ nguyên', () => {
    const out = buildLayoutAuditSrcDoc(html, { nonce: 'abc-1280' });
    expect(out.match(/__FOUNDERAI_AUDIT_NONCE__="abc-1280"/g)).toHaveLength(1);
    expect(out.match(/<script>/g)).toHaveLength(1);
    expect(out.indexOf(LAYOUT_AUDIT_SCRIPT)).toBeGreaterThan(-1);
    expect(out.indexOf(LAYOUT_AUDIT_SCRIPT)).toBeLessThan(out.indexOf('</body>'));
    expect(out.endsWith('</body></html>')).toBe(true);
    const stripped = out.replace(/<script>window\.__FOUNDERAI_AUDIT_NONCE__=[\s\S]*?<\/script>(?=<\/body>)/, '');
    expect(stripped).toBe(html);
  });

  it('không có </body>: nối vào cuối chuỗi', () => {
    const out = buildLayoutAuditSrcDoc('<p>mảnh</p>', { nonce: 'n' });
    expect(out.startsWith('<p>mảnh</p><script>')).toBe(true);
    expect(out.endsWith('</script>')).toBe(true);
  });

  it('</body> viết hoa và nhiều </body>: chèn trước cái CUỐI CÙNG', () => {
    const out = buildLayoutAuditSrcDoc('<body>a</BODY><script>var s="</body>";</script></BODY>', { nonce: 'n' });
    const at = out.indexOf('<script>window.__FOUNDERAI');
    expect(out.slice(at - 9, at)).toBe('</script>');
    expect(out.endsWith('</BODY>')).toBe(true);
  });

  it('nonce độc hại không thoát khỏi thẻ <script>', () => {
    const out = buildLayoutAuditSrcDoc(html, { nonce: '</script><img src=x onerror=alert(1)>' });
    expect(out).not.toContain('</script><img');
    expect(out).toContain('\\u003c/script>');
  });

  it('script đo hợp lệ cú pháp và không tự chứa thẻ đóng script', () => {
    expect(() => new Function(LAYOUT_AUDIT_SCRIPT)).not.toThrow();
    expect(LAYOUT_AUDIT_SCRIPT.toLowerCase()).not.toContain('</script');
    expect(LAYOUT_AUDIT_SCRIPT).toContain(LAYOUT_AUDIT_MESSAGE_TYPE);
  });

  it('script đo không đụng tới cha ngoài postMessage (không nới sandbox)', () => {
    expect(LAYOUT_AUDIT_SCRIPT).not.toMatch(/parent\.(?!postMessage)/);
    expect(LAYOUT_AUDIT_SCRIPT).not.toMatch(/top\.|contentDocument|localStorage|document\.cookie/);
  });
});

describe('runLayoutAudit (iframe thật của jsdom + phát message giả)', () => {
  let created;

  function spyIframes() {
    created = [];
    const original = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag, ...rest) => {
      const el = original(tag, ...rest);
      if (String(tag).toLowerCase() === 'iframe') created.push(el);
      return el;
    });
  }

  const nonceOf = (iframe) => JSON.parse(/__FOUNDERAI_AUDIT_NONCE__=("[^"]*")/.exec(iframe.srcdoc)[1]);
  const widthOf = (iframe) => Number(/(?:^|;)\s*width:\s*(\d+)px/.exec(iframe.style.cssText)[1]);
  const post = (data) => window.dispatchEvent(new MessageEvent('message', { data }));
  const reply = (iframe, findings, extra = {}) =>
    post({ type: LAYOUT_AUDIT_MESSAGE_TYPE, nonce: nonceOf(iframe), width: widthOf(iframe), findings, ...extra });
  const finding = (over = {}) => ({
    kind: 'text_covered', width: 1280, text: 'a', selector: 'span:nth-of-type(1)',
    coveredBy: null, overlapPx: 12, sectionTitle: '', ...over,
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('tạo 2 iframe ẩn đúng thông số, sandbox chỉ allow-scripts, gỡ sạch khi xong', async () => {
    spyIframes();
    const promise = runLayoutAudit('<html><body>x</body></html>');
    expect(created).toHaveLength(2);
    expect(created.map(widthOf)).toEqual([1280, 390]);
    for (const iframe of created) {
      expect(document.body.contains(iframe)).toBe(true);
      expect(iframe.getAttribute('sandbox')).toBe('allow-scripts');
      expect(iframe.getAttribute('sandbox')).not.toContain('allow-same-origin');
      const css = iframe.style.cssText.replace(/\s+/g, '');
      expect(css).toContain('position:fixed');
      expect(css).toContain('left:-10000px');
      expect(css).toContain('top:0');
      expect(css).toContain('height:2400px');
      expect(css).toContain('visibility:hidden');
      expect(css).toContain('pointer-events:none');
      expect(iframe.srcdoc).toContain(LAYOUT_AUDIT_SCRIPT);
    }
    expect(nonceOf(created[0])).not.toBe(nonceOf(created[1]));

    reply(created[0], [finding()]);
    reply(created[1], []);
    const result = await promise;
    expect(result.timedOut).toBe(false);
    expect(result.errors).toEqual([]);
    expect(result.findings).toHaveLength(1);
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
  });

  it('gộp theo thứ tự widths (1280 trước 390), khử trùng kind+selector+text, tối đa 12', async () => {
    spyIframes();
    const promise = runLayoutAudit('<html><body>x</body></html>');
    // 390 trả trước: thứ tự kết quả vẫn phải theo widths, không theo thứ tự đến
    reply(created[1], [
      finding({ width: 390, kind: 'text_clipped', text: 'm', selector: 'p:nth-of-type(1)' }),
      finding({ width: 390, text: 'trùng', selector: 's:nth-of-type(1)' }),
    ]);
    reply(created[0], [
      finding({ text: 'trùng', selector: 's:nth-of-type(1)' }),
      ...Array.from({ length: 15 }, (_, i) => finding({ text: `t${i}`, selector: `b:nth-of-type(${i + 1})` })),
    ]);
    const { findings } = await promise;
    expect(findings).toHaveLength(12);
    expect(findings[0]).toMatchObject({ width: 1280, text: 'trùng' });
    expect(findings.filter((f) => f.text === 'trùng')).toHaveLength(1);
    expect(findings.every((f) => f.width === 1280)).toBe(true);
  });

  it('bỏ qua message sai nonce / sai type / không phải object, rồi nhận message đúng', async () => {
    spyIframes();
    const promise = runLayoutAudit('<html><body>x</body></html>', { widths: [1280] });
    post({ type: LAYOUT_AUDIT_MESSAGE_TYPE, nonce: 'khong-phai-nonce', width: 1280, findings: [finding({ text: 'GIẢ' })] });
    post({ type: 'khac', nonce: nonceOf(created[0]), findings: [finding({ text: 'GIẢ' })] });
    post('chuỗi');
    post(null);
    expect(document.body.contains(created[0])).toBe(true);
    reply(created[0], [finding({ text: 'thật' })]);
    const { findings } = await promise;
    expect(findings.map((f) => f.text)).toEqual(['thật']);
  });

  it('quá hạn: timedOut=true, giữ findings của bề rộng đã xong, gỡ iframe, message trễ vô hại', async () => {
    vi.useFakeTimers();
    spyIframes();
    const promise = runLayoutAudit('<html><body>x</body></html>', { timeoutMs: 6000 });
    reply(created[0], [finding({ text: 'kịp' })]);
    await vi.advanceTimersByTimeAsync(5999);
    expect(document.querySelectorAll('iframe')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2);
    const result = await promise;
    expect(result.timedOut).toBe(true);
    expect(result.findings.map((f) => f.text)).toEqual(['kịp']);
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
    expect(() => reply(created[1], [finding({ text: 'trễ' })])).not.toThrow();
  });

  it('không có kết quả nào trước hạn: findings rỗng, timedOut=true (không bao giờ chặn người dùng)', async () => {
    vi.useFakeTimers();
    spyIframes();
    const promise = runLayoutAudit('<html><body>x</body></html>', { timeoutMs: 500 });
    await vi.advanceTimersByTimeAsync(500);
    await expect(promise).resolves.toEqual({ findings: [], timedOut: true, errors: [] });
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
  });

  it('script đo báo lỗi: findings rỗng, mã lỗi vào errors (không im lặng, không thành finding)', async () => {
    spyIframes();
    const promise = runLayoutAudit('<html><body>x</body></html>', { widths: [1280] });
    reply(created[0], [], { error: 'tailwind_not_loaded' });
    await expect(promise).resolves.toEqual({ findings: [], timedOut: false, errors: ['tailwind_not_loaded'] });
  });

  it('tôn trọng widths tuỳ chọn', async () => {
    spyIframes();
    const promise = runLayoutAudit('<html><body>x</body></html>', { widths: [768] });
    expect(created.map(widthOf)).toEqual([768]);
    reply(created[0], []);
    await promise;
  });
});

describe('describeFindingsForAi', () => {
  const covered = {
    kind: 'text_covered', width: 1280, text: '03/02/2026',
    selector: 'span.block.text-lg.font-extrabold.text-nationalRed:nth-of-type(1)',
    coveredBy: { text: '1', selector: 'div.absolute.-left-11.top-1.5.bg-nationalRed.text-white.w-8:nth-of-type(1)' },
    overlapPx: 12, side: 'right', sectionTitle: 'Dòng Thời Gian Lịch Sử 2026',
  };

  it('chữ bị đè: một dòng kỹ thuật đủ để model tìm đúng chỗ trong HTML', () => {
    expect(describeFindingsForAi([covered])).toBe(
      '[Đo bố cục ở 1280px] Chữ "03/02/2026" (span.block.text-lg.font-extrabold.text-nationalRed:nth-of-type(1), trong "Dòng Thời Gian Lịch Sử 2026") ' +
        'bị div.absolute.-left-11.top-1.5.bg-nationalRed.text-white.w-8:nth-of-type(1) ("1") đè 12px ở mép phải.',
    );
  });

  it('che gần hết, không rõ ai che, không có section', () => {
    const out = describeFindingsForAi([
      { ...covered, side: 'all', sectionTitle: '' },
      { ...covered, coveredBy: null, side: 'left', text: 'x', sectionTitle: '' },
    ]).split('\n');
    expect(out[0]).toContain('bị div.absolute');
    expect(out[0]).toContain('che gần hết.');
    expect(out[0]).not.toContain('trong "');
    expect(out[1]).toContain('bị một phần tử khác đè 12px ở mép trái.');
  });

  it('bị cắt và tràn màn hình, mỗi finding một dòng, ghi đúng bề rộng', () => {
    const out = describeFindingsForAi([
      { kind: 'text_clipped', width: 1280, text: 'Tiêu đề dài', selector: 'h3.truncate:nth-of-type(1)', overlapPx: 80, sectionTitle: 'Bảng giá' },
      { kind: 'text_offscreen', width: 390, text: 'Dòng dài', selector: 'p:nth-of-type(2)', overlapPx: 44, sectionTitle: '' },
    ]).split('\n');
    expect(out).toHaveLength(2);
    expect(out[0]).toBe('[Đo bố cục ở 1280px] Chữ "Tiêu đề dài" (h3.truncate:nth-of-type(1), trong "Bảng giá") bị cắt mất khoảng 80px (overflow ẩn hoặc text-overflow: ellipsis).');
    expect(out[1]).toBe('[Đo bố cục ở 390px] Chữ "Dòng dài" (p:nth-of-type(2)) tràn ra ngoài mép màn hình 44px.');
  });

  it('rỗng / không phải mảng → chuỗi rỗng', () => {
    expect(describeFindingsForAi([])).toBe('');
    expect(describeFindingsForAi(undefined)).toBe('');
  });
});

describe('describeFindingsForUser', () => {
  // Bản dịch thật (tiếng Việt) — kiểm câu tới tay người dùng không lộ class/pixel/selector.
  const vi_ = {
    layoutStillCovered: 'Còn {count} chỗ chữ bị che ở phần "{section}".',
    layoutStillCoveredPlain: 'Còn {count} chỗ chữ bị che.',
    layoutStillClipped: 'Còn {count} chỗ chữ bị cắt.',
    layoutStillOffscreen: 'Còn {count} chỗ chữ tràn khỏi màn hình.',
  };
  const t = (key, params = {}) => vi_[key].replace(/\{(\w+)\}/g, (_, p) => params[p]);
  const f = (over) => ({
    kind: 'text_covered', width: 1280, text: 'a', selector: 'span:nth-of-type(1)',
    coveredBy: { text: '1', selector: 'div.absolute:nth-of-type(1)' }, overlapPx: 12, sectionTitle: '', ...over,
  });

  it('nhiều chỗ bị che cùng một phần → MỘT câu có tên phần', () => {
    const findings = Array.from({ length: 6 }, (_, i) => f({ text: `d${i}`, sectionTitle: 'Dòng Thời Gian Lịch Sử 2026' }));
    expect(describeFindingsForUser(findings, t)).toBe('Còn 6 chỗ chữ bị che ở phần "Dòng Thời Gian Lịch Sử 2026".');
  });

  it('hai phần khác nhau → mỗi phần một câu; không rõ phần → câu không có tên phần', () => {
    const out = describeFindingsForUser(
      [f({ text: 'a', sectionTitle: 'Bảng giá' }), f({ text: 'b', sectionTitle: 'Hỏi đáp' }), f({ text: 'c', sectionTitle: '' })],
      t,
    );
    expect(out).toBe('Còn 1 chỗ chữ bị che ở phần "Bảng giá". Còn 1 chỗ chữ bị che ở phần "Hỏi đáp". Còn 1 chỗ chữ bị che.');
  });

  it('cùng một lỗi ở 1280 và 390 chỉ tính một', () => {
    const findings = [f({ sectionTitle: 'Bảng giá' }), f({ width: 390, sectionTitle: 'Bảng giá' })];
    expect(describeFindingsForUser(findings, t)).toBe('Còn 1 chỗ chữ bị che ở phần "Bảng giá".');
  });

  it('cắt + tràn: câu riêng, theo thứ tự che → cắt → tràn', () => {
    const findings = [
      f({ kind: 'text_offscreen', text: 'o1', width: 390 }),
      f({ kind: 'text_clipped', text: 'c1' }),
      f({ kind: 'text_clipped', text: 'c2' }),
      f({ text: 'v1', sectionTitle: 'Hero' }),
    ];
    expect(describeFindingsForUser(findings, t)).toBe(
      'Còn 1 chỗ chữ bị che ở phần "Hero". Còn 2 chỗ chữ bị cắt. Còn 1 chỗ chữ tràn khỏi màn hình.',
    );
  });

  it('không lộ class, selector, pixel', () => {
    const out = describeFindingsForUser(
      [f({ selector: 'div.absolute.-left-11.w-8', overlapPx: 12, sectionTitle: 'Bảng giá' }), f({ kind: 'text_clipped', overlapPx: 80, text: 'z' })],
      t,
    );
    expect(out).not.toMatch(/px|\.absolute|nth-of-type|\d{2,}/);
  });

  it('không có finding, hoặc thiếu hàm t → chuỗi rỗng', () => {
    expect(describeFindingsForUser([], t)).toBe('');
    expect(describeFindingsForUser(undefined, t)).toBe('');
    expect(describeFindingsForUser([f()], undefined)).toBe('');
  });
});
