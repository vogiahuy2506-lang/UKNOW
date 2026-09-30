import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PR-2 an ninh (nối tiếp c8cbd190) — Việc 2: chặn TẠI GỐC. zaloTemplate.controller.js:update()
 * nhận thẳng mảng `attachments` do client gửi (finalAttachments = [...incomingAttachments])
 * rồi lưu vào DB — client tự chèn key `uploads/<workspace khác>/...` là mẫu Zalo của mình
 * mang theo key trộm được, sau đó campaign run/Quick Send đọc trộm tệp đó khi gửi.
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

jest.unstable_mockModule('../../repositories/zalo/zaloTemplate.repository.js', () => ({
  default: {
    findForWrite: mockFindForWrite,
    update: mockUpdate,
    delete: mockDelete,
  },
}));

jest.unstable_mockModule('../../config/database.js', () => ({
  default: { getClient: jest.fn() },
}));

jest.unstable_mockModule('../../services/audit.service.js', () => ({
  default: { log: mockLog },
  AUDIT_ACTIONS: {
    ZALO_TEMPLATE_UPDATED: 'ZALO_TEMPLATE_UPDATED',
    ZALO_TEMPLATE_DELETED: 'ZALO_TEMPLATE_DELETED',
  },
  AUDIT_ENTITY_TYPES: { ZALO_TEMPLATE: 'zalo_template' },
}));

const zaloTemplateController = (await import('../zaloTemplate.controller.js')).default;

function buildRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

function buildTemplateRow(attachments, id = 66) {
  return {
    id,
    template_name: 'Ưu đãi Zalo',
    template_code: 'promo_zalo',
    subject: null,
    body_text: 'nội dung',
    attachments,
    variables: [],
    category: null,
    is_active: true,
    usage_count: 0,
    is_used_in_active_campaign: false,
    creator_name: null,
    created_at: null,
    updated_at: null,
  };
}

describe('zaloTemplate.controller update() — lọc attachment không thuộc workspace chủ mẫu ngay lúc lưu', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLog.mockResolvedValue(undefined);
    mockDeleteFromS3.mockResolvedValue({ success: true, deletedCount: 0, skippedCount: 0, errors: [] });
    mockFindForWrite.mockResolvedValue({
      id: 66,
      id_user: 10,
      attachments: [],
    });
    mockUpdate.mockImplementation(async ({ attachments }) => ({
      id: 66,
      template_name: 'Ưu đãi Zalo',
      template_code: 'promo_zalo',
      subject: null,
      body_text: 'nội dung',
      attachments,
      variables: [],
      category: null,
      is_active: true,
      usage_count: 0,
      is_used_in_active_campaign: false,
      creator_name: null,
      created_at: null,
      updated_at: null,
    }));
  });

  it('gửi kèm key thuộc workspace khác -> mẫu lưu xong không chứa key đó, có cảnh báo log', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const req = {
      user: { id: 10, role: 'owner' },
      params: { id: '66' },
      body: {
        attachments: [
          { key: 'uploads/10/zalo_template/hop-le.pdf', displayName: 'hop-le.pdf' },
          { key: 'uploads/999/zalo_template/trom.pdf', displayName: 'trom.pdf' },
        ],
      },
    };
    const res = buildRes();

    await zaloTemplateController.update(req, res);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [expect.objectContaining({ key: 'uploads/10/zalo_template/hop-le.pdf' })],
      })
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        attachments: [expect.objectContaining({ key: 'uploads/10/zalo_template/hop-le.pdf' })],
      }),
    }));
    const warnedWithLeak = warnSpy.mock.calls.some((args) => String(args[0] || '').includes('uploads/999/zalo_template/trom.pdf'));
    expect(warnedWithLeak).toBe(true);

    warnSpy.mockRestore();
  });

  it('chỉ gửi key hợp lệ -> lưu bình thường, không cảnh báo', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const req = {
      user: { id: 10, role: 'owner' },
      params: { id: '66' },
      body: {
        attachments: [{ key: 'uploads/10/zalo_template/hop-le.pdf', displayName: 'hop-le.pdf' }],
      },
    };
    const res = buildRes();

    await zaloTemplateController.update(req, res);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [expect.objectContaining({ key: 'uploads/10/zalo_template/hop-le.pdf' })],
      })
    );
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('zaloTemplate.controller — xoá tệp đính kèm chỉ trong không gian chủ mẫu', () => {
  let warnSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockLog.mockResolvedValue(undefined);
    mockDeleteFromS3.mockResolvedValue({ success: true, deletedCount: 0, skippedCount: 0, errors: [] });
    mockDelete.mockResolvedValue(undefined);
    mockUpdate.mockImplementation(async ({ attachments }) => buildTemplateRow(attachments));
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('deletedAttachments trỏ tệp workspace khác / tệp không thuộc mẫu → không xoá', async () => {
    mockFindForWrite.mockResolvedValue({
      id: 66,
      id_user: 10,
      attachments: [{ key: 'uploads/10/zalo_template/giu.pdf' }],
    });
    const req = {
      user: { id: 10, role: 'owner' },
      params: { id: '66' },
      body: {
        attachments: [{ key: 'uploads/10/zalo_template/giu.pdf' }],
        deletedAttachments: ['uploads/999/zalo_template/nan-nhan.pdf', 'uploads/10/media/khac.png'],
      },
    };

    await zaloTemplateController.update(req, buildRes());

    expect(mockDeleteFromS3).not.toHaveBeenCalled();
  });

  it('gỡ tệp của chính mẫu → xoá kèm ownerUserId; tệp cũ ngoài workspace chỉ gỡ, không xoá', async () => {
    mockFindForWrite.mockResolvedValue({
      id: 66,
      id_user: 10,
      attachments: [
        { key: 'uploads/10/zalo_template/bo.pdf' },
        { key: 'uploads/999/zalo_template/cu.pdf' },
      ],
    });
    const req = {
      user: { id: 10, role: 'owner' },
      params: { id: '66' },
      body: { attachments: [], deletedAttachments: ['uploads/10/zalo_template/bo.pdf'] },
    };

    await zaloTemplateController.update(req, buildRes());

    expect(mockDeleteFromS3).toHaveBeenCalledTimes(1);
    expect(mockDeleteFromS3).toHaveBeenCalledWith(['uploads/10/zalo_template/bo.pdf'], { ownerUserId: 10 });
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ attachments: [] }));
  });

  it('xoá mẫu → chỉ xoá tệp trong không gian chủ mẫu, truyền ownerUserId', async () => {
    mockFindForWrite.mockResolvedValue({
      id: 66,
      id_user: 10,
      attachments: [
        { key: 'uploads/10/zalo_template/a.pdf' },
        { key: 'uploads/999/zalo_template/b.pdf' },
      ],
    });
    const req = { user: { id: 10, role: 'owner' }, params: { id: '66' } };
    const res = buildRes();

    await zaloTemplateController.delete(req, res);

    expect(mockDelete).toHaveBeenCalled();
    expect(mockDeleteFromS3).toHaveBeenCalledWith(['uploads/10/zalo_template/a.pdf'], { ownerUserId: 10 });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
