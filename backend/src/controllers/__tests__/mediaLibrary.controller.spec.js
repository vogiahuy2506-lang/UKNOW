import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockListWorkspaceStorageObjects = jest.fn();
const mockFindStorageObjectById = jest.fn();
const mockMarkDeletedAfterUnlink = jest.fn();
const mockMarkStorageObjectDeleted = jest.fn();
const mockIsReferenceAlive = jest.fn();
const mockResolveAbsolutePathFromKey = jest.fn();

jest.unstable_mockModule('../../repositories/mediaLibrary.repository.js', () => ({
  listOwnedAttachments: jest.fn(),
  listChannelAttachments: jest.fn(),
  listWorkspaceStorageObjects: mockListWorkspaceStorageObjects,
}));

jest.unstable_mockModule('../../repositories/storage.repository.js', () => ({
  findStorageObjectById: mockFindStorageObjectById,
  markStorageObjectDeleted: mockMarkStorageObjectDeleted,
}));

jest.unstable_mockModule('../../services/storage/storageObject.service.js', () => ({
  markDeletedAfterUnlink: mockMarkDeletedAfterUnlink,
}));

jest.unstable_mockModule('../../services/storage/storageReference.service.js', () => ({
  isReferenceAlive: mockIsReferenceAlive,
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

describe('mediaLibrary.controller storage_objects', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    mockIsReferenceAlive.mockResolvedValueOnce({
      alive: true,
      label: 'Mẫu Zalo',
      name: 'Khuyến mãi T8',
      url: '/templates',
    });

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
    }));
    expect(mockMarkDeletedAfterUnlink).not.toHaveBeenCalled();
  });

  it('allows deletion when reference parent is dead or missing', async () => {
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
    mockIsReferenceAlive.mockResolvedValueOnce({ alive: false });
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
  });

  it('allows deletion of expired temp files without reference check', async () => {
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

    expect(mockIsReferenceAlive).not.toHaveBeenCalled();
    expect(mockMarkDeletedAfterUnlink).toHaveBeenCalledWith(expect.objectContaining({
      tempKey: 'temp_abc.png',
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
    }));
  });
});
