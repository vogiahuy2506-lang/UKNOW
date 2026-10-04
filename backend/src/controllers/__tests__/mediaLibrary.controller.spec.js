import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockListWorkspaceStorageObjects = jest.fn();
const mockFindStorageObjectById = jest.fn();
const mockMarkDeletedAfterUnlink = jest.fn();
const mockMarkStorageObjectDeleted = jest.fn();
const mockResolveStorageObjectsUsage = jest.fn();
const mockDeleteChatCatalogRows = jest.fn();
const mockIsAssistantUploadOfOthers = jest.fn();
const mockResolveAbsolutePathFromKey = jest.fn();
const mockLogWorkspace = jest.fn();

jest.unstable_mockModule('../../repositories/mediaLibrary.repository.js', () => ({
  listWorkspaceStorageObjects: mockListWorkspaceStorageObjects,
  deleteChatCatalogRows: mockDeleteChatCatalogRows,
  isAssistantUploadOfOthers: mockIsAssistantUploadOfOthers,
}));

jest.unstable_mockModule('../../repositories/storage.repository.js', () => ({
  findStorageObjectById: mockFindStorageObjectById,
  markStorageObjectDeleted: mockMarkStorageObjectDeleted,
}));

jest.unstable_mockModule('../../services/storage/storageObject.service.js', () => ({
  markDeletedAfterUnlink: mockMarkDeletedAfterUnlink,
}));

jest.unstable_mockModule('../../services/storage/storageReference.service.js', () => ({
  resolveStorageObjectsUsage: mockResolveStorageObjectsUsage,
}));

jest.unstable_mockModule('../../services/audit.service.js', () => ({
  AUDIT_ACTIONS: { MEDIA_DELETED: 'media.deleted' },
  AUDIT_ENTITY_TYPES: { MEDIA_OBJECT: 'media_object' },
  logWorkspace: mockLogWorkspace,
}));

const mockResolveTempFilePath = jest.fn((tempKey) => `/tmp/test_uploads/${tempKey}`);

jest.unstable_mockModule('../upload.controller.js', () => ({
  default: {
    normalizeStorageKey: jest.fn((key) => key),
    resolveAbsolutePathFromKey: mockResolveAbsolutePathFromKey,
    resolveTempFilePath: mockResolveTempFilePath,
    tempDir: '/tmp/test_uploads',
  },
}));

jest.unstable_mockModule('../../utils/billingCycle.util.js', () => ({
  resolveBillingUserId: jest.fn(async (userId) => userId),
}));

const {
  listStorageObjects,
  deleteStorageObject,
} = await import('../mediaLibrary.controller.js');

/** Kết quả của resolveStorageObjectsUsage: Map khoá String(id). */
const usageOf = (id, usage) => new Map([[String(id), usage]]);

const reqOf = (id) => ({ user: { id: 42, role: 'user' }, params: { id: String(id) }, headers: {} });
const resOf = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });

