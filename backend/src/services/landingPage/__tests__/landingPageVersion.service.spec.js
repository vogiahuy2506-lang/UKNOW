import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { StorageQuotaExceededError } from '../../storage/storageQuota.service.js';

const mockLandingPageVersionRepository = {
  createVersion: jest.fn(),
  listByLandingPage: jest.fn(),
  findById: jest.fn(),
  findLatestByLandingPage: jest.fn(),
  getOldVersionsBeyondLimit: jest.fn(),
  deleteById: jest.fn(),
  deleteByIdInWorkspace: jest.fn(),
  getTotalSizeBytes: jest.fn(),
};

const mockStorageBackend = {
  put: jest.fn(),
  getBuffer: jest.fn(),
  delete: jest.fn(),
};

const mockRegisterWrittenStorageObject = jest.fn();
const mockMarkDeletedAfterUnlink = jest.fn();

jest.unstable_mockModule('../../../repositories/landingPage/landingPageVersion.repository.js', () => ({
  default: mockLandingPageVersionRepository,
}));

jest.unstable_mockModule('../../storage/storageBackend.js', () => ({
  getStorageBackend: () => mockStorageBackend,
}));

jest.unstable_mockModule('../../storage/storageObject.service.js', () => ({
  registerWrittenStorageObject: mockRegisterWrittenStorageObject,
  markDeletedAfterUnlink: mockMarkDeletedAfterUnlink,
}));

const { default: landingPageVersionService } = await import('../landingPageVersion.service.js');

