/**
 * PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G3 — `getCampaignZaloAccount` là ĐIỂM NGHẼN chung của preview, gửi thử Gửi nhanh
 * và mọi bước gửi lúc chạy chiến dịch. Danh sách `accessibleAccountIds` (đã tính bởi người gọi) chặn tài khoản chưa giao
 * bằng 403 `ZALO_ACCOUNT_NOT_ASSIGNED` TRƯỚC khi đụng DB; chủ / super admin truyền null (hoặc bỏ trống) và đi như cũ.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFindCampaignZaloAccount = jest.fn();

const realRepo = (await import('../../../repositories/campaign/campaignZaloSender.repository.js')).default;
jest.unstable_mockModule('../../../repositories/campaign/campaignZaloSender.repository.js', () => ({
  default: new Proxy(realRepo, {
    get: (target, prop) => (prop === 'findCampaignZaloAccount' ? mockFindCampaignZaloAccount : target[prop]),
  }),
}));

const campaignZaloSenderService = (await import('../campaignZaloSender.service.js')).default;

const READY_ROW = { id: 5, id_user: 10, display_name: 'Nick 5', status: 'connected', is_active: true, is_default: false };

describe('getCampaignZaloAccount — tài khoản được giao (G3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindCampaignZaloAccount.mockImplementation(async (id) => (Number(id) === 5 ? READY_ROW : null));
  });

  it('nhân viên được giao tài khoản 5 → lấy được, repo được gọi với id chủ', async () => {
    const account = await campaignZaloSenderService.getCampaignZaloAccount({
      userId: 10, accountId: '5', roleCode: 'user', accessibleAccountIds: [5, 6],
    });
    expect(String(account.id)).toBe('5');
    expect(mockFindCampaignZaloAccount).toHaveBeenCalledWith(5, 10, false);
  });

  it('nhân viên CHƯA được giao → 403 ZALO_ACCOUNT_NOT_ASSIGNED, repo KHÔNG bị gọi', async () => {
    const error = await campaignZaloSenderService.getCampaignZaloAccount({
      userId: 10, accountId: 5, roleCode: 'user', accessibleAccountIds: [6],
    }).catch((e) => e);
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe('ZALO_ACCOUNT_NOT_ASSIGNED');
    expect(error.message).toBe('Tài khoản Zalo này chưa được giao cho bạn.');
    expect(mockFindCampaignZaloAccount).not.toHaveBeenCalled();
  });

  it('id KHÔNG tồn tại và id chưa giao cho CÙNG một lỗi (không lộ id nào có thật)', async () => {
    const missing = await campaignZaloSenderService.getCampaignZaloAccount({
      userId: 10, accountId: 999, roleCode: 'user', accessibleAccountIds: [6],
    }).catch((e) => e);
    const notAssigned = await campaignZaloSenderService.getCampaignZaloAccount({
      userId: 10, accountId: 5, roleCode: 'user', accessibleAccountIds: [6],
    }).catch((e) => e);
    expect([missing.code, missing.message]).toEqual([notAssigned.code, notAssigned.message]);
  });

  it('nhân viên chưa được giao tài khoản nào ([]) → chặn mọi id', async () => {
    await expect(campaignZaloSenderService.getCampaignZaloAccount({
      userId: 10, accountId: 5, roleCode: 'user', accessibleAccountIds: [],
    })).rejects.toMatchObject({ code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
  });

  it('CHỦ (accessibleAccountIds = null) → lấy được tài khoản bất kỳ của mình, như trước', async () => {
    const account = await campaignZaloSenderService.getCampaignZaloAccount({
      userId: 10, accountId: 5, roleCode: 'user', accessibleAccountIds: null,
    });
    expect(String(account.id)).toBe('5');
  });

  it('người gọi cũ chưa truyền tham số (undefined) → không lọc (luồng hệ thống / admin giữ nguyên)', async () => {
    const account = await campaignZaloSenderService.getCampaignZaloAccount({ userId: 10, accountId: 5, roleCode: 'user' });
    expect(String(account.id)).toBe('5');
  });

  it('FAIL-CLOSED: giá trị không phải mảng / null (chuỗi, object, số) → chặn, không được hiểu là "không lọc"', async () => {
    for (const bad of ['5', { 0: 5 }, 5, true, false]) {
      // eslint-disable-next-line no-await-in-loop
      await expect(campaignZaloSenderService.getCampaignZaloAccount({
        userId: 10, accountId: 5, roleCode: 'user', accessibleAccountIds: bad,
      })).rejects.toMatchObject({ code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
    }
  });

  it('id sai dạng ("5abc" → parseInt = 5): được so như engine, không lách được bằng chuỗi', async () => {
    await expect(campaignZaloSenderService.getCampaignZaloAccount({
      userId: 10, accountId: '5abc', roleCode: 'user', accessibleAccountIds: [6],
    })).rejects.toMatchObject({ code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
    const ok = await campaignZaloSenderService.getCampaignZaloAccount({
      userId: 10, accountId: '5abc', roleCode: 'user', accessibleAccountIds: [5],
    });
    expect(String(ok.id)).toBe('5');
  });

  it('thiếu accountId vẫn báo "Chưa chọn tài khoản Zalo gửi" như cũ (không lẫn với lỗi chưa giao)', async () => {
    await expect(campaignZaloSenderService.getCampaignZaloAccount({
      userId: 10, accountId: null, roleCode: 'user', accessibleAccountIds: [5],
    })).rejects.toThrow('Chưa chọn tài khoản Zalo gửi');
  });
});
