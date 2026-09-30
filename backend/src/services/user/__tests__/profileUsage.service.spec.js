/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-3 — profileUsage.service: số "đã dùng" của hồ sơ / trang Thanh toán
 * phải đi qua ĐÚNG hàm của cổng chặn, cùng kỳ. Unit test này ghim: (1) gọi hàm nào, với kỳ nào; (2) khi nào
 * KHÔNG gọi (trần ngày / trần tổng không đặt); (3) lỗi từng phần → null + log tên đồng hồ, không kéo đồng hồ khác
 * hỏng theo, không bao giờ 0 giả. Phép đếm SQL thật (đúng bảng/cột) do integration profileUsageSnapshot.test.js kiểm.
 */
import { beforeEach, afterEach, describe, expect, it, jest } from '@jest/globals';

const getBillingCycle = jest.fn();
const countEmailSentInCycle = jest.fn();
const countZaloSentInCycle = jest.fn();
const countCombinedSentInCycle = jest.fn();
const countEmailSentToday = jest.fn();
const countZaloSentToday = jest.fn();
const countAdapterSentInCycle = jest.fn();
const getResourceUsageSnapshot = jest.fn();
const countActiveChatbotsByUser = jest.fn();
const resolveEffectiveCeiling = jest.fn();
const computeEmployeeLimitInfo = jest.fn();

