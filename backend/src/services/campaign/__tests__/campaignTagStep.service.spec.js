import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../../../config/database.js', () => ({ default: { query: jest.fn() } }));

const { default: tagStep, extractContactFromItem, contactKey } = await import('../campaignTagStep.service.js');
const { default: customerTagService } = await import('../../customer/customerTag.service.js');
const { default: customerTagRepository } = await import('../../../repositories/customer/customerTag.repository.js');
const { default: customerMutationRepository } = await import('../../../repositories/customer/customerMutation.repository.js');

/**
 * PR-T2 — khối Gắn tag của chiến dịch. SQL thật (cách ly workspace ở `assign`/`unassign`) nằm ở integration của T1; ở đây
 * dựng một "bảng khách" giả của HAI workspace để chứng minh: tra khách luôn truyền đúng workspace chủ chiến dịch, khách
 * workspace khác trùng email không bao giờ bị gắn, và không có đường nào tạo khách mới.
 */
const CUSTOMERS = [
  { id: 1, ws: 42, email: 'an@x.com', phone: '0912345678', zalo_id: null },
  { id: 2, ws: 99, email: 'an@x.com', phone: '0912345678', zalo_id: null }, // cùng liên hệ, workspace KHÁC
  { id: 3, ws: 42, email: 'binh@x.com', phone: null, zalo_id: null },
  { id: 4, ws: 42, email: null, phone: '0987 654 321', zalo_id: null },
];

function installFakeDb() {
  // Giả lập `preloadCustomersByContact`: lọc theo workspace như SQL thật; workspace rỗng → (sai) trả hết để lộ lỗi cách ly.
  const preload = jest.spyOn(customerMutationRepository, 'preloadCustomersByContact').mockImplementation(
    async (_client, ws, { emailKeys = [], phoneKeys = [] }) => CUSTOMERS
      .filter((c) => (ws == null ? true : c.ws === ws))
      .filter((c) => (c.email && emailKeys.includes(c.email.toLowerCase()))
        || (c.phone && phoneKeys.includes(String(c.phone).replace(/\D/g, '').slice(-9))))
      .map(({ id, email, phone, zalo_id }) => ({ id, email, phone, zalo_id })),
  );
  const assign = jest.spyOn(customerTagService, 'assignTags').mockImplementation(async (ws, { customerIds }) => ({
    assigned: customerIds.length, tagIds: [7], ws,
  }));
  const unassign = jest.spyOn(customerTagService, 'unassignTags').mockImplementation(async (_ws, { customerIds }) => ({
    removed: customerIds.length,
  }));
  const findOrCreate = jest.spyOn(customerTagService, 'findOrCreateTagByName').mockResolvedValue({ id: 7, name: 'VIP' });
  const findByName = jest.spyOn(customerTagRepository, 'findByName').mockResolvedValue({ id: 7, name: 'VIP' });
  return { preload, assign, unassign, findOrCreate, findByName };
}

describe('extractContactFromItem', () => {
  it('lấy email/SĐT theo khoá chuẩn và theo tiêu đề cột tiếng Việt', () => {
    expect(extractContactFromItem({ email: ' A@x.com ', phone: '0912' })).toEqual({ email: 'A@x.com', phone: '0912' });
    expect(extractContactFromItem({ 'Số điện thoại': '0912 345 678', 'Địa chỉ email': 'b@x.com' }))
      .toEqual({ email: 'b@x.com', phone: '0912 345 678' });
    expect(extractContactFromItem({ email: 'khong-phai-email' })).toEqual({ email: '', phone: '' });
    expect(extractContactFromItem(null)).toEqual({ email: '', phone: '' });
  });

  it('contactKey chuẩn hoá: email thường, SĐT 9 số cuối', () => {
    expect(contactKey({ email: ' AN@X.com', phone: '+84 912 345 678' })).toBe('an@x.com|912345678');
  });
});

