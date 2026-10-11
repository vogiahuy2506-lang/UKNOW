import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { default: customerMutationService } = await import('../customerMutation.service.js');
const { default: customerMutationRepository } = await import('../../../repositories/customer/customerMutation.repository.js');
const { default: customerInterestedService } = await import('../customerInterested.service.js');
const { default: customerReadRepository } = await import('../../../repositories/customer/customerRead.repository.js');

/**
 * PR-C2 việc 5–6, 7, 8 — bulk: trần dòng, lỗi theo chỉ số, whitelist consentSource, khớp trùng chung;
 * interested không bỏ phạm vi chiến dịch; xoá khách chặn khi có đơn.
 */
describe('customerMutationService.bulkUpsert — kiểm đầu vào và khớp trùng', () => {
  let insertBulkCustomer;
  let updateBulkCustomer;
  let preload;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(customerMutationRepository, 'withTransaction').mockImplementation(async (fn) => fn({}));
    preload = jest.spyOn(customerMutationRepository, 'preloadCustomersByContact').mockResolvedValue([]);
    let nextId = 100;
    insertBulkCustomer = jest.spyOn(customerMutationRepository, 'insertBulkCustomer').mockImplementation(async () => {
      nextId += 1;
      return nextId;
    });
    updateBulkCustomer = jest.spyOn(customerMutationRepository, 'updateBulkCustomer').mockResolvedValue(undefined);
  });

  const run = (items, extra = {}) =>
    customerMutationService.bulkUpsert({ workspaceOwnerId: 5, actorUserId: 5, payload: { items, ...extra } });

  it('quá 2.000 dòng -> 400, không mở transaction/ghi gì', async () => {
    const items = Array.from({ length: 2001 }, (_, i) => ({ email: `u${i}@u.local` }));
    await expect(run(items)).rejects.toMatchObject({ statusCode: 400 });
    expect(preload).not.toHaveBeenCalled();
    expect(insertBulkCustomer).not.toHaveBeenCalled();
  });

  it('đúng 2.000 dòng vẫn xử lý', async () => {
    const items = Array.from({ length: 2000 }, (_, i) => ({ email: `u${i}@u.local` }));
    const result = await run(items);
    expect(result).toMatchObject({ inserted: 2000, invalid: 0, total: 2000 });
  });

  it('dòng sai bị bỏ và báo theo CHỈ SỐ mảng gửi lên; dòng đúng vẫn ghi', async () => {
    const result = await run([
      { email: 'ok1@u.local' },
      { email: 'khong-phai-email' },
      { phone: 'abc' },
      { email: 'ok2@u.local', phone: '0912345678' },
      { fullName: 'Không liên hệ' },
    ]);
    expect(result).toMatchObject({ inserted: 2, updated: 0, skipped: 1, invalid: 2, total: 5 });
    expect(result.errors).toEqual([
      { index: 1, field: 'email', message: 'Email không hợp lệ' },
      { index: 2, field: 'phone', message: 'Số điện thoại không hợp lệ' },
    ]);
    expect(insertBulkCustomer).toHaveBeenCalledTimes(2);
  });

  it('consentSource tự khai chỉ nhận manual/import; giá trị khác -> lỗi dòng, không ghi', async () => {
    const result = await run([
      { email: 'a@u.local', consentSource: 'landing_lead' },
      { email: 'b@u.local', consentSource: 'manual' },
      { email: 'c@u.local' },
    ]);
    expect(result.invalid).toBe(1);
    expect(result.errors).toEqual([expect.objectContaining({ index: 0, field: 'consentSource' })]);
    const consents = insertBulkCustomer.mock.calls.map((call) => call[2].consentSource);
    expect(consents).toEqual(['manual', 'import']);
  });

  it('trường landing do server suy ra vẫn cho consent landing_lead (không phải client tự khai)', async () => {
    await run([{ email: 'l@u.local', sourceLandingPage: 'chien-dich' }]);
    expect(insertBulkCustomer.mock.calls[0][2].consentSource).toBe('landing_lead');
  });

  it('khách đã có khác hoa/thường email -> UPDATE, không INSERT trùng', async () => {
    preload.mockResolvedValue([{ id: 7, email: 'khach@mail.com', phone: null, zalo_id: null }]);
    const result = await run([{ email: 'KHACH@Mail.COM', fullName: 'Mới' }]);
    expect(result).toMatchObject({ inserted: 0, updated: 1 });
    expect(updateBulkCustomer.mock.calls[0][2]).toBe(7);
    expect(insertBulkCustomer).not.toHaveBeenCalled();
  });

  it('SĐT khác định dạng -> khớp cùng khách', async () => {
    preload.mockResolvedValue([{ id: 8, email: null, phone: '0912345678', zalo_id: null }]);
    const result = await run([{ phone: '+84 912 345 678' }]);
    expect(result).toMatchObject({ inserted: 0, updated: 1 });
    expect(updateBulkCustomer.mock.calls[0][2]).toBe(8);
  });

  it('hai dòng trùng NHAU trong cùng lô -> 1 insert + 1 update (không tạo hai khách)', async () => {
    const result = await run([{ email: 'x@u.local' }, { email: 'X@U.local', fullName: 'Lần hai' }]);
    expect(result).toMatchObject({ inserted: 1, updated: 1 });
    expect(updateBulkCustomer.mock.calls[0][2]).toBe(101);
  });

  it('nạp khách có thể trùng MỘT lần cho cả lô (không N+1)', async () => {
    await run([{ email: 'a@u.local' }, { email: 'b@u.local' }, { phone: '0912345678' }]);
    expect(preload).toHaveBeenCalledTimes(1);
    expect(preload.mock.calls[0][2]).toEqual({
      emailKeys: ['a@u.local', 'b@u.local'],
      phoneKeys: ['912345678'],
      zaloIds: [],
    });
  });
});

