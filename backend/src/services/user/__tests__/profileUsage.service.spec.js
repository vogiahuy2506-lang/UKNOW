/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-3 — profileUsage.service: số "đã dùng" của hồ sơ / trang Thanh toán
 * phải đi qua ĐÚNG hàm của cổng chặn, cùng kỳ. Unit test này ghim: (1) gọi hàm nào, với kỳ nào; (2) khi nào
 * KHÔNG gọi (trần ngày / trần tổng không đặt); (3) lỗi từng phần → null + log tên đồng hồ, không kéo đồng hồ khác
 * hỏng theo, không bao giờ 0 giả. Phép đếm SQL thật (đúng bảng/cột) do integration profileUsageSnapshot.test.js kiểm.
 */
import { beforeEach, afterEach, describe, expect, it, jest } from '@jest/globals';

const getBillingCycle = jest.fn();
const countEmailSentInCycleWithLedger = jest.fn();
const countZaloSentInCycleWithLedger = jest.fn();
const countCombinedSentInCycleWithLedger = jest.fn();
const countEmailSentTodayWithLedger = jest.fn();
const countZaloSentTodayWithLedger = jest.fn();
const countAdapterSentInCycleWithLedger = jest.fn();
const getResourceUsageSnapshot = jest.fn();
const countActiveChatbotsByUser = jest.fn();
const resolveEffectiveCeiling = jest.fn();
const computeEmployeeLimitInfo = jest.fn();

jest.unstable_mockModule('../../../utils/billingCycle.util.js', () => ({ getBillingCycle }));
// DB giả: các hàm *WithLedger nhận `queryable` làm tham số ĐẦU (đúng chữ ký thật ở sendQuota.repository.js).
const DB = { __db: true };
const DAY_START = new Date('2026-10-18T17:00:00.000Z');
const DAY_END = new Date('2026-10-19T17:00:00.000Z');
const getVnDayBoundaries = jest.fn(() => ({ vnDayStart: DAY_START, vnDayEnd: DAY_END }));

jest.unstable_mockModule('../../../config/database.js', () => ({ default: DB }));
jest.unstable_mockModule('../../quota/sendQuotaReservation.service.js', () => ({ getVnDayBoundaries }));
jest.unstable_mockModule('../../../repositories/sendQuota.repository.js', () => ({
  countEmailSentInCycleWithLedger,
  countZaloSentInCycleWithLedger,
  countCombinedSentInCycleWithLedger,
  countEmailSentTodayWithLedger,
  countZaloSentTodayWithLedger,
  countAdapterSentInCycleWithLedger,
}));
jest.unstable_mockModule('../../../utils/userResourceLimit.util.js', () => ({ getResourceUsageSnapshot }));
jest.unstable_mockModule('../../../repositories/ai/chatbot.repository.js', () => ({
  default: { countActiveChatbotsByUser },
}));
jest.unstable_mockModule('../../payment/topupLock.service.js', () => ({ resolveEffectiveCeiling }));
jest.unstable_mockModule('../employee.service.js', () => ({ computeEmployeeLimitInfo }));

const { getProfileSendUsage, getProfileResourceUsage } = await import('../profileUsage.service.js');

const CYCLE_START = new Date('2026-09-10T02:30:00.000Z');
const CYCLE_END = new Date('2026-10-10T02:30:00.000Z');
const CYCLE = { hasPlan: true, billingUserId: 42, cycleStart: CYCLE_START, cycleEnd: CYCLE_END };

let errorSpy;

