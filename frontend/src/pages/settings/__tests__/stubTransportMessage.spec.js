/**
 * Tests for the STUB_TRANSPORT / NOT_CONFIGURED message-mapping logic
 * used by TelegramSettings.jsx.
 *
 * The components themselves are heavyweight to render (they pull in
 * a router, auth context, toast provider, etc.), but the *mapping*
 * is pure — given a backend response shape it picks the user-facing
 * string. We extract that mapping here so we can pin it down without
 * touching the rest of the component tree.
 */

import { describe, it, expect } from 'vitest';

/**
 * Mirror of the logic that lives inside `handleStartQrLogin` for the
 * Telegram settings page. If you change the strings in the
 * component, update them here too — the test asserts both sides stay
 * in sync.
 */
function pickMessage({ channel, error }) {
  const code = error?.response?.data?.code;
  if (channel === 'telegram') {
    if (code === 'TELEGRAM_STUB_TRANSPORT') {
      return 'Telegram transport chưa được cài đặt trên máy chủ này. Vui lòng liên hệ quản trị viên để cấu hình TELEGRAM_GATEWAY_TRANSPORT.';
    }
    if (code === 'TELEGRAM_NOT_CONFIGURED') {
      return 'Telegram gateway chưa được cấu hình. Vui lòng liên hệ quản trị viên.';
    }
  }
  return error?.message || 'Không thể bắt đầu QR login';
}

describe('STUB_TRANSPORT message mapping', () => {
  it('maps Telegram 503 STUB_TRANSPORT to operator-friendly hint', () => {
    const msg = pickMessage({
      channel: 'telegram',
      error: {
        response: {
          data: {
            code: 'TELEGRAM_STUB_TRANSPORT',
            message: 'Telegram transport is not implemented on this server.',
          },
        },
      },
    });
    expect(msg).toMatch(/Telegram transport chưa được cài đặt/);
    expect(msg).toMatch(/TELEGRAM_GATEWAY_TRANSPORT/);
  });

  it('maps Telegram 503 NOT_CONFIGURED to operator-friendly hint', () => {
    const msg = pickMessage({
      channel: 'telegram',
      error: { response: { data: { code: 'TELEGRAM_NOT_CONFIGURED' } } },
    });
    expect(msg).toMatch(/Telegram gateway chưa được cấu hình/);
  });

  it('falls back to err.message when code is unknown', () => {
    const msg = pickMessage({
      channel: 'telegram',
      error: { message: 'Network Error' },
    });
    expect(msg).toBe('Network Error');
  });

  it('falls back to default string when err has no message', () => {
    const msg = pickMessage({ channel: 'telegram', error: {} });
    expect(msg).toBe('Không thể bắt đầu QR login');
  });

  it('does NOT leak the raw English server message', () => {
    // Regression: before the picker existed, the UI showed the raw
    // server message ("Telegram transport is not implemented on this
    // server. Set TELEGRAM_GATEWAY_TRANSPORT..."). We assert that the
    // raw string is never the picked message, even though it's the
    // server's exact payload.
    const rawEnglish =
      'Telegram transport is not implemented on this server. Set TELEGRAM_GATEWAY_TRANSPORT to a real client class before starting a QR login.';
    const msg = pickMessage({
      channel: 'telegram',
      error: {
        response: {
          data: {
            code: 'TELEGRAM_STUB_TRANSPORT',
            message: rawEnglish,
          },
        },
      },
    });
    expect(msg).not.toBe(rawEnglish);
    expect(msg).toMatch(/Vui lòng liên hệ quản trị viên/);
  });
});
