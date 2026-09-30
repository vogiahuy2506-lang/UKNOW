/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-3 — chữ khách THẤY ở trang Thanh toán / hồ sơ: UsageBar THẬT + từ điển tiếng
 * Việt THẬT (không mock), để kiểm đúng câu chữ trong tiêu chí nghiệm thu:
 *   - hạn mức AI NULL (hoặc ≤ 0) → "Không giới hạn", không bao giờ "0 / 0";
 *   - ví AI mua thêm > 0 → dòng "+ N lượt mua thêm (không hết hạn)";
 *   - có aiCreditCycleEnd → "làm mới ngày dd/mm";
 *   - gói không có trần ngày → không có thanh "hôm nay";
 *   - đồng hồ không đọc được → "—", không phải "0".
 * Phần truyền đúng used/limit xuống từng thanh do PlanSection.spec.jsx kiểm (UsageBar mock).
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import { makeT } from '../../test/realI18n.js';
import PlanSection from './PlanSection';

vi.mock('../storage/StorageUsageSection', () => ({ default: () => null }));

const t = makeT();

const baseData = {
  activePlanId: 15,
  activePlanName: 'Starter',
  activePlanCode: 'starter',
  activePlanFeatures: [],
  planMaxEmployees: 3,
  subscriptionExpiresAt: null,
  monthlyEmailLimit: 10000,
  monthlyZaloLimit: 5000,
  emailSentCycle: 3400,
  messagingSentCycle: 120,
  aiCreditsPerPeriod: 100,
  aiCreditsUsed: 37,
  aiCreditCycleEnd: '2026-10-10T02:30:00.000Z', // 09:30 giờ VN ngày 10/10
  resourceUsage: {
    chatbots: { used: 2, limit: 3 },
    landingPages: { used: 1, limit: null },
    zaloAccounts: { used: 1, limit: 2 },
    emailAccounts: { used: 0, limit: 1 },
    whatsappAccounts: { used: 0, limit: null },
    telegramAccounts: { used: 0, limit: null },
    employees: { used: 1, limit: 3 },
  },
};

function renderPlan(data = {}) {
  return render(
    <I18nProvider>
      <PlanSection data={{ ...baseData, ...data }} t={t} />
    </I18nProvider>,
  );
}

const aiCard = () => screen.getByTestId('ai-usage');
const messagesCard = () => screen.getByTestId('messages-usage');
const resourcesCard = () => screen.getByTestId('resources-usage');

