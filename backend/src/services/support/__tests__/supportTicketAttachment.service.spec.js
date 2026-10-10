import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockPut = jest.fn();
const mockDelete = jest.fn();
const mockRegister = jest.fn();
const mockActivate = jest.fn();

const actualBackend = await import('../../storage/storageBackend.js');
const actualObjectService = await import('../../storage/storageObject.service.js');
jest.unstable_mockModule('../../storage/storageBackend.js', () => ({
  ...actualBackend,
  getStorageBackend: () => ({ put: mockPut, delete: mockDelete }),
}));
jest.unstable_mockModule('../../storage/storageObject.service.js', () => ({
  ...actualObjectService,
  registerWrittenStorageObject: mockRegister,
}));
const actualStorageRepo = await import('../../../repositories/storage.repository.js');
jest.unstable_mockModule('../../../repositories/storage.repository.js', () => ({
  ...actualStorageRepo,
  activateSupportTicketStorageObjects: mockActivate,
}));

const att = await import('../supportTicketAttachment.service.js');

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 2)]);
const GIF = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(32, 3)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.4'), Buffer.alloc(32, 4)]);

const self = { id: 5, activeContext: { type: 'self', ownerId: 5 } };
const employee = { id: 12, activeContext: { type: 'employee', ownerId: 9 } };

beforeEach(() => {
  jest.resetAllMocks();
  mockPut.mockResolvedValue(undefined);
  mockDelete.mockResolvedValue(undefined);
  mockRegister.mockResolvedValue({ id: '41' });
});