describe('mediaLibrary.controller storage_objects', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDeleteChatCatalogRows.mockResolvedValue([]);
    mockIsAssistantUploadOfOthers.mockResolvedValue(false);
    mockResolveStorageObjectsUsage.mockImplementation(async (objects) => new Map(objects.map((o) => [String(o.id), { inUse: false }])));
  });

  it('lists workspace storage objects for owner', async () => {
    mockListWorkspaceStorageObjects.mockResolvedValueOnce({
      items: [{ id: 1, displayName: 'test.png', sizeBytes: 1000 }],
      categorySummary: [{ category: 'zalo_template', count: 1, totalBytes: 1000 }],
      pagination: { total: 1, page: 1, limit: 24, pages: 1 },
    });

    const req = {
      user: { id: 42, role: 'user' },
      query: { category: 'zalo_template' },
      headers: {},
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await listStorageObjects(req, res);

    // Chủ tài khoản: không bị ẩn tệp trợ lý AI nào.
    expect(mockListWorkspaceStorageObjects).toHaveBeenCalledWith(
      42,
      { category: 'zalo_template' },
      { restrictAssistantFiles: false, actorUserId: 42 }
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: [{ id: 1, displayName: 'test.png', sizeBytes: 1000, inUse: false, usedBy: null }],
      categorySummary: [{ category: 'zalo_template', count: 1, totalBytes: 1000 }],
    }));
  });

  it('M-05: mỗi tệp trong danh sách kèm "đang dùng ở đâu" lấy từ CÙNG hàm quyết định với nút Xoá', async () => {
    mockListWorkspaceStorageObjects.mockResolvedValueOnce({
      items: [
        { id: '10', category: 'zalo_template', storageKey: 'uploads/42/z/a.png', expiresAt: null, referenceType: 'zalo_template', referenceId: '15' },
        { id: '11', category: 'chat', storageKey: 'uploads/42/chat/b.png', expiresAt: null, referenceType: 'chat_attachment', referenceId: null },
      ],
      categorySummary: [],
      pagination: { total: 2, page: 1, limit: 24, pages: 1 },
    });
    mockResolveStorageObjectsUsage.mockResolvedValueOnce(new Map([
      ['10', { inUse: true, referenceType: 'zalo_template', referenceId: '15', label: 'Mẫu tin nhắn', name: 'Khuyến mãi T8', url: '/app/settings/templates' }],
      ['11', { inUse: false }],
    ]));
    const res = resOf();

    await listStorageObjects({ user: { id: 42, role: 'user' }, query: {}, headers: {} }, res);

    expect(mockResolveStorageObjectsUsage).toHaveBeenCalledWith([
      { id: '10', category: 'zalo_template', storageKey: 'uploads/42/z/a.png', expiresAt: null, referenceType: 'zalo_template', referenceId: '15' },
      { id: '11', category: 'chat', storageKey: 'uploads/42/chat/b.png', expiresAt: null, referenceType: 'chat_attachment', referenceId: null },
    ], 42);
    const { data } = res.json.mock.calls[0][0];
    expect(data[0]).toMatchObject({
      id: '10',
      inUse: true,
      usedBy: { referenceType: 'zalo_template', referenceId: '15', label: 'Mẫu tin nhắn', name: 'Khuyến mãi T8', url: '/app/settings/templates' },
    });
    expect(data[1]).toMatchObject({ id: '11', inUse: false, usedBy: null });
  });

  it('lỗi 500 khi liệt kê: có code, KHÔNG lộ err.message', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockListWorkspaceStorageObjects.mockRejectedValueOnce(new Error('relation "storage_objects" does not exist'));
    const res = resOf();

    await listStorageObjects({ user: { id: 42, role: 'user' }, query: {}, headers: {} }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body).toMatchObject({ success: false, code: 'MEDIA_LIST_FAILED' });
    expect(JSON.stringify(body)).not.toContain('storage_objects');
    console.error.mockRestore();
  });

  it('lists the owner workspace when the actor is an employee', async () => {
    mockListWorkspaceStorageObjects.mockResolvedValueOnce({
      items: [],
      categorySummary: [],
      pagination: { total: 0, page: 1, limit: 24, pages: 0 },
    });

    const req = {
      user: {
        id: 99,
        role: 'user',
        activeContext: { type: 'employee', ownerId: 42, membershipId: 7 },
      },
      query: {},
      headers: {},
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await listStorageObjects(req, res);

    // Q3: nhân viên không thấy tệp Trợ lý AI của người khác; actorUserId là NHÂN VIÊN (99), không phải chủ (42).
    expect(mockListWorkspaceStorageObjects).toHaveBeenCalledWith(
      42,
      {},
      { restrictAssistantFiles: true, actorUserId: 99 }
    );
  });

  it('Q3: nhân viên gọi thẳng id tệp Trợ lý AI của người khác → 404 như không tồn tại, không xoá gì', async () => {
    mockFindStorageObjectById.mockResolvedValueOnce({
      id: '40',
      owner_user_id: '42',
      pool_type: 'workspace',
      state: 'active',
      category: 'chat',
      actor_user_id: '42',
      reference_type: 'chat_attachment',
      reference_id: null,
      storage_key: 'uploads/42/chat/1754800000000_BaoCao.docx',
    });
    mockIsAssistantUploadOfOthers.mockResolvedValueOnce(true);
    const req = {
      user: { id: 99, role: 'user', activeContext: { type: 'employee', ownerId: 42, membershipId: 7 } },
      params: { id: '40' },
      headers: {},
    };
    const res = resOf();

    await deleteStorageObject(req, res);

    expect(mockIsAssistantUploadOfOthers).toHaveBeenCalledWith(expect.objectContaining({ id: '40' }), 99);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'MEDIA_NOT_FOUND' }));
    expect(mockMarkDeletedAfterUnlink).not.toHaveBeenCalled();
    expect(mockLogWorkspace).not.toHaveBeenCalled();
  });

  it('chủ tài khoản không bị kiểm "tệp trợ lý của người khác" khi xoá', async () => {
    mockFindStorageObjectById.mockResolvedValueOnce({
      id: '41', owner_user_id: '42', pool_type: 'workspace', state: 'active', category: 'chat',
      actor_user_id: '99', reference_type: 'chat_attachment', reference_id: null, storage_key: 'uploads/42/chat/x.png',
    });

    await deleteStorageObject(reqOf(41), resOf());

    expect(mockIsAssistantUploadOfOthers).not.toHaveBeenCalled();
    expect(mockMarkDeletedAfterUnlink).toHaveBeenCalled();
  });

  it('returns 404 when object not found or belongs to another user', async () => {
    mockFindStorageObjectById.mockResolvedValueOnce(null);

    const req = {
      user: { id: 42, role: 'user' },
      params: { id: '999' },
      headers: {},
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await deleteStorageObject(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, code: 'MEDIA_NOT_FOUND' }));
  });

  it('id không hợp lệ → 400 kèm code', async () => {
    const res = resOf();
    await deleteStorageObject(reqOf('abc'), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, code: 'MEDIA_ID_INVALID' }));
  });

  it('blocks deletion with 409 when parent reference is still alive', async () => {
    mockFindStorageObjectById.mockResolvedValueOnce({
      id: 50,
      owner_user_id: '42',
      pool_type: 'workspace',
      state: 'active',
      category: 'zalo_template',
      reference_type: 'zalo_template',
      reference_id: '15',
      storage_key: 'uploads/42/zalo/promo.png',
    });
    mockResolveStorageObjectsUsage.mockResolvedValueOnce(usageOf(50, {
      inUse: true,
      referenceType: 'zalo_template',
      referenceId: '15',
      label: 'Mẫu tin nhắn',
      name: 'Khuyến mãi T8',
      url: '/app/settings/templates',
    }));

    const req = {
      user: { id: 42, role: 'user' },
      params: { id: '50' },
      headers: {},
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await deleteStorageObject(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      code: 'STORAGE_REFERENCE_ALIVE',
      message: expect.stringContaining('Khuyến mãi T8'),
      data: {
        referenceType: 'zalo_template',
        referenceId: '15',
        referenceLabel: 'Mẫu tin nhắn',
        referenceName: 'Khuyến mãi T8',
        url: '/app/settings/templates',
      },
    }));
    expect(mockMarkDeletedAfterUnlink).not.toHaveBeenCalled();
    expect(mockDeleteChatCatalogRows).not.toHaveBeenCalled();
  });

  it('allows deletion when the file is not in use (parent gone, or content no longer references it)', async () => {
    mockFindStorageObjectById.mockResolvedValueOnce({
      id: 50,
      owner_user_id: '42',
      pool_type: 'workspace',
      state: 'active',
      category: 'zalo_template',
      reference_type: 'zalo_template',
      reference_id: '15',
      size_bytes: '2048',
      storage_key: 'uploads/42/zalo/1754800000000_promo.png',
    });
    mockResolveAbsolutePathFromKey.mockReturnValueOnce('/tmp/uploads/42/zalo/promo.png');

    const req = {
      user: { id: 42, role: 'user' },
      params: { id: '50' },
      headers: {},
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await deleteStorageObject(req, res);

    expect(mockMarkDeletedAfterUnlink).toHaveBeenCalledWith(expect.objectContaining({
      storageKey: 'uploads/42/zalo/1754800000000_promo.png',
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      message: 'Đã xóa tệp thành công',
      data: { sizeBytes: 2048 },
    }));
    // M-07: nhật ký ghi TÊN (bỏ tiền tố số giờ của khoá) và CỠ tệp, không chỉ nhóm + loại tham chiếu.
    expect(mockLogWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 42, ownerId: 42 }),
      'media.deleted',
      'media_object',
      50,
      {
        category: 'zalo_template',
        referenceType: 'zalo_template',
        displayName: 'promo.png',
        sizeBytes: 2048,
      }
    );
  });

  it('allows deletion of expired temp files', async () => {
    mockFindStorageObjectById.mockResolvedValueOnce({
      id: 51,
      owner_user_id: '42',
      pool_type: 'workspace',
      state: 'temp',
      category: 'temp',
      expires_at: new Date(Date.now() - 10000).toISOString(),
      temp_key: 'temp_abc.png',
    });

    const req = {
      user: { id: 42, role: 'user' },
      params: { id: '51' },
      headers: {},
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await deleteStorageObject(req, res);

    expect(mockMarkDeletedAfterUnlink).toHaveBeenCalledWith(expect.objectContaining({
      tempKey: 'temp_abc.png',
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
    }));
  });

  it('hands the usage resolver the snake_case row mapped to camelCase, scoped to the workspace owner', async () => {
    const expiresAt = new Date('2026-10-01T00:00:00Z');
    mockFindStorageObjectById.mockResolvedValueOnce({
      id: '549',
      owner_user_id: '42',
      pool_type: 'workspace',
      state: 'active',
      category: 'landing_asset',
      reference_type: 'landing_page',
      reference_id: '72',
      storage_key: 'uploads/42/landing/1779359034935_abcd1234_hero.png',
      expires_at: expiresAt,
    });

    await deleteStorageObject(reqOf(549), resOf());

    expect(mockResolveStorageObjectsUsage).toHaveBeenCalledWith([{
      id: '549',
      category: 'landing_asset',
      storageKey: 'uploads/42/landing/1779359034935_abcd1234_hero.png',
      expiresAt,
      referenceType: 'landing_page',
      referenceId: '72',
    }], 42);
  });

  it('deletes a chat file together with its chat_attachments catalog row (M-04a: no more dead-end 409)', async () => {
    mockFindStorageObjectById.mockResolvedValueOnce({
      id: '31',
      owner_user_id: '42',
      pool_type: 'workspace',
      state: 'active',
      category: 'chat',
      reference_type: 'chat_attachment',
      reference_id: '12',
      storage_key: 'uploads/42/chat/1754800000000_BaoCao.docx',
    });
    const res = resOf();

    await deleteStorageObject(reqOf(31), res);

    expect(mockMarkDeletedAfterUnlink).toHaveBeenCalledWith({
      storageKey: 'uploads/42/chat/1754800000000_BaoCao.docx',
      keys: ['uploads/42/chat/1754800000000_BaoCao.docx', 'uploads/42/chat/1754800000000_BaoCao.docx.txt'],
    });
    expect(mockDeleteChatCatalogRows).toHaveBeenCalledWith({
      storageObjectId: '31',
      storageKey: 'uploads/42/chat/1754800000000_BaoCao.docx',
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('M-07: tệp chat — nhật ký ghi tên hiển thị người dùng đặt (từ dòng danh mục), không phải khoá có tiền tố số', async () => {
    mockFindStorageObjectById.mockResolvedValueOnce({
      id: '32', owner_user_id: '42', pool_type: 'workspace', state: 'active', category: 'chat',
      reference_type: 'chat_attachment', reference_id: null, size_bytes: '32600000',
      storage_key: 'uploads/42/chat/1754800000000_BaoCao.docx',
    });
    mockDeleteChatCatalogRows.mockResolvedValueOnce(['Báo cáo thực tập.docx']);

    await deleteStorageObject(reqOf(32), resOf());

    expect(mockLogWorkspace).toHaveBeenCalledWith(
      expect.anything(), 'media.deleted', 'media_object', '32',
      expect.objectContaining({ displayName: 'Báo cáo thực tập.docx', sizeBytes: 32600000 })
    );
  });

  it('lỗi 500 khi xoá: có code, KHÔNG lộ err.message', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFindStorageObjectById.mockRejectedValueOnce(new Error('password authentication failed for user "postgres"'));
    const res = resOf();

    await deleteStorageObject(reqOf(1), res);

    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body).toMatchObject({ success: false, code: 'MEDIA_DELETE_FAILED' });
    expect(JSON.stringify(body)).not.toContain('password');
    console.error.mockRestore();
  });

  it('does not touch chat_attachments when a non-chat file is deleted', async () => {
    mockFindStorageObjectById.mockResolvedValueOnce({
      id: '60',
      owner_user_id: '42',
      pool_type: 'workspace',
      state: 'active',
      category: 'email_template',
      reference_type: 'email_template',
      reference_id: '3',
      storage_key: 'uploads/42/email/a.png',
    });

    await deleteStorageObject(reqOf(60), resOf());

    expect(mockMarkDeletedAfterUnlink).toHaveBeenCalled();
    expect(mockDeleteChatCatalogRows).not.toHaveBeenCalled();
  });

  it('still reports success when removing the catalog row fails after the file is gone (file is the source of truth)', async () => {
    mockFindStorageObjectById.mockResolvedValueOnce({
      id: '31',
      owner_user_id: '42',
      pool_type: 'workspace',
      state: 'active',
      category: 'chat',
      reference_type: 'chat_attachment',
      reference_id: null,
      storage_key: 'uploads/42/chat/x.png',
    });
    mockDeleteChatCatalogRows.mockRejectedValueOnce(new Error('connection reset'));
    const res = resOf();

    await deleteStorageObject(reqOf(31), res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
