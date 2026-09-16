import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

/**
 * PLAN_TEP_DINH_KEM_LANDING_MOI_DINH_DANG_2026-09-15.md — nghiệm thu ca 8–12 trên TỆP THẬT.
 *
 * Khác `landingAsset.service.spec.js` (mock `heic-convert` + `fileParser`): file này chạy thư viện
 * thật, nên nó canh được đúng hai thứ mock che mất — ảnh HEIC có thực sự ra JPEG không, và bộ đọc
 * `.doc`/`.xls` có đọc ra chữ không. Chỉ kho lưu trữ + sổ dung lượng là mock.
 */
const mockPut = jest.fn();
const mockDelete = jest.fn();
const mockRegisterWrittenStorageObject = jest.fn();
const mockReadTempFileBuffer = jest.fn();

jest.unstable_mockModule('../../storage/storageBackend.js', () => ({
  getStorageBackend: () => ({ put: mockPut, delete: mockDelete }),
}));

jest.unstable_mockModule('../../storage/storageObject.service.js', () => ({
  registerWrittenStorageObject: mockRegisterWrittenStorageObject,
  getPhysicalSize: jest.fn(),
  markDeletedAfterUnlink: jest.fn(),
}));

jest.unstable_mockModule('../../../repositories/storage.repository.js', () => ({
  activateLandingAssetStorageObjects: jest.fn(),
  findStorageObjectByKey: jest.fn(),
  markStorageObjectCleanupPending: jest.fn(),
  // storageQuota.service.js (nạp thật qua landingAsset.service) đọc 2 hàm này lúc import
  getEffectiveQuota: jest.fn().mockResolvedValue({ planLimitBytes: 100 * 1024 * 1024 }),
  getWorkspaceUsage: jest.fn().mockResolvedValue('0'),
}));

jest.unstable_mockModule('../../../controllers/upload.controller.js', () => ({
  default: {
    readTempFileBuffer: mockReadTempFileBuffer,
    readFileBufferByKey: jest.fn(),
    getPublicBaseUrlFromEnv: () => 'http://localhost:5001',
    sanitizeFileBaseName: (name) => String(name || 'file').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9-_]/g, '_'),
  },
}));

const { ingestLandingAttachments } = await import('../landingAsset.service.js');

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const HEIC = fs.readFileSync(path.join(FIXTURES, 'anh-iphone.heic'));
const DOC = fs.readFileSync(path.join(FIXTURES, 'brochure.doc'));
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
const GIF_1x1 = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

function buildXls() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Goi', 'Gia'], ['Pro', 299000]]), 'Bang gia');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xls' });
}

/** Trả buffer theo tempId để dựng được lượt nhiều tệp lẫn tệp hỏng. */
function serveTempFiles(map) {
  mockReadTempFileBuffer.mockImplementation(async (tempId) => {
    const entry = map[tempId];
    if (entry === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    return entry;
  });
}

describe('ingestLandingAttachments — tệp thật (ca 10, 11, 12)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPut.mockResolvedValue(true);
    mockRegisterWrittenStorageObject.mockResolvedValue({ id: 1 });
  });

  it('ca 10: ảnh HEIC → lưu thành .jpg, contentType image/jpeg, bytes ghi xuống kho là JPEG', async () => {
    serveTempFiles({ t_heic: HEIC });

    const res = await ingestLandingAttachments({
      files: [{ tempId: 't_heic', originalName: 'anh-iphone.heic', contentType: 'image/heic' }],
      ownerUserId: 39,
    });

    expect(res.skipped).toHaveLength(0);
    expect(res.assets).toHaveLength(1);
    expect(res.assets[0].contentType).toBe('image/jpeg');
    expect(res.assets[0].storageKey).toMatch(/\.jpg$/);
    expect(res.assets[0].inlineForModel).toBe(true);

    const [key, buffer, opts] = mockPut.mock.calls[0];
    expect(key).toMatch(/^uploads\/39\/landing\/.*\.jpg$/);
    expect(opts).toEqual({ contentType: 'image/jpeg' });
    expect(buffer.subarray(0, 3).toString('hex')).toBe('ffd8ff'); // JPEG SOI
    // base64 gửi cho model cũng phải là JPEG đã chuyển, không phải HEIC gốc
    expect(Buffer.from(res.assets[0].base64, 'base64').subarray(0, 3).toString('hex')).toBe('ffd8ff');
  });

  it('ca 11: .doc thật → đọc được chữ tiếng Việt trong tài liệu', async () => {
    serveTempFiles({ t_doc: DOC });

    const res = await ingestLandingAttachments({
      files: [{ tempId: 't_doc', originalName: 'brochure.doc', contentType: 'application/octet-stream' }],
      ownerUserId: 39,
    });

    expect(res.documents).toHaveLength(1);
    expect(res.documents[0].text).toContain('Bảng giá gói Pro');
    expect(mockPut).not.toHaveBeenCalled(); // tài liệu chỉ lấy chữ, không lưu kho
  });

  it('ca 12: .xls thật → đọc được từng sheet', async () => {
    serveTempFiles({ t_xls: buildXls() });

    const res = await ingestLandingAttachments({
      files: [{ tempId: 't_xls', originalName: 'bang-gia.xls', contentType: '' }],
      ownerUserId: 39,
    });

    expect(res.documents[0].text).toContain('--- Sheet: Bang gia ---');
    expect(res.documents[0].text).toContain('299000');
  });

  it('GIF → lưu nguyên .gif và KHÔNG gửi inline cho model dù rất nhẹ', async () => {
    serveTempFiles({ t_gif: GIF_1x1 });

    const res = await ingestLandingAttachments({
      files: [{ tempId: 't_gif', originalName: 'anh-dong.gif', contentType: 'image/gif' }],
      ownerUserId: 39,
    });

    expect(res.assets[0].contentType).toBe('image/gif');
    expect(res.assets[0].storageKey).toMatch(/\.gif$/);
    expect(res.assets[0].inlineForModel).toBe(false);
    expect(res.assets[0].base64).toBeNull();
  });
});