describe('landingPageVersion.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSnapshotIfChanged', () => {
    it('bỏ qua nếu oldHtml rỗng', async () => {
      const res = await landingPageVersionService.createSnapshotIfChanged({
        landingPageId: 1,
        workspaceOwnerId: 100,
        oldHtml: '',
      });
      expect(res.snapshotSaved).toBe(false);
      expect(mockStorageBackend.put).not.toHaveBeenCalled();
    });

    it('bỏ qua nếu nội dung HTML không đổi so với bản gần nhất', async () => {
      mockLandingPageVersionRepository.findLatestByLandingPage.mockResolvedValue({
        id: 10,
        html_hash: '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae', // hash của 'foo'
      });

      const res = await landingPageVersionService.createSnapshotIfChanged({
        landingPageId: 1,
        workspaceOwnerId: 100,
        oldHtml: 'foo',
      });

      expect(res.snapshotSaved).toBe(false);
      expect(mockStorageBackend.put).not.toHaveBeenCalled();
    });

    it('upload GCS, đăng ký storage object và prune bản cũ khi HTML mới', async () => {
      mockLandingPageVersionRepository.findLatestByLandingPage.mockResolvedValue(null);
      mockLandingPageVersionRepository.createVersion.mockResolvedValue({
        id: 11,
        id_landing_page: 1,
        size_bytes: 100,
      });
      mockLandingPageVersionRepository.getOldVersionsBeyondLimit.mockResolvedValue([]);

      const res = await landingPageVersionService.createSnapshotIfChanged({
        landingPageId: 1,
        workspaceOwnerId: 100,
        oldHtml: '<h1>New Content</h1>',
        title: 'Trang bán hàng',
        source: 'ai_edit',
      });

      expect(res.snapshotSaved).toBe(true);
      expect(res.version.id).toBe(11);
      expect(mockStorageBackend.put).toHaveBeenCalledTimes(1);
      expect(mockRegisterWrittenStorageObject).toHaveBeenCalledTimes(1);
      expect(mockRegisterWrittenStorageObject).toHaveBeenCalledWith({
        category: 'landing_version',
        referenceType: 'landing_page_version',
        referenceId: 11,
        ownerUserId: 100,
        actorUserId: 100,
        storageKey: expect.stringMatching(/^uploads\/landing-versions\/100\/1\//),
        poolType: 'workspace',
        state: 'active',
        sizeBytes: expect.any(Number),
      });
    });

    it('không ném lỗi khi vượt quota dung lượng (StorageQuotaExceededError), rollback row, dọn GCS và trả warning', async () => {
      mockLandingPageVersionRepository.findLatestByLandingPage.mockResolvedValue(null);
      mockLandingPageVersionRepository.createVersion.mockResolvedValue({ id: 12 });
      mockLandingPageVersionRepository.deleteByIdInWorkspace.mockResolvedValue({ id: 12 });
      mockStorageBackend.put.mockResolvedValue(undefined);
      mockStorageBackend.delete.mockResolvedValue(undefined);

      // Giả lập lỗi vượt quota từ registerWrittenStorageObject
      mockRegisterWrittenStorageObject.mockRejectedValue(
        new StorageQuotaExceededError({
          ownerUserId: 100,
          currentBytes: 1000,
          incomingBytes: 500,
          quotaBytes: 1000,
        })
      );

      const res = await landingPageVersionService.createSnapshotIfChanged({
        landingPageId: 1,
        workspaceOwnerId: 100,
        oldHtml: '<h1>Large Page</h1>',
      });

      expect(res.snapshotSaved).toBe(false);
      expect(res.warning).toContain('hết dung lượng');
      expect(mockLandingPageVersionRepository.deleteByIdInWorkspace).toHaveBeenCalledWith(12, 100);
      expect(mockStorageBackend.delete).toHaveBeenCalledTimes(1);
    });
  });

  describe('pruneOldVersions', () => {
    it('xóa các bản cũ quá 5 bản khỏi storage_objects (markDeletedAfterUnlink) và xóa DB row', async () => {
      mockLandingPageVersionRepository.getOldVersionsBeyondLimit.mockResolvedValue([
        { id: 1, storage_key: 'uploads/landing-versions/100/1/old1.html' },
        { id: 2, storage_key: 'uploads/landing-versions/100/1/old2.html' },
      ]);
      mockMarkDeletedAfterUnlink.mockResolvedValue(undefined);
      mockLandingPageVersionRepository.deleteByIdInWorkspace.mockResolvedValue(undefined);

      await landingPageVersionService.pruneOldVersions(1, 100, 5);

      expect(mockMarkDeletedAfterUnlink).toHaveBeenCalledWith({
        storageKey: 'uploads/landing-versions/100/1/old1.html',
      });
      expect(mockMarkDeletedAfterUnlink).toHaveBeenCalledWith({
        storageKey: 'uploads/landing-versions/100/1/old2.html',
      });
      expect(mockLandingPageVersionRepository.deleteByIdInWorkspace).toHaveBeenCalledWith(1, 100);
      expect(mockLandingPageVersionRepository.deleteByIdInWorkspace).toHaveBeenCalledWith(2, 100);
    });

    it('không xóa DB row nếu markDeletedAfterUnlink ném lỗi để lần prune sau còn đầu mối', async () => {
      mockLandingPageVersionRepository.getOldVersionsBeyondLimit.mockResolvedValue([
        { id: 3, storage_key: 'uploads/landing-versions/100/1/failed.html' },
      ]);
      mockMarkDeletedAfterUnlink.mockRejectedValue(new Error('GCS connection failed'));

      await landingPageVersionService.pruneOldVersions(1, 100, 5);

      expect(mockLandingPageVersionRepository.deleteByIdInWorkspace).not.toHaveBeenCalled();
    });
  });

  describe('listVersions', () => {
    it('trả danh sách version và tổng dung lượng', async () => {
      mockLandingPageVersionRepository.listByLandingPage.mockResolvedValue([
        {
          id: 1,
          id_landing_page: 5,
          title: 'Bản 1',
          size_bytes: 1024,
          source: 'manual',
          created_at: '2026-08-19T00:00:00.000Z',
        },
      ]);
      mockLandingPageVersionRepository.getTotalSizeBytes.mockResolvedValue(1024);

      const res = await landingPageVersionService.listVersions(5, 100);
      expect(res.versions).toHaveLength(1);
      expect(res.totalSizeBytes).toBe(1024);
      expect(res.maxVersions).toBe(5);
    });
  });

  describe('getVersionHtml', () => {
    it('đọc buffer từ GCS và trả về chuỗi UTF-8', async () => {
      mockLandingPageVersionRepository.findById.mockResolvedValue({
        id: 1,
        title: 'Bản 1',
        storage_key: 'uploads/landing-versions/100/5/1.html',
        size_bytes: 15,
        source: 'manual',
        created_at: '2026-08-19T00:00:00.000Z',
      });
      mockStorageBackend.getBuffer.mockResolvedValue(Buffer.from('<h1>Hello</h1>', 'utf8'));

      const res = await landingPageVersionService.getVersionHtml(1, 5, 100);
      expect(res.htmlContent).toBe('<h1>Hello</h1>');
      expect(res.version.id).toBe(1);
    });

    it('ném lỗi 404 nếu không tìm thấy bản ghi', async () => {
      mockLandingPageVersionRepository.findById.mockResolvedValue(null);

      await expect(landingPageVersionService.getVersionHtml(999, 5, 100)).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe('deleteVersion', () => {
    it('xóa file trên storage_objects (markDeletedAfterUnlink) và xóa DB row', async () => {
      mockLandingPageVersionRepository.findById.mockResolvedValue({
        id: 1,
        storage_key: 'uploads/landing-versions/100/5/1.html',
      });
      mockMarkDeletedAfterUnlink.mockResolvedValue(undefined);
      mockLandingPageVersionRepository.deleteByIdInWorkspace.mockResolvedValue({ id: 1 });

      const res = await landingPageVersionService.deleteVersion(1, 5, 100);
      expect(res.success).toBe(true);
      expect(res.deletedId).toBe(1);
      expect(mockMarkDeletedAfterUnlink).toHaveBeenCalledWith({
        storageKey: 'uploads/landing-versions/100/5/1.html',
      });
      expect(mockLandingPageVersionRepository.deleteByIdInWorkspace).toHaveBeenCalledWith(1, 100);
    });
  });
});
