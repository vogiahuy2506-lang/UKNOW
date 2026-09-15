import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-5.
 *
 * form-embed.js là script tĩnh nạp thẳng bằng <script> (không qua bundler, không export
 * ESM) — cùng ràng buộc và mẹo test như founderai-capture.js (xem src/test/founderaiCapture.spec.js):
 * import động sau khi tự dựng <script src="...form-embed.js"> + container trong DOM, rồi
 * `vi.resetModules()` trước mỗi test để IIFE bên trong chạy lại từ đầu (module không export
 * gì để gọi trực tiếp — toàn bộ hành vi là side-effect DOM khi import).
 */

const APP_ORIGIN = 'https://example.com';

function setupScriptTag() {
  const script = document.createElement('script');
  script.src = `${APP_ORIGIN}/form-embed.js`;
  script.defer = true;
  document.head.appendChild(script);
  return script;
}

function makeContainer(key) {
  const div = document.createElement('div');
  div.setAttribute('data-founderai-form', key);
  document.body.appendChild(div);
  return div;
}

async function loadFormEmbed() {
  vi.resetModules();
  await import('../../public/form-embed.js');
}

function dispatchResizeMessage({ origin, source, type = 'founderai-form-resize', key, height }) {
  const data = { type, key, height };
  const event = new MessageEvent('message', { origin, source, data });
  window.dispatchEvent(event);
}

describe('form-embed.js', () => {
  let originalWindowOrigin;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.querySelectorAll('script[src$="form-embed.js"]').forEach((s) => s.remove());
    originalWindowOrigin = window.origin;
  });

  afterEach(() => {
    Object.defineProperty(window, 'origin', { value: originalWindowOrigin, configurable: true });
  });

  it('2 container + 1 script → mount() tự chạy, tạo đúng 2 iframe với src ORIGIN/f/KEY?embed=1', async () => {
    setupScriptTag();
    makeContainer('key-a');
    makeContainer('key-b');

    await loadFormEmbed();

    const iframes = document.querySelectorAll('iframe');
    expect(iframes.length).toBe(2);
    expect(iframes[0].src).toBe(`${APP_ORIGIN}/f/key-a?embed=1`);
    expect(iframes[1].src).toBe(`${APP_ORIGIN}/f/key-b?embed=1`);
    expect(iframes[0].getAttribute('loading')).toBe('lazy');
    expect(iframes[0].getAttribute('allow')).toBe('clipboard-write');
    expect(iframes[0].getAttribute('title')).toBeTruthy();
  });

  it('dán khối 2 lần (2 script cùng nạp) hoặc gọi mount() lại → không tạo iframe thứ hai (double-mount guard)', async () => {
    setupScriptTag();
    const container = makeContainer('key-dup');

    await loadFormEmbed();

    const iframeBefore = container.querySelector('iframe');
    expect(iframeBefore).toBeTruthy();

    // Gọi mount() thủ công lần nữa (mô phỏng script thứ hai/chèn muộn gọi lại).
    window.FounderAIForms.mount();

    const iframeAfter = container.querySelector('iframe');
    expect(container.querySelectorAll('iframe').length).toBe(1);
    // Guard chặn xử lý lại container — phải là ĐÚNG node cũ, không phải node mới dựng lại.
    expect(iframeAfter).toBe(iframeBefore);
  });

  it('message đúng origin + đúng source (contentWindow) + đúng type/key → đổi chiều cao iframe', async () => {
    setupScriptTag();
    const container = makeContainer('key-resize');
    await loadFormEmbed();

    const iframe = container.querySelector('iframe');
    dispatchResizeMessage({
      origin: APP_ORIGIN,
      source: iframe.contentWindow,
      key: 'key-resize',
      height: 900,
    });

    expect(iframe.style.height).toBe('900px');
  });

  it('kẹp chiều cao trong khoảng 200–6000px', async () => {
    setupScriptTag();
    const container = makeContainer('key-clamp');
    await loadFormEmbed();
    const iframe = container.querySelector('iframe');

    dispatchResizeMessage({ origin: APP_ORIGIN, source: iframe.contentWindow, key: 'key-clamp', height: 50 });
    expect(iframe.style.height).toBe('200px');

    dispatchResizeMessage({ origin: APP_ORIGIN, source: iframe.contentWindow, key: 'key-clamp', height: 99999 });
    expect(iframe.style.height).toBe('6000px');
  });

  it('message SAI origin → KHÔNG đổi chiều cao', async () => {
    setupScriptTag();
    const container = makeContainer('key-wrong-origin');
    await loadFormEmbed();
    const iframe = container.querySelector('iframe');
    const before = iframe.style.height;

    dispatchResizeMessage({
      origin: 'https://attacker.example',
      source: iframe.contentWindow,
      key: 'key-wrong-origin',
      height: 900,
    });

    expect(iframe.style.height).toBe(before);
  });

  it('message SAI source (không phải contentWindow của iframe đã mount) → KHÔNG đổi chiều cao', async () => {
    setupScriptTag();
    const containerA = makeContainer('key-src-a');
    const containerB = makeContainer('key-src-b');
    await loadFormEmbed();
    const iframeA = containerA.querySelector('iframe');
    const iframeB = containerB.querySelector('iframe');
    const before = iframeA.style.height;

    // Giả nguồn là iframe B nhưng khai key của A — source không khớp contentWindow của A.
    dispatchResizeMessage({
      origin: APP_ORIGIN,
      source: iframeB.contentWindow,
      key: 'key-src-a',
      height: 900,
    });

    expect(iframeA.style.height).toBe(before);
  });

  it('message thiếu type đúng (\'founderai-form-resize\') → KHÔNG đổi chiều cao', async () => {
    setupScriptTag();
    const container = makeContainer('key-wrong-type');
    await loadFormEmbed();
    const iframe = container.querySelector('iframe');
    const before = iframe.style.height;

    dispatchResizeMessage({
      origin: APP_ORIGIN,
      source: iframe.contentWindow,
      type: 'some-other-type',
      key: 'key-wrong-type',
      height: 900,
    });

    expect(iframe.style.height).toBe(before);
  });

  it('message thiếu/khác key (mô phỏng embed quên gửi key) → KHÔNG đổi chiều cao', async () => {
    setupScriptTag();
    const container = makeContainer('key-real');
    await loadFormEmbed();
    const iframe = container.querySelector('iframe');
    const before = iframe.style.height;

    dispatchResizeMessage({
      origin: APP_ORIGIN,
      source: iframe.contentWindow,
      key: undefined,
      height: 900,
    });

    expect(iframe.style.height).toBe(before);
  });

  it('window.origin === "null" (iframe sandbox không allow-same-origin) → KHÔNG chèn iframe, hiện link mở tab mới', async () => {
    Object.defineProperty(window, 'origin', { value: 'null', configurable: true });
    setupScriptTag();
    const container = makeContainer('key-opaque');

    await loadFormEmbed();

    expect(container.querySelector('iframe')).toBeNull();
    const link = container.querySelector('a[data-founderai-form-fallback-link]');
    expect(link).toBeTruthy();
    expect(link.href).toBe(`${APP_ORIGIN}/f/key-opaque`);
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener');
  });
});
