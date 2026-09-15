/**
 * Nhãn kêu gọi mở chat (launcher label) trên widget.js — chạy THẬT trong jsdom.
 *
 * widget.js không phải ES module (IIFE thuần, xem comment nhúng đầu file), nên không
 * `import` bình thường được. Đọc file như văn bản rồi eval — cùng cách đọc file mà
 * chatRenderSafety.spec.js dùng để kiểm nội dung, nhưng ở đây ta THỰC SỰ CHẠY nó trong
 * jsdom để kiểm hành vi DOM thật, không chỉ regex trên mã nguồn.
 *
 * Nhãn do chủ shop tự nhập và hiển thị trên website bên thứ ba — lỗ XSS ở đây khó vá
 * hơn nhiều so với lỗi UI thông thường (widget cũ có thể đã nhúng sẵn ở nhiều nơi).
 * Đây là chốt chặn cho `launcherLabelEl.textContent = ...` (không bao giờ innerHTML).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../..');
const FRONTEND_ROOT = path.resolve(SRC, '..');
const WIDGET_SOURCE = fs.readFileSync(path.join(FRONTEND_ROOT, 'public/widget.js'), 'utf8');

/**
 * Dựng widget.js thật trong DOM hiện tại: gán window.customChatbotConfig, giả fetch trả
 * về config từ backend, rồi eval nguyên văn file. Mỗi lần eval là một lượt chạy độc lập
 * (mọi biến của widget.js nằm trong IIFE riêng, không rò ra ngoài).
 */
async function mountWidget({ launcherLabel = '' } = {}) {
  window.customChatbotConfig = {
    token: `test_${Math.random().toString(36).slice(2)}`,
    baseUrl: '',
  };
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      json: async () => ({
        success: true,
        data: {
          name: 'Bot Test',
          launcherLabel,
        },
      }),
    })
  );

  // Chạy THẬT widget.js (IIFE thuần, không phải module) — no-eval không nằm trong bộ
  // rule của repo này nên không cần eslint-disable.
  eval(WIDGET_SOURCE);

  await vi.waitFor(() => {
    expect(document.getElementById('uknow-widget')).toBeTruthy();
  });
}

describe('widget.js — nhãn nút mở chat (launcher label)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.getElementById('uknow-style')?.remove();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('có nhãn → tạo #uknow-launcher-label với đúng nội dung', async () => {
    await mountWidget({ launcherLabel: 'Tư vấn ngay' });

    const label = document.getElementById('uknow-launcher-label');
    expect(label).toBeTruthy();
    expect(label.textContent).toBe('Tư vấn ngay');
  });

  it('nhãn chứa mã HTML độc hại → hiện nguyên chữ, KHÔNG dựng phần tử img', async () => {
    const malicious = '<img src=x onerror=alert(1)>';
    await mountWidget({ launcherLabel: malicious });

    const label = document.getElementById('uknow-launcher-label');
    expect(label).toBeTruthy();
    // textContent giữ nguyên chuỗi — không bị trình duyệt diễn giải thành thẻ HTML.
    expect(label.textContent).toBe(malicious);
    expect(label.innerHTML).not.toContain('<img');
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });

  it('nhãn rỗng → không dựng phần tử nhãn', async () => {
    await mountWidget({ launcherLabel: '' });

    expect(document.getElementById('uknow-launcher-label')).toBeNull();
  });

  it('bấm bong bóng → nhãn ẩn; bấm lại → nhãn hiện lại', async () => {
    await mountWidget({ launcherLabel: 'Chat ngay' });

    const label = document.getElementById('uknow-launcher-label');
    const bubble = document.getElementById('uknow-bubble');
    expect(label.style.display).not.toBe('none');

    bubble.click();
    expect(label.style.display).toBe('none');

    bubble.click();
    expect(label.style.display).toBe('flex');
  });
});
