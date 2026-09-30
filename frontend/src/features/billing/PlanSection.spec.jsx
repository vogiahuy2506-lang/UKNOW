import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import PlanSection from './PlanSection';

// used / limit hiển thị thẳng ra DOM (thay vì mock rỗng) để test được đúng giá trị PlanSection truyền xuống —
// đây chính là chỗ bug null→0 xảy ra (PlanSection tự tính limit trước khi giao cho UsageBar). Nội dung chữ thật
// của thanh (Không giới hạn, "—") do PlanSection.usage.spec.jsx kiểm với UsageBar thật.
vi.mock('./UsageBar', () => ({
  default: ({ label, used, limit }) => (
    <div data-testid={`usage-${label}`} data-used={String(used)} data-limit={String(limit)} />
  ),
}));
vi.mock('../storage/StorageUsageSection', () => ({ default: () => null }));

const labels = {
  'accountProfileModal.free': 'Miễn phí',
  'accountProfileModal.contactForPrice': 'Liên hệ',
  'accountProfileModal.perMonth': '/tháng',
  'accountProfileModal.perYear': '/năm',
  'accountProfileModal.billingMonthly': 'Theo tháng',
  'accountProfileModal.billingYearly': 'Theo năm',
};

const t = (key) => labels[key] || key;

const baseData = {
  activePlanId: 15,
  activePlanName: 'Starter',
  activePlanCode: 'starter',
  activePlanFeatures: [],
  planMaxEmployees: null,
  subscriptionExpiresAt: null,
};

function renderPlan(data) {
  return render(
    <I18nProvider>
      <PlanSection data={{ ...baseData, ...data }} t={t} />
    </I18nProvider>,
  );
}

describe('PlanSection billing display', () => {
  it('uses yearly price and label when the active period is yearly', () => {
    renderPlan({ activeBillingPeriod: 'yearly', activePlanPriceYearly: '2870400' });

    expect(screen.getByText('2.870.400 ₫')).toBeInTheDocument();
    expect(screen.getByText('/năm')).toBeInTheDocument();
    expect(screen.getByText('Theo năm')).toBeInTheDocument();
  });

  it('renders the free label when PostgreSQL returns numeric zero as a string', () => {
    renderPlan({ activeBillingPeriod: 'monthly', activePlanPrice: '0.00' });

    expect(screen.getByText('Miễn phí')).toBeInTheDocument();
    expect(screen.queryByText('0 ₫')).not.toBeInTheDocument();
  });

  it('keeps a free yearly entitlement free when a legacy plan has no yearly price', () => {
    renderPlan({
      activeBillingPeriod: 'yearly',
      activePlanPrice: '0.00',
      activePlanPriceYearly: null,
    });

    expect(screen.getByText('Miễn phí')).toBeInTheDocument();
    expect(screen.queryByText('Liên hệ')).not.toBeInTheDocument();
    expect(screen.queryByText('/năm')).not.toBeInTheDocument();
  });
});

// fix/goi-giu-cho-admin, Việc 4 — gói giữ chỗ "Tùy chọn"/"Liên hệ" (code custom/contact, is_custom=false)
// hiện "Liên hệ" thay vì "Miễn phí" dù price=0, để không trông như một gói miễn phí thật.
describe('PlanSection — nhãn giá gói giữ chỗ', () => {
  it('gói giữ chỗ (activePlanCode=custom, activePlanIsCustom=false, price=0) → "Liên hệ" thay vì "Miễn phí"', () => {
    renderPlan({ activePlanCode: 'custom', activePlanIsCustom: false, activePlanPrice: '0.00' });

    expect(screen.getByText('Liên hệ')).toBeInTheDocument();
    expect(screen.queryByText('Miễn phí')).not.toBeInTheDocument();
  });

  it('gói dùng thử giá 0 (code trial, không phải giữ chỗ) → vẫn "Miễn phí" như cũ', () => {
    renderPlan({ activePlanCode: 'trial', activePlanIsCustom: false, activePlanPrice: '0.00' });

    expect(screen.getByText('Miễn phí')).toBeInTheDocument();
    expect(screen.queryByText('Liên hệ')).not.toBeInTheDocument();
  });

  // Đột biến bắt được: nếu bỏ điều kiện is_custom trên FE, ca này đỏ vì gói custom thật (giá thật) bị
  // hiện nhầm "Liên hệ" thay vì giá.
  it('gói custom THẬT (activePlanCode=custom nhưng activePlanIsCustom=true) → hiện giá thật, không phải "Liên hệ"', () => {
    renderPlan({ activePlanCode: 'custom', activePlanIsCustom: true, activePlanPrice: '900000' });

    expect(screen.getByText('900.000 ₫')).toBeInTheDocument();
    expect(screen.queryByText('Liên hệ')).not.toBeInTheDocument();
  });
});