describe('customerInterestedService — có campaignId thì không âm thầm bỏ phạm vi', () => {
  it('chiến dịch chưa có ai quan tâm -> trả rỗng, CHỈ gọi một truy vấn có phạm vi chiến dịch', async () => {
    jest.restoreAllMocks();
    const rows = jest.spyOn(customerReadRepository, 'getInterestedCustomersWithCoursesRows')
      .mockResolvedValue({ rows: [], courses: [], total: 0 });
    const data = await customerInterestedService.getInterestedCustomersWithCourses({
      userId: 5,
      campaignId: '42',
      customerType: 'interested',
      purchaseOrderStatusExpr: "'completed'",
    });
    expect(rows).toHaveBeenCalledTimes(1);
    expect(rows.mock.calls[0][0]).toMatchObject({ scopedCampaignId: 42, useCampaignScope: true });
    expect(data.items).toEqual([]);
    expect(data.filters.campaignId).toBe(42);
  });
});

describe('customerMutationService.delete — chặn khi khách đã có đơn', () => {
  beforeEach(() => jest.restoreAllMocks());

  it('khách có đơn -> 409 kèm lý do, KHÔNG gọi DELETE', async () => {
    jest.spyOn(customerMutationRepository, 'findOwnedCustomer').mockResolvedValue({ id: 9 });
    jest.spyOn(customerMutationRepository, 'countCustomerPurchases').mockResolvedValue(3);
    const del = jest.spyOn(customerMutationRepository, 'deleteCustomer').mockResolvedValue({ id: 9 });
    await expect(customerMutationService.delete({ workspaceOwnerId: 5, id: 9 })).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('3 đơn'),
    });
    expect(del).not.toHaveBeenCalled();
  });

  it('khách không có đơn -> xoá', async () => {
    jest.spyOn(customerMutationRepository, 'findOwnedCustomer').mockResolvedValue({ id: 9 });
    jest.spyOn(customerMutationRepository, 'countCustomerPurchases').mockResolvedValue(0);
    const del = jest.spyOn(customerMutationRepository, 'deleteCustomer').mockResolvedValue({ id: 9 });
    await expect(customerMutationService.delete({ workspaceOwnerId: 5, id: 9 })).resolves.toBe(true);
    expect(del).toHaveBeenCalledWith(5, 9);
  });

  it('khách không thuộc workspace -> 404', async () => {
    jest.spyOn(customerMutationRepository, 'findOwnedCustomer').mockResolvedValue(null);
    await expect(customerMutationService.delete({ workspaceOwnerId: 5, id: 9 })).rejects.toMatchObject({ statusCode: 404 });
  });
});