beforeEach(() => {
  [
    getBillingCycle, countEmailSentInCycleWithLedger, countZaloSentInCycleWithLedger, countCombinedSentInCycleWithLedger,
    countEmailSentTodayWithLedger, countZaloSentTodayWithLedger, countAdapterSentInCycleWithLedger, getResourceUsageSnapshot, countActiveChatbotsByUser,
    resolveEffectiveCeiling, computeEmployeeLimitInfo,
  ].forEach((fn) => fn.mockReset());
  getBillingCycle.mockResolvedValue(CYCLE);
  countEmailSentInCycleWithLedger.mockResolvedValue(3400);
  countZaloSentInCycleWithLedger.mockResolvedValue(120);
  countCombinedSentInCycleWithLedger.mockResolvedValue(3520);
  countEmailSentTodayWithLedger.mockResolvedValue(12);
  countZaloSentTodayWithLedger.mockResolvedValue(5);
  countAdapterSentInCycleWithLedger.mockImplementation(async (_db, _uid, channel) => (channel === 'telegram' ? 7 : 9));
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe('getProfileSendUsage — tin gửi theo kỳ, đúng hàm của cổng chặn', () => {
  it('đếm email + nhắn tin trong ĐÚNG kỳ của getBillingCycle(billingUserId); trả kèm kỳ', async () => {
    const out = await getProfileSendUsage(42, {});

    expect(getBillingCycle).toHaveBeenCalledWith(42);
    expect(countEmailSentInCycleWithLedger).toHaveBeenCalledWith(DB, 42, CYCLE_START, CYCLE_END);
    expect(countZaloSentInCycleWithLedger).toHaveBeenCalledWith(DB, 42, CYCLE_START, CYCLE_END);
    expect(out).toMatchObject({
      cycleStart: CYCLE_START,
      cycleEnd: CYCLE_END,
      emailSentCycle: 3400,
      messagingSentCycle: 120,
    });
  });

  // P10 — Telegram/WhatsApp có hạn mức tin/tháng RIÊNG: đếm bằng countAdapterSentInCycleWithLedger (hàm của cổng chặn), cùng kỳ; Zalo
  // (messagingSentCycle) chỉ còn Zalo.
  it('P10: telegramSentCycle/whatsappSentCycle qua countAdapterSentInCycleWithLedger đúng kênh + đúng kỳ; lỗi một kênh chỉ null kênh đó', async () => {
    const out = await getProfileSendUsage(42, {});
    expect(countAdapterSentInCycleWithLedger).toHaveBeenCalledWith(DB, 42, 'telegram', CYCLE_START, CYCLE_END);
    expect(countAdapterSentInCycleWithLedger).toHaveBeenCalledWith(DB, 42, 'whatsapp', CYCLE_START, CYCLE_END);
    expect(out).toMatchObject({ telegramSentCycle: 7, whatsappSentCycle: 9, messagingSentCycle: 120 });

    countAdapterSentInCycleWithLedger.mockImplementation(async (_db, _uid, channel) => {
      if (channel === 'telegram') throw new Error('tg down');
      return 9;
    });
    const partial = await getProfileSendUsage(42, {});
    expect(partial.telegramSentCycle).toBeNull();
    expect(partial.whatsappSentCycle).toBe(9);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ meter: 'telegramSentCycle', billingUserId: 42, message: 'tg down' })
    );
  });

  it('P10: chưa có kỳ (hasPlan=false) → telegramSentCycle/whatsappSentCycle null, không gọi hàm đếm', async () => {
    getBillingCycle.mockResolvedValue({ hasPlan: false, billingUserId: 42, cycleStart: null, cycleEnd: null });
    const out = await getProfileSendUsage(42, {});
    expect(countAdapterSentInCycleWithLedger).not.toHaveBeenCalled();
    expect(out).toMatchObject({ telegramSentCycle: null, whatsappSentCycle: null });
  });

  it('gói KHÔNG đặt trần tổng kỳ / trần ngày → không gọi hàm tương ứng, trả null (không phải 0)', async () => {
    const out = await getProfileSendUsage(42, {
      daily_email_limit: null,
      daily_zalo_limit: null,
      messages_per_period: null,
    });

    expect(countCombinedSentInCycleWithLedger).not.toHaveBeenCalled();
    expect(countEmailSentTodayWithLedger).not.toHaveBeenCalled();
    expect(countZaloSentTodayWithLedger).not.toHaveBeenCalled();
    expect(out.combinedSentCycle).toBeNull();
    expect(out.emailSentToday).toBeNull();
    expect(out.messagingSentToday).toBeNull();
  });

  it('gói CÓ trần tổng kỳ và trần ngày → gọi countCombinedSentInCycleWithLedger (cùng kỳ) và hai hàm đếm hôm nay của cổng', async () => {
    const out = await getProfileSendUsage(42, {
      daily_email_limit: 500,
      daily_zalo_limit: '100', // pg có thể trả chuỗi cho một số kiểu số — vẫn là "có trần"
      messages_per_period: 100,
    });

    expect(countCombinedSentInCycleWithLedger).toHaveBeenCalledWith(DB, 42, CYCLE_START, CYCLE_END);
    expect(countEmailSentTodayWithLedger).toHaveBeenCalledWith(DB, 42, DAY_START, DAY_END);
    expect(countZaloSentTodayWithLedger).toHaveBeenCalledWith(DB, 42, DAY_START, DAY_END);
    expect(out).toMatchObject({ combinedSentCycle: 3520, emailSentToday: 12, messagingSentToday: 5 });
  });

  it('trần ngày = 0 vẫn là "gói có trần" (cổng coi là không hỗ trợ) → vẫn đếm, không nhầm thành không đặt', async () => {
    await getProfileSendUsage(42, { daily_email_limit: 0, daily_zalo_limit: 0, messages_per_period: 0 });

    expect(countEmailSentTodayWithLedger).toHaveBeenCalledTimes(1);
    expect(countZaloSentTodayWithLedger).toHaveBeenCalledTimes(1);
    expect(countCombinedSentInCycleWithLedger).toHaveBeenCalledTimes(1);
  });

  it('chưa có gói (hasPlan=false) → không có kỳ để đếm: mọi số theo kỳ null, kỳ null, không gọi hàm đếm kỳ', async () => {
    getBillingCycle.mockResolvedValue({ hasPlan: false, billingUserId: 42, cycleStart: null, cycleEnd: null });

    const out = await getProfileSendUsage(42, { messages_per_period: 100 });

    expect(countEmailSentInCycleWithLedger).not.toHaveBeenCalled();
    expect(countZaloSentInCycleWithLedger).not.toHaveBeenCalled();
    expect(countCombinedSentInCycleWithLedger).not.toHaveBeenCalled();
    expect(out).toMatchObject({
      cycleStart: null,
      cycleEnd: null,
      emailSentCycle: null,
      messagingSentCycle: null,
      combinedSentCycle: null,
    });
  });

  it('không có dòng gói (planRow=null) → vẫn đếm theo kỳ, nhưng bỏ hôm nay và tổng kỳ (không biết trần)', async () => {
    const out = await getProfileSendUsage(42, null);

    expect(out.emailSentCycle).toBe(3400);
    expect(out.messagingSentCycle).toBe(120);
    expect(out.combinedSentCycle).toBeNull();
    expect(out.emailSentToday).toBeNull();
    expect(countEmailSentTodayWithLedger).not.toHaveBeenCalled();
  });

  it('một đồng hồ lỗi → null cho ĐÚNG đồng hồ đó, log tên, các đồng hồ khác vẫn có số (không 0 giả)', async () => {
    countZaloSentInCycleWithLedger.mockRejectedValue(new Error('boom'));

    const out = await getProfileSendUsage(42, { daily_email_limit: 500, messages_per_period: 100 });

    expect(out.messagingSentCycle).toBeNull();
    expect(out.emailSentCycle).toBe(3400);
    expect(out.combinedSentCycle).toBe(3520);
    expect(out.emailSentToday).toBe(12);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ meter: 'messagingSentCycle', billingUserId: 42, message: 'boom' })
    );
  });

  it('getBillingCycle ném lỗi → mọi số theo kỳ null nhưng "hôm nay" (không cần kỳ) vẫn có; không ném ra ngoài', async () => {
    getBillingCycle.mockRejectedValue(new Error('cycle down'));

    const out = await getProfileSendUsage(42, { daily_email_limit: 500 });

    expect(out).toMatchObject({
      cycleStart: null,
      cycleEnd: null,
      emailSentCycle: null,
      messagingSentCycle: null,
      emailSentToday: 12,
    });
    expect(errorSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ meter: 'sendCycle', message: 'cycle down' })
    );
  });
});

