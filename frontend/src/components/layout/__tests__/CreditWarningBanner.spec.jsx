/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-3 — biểu ngữ "sắp hết hạn mức" đọc số MỚI (theo kỳ, đếm bằng hàm của cổng)
 * và nói ĐÚNG tài nguyên: lượt AI / email / tin nhắn Zalo·Telegram·WhatsApp / tổng tin nhắn — không phải lúc nào cũng
 * "credit AI" (bản cũ: chuỗi cứng "credit AI", khoá resources chỉ có `ai`, nên cảnh báo email/Zalo — khi số đúng —
 * sẽ in "Sắp hết credit AI" hoặc chính chuỗi khoá `creditBanner.resources.email`).
 * Store thật; từ điển thật (chữ người dùng thấy); chỉ mock ranh giới lưu trữ và điều hướng.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import viDict from '../../../i18n/vi.js';
import enDict from '../../../i18n/en.js';

vi.mock('../../../i18n', async () => (await import('../../../test/realI18n.js')).realI18nModule());
vi.mock('../../../features/storage/useStorageQuota', () => ({
  default: () => ({ usage: null }),
}));
// Ranh giới mạng của store (authStore tự gọi API cờ OTP lúc nạp) — không cho ra mạng thật.
vi.mock('../../../services/api', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
    get: vi.fn().mockResolvedValue({ data: { data: {} } }),
  },
  setAuthStore: vi.fn(),
}));

const { useAuthStore } = await import('../../../stores/authStore');
const { default: CreditWarningBanner } = await import('../CreditWarningBanner');

const NO_ALERT_AI = { used: 0, limit: 100 };
const NO_SEND = {
  email: { used: null, limit: null },
  messaging: { used: null, limit: null },
  telegram: { used: null, limit: null },
  whatsapp: { used: null, limit: null },
  combined: { used: null, limit: null },
};

function setState({ aiCredits = NO_ALERT_AI, sendUsage = NO_SEND, addons = null, activeContext = { type: 'self' } } = {}) {
  useAuthStore.setState({
    user: { id: 7, username: 'chu', role: 'user', roleCode: 'user' },
    isAuthenticated: true,
    activeContext,
    aiCredits,
    sendUsage,
    addons,
    billingStatus: null,
  });
}

const renderBanner = () => render(<MemoryRouter><CreditWarningBanner /></MemoryRouter>);
const banner = () => screen.queryByRole('status');

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('CreditWarningBanner — nói đúng tài nguyên', () => {
  it('email gần hết (85%) → "hạn mức email", đơn vị "email"; không nhắc "credit AI"', () => {
    setState({ sendUsage: { ...NO_SEND, email: { used: 8500, limit: 10000 } } });
    renderBanner();
    expect(banner()).toHaveTextContent('Sắp hết hạn mức email — còn 1.500 email (15%).');
    expect(banner()).not.toHaveTextContent(/credit AI/i);
    expect(banner()).not.toHaveTextContent('creditBanner.');
  });

  it('nhắn tin Zalo gần hết → "hạn mức tin nhắn Zalo", đơn vị "tin" (P10: không còn nêu Telegram/WhatsApp)', () => {
    setState({ sendUsage: { ...NO_SEND, messaging: { used: 4600, limit: 5000 } } });
    renderBanner();
    expect(banner()).toHaveTextContent('Sắp hết hạn mức tin nhắn Zalo — còn 400 tin (8%).');
    expect(banner()).not.toHaveTextContent('Telegram');
  });

  // P10 — Telegram/WhatsApp có hạn mức tin RIÊNG, ví mua thêm cũng riêng theo kênh.
  it('P10: Telegram gần hết → "hạn mức tin nhắn Telegram"; WhatsApp gần hết → "hạn mức tin nhắn WhatsApp"', () => {
    setState({ sendUsage: { ...NO_SEND, telegram: { used: 280, limit: 300 } } });
    const first = renderBanner();
    expect(banner()).toHaveTextContent('Sắp hết hạn mức tin nhắn Telegram — còn 20 tin (7%).');
    first.unmount();
    window.sessionStorage.clear();
    setState({ sendUsage: { ...NO_SEND, whatsapp: { used: 190, limit: 200 } } });
    renderBanner();
    expect(banner()).toHaveTextContent('Sắp hết hạn mức tin nhắn WhatsApp — còn 10 tin (5%).');
  });

  it('P10: ví telegram_messages còn số dư → không cảnh báo Telegram (ví WhatsApp không gỡ được cảnh báo Telegram)', () => {
    setState({
      sendUsage: { ...NO_SEND, telegram: { used: 300, limit: 300 } },
      addons: { telegramMessages: { granted: 100, used: 10, remaining: 90 } },
    });
    renderBanner();
    expect(banner()).not.toBeInTheDocument();
  });

  it('tổng tin nhắn trong kỳ (gói dùng thử 100) gần hết → "hạn mức tổng tin nhắn"', () => {
    setState({ sendUsage: { ...NO_SEND, combined: { used: 90, limit: 100 } } });
    renderBanner();
    expect(banner()).toHaveTextContent('Sắp hết hạn mức tổng tin nhắn — còn 10 tin (10%).');
  });

  it('lượt AI gần hết → "lượt AI" (không còn "credit AI")', () => {
    setState({ aiCredits: { used: 90, limit: 100 } });
    renderBanner();
    expect(banner()).toHaveTextContent('Sắp hết lượt AI — còn 10 lượt (10%).');
    expect(banner()).not.toHaveTextContent(/credit AI/i);
  });

  it('email đã hết (100%) → "Đã hết hạn mức email trong kỳ này"', () => {
    setState({ sendUsage: { ...NO_SEND, email: { used: 10000, limit: 10000 } } });
    renderBanner();
    expect(banner()).toHaveTextContent('Đã hết hạn mức email trong kỳ này — nâng cấp hoặc mua thêm để tiếp tục.');
  });

  it('lượt AI đã hết (100%) → "Đã hết lượt AI trong kỳ này"', () => {
    setState({ aiCredits: { used: 100, limit: 100 } });
    renderBanner();
    expect(banner()).toHaveTextContent('Đã hết lượt AI trong kỳ này');
    expect(banner()).not.toHaveTextContent(/credit AI/i);
  });

  it('nhiều tài nguyên cùng gần hết → hiện cái hết trước / nặng nhất (đã hết đứng trên sắp hết)', () => {
    setState({
      aiCredits: { used: 85, limit: 100 },
      sendUsage: { ...NO_SEND, email: { used: 10000, limit: 10000 } },
    });
    renderBanner();
    expect(banner()).toHaveTextContent('Đã hết hạn mức email');
  });
});

