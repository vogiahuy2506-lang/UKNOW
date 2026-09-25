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

  describe('trong iframe sandbox không có allow-same-origin (landing page của Founder AI)', () => {
    // Landing công khai hiển thị trong iframe sandbox (LpRendererPage.jsx) — ở đó chỉ ĐỌC
    // window.localStorage đã ném SecurityError. Đo thật 25/09: widget chết ngay dòng đầu, landing
    // tạo bằng Founder AI nhúng chatbot không hiện gì cả. Mô phỏng đúng cách trình duyệt chặn.
    const throwSandboxed = () => {
      throw new DOMException(
        "Failed to read the 'localStorage' property from 'Window': The document is sandboxed and lacks the 'allow-same-origin' flag.",
        'SecurityError'
      );
    };
    let originalDescriptor;
    beforeEach(() => {
      originalDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
      Object.defineProperty(window, 'localStorage', { configurable: true, get: throwSandboxed });
    });
    afterEach(() => {
      // Trả lại ĐÚNG mô tả gốc — `delete` sẽ xoá luôn localStorage thật của jsdom cho các test sau.
      Object.defineProperty(window, 'localStorage', originalDescriptor);
    });

    it('vẫn dựng nút chat + nhãn', async () => {
      await mountWidget({ launcherLabel: 'Chat với chúng tôi' });

      expect(document.getElementById('uknow-bubble')).toBeTruthy();
      expect(document.getElementById('uknow-launcher-label').textContent).toBe('Chat với chúng tôi');
    });

    it('gửi tin vẫn chạy (lưu lịch sử rơi về bộ nhớ trang, không ném lỗi)', async () => {
      await mountWidget({ launcherLabel: 'Chat ngay' });
      document.getElementById('uknow-bubble').click();

      const input = document.querySelector('#uknow-window input');
      input.value = 'Xin chào shop';
      input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter' }));

      await vi.waitFor(() => {
        expect(document.getElementById('uknow-messages').textContent).toContain('Xin chào shop');
      });
      // Lượt gửi thật sự đi tới máy chủ (fetch thứ 2 sau lượt lấy cấu hình), kèm phiên đã sinh.
      await vi.waitFor(() => {
        const chatCall = fetch.mock.calls.find(([url]) => String(url).endsWith('/chat'));
        expect(chatCall).toBeTruthy();
        expect(JSON.parse(chatCall[1].body).sessionId).toMatch(/^sess_/);
      });
    });
  });

  it('dữ liệu cũ trong localStorage bị hỏng (JSON sai) → widget vẫn dựng', async () => {
    const token = 'test_corrupt';
    localStorage.setItem(`uknow_msgs_${token}`, '{không phải json');
    window.customChatbotConfig = { token, baseUrl: '' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ success: true, data: { launcherLabel: 'Hỏi ngay' } }) }));
    eval(WIDGET_SOURCE);

    await vi.waitFor(() => {
      expect(document.getElementById('uknow-launcher-label')?.textContent).toBe('Hỏi ngay');
    });
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
