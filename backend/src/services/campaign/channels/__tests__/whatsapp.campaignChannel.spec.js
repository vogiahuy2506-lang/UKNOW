/**
 * PLAN_WHATSAPP_DAY_DU_2026-09-29 PR-W4a — unit test whatsapp.campaignChannel.js
 * (mock whatsappBaileys.service.js + repo hội thoại; không chạm DB/mạng).
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const getSessionMock = jest.fn();
const listPersistedSessionsMock = jest.fn();
const checkNumberExistsMock = jest.fn();
const sendMessageMock = jest.fn();
// P9 — cổng quyền kênh theo gói chạm CSDL (trần tài khoản kênh); spec này không kiểm nó nên giả lập cho qua (CI không có CSDL).
jest.unstable_mockModule('../../channelEntitlement.service.js', () => ({
  assertChannelEntitled: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../../../chatbot/whatsappBaileys.service.js', () => ({
  getSession: getSessionMock,
  listPersistedSessions: listPersistedSessionsMock,
  checkNumberExists: checkNumberExistsMock,
  sendMessage: sendMessageMock,
}));

const listOpenMock = jest.fn();
const countOpenMock = jest.fn();
jest.unstable_mockModule('../../../../repositories/chatbot/whatsappCampaignConversation.repository.js', () => ({
  default: {
    listOpenWhatsAppConversationsForSession: listOpenMock,
    countOpenConversationsBySessionKeys: countOpenMock,
  },
  extractPhoneFromExternalId: (externalId) => {
    const parts = String(externalId ?? '').split(':');
    return (parts[parts.length - 1] || '').trim();
  },
}));

// P6 — cổng khoá sau hạ gói: mặc định KHÔNG khoá; ca riêng bật khoá.
const whatsappSessionIsLockedMock = jest.fn(async () => false);
jest.unstable_mockModule('../../../../utils/topupLockGate.util.js', () => ({
  whatsappSessionIsLocked: whatsappSessionIsLockedMock,
  CHANNEL_ACCOUNT_LOCKED_MESSAGE: 'Tài khoản đang bị khoá do vượt hạn mức gói — nâng gói hoặc mua thêm slot để mở khoá.',
}));

const {
  whatsappChannelAdapter,
  classifyWhatsAppSendError,
  normalizeWhatsAppPhone,
  buildWhatsAppPolicyFromEnv,
  listWhatsAppAccountsForOwner,
} = await import('../whatsapp.campaignChannel.js');
const { ChannelSendError } = await import('../../campaignChannelRegistry.service.js');

const openSession = { sessionKey: '40-default', status: 'open', userName: 'Phúc' };
const node = (config) => ({ id: 7, config: { whatsappSessionKey: '40-default', ...config } });

beforeEach(() => {
  jest.resetAllMocks();
  getSessionMock.mockReturnValue(openSession);
  whatsappSessionIsLockedMock.mockResolvedValue(false);
});

describe('normalizeWhatsAppPhone', () => {
  it.each([
    ['0912345678', '84912345678'],
    ['84913345678', '84913345678'],
    ['+84 913-345-678', '84913345678'],
    ['(0912) 345 678', '84912345678'],
  ])('%s -> %s', (raw, expected) => {
    expect(normalizeWhatsAppPhone(raw)).toBe(expected);
  });

  it.each(['abc', '', null, undefined, '1234567', '1234567890123456'])('%s -> null (ngoài 8-15 chữ số)', (raw) => {
    expect(normalizeWhatsAppPhone(raw)).toBeNull();
  });
});

describe('classifyWhatsAppSendError (bảng phân loại Boom)', () => {
  const boom = (message, extra = {}) => Object.assign(new Error(message), extra);

  it.each([
    ['WhatsApp session 40-default is not connected', 'auth'],
    ['Connection Closed', 'auth'],
    ['Connection Terminated', 'auth'],
    ['Intentional Logout', 'auth'],
    ['Connection Failure', 'auth'],
    ['rate-overlimit', 'rate_limit'],
    ['too many requests', 'rate_limit'],
    ['not-authorized', 'hard'],
    ['forbidden', 'hard'],
    ['item-not-found', 'hard'],
    ['Timed Out', 'transient'],
    ['read ECONNRESET', 'transient'],
    ['connect ETIMEDOUT', 'transient'],
    ['một lỗi hoàn toàn mới', 'hard'],
  ])('"%s" -> %s', (message, expected) => {
    expect(classifyWhatsAppSendError(boom(message))).toBe(expected);
  });

  it.each([
    [{ output: { statusCode: 429 } }, 'rate_limit'],
    [{ output: { statusCode: 401 } }, 'auth'],
    [{ output: { statusCode: 428 } }, 'auth'],
    [{ output: { statusCode: 408 } }, 'transient'],
    [{ data: 429 }, 'rate_limit'],
    [{ data: 404 }, 'hard'],
    [{ output: { statusCode: 403 } }, 'hard'],
  ])('mã số %j -> %s', (extra, expected) => {
    expect(classifyWhatsAppSendError(boom('lỗi', extra))).toBe(expected);
  });

  it('ChannelSendError có sẵn category -> giữ nguyên', () => {
    expect(classifyWhatsAppSendError(new ChannelSendError('rate_limit', 'x'))).toBe('rate_limit');
  });
});

describe('buildWhatsAppPolicyFromEnv', () => {
  it('mặc định bảo thủ 8s-20s, 60/giờ, yên lặng 23-6', () => {
    expect(buildWhatsAppPolicyFromEnv()).toEqual({
      minDelayMs: 8000,
      maxDelayMs: 20000,
      perHourLimit: 60,
      quietHours: { startHour: 23, endHour: 6 },
    });
  });
});

describe('checkReadiness', () => {
  it('thiếu whatsappSessionKey -> WHATSAPP_ACCOUNT_NOT_READY', async () => {
    await expect(
      whatsappChannelAdapter.checkReadiness({ userId: 40, node: { id: 1, config: {} } })
    ).rejects.toMatchObject({ code: 'WHATSAPP_ACCOUNT_NOT_READY' });
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it('phiên của chủ khác (tiền tố khác) -> NOT_READY, không tra phiên', async () => {
    await expect(
      whatsappChannelAdapter.checkReadiness({ userId: 41, node: node({ recipientSource: 'manual', recipientKeys: '0912345678' }) })
    ).rejects.toMatchObject({ code: 'WHATSAPP_ACCOUNT_NOT_READY' });
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it('tiền tố phải khớp cả dấu gạch (chủ 4 không dùng phiên 40-default)', async () => {
    await expect(
      whatsappChannelAdapter.checkReadiness({ userId: 4, node: node({ recipientSource: 'manual', recipientKeys: '0912345678' }) })
    ).rejects.toMatchObject({ code: 'WHATSAPP_ACCOUNT_NOT_READY' });
  });

  it('không có phiên -> NOT_READY', async () => {
    getSessionMock.mockReturnValue(null);
    await expect(
      whatsappChannelAdapter.checkReadiness({ userId: 40, node: node({ recipientSource: 'manual', recipientKeys: '0912345678' }) })
    ).rejects.toMatchObject({ code: 'WHATSAPP_ACCOUNT_NOT_READY' });
  });

  it('phiên connecting -> NOT_READY kèm hướng dẫn quét lại QR', async () => {
    getSessionMock.mockReturnValue({ ...openSession, status: 'connecting' });
    await expect(
      whatsappChannelAdapter.checkReadiness({ userId: 40, node: node({ recipientSource: 'manual', recipientKeys: '0912345678' }) })
    ).rejects.toMatchObject({
      code: 'WHATSAPP_ACCOUNT_NOT_READY',
      message: expect.stringContaining('quét lại QR'),
    });
  });

  it('nguồn hội thoại: 0 hội thoại -> WHATSAPP_NO_RECIPIENTS; có 1 -> qua', async () => {
    listOpenMock.mockResolvedValueOnce([]);
    await expect(
      whatsappChannelAdapter.checkReadiness({ userId: 40, node: node({ recipientSource: 'whatsapp_conversations' }) })
    ).rejects.toMatchObject({ code: 'WHATSAPP_NO_RECIPIENTS' });
    listOpenMock.mockResolvedValueOnce([{ external_id: 'baileys:40-default:59:84912345678' }]);
    await expect(
      whatsappChannelAdapter.checkReadiness({ userId: 40, node: node({ recipientSource: 'whatsapp_conversations' }) })
    ).resolves.toBeUndefined();
    expect(listOpenMock).toHaveBeenCalledWith(40, '40-default');
  });

  it('manual: không có số hợp lệ -> NO_RECIPIENTS; có ít nhất 1 -> qua', async () => {
    await expect(
      whatsappChannelAdapter.checkReadiness({ userId: 40, node: node({ recipientSource: 'manual', recipientKeys: 'abc, 123' }) })
    ).rejects.toMatchObject({ code: 'WHATSAPP_NO_RECIPIENTS' });
    await expect(
      whatsappChannelAdapter.checkReadiness({ userId: 40, node: node({ recipientSource: 'manual', recipientKeys: ['0912345678'] }) })
    ).resolves.toBeUndefined();
  });

  it('nguồn node: bỏ qua kiểm người nhận', async () => {
    await expect(
      whatsappChannelAdapter.checkReadiness({ userId: 40, node: node({ recipientSource: 'node', recipientNodeId: '3' }) })
    ).resolves.toBeUndefined();
    expect(listOpenMock).not.toHaveBeenCalled();
  });
});

describe('resolveAccount', () => {
  it('trả sessionKey + display = tên WhatsApp; thiếu tên -> sessionKey', async () => {
    await expect(
      whatsappChannelAdapter.resolveAccount({ workspaceOwnerId: 40, config: { whatsappSessionKey: '40-default' }, node: { id: 1 } })
    ).resolves.toMatchObject({ accountKey: '40-default', sessionKey: '40-default', display: 'Phúc', ownerUserId: 40 });
    getSessionMock.mockReturnValue({ ...openSession, userName: null });
    await expect(
      whatsappChannelAdapter.resolveAccount({ workspaceOwnerId: 40, config: { whatsappSessionKey: '40-default' }, node: { id: 1 } })
    ).resolves.toMatchObject({ display: '40-default' });
  });

  it('khác chủ -> NOT_READY', async () => {
    await expect(
      whatsappChannelAdapter.resolveAccount({ workspaceOwnerId: 41, config: { whatsappSessionKey: '40-default' }, node: { id: 1 } })
    ).rejects.toMatchObject({ code: 'WHATSAPP_ACCOUNT_NOT_READY' });
  });

  describe('PLAN_GIAO_TK_TG_WA H2 — chốt chung: nhân viên chỉ dùng phiên được giao (accessibleChannelRefs)', () => {
    const resolve = (accessibleChannelRefs) => whatsappChannelAdapter.resolveAccount({
      workspaceOwnerId: 40, config: { whatsappSessionKey: '40-default' }, node: { id: 1 }, accessibleChannelRefs,
    });

    it('ngoài phạm vi / rỗng / thiếu khoá kênh → 403 CHANNEL_ACCOUNT_NOT_ASSIGNED', async () => {
      await expect(resolve({ telegram: null, whatsapp_baileys: ['40-khac'] })).rejects.toMatchObject({ status: 403, code: 'CHANNEL_ACCOUNT_NOT_ASSIGNED' });
      await expect(resolve({ telegram: null, whatsapp_baileys: [] })).rejects.toMatchObject({ code: 'CHANNEL_ACCOUNT_NOT_ASSIGNED' });
      await expect(resolve({ telegram: null })).rejects.toMatchObject({ code: 'CHANNEL_ACCOUNT_NOT_ASSIGNED' }); // hỏng thì chặn
      await expect(resolve(null)).rejects.toMatchObject({ code: 'CHANNEL_ACCOUNT_NOT_ASSIGNED' });
    });

    it('trong phạm vi / null / không truyền → qua', async () => {
      await expect(resolve({ telegram: [], whatsapp_baileys: ['40-default'] })).resolves.toMatchObject({ sessionKey: '40-default' });
      await expect(resolve({ telegram: null, whatsapp_baileys: null })).resolves.toMatchObject({ sessionKey: '40-default' });
      await expect(resolve(undefined)).resolves.toMatchObject({ sessionKey: '40-default' });
    });
  });
});

describe('resolveRecipients', () => {
  const account = { sessionKey: '40-default' };

  it('hội thoại: 3 dòng của 2 chatbot cùng một phone -> 2 người (khử trùng theo phone)', async () => {
    listOpenMock.mockResolvedValue([
      { external_id: 'baileys:40-default:59:84912345678', visitor_name: 'Lan' },
      { external_id: 'baileys:40-default:72:84912345678', visitor_name: 'Lan' },
      { external_id: 'baileys:40-default:59:84913345678', visitor_name: null },
    ]);
    const result = await whatsappChannelAdapter.resolveRecipients({
      rows: [], config: { recipientSource: 'whatsapp_conversations' }, account,
    });
    expect(result).toEqual([
      { recipientKey: '84912345678', display: 'Lan', vars: { ten: 'Lan' } },
      { recipientKey: '84913345678', display: '84913345678', vars: { ten: '' } },
    ]);
  });

  it('manual "0912…, 84913…, abc" -> 2 số 84…, bỏ "abc"', async () => {
    const result = await whatsappChannelAdapter.resolveRecipients({
      rows: [{ recipientKey: '0912345678' }, { recipientKey: '84913345678' }, { recipientKey: 'abc' }],
      config: { recipientSource: 'manual' },
      account,
    });
    expect(result.map((r) => r.recipientKey)).toEqual(['84912345678', '84913345678']);
  });

  it('manual trùng số ở hai dạng 0912… và 84912… -> 1 người', async () => {
    const result = await whatsappChannelAdapter.resolveRecipients({
      rows: [{ recipientKey: '0912345678' }, { recipientKey: '+84912345678' }],
      config: { recipientSource: 'manual' },
      account,
    });
    expect(result).toHaveLength(1);
  });

  it('node với recipientColumn: lấy đúng cột người dùng chọn (ưu tiên hơn cột phone mặc định)', async () => {
    const result = await whatsappChannelAdapter.resolveRecipients({
      rows: [
        { phone: '0900000001', zalo_so: '0912345678', display: 'A', vars: { ten: 'A' } },
        { phone: '0900000002', zalo_so: '' },
      ],
      config: { recipientSource: 'node', recipientColumn: 'zalo_so' },
      account,
    });
    expect(result).toEqual([{ recipientKey: '84912345678', display: 'A', vars: { ten: 'A' } }]);
  });

  it('node không có recipientColumn: dò phone/sdt/so_dien_thoai', async () => {
    const result = await whatsappChannelAdapter.resolveRecipients({
      rows: [{ sdt: '0912345678' }, { so_dien_thoai: '0913345678' }, { 'Số điện thoại': '0914345678' }],
      config: { recipientSource: 'node' },
      account,
    });
    expect(result.map((r) => r.recipientKey)).toEqual(['84912345678', '84913345678', '84914345678']);
  });
});

describe('sendOne', () => {
  const account = { sessionKey: '40-default' };

  it('thành công: kiểm số ngay trước khi gửi rồi gửi, trả messageId', async () => {
    checkNumberExistsMock.mockResolvedValue(true);
    sendMessageMock.mockResolvedValue({ key: { id: 'ABC123' } });
    await expect(
      whatsappChannelAdapter.sendOne({ account, recipientKey: '84912345678', text: 'xin chào' })
    ).resolves.toEqual({ messageId: 'ABC123' });
    expect(checkNumberExistsMock).toHaveBeenCalledWith('40-default', '84912345678');
    expect(sendMessageMock).toHaveBeenCalledWith('40-default', '84912345678', 'xin chào');
  });

  it('cắt tin ở 4096 ký tự', async () => {
    checkNumberExistsMock.mockResolvedValue(true);
    sendMessageMock.mockResolvedValue({ key: { id: 'X' } });
    await whatsappChannelAdapter.sendOne({ account, recipientKey: '84912345678', text: 'a'.repeat(5000) });
    expect(sendMessageMock.mock.calls[0][2]).toHaveLength(4096);
  });

  it('exists=false -> hard "Số không dùng WhatsApp", KHÔNG gửi', async () => {
    checkNumberExistsMock.mockResolvedValue(false);
    const rejection = whatsappChannelAdapter.sendOne({ account, recipientKey: '84912345678', text: 'x' });
    await expect(rejection).rejects.toBeInstanceOf(ChannelSendError);
    await expect(rejection).rejects.toMatchObject({ category: 'hard', message: 'Số không dùng WhatsApp' });
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('exists=null (usync không có kết quả) -> vẫn thử gửi', async () => {
    checkNumberExistsMock.mockResolvedValue(null);
    sendMessageMock.mockResolvedValue({ key: { id: 'Y' } });
    await expect(
      whatsappChannelAdapter.sendOne({ account, recipientKey: '84912345678', text: 'x' })
    ).resolves.toEqual({ messageId: 'Y' });
  });

  it('429 -> rate_limit kèm retryAfterMs 15 phút', async () => {
    checkNumberExistsMock.mockResolvedValue(true);
    sendMessageMock.mockRejectedValue(Object.assign(new Error('rate-overlimit'), { data: 429 }));
    await expect(
      whatsappChannelAdapter.sendOne({ account, recipientKey: '84912345678', text: 'x' })
    ).rejects.toMatchObject({ category: 'rate_limit', retryAfterMs: 15 * 60 * 1000 });
  });

  it('"is not connected" -> auth (dừng node, không đốt danh sách)', async () => {
    checkNumberExistsMock.mockResolvedValue(true);
    sendMessageMock.mockRejectedValue(new Error('WhatsApp session 40-default is not connected'));
    await expect(
      whatsappChannelAdapter.sendOne({ account, recipientKey: '84912345678', text: 'x' })
    ).rejects.toMatchObject({ category: 'auth' });
  });

  it('mất kết nối ngay ở bước kiểm số -> auth, không gửi', async () => {
    checkNumberExistsMock.mockRejectedValue(new Error('WhatsApp session 40-default is not connected'));
    await expect(
      whatsappChannelAdapter.sendOne({ account, recipientKey: '84912345678', text: 'x' })
    ).rejects.toMatchObject({ category: 'auth' });
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('Timed Out -> transient', async () => {
    checkNumberExistsMock.mockResolvedValue(true);
    sendMessageMock.mockRejectedValue(Object.assign(new Error('Timed Out'), { output: { statusCode: 408 } }));
    await expect(
      whatsappChannelAdapter.sendOne({ account, recipientKey: '84912345678', text: 'x' })
    ).rejects.toMatchObject({ category: 'transient' });
  });
});

describe('listWhatsAppAccountsForOwner', () => {
  it('chỉ trả phiên của chủ (tiền tố), kèm đếm hội thoại, không lộ userId/JID', async () => {
    listPersistedSessionsMock.mockResolvedValue(['40-default', '355-default', '4-x', '40-second']);
    countOpenMock.mockResolvedValue(new Map([['40-default', 6]]));
    getSessionMock.mockImplementation((key) => (key === '40-default'
      ? { sessionKey: key, status: 'open', userName: 'Phúc', userId: '84900000000:1@s.whatsapp.net' }
      : null));
    const data = await listWhatsAppAccountsForOwner(40);
    expect(data).toEqual([
      { sessionKey: '40-default', display: 'Phúc', status: 'open', openConversationCount: 6 },
      { sessionKey: '40-second', display: '40-second', status: 'offline', openConversationCount: 0 },
    ]);
    expect(countOpenMock).toHaveBeenCalledWith(40, ['40-default', '40-second']);
  });

  it('map trạng thái connecting / lạ -> connecting / offline', async () => {
    listPersistedSessionsMock.mockResolvedValue(['40-a', '40-b']);
    countOpenMock.mockResolvedValue(new Map());
    getSessionMock.mockImplementation((key) => ({
      sessionKey: key, status: key === '40-a' ? 'connecting' : 'closed', userName: null,
    }));
    const data = await listWhatsAppAccountsForOwner(40);
    expect(data.map((d) => d.status)).toEqual(['connecting', 'offline']);
  });
});

describe('P6 — phiên bị khoá do vượt hạn mức gói (hạ gói / slot hết hạn)', () => {
  it('checkReadiness: phiên bị khoá -> WHATSAPP_ACCOUNT_LOCKED (tra đúng sessionKey)', async () => {
    whatsappSessionIsLockedMock.mockResolvedValue(true);
    await expect(
      whatsappChannelAdapter.checkReadiness({ userId: 40, node: node({ recipientSource: 'manual', recipientKeys: '0912345678' }) })
    ).rejects.toMatchObject({ code: 'WHATSAPP_ACCOUNT_LOCKED', message: expect.stringContaining('bị khoá') });
    expect(whatsappSessionIsLockedMock).toHaveBeenCalledWith('40-default');
  });

  it('resolveAccount (lúc chạy + gửi nhanh): phiên bị khoá -> WHATSAPP_ACCOUNT_LOCKED', async () => {
    whatsappSessionIsLockedMock.mockResolvedValue(true);
    await expect(
      whatsappChannelAdapter.resolveAccount({ workspaceOwnerId: 40, config: { whatsappSessionKey: '40-default' }, node: { id: 1 } })
    ).rejects.toMatchObject({ code: 'WHATSAPP_ACCOUNT_LOCKED' });
  });
});
