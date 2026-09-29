/**
 * widget.js — tự động mở chat (PLAN_TUY_CHINH_WIDGET_THAT_2026-09-29). Chạy THẬT file trong jsdom
 * (cùng cách widgetLauncherLabel.spec.js): autoOpen:true → mở sau 2 giây, mỗi phiên trình duyệt đúng
 * 1 lần; không có sessionStorage (landing sandbox) → không tự mở; màn hẹp < 640px → không tự mở.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WIDGET_SOURCE = fs.readFileSync(path.resolve(__dirname, '../../../public/widget.js'), 'utf8');

const TOKEN = 'wk_autoopen';

async function mountWidget({ autoOpen = true } = {}) {
  window.customChatbotConfig = { token: TOKEN, baseUrl: '' };
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ json: async () => ({ success: true, data: { name: 'Bot', autoOpen } }) })
  );
  eval(WIDGET_SOURCE);
  // Chờ init() (await loadConfig → buildWidget → maybeAutoOpen) chạy xong bằng microtask, không đụng fake timer.
  for (let i = 0; i < 50 && !document.getElementById('uknow-window'); i += 1) {
    await Promise.resolve();
  }
  expect(document.getElementById('uknow-window')).toBeTruthy();
}

const isOpenNow = () => document.getElementById('uknow-window').style.display === 'flex';

describe('widget.js — tự động mở chat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    document.getElementById('uknow-style')?.remove();
    localStorage.clear();
    sessionStorage.clear();
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1280 });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('autoOpen:true → chưa mở lúc đầu, mở sau 2 giây', async () => {
    await mountWidget();
    expect(isOpenNow()).toBe(false);
    vi.advanceTimersByTime(1900);
    expect(isOpenNow()).toBe(false);
    vi.advanceTimersByTime(200);
    expect(isOpenNow()).toBe(true);
  });

  it('autoOpen:false → không tự mở', async () => {
    await mountWidget({ autoOpen: false });
    vi.advanceTimersByTime(5000);
    expect(isOpenNow()).toBe(false);
  });

  it('1 lần / phiên: tải lại trang trong cùng phiên (cờ sessionStorage còn) → không mở lại', async () => {
    await mountWidget();
    vi.advanceTimersByTime(2100);
    expect(isOpenNow()).toBe(true);
    expect(sessionStorage.getItem(`uknow_autoopen_${TOKEN}`)).toBe('1');

    document.body.innerHTML = '';
    await mountWidget();
    vi.advanceTimersByTime(5000);
    expect(isOpenNow()).toBe(false);
  });

  it('không có sessionStorage (landing sandbox ném SecurityError) → không tự mở', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItem() {
      if (this === window.sessionStorage) throw new DOMException('denied', 'SecurityError');
      return null;
    });
    await mountWidget();
    vi.advanceTimersByTime(5000);
    expect(isOpenNow()).toBe(false);
  });

  it('màn hẹp < 640px → không tự mở', async () => {
    window.innerWidth = 390;
    await mountWidget();
    vi.advanceTimersByTime(5000);
    expect(isOpenNow()).toBe(false);
  });

  it('khách tự mở trong 2 giây đầu → không đảo trạng thái (không tự đóng)', async () => {
    await mountWidget();
    document.getElementById('uknow-bubble').click();
    expect(isOpenNow()).toBe(true);
    vi.advanceTimersByTime(3000);
    expect(isOpenNow()).toBe(true);
  });
});
