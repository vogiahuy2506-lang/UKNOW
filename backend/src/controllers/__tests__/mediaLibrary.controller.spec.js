import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockListWorkspaceStorageObjects = jest.fn();
const mockFindStorageObjectById = jest.fn();
const mockMarkDeletedAfterUnlink = jest.fn();
const mockMarkStorageObjectDeleted = jest.fn();
const mockResolveStorageObjectsUsage = jest.fn();
const mockDeleteChatCatalogRows = jest.fn();
const mockResolveAbsolutePathFromKey = jest.fn();
const mockLogWorkspace = jest.fn();

jest.unstable_mockModule('../../repositories/mediaLibrary.repository.js', () => ({
  listWorkspaceStorageObjects: mockListWorkspaceStorageObjects,
  deleteChatCatalogRows: mockDeleteChatCatalogRows,
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

    expect(mockListWorkspaceStorageObjects).toHaveBeenCalledWith(42, { category: 'zalo_template' });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: [{ id: 1, displayName: 'test.png', sizeBytes: 1000 }],
      categorySummary: [{ category: 'zalo_template', count: 1, totalBytes: 1000 }],
    }));
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

    expect(mockListWorkspaceStorageObjects).toHaveBeenCalledWith(42, {});
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
      storage_key: 'uploads/42/zalo/promo.png',
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
      storageKey: 'uploads/42/zalo/promo.png',
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      message: 'Đã xóa tệp thành công',
    }));
    expect(mockLogWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 42, ownerId: 42 }),
      'media.deleted',
      'media_object',
      50,
      expect.objectContaining({ category: 'zalo_template' })
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
