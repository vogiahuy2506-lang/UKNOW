import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockPut = jest.fn();
const mockDelete = jest.fn();
const mockRegisterWrittenStorageObject = jest.fn();
const mockActivateLandingAssetStorageObjects = jest.fn();
const mockReadTempFileBuffer = jest.fn();
const mockReadFileBufferByKey = jest.fn();
const mockGetPublicBaseUrlFromEnv = jest.fn(() => 'http://localhost:5001');
const mockSanitizeFileBaseName = jest.fn((name) => String(name || 'file').replace(/[^a-zA-Z0-9-_]/g, '_'));
const mockExtractTextFromBuffer = jest.fn(async () => 'Nội dung trích xuất');

jest.unstable_mockModule('../../../utils/fileParser.util.js', () => ({
  extractTextFromBuffer: mockExtractTextFromBuffer,
}));

jest.unstable_mockModule('heic-convert', () => ({
  default: jest.fn(async () => Buffer.from([0xff, 0xd8, 0xff, 0xe0])),
}));

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

jest.unstable_mockModule('../../../repositories/storage.repository.js', () => ({
  activateLandingAssetStorageObjects: mockActivateLandingAssetStorageObjects,
  findStorageObjectByKey: jest.fn(),
  markStorageObjectCleanupPending: jest.fn(),
  getEffectiveQuota: jest.fn().mockResolvedValue({
    quotaLimitBytes: 100 * 1024 * 1024,
    quotaUsedBytes: 0,
    plan: 'pro',
  }),
  getWorkspaceUsage: jest.fn().mockResolvedValue({
    usedBytes: 0,
    fileCount: 0,
  }),
}));

jest.unstable_mockModule('../../../controllers/upload.controller.js', () => ({
  default: {
    readTempFileBuffer: mockReadTempFileBuffer,
    readFileBufferByKey: mockReadFileBufferByKey,
    getPublicBaseUrlFromEnv: mockGetPublicBaseUrlFromEnv,
    sanitizeFileBaseName: mockSanitizeFileBaseName,
  },
}));

const {
  ingestLandingAttachments,
  linkAssetsToLandingPage,
  buildLandingAssetUrl,
} = await import('../landingAsset.service.js');

// 1x1 PNG hợp lệ có magic bytes
const validPngBuffer = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

