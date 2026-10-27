import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * GET /api/dashboard/getting-started — controller mỏng: đúng chủ workspace vào service, đúng hình dạng trả ra, lỗi → 500
 * không lộ chi tiết. Việc chặn nhân viên (403 OWNER_ONLY) nằm ở route (requireSelfContext) — xem
 * routes/__tests__/employeeRoutePolicy.spec.js và tests/integration/dashboardGettingStarted.test.js.
 */
const getGettingStarted = jest.fn();

jest.unstable_mockModule('../../services/dashboard/gettingStarted.service.js', () => ({
  default: { getGettingStarted },
}));
jest.unstable_mockModule('../../services/dashboard/dashboardAnalytics.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/dashboard/dashboardInsights.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../middleware/aiCredit.middleware.js', () => ({ chargeAiCredit: jest.fn() }));

const { default: dashboardController } = await import('../dashboard.controller.js');

const makeRes = () => {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res), set: jest.fn(() => res) };
  return res;
};

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('DashboardController.getGettingStarted', () => {
  it('chủ tài khoản: gọi service với id của chính mình, trả { success, data } không cache', async () => {
    getGettingStarted.mockResolvedValue({ channelConnected: true, hasCustomers: false, hasSentMessage: false });
    const res = makeRes();

    await dashboardController.getGettingStarted({ user: { id: 5, activeContext: { type: 'self' } } }, res);

    expect(getGettingStarted).toHaveBeenCalledWith(5);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { channelConnected: true, hasCustomers: false, hasSentMessage: false },
    });
    expect(res.set).toHaveBeenCalledWith('Cache-Control', expect.stringContaining('no-store'));
  });

  it('đo theo CHỦ workspace chứ không theo người gọi (nếu sau này route mở cho nhân viên)', async () => {
    getGettingStarted.mockResolvedValue({ channelConnected: false, hasCustomers: false, hasSentMessage: false });

    await dashboardController.getGettingStarted(
      { user: { id: 7, activeContext: { type: 'employee', ownerId: 9 } } },
      makeRes()
    );

    expect(getGettingStarted).toHaveBeenCalledWith(9);
  });

  it('service lỗi → 500 "Lỗi server", không lộ nội dung lỗi', async () => {
    getGettingStarted.mockRejectedValue(new Error('relation "secret_table" does not exist'));
    const res = makeRes();

    await dashboardController.getGettingStarted({ user: { id: 5 } }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Lỗi server' });
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('secret_table');
  });
});