describe('PlanSection — khối Lượt AI', () => {
  it('có hạn mức: "37 / 100", còn 63, làm mới ngày 10/10 (ngày theo giờ Việt Nam)', () => {
    renderPlan();
    expect(within(aiCard()).getByText('37 / 100')).toBeInTheDocument();
    expect(screen.getByTestId('ai-usage-remaining')).toHaveTextContent('Còn 63 · làm mới ngày 10/10');
  });

  it('ngày làm mới tính theo GIỜ VIỆT NAM, không theo UTC: 20:00 UTC ngày 9 đã là ngày 10 ở Việt Nam', () => {
    renderPlan({ aiCreditCycleEnd: '2026-10-09T20:00:00.000Z' });
    expect(screen.getByTestId('ai-usage-remaining')).toHaveTextContent('làm mới ngày 10/10');
  });

  it('chưa có ngày kỳ (aiCreditCycleEnd null) → vẫn hiện "Còn 63", không có chữ "làm mới"', () => {
    renderPlan({ aiCreditCycleEnd: null });
    expect(screen.getByTestId('ai-usage-remaining')).toHaveTextContent('Còn 63');
    expect(screen.getByTestId('ai-usage-remaining')).not.toHaveTextContent('làm mới');
  });

  it('dùng vượt hạn mức → còn 0 (không âm)', () => {
    renderPlan({ aiCreditsUsed: 120 });
    expect(screen.getByTestId('ai-usage-remaining')).toHaveTextContent('Còn 0');
  });

  it('hạn mức NULL → "Không giới hạn", không có "0 / 0", không có dòng "còn"', () => {
    renderPlan({ aiCreditsPerPeriod: null, aiCreditsUsed: 0 });
    expect(within(aiCard()).getByText('Không giới hạn')).toBeInTheDocument();
    expect(aiCard()).not.toHaveTextContent('0 / 0');
    expect(screen.queryByTestId('ai-usage-remaining')).not.toBeInTheDocument();
  });

  it('hạn mức ≤ 0 cũng là "Không giới hạn" (cổng aiCreditMeter coi baseLimit ≤ 0 là không chặn), không phải "0 / 0"', () => {
    renderPlan({ aiCreditsPerPeriod: 0, aiCreditsUsed: 5 });
    expect(aiCard()).toHaveTextContent('5 · Không giới hạn');
    expect(aiCard()).not.toHaveTextContent('0 / 0');
    expect(screen.queryByTestId('ai-usage-remaining')).not.toBeInTheDocument();
  });

  it('có ví mua thêm > 0 → dòng "+ N lượt mua thêm (không hết hạn)"', () => {
    renderPlan({ addons: { aiCredits: { granted: 300, used: 250, remaining: 50 } } });
    expect(screen.getByTestId('ai-usage-wallet')).toHaveTextContent('+ 50 lượt mua thêm (không hết hạn)');
  });

  it('ví = 0 hoặc chưa mua → KHÔNG có dòng mua thêm', () => {
    renderPlan({ addons: { aiCredits: { granted: 300, used: 300, remaining: 0 } } });
    expect(screen.queryByTestId('ai-usage-wallet')).not.toBeInTheDocument();
    renderPlan({ addons: null });
    expect(screen.queryByTestId('ai-usage-wallet')).not.toBeInTheDocument();
  });

  it('số đã dùng không đọc được (null) → "—", không phải "0 / 100", và không có dòng "còn"', () => {
    renderPlan({ aiCreditsUsed: null });
    expect(within(aiCard()).getByText('—')).toBeInTheDocument();
    expect(aiCard()).not.toHaveTextContent('0 / 100');
    expect(screen.queryByTestId('ai-usage-remaining')).not.toBeInTheDocument();
  });
});