describe('landingAsset.service (Việc 1.6)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('buildLandingAssetUrl tạo đúng URL', () => {
    const url = buildLandingAssetUrl('uploads/1/landing/test.png');
    expect(url).toBe('http://localhost:5001/lp-assets/uploads/1/landing/test.png');
  });

  it('(i) khoá của owner khác → ném lỗi 403', async () => {
    const maliciousFile = {
      storageKey: 'uploads/999/chat/secret.png',
      originalName: 'secret.png',
      contentType: 'image/png',
    };

    await expect(
      ingestLandingAttachments({
        files: [maliciousFile],
        ownerUserId: 123,
      })
    ).rejects.toMatchObject({
      status: 403,
      message: 'Không có quyền truy cập file lưu trữ này',
    });

    expect(mockReadFileBufferByKey).not.toHaveBeenCalled();
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('(ii) file định dạng không hỗ trợ (exe) → từ chối (400)', async () => {
    const exeBuffer = Buffer.from('MZ\x90\x00\x03\x00\x00\x00');
    mockReadTempFileBuffer.mockResolvedValue(exeBuffer);

    const file = {
      tempId: 'temp_1',
      originalName: 'malware.exe',
      contentType: 'application/x-msdownload',
    };

    await expect(
      ingestLandingAttachments({
        files: [file],
        ownerUserId: 123,
      })
    ).rejects.toMatchObject({
      status: 400,
    });

    expect(mockPut).not.toHaveBeenCalled();
  });

  it('(ii-b) GIF hợp lệ → chấp nhận và lưu', async () => {
    const gifBuffer = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00]);
    mockReadTempFileBuffer.mockResolvedValue(gifBuffer);
    mockPut.mockResolvedValue(true);
    mockRegisterWrittenStorageObject.mockResolvedValue({ id: 11 });

    const file = {
      tempId: 'temp_gif',
      originalName: 'animation.gif',
      contentType: 'image/gif',
    };

    const res = await ingestLandingAttachments({
      files: [file],
      ownerUserId: 123,
    });

    expect(res.assets).toHaveLength(1);
    expect(res.assets[0].originalName).toBe('animation.gif');
    expect(mockPut).toHaveBeenCalledTimes(1);
  });

  it('(iii) ảnh 5 MB → lưu nhưng inlineForModel = false', async () => {
    // Tạo buffer 5 MB có header của PNG hợp lệ
    const fiveMbBuffer = Buffer.alloc(5 * 1024 * 1024);
    validPngBuffer.copy(fiveMbBuffer, 0, 0, validPngBuffer.length);

    mockReadTempFileBuffer.mockResolvedValue(fiveMbBuffer);
    mockPut.mockResolvedValue(true);
    mockRegisterWrittenStorageObject.mockResolvedValue({ id: 10 });

    const file = {
      tempId: 'temp_large_img',
      originalName: 'banner-5mb.png',
      contentType: 'image/png',
    };

    const res = await ingestLandingAttachments({
      files: [file],
      ownerUserId: 123,
    });

    expect(res.assets).toHaveLength(1);
    const asset = res.assets[0];
    expect(asset.inlineForModel).toBe(false);
    expect(asset.base64).toBeNull();
    expect(asset.sizeBytes).toBe(fiveMbBuffer.length);
    expect(mockPut).toHaveBeenCalledTimes(1);
    expect(mockRegisterWrittenStorageObject).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 123,
        category: 'landing_asset',
        state: 'temp',
        sizeBytes: fiveMbBuffer.length,
      })
    );
  });

  it('(iv) linkAssetsToLandingPage chỉ UPDATE khoá đúng owner', async () => {
    mockActivateLandingAssetStorageObjects.mockResolvedValue([{ id: 1 }, { id: 2 }]);

    const ownerUserId = 39;
    const landingPageId = 100;
    const html = `
      <div>
        <img src="https://example.com/lp-assets/uploads/39/landing/logo-ok.png" />
        <img src="https://example.com/lp-assets/uploads/999/landing/other-owner.png" />
        <img src="https://example.com/lp-assets/uploads/39/landing/banner-ok.png" />
      </div>
    `;

    const result = await linkAssetsToLandingPage({
      html,
      ownerUserId,
      landingPageId,
    });

    expect(mockActivateLandingAssetStorageObjects).toHaveBeenCalledTimes(1);
    const callArgs = mockActivateLandingAssetStorageObjects.mock.calls[0][0];
    expect(callArgs.ownerUserId).toBe(39);
    expect(callArgs.landingPageId).toBe(100);
    // Chỉ các khoá uploads/39/landing/... được chọn
    expect(callArgs.storageKeys).toEqual(
      expect.arrayContaining([
        'uploads/39/landing/logo-ok.png',
        'uploads/39/landing/banner-ok.png',
      ])
    );
    expect(callArgs.storageKeys).not.toContain('uploads/999/landing/other-owner.png');
    expect(result).toHaveLength(2);
  });

  it('extractDocWithTimeout gọi extractTextFromBuffer với { max: 30 }', async () => {
    // Buffer PDF có magic bytes %PDF- (0x25, 0x50, 0x44, 0x46)
    const pdfBuffer = Buffer.from('%PDF-1.4 test document content');
    mockReadTempFileBuffer.mockResolvedValue(pdfBuffer);

    const file = {
      tempId: 'temp_pdf',
      originalName: 'tailieu.pdf',
      contentType: 'application/pdf',
    };

    const res = await ingestLandingAttachments({
      files: [file],
      ownerUserId: 123,
    });

    expect(mockExtractTextFromBuffer).toHaveBeenCalledTimes(1);
    const callArgs = mockExtractTextFromBuffer.mock.calls[0];
    expect(callArgs[0]).toEqual(pdfBuffer);
    expect(callArgs[1]).toBe('tailieu.pdf');
    expect(callArgs[2]).toBe('application/pdf');
    expect(callArgs[3]).toEqual({ max: 30 });
    expect(res.documents).toHaveLength(1);
    expect(res.documents[0].originalName).toBe('tailieu.pdf');
    expect(res.documents[0].text).toBe('Nội dung trích xuất');
  });

  it('lỗi đọc file (ENOENT / không còn) → ném 400 "Tệp ... đã hết hạn hoặc không còn, hãy đính kèm lại."', async () => {
    mockReadTempFileBuffer.mockRejectedValue(new Error('ENOENT: no such file or directory'));

    const file = {
      tempId: 'dead_temp_id',
      originalName: 'expired.png',
      contentType: 'image/png',
    };

    await expect(
      ingestLandingAttachments({
        files: [file],
        ownerUserId: 123,
      })
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('Tệp "expired.png" đã hết hạn hoặc không còn, hãy đính kèm lại.'),
    });
  });

  it('chấp nhận file TXT và trích xuất nội dung', async () => {
    const txtBuffer = Buffer.from('Nội dung file văn bản thuần txt');
    mockReadTempFileBuffer.mockResolvedValue(txtBuffer);

    const file = {
      tempId: 'temp_txt',
      originalName: 'notes.txt',
      contentType: 'text/plain',
    };

    const res = await ingestLandingAttachments({
      files: [file],
      ownerUserId: 123,
    });

    expect(mockExtractTextFromBuffer).toHaveBeenCalledWith(
      txtBuffer,
      'notes.txt',
      'text/plain',
      { max: 30 }
    );
    expect(res.documents).toHaveLength(1);
    expect(res.documents[0].originalName).toBe('notes.txt');
  });

  it('chấp nhận file CSV và trích xuất nội dung', async () => {
    const csvBuffer = Buffer.from('name,email\nUser A,a@test.com');
    mockReadTempFileBuffer.mockResolvedValue(csvBuffer);

    const file = {
      tempId: 'temp_csv',
      originalName: 'contacts.csv',
      contentType: 'text/csv',
    };

    const res = await ingestLandingAttachments({
      files: [file],
      ownerUserId: 123,
    });

    expect(mockExtractTextFromBuffer).toHaveBeenCalledWith(
      csvBuffer,
      'contacts.csv',
      'text/csv',
      { max: 30 }
    );
    expect(res.documents).toHaveLength(1);
  });

  it('chấp nhận file XLSX (zip magic) và trích xuất nội dung', async () => {
    const xlsxBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
    mockReadTempFileBuffer.mockResolvedValue(xlsxBuffer);

    const file = {
      tempId: 'temp_xlsx',
      originalName: 'data.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };

    const res = await ingestLandingAttachments({
      files: [file],
      ownerUserId: 123,
    });

    expect(mockExtractTextFromBuffer).toHaveBeenCalledWith(
      xlsxBuffer,
      'data.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      { max: 30 }
    );
    expect(res.documents).toHaveLength(1);
  });

  it('chấp nhận file PPTX (zip magic) và trích xuất nội dung', async () => {
    const pptxBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
    mockReadTempFileBuffer.mockResolvedValue(pptxBuffer);

    const file = {
      tempId: 'temp_pptx',
      originalName: 'slides.pptx',
      contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    };

    const res = await ingestLandingAttachments({
      files: [file],
      ownerUserId: 123,
    });

    expect(mockExtractTextFromBuffer).toHaveBeenCalledWith(
      pptxBuffer,
      'slides.pptx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      { max: 30 }
    );
    expect(res.documents).toHaveLength(1);
  });

  it('chấp nhận ảnh HEIC và lưu vào assets', async () => {
    // 12 byte: 4 byte size + 'ftyp' + 'heic'
    const heicBuffer = Buffer.from([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
    ]);
    mockReadTempFileBuffer.mockResolvedValue(heicBuffer);
    mockPut.mockResolvedValue(true);
    mockRegisterWrittenStorageObject.mockResolvedValue({ id: 12 });

    const file = {
      tempId: 'temp_heic',
      originalName: 'photo.heic',
      contentType: 'image/heic',
    };

    const res = await ingestLandingAttachments({
      files: [file],
      ownerUserId: 123,
    });

    expect(res.assets).toHaveLength(1);
    expect(res.assets[0].originalName).toBe('photo.heic');
    expect(mockPut).toHaveBeenCalledTimes(1);
  });

  describe('PR scan PDF in ingestLandingAttachments', () => {
    it('C6: PDF 2 KB, mock trích -> \'\' -> documents[0].inlinePdf === true, skipped rỗng', async () => {
      const pdfBuf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(2048, 0x20)]);
      mockReadTempFileBuffer.mockResolvedValueOnce(pdfBuf);
      mockExtractTextFromBuffer.mockResolvedValueOnce('');

      const res = await ingestLandingAttachments({
        files: [{ tempId: 't_c6', originalName: 'scan2k.pdf', contentType: 'application/pdf' }],
        ownerUserId: 123,
      });

      expect(res.skipped).toHaveLength(0);
      expect(res.documents).toHaveLength(1);
      expect(res.documents[0].inlinePdf).toBe(true);
      expect(res.documents[0].contentType).toBe('application/pdf');
      expect(res.documents[0].base64).toBe(pdfBuf.toString('base64'));
      expect(res.documents[0].originalName).toBe('scan2k.pdf');
    });

    it('C7: PDF 11 MB, trích rỗng, là tệp duy nhất -> ném 400, message chứa tên tệp và \'vượt giới hạn\'', async () => {
      const pdfBuf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(11 * 1024 * 1024, 0x20)]);
      mockReadTempFileBuffer.mockResolvedValueOnce(pdfBuf);
      mockExtractTextFromBuffer.mockResolvedValueOnce('');

      await expect(
        ingestLandingAttachments({
          files: [{ tempId: 't_c7', originalName: 'big_scan.pdf', contentType: 'application/pdf' }],
          ownerUserId: 123,
        })
      ).rejects.toMatchObject({
        status: 400,
        message: expect.stringMatching(/big_scan\.pdf.*vượt giới hạn/),
      });
    });

    it('C8: .docx trích rỗng -> skipped[0].reason chứa \'Không đọc được chữ\', documents rỗng (không inline)', async () => {
      // 1 ảnh png hợp lệ để không bị 400
      const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      // docx bắt đầu bằng PK\x03\x04
      const docxBuf = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(200, 0x20)]);

      mockReadTempFileBuffer.mockResolvedValueOnce(pngBuf).mockResolvedValueOnce(docxBuf);
      mockExtractTextFromBuffer.mockResolvedValueOnce('');
      mockPut.mockResolvedValue(true);
      mockRegisterWrittenStorageObject.mockResolvedValue({ id: 101 });

      const res = await ingestLandingAttachments({
        files: [
          { tempId: 't_png', originalName: 'logo.png', contentType: 'image/png' },
          { tempId: 't_docx', originalName: 'empty.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
        ],
        ownerUserId: 123,
      });

      expect(res.assets).toHaveLength(1);
      expect(res.documents).toHaveLength(0);
      expect(res.skipped).toHaveLength(1);
      expect(res.skipped[0].originalName).toBe('empty.docx');
      expect(res.skipped[0].reason).toContain('Không đọc được chữ');
    });
  });
});