jest.unstable_mockModule('../../../utils/billingCycle.util.js', () => ({ getBillingCycle }));
jest.unstable_mockModule('../../../utils/userSendLimit.util.js', () => ({
  countEmailSentInCycle,
  countZaloSentInCycle,
  countCombinedSentInCycle,
  countEmailSentToday,
  countZaloSentToday,
  countAdapterSentInCycle,
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
    getBillingCycle, countEmailSentInCycle, countZaloSentInCycle, countCombinedSentInCycle,
    countEmailSentToday, countZaloSentToday, countAdapterSentInCycle, getResourceUsageSnapshot, countActiveChatbotsByUser,
    resolveEffectiveCeiling, computeEmployeeLimitInfo,
  ].forEach((fn) => fn.mockReset());
  getBillingCycle.mockResolvedValue(CYCLE);
  countEmailSentInCycle.mockResolvedValue(3400);
  countZaloSentInCycle.mockResolvedValue(120);
  countCombinedSentInCycle.mockResolvedValue(3520);
  countEmailSentToday.mockResolvedValue(12);
  countZaloSentToday.mockResolvedValue(5);
  countAdapterSentInCycle.mockImplementation(async (_uid, channel) => (channel === 'telegram' ? 7 : 9));
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe('getProfileSendUsage — tin gửi theo kỳ, đúng hàm của cổng chặn', () => {
  it('đếm email + nhắn tin trong ĐÚNG kỳ của getBillingCycle(billingUserId); trả kèm kỳ', async () => {
    const out = await getProfileSendUsage(42, {});

    expect(getBillingCycle).toHaveBeenCalledWith(42);
    expect(countEmailSentInCycle).toHaveBeenCalledWith(42, CYCLE_START, CYCLE_END);
    expect(countZaloSentInCycle).toHaveBeenCalledWith(42, CYCLE_START, CYCLE_END);
    expect(out).toMatchObject({
      cycleStart: CYCLE_START,
      cycleEnd: CYCLE_END,
      emailSentCycle: 3400,
      messagingSentCycle: 120,
    });
  });

  // P10 — Telegram/WhatsApp có hạn mức tin/tháng RIÊNG: đếm bằng countAdapterSentInCycle (hàm của cổng chặn), cùng kỳ; Zalo
  // (messagingSentCycle) chỉ còn Zalo.
  it('P10: telegramSentCycle/whatsappSentCycle qua countAdapterSentInCycle đúng kênh + đúng kỳ; lỗi một kênh chỉ null kênh đó', async () => {
    const out = await getProfileSendUsage(42, {});
    expect(countAdapterSentInCycle).toHaveBeenCalledWith(42, 'telegram', CYCLE_START, CYCLE_END);
    expect(countAdapterSentInCycle).toHaveBeenCalledWith(42, 'whatsapp', CYCLE_START, CYCLE_END);
    expect(out).toMatchObject({ telegramSentCycle: 7, whatsappSentCycle: 9, messagingSentCycle: 120 });

    countAdapterSentInCycle.mockImplementation(async (_uid, channel) => {
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
    expect(countAdapterSentInCycle).not.toHaveBeenCalled();
    expect(out).toMatchObject({ telegramSentCycle: null, whatsappSentCycle: null });
  });

  it('gói KHÔNG đặt trần tổng kỳ / trần ngày → không gọi hàm tương ứng, trả null (không phải 0)', async () => {
    const out = await getProfileSendUsage(42, {
      daily_email_limit: null,
      daily_zalo_limit: null,
      messages_per_period: null,
    });

    expect(countCombinedSentInCycle).not.toHaveBeenCalled();
    expect(countEmailSentToday).not.toHaveBeenCalled();
    expect(countZaloSentToday).not.toHaveBeenCalled();
    expect(out.combinedSentCycle).toBeNull();
    expect(out.emailSentToday).toBeNull();
    expect(out.messagingSentToday).toBeNull();
  });

  it('gói CÓ trần tổng kỳ và trần ngày → gọi countCombinedSentInCycle (cùng kỳ) và hai hàm đếm hôm nay của cổng', async () => {
    const out = await getProfileSendUsage(42, {
      daily_email_limit: 500,
      daily_zalo_limit: '100', // pg có thể trả chuỗi cho một số kiểu số — vẫn là "có trần"
      messages_per_period: 100,
    });

    expect(countCombinedSentInCycle).toHaveBeenCalledWith(42, CYCLE_START, CYCLE_END);
    expect(countEmailSentToday).toHaveBeenCalledWith(42);
    expect(countZaloSentToday).toHaveBeenCalledWith(42);
    expect(out).toMatchObject({ combinedSentCycle: 3520, emailSentToday: 12, messagingSentToday: 5 });
  });

  it('trần ngày = 0 vẫn là "gói có trần" (cổng coi là không hỗ trợ) → vẫn đếm, không nhầm thành không đặt', async () => {
    await getProfileSendUsage(42, { daily_email_limit: 0, daily_zalo_limit: 0, messages_per_period: 0 });

    expect(countEmailSentToday).toHaveBeenCalledTimes(1);
    expect(countZaloSentToday).toHaveBeenCalledTimes(1);
    expect(countCombinedSentInCycle).toHaveBeenCalledTimes(1);
  });

  it('chưa có gói (hasPlan=false) → không có kỳ để đếm: mọi số theo kỳ null, kỳ null, không gọi hàm đếm kỳ', async () => {
    getBillingCycle.mockResolvedValue({ hasPlan: false, billingUserId: 42, cycleStart: null, cycleEnd: null });

    const out = await getProfileSendUsage(42, { messages_per_period: 100 });

    expect(countEmailSentInCycle).not.toHaveBeenCalled();
    expect(countZaloSentInCycle).not.toHaveBeenCalled();
    expect(countCombinedSentInCycle).not.toHaveBeenCalled();
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
    expect(countEmailSentToday).not.toHaveBeenCalled();
  });

  it('một đồng hồ lỗi → null cho ĐÚNG đồng hồ đó, log tên, các đồng hồ khác vẫn có số (không 0 giả)', async () => {
    countZaloSentInCycle.mockRejectedValue(new Error('boom'));

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
    });
    countActiveChatbotsByUser.mockResolvedValue(2);
    resolveEffectiveCeiling.mockResolvedValue(3);
    computeEmployeeLimitInfo.mockResolvedValue({
      hasActivePlan: true, maxEmployees: 3, topupSlots: 1, effectiveMax: 4, current: 2,
    });
  });

  it('5 tài nguyên trong RESOURCE_LIMIT_MAP đi qua getResourceUsageSnapshot; chatbot & nhân viên qua cổng riêng', async () => {
    const out = await getProfileResourceUsage(42);

    expect(getResourceUsageSnapshot).toHaveBeenCalledWith(
      42,
      ['landingPages', 'zaloAccounts', 'emailAccounts', 'whatsappAccounts', 'telegramAccounts']
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
    });
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

  it('getResourceUsageSnapshot ném lỗi (lỗi lập trình) → 5 mục đó null, chatbot & nhân viên vẫn có số; không ném ra ngoài', async () => {
    getResourceUsageSnapshot.mockRejectedValue(new Error('Resource key không hợp lệ: x'));

    const out = await getProfileResourceUsage(42);

    expect(out.landingPages).toBeNull();
    expect(out.zaloAccounts).toBeNull();
    expect(out.emailAccounts).toBeNull();
    expect(out.whatsappAccounts).toBeNull();
    expect(out.telegramAccounts).toBeNull();
    expect(out.chatbots).toEqual({ used: 2, limit: 3 });
    expect(out.employees).toEqual({ used: 2, limit: 4 });
  });
});