describe('ingestLandingAttachments — tệp lỗi không làm hỏng cả lượt (ca 8, 9)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPut.mockResolvedValue(true);
    mockRegisterWrittenStorageObject.mockResolvedValue({ id: 1 });
  });

  it('ca 8: 1 ảnh tốt + 1 tệp hết hạn + 1 tệp sai định dạng → vẫn dựng trang, 2 tệp vào skipped', async () => {
    serveTempFiles({ t_png: PNG_1x1, t_bad: Buffer.from('day khong phai excel') });

    const res = await ingestLandingAttachments({
      files: [
        { tempId: 't_png', originalName: 'logo.png', contentType: 'image/png' },
        { tempId: 't_mat', originalName: 'brochure.pdf', contentType: 'application/pdf' },
        { tempId: 't_bad', originalName: 'gia.xls', contentType: 'application/vnd.ms-excel' },
      ],
      ownerUserId: 39,
    });

    expect(res.assets).toHaveLength(1);
    expect(res.documents).toHaveLength(0);
    expect(res.skipped.map((s) => s.originalName)).toEqual(['brochure.pdf', 'gia.xls']);
    expect(res.skipped[0].reason).toContain('đã hết hạn hoặc không còn');
    expect(res.skipped[1].reason).toContain('không khớp định dạng');
  });

  it('tài liệu không có chữ (PDF scan) → vào skipped kèm lý do, ảnh vẫn dùng được', async () => {
    serveTempFiles({ t_png: PNG_1x1, t_pdf: Buffer.from('%PDF-1.4\n', 'latin1') });

    const res = await ingestLandingAttachments({
      files: [
        { tempId: 't_png', originalName: 'logo.png', contentType: 'image/png' },
        { tempId: 't_pdf', originalName: 'scan.pdf', contentType: 'application/pdf' },
      ],
      ownerUserId: 39,
    });

    expect(res.assets).toHaveLength(1);
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0].originalName).toBe('scan.pdf');
  });

  it('ca 9: KHÔNG tệp nào dùng được → ném 400 kèm tên từng tệp và lý do (không trừ credit vì lỗi trước khi sinh)', async () => {
    serveTempFiles({});

    await expect(
      ingestLandingAttachments({
        files: [{ tempId: 't_mat', originalName: 'brochure.pdf', contentType: 'application/pdf' }],
        ownerUserId: 39,
      })
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('brochure.pdf'),
    });
  });

  it('imagesOnly (nút Tải ảnh ở Cài đặt trang): tài liệu bị từ chối với câu "Chỉ nhận ảnh", không phí công đọc chữ', async () => {
    serveTempFiles({ t_doc: DOC });

    await expect(
      ingestLandingAttachments({
        files: [{ tempId: 't_doc', originalName: 'brochure.doc', contentType: 'application/msword' }],
        ownerUserId: 39,
        imagesOnly: true,
      })
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('Chỉ nhận ảnh'),
    });
  });

  it('imagesOnly vẫn nhận ảnh bình thường', async () => {
    serveTempFiles({ t_png: PNG_1x1 });

    const res = await ingestLandingAttachments({
      files: [{ tempId: 't_png', originalName: 'logo.png', contentType: 'image/png' }],
      ownerUserId: 39,
      imagesOnly: true,
    });

    expect(res.assets).toHaveLength(1);
    expect(res.skipped).toHaveLength(0);
  });

  it('lỗi kho lưu trữ là lỗi HỆ THỐNG → ném ra ngoài, không âm thầm bỏ qua tệp', async () => {
    serveTempFiles({ t_png: PNG_1x1 });
    mockPut.mockRejectedValueOnce(new Error('GCS 503'));

    await expect(
      ingestLandingAttachments({
        files: [{ tempId: 't_png', originalName: 'logo.png', contentType: 'image/png' }],
        ownerUserId: 39,
      })
    ).rejects.toThrow('GCS 503');
  });
});