describe('CreditWarningBanner — khi nào KHÔNG cảnh báo', () => {
  it('đồng hồ chưa có số (used null: chưa tải hoặc không đọc được) → không cảnh báo bừa', () => {
    setState({ sendUsage: { ...NO_SEND, email: { used: null, limit: 10000 } } });
    renderBanner();
    expect(banner()).not.toBeInTheDocument();
  });

  it('trần null (không giới hạn) → không cảnh báo dù đã dùng nhiều', () => {
    setState({ sendUsage: { ...NO_SEND, email: { used: 999999, limit: null } } });
    renderBanner();
    expect(banner()).not.toBeInTheDocument();
  });

  it('dưới 80% → không cảnh báo', () => {
    setState({ sendUsage: { ...NO_SEND, email: { used: 7900, limit: 10000 } } });
    renderBanner();
    expect(banner()).not.toBeInTheDocument();
  });

  it('còn ví mua thêm cho kênh đó → không cảnh báo (cổng cho gửi tiếp bằng ví)', () => {
    setState({
      sendUsage: { ...NO_SEND, email: { used: 10000, limit: 10000 } },
      addons: { emails: { granted: 500, used: 0, remaining: 500 } },
    });
    renderBanner();
    expect(banner()).not.toBeInTheDocument();
  });

  it('trần TỔNG kỳ: ví mua thêm KHÔNG gỡ được chặn này → vẫn cảnh báo dù có ví email/tin nhắn', () => {
    setState({
      sendUsage: { ...NO_SEND, combined: { used: 100, limit: 100 } },
      addons: {
        emails: { granted: 500, used: 0, remaining: 500 },
        zaloMessages: { granted: 500, used: 0, remaining: 500 },
      },
    });
    renderBanner();
    expect(banner()).toHaveTextContent('Đã hết hạn mức tổng tin nhắn');
  });

  it('nhân viên (ngữ cảnh công ty) không thấy cảnh báo hạn mức tin gửi của chủ', () => {
    setState({
      sendUsage: { ...NO_SEND, email: { used: 10000, limit: 10000 } },
      activeContext: { type: 'employee', ownerId: 3, ownerName: 'Cty' },
    });
    renderBanner();
    expect(banner()).not.toBeInTheDocument();
  });
});

describe('creditBanner — từ điển đủ khoá cho mọi tài nguyên (ở cả vi và en)', () => {
  // metricAlert tra khoá ĐỘNG `creditBanner.resources.<khoá>` / `units.<khoá>` nên phép quét khoá tĩnh của
  // translationKeys.spec không thấy — thiếu một khoá là câu cảnh báo in ra chuỗi khoá thô.
  const RESOURCE_KEYS = ['ai', 'email', 'messaging', 'combined'];

  it.each([
    ['vi', viDict],
    ['en', enDict],
  ])('%s: resources và units có đủ %j', (_locale, dict) => {
    for (const key of RESOURCE_KEYS) {
      expect(typeof dict.creditBanner.resources[key]).toBe('string');
      expect(typeof dict.creditBanner.units[key]).toBe('string');
    }
  });

  it('câu low/empty dùng {resource} (không còn ghi cứng "credit AI") và low có {unit}', () => {
    expect(viDict.creditBanner.low).toContain('{resource}');
    expect(viDict.creditBanner.low).toContain('{unit}');
    expect(viDict.creditBanner.empty).toContain('{resource}');
    expect(viDict.creditBanner.low).not.toMatch(/credit AI/i);
    expect(viDict.creditBanner.empty).not.toMatch(/credit AI/i);
  });
});