// fix/goi-giu-cho-admin, Việc 5 — hạn mức null phải hiện không giới hạn, không phải 0. PLAN_SO_LIEU_DUNG_GON_KHOP
// PR-3: nguồn của thanh tài nguyên đổi sang `resourceUsage[khoá] = { used, limit }` do backend tính bằng ĐÚNG hàm của
// cổng tạo mới. `limit` đã gồm slot mua thêm còn hạn → PlanSection truyền nguyên xi xuống UsageBar (null = không giới
// hạn, 0 = gói không hỗ trợ), TUYỆT ĐỐI không tự cộng `addons` lần nữa và không ép null thành 0.
const bar = (labelKey) => screen.getByTestId(`usage-${labelKey}`);
const barIfAny = (labelKey) => screen.queryByTestId(`usage-${labelKey}`);
const usedOf = (labelKey) => bar(labelKey).dataset.used;
const limitOf = (labelKey) => bar(labelKey).dataset.limit;

describe('PlanSection — tài nguyên lấy từ resourceUsage của backend', () => {
  it('limit null (không giới hạn) truyền nguyên là null; used đi kèm đúng số cổng đếm', () => {
    renderPlan({ resourceUsage: { zaloAccounts: { used: 7, limit: null } } });
    expect(usedOf('topup.items.zaloAccounts')).toBe('7');
    expect(limitOf('topup.items.zaloAccounts')).toBe('null');
  });

  it('limit 0 (gói không hỗ trợ) vẫn là 0, KHÔNG bị hiểu là không giới hạn', () => {
    renderPlan({ resourceUsage: { zaloAccounts: { used: 0, limit: 0 } } });
    expect(limitOf('topup.items.zaloAccounts')).toBe('0');
  });

  // Đột biến: PlanSection cộng `addons` vào trần (như bản cũ) → 1 + 3 + ... đỏ ở ca này.
  it('limit ĐÃ gồm slot mua thêm → không cộng addons lần thứ hai', () => {
    renderPlan({
      resourceUsage: { zaloAccounts: { used: 1, limit: 5 } },
      addons: { zaloAccounts: 3 },
    });
    expect(limitOf('topup.items.zaloAccounts')).toBe('5');
  });

  it('mọi tài nguyên đọc từ resourceUsage: chatbot, landing page, tài khoản Zalo/Email, nhân viên', () => {
    renderPlan({
      // Trước đây các số này đọc từ chatbotsUsed/landingPagesUsed/... (luôn 0) và planMaxEmployees.
      planMaxEmployees: 99,
      resourceUsage: {
        chatbots: { used: 3, limit: 3 },
        landingPages: { used: 2, limit: 7 },
        zaloAccounts: { used: 1, limit: 4 },
        emailAccounts: { used: 1, limit: null },
        employees: { used: 2, limit: 4 },
      },
    });
    expect([usedOf('topup.items.chatbots'), limitOf('topup.items.chatbots')]).toEqual(['3', '3']);
    expect([usedOf('topup.items.landingPages'), limitOf('topup.items.landingPages')]).toEqual(['2', '7']);
    expect([usedOf('topup.items.zaloAccounts'), limitOf('topup.items.zaloAccounts')]).toEqual(['1', '4']);
    expect([usedOf('topup.items.emailAccounts'), limitOf('topup.items.emailAccounts')]).toEqual(['1', 'null']);
    // trần nhân viên là trần HIỆU LỰC của cổng (4), không phải plan_max_employees (99)
    expect([usedOf('topup.items.employees'), limitOf('topup.items.employees')]).toEqual(['2', '4']);
  });

  it('chatbot luôn có dòng riêng, kể cả khi gói không giới hạn và chưa có chatbot nào', () => {
    renderPlan({ resourceUsage: { chatbots: { used: 0, limit: null } } });
    expect(usedOf('topup.items.chatbots')).toBe('0');
    expect(limitOf('topup.items.chatbots')).toBe('null');
  });

  it('đồng hồ lỗi (null) hoặc backend cũ chưa trả resourceUsage → used = null (UsageBar hiện "—"), không phải 0', () => {
    renderPlan({ resourceUsage: { chatbots: null } });
    expect(usedOf('topup.items.chatbots')).toBe('null');
    // các dòng khác không có trong resourceUsage cũng là "không biết", không phải 0
    expect(usedOf('topup.items.landingPages')).toBe('null');
    expect(usedOf('topup.items.employees')).toBe('null');
  });

  it('không có resourceUsage nào (backend cũ) thì trang vẫn dựng được, không ném lỗi', () => {
    expect(() => renderPlan({})).not.toThrow();
    expect(usedOf('topup.items.zaloAccounts')).toBe('null');
  });
});

