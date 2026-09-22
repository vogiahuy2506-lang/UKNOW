/**
 * Ảnh minh hoạ cho bài "Đồng ý nhận tin" (/huong-dan/dong-y-nhan-tin).
 *
 * Mới có ảnh bài nộp "Đã rút" (dùng chung biểu mẫu mẫu của bài `bieu-mau`). Hai ảnh còn lại cần dữ liệu lead
 * có người từ chối nhận tin + cột "Nguồn đồng ý" ở danh sách khách — chưa dựng fixture.
 */
import { highlight, highlightCell, hideVolatileChrome, settle, contentShot, paddedShot } from '../lib/shotHelpers.js';
import { ensureDemoForm, ensureDemoSubmissions, ensureConsentSourceDemo, ensureLandingLeadsNodeDemo } from '../lib/shotFixtures.js';

export default {
  slug: 'dong-y-nhan-tin',
  shots: [
    {
      name: 'bai-nop-da-rut-dong-y',
      caption: 'trang Bài nộp biểu mẫu, khoanh đỏ một dòng có cột Đồng ý tiếp thị ghi "Đã rút"',
      localOnly: true,
      async take(page) {
        await page.goto('/app/forms');
        const form = await ensureDemoForm(page);
        await ensureDemoSubmissions(page, form);

        const viewport = page.viewportSize();
        await page.setViewportSize({ width: viewport.width, height: 2200 });
        try {
          await page.goto(`/app/forms/${form.id}/submissions`);
          const row = page.locator('main table tbody tr').filter({ hasText: /Đã rút/ }).first();
          await row.waitFor({ state: 'visible', timeout: 30_000 });
          await settle(page);
          await hideVolatileChrome(page);
          // Ẩn các dòng khác để tiêu đề cột nằm sát ngay trên dòng "Đã rút" — mỗi dòng bài nộp cao cả
          // trăm pixel, để nguyên thì tiêu đề và dòng cần xem cách nhau cả màn hình.
          await page.evaluate(() => {
            for (const tr of document.querySelectorAll('main table tbody tr')) {
              if (!/Đã rút/.test(tr.innerText)) tr.style.display = 'none';
            }
          });
          await highlightCell(row.locator('td').filter({ hasText: /Đã rút/ }).first());
          await highlightCell(page.locator('main table thead th').filter({ hasText: /Đồng ý tiếp thị/i }).first());
          await page.waitForTimeout(300);

          const head = await page.locator('main table thead').first().boundingBox();
          const box = await row.boundingBox();
          const clip = { x: head.x, y: head.y, width: head.width, height: (box.y + box.height) - head.y + 6 };
          return {
            screenshot: async (options = {}) => {
              try {
                return await page.screenshot({ ...options, clip });
              } finally {
                await page.setViewportSize(viewport);
              }
            },
          };
        } catch (error) {
          await page.setViewportSize(viewport);
          throw error;
        }
      },
    },
    {
      name: 'cot-nguon-dong-y',
      caption: 'danh sách khách hàng, khoanh đỏ cột "Nguồn đồng ý"',
      localOnly: true,
      async take(page) {
        // Seed dựng khách nhưng để trống consent_source → gán luân phiên 4 nguồn cho khách của tài khoản thử.
        const { campaignId } = await ensureConsentSourceDemo();
        await page.goto(`/app/customers/${campaignId}`);
        const header = page.locator('main table thead th').filter({ hasText: /Nguồn đồng ý/ }).first();
        await header.waitFor({ state: 'visible', timeout: 30_000 });
        await page.locator('main table tbody tr').first().waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        await hideVolatileChrome(page);
        await highlightCell(header);
        await page.waitForTimeout(200);
        return contentShot(page, page.locator('main table').first(), { maxHeight: 520 });
      },
    },
    {
      name: 'node-landing-bo-qua-nguoi-tu-choi',
      caption: 'bước cấu hình nguồn người nhận từ landing page, khoanh đỏ dòng báo số người bị bỏ qua vì đã từ chối nhận tin',
      localOnly: true,
      async take(page) {
        const { campaignId, nodeName } = await ensureLandingLeadsNodeDemo();
        await page.goto(`/app/campaigns/${campaignId}/builder`);
        // Node trên sơ đồ React Flow: bấm đúp (hai cú bấm trong 300 ms) mới mở khung cấu hình.
        const node = page.locator('.react-flow__node').filter({ hasText: nodeName }).first();
        await node.waitFor({ state: 'visible', timeout: 45_000 });
        await settle(page);
        await node.dblclick();
        const warning = page.getByText(/bị bỏ qua vì đã từ chối nhận tin/).first();
        await warning.waitFor({ state: 'visible', timeout: 30_000 });
        await page.waitForTimeout(600);
        await hideVolatileChrome(page);
        await highlight(warning.locator('xpath=ancestor::p[1]'));
        await page.waitForTimeout(200);
        // Khung cấu hình của node: khối gần nhất ôm cả dòng cảnh báo lẫn tiêu đề khung.
        const panel = warning.locator('xpath=ancestor::div[contains(@class,"rounded")][.//h2 or .//h3][1]');
        return paddedShot(page, (await panel.count()) ? panel : warning.locator('xpath=ancestor::div[3]'), { pad: 12 });
      },
    },
  ],
};
