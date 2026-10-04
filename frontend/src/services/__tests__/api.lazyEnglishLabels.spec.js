import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 04/10/2026 — api.js không import tĩnh `en.js` nữa (kéo ~470 KB vào chunk chính): nhãn "Nâng cấp" của toast
 * hạn mức và câu lỗi dung lượng tra từ điển ĐÃ NẠP. Locale `en` mà `en` chưa nạp kịp → rơi về tiếng Việt, không ném.
 * Gọi thẳng handler `rejected` mà api.js đăng ký (như api.refreshLogout.spec.js); toast được mock.
 */
vi.mock('react-hot-toast', () => ({ default: { custom: vi.fn(), dismiss: vi.fn() } }));

async function setup({ storedLocale, preloadEnglish }) {
  vi.resetModules();
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('uknow_locale', storedLocale);
  const { default: toast } = await import('react-hot-toast');
  const english = await import('../../i18n/englishDictionary');
  if (preloadEnglish) await english.loadEnglishDictionary();
  const { default: api } = await import('../api');
  const handlers = api.interceptors.response.handlers;
  return { toast, rejected: handlers[handlers.length - 1].rejected };
}

const limitError = () => Object.assign(new Error('limit'), {
  config: { url: '/campaigns', headers: {} },
  response: { status: 403, data: { limitReached: true, message: 'Đã đạt giới hạn' } },
});

const quotaError = () => Object.assign(new Error('quota'), {
  config: { url: '/uploads/temp', headers: {} },
  response: { status: 413, data: { code: 'STORAGE_QUOTA_EXCEEDED' } },
});

/** Nhãn nút trong toast hạn mức: render hàm custom của toast rồi lấy chữ của nút. */
function upgradeButtonText(toast) {
  const renderToast = toast.custom.mock.calls[0][0];
  const element = renderToast({ visible: true, id: 'toast-1' });
  return element.props.children[1].props.children;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('api.js — nhãn tra từ điển đã nạp (không import tĩnh en)', () => {
  it('locale en và en ĐÃ nạp → nút toast hạn mức là "Upgrade →"', async () => {
    const { toast, rejected } = await setup({ storedLocale: 'en', preloadEnglish: true });
    await expect(rejected(limitError())).rejects.toBeTruthy();
    expect(upgradeButtonText(toast)).toBe('Upgrade →');
  });

  it('locale en nhưng en CHƯA nạp → nhãn tiếng Việt "Nâng cấp →", không ném', async () => {
    const { toast, rejected } = await setup({ storedLocale: 'en', preloadEnglish: false });
    await expect(rejected(limitError())).rejects.toBeTruthy();
    expect(upgradeButtonText(toast)).toBe('Nâng cấp →');
  });

  it('locale vi → "Nâng cấp →"', async () => {
    const { toast, rejected } = await setup({ storedLocale: 'vi', preloadEnglish: false });
    await expect(rejected(limitError())).rejects.toBeTruthy();
    expect(upgradeButtonText(toast)).toBe('Nâng cấp →');
  });

  it('câu lỗi dung lượng: en đã nạp → tiếng Anh; en chưa nạp → tiếng Việt', async () => {
    const loaded = await setup({ storedLocale: 'en', preloadEnglish: true });
    const englishError = await loaded.rejected(quotaError()).catch((e) => e);
    expect(englishError.message).toContain('storage quota exceeded');

    const notLoaded = await setup({ storedLocale: 'en', preloadEnglish: false });
    const viError = await notLoaded.rejected(quotaError()).catch((e) => e);
    expect(viError.message).toContain('dung lượng lưu trữ');
  });
});