describe('PlanSection — khối Tin nhắn trong kỳ', () => {
  it('tiêu đề nêu ngày hết kỳ: "Tin nhắn trong kỳ (đến 10/10)"; không còn chữ "tháng này"', () => {
    renderPlan({ sendCycleEnd: '2026-10-10T02:30:00.000Z' });
    expect(messagesCard()).toHaveTextContent('Tin nhắn trong kỳ (đến 10/10)');
    expect(screen.queryByText(/tháng này/i)).not.toBeInTheDocument();
  });

  it('chưa có ngày kỳ → tiêu đề "Tin nhắn trong kỳ" (không có ngoặc)', () => {
    renderPlan({ sendCycleEnd: null });
    expect(messagesCard()).toHaveTextContent('Tin nhắn trong kỳ');
    expect(messagesCard()).not.toHaveTextContent('(đến');
  });

  it('hai dòng: Email và "Zalo", đã dùng / trần; có ghi chú gồm cả gửi nhanh (Telegram/WhatsApp có hạn mức riêng)', () => {
    renderPlan();
    const card = messagesCard();
    expect(within(card).getByText('Email')).toBeInTheDocument();
    expect(within(card).getByText('3.400 / 10.000')).toBeInTheDocument();
    expect(within(card).getByText('Zalo')).toBeInTheDocument();
    expect(within(card).getByText('120 / 5.000')).toBeInTheDocument();
    expect(card).toHaveTextContent('Đã gồm cả tin gửi nhanh.');
  });

  it('gói không có trần ngày → không có chữ "hôm nay" ở khối tin nhắn', () => {
    renderPlan({ dailyEmailLimit: null, dailyZaloLimit: null });
    expect(messagesCard()).not.toHaveTextContent('hôm nay');
  });

  it('gói có trần ngày → có thanh "Email hôm nay" và "Tin nhắn hôm nay"', () => {
    renderPlan({ dailyEmailLimit: 500, dailyZaloLimit: 200, emailSentToday: 12, messagingSentToday: 5 });
    const card = messagesCard();
    expect(within(card).getByText('Email hôm nay')).toBeInTheDocument();
    expect(within(card).getByText('12 / 500')).toBeInTheDocument();
    expect(within(card).getByText('Tin nhắn hôm nay')).toBeInTheDocument();
    expect(within(card).getByText('5 / 200')).toBeInTheDocument();
  });

  it('gói dùng thử: trần theo kênh trống hiện "Không giới hạn" + đã dùng, trần TỔNG kỳ 100 hiện đủ "26 / 100"', () => {
    renderPlan({
      monthlyEmailLimit: null,
      monthlyZaloLimit: null,
      messagesPerPeriod: 100,
      combinedSentCycle: 26,
      emailSentCycle: 13,
      messagingSentCycle: 13,
    });
    const card = messagesCard();
    expect(within(card).getByText('Tổng tin nhắn trong kỳ')).toBeInTheDocument();
    expect(within(card).getByText('26 / 100')).toBeInTheDocument();
    expect(within(card).getAllByText('13 · Không giới hạn')).toHaveLength(2);
  });

  it('đồng hồ không đọc được (null) → "—", không phải "0 / 10.000"', () => {
    renderPlan({ emailSentCycle: null });
    const card = messagesCard();
    expect(within(card).getByText('—')).toBeInTheDocument();
    expect(card).not.toHaveTextContent('0 / 10.000');
  });
});

describe('PlanSection — khối Tài nguyên', () => {
  it('trần null hiện "Không giới hạn"; có trần hiện "đã dùng / trần"', () => {
    renderPlan({ resourceUsage: { ...baseData.resourceUsage, landingPages: { used: 0, limit: null } } });
    const card = resourcesCard();
    expect(within(card).getByText('2 / 3')).toBeInTheDocument(); // chatbot
    expect(within(card).getByText('Không giới hạn')).toBeInTheDocument(); // landing page
    expect(within(card).getByText('1 / 2')).toBeInTheDocument(); // tài khoản Zalo
    expect(within(card).getByText('0 / 1')).toBeInTheDocument(); // tài khoản Email
    expect(within(card).getByText('1 / 3')).toBeInTheDocument(); // nhân viên
  });

  it('trần null nhưng đã có tài nguyên → "N · Không giới hạn"', () => {
    renderPlan({ resourceUsage: { ...baseData.resourceUsage, landingPages: { used: 4, limit: null } } });
    expect(within(resourcesCard()).getByText('4 · Không giới hạn')).toBeInTheDocument();
  });

  it('đồng hồ tài nguyên lỗi (null) → "—", không phải "0 / N"', () => {
    renderPlan({ resourceUsage: { ...baseData.resourceUsage, chatbots: null } });
    const card = resourcesCard();
    expect(within(card).getAllByText('—')).toHaveLength(1);
  });
});

describe('PlanSection — khối Đã mua thêm', () => {
  it('không còn câu "không cộng dồn sang chu kỳ sau" (sai với ví tin/email/AI — không hết hạn)', () => {
    renderPlan({
      addons: {
        zaloMessages: { granted: 0, used: 0, remaining: 0 },
        emails: { granted: 100, used: 0, remaining: 100 },
        aiCredits: { granted: 0, used: 0, remaining: 0 },
        landingPages: 2,
      },
    });
    expect(screen.queryByText(/không cộng dồn/i)).not.toBeInTheDocument();
    expect(screen.getByText(/mua thêm không hết hạn/i)).toBeInTheDocument();
    expect(screen.queryByText(/trong chu kỳ này/i)).not.toBeInTheDocument();
  });
});
