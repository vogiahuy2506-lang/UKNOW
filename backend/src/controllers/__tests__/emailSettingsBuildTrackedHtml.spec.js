/**
 * PLAN_RA_SOAT_DOT3 PR-Q1 việc 6 — buildTrackedHtml thay bằng HÀM, không bằng chuỗi: String.replace diễn giải `$&`, `$1`,
 * `$$` trong chuỗi thay thế nên nội dung nút/link có ký hiệu đô-la ("Giảm $&...", "$1 tháng đầu") bị biến dạng.
 */
import { describe, it, expect } from '@jest/globals';

const { default: emailSettingsController } = await import('../emailSettings.controller.js');

const BASE = 'https://track.example.test';
const TOKEN = 'tok-xyz';
const build = (html) => emailSettingsController.buildTrackedHtml(html, BASE, TOKEN, 5, 6, 7, {
  enableClickTracking: true,
  useShortLinkForClickTracking: false,
});

describe('buildTrackedHtml — ký hiệu $ trong nội dung email', () => {
  it('chữ trong thẻ <a> chứa `$&` và `$1` được giữ nguyên sau khi viết lại link', async () => {
    const out = await build('<body><p>Xin chào</p><a href="https://shop.example/x">Mua ngay $& chỉ $1 hôm nay $$</a></body>');

    expect(out).toContain('>Mua ngay $& chỉ $1 hôm nay $$</a>');
    expect(out).toContain(`${BASE}/api/customers/email-tracking/click/${TOKEN}?url=`);
    // Không còn link gốc trần.
    expect(out).not.toContain('href="https://shop.example/x"');
  });

  it('gắn footer + pixel trước </body> đúng một lần', async () => {
    const out = await build('<html><body><p>Nội dung</p></body></html>');

    expect(out.match(/email-tracking\/open\//g)).toHaveLength(1);
    expect(out.indexOf('email-tracking/open/')).toBeLessThan(out.indexOf('</body>'));
  });
});
