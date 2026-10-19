import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Marketplace chiến dịch kèm mẫu — nghiệp vụ chụp nội dung mẫu lúc đăng bán, gom nguồn + chặn hàng hỏng lúc mua, chép mẫu/tệp cho
 * người mua và dọn tệp khi rollback. Mock ở RANH GIỚI (repository, kho tệp, sổ dung lượng) đúng hình dạng thật; phần kiểm thật trên
 * Postgres nằm ở tests/integration/marketplaceCampaignTemplates.test.js.
 */
const mockFindEmail = jest.fn();
const mockFindZalo = jest.fn();
const mockCreateEmail = jest.fn();
const mockCreateZalo = jest.fn();
const mockSyncTemplateFile = jest.fn();
const mockInsertStorageObject = jest.fn();
const mockAcquireLock = jest.fn();
const mockGetUsage = jest.fn();
const mockAssertQuota = jest.fn();
const mockGetObjectInfo = jest.fn();
const mockCopy = jest.fn();
const mockDelete = jest.fn();

class MockQuotaError extends Error {
  constructor(usage) {
    super('Đã dùng hết dung lượng lưu trữ');
    this.name = 'StorageQuotaExceededError';
    this.usage = usage;
  }
}

jest.unstable_mockModule('../../../repositories/email/emailTemplate.repository.js', () => ({
  default: { findContentByIdsForOwner: mockFindEmail, create: mockCreateEmail, syncTemplateFile: mockSyncTemplateFile },
}));
jest.unstable_mockModule('../../../repositories/zalo/zaloTemplate.repository.js', () => ({
  default: { findContentByIdsForOwner: mockFindZalo, create: mockCreateZalo },
}));
jest.unstable_mockModule('../../../repositories/storage.repository.js', () => ({
  acquireStorageQuotaLock: mockAcquireLock,
  insertStorageObject: mockInsertStorageObject,
}));
jest.unstable_mockModule('../../storage/storageBackend.js', () => ({
  getStorageBackend: () => ({ getObjectInfo: mockGetObjectInfo, copy: mockCopy, delete: mockDelete }),
}));
jest.unstable_mockModule('../../storage/storageQuota.service.js', () => ({
  StorageQuotaExceededError: MockQuotaError,
  getStorageUsage: mockGetUsage,
  assertQuotaAvailable: mockAssertQuota,
}));
jest.unstable_mockModule('../../../controllers/upload.controller.js', () => ({
  default: { buildDownloadUrlByKey: (key) => `https://files.test/${key}` },
}));

const content = await import('../marketplaceCampaignContent.service.js');

const SELLER = 7;
const BUYER = 9;

const emailRow = (id, extra = {}) => ({
  id: String(id), template_name: `Email ${id}`, template_code: `E${id}`, subject: `Tieu de ${id}`,
  body_html: `<p>${id}</p>`, body_text: `text ${id}`, attachments: [], variables: ['ten'], category: 'sale', ...extra,
});
const zaloRow = (id, extra = {}) => ({
  id: String(id), template_name: `Zalo ${id}`, template_code: null, subject: null,
  body_html: null, body_text: `Noi dung ${id}`, attachments: [], variables: [], category: null, ...extra,
});
const attachment = (key, extra = {}) => ({
  key, url: `https://old/${key}`, originalName: 'Bang gia.pdf', displayName: 'Bảng giá', size: 1000, contentType: 'application/pdf',
  tempId: 'tmp-1', storageObjectId: 99, ...extra,
});

const zaloGroupNode = (templateId, name = 'Gui nhom') => ({
  id: 2, nodeName: name, nodeSubtype: 'send_zalo_group', config: { zaloGroupTemplateSteps: [{ templateId }] },
});
const emailNode = (templateId, name = 'Gui mail') => ({
  id: 3, nodeName: name, nodeSubtype: 'send_email', config: { emailSteps: [{ templateId }] },
});

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {}); // "Bỏ tệp đính kèm không thuộc workspace …" là chủ ý, đỡ ồn log
  mockFindEmail.mockResolvedValue([]);
  mockFindZalo.mockResolvedValue([]);
  mockGetUsage.mockResolvedValue({ remainingBytes: 10 * 1024 * 1024 });
  mockGetObjectInfo.mockResolvedValue({ size: 1000, contentType: null });
  mockCopy.mockResolvedValue(undefined);
  mockDelete.mockResolvedValue(undefined);
  mockInsertStorageObject.mockResolvedValue({ id: 1 });
  mockCreateEmail.mockImplementation(async (data) => ({ id: '5000', ...data }));
  mockCreateZalo.mockImplementation(async (data) => ({ id: '6000', ...data }));
});