// W5 — hạn mức số tài khoản WhatsApp/Telegram: chỉ hiện dòng khi gói có trần (NULL = không giới hạn thì ẩn,
// trừ khi đã có tài khoản); trần 0 hiện "x / 0".
describe('PlanSection — W5 hạn mức tài khoản WhatsApp/Telegram', () => {
  it('gói NULL và chưa có tài khoản -> ẩn cả hai dòng', () => {
    renderPlan({
      resourceUsage: { whatsappAccounts: { used: 0, limit: null }, telegramAccounts: { used: 0, limit: null } },
    });
    expect(barIfAny('accountProfileModal.whatsappAccounts')).not.toBeInTheDocument();
    expect(barIfAny('accountProfileModal.telegramAccounts')).not.toBeInTheDocument();
  });

  it('có trần -> hiện đúng limit; trần 0 vẫn là 0, không bị hiểu là không giới hạn', () => {
    renderPlan({
      resourceUsage: { whatsappAccounts: { used: 1, limit: 2 }, telegramAccounts: { used: 0, limit: 0 } },
    });
    expect(limitOf('accountProfileModal.whatsappAccounts')).toBe('2');
    expect(limitOf('accountProfileModal.telegramAccounts')).toBe('0');
  });

  it('gói NULL nhưng đã có tài khoản Telegram -> hiện dòng, limit null (không giới hạn)', () => {
    renderPlan({ resourceUsage: { telegramAccounts: { used: 2, limit: null } } });
    expect(usedOf('accountProfileModal.telegramAccounts')).toBe('2');
    expect(limitOf('accountProfileModal.telegramAccounts')).toBe('null');
  });

  it('đồng hồ WhatsApp/Telegram lỗi (null) hoặc thiếu -> ẩn dòng, không hiện "—" cho dòng vốn hay bị ẩn', () => {
    renderPlan({ resourceUsage: { whatsappAccounts: null } });
    expect(barIfAny('accountProfileModal.whatsappAccounts')).not.toBeInTheDocument();
    expect(barIfAny('accountProfileModal.telegramAccounts')).not.toBeInTheDocument();
  });
});

// PR-3 — khối "Tin nhắn trong kỳ": số theo KỲ của gói; thanh "hôm nay" chỉ khi gói có trần ngày; thanh tổng kỳ chỉ khi
// gói đặt messages_per_period.
describe('PlanSection — tin nhắn trong kỳ', () => {
  const PLAN_CO_TRAN = {
    monthlyEmailLimit: 10000,
    monthlyZaloLimit: 5000,
    emailSentCycle: 3400,
    messagingSentCycle: 120,
  };

  it('email và "Zalo · Telegram · WhatsApp": đã dùng TRONG KỲ / trần tháng của gói', () => {
    renderPlan(PLAN_CO_TRAN);
    expect([usedOf('accountProfileModal.email'), limitOf('accountProfileModal.email')]).toEqual(['3400', '10000']);
    expect([usedOf('accountProfileModal.messagingChannels'), limitOf('accountProfileModal.messagingChannels')])
      .toEqual(['120', '5000']);
  });

  it('gói KHÔNG có trần ngày → không có thanh "hôm nay" nào', () => {
    renderPlan({ ...PLAN_CO_TRAN, dailyEmailLimit: null, dailyZaloLimit: null, emailSentToday: null, messagingSentToday: null });
    expect(barIfAny('accountProfileModal.emailToday')).not.toBeInTheDocument();
    expect(barIfAny('accountProfileModal.messagingToday')).not.toBeInTheDocument();
  });

  it('gói CÓ trần ngày → hiện thanh hôm nay tương ứng với số đếm hôm nay', () => {
    renderPlan({
      ...PLAN_CO_TRAN,
      dailyEmailLimit: 500,
      dailyZaloLimit: 200,
      emailSentToday: 12,
      messagingSentToday: 5,
    });
    expect([usedOf('accountProfileModal.emailToday'), limitOf('accountProfileModal.emailToday')]).toEqual(['12', '500']);
    expect([usedOf('accountProfileModal.messagingToday'), limitOf('accountProfileModal.messagingToday')]).toEqual(['5', '200']);
  });

  it('trần ngày chỉ có ở một kênh → chỉ hiện thanh của kênh đó', () => {
    renderPlan({ ...PLAN_CO_TRAN, dailyEmailLimit: 500, emailSentToday: 1, dailyZaloLimit: null });
    expect(bar('accountProfileModal.emailToday')).toBeInTheDocument();
    expect(barIfAny('accountProfileModal.messagingToday')).not.toBeInTheDocument();
  });

  it('gói đặt trần TỔNG kỳ (dùng thử: 100) → hiện thanh tổng; không đặt → không có thanh tổng', () => {
    renderPlan({ ...PLAN_CO_TRAN, messagesPerPeriod: 100, combinedSentCycle: 26 });
    expect([usedOf('accountProfileModal.messagesCombined'), limitOf('accountProfileModal.messagesCombined')]).toEqual(['26', '100']);
  });

  it('gói KHÔNG đặt trần tổng kỳ → không có thanh tổng', () => {
    renderPlan({ ...PLAN_CO_TRAN, messagesPerPeriod: null, combinedSentCycle: null });
    expect(barIfAny('accountProfileModal.messagesCombined')).not.toBeInTheDocument();
  });

  it('đồng hồ tin gửi không đọc được (null) → used null (UsageBar hiện "—"), không phải 0', () => {
    renderPlan({ monthlyEmailLimit: 10000, monthlyZaloLimit: 5000, emailSentCycle: null, messagingSentCycle: null });
    expect(usedOf('accountProfileModal.email')).toBe('null');
    expect(usedOf('accountProfileModal.messagingChannels')).toBe('null');
  });

  it('không còn đọc tên cũ: emailSentMonth / zaloSentMonth (số journey sai kỳ) bị bỏ qua', () => {
    renderPlan({ monthlyEmailLimit: 10000, emailSentMonth: 999, emailSentCycle: 3400 });
    expect(usedOf('accountProfileModal.email')).toBe('3400');
  });
});