describe('getProfileResourceUsage — tài nguyên, đúng hàm của từng cổng tạo mới', () => {
  beforeEach(() => {
    getResourceUsageSnapshot.mockResolvedValue({
      landingPages: { used: 2, limit: 5 },
      zaloAccounts: { used: 1, limit: null },
      emailAccounts: { used: 0, limit: 2 },
      whatsappAccounts: { used: 0, limit: 0 },
      telegramAccounts: { used: 3, limit: 3 },
      campaigns: { used: 2, limit: 6 },
      zaloCampaigns: { used: 1, limit: 2 },
      zaloGroupCampaigns: { used: 0, limit: null },
      emailCampaigns: { used: 1, limit: 2 },
    });
    countActiveChatbotsByUser.mockResolvedValue(2);
    resolveEffectiveCeiling.mockResolvedValue(3);
    computeEmployeeLimitInfo.mockResolvedValue({
      hasActivePlan: true, maxEmployees: 3, topupSlots: 1, effectiveMax: 4, current: 2,
    });
  });

  it('9 tài nguyên trong RESOURCE_LIMIT_MAP (gồm 4 khoá chiến dịch) đi qua getResourceUsageSnapshot; chatbot & nhân viên qua cổng riêng', async () => {
    const out = await getProfileResourceUsage(42);

    expect(getResourceUsageSnapshot).toHaveBeenCalledWith(
      42,
      [
        'landingPages', 'zaloAccounts', 'emailAccounts', 'whatsappAccounts', 'telegramAccounts',
        'campaigns', 'zaloCampaigns', 'zaloGroupCampaigns', 'emailCampaigns',
      ]
    );
    // chatbot: đếm is_active (countActiveChatbotsByUser) + trần plans.max_chatbots + slot mua thêm (resolveEffectiveCeiling)
    expect(countActiveChatbotsByUser).toHaveBeenCalledWith(42);
    expect(resolveEffectiveCeiling).toHaveBeenCalledWith(42, 'chatbots');
    expect(out).toEqual({
      chatbots: { used: 2, limit: 3 },
      landingPages: { used: 2, limit: 5 },
      zaloAccounts: { used: 1, limit: null },
      emailAccounts: { used: 0, limit: 2 },
      whatsappAccounts: { used: 0, limit: 0 },
      telegramAccounts: { used: 3, limit: 3 },
      employees: { used: 2, limit: 4 },
      campaigns: { used: 2, limit: 6 },
      zaloCampaigns: { used: 1, limit: 2 },
      zaloGroupCampaigns: { used: 0, limit: null },
      emailCampaigns: { used: 1, limit: 2 },
    });
  });

  it('bốn khoá chiến dịch: gói không trần → limit null; đồng hồ chiến dịch lỗi/thiếu → null (không 0 giả)', async () => {
    getResourceUsageSnapshot.mockResolvedValue({
      campaigns: { used: 0, limit: null },
      zaloCampaigns: { used: 0, limit: null },
      zaloGroupCampaigns: { used: 0, limit: null },
      emailCampaigns: null,
    });
    const out = await getProfileResourceUsage(42);
    expect(out.campaigns).toEqual({ used: 0, limit: null });
    expect(out.zaloCampaigns).toEqual({ used: 0, limit: null });
    expect(out.zaloGroupCampaigns).toEqual({ used: 0, limit: null });
    expect(out.emailCampaigns).toBeNull();
  });

  it('chatbot không giới hạn (Infinity) → limit null, không phải Infinity/0', async () => {
    resolveEffectiveCeiling.mockResolvedValue(Infinity);
    const out = await getProfileResourceUsage(42);
    expect(out.chatbots).toEqual({ used: 2, limit: null });
  });

  it('nhân viên: -1 = không giới hạn → null; chưa có gói → limit 0; đếm lấy từ computeEmployeeLimitInfo.current', async () => {
    computeEmployeeLimitInfo.mockResolvedValue({
      hasActivePlan: true, maxEmployees: -1, topupSlots: 0, effectiveMax: -1, current: 7,
    });
    expect((await getProfileResourceUsage(42)).employees).toEqual({ used: 7, limit: null });

    computeEmployeeLimitInfo.mockResolvedValue({
      hasActivePlan: false, maxEmployees: null, topupSlots: 0, effectiveMax: 0, current: 1,
    });
    expect((await getProfileResourceUsage(42)).employees).toEqual({ used: 1, limit: 0 });
  });

  it('một tài nguyên lỗi → null cho đúng nó + log tên; tài nguyên khác vẫn có số', async () => {
    countActiveChatbotsByUser.mockRejectedValue(new Error('chatbot table down'));
    computeEmployeeLimitInfo.mockRejectedValue(new Error('employee down'));

    const out = await getProfileResourceUsage(42);

    expect(out.chatbots).toBeNull();
    expect(out.employees).toBeNull();
    expect(out.landingPages).toEqual({ used: 2, limit: 5 });
    expect(out.zaloAccounts).toEqual({ used: 1, limit: null });
    expect(errorSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ meter: 'chatbots', message: 'chatbot table down' })
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ meter: 'employees', message: 'employee down' })
    );
  });

  it('getResourceUsageSnapshot ném lỗi (lỗi lập trình) → 9 mục đó null, chatbot & nhân viên vẫn có số; không ném ra ngoài', async () => {
    getResourceUsageSnapshot.mockRejectedValue(new Error('Resource key không hợp lệ: x'));

    const out = await getProfileResourceUsage(42);

    expect(out.landingPages).toBeNull();
    expect(out.zaloAccounts).toBeNull();
    expect(out.emailAccounts).toBeNull();
    expect(out.whatsappAccounts).toBeNull();
    expect(out.telegramAccounts).toBeNull();
    expect(out.campaigns).toBeNull();
    expect(out.zaloCampaigns).toBeNull();
    expect(out.zaloGroupCampaigns).toBeNull();
    expect(out.emailCampaigns).toBeNull();
    expect(out.chatbots).toEqual({ used: 2, limit: 3 });
    expect(out.employees).toEqual({ used: 2, limit: 4 });
  });
});