describe('campaignTagStepService.applyStep', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('add: gắn đúng khách CỦA WORKSPACE chiến dịch, bỏ khách workspace khác trùng email, ghi nguồn campaign', async () => {
    const { preload, assign } = installFakeDb();
    const result = await tagStep.applyStep({
      workspaceOwnerId: 42,
      items: [{ email: 'AN@x.com' }, { phone: '+84 987 654 321' }, { email: 'la@x.com' }],
      tagAction: 'add',
      tagName: 'VIP',
      campaignId: 11,
      runId: 22,
    });
    expect(preload.mock.calls.every((call) => call[1] === 42)).toBe(true);
    expect(assign).toHaveBeenCalledTimes(1);
    const [ws, args] = assign.mock.calls[0];
    expect(ws).toBe(42);
    expect(args).toMatchObject({ tagIds: [7], source: 'campaign', campaignId: 11, runId: 22 });
    expect([...args.customerIds].sort()).toEqual([1, 4]); // KHÔNG có 2 (workspace 99)
    expect(result).toMatchObject({ action: 'add', tagId: 7, totalItems: 3, matched: 2, notFound: 1, changed: 2 });
  });

  it('không tạo khách mới: dòng không khớp chỉ được đếm "không tìm thấy", gắn 0 khách', async () => {
    const { assign } = installFakeDb();
    const result = await tagStep.applyStep({
      workspaceOwnerId: 42, items: [{ email: 'la@x.com' }, { name: 'không liên hệ' }], tagAction: 'add', tagName: 'VIP',
    });
    expect(assign).not.toHaveBeenCalled();
    expect(result).toMatchObject({ matched: 0, notFound: 2, changed: 0 });
  });

  it('remove: gỡ đúng khách, tag chưa có thì KHÔNG tạo tag mới', async () => {
    const { unassign, findOrCreate } = installFakeDb();
    const result = await tagStep.applyStep({
      workspaceOwnerId: 42, items: [{ email: 'binh@x.com' }, { email: 'an@x.com' }], tagAction: 'remove', tagName: 'VIP',
    });
    expect(unassign).toHaveBeenCalledWith(42, { customerIds: [3, 1], tagIds: [7] });
    expect(findOrCreate).not.toHaveBeenCalled();
    expect(result).toMatchObject({ action: 'remove', changed: 2, matched: 2 });
  });

  it('remove với tag không tồn tại: không gỡ, không tạo', async () => {
    const { unassign, findOrCreate, findByName, preload } = installFakeDb();
    findByName.mockResolvedValue(null);
    const result = await tagStep.applyStep({
      workspaceOwnerId: 42, items: [{ email: 'an@x.com' }], tagAction: 'remove', tagName: 'Không có',
    });
    expect(unassign).not.toHaveBeenCalled();
    expect(findOrCreate).not.toHaveBeenCalled();
    expect(preload).not.toHaveBeenCalled();
    expect(result).toMatchObject({ tagId: null, changed: 0 });
  });

  it('tagAction lạ/trống mặc định là add (không bao giờ vô tình gỡ)', async () => {
    const { assign, unassign } = installFakeDb();
    await tagStep.applyStep({ workspaceOwnerId: 42, items: [{ email: 'an@x.com' }], tagAction: undefined, tagName: 'VIP' });
    await tagStep.applyStep({ workspaceOwnerId: 42, items: [{ email: 'an@x.com' }], tagAction: 'xoa-het', tagName: 'VIP' });
    expect(assign).toHaveBeenCalledTimes(2);
    expect(unassign).not.toHaveBeenCalled();
  });

  it('nguồn rỗng: vẫn bảo đảm tag tồn tại, không tra khách, không gắn', async () => {
    const { assign, preload, findOrCreate } = installFakeDb();
    const result = await tagStep.applyStep({ workspaceOwnerId: 42, items: [], tagAction: 'add', tagName: 'VIP' });
    expect(findOrCreate).toHaveBeenCalledWith(42, 'VIP');
    expect(preload).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
    expect(result).toMatchObject({ totalItems: 0, changed: 0, tagId: 7 });
  });

  it.each([[''], ['   '], [undefined]])('tên tag %p → 400 (runtime bắt và ghi cảnh báo)', async (tagName) => {
    installFakeDb();
    await expect(tagStep.applyStep({ workspaceOwnerId: 42, items: [{ email: 'an@x.com' }], tagAction: 'add', tagName }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('chế độ liên tục: doneKeys bỏ dòng đã khớp ở chu kỳ trước, dòng chưa khớp được thử lại', async () => {
    const { assign, preload } = installFakeDb();
    const doneKeys = new Set();
    await tagStep.applyStep({
      workspaceOwnerId: 42, items: [{ email: 'an@x.com' }, { email: 'chua-co@x.com' }], tagAction: 'add', tagName: 'VIP', doneKeys,
    });
    expect([...doneKeys]).toEqual(['an@x.com|']);
    assign.mockClear();
    preload.mockClear();

    // Chu kỳ sau: danh sách tích luỹ có thêm người mới; 'an' đã xong nên không tra lại, 'chua-co' được tra lại.
    const second = await tagStep.applyStep({
      workspaceOwnerId: 42,
      items: [{ email: 'an@x.com' }, { email: 'chua-co@x.com' }, { email: 'binh@x.com' }],
      tagAction: 'add', tagName: 'VIP', doneKeys,
    });
    expect(second.totalItems).toBe(2);
    expect(assign.mock.calls[0][1].customerIds).toEqual([3]);
    expect([...doneKeys].sort()).toEqual(['an@x.com|', 'binh@x.com|']);

    // Chu kỳ chỉ còn toàn dòng đã khớp → không còn gì để xử lý (runtime sẽ không ghi log chu kỳ rỗng này).
    const third = await tagStep.applyStep({
      workspaceOwnerId: 42, items: [{ email: 'an@x.com' }, { email: 'binh@x.com' }], tagAction: 'add', tagName: 'VIP', doneKeys,
    });
    expect(third.totalItems).toBe(0);
  });

  it('danh sách lớn: tra khách theo từng cụm khoá, gắn theo từng cụm ≤ 5.000 khách', async () => {
    const { preload } = installFakeDb();
    const items = Array.from({ length: 4500 }, (_, i) => ({ email: `u${i}@x.com` }));
    await tagStep.applyStep({ workspaceOwnerId: 42, items, tagAction: 'add', tagName: 'VIP' });
    expect(preload).toHaveBeenCalledTimes(3); // 4.500 email / 2.000 khoá mỗi truy vấn
  });
});