// P10 — hạn mức tin RIÊNG Telegram/WhatsApp (không còn dùng chung Zalo): hiện dòng khi gói có trần (NULL = không giới hạn thì
// ẩn, trừ khi đã gửi); trần 0 vẫn là 0 (không bị hiểu là không giới hạn); số đã dùng lấy từ telegramSentCycle/
// whatsappSentCycle (số của backend, cùng hàm + cùng kỳ với cổng chặn), KHÔNG phải messagingSentCycle (chỉ còn Zalo).
describe('PlanSection — P10 hạn mức tin Telegram/WhatsApp', () => {
  it('gói NULL và chưa gửi -> ẩn cả hai dòng', () => {
    renderPlan({ monthlyTelegramLimit: null, monthlyWhatsappLimit: null, telegramSentCycle: 0, whatsappSentCycle: 0 });
    expect(screen.queryByTestId('usage-accountProfileModal.telegramMessages')).not.toBeInTheDocument();
    expect(screen.queryByTestId('usage-accountProfileModal.whatsappMessages')).not.toBeInTheDocument();
  });

  it('có trần -> hiện đúng limit của TỪNG kênh (khác nhau, khác Zalo); trần 0 vẫn là 0; dòng Zalo giữ trần Zalo', () => {
    renderPlan({
      monthlyZaloLimit: 8000,
      monthlyTelegramLimit: 300,
      monthlyWhatsappLimit: 0,
      messagingSentCycle: 40,
      telegramSentCycle: 12,
    });
    expect(limitOf('accountProfileModal.telegramMessages')).toBe('300');
    expect(limitOf('accountProfileModal.whatsappMessages')).toBe('0');
    expect(limitOf('accountProfileModal.messagingChannels')).toBe('8000');
  });

  it('số đã dùng của từng dòng lấy đúng trường của kênh đó', () => {
    renderPlan({
      monthlyTelegramLimit: 300,
      monthlyWhatsappLimit: 200,
      messagingSentCycle: 40,
      telegramSentCycle: 12,
      whatsappSentCycle: 5,
    });
    expect(usedOf('accountProfileModal.telegramMessages')).toBe('12');
    expect(usedOf('accountProfileModal.whatsappMessages')).toBe('5');
    expect(usedOf('accountProfileModal.messagingChannels')).toBe('40');
  });

  it('gói NULL nhưng đã gửi Telegram -> vẫn hiện dòng (limit null = không giới hạn)', () => {
    renderPlan({ monthlyTelegramLimit: null, telegramSentCycle: 5 });
    expect(limitOf('accountProfileModal.telegramMessages')).toBe('null');
    expect(screen.queryByTestId('usage-accountProfileModal.whatsappMessages')).not.toBeInTheDocument();
  });
});
