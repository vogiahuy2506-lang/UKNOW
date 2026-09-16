import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PR-2 an ninh (nối tiếp c8cbd190) — Việc 2: chặn TẠI GỐC. emailTemplate.controller.js:update()
 * nhận thẳng mảng `attachments` do client gửi (finalAttachments = [...incomingAttachments])
 * rồi lưu vào DB — client tự chèn key `uploads/<workspace khác>/...` là mẫu của mình mang theo
 * key trộm được, sau đó campaign run/Quick Send đọc trộm tệp đó khi gửi (bộ lọc phía ĐỌC —
 * Việc 1 — chỉ chặn được nơi đã truyền ownerUserId, không phải mọi đường đọc trong tương lai).
 */

const mockFindForWrite = jest.fn();
const mockUpdate = jest.fn();
const mockLog = jest.fn();

jest.unstable_mockModule('../upload.controller.js', () => ({
  default: {
    normalizeStorageKey: (input) => {
      if (!input) return '';
      const raw = typeof input === 'object' ? (input.key || '') : input;
      const text = String(raw || '').trim();
      return text.startsWith('uploads/') ? text : '';
    },
    deleteFromS3: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.unstable_mockModule('../../repositories/email/emailTemplate.repository.js', () => ({
  default: {
    findForWrite: mockFindForWrite,
    update: mockUpdate,
    syncTemplateFile: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.unstable_mockModule('../../config/database.js', () => ({
  default: { getClient: jest.fn() },
}));

jest.unstable_mockModule('../../services/audit.service.js', () => ({
  default: { log: mockLog },
  AUDIT_ACTIONS: { EMAIL_TEMPLATE_UPDATED: 'EMAIL_TEMPLATE_UPDATED' },
  AUDIT_ENTITY_TYPES: { EMAIL_TEMPLATE: 'email_template' },
}));

const emailTemplateController = (await import('../emailTemplate.controller.js')).default;

function buildRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('emailTemplate.controller update() — lọc attachment không thuộc workspace chủ mẫu ngay lúc lưu', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLog.mockResolvedValue(undefined);
    mockFindForWrite.mockResolvedValue({
      id: 55,
      id_user: 10,
      attachments: [],
    });
    mockUpdate.mockImplementation(async ({ attachments }) => ({
      id: 55,
      template_name: 'Ưu đãi',
      template_code: 'promo',
      subject: 'subj',
      category: null,
      is_active: true,
      attachments,
    }));
  });

  it('gửi kèm key thuộc workspace khác -> mẫu lưu xong không chứa key đó, có cảnh báo log', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const req = {
      user: { id: 10, role: 'owner' },
      params: { id: '55' },
      body: {
        attachments: [
          { key: 'uploads/10/email_template/hop-le.pdf', displayName: 'hop-le.pdf' },
          { key: 'uploads/999/email_template/trom.pdf', displayName: 'trom.pdf' },
        ],
      },
    };
    const res = buildRes();

    await emailTemplateController.update(req, res);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [expect.objectContaining({ key: 'uploads/10/email_template/hop-le.pdf' })],
      })
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        attachments: [expect.objectContaining({ key: 'uploads/10/email_template/hop-le.pdf' })],
      }),
    }));
    const warnedWithLeak = warnSpy.mock.calls.some((args) => String(args[0] || '').includes('uploads/999/email_template/trom.pdf'));
    expect(warnedWithLeak).toBe(true);

    warnSpy.mockRestore();
  });

  it('chỉ gửi key hợp lệ -> lưu bình thường, không cảnh báo', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const req = {
      user: { id: 10, role: 'owner' },
      params: { id: '55' },
      body: {
        attachments: [{ key: 'uploads/10/email_template/hop-le.pdf', displayName: 'hop-le.pdf' }],
      },
    };
    const res = buildRes();

    await emailTemplateController.update(req, res);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [expect.objectContaining({ key: 'uploads/10/email_template/hop-le.pdf' })],
      })
    );
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
