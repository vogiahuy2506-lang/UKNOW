import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PR-2 an ninh (nối tiếp c8cbd190) — Việc 2: chặn TẠI GỐC. emailTemplate.controller.js:update()
 * nhận thẳng mảng `attachments` do client gửi (finalAttachments = [...incomingAttachments])
 * rồi lưu vào DB — client tự chèn key `uploads/<workspace khác>/...` là mẫu của mình mang theo
 * key trộm được, sau đó campaign run/Quick Send đọc trộm tệp đó khi gửi (bộ lọc phía ĐỌC —
 * Việc 1 — chỉ chặn được nơi đã truyền ownerUserId, không phải mọi đường đọc trong tương lai).
 */

const mockFindForWrite = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockLog = jest.fn();
const mockDeleteFromS3 = jest.fn();

jest.unstable_mockModule('../upload.controller.js', () => ({
  default: {
    normalizeStorageKey: (input) => {
      if (!input) return '';
      const raw = typeof input === 'object' ? (input.key || '') : input;
      const text = String(raw || '').trim();
      return text.startsWith('uploads/') ? text : '';
    },
    deleteFromS3: mockDeleteFromS3,
  },
}));

jest.unstable_mockModule('../../repositories/email/emailTemplate.repository.js', () => ({
  default: {
    findForWrite: mockFindForWrite,
    update: mockUpdate,
    delete: mockDelete,
    syncTemplateFile: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.unstable_mockModule('../../config/database.js', () => ({
  default: { getClient: jest.fn() },
}));

jest.unstable_mockModule('../../services/audit.service.js', () => ({
  default: { log: mockLog },
  AUDIT_ACTIONS: {
    EMAIL_TEMPLATE_UPDATED: 'EMAIL_TEMPLATE_UPDATED',
    EMAIL_TEMPLATE_DELETED: 'EMAIL_TEMPLATE_DELETED',
  },
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
    mockDeleteFromS3.mockResolvedValue({ success: true, deletedCount: 0, skippedCount: 0, errors: [] });
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

/**
 * Đường XOÁ tệp: `deletedAttachments` do client gửi và `attachments` đã lưu (client ghi được từ
 * trước) chỉ được xoá tệp trong `uploads/<chủ mẫu>/`, và `deletedAttachments` chỉ nhận tệp đang
 * đính kèm chính mẫu này.
 */
describe('emailTemplate.controller — xoá tệp đính kèm chỉ trong không gian chủ mẫu', () => {
  let warnSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockLog.mockResolvedValue(undefined);
    mockDeleteFromS3.mockResolvedValue({ success: true, deletedCount: 0, skippedCount: 0, errors: [] });
    mockDelete.mockResolvedValue(undefined);
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

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('deletedAttachments trỏ tệp workspace khác → không xoá tệp đó', async () => {
    mockFindForWrite.mockResolvedValue({
      id: 55,
      id_user: 10,
      attachments: [{ key: 'uploads/10/email_template/giu.pdf' }],
    });
    const req = {
      user: { id: 10, role: 'owner' },
      params: { id: '55' },
      body: {
        attachments: [{ key: 'uploads/10/email_template/giu.pdf' }],
        deletedAttachments: ['uploads/999/email_template/nan-nhan.pdf', { key: 'uploads/999/x.png' }],
      },
    };

    await emailTemplateController.update(req, buildRes());

    expect(mockDeleteFromS3).not.toHaveBeenCalled();
  });

  it('deletedAttachments trỏ tệp cùng workspace nhưng KHÔNG thuộc mẫu này → không xoá', async () => {
    mockFindForWrite.mockResolvedValue({
      id: 55,
      id_user: 10,
      attachments: [{ key: 'uploads/10/email_template/giu.pdf' }],
    });
    const req = {
      user: { id: 10, role: 'owner' },
      params: { id: '55' },
      body: {
        attachments: [{ key: 'uploads/10/email_template/giu.pdf' }],
        deletedAttachments: ['uploads/10/media/anh-thu-vien.png'],
      },
    };

    await emailTemplateController.update(req, buildRes());

    expect(mockDeleteFromS3).not.toHaveBeenCalled();
  });

  it('gỡ tệp của chính mẫu → xoá kèm ownerUserId; tệp cũ ngoài workspace chỉ gỡ khỏi mẫu, không xoá', async () => {
    mockFindForWrite.mockResolvedValue({
      id: 55,
      id_user: 10,
      attachments: [
        { key: 'uploads/10/email_template/bo.pdf' },
        { key: 'uploads/999/email_template/cu-ngoai-workspace.pdf' },
      ],
    });
    const req = {
      user: { id: 10, role: 'owner' },
      params: { id: '55' },
      body: {
        attachments: [],
        deletedAttachments: ['uploads/10/email_template/bo.pdf'],
      },
    };
    const res = buildRes();

    await emailTemplateController.update(req, res);

    expect(mockDeleteFromS3).toHaveBeenCalledTimes(1);
    expect(mockDeleteFromS3).toHaveBeenCalledWith(['uploads/10/email_template/bo.pdf'], { ownerUserId: 10 });
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ attachments: [] }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('xoá mẫu → chỉ xoá tệp trong không gian chủ mẫu, truyền ownerUserId', async () => {
    mockFindForWrite.mockResolvedValue({
      id: 55,
      id_user: 10,
      attachments: [
        { key: 'uploads/10/email_template/a.pdf' },
        { key: 'uploads/999/email_template/b.pdf' },
      ],
    });
    const req = { user: { id: 10, role: 'owner' }, params: { id: '55' } };
    const res = buildRes();

    await emailTemplateController.delete(req, res);

    expect(mockDelete).toHaveBeenCalled();
    expect(mockDeleteFromS3).toHaveBeenCalledWith(['uploads/10/email_template/a.pdf'], { ownerUserId: 10 });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('super admin xoá mẫu của chủ khác → ownerUserId là chủ mẫu (id_user), không phải admin', async () => {
    mockFindForWrite.mockResolvedValue({
      id: 56,
      id_user: 77,
      attachments: [
        { key: 'uploads/77/email_template/a.pdf' },
        { key: 'uploads/1/email_template/cua-admin.pdf' },
      ],
    });
    const req = { user: { id: 1, role: 'admin' }, params: { id: '56' } };

    await emailTemplateController.delete(req, buildRes());

    expect(mockDeleteFromS3).toHaveBeenCalledWith(['uploads/77/email_template/a.pdf'], { ownerUserId: 77 });
  });
});