describe('buildListingTemplates (đăng bán)', () => {
  it('chụp đủ nội dung các mẫu được tham chiếu, đọc theo chủ = người bán, không chụp mẫu thừa', async () => {
    mockFindEmail.mockResolvedValue([emailRow(11), emailRow(12)]);
    mockFindZalo.mockResolvedValue([zaloRow(31)]);
    const templates = await content.buildListingTemplates({
      sellerId: SELLER,
      nodes: [
        emailNode(11),
        { ...emailNode(12), id: 4 },
        zaloGroupNode(31),
        { id: 5, nodeSubtype: 'send_zalo_group', nodeName: 'khac', config: { zaloGroupTemplateSteps: [{ templateId: 31 }] } }, // cùng mẫu 31: chỉ chụp một lần
      ],
    });
    expect(Object.keys(templates.email).sort()).toEqual(['11', '12']);
    expect(Object.keys(templates.zalo)).toEqual(['31']);
    expect(templates.email['11']).toMatchObject({
      name: 'Email 11', code: 'E11', subject: 'Tieu de 11', bodyHtml: '<p>11</p>', bodyText: 'text 11', variables: ['ten'], category: 'sale', attachments: [],
    });
    expect(mockFindEmail).toHaveBeenCalledWith([11, 12], SELLER, null);
    expect(mockFindZalo).toHaveBeenCalledWith([31], SELLER, null);
  });

  it('không có khối nào dùng mẫu → không chạm DB', async () => {
    const templates = await content.buildListingTemplates({ sellerId: SELLER, nodes: [{ id: 1, nodeSubtype: 'manual_trigger', config: {} }] });
    expect(templates).toEqual({ email: {}, zalo: {} });
    expect(mockFindEmail).not.toHaveBeenCalled();
    expect(mockFindZalo).not.toHaveBeenCalled();
  });

  it('mẫu đã xoá / không thuộc người bán → 400, nêu tên khối, mã MARKETPLACE_TEMPLATE_MISSING', async () => {
    mockFindZalo.mockResolvedValue([]); // truy vấn có điều kiện id_user = người bán nên mẫu của người khác cũng ra rỗng
    await expect(content.buildListingTemplates({ sellerId: SELLER, nodes: [zaloGroupNode(31, 'Gui nhom khach moi')] }))
      .rejects.toMatchObject({
        status: 400,
        code: content.MARKETPLACE_TEMPLATE_MISSING,
        message: expect.stringContaining('Gui nhom khach moi'),
      });
  });

  it('một trong nhiều mẫu thiếu → từ chối cả listing', async () => {
    mockFindEmail.mockResolvedValue([emailRow(11)]);
    await expect(content.buildListingTemplates({ sellerId: SELLER, nodes: [emailNode(11), { ...emailNode(12), id: 4 }] }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('id mẫu rác (12abc cho email) → coi như mẫu không tồn tại', async () => {
    await expect(content.buildListingTemplates({ sellerId: SELLER, nodes: [emailNode('12abc')] })).rejects.toMatchObject({ status: 400 });
  });

  it('tệp đính kèm ngoài không gian của người bán bị loại (không chụp khoá của workspace khác)', async () => {
    mockFindZalo.mockResolvedValue([zaloRow(31, {
      attachments: [attachment(`uploads/${SELLER}/a.pdf`), attachment('uploads/8888/cua-nguoi-khac.pdf'), attachment(`uploads/${SELLER}0/gan-giong.pdf`)],
    })]);
    const templates = await content.buildListingTemplates({ sellerId: SELLER, nodes: [zaloGroupNode(31)] });
    expect(templates.zalo['31'].attachments.map((a) => a.key)).toEqual([`uploads/${SELLER}/a.pdf`]);
  });
});

describe('prepareForPurchase (mua, TRƯỚC khi trừ credit)', () => {
  const listingWith = (snapshot, extra = {}) => ({ id: 1, id_user: SELLER, snapshot_data: snapshot, ...extra });

  it('listing không có khối dùng mẫu → rỗng, không đọc DB/kho', async () => {
    const prepared = await content.prepareForPurchase({
      client: {}, buyerId: BUYER, listing: listingWith({ nodes: [{ id: 1, nodeSubtype: 'manual_trigger', config: {} }] }),
    });
    expect(prepared.totalBytes).toBe(0);
    expect(prepared.sources.email.size + prepared.sources.zalo.size).toBe(0);
    expect(mockFindEmail).not.toHaveBeenCalled();
    expect(mockGetObjectInfo).not.toHaveBeenCalled();
  });

  it('snapshot mới (có templates): dùng đúng bản chụp, KHÔNG đọc mẫu sống của người bán', async () => {
    const prepared = await content.prepareForPurchase({
      client: {},
      buyerId: BUYER,
      listing: listingWith({
        nodes: [zaloGroupNode(31)],
        templates: { email: {}, zalo: { 31: { name: 'Chup', bodyText: 'noi dung luc dang ban', attachments: [] } } },
      }),
    });
    expect(prepared.sources.zalo.get('31')).toMatchObject({ name: 'Chup', bodyText: 'noi dung luc dang ban' });
    expect(mockFindZalo).not.toHaveBeenCalled();
  });

  it('snapshot mới mà thiếu mẫu được tham chiếu → LISTING_CONTENT_UNAVAILABLE (không rơi về mẫu sống)', async () => {
    mockFindZalo.mockResolvedValue([zaloRow(31)]);
    await expect(content.prepareForPurchase({
      client: {}, buyerId: BUYER, listing: listingWith({ nodes: [zaloGroupNode(31)], templates: { email: {}, zalo: {} } }),
    })).rejects.toMatchObject({ status: 400, code: content.LISTING_CONTENT_UNAVAILABLE });
    expect(mockFindZalo).not.toHaveBeenCalled();
  });

  it('listing CŨ (snapshot chưa có templates): đọc mẫu sống của người bán — id_user = listing.id_user, bằng client của transaction', async () => {
    mockFindEmail.mockResolvedValue([emailRow(11)]);
    mockFindZalo.mockResolvedValue([zaloRow(31)]);
    const client = { tag: 'tx' };
    const prepared = await content.prepareForPurchase({
      client, buyerId: BUYER, listing: listingWith({ nodes: [emailNode(11), zaloGroupNode(31)] }),
    });
    expect(prepared.sources.email.get('11').name).toBe('Email 11');
    expect(prepared.sources.zalo.get('31').bodyText).toBe('Noi dung 31');
    expect(mockFindEmail).toHaveBeenCalledWith([11], SELLER, client);
    expect(mockFindZalo).toHaveBeenCalledWith([31], SELLER, client);
  });

  it('listing CŨ mà mẫu sống đã mất (như listing 5) → LISTING_CONTENT_UNAVAILABLE, nêu khối + mẫu', async () => {
    await expect(content.prepareForPurchase({
      client: {}, buyerId: BUYER, listing: listingWith({ nodes: [zaloGroupNode(3, 'Nhom ban hang')] }),
    })).rejects.toMatchObject({
      status: 400,
      code: content.LISTING_CONTENT_UNAVAILABLE,
      message: expect.stringContaining('Nhom ban hang'),
    });
  });

  it('tệp đính kèm của người bán không còn trên kho → LISTING_CONTENT_UNAVAILABLE', async () => {
    mockGetObjectInfo.mockResolvedValue(null);
    await expect(content.prepareForPurchase({
      client: {},
      buyerId: BUYER,
      listing: listingWith({
        nodes: [zaloGroupNode(31)],
        templates: { email: {}, zalo: { 31: { name: 'M', bodyText: 'x', attachments: [attachment(`uploads/${SELLER}/mat.pdf`)] } } },
      }),
    })).rejects.toMatchObject({ code: content.LISTING_CONTENT_UNAVAILABLE });
  });

  it('cộng dung lượng thật từ kho; vượt chỗ trống của người mua → MARKETPLACE_STORAGE_QUOTA_EXCEEDED (400)', async () => {
    mockGetObjectInfo.mockResolvedValueOnce({ size: 3000 }).mockResolvedValueOnce({ size: 4000 });
    mockAssertQuota.mockImplementation(({ requestedBytes }) => {
      if (requestedBytes > 5000) throw new MockQuotaError({ remainingBytes: 5000 });
    });
    const listing = listingWith({
      nodes: [zaloGroupNode(31)],
      templates: {
        email: {},
        zalo: { 31: { name: 'M', bodyText: 'x', attachments: [attachment(`uploads/${SELLER}/a.pdf`), attachment(`uploads/${SELLER}/b.pdf`)] } },
      },
    });
    await expect(content.prepareForPurchase({ client: {}, buyerId: BUYER, listing }))
      .rejects.toMatchObject({ status: 400, code: content.MARKETPLACE_STORAGE_QUOTA_EXCEEDED, message: expect.stringContaining('chưa bị trừ credit') });
    expect(mockAssertQuota).toHaveBeenCalledWith(expect.objectContaining({ requestedBytes: 7000 }));
  });

  it('lỗi hạ tầng khác từ kiểm dung lượng không bị nuốt thành 400', async () => {
    mockAssertQuota.mockImplementation(() => { throw new Error('db sập'); });
    await expect(content.prepareForPurchase({
      client: {},
      buyerId: BUYER,
      listing: listingWith({
        nodes: [zaloGroupNode(31)],
        templates: { email: {}, zalo: { 31: { name: 'M', bodyText: 'x', attachments: [attachment(`uploads/${SELLER}/a.pdf`)] } } },
      }),
    })).rejects.toThrow('db sập');
  });

  it('tệp ngoài không gian người bán trong snapshot bị bỏ qua, KHÔNG kiểm/chép', async () => {
    const prepared = await content.prepareForPurchase({
      client: {},
      buyerId: BUYER,
      listing: listingWith({
        nodes: [zaloGroupNode(31)],
        templates: { email: {}, zalo: { 31: { name: 'M', bodyText: 'x', attachments: [attachment('uploads/8888/cua-nguoi-khac.pdf')] } } },
      }),
    });
    expect(prepared.sources.zalo.get('31').attachments).toEqual([]);
    expect(mockGetObjectInfo).not.toHaveBeenCalled();
  });
});

describe('tryBuildListingTemplates / loadSellerTemplates / collectTemplateSources (dùng chung với script bù dữ liệu)', () => {
  it('tryBuildListingTemplates: thiếu mẫu thì KHÔNG ném lỗi, trả danh sách tham chiếu thiếu và không chụp gì', async () => {
    mockFindZalo.mockResolvedValue([zaloRow(31)]);
    const result = await content.tryBuildListingTemplates({ sellerId: SELLER, nodes: [zaloGroupNode(31), { ...zaloGroupNode(32, 'Nhom hai'), id: 9 }] });
    expect(result.missing.map((ref) => [ref.nodeName, ref.id])).toEqual([['Nhom hai', 32]]);
    expect(result.templates).toEqual({ email: {}, zalo: {} });
  });

  it('tryBuildListingTemplates: đủ mẫu → templates đầy đủ, missing rỗng', async () => {
    mockFindEmail.mockResolvedValue([emailRow(11)]);
    const result = await content.tryBuildListingTemplates({ sellerId: SELLER, nodes: [emailNode(11)] });
    expect(result.missing).toEqual([]);
    expect(result.templates.email['11'].name).toBe('Email 11');
  });

  it('loadSellerTemplates: đọc đúng theo chủ được truyền (mẫu của người MUA khác mẫu của người bán)', async () => {
    mockFindZalo.mockResolvedValue([zaloRow(44)]);
    const loaded = await content.loadSellerTemplates(BUYER, [{ channel: 'zalo', id: 44 }, { channel: 'zalo', id: null }, { channel: 'email', id: 5 }]);
    expect(mockFindZalo).toHaveBeenCalledWith([44], BUYER, null);
    expect(mockFindEmail).toHaveBeenCalledWith([5], BUYER, null);
    expect(Object.keys(loaded.zalo)).toEqual(['44']);
  });

  it('collectTemplateSources: nguồn đủ → gom tệp + cộng dung lượng thật; thiếu nội dung → LISTING_CONTENT_UNAVAILABLE', async () => {
    mockGetObjectInfo.mockResolvedValue({ size: 1234 });
    const refs = [{ channel: 'zalo', id: 31, raw: '31', nodeName: 'Gui nhom' }];
    const available = { email: {}, zalo: { 31: { name: 'M', bodyText: 'x', attachments: [attachment(`uploads/${SELLER}/a.pdf`)] } } };
    const collected = await content.collectTemplateSources({ refs, available, sellerId: SELLER });
    expect(collected.totalBytes).toBe(1234);
    expect(collected.sources.zalo.get('31').attachments).toHaveLength(1);
    await expect(content.collectTemplateSources({ refs, available: { email: {}, zalo: {} }, sellerId: SELLER }))
      .rejects.toMatchObject({ code: content.LISTING_CONTENT_UNAVAILABLE });
  });
});

describe('materializeTemplates (mua, trong transaction)', () => {
  const makePrepared = () => ({
    totalBytes: 1500,
    sources: {
      email: new Map([[
        '11',
        { name: 'Email 11', code: 'E11', subject: 'S', bodyHtml: '<p>x</p>', bodyText: 't', variables: ['ten'], category: 'sale', attachments: [{ ...attachment(`uploads/${SELLER}/1_abc_mau.pdf`), __size: 1500 }] },
      ]]),
      zalo: new Map([[
        '31',
        { name: 'Zalo 31', code: null, subject: null, bodyHtml: null, bodyText: 'Noi dung', variables: [], category: null, attachments: [] },
      ]]),
    },
  });

  it('tạo mẫu mới cho người mua (id_user = người mua), chép tệp sang uploads/<người mua>/, ghi sổ + template_files, trả bản đồ id', async () => {
    const client = { tag: 'tx' };
    const copiedKeys = [];
    const { maps, templateCount, fileCount } = await content.materializeTemplates(client, { buyerId: BUYER, prepared: makePrepared(), copiedKeys });

    expect(maps.email.get('11')).toBe('5000');
    expect(maps.zalo.get('31')).toBe('6000');
    expect(templateCount).toBe(2);
    expect(fileCount).toBe(1);

    expect(mockCreateEmail).toHaveBeenCalledWith(expect.objectContaining({
      userId: BUYER, templateName: 'Email 11', templateCode: 'E11', subject: 'S', bodyHtml: '<p>x</p>', bodyText: 't', variables: ['ten'], category: 'sale',
    }), client);
    expect(mockCreateZalo).toHaveBeenCalledWith(expect.objectContaining({ userId: BUYER, templateName: 'Zalo 31', bodyText: 'Noi dung', attachments: [] }), client);

    // tệp: chép từ khoá người bán sang khoá người mua, nhớ khoá để dọn
    expect(mockCopy).toHaveBeenCalledTimes(1);
    const [fromKey, toKey] = mockCopy.mock.calls[0];
    expect(fromKey).toBe(`uploads/${SELLER}/1_abc_mau.pdf`);
    expect(toKey.startsWith(`uploads/${BUYER}/`)).toBe(true);
    expect(toKey.endsWith('_Bang_gia.pdf')).toBe(true);
    expect(copiedKeys).toEqual([toKey]);

    // mẫu mới trỏ khoá của người mua, không còn dấu vết tệp của người bán
    const savedAttachments = mockCreateEmail.mock.calls[0][0].attachments;
    expect(savedAttachments).toHaveLength(1);
    expect(savedAttachments[0]).toMatchObject({ key: toKey, url: `https://files.test/${toKey}`, size: 1000, displayName: 'Bảng giá', contentType: 'application/pdf' });
    expect(savedAttachments[0].tempId).toBeUndefined();
    expect(savedAttachments[0].storageObjectId).toBeUndefined();
    expect(savedAttachments[0].__size).toBeUndefined();
    expect(JSON.stringify(savedAttachments)).not.toContain(`uploads/${SELLER}/`);

    // sổ dung lượng của NGƯỜI MUA, trong transaction (client)
    expect(mockInsertStorageObject).toHaveBeenCalledWith(expect.objectContaining({
      poolType: 'workspace', ownerUserId: BUYER, actorUserId: BUYER, storageKey: toKey, category: 'email_template', state: 'active',
      sizeBytes: 1500, referenceType: 'email_template', referenceId: '5000',
    }), client);
    expect(mockSyncTemplateFile).toHaveBeenCalledWith('5000', expect.objectContaining({ key: toKey }), client);
    // khoá dung lượng của người mua được giữ trước khi kiểm lại
    expect(mockAcquireLock).toHaveBeenCalledWith(client, BUYER);
    expect(mockAcquireLock.mock.invocationCallOrder[0]).toBeLessThan(mockCopy.mock.invocationCallOrder[0]);
  });

  it('kiểm lại dung lượng KHI ĐÃ giữ khoá: vượt → 400, chưa chép tệp nào, chưa tạo mẫu', async () => {
    mockAssertQuota.mockImplementation(() => { throw new MockQuotaError({ remainingBytes: 0 }); });
    const copiedKeys = [];
    await expect(content.materializeTemplates({}, { buyerId: BUYER, prepared: makePrepared(), copiedKeys }))
      .rejects.toMatchObject({ status: 400, code: content.MARKETPLACE_STORAGE_QUOTA_EXCEEDED });
    expect(mockCopy).not.toHaveBeenCalled();
    expect(mockCreateEmail).not.toHaveBeenCalled();
    expect(copiedKeys).toEqual([]);
  });

  it('chép tệp thứ hai lỗi → khoá của tệp đã chép vẫn nằm trong copiedKeys để người gọi dọn', async () => {
    const prepared = makePrepared();
    prepared.sources.email.get('11').attachments.push({ ...attachment(`uploads/${SELLER}/2_def_mau2.pdf`), __size: 10 });
    mockCopy.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('GCS 503'));
    const copiedKeys = [];
    await expect(content.materializeTemplates({}, { buyerId: BUYER, prepared, copiedKeys })).rejects.toThrow('GCS 503');
    expect(copiedKeys).toHaveLength(1);
    expect(copiedKeys[0].startsWith(`uploads/${BUYER}/`)).toBe(true);
  });

  it('không có nguồn nào → không làm gì (không khoá, không tạo)', async () => {
    const result = await content.materializeTemplates({}, {
      buyerId: BUYER, prepared: { totalBytes: 0, sources: { email: new Map(), zalo: new Map() } }, copiedKeys: [],
    });
    expect(result.maps.email.size + result.maps.zalo.size).toBe(0);
    expect(mockAcquireLock).not.toHaveBeenCalled();
    expect(mockCreateEmail).not.toHaveBeenCalled();
  });

  it('mẫu không tệp: không khoá dung lượng, không chép', async () => {
    const prepared = makePrepared();
    prepared.sources.email.clear();
    prepared.totalBytes = 0;
    await content.materializeTemplates({}, { buyerId: BUYER, prepared, copiedKeys: [] });
    expect(mockAcquireLock).not.toHaveBeenCalled();
    expect(mockCopy).not.toHaveBeenCalled();
    expect(mockCreateZalo).toHaveBeenCalledTimes(1);
  });

  it('tên mẫu trống trong snapshot → tên dự phòng (cột template_name NOT NULL)', async () => {
    const prepared = { totalBytes: 0, sources: { email: new Map(), zalo: new Map([['31', { name: '  ', bodyText: 'x', attachments: [] }]]) } };
    await content.materializeTemplates({}, { buyerId: BUYER, prepared, copiedKeys: [] });
    expect(mockCreateZalo).toHaveBeenCalledWith(expect.objectContaining({ templateName: 'Mẫu từ Marketplace' }), expect.anything());
  });
});

describe('discardCopiedFiles', () => {
  it('xoá các khoá đã chép', async () => {
    await content.discardCopiedFiles(['uploads/9/a', '', 'uploads/9/b']);
    expect(mockDelete).toHaveBeenCalledWith(['uploads/9/a', 'uploads/9/b']);
  });

  it('danh sách rỗng → không gọi kho; kho lỗi → không ném (đường rollback không được vỡ thêm)', async () => {
    await content.discardCopiedFiles([]);
    await content.discardCopiedFiles(undefined);
    expect(mockDelete).not.toHaveBeenCalled();
    mockDelete.mockRejectedValue(new Error('GCS 503'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(content.discardCopiedFiles(['uploads/9/a'])).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
