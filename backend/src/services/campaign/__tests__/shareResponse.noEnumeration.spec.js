/**
 * Chia sẻ chiến dịch / landing page qua email: phản hồi cho người chia sẻ phải GIỐNG NHAU dù email
 * đã có tài khoản hay chưa — không trả isExistingUser, id/họ tên người nhận, status/id_recipient.
 * Danh sách share của chủ sở hữu không trả họ tên người nhận.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockClient = { query: jest.fn(), release: jest.fn() };
const mockDbQuery = jest.fn();
jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { getClient: jest.fn(async () => mockClient), query: mockDbQuery },
}));

const campaignRepo = {
  findOrCreatePendingByEmail: jest.fn(),
  findByCampaign: jest.fn(),
  isCampaignOwnedByWorkspace: jest.fn(),
};
jest.unstable_mockModule('../../../repositories/campaign/campaignShare.repository.js', () => ({
  default: campaignRepo,
}));

const landingRepo = {
  findOrCreatePendingByEmail: jest.fn(),
  findByLandingPage: jest.fn(),
  isLandingPageOwnedByWorkspace: jest.fn(),
};
jest.unstable_mockModule('../../../repositories/landingPageShare.repository.js', () => ({
  default: landingRepo,
}));

const mockSendSystemEmail = jest.fn();
jest.unstable_mockModule('../../../utils/systemEmail.util.js', () => ({
  sendSystemEmail: mockSendSystemEmail,
}));
jest.unstable_mockModule('../../../utils/systemEmailShare.util.js', () => ({
  buildCampaignSharedEmail: jest.fn(() => ({ subject: 's', html: 'h' })),
  buildLandingPageSharedEmail: jest.fn(() => ({ subject: 's', html: 'h' })),
}));

const { default: campaignShareService } = await import('../campaignShare.service.js');
const { default: landingPageShareService } = await import('../../landingPage/landingPageShare.service.js');

const existingUser = { id: 77, full_name: 'Nguyễn Thị Bí Mật', username: 'bimat', email: 'known@x.com' };
const LEAK_FIELDS = ['isExistingUser', 'id_recipient', 'status', 'full_name', 'name'];

function collectKeys(value, out = new Set()) {
  if (value && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      out.add(key);
      collectKeys(inner, out);
    }
  }
  return out;
}

function expectNoLeak(result) {
  const keys = collectKeys(result);
  for (const field of LEAK_FIELDS) expect(keys.has(field)).toBe(false);
  expect(JSON.stringify(result)).not.toContain('Bí Mật');
  // id tài khoản người nhận (77) không xuất hiện ở bất kỳ đâu.
  expect(JSON.stringify(result)).not.toMatch(/\b77\b/);
  expect(result.recipient).not.toHaveProperty('id');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockClient.query.mockResolvedValue({ rows: [] });
  mockDbQuery.mockResolvedValue({ rows: [{ name: 'Chủ', campaign_name: 'CD', title: 'LP', slug: 'lp' }] });
  mockSendSystemEmail.mockResolvedValue({});
});

describe('campaignShare.service.shareCampaign', () => {
  const activeRow = { id: 5, id_campaign: 9, id_owner: 1, id_recipient: 77, recipient_email: 'known@x.com', share_type: 'view', can_run: false, status: 'active' };
  const pendingRow = { id: 6, id_campaign: 9, id_owner: 1, id_recipient: null, recipient_email: 'new@x.com', share_type: 'view', can_run: false, status: 'pending' };

  it('email đã có tài khoản và email mới → cùng một dạng phản hồi, không lộ tồn tại/họ tên', async () => {
    campaignRepo.findOrCreatePendingByEmail
      .mockResolvedValueOnce({ share: activeRow, isExistingUser: true, recipient: existingUser })
      .mockResolvedValueOnce({ share: pendingRow, isExistingUser: false, recipient: null });

    const known = await campaignShareService.shareCampaign({
      campaignId: 9, workspaceOwnerId: 1, recipientEmail: ' Known@X.com ', shareType: 'view', canRun: false,
    });
    const fresh = await campaignShareService.shareCampaign({
      campaignId: 9, workspaceOwnerId: 1, recipientEmail: 'new@x.com', shareType: 'view', canRun: false,
    });

    expect(known).toEqual({
      success: true,
      share: { id: 5, shareType: 'view', canRun: false },
      recipient: { email: 'known@x.com' },
      notificationSent: true,
    });
    expect(Object.keys(fresh).sort()).toEqual(Object.keys(known).sort());
    expect(Object.keys(fresh.share).sort()).toEqual(Object.keys(known.share).sort());
    expect(fresh.recipient).toEqual({ email: 'new@x.com' });
    expectNoLeak(known);
    expectNoLeak(fresh);
    // Email thông báo vẫn gửi cho cả hai.
    expect(mockSendSystemEmail).toHaveBeenCalledTimes(2);
  });

  it('danh sách share của chủ: chỉ id (để thu hồi) + email, không có họ tên', async () => {
    campaignRepo.isCampaignOwnedByWorkspace.mockResolvedValue(true);
    campaignRepo.findByCampaign.mockResolvedValue([
      { ...activeRow, recipient_name: 'Nguyễn Thị Bí Mật' },
    ]);
    const list = await campaignShareService.getCampaignShares(9, 1);
    expect(list[0].recipient).toEqual({ id: 77, email: 'known@x.com' });
    expect(JSON.stringify(list)).not.toContain('Bí Mật');
  });
});

describe('landingPageShare.service.shareLandingPage', () => {
  const activeRow = { id: 15, id_landing_page: 3, id_owner: 1, id_recipient: 77, recipient_email: 'known@x.com', share_type: 'edit', status: 'active' };
  const pendingRow = { id: 16, id_landing_page: 3, id_owner: 1, id_recipient: null, recipient_email: 'new@x.com', share_type: 'edit', status: 'pending' };

  it('email đã có tài khoản và email mới → cùng một dạng phản hồi, không lộ tồn tại/họ tên', async () => {
    landingRepo.findOrCreatePendingByEmail
      .mockResolvedValueOnce({ share: activeRow, isExistingUser: true, recipient: existingUser })
      .mockResolvedValueOnce({ share: pendingRow, isExistingUser: false, recipient: null });

    const known = await landingPageShareService.shareLandingPage({
      landingPageId: 3, workspaceOwnerId: 1, recipientEmail: 'known@x.com', shareType: 'edit',
    });
    const fresh = await landingPageShareService.shareLandingPage({
      landingPageId: 3, workspaceOwnerId: 1, recipientEmail: 'NEW@x.com', shareType: 'edit',
    });

    expect(known).toEqual({
      success: true,
      share: { id: 15, shareType: 'edit' },
      recipient: { email: 'known@x.com' },
      notificationSent: true,
    });
    expect(Object.keys(fresh).sort()).toEqual(Object.keys(known).sort());
    expect(fresh.recipient).toEqual({ email: 'new@x.com' });
    expectNoLeak(known);
    expectNoLeak(fresh);
  });

  it('tự chia sẻ cho chính mình vẫn bị chặn 400', async () => {
    landingRepo.findOrCreatePendingByEmail.mockResolvedValueOnce({
      share: activeRow, isExistingUser: true, recipient: { ...existingUser, id: 1 },
    });
    await expect(landingPageShareService.shareLandingPage({
      landingPageId: 3, workspaceOwnerId: 1, recipientEmail: 'me@x.com', shareType: 'view',
    })).rejects.toMatchObject({ status: 400 });
  });

  it('danh sách share của chủ: chỉ id (để thu hồi) + email, không có họ tên', async () => {
    landingRepo.isLandingPageOwnedByWorkspace.mockResolvedValue(true);
    landingRepo.findByLandingPage.mockResolvedValue([{ ...activeRow, recipient_name: 'Nguyễn Thị Bí Mật' }]);
    const list = await landingPageShareService.getLandingPageShares(3, 1);
    expect(list[0].recipient).toEqual({ id: 77, email: 'known@x.com' });
    expect(JSON.stringify(list)).not.toContain('Bí Mật');
  });
});
