/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-3 — lát cắt billing của authStore (nguồn của biểu ngữ "sắp hết hạn mức")
 * đọc số tin đã gửi TRONG KỲ do backend đếm bằng hàm của cổng chặn:
 *   emailSentCycle / messagingSentCycle / combinedSentCycle (+ trần monthlyEmailLimit / monthlyZaloLimit /
 *   messagesPerPeriod). Bản cũ đọc emailSentMonth / zaloSentMonth (số đếm sai nguồn, sai kỳ, luôn 0) và ép mọi thứ
 *   thiếu thành 0 — nên biểu ngữ cho email/Zalo không bao giờ bật.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/api', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
    get: vi.fn().mockResolvedValue({ data: { data: {} } }),
  },
  setAuthStore: vi.fn(),
}));

const { useAuthStore } = await import('../authStore');

const sync = (profile) => {
  useAuthStore.getState().syncBillingFromProfile(profile);
  return useAuthStore.getState();
};

beforeEach(() => {
  useAuthStore.setState({ user: { id: 1 }, isAuthenticated: true, activeContext: { type: 'self' } });
});

describe('authStore.syncBillingFromProfile — sendUsage theo kỳ', () => {
  it('đọc số TRONG KỲ và trần tương ứng: email, nhắn tin (Zalo·Telegram·WhatsApp), tổng kỳ', () => {
    const { sendUsage } = sync({
      emailSentCycle: 3400,
      monthlyEmailLimit: 10000,
      messagingSentCycle: 120,
      monthlyZaloLimit: 5000,
      combinedSentCycle: 26,
      messagesPerPeriod: 100,
      telegramSentCycle: 12,
      monthlyTelegramLimit: 300,
      whatsappSentCycle: 0,
      monthlyWhatsappLimit: 0,
    });

    // P10: nhắn tin = Zalo; Telegram/WhatsApp có số đã dùng + trần RIÊNG (0 giữ là 0).
    expect(sendUsage).toEqual({
      email: { used: 3400, limit: 10000 },
      messaging: { used: 120, limit: 5000 },
      telegram: { used: 12, limit: 300 },
      whatsapp: { used: 0, limit: 0 },
      combined: { used: 26, limit: 100 },
    });
  });

  it('KHÔNG đọc tên cũ emailSentMonth / zaloSentMonth (số sai kỳ, sai nguồn)', () => {
    const { sendUsage } = sync({
      emailSentMonth: 999,
      zaloSentMonth: 888,
      monthlyEmailLimit: 10000,
      monthlyZaloLimit: 5000,
    });

    expect(sendUsage.email.used).toBeNull();
    expect(sendUsage.messaging.used).toBeNull();
  });

  it('đồng hồ không đọc được (null) hoặc thiếu → giữ null, KHÔNG ép thành 0', () => {
    const { sendUsage } = sync({ emailSentCycle: null, monthlyEmailLimit: 10000 });

    expect(sendUsage.email).toEqual({ used: null, limit: 10000 });
    expect(sendUsage.messaging).toEqual({ used: null, limit: null });
    expect(sendUsage.combined).toEqual({ used: null, limit: null });
  });

  it('số 0 thật (chưa gửi gì trong kỳ) vẫn là 0, khác null', () => {
    const { sendUsage } = sync({ emailSentCycle: 0, monthlyEmailLimit: 10000 });
    expect(sendUsage.email.used).toBe(0);
  });

  it('lượt AI: used là số, limit giữ nguyên (null = không giới hạn)', () => {
    const { aiCredits } = sync({ aiCreditsUsed: 37, aiCreditsPerPeriod: null });
    expect(aiCredits).toEqual({ used: 37, limit: null });
  });
});
