import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PR-10 (C-28) — hộp thoại "Duyệt & gửi" ở danh sách chiến dịch đọc `totalCustomers` của API danh sách.
 * Chiến dịch chờ chủ duyệt CHƯA chạy nên campaign_customers rỗng → 0 → "sẽ gửi đến 0 người nhận".
 * API danh sách phải trả số ƯỚC TÍNH dùng chung với ngưỡng duyệt (countCampaignRecipientsEstimate).
 */
const mockDbQuery = jest.fn();
jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { getClient: jest.fn(), query: mockDbQuery },
}));

const mockFindCampaigns = jest.fn();
const mockCountCampaigns = jest.fn();
jest.unstable_mockModule('../../../repositories/campaign/campaignCrud.repository.js', () => ({
  default: { findCampaigns: mockFindCampaigns, countCampaigns: mockCountCampaigns },
}));

const { default: campaignCrudService } = await import('../campaignCrud.service.js');

const row = (over = {}) => ({
  id: 1,
  campaign_name: 'C',
  campaign_type: 'email',
  status: 'active',
  total_customers: 0,
  ...over,
});

const authUser = { id: 5, role: 'user', workspaceOwnerId: 5, contextType: 'self' };

describe('campaignCrudService.getAllCampaigns — số người nhận của chiến dịch chờ duyệt (C-28)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCountCampaigns.mockResolvedValue(1);
  });

  it('chiến dịch pending_owner_approval có total_customers=0: lấy số từ campaign_customers (cùng phép đếm với ngưỡng duyệt)', async () => {
    mockFindCampaigns.mockResolvedValueOnce([row({ id: 42, status: 'pending_owner_approval' })]);
    mockDbQuery.mockResolvedValueOnce({ rows: [{ count: 250 }] });

    const { items } = await campaignCrudService.getAllCampaigns({ authUser });

    expect(items[0].totalCustomers).toBe(250);
    expect(mockDbQuery).toHaveBeenCalledTimes(1);
    expect(mockDbQuery.mock.calls[0][0]).toContain('FROM campaign_customers');
    expect(mockDbQuery.mock.calls[0][1]).toEqual([42]);
  });

  it('campaign_customers rỗng: đếm tạm qua cấu hình node (customers/recipients…) như ngưỡng duyệt', async () => {
    mockFindCampaigns.mockResolvedValueOnce([row({ id: 43, status: 'pending_owner_approval' })]);
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({
        rows: [
          { node_type: 'action', node_subtype: 'send_email', config: { recipients: [1, 2, 3] } },
          { node_type: 'action', node_subtype: 'read_db', config: JSON.stringify({ selectedCustomerIds: [9, 8] }) },
        ],
      });

    const { items } = await campaignCrudService.getAllCampaigns({ authUser });

    expect(items[0].totalCustomers).toBe(5);
  });

  it('chiến dịch KHÁC chờ duyệt (active/draft) hoặc đã có total_customers: không phát sinh truy vấn thêm', async () => {
    mockFindCampaigns.mockResolvedValueOnce([
      row({ id: 1, status: 'active', total_customers: 0 }),
      row({ id: 2, status: 'pending_owner_approval', total_customers: 120 }),
    ]);

    const { items } = await campaignCrudService.getAllCampaigns({ authUser });

    expect(mockDbQuery).not.toHaveBeenCalled();
    expect(items.map((i) => i.totalCustomers)).toEqual([0, 120]);
  });

  it('truyền excludeDraft xuống repository cho cả truy vấn trang lẫn truy vấn đếm (C-09)', async () => {
    mockFindCampaigns.mockResolvedValueOnce([]);
    await campaignCrudService.getAllCampaigns({ authUser, excludeDraft: true, page: 2, limit: 20 });
    expect(mockFindCampaigns.mock.calls[0][0]).toMatchObject({ excludeDraft: true, limit: 20, offset: 20 });
    expect(mockCountCampaigns.mock.calls[0][0]).toMatchObject({ excludeDraft: true });
  });
});