describe('uploadSupportAttachment', () => {
  it('ảnh PNG hợp lệ: ghi kho + sổ cái state temp, category support_ticket, hết hạn ~24h, key dưới uploads/<chủ>/support/', async () => {
    const before = Date.now();
    const res = await att.uploadSupportAttachment({ file: { buffer: PNG, originalname: 'Màn hình lỗi.png', mimetype: 'image/png' }, user: self });

    expect(mockPut).toHaveBeenCalledWith(expect.stringMatching(/^uploads\/5\/support\/\d+_[0-9a-f]{8}_Man_hinh_loi\.png$/), PNG, { contentType: 'image/png' });
    const reg = mockRegister.mock.calls[0][0];
    expect(reg).toMatchObject({ ownerUserId: 5, actorUserId: 5, category: 'support_ticket', state: 'temp', sizeBytes: PNG.length });
    expect(reg.expiresAt.getTime() - before).toBeGreaterThan(23.9 * 3600 * 1000);
    expect(reg.expiresAt.getTime() - before).toBeLessThan(24.1 * 3600 * 1000);
    expect(res).toMatchObject({ storageObjectId: 41, name: 'Man_hinh_loi.png', size: PNG.length, mime: 'image/png' });
  });

  it('nhân viên: dung lượng tính cho CHỦ workspace (ownerUserId), người thao tác ở actorUserId', async () => {
    await att.uploadSupportAttachment({ file: { buffer: JPEG, originalname: 'a.jpeg', mimetype: 'image/jpeg' }, user: employee });
    expect(mockRegister.mock.calls[0][0]).toMatchObject({ ownerUserId: 9, actorUserId: 12 });
    expect(mockPut.mock.calls[0][0]).toMatch(/^uploads\/9\/support\//);
  });

  it('GIF được nhận (profile landing) và trả mime image/gif', async () => {
    const res = await att.uploadSupportAttachment({ file: { buffer: GIF, originalname: 'a.gif', mimetype: 'image/gif' }, user: self });
    expect(res.mime).toBe('image/gif');
  });

  it.each([
    ['PDF (đuôi không cho)', { buffer: PDF, originalname: 'a.pdf', mimetype: 'application/pdf' }],
    ['SVG', { buffer: Buffer.from('<svg/>'), originalname: 'a.svg', mimetype: 'image/svg+xml' }],
    ['HEIC', { buffer: Buffer.alloc(40, 1), originalname: 'a.heic', mimetype: 'image/heic' }],
    ['đuôi .png nhưng nội dung là PDF (magic bytes)', { buffer: PDF, originalname: 'a.png', mimetype: 'image/png' }],
    ['không có đuôi', { buffer: PNG, originalname: 'anh', mimetype: 'image/png' }],
  ])('%s → 400 SUPPORT_ATTACHMENT_TYPE_INVALID, không ghi kho', async (_label, file) => {
    await expect(att.uploadSupportAttachment({ file, user: self })).rejects.toMatchObject({ status: 400, code: 'SUPPORT_ATTACHMENT_TYPE_INVALID' });
    expect(mockPut).not.toHaveBeenCalled();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('quá 5 MB → 400 SUPPORT_ATTACHMENT_TOO_LARGE; không có tệp → 400 SUPPORT_ATTACHMENT_REQUIRED', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
    await expect(att.uploadSupportAttachment({ file: { buffer: big, originalname: 'a.png', mimetype: 'image/png' }, user: self }))
      .rejects.toMatchObject({ status: 400, code: 'SUPPORT_ATTACHMENT_TOO_LARGE' });
    await expect(att.uploadSupportAttachment({ file: undefined, user: self })).rejects.toMatchObject({ code: 'SUPPORT_ATTACHMENT_REQUIRED' });
  });

  it('đăng ký sổ cái lỗi (vd hết dung lượng) → xoá tệp vừa ghi rồi ném lại', async () => {
    const quota = Object.assign(new Error('Đã dùng hết dung lượng lưu trữ'), { status: 409, code: 'STORAGE_QUOTA_EXCEEDED' });
    mockRegister.mockRejectedValue(quota);
    await expect(att.uploadSupportAttachment({ file: { buffer: PNG, originalname: 'a.png', mimetype: 'image/png' }, user: self })).rejects.toBe(quota);
    expect(mockDelete).toHaveBeenCalledWith(mockPut.mock.calls[0][0]);
  });
});

describe('normalizeAttachmentIds', () => {
  it('không gửi → []; 3 id hợp lệ → số', () => {
    expect(att.normalizeAttachmentIds(undefined)).toEqual([]);
    expect(att.normalizeAttachmentIds(['1', 2, 3])).toEqual([1, 2, 3]);
  });

  it('ảnh thứ 4 → 400 SUPPORT_ATTACHMENT_LIMIT', () => {
    expect(() => att.normalizeAttachmentIds([1, 2, 3, 4])).toThrow(expect.objectContaining({ status: 400, code: 'SUPPORT_ATTACHMENT_LIMIT' }));
  });

  it.each([['không phải mảng', 'abc'], ['phần tử rác', [1, 'x']], ['âm/0', [0]], ['trùng', [1, 1]]])('%s → 400 SUPPORT_ATTACHMENT_INVALID', (_l, raw) => {
    expect(() => att.normalizeAttachmentIds(raw)).toThrow(expect.objectContaining({ status: 400, code: 'SUPPORT_ATTACHMENT_INVALID' }));
  });
});

describe('claimAttachments', () => {
  const client = { tag: 'tx' };

  it('không có id → không chạm DB', async () => {
    await expect(att.claimAttachments(client, { objectIds: [], actorUserId: 5, ticketId: 1 })).resolves.toEqual([]);
    expect(mockActivate).not.toHaveBeenCalled();
  });

  it('kích hoạt đúng người thao tác + ticket trong giao dịch; tên/mime suy từ khoá kho, giữ thứ tự client gửi', async () => {
    mockActivate.mockResolvedValue([
      { id: '8', storage_key: 'uploads/5/support/1700_abcd1234_hai.jpg', size_bytes: '20' },
      { id: '7', storage_key: 'uploads/5/support/1700_abcd1234_mot.png', size_bytes: '10' },
    ]);
    const out = await att.claimAttachments(client, { objectIds: [7, 8], actorUserId: 5, ticketId: 77 });
    expect(mockActivate).toHaveBeenCalledWith({ objectIds: [7, 8], actorUserId: 5, ticketId: 77 }, client);
    expect(out).toEqual([
      { storageObjectId: 7, key: 'uploads/5/support/1700_abcd1234_mot.png', name: 'mot.png', size: 10, mime: 'image/png' },
      { storageObjectId: 8, key: 'uploads/5/support/1700_abcd1234_hai.jpg', name: 'hai.jpg', size: 20, mime: 'image/jpeg' },
    ]);
  });

  it('một id không thoả (của người khác / đã gắn / hết hạn → SQL không trả dòng) → 400, cả lô bị từ chối', async () => {
    mockActivate.mockResolvedValue([{ id: '7', storage_key: 'uploads/5/support/1_aa_a.png', size_bytes: '1' }]);
    await expect(att.claimAttachments(client, { objectIds: [7, 8], actorUserId: 5, ticketId: 77 }))
      .rejects.toMatchObject({ status: 400, code: 'SUPPORT_ATTACHMENT_INVALID' });
  });
});
