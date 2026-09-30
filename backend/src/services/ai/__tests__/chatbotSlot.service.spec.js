/**
 * chatbotSlot.service — "còn suất chatbot không?" dùng chung cổng tạo / clone khi chia sẻ / mua Marketplace
 * (30/09/2026). Unit test kiểm LOGIC ghép nối (khoá tư vấn → trần → đếm → ném lỗi đúng hình dạng cổng tạo);
 * con số thật (xoá mềm không tính, cộng slot mua thêm, NULL = không giới hạn) đo trên CSDL thật ở
 * tests/integration/chatbotSlotCloneMarketplace.test.js.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockResolveEffectiveCeiling = jest.fn();
const mockCountActive = jest.fn();

jest.unstable_mockModule('../../payment/topupLock.service.js', () => ({
  resolveEffectiveCeiling: (...args) => mockResolveEffectiveCeiling(...args),
}));

jest.unstable_mockModule('../../../repositories/ai/chatbot.repository.js', () => ({
  default: { countActiveChatbotsByUser: (...args) => mockCountActive(...args) },
}));

const { assertChatbotSlotAvailable, createChatbotLimitExceededError, CHATBOT_LIMIT_EXCEEDED_CODE } =
  await import('../chatbotSlot.service.js');

function makeClient(callLog = []) {
  return {
    query: jest.fn(async (sql, params) => {
      callLog.push(['query', String(sql).trim().slice(0, 40), params]);
      return { rows: [] };
    }),
  };
}

beforeEach(() => {
  mockResolveEffectiveCeiling.mockReset();
  mockCountActive.mockReset();
});

describe('assertChatbotSlotAvailable', () => {
  it('còn suất (used < trần) → không ném', async () => {
    mockResolveEffectiveCeiling.mockResolvedValue(3);
    mockCountActive.mockResolvedValue(2);

    await expect(assertChatbotSlotAvailable(7)).resolves.toBeUndefined();
    expect(mockResolveEffectiveCeiling).toHaveBeenCalledWith(7, 'chatbots', undefined);
    expect(mockCountActive).toHaveBeenCalledWith(7, undefined);
  });

  it('chạm trần (used >= trần) → CHATBOT_LIMIT_EXCEEDED đúng hình dạng cổng tạo: 403, used, limit, upgradeRequired, thông điệp', async () => {
    mockResolveEffectiveCeiling.mockResolvedValue(1);
    mockCountActive.mockResolvedValue(1);

    await expect(assertChatbotSlotAvailable(7)).rejects.toMatchObject({
      status: 403,
      statusCode: 403,
      code: 'CHATBOT_LIMIT_EXCEEDED',
      used: 1,
      limit: 1,
      upgradeRequired: true,
      message: 'Bạn đã đạt giới hạn 1 chatbot của gói dịch vụ hiện tại.',
    });
  });

  it('trần 0 (gói không có chatbot / không có gói) → chặn ngay cả khi chưa có chatbot nào', async () => {
    mockResolveEffectiveCeiling.mockResolvedValue(0);
    mockCountActive.mockResolvedValue(0);

    await expect(assertChatbotSlotAvailable(7)).rejects.toMatchObject({ code: 'CHATBOT_LIMIT_EXCEEDED', limit: 0 });
  });

  it('không giới hạn (Infinity) → không đếm, không ném', async () => {
    mockResolveEffectiveCeiling.mockResolvedValue(Infinity);

    await expect(assertChatbotSlotAvailable(7)).resolves.toBeUndefined();
    expect(mockCountActive).not.toHaveBeenCalled();
  });

  it('super admin → bỏ qua hoàn toàn (không đọc trần, không đếm, không khoá), kể cả khi lẽ ra bị chặn', async () => {
    mockResolveEffectiveCeiling.mockResolvedValue(0);
    mockCountActive.mockResolvedValue(99);
    const client = makeClient();

    await expect(assertChatbotSlotAvailable(7, { client, roleCode: 'admin' })).resolves.toBeUndefined();
    expect(mockResolveEffectiveCeiling).not.toHaveBeenCalled();
    expect(mockCountActive).not.toHaveBeenCalled();
    expect(client.query).not.toHaveBeenCalled();
  });

  it('vai không phải admin (user/employee) vẫn bị kiểm', async () => {
    mockResolveEffectiveCeiling.mockResolvedValue(1);
    mockCountActive.mockResolvedValue(1);

    await expect(assertChatbotSlotAvailable(7, { roleCode: 'user' })).rejects.toMatchObject({ code: 'CHATBOT_LIMIT_EXCEEDED' });
    await expect(assertChatbotSlotAvailable(7, { roleCode: 'employee' })).rejects.toMatchObject({ code: 'CHATBOT_LIMIT_EXCEEDED' });
  });

  it('có client (trong transaction): lấy khoá tư vấn (chủ, chatbots) TRƯỚC khi đọc trần/đếm, và đọc qua CHÍNH client đó', async () => {
    const callLog = [];
    const client = makeClient(callLog);
    mockResolveEffectiveCeiling.mockImplementation(async () => { callLog.push(['ceiling']); return 5; });
    mockCountActive.mockImplementation(async () => { callLog.push(['count']); return 2; });

    await assertChatbotSlotAvailable(42, { client });

    expect(callLog.map((c) => c[0])).toEqual(['query', 'ceiling', 'count']);
    const [, sqlHead, params] = callLog[0];
    expect(sqlHead).toContain('pg_advisory_xact_lock');
    // Cùng khoá với enforceResourceLimitTx: ('user:<id>', 'chatbots').
    expect(params).toEqual(['user:42', 'chatbots']);
    expect(mockResolveEffectiveCeiling).toHaveBeenCalledWith(42, 'chatbots', client);
    expect(mockCountActive).toHaveBeenCalledWith(42, client);
  });

  it('không có client (cổng tạo): KHÔNG lấy khoá tư vấn', async () => {
    mockResolveEffectiveCeiling.mockResolvedValue(5);
    mockCountActive.mockResolvedValue(0);

    await assertChatbotSlotAvailable(42);
    // Không có client nào để gọi query — chỉ cần không ném và đọc qua pool mặc định (đối số undefined).
    expect(mockCountActive).toHaveBeenCalledWith(42, undefined);
  });
});

describe('createChatbotLimitExceededError', () => {
  it('mã lỗi xuất ra khớp hằng số dùng ở controller/FE', () => {
    expect(CHATBOT_LIMIT_EXCEEDED_CODE).toBe('CHATBOT_LIMIT_EXCEEDED');
    const err = createChatbotLimitExceededError({ used: 4, limit: 3 });
    expect(err.code).toBe(CHATBOT_LIMIT_EXCEEDED_CODE);
    expect(err.message).toBe('Bạn đã đạt giới hạn 3 chatbot của gói dịch vụ hiện tại.');
  });
});
