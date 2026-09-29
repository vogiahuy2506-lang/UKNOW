/**
 * widget.js — bo góc (border_radius) áp thật lên cửa sổ chat, giới hạn 0–32px.
 * Chạy THẬT file trong jsdom (cùng cách widgetAutoOpen.spec.js).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WIDGET_SOURCE = fs.readFileSync(path.resolve(__dirname, '../../../public/widget.js'), 'utf8');

async function mountWidget(extra = {}) {
  window.customChatbotConfig = { token: 'wk_radius', baseUrl: '' };
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ json: async () => ({ success: true, data: { name: 'Bot', ...extra } }) })
  );
  eval(WIDGET_SOURCE);
  for (let i = 0; i < 50 && !document.getElementById('uknow-window'); i += 1) {
    await Promise.resolve();
  }
  const win = document.getElementById('uknow-window');
  expect(win).toBeTruthy();
  return win;
}

describe('widget.js — bo góc khung chat', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.getElementById('uknow-style')?.remove();
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('borderRadius 4 -> cửa sổ border-radius: 4px', async () => {
    const win = await mountWidget({ borderRadius: 4 });
    expect(win.style.borderRadius).toBe('4px');
  });

  it('borderRadius 0 -> vuông (0px), không rơi về mặc định', async () => {
    const win = await mountWidget({ borderRadius: 0 });
    expect(win.style.borderRadius).toBe('0px');
  });

  it('borderRadius 999 -> kẹp 32px; -5 -> kẹp 0px', async () => {
    expect((await mountWidget({ borderRadius: 999 })).style.borderRadius).toBe('32px');
    document.body.innerHTML = '';
    expect((await mountWidget({ borderRadius: -5 })).style.borderRadius).toBe('0px');
  });

  it('server không trả borderRadius -> giữ 20px như cũ', async () => {
    const win = await mountWidget({});
    expect(win.style.borderRadius).toBe('20px');
  });
});
