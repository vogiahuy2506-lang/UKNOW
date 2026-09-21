/**
 * Nghiệm thu bộ đo hiển thị landing bằng Chromium thật (PLAN_LANDING_TU_KIEM_HIEN_THI_TU_SUA, mục 2/6-N6).
 *
 * Chạy `runLayoutAudit` THẬT (file frontend/src/features/ai/utils/layoutAudit.js nạp nguyên văn vào
 * trang test, không qua bundler) trên fixture:
 *   - timeline-de-chu.html : markup dòng thời gian lỗi thật của user 1 (session 317, 20/09) →
 *                            6 text_covered ở 1280 (mỗi cái đè ~12px), 0 ở 390.
 *   - sach.html            : trang bình thường (hero chữ trên ảnh nền, nút, slider, bảng cuộn…) → 0 ở cả hai.
 *
 * Đột biến: đặt LAYOUT_AUDIT_MODULE=<đường dẫn bản đã sửa> để chạy cùng spec trên bản đột biến
 * (spec phải ĐỎ). Không đặt = dùng file thật.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const MODULE_FILE =
  process.env.LAYOUT_AUDIT_MODULE || path.resolve(here, '../../frontend/src/features/ai/utils/layoutAudit.js');
const FIXTURES = path.resolve(here, '../fixtures/layout-audit');
const ORIGIN = 'http://audit.test';

const readFixture = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');

test.beforeEach(async ({ page }) => {
  await page.route(`${ORIGIN}/**`, (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/layoutAudit.js') {
      return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(MODULE_FILE, 'utf8') });
    }
    if (pathname === '/host.html') {
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' });
    }
    if (pathname.startsWith('/fixtures/')) {
      return route.fulfill({ contentType: 'text/html', path: path.join(FIXTURES, path.basename(pathname)) });
    }
    return route.abort();
  });
  await page.goto(`${ORIGIN}/host.html`);
});

async function audit(page, html, options) {
  return page.evaluate(
    async ({ html: source, options: opts }) => {
      const { runLayoutAudit } = await import('/layoutAudit.js');
      const result = await runLayoutAudit(source, opts);
      return { ...result, leftoverIframes: document.querySelectorAll('iframe').length };
    },
    { html, options },
  );
}

const at = (result, width) => result.findings.filter((f) => f.width === width);
const summary = (result) =>
  result.findings.map((f) => `${f.kind}@${f.width} "${f.text}" ${f.selector} overlapPx=${f.overlapPx}`);

test.describe('fixture thật', () => {
  test('timeline-de-chu.html: 6 mốc bị đè ~12px ở 1280, sạch ở 390', async ({ page }) => {
    const result = await audit(page, readFixture('timeline-de-chu.html'));
    console.log('[timeline-de-chu]', JSON.stringify({ n1280: at(result, 1280).length, n390: at(result, 390).length, timedOut: result.timedOut, errors: result.errors }));
    for (const f of result.findings) console.log('   ', JSON.stringify(f));

    expect(result.errors).toEqual([]);
    expect(result.timedOut).toBe(false);
    expect(result.leftoverIframes).toBe(0);

    const desktop = at(result, 1280);
    expect(desktop.map((f) => f.kind)).toEqual(Array(6).fill('text_covered'));
    expect(desktop.map((f) => f.text)).toEqual([
      '03/02/2026', '26/04/2026', '30/04/2026', '07/05/2026', '19/05/2026', '02/09/2026',
    ]);
    for (const f of desktop) {
      expect(f.overlapPx).toBeGreaterThanOrEqual(10);
      expect(f.overlapPx).toBeLessThanOrEqual(14);
      expect(f.sectionTitle).toContain('Dòng Thời Gian');
      expect(f.coveredBy.selector).toContain('bg-nationalRed');
      expect(f.coveredBy.text).toMatch(/^[1-6]$/);
      expect(f.side).toBe('right');
    }
    expect(at(result, 390)).toEqual([]);
  });

  test('sach.html: trang bình thường ra 0 finding ở cả hai bề rộng', async ({ page }) => {
    const result = await audit(page, readFixture('sach.html'));
    console.log('[sach]', JSON.stringify({ n1280: at(result, 1280).length, n390: at(result, 390).length, timedOut: result.timedOut, errors: result.errors }));

    expect(summary(result)).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.timedOut).toBe(false);
    expect(result.leftoverIframes).toBe(0);
  });

  test('sach.html đủ dài (> 2400px ở 1280) để bộ đo buộc phải cuộn', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${ORIGIN}/fixtures/sach.html`);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    console.log('[sach] scrollHeight@1280 =', height);
    expect(height).toBeGreaterThan(2400);
  });

  // Review 21/09: trước đây quét bị cắt vì quá hạn vẫn gửi findings: [] không kèm lỗi → phía gọi
  // đọc thành "trang sạch" và hiện ✓ cho một trang CHƯA kiểm — đúng thất bại plan cấm ("báo ✓ mà
  // vẫn đè"). Trang đang có 6 lỗi thật mà hạn quét 1ms thì kết quả phải mang lỗi scan_incomplete.
  test('quá hạn quét: trang có lỗi thật KHÔNG được báo là sạch — errors chứa scan_incomplete', async ({ page }) => {
    const result = await audit(page, readFixture('timeline-de-chu.html'), { widths: [1280], deadlineMs: 1 });
    console.log('[qua-han-quet]', JSON.stringify({ n: result.findings.length, timedOut: result.timedOut, errors: result.errors }));
    expect(result.errors).toContain('scan_incomplete');
    expect(result.findings.length).toBeLessThan(6);
    expect(result.leftoverIframes).toBe(0);
  });
});

// HTML nhỏ, CSS inline (không cần Tailwind CDN): phủ các nhánh kind mà 2 fixture không chạm tới.
const doc = (body) =>
  `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;font:16px/1.4 sans-serif}</style></head><body>${body}</body></html>`;
const IMG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='120'><rect width='300' height='120' fill='%23ccc'/></svg>";

test.describe('các loại lỗi khác (HTML nhỏ)', () => {
  test('ảnh nằm TRÊN chữ → text_covered, che gần hết', async ({ page }) => {
    const html = doc(
      `<div style="position:relative;height:120px;width:300px"><p style="position:absolute;top:40px;left:20px;margin:0">Nội dung quan trọng</p><img alt="" src="${IMG}" style="position:absolute;top:0;left:0;width:300px;height:120px"></div>`,
    );
    const result = await audit(page, html, { widths: [1280] });
    const [f, ...rest] = result.findings;
    expect(rest).toEqual([]);
    expect(f).toMatchObject({ kind: 'text_covered', text: 'Nội dung quan trọng', side: 'all' });
    expect(f.coveredBy.selector).toMatch(/^img/);
  });

  test('overflow hidden + ellipsis → text_clipped', async ({ page }) => {
    const html = doc(
      '<div style="width:120px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">Một tiêu đề rất dài bị cắt bởi dấu ba chấm</div>',
    );
    const result = await audit(page, html, { widths: [1280] });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ kind: 'text_clipped' });
    expect(result.findings[0].overlapPx).toBeGreaterThan(50);
  });

  test('chữ vắt ngang mép vùng cắt → text_clipped; vùng cuộn overflow-x:auto thì KHÔNG', async ({ page }) => {
    const html = doc(
      '<div style="width:200px;overflow:hidden"><span style="white-space:nowrap;display:block">Một dòng dài không xuống hàng bị vùng cắt cắt mất đuôi</span></div>' +
        '<div style="width:200px;overflow-x:auto"><span style="white-space:nowrap;display:block">Một dòng dài không xuống hàng nhưng vùng này cuộn được</span></div>',
    );
    const result = await audit(page, html, { widths: [1280] });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ kind: 'text_clipped', text: expect.stringContaining('bị vùng cắt cắt mất đuôi') });
  });

  test('chữ tràn khỏi màn hình điện thoại → text_offscreen ở 390, không ở 1280', async ({ page }) => {
    const html = doc('<p style="white-space:nowrap;margin:0">Một dòng chữ rất dài không chịu xuống hàng nên chạy ra ngoài mép màn hình điện thoại</p>');
    const result = await audit(page, html);
    expect(at(result, 1280)).toEqual([]);
    const mobile = at(result, 390);
    expect(mobile).toHaveLength(1);
    expect(mobile[0]).toMatchObject({ kind: 'text_offscreen' });
    expect(mobile[0].overlapPx).toBeGreaterThan(0);
  });

  test('Tailwind CDN không tải được → báo lỗi, KHÔNG đo trang trần', async ({ page }) => {
    await page.route('https://cdn.tailwindcss.com/**', (route) => route.abort());
    const html = doc('<p class="text-lg">Chữ</p>').replace('</head>', '<script src="https://cdn.tailwindcss.com"></script></head>');
    const result = await audit(page, html, { widths: [1280] });
    expect(result.findings).toEqual([]);
    expect(result.errors).toEqual(['tailwind_not_loaded']);
    expect(result.timedOut).toBe(false);
  });
});
