import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import path from 'path';

/**
 * deleteFromS3 nhận key từ dữ liệu client ghi được (đính kèm mẫu, config node chiến dịch, URL
 * ảnh...). Chỉ được xoá trong `uploads/<ownerUserId>/`; thiếu chủ sở hữu thì không xoá gì.
 */

const mockMarkDeletedAfterUnlink = jest.fn();

jest.unstable_mockModule('../../services/storage/storageObject.service.js', () => ({
  ensureTrackedTempStorageObject: jest.fn(),
  markDeletedAfterUnlink: mockMarkDeletedAfterUnlink,
  promoteTempStorageObjects: jest.fn(),
}));

const { default: uploadController } = await import('../upload.controller.js');

describe('uploadController.deleteFromS3 — chỉ xoá trong không gian của chủ sở hữu', () => {
  let warnSpy;
  let errorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    mockMarkDeletedAfterUnlink.mockResolvedValue(null);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  function deletedStorageKeys() {
    return mockMarkDeletedAfterUnlink.mock.calls.map(([arg]) => arg.storageKey);
  }

  it('xoá key của chính chủ, bỏ qua key thuộc workspace khác (kể cả dạng URL/object)', async () => {
    const result = await uploadController.deleteFromS3(
      [
        'uploads/10/1700_own.pdf',
        'uploads/999/1700_victim.pdf',
        'https://app.example.com/uploads/999/1700_victim.png',
        { key: 'uploads/10/1700_own.png' },
        'uploads/100/1700_prefix_trick.pdf',
      ],
      { ownerUserId: 10 }
    );

    expect(deletedStorageKeys()).toEqual(['uploads/10/1700_own.pdf', 'uploads/10/1700_own.png']);
    expect(mockMarkDeletedAfterUnlink).toHaveBeenCalledWith({
      storageKey: 'uploads/10/1700_own.pdf',
      keys: ['uploads/10/1700_own.pdf', 'uploads/10/1700_own.pdf.txt'],
    });
    expect(result).toMatchObject({ success: true, deletedCount: 2, skippedCount: 3 });
    expect(warnSpy.mock.calls.some((args) => String(args[0]).includes('uploads/999/1700_victim.pdf'))).toBe(true);
  });

  it('key có đường dẫn tuyệt đối sau `uploads/` không lọt qua kiểm tra tiền tố', async () => {
    await uploadController.deleteFromS3(['uploads//srv/app/uploads/999/x.pdf'], { ownerUserId: 10 });
    expect(mockMarkDeletedAfterUnlink).not.toHaveBeenCalled();
  });

  it('ownerUserId dạng chuỗi số (id từ pg) vẫn dùng được', async () => {
    await uploadController.deleteFromS3(['uploads/42/a.pdf', 'uploads/43/b.pdf'], { ownerUserId: '42' });
    expect(deletedStorageKeys()).toEqual(['uploads/42/a.pdf']);
  });

  it.each([
    ['không truyền options', undefined],
    ['ownerUserId null', { ownerUserId: null }],
    ['ownerUserId rỗng', { ownerUserId: '' }],
    ['ownerUserId không phải số', { ownerUserId: '10abc' }],
    ['ownerUserId âm', { ownerUserId: -10 }],
  ])('%s → không xoá gì và log lỗi', async (_label, options) => {
    const result = await uploadController.deleteFromS3(['uploads/10/a.pdf'], options);

    expect(mockMarkDeletedAfterUnlink).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: false, deletedCount: 0, skippedCount: 1 });
    expect(errorSpy).toHaveBeenCalled();
  });

  it('danh sách rỗng → không cần chủ sở hữu, không lỗi', async () => {
    const result = await uploadController.deleteFromS3([]);
    expect(result).toMatchObject({ success: true, deletedCount: 0 });
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('uploadController.resolveAbsolutePathFromKey — so tiền tố kèm dấu phân cách', () => {
  it('không nhận thư mục anh em có cùng tiền tố chuỗi với uploads root', () => {
    const root = uploadController.uploadsRootDir;
    expect(uploadController.resolveAbsolutePathFromKey(`uploads/${root}-old/secret.txt`)).toBe('');
    expect(uploadController.resolveAbsolutePathFromKey('uploads/10/a.pdf')).toBe(path.join(root, '10', 'a.pdf'));
  });
});
