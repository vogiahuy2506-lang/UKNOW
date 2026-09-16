import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PR-2 an ninh (nối tiếp c8cbd190) — Việc 1: zaloPersonal.adapter.js:704 gọi
 * prepareZaloAttachmentSources cho tệp đính kèm khi trả lời hộp thư Zalo cá nhân nhưng KHÔNG
 * truyền ownerUserId (đã sửa: truyền `{ ownerUserId: userId }`).
 *
 * BẪY đã kiểm trước khi sửa (xem báo cáo PR): `userId` truyền vào sendReply() ở CẢ 4 nơi gọi
 * thật (unifiedInbox.service.js:574 qua resolveWorkspaceOwnerId(req.user), unifiedInbox.service.js
 * retryMessage qua resolveWorkspaceOwnerId(req.user), zaloInbox.service.js qua account.id_user)
 * đều LÀ CHỦ WORKSPACE, không phải id nhân viên thao tác — nên lọc trực tiếp theo `userId` là an
 * toàn, không lọc oan tệp hợp lệ của chủ khi một NHÂN VIÊN đang là người bấm gửi.
 *
 * Test 1 mô phỏng đúng tình huống đó: `userId` = id CHỦ workspace (owner truyền vào sendReply
 * đúng như unifiedInbox.service.js làm), tệp đính kèm thuộc về chủ → phải vẫn được gửi dù người
 * bấm gửi thực tế trong request gốc là nhân viên (bản thân sendReply không hề biết ai là nhân
 * viên — đây chính là điểm phải giữ đúng).
 */

const mockGetAccountApi = jest.fn();
const mockFindActiveSessionByAccountId = jest.fn();
const mockResourceIsLocked = jest.fn().mockResolvedValue(false);
const mockSendMessageWithAttachmentDispatch = jest.fn();

/** Bản giả lập lại đúng cơ chế lọc owner thật của campaignZaloSender.service.js. */
const mockPrepareZaloAttachmentSources = jest.fn(async (attachments, options = {}) => {
  const source = Array.isArray(attachments) ? attachments : [];
  const ownerUserId = options?.ownerUserId || null;
  const outputs = [];
  for (const attachment of source) {
    const key = String(attachment?.key || '');
    if (ownerUserId && key && !key.startsWith(`uploads/${ownerUserId}/`)) {
      console.warn(`[Test-fake CampaignZaloSender] Bỏ qua attachment không thuộc workspace ${ownerUserId}: ${key}`);
      continue;
    }
    outputs.push({ data: Buffer.from('fake'), filename: key, metadata: { totalSize: 4 } });
  }
  return outputs;
});

jest.unstable_mockModule('../../../zalo/zaloAccountSession.service.js', () => ({
  default: {
    getAccountApi: mockGetAccountApi,
  },
}));

jest.unstable_mockModule('../../../../repositories/chatbot/zaloPersonal.repository.js', () => ({
  default: {
    findActiveSessionByAccountId: mockFindActiveSessionByAccountId,
    findConversation: jest.fn().mockResolvedValue(null),
    insertAgentMessage: jest.fn().mockResolvedValue(null),
    touchConversation: jest.fn().mockResolvedValue(null),
  },
}));

jest.unstable_mockModule('../../../../repositories/ai/chatbot.repository.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../../../campaign/campaignZaloSender.service.js', () => ({
  default: {
    prepareZaloAttachmentSources: mockPrepareZaloAttachmentSources,
    sendMessageWithAttachmentDispatch: mockSendMessageWithAttachmentDispatch,
  },
}));

jest.unstable_mockModule('../../../../utils/topupLockGate.util.js', () => ({
  resourceIsLocked: mockResourceIsLocked,
}));

const { default: zaloPersonalAdapter } = await import('../zaloPersonal.adapter.js');

describe('zaloPersonal.adapter sendReply — lọc attachment theo owner (userId luôn là chủ workspace, không phải nhân viên)', () => {
  const OWNER_ID = 10; // chủ workspace — resolveWorkspaceOwnerId(req.user) dù ai bấm gửi trong hộp thư

  beforeEach(() => {
    jest.clearAllMocks();
    mockResourceIsLocked.mockResolvedValue(false);
    mockGetAccountApi.mockReturnValue({}); // truthy api → session hợp lệ
    mockFindActiveSessionByAccountId.mockResolvedValue({ id: 88 });
    mockSendMessageWithAttachmentDispatch.mockImplementation(async ({ attachments }) => ({
      status: 'success',
      response: {},
      dispatchResults: [{ delivery: { status: 'delivered', msgIds: ['123456'] } }],
      // giữ lại attachments đã gửi để test đọc ngược lại số lượng thật đã dispatch
      __attachmentsSent: attachments,
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('nhân viên (không phải chủ) trả lời kèm tệp hợp lệ CỦA CHỦ → tệp VẪN được gửi (userId truyền vào là owner, không lọc oan)', async () => {
    const result = await zaloPersonalAdapter.sendReply({
      externalId: 'zalo_uid_visitor_1',
      message: 'Chào bạn, đây là file bạn cần',
      userId: OWNER_ID, // luôn = resolveWorkspaceOwnerId(req.user) ở mọi nơi gọi thật, KHÔNG phải id nhân viên
      accountId: 88,
      persist: false,
      attachments: [
        { key: `uploads/${OWNER_ID}/chat/hop-dong.pdf`, displayName: 'hop-dong.pdf' },
      ],
    });

    expect(result.success).toBe(true);
    expect(mockPrepareZaloAttachmentSources).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ key: `uploads/${OWNER_ID}/chat/hop-dong.pdf` })]),
      expect.objectContaining({ ownerUserId: OWNER_ID })
    );
    const dispatchedAttachments = mockSendMessageWithAttachmentDispatch.mock.calls[0][0].attachments;
    expect(dispatchedAttachments).toHaveLength(1);
    expect(dispatchedAttachments[0].filename).toBe(`uploads/${OWNER_ID}/chat/hop-dong.pdf`);
  });

  it('tệp key thuộc workspace khác lọt vào payload → bị lọc, không gửi tới provider', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await zaloPersonalAdapter.sendReply({
      externalId: 'zalo_uid_visitor_1',
      message: 'Chào bạn',
      userId: OWNER_ID,
      accountId: 88,
      persist: false,
      attachments: [
        { key: `uploads/${OWNER_ID}/chat/hop-le.pdf`, displayName: 'hop-le.pdf' },
        { key: 'uploads/999/chat/trom.pdf', displayName: 'trom.pdf' },
      ],
    });

    const dispatchedAttachments = mockSendMessageWithAttachmentDispatch.mock.calls[0][0].attachments;
    expect(dispatchedAttachments).toHaveLength(1);
    expect(dispatchedAttachments[0].filename).toBe(`uploads/${OWNER_ID}/chat/hop-le.pdf`);
    const warnedWithLeak = warnSpy.mock.calls.some((args) => String(args[0] || '').includes('uploads/999/chat/trom.pdf'));
    expect(warnedWithLeak).toBe(true);

    warnSpy.mockRestore();
  });
});
