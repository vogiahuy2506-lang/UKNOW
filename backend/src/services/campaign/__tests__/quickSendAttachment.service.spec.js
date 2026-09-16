import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockPut = jest.fn();
const mockDelete = jest.fn();
const mockRegisterWrittenStorageObject = jest.fn();
const mockReadTempFileBuffer = jest.fn();
const mockSanitizeFileBaseName = jest.fn((name) => String(name || 'file').replace(/[^a-zA-Z0-9-_]/g, '_'));

jest.unstable_mockModule('../../storage/storageBackend.js', () => ({
  getStorageBackend: () => ({
    put: mockPut,
    delete: mockDelete,
  }),
}));

jest.unstable_mockModule('../../storage/storageObject.service.js', () => ({
  registerWrittenStorageObject: mockRegisterWrittenStorageObject,
  getPhysicalSize: jest.fn(),
  markDeletedAfterUnlink: jest.fn(),
}));

jest.unstable_mockModule('../../../controllers/upload.controller.js', () => ({
  default: {
    readTempFileBuffer: mockReadTempFileBuffer,
    sanitizeFileBaseName: mockSanitizeFileBaseName,
  },
}));

const { ingestQuickSendAttachment, MAX_QUICK_SEND_ATTACHMENT_BYTES } = await import('../quickSendAttachment.service.js');

// 1x1 PNG hợp lệ có magic bytes (giống landingAsset.service.spec.js).
const validPngBuffer = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

describe('quickSendAttachment.service — ingestQuickSendAttachment (PLAN_GUI_NHANH_DINH_KEM_TU_TAI_LEN_2026-09-16)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('tệp hợp lệ -> key đúng tiền tố uploads/<owner>/quick-send/ + ghi sổ state temp + expires_at ~7 ngày', async () => {
    mockReadTempFileBuffer.mockResolvedValue(validPngBuffer);
    mockPut.mockResolvedValue(true);
    mockRegisterWrittenStorageObject.mockResolvedValue({ id: 1 });

    const result = await ingestQuickSendAttachment({
      tempId: 'temp_1',
      originalName: 'anh.png',
      contentType: 'image/png',
      size: validPngBuffer.length,
      ownerUserId: 7,
      actorUserId: 7,
    });

    expect(result.key).toMatch(/^uploads\/7\/quick-send\//);
    expect(result.originalName).toBe('anh.png');
    expect(result.size).toBe(validPngBuffer.length);
    expect(mockPut).toHaveBeenCalledWith(result.key, validPngBuffer, { contentType: 'image/png' });
    expect(mockRegisterWrittenStorageObject).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        actorUserId: 7,
        storageKey: result.key,
        category: 'quick_send',
        state: 'temp',
        referenceType: 'quick_send_attachment',
      })
    );
    const call = mockRegisterWrittenStorageObject.mock.calls[0][0];
    const diffDays = (call.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(diffDays).toBeGreaterThan(6.9);
    expect(diffDays).toBeLessThan(7.1);
  });

  it('tệp quá 20 MB -> 400, không put lên storage', async () => {
    const bigBuffer = Buffer.alloc(MAX_QUICK_SEND_ATTACHMENT_BYTES + 1);
    validPngBuffer.copy(bigBuffer, 0, 0, validPngBuffer.length);
    mockReadTempFileBuffer.mockResolvedValue(bigBuffer);

    await expect(
      ingestQuickSendAttachment({
        tempId: 'temp_2',
        originalName: 'anh_to.png',
        contentType: 'image/png',
        ownerUserId: 7,
      })
    ).rejects.toMatchObject({ status: 400 });

    expect(mockPut).not.toHaveBeenCalled();
  });

  it('định dạng lạ (.exe) -> 400', async () => {
    const exeBuffer = Buffer.from('MZ\x90\x00\x03\x00\x00\x00');
    mockReadTempFileBuffer.mockResolvedValue(exeBuffer);

    await expect(
      ingestQuickSendAttachment({
        tempId: 'temp_3',
        originalName: 'malware.exe',
        contentType: 'application/x-msdownload',
        ownerUserId: 7,
      })
    ).rejects.toMatchObject({ status: 400 });

    expect(mockPut).not.toHaveBeenCalled();
  });

  it('temp hết hạn (đọc buffer lỗi) -> 400, câu rõ tên tệp', async () => {
    mockReadTempFileBuffer.mockRejectedValue(new Error('ENOENT'));

    await expect(
      ingestQuickSendAttachment({
        tempId: 'temp_missing',
        originalName: 'bao_cao.pdf',
        contentType: 'application/pdf',
        ownerUserId: 7,
      })
    ).rejects.toMatchObject({
      status: 400,
      message: 'Tệp "bao_cao.pdf" đã hết hạn hoặc không còn, hãy đính kèm lại.',
    });

    expect(mockPut).not.toHaveBeenCalled();
  });

  it('ghi sổ hỏng -> xoá tệp đã put rồi ném lỗi gốc (không nuốt lỗi)', async () => {
    mockReadTempFileBuffer.mockResolvedValue(validPngBuffer);
    mockPut.mockResolvedValue(true);
    mockDelete.mockResolvedValue(true);
    mockRegisterWrittenStorageObject.mockRejectedValue(new Error('DB down'));

    await expect(
      ingestQuickSendAttachment({
        tempId: 'temp_4',
        originalName: 'anh.png',
        contentType: 'image/png',
        ownerUserId: 7,
      })
    ).rejects.toThrow('DB down');

    expect(mockDelete).toHaveBeenCalledTimes(1);
    const [deletedKey] = mockDelete.mock.calls[0];
    expect(deletedKey).toMatch(/^uploads\/7\/quick-send\//);
  });

  it('thiếu ownerUserId -> ném lỗi rõ ràng, không gọi mạng', async () => {
    await expect(
      ingestQuickSendAttachment({ tempId: 'temp_5', originalName: 'a.pdf', ownerUserId: null })
    ).rejects.toThrow('ownerUserId là bắt buộc');
    expect(mockReadTempFileBuffer).not.toHaveBeenCalled();
  });
});
