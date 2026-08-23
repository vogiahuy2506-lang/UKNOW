/**
 * Chụp ảnh minh hoạ cho bài hướng dẫn.
 *
 * Mỗi ảnh ứng với một ô chú thích "[ẢNH: …]" trong bài. Kết quả ghi ra
 * out/<slug>/ kèm manifest.json để script chèn biết ảnh nào vào ô nào:
 *   node backend/scripts/insertHelpScreenshots.js e2e/screenshots/out/<slug>
 *
 * CHỈ ĐỌC. Không bấm nút tạo đơn / thanh toán / lưu dữ liệu — script này chạy
 * trên tài khoản thật.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'out');

// Thêm bài mới: tạo shots/<slug>.js rồi khai báo ở đây.
const SHEETS = ['doi-goi'];

for (const slugToCapture of SHEETS) {
  test.describe(`ảnh minh hoạ — ${slugToCapture}`, () => {
    let sheet;
    const manifest = [];

    test.beforeAll(async () => {
      sheet = (await import(`./shots/${slugToCapture}.js`)).default;
      fs.mkdirSync(path.join(OUT_DIR, sheet.slug), { recursive: true });
    });

    test.afterAll(async () => {
      if (!manifest.length) return;
      fs.writeFileSync(
        path.join(OUT_DIR, slugToCapture, 'manifest.json'),
        `${JSON.stringify({ slug: slugToCapture, shots: manifest }, null, 2)}\n`,
      );
      console.log(`\n[shots] ${manifest.length} ảnh → e2e/screenshots/out/${slugToCapture}/`);
    });

    // Chạy tuần tự: các ảnh dùng chung một trang và có bước mở menu.
    test(`chụp ${slugToCapture}`, async ({ page, baseURL }) => {
      const sheetDef = (await import(`./shots/${slugToCapture}.js`)).default;
      const failures = [];
      // Ảnh nào phải BẤM vào luồng đổi gói / cần trạng thái do seed dựng sẵn thì
      // chỉ chạy khi trỏ vào máy mình. Trên tài khoản thật, bấm nhầm là đơn thật.
      const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(String(baseURL || ''));

      for (const shot of sheetDef.shots) {
        if (shot.localOnly && !isLocal) {
          console.log(`  – ${shot.name} (bỏ qua: chỉ chạy ở máy mình)`);
          continue;
        }
        const file = `${shot.name}.png`;
        try {
          const target = await shot.take(page, { baseURL });
          expect(target, `shot "${shot.name}" phải trả về một locator để chụp`).toBeTruthy();
          await target.screenshot({
            path: path.join(OUT_DIR, sheetDef.slug, file),
            animations: 'disabled',
          });
          manifest.push({ name: shot.name, file, caption: shot.caption });
          console.log(`  ✓ ${shot.name}`);
        } catch (error) {
          // Một ảnh hỏng không nên chặn các ảnh còn lại — gom lỗi, báo ở cuối.
          failures.push(`${shot.name}: ${error.message.split('\n')[0]}`);
          console.log(`  ✗ ${shot.name} — ${error.message.split('\n')[0]}`);
        }
      }

      expect(manifest.length, `không chụp được ảnh nào. Lỗi:\n${failures.join('\n')}`).toBeGreaterThan(0);
      if (failures.length) {
        console.log(`\n[shots] ${failures.length} ảnh chưa chụp được:\n  - ${failures.join('\n  - ')}`);
      }
    });
  });
}
