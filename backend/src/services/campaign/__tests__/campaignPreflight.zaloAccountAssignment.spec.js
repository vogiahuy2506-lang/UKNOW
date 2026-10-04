/**
 * PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G3 — preflight (chạy tay, lịch, duyệt, chạy tiếp) kiểm tài khoản Zalo ĐƯỢC GIAO
 * cho từng người liên quan (người bấm chạy / tạo lịch + người tạo chiến dịch). Chạy chuỗi thật preflight →
 * campaignZaloAccess → bảng giao (mock repo); chỉ SQL được mock theo nội dung câu lệnh.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFindAssigned = jest.fn();
const mockQuery = jest.fn();

const realMemberRepo = await import('../../../repositories/user/memberChannelAccount.repository.js');
jest.unstable_mockModule('../../../repositories/user/memberChannelAccount.repository.js', () => ({
  ...realMemberRepo,
  findAssignedZaloAccountIds: mockFindAssigned,
}));
jest.unstable_mockModule('../../../config/database.js', () => ({ default: { query: mockQuery } }));
jest.unstable_mockModule('../../../utils/topupLockGate.util.js', () => ({ resourceIsLocked: jest.fn(async () => false) }));
jest.unstable_mockModule('../channelEntitlement.service.js', () => ({
  assertChannelEntitled: jest.fn(async () => undefined),
  default: { assertChannelEntitled: jest.fn(async () => undefined) },
}));

const { validateCampaignPreflight } = await import('../campaignPreflight.service.js');

const OWNER = 7;
const EMP = 20;
const CREATOR = 30;

let nodeRows;
let connectivityQueries;

beforeEach(() => {
  jest.clearAllMocks();
  connectivityQueries = 0;
  nodeRows = [
    { id: 1, node_type: 'action', node_subtype: 'select_zalo_account', config: { zaloAccountId: 5 } },
    { id: 2, node_type: 'action', node_subtype: 'send_zalo_personal', config: {} },
  ];
  mockFindAssigned.mockResolvedValue([5]);
  mockQuery.mockImplementation(async (sql, params) => {
    const text = String(sql);
    if (/FROM campaign_nodes/.test(text)) return { rows: nodeRows };
    if (/FROM zalo_settings\s+WHERE id = ANY\(\$1::int\[\]\)/.test(text)) {
      connectivityQueries += 1;
      return { rows: (params[0] || []).map((id) => ({ id, is_active: true, status: 'connected' })) };
    }
    if (/SELECT role FROM users/.test(text)) return { rows: [{ role: 'user' }] };
    if (/FROM zalo_settings WHERE id = ANY/.test(text)) return { rows: (params[0] || []).map((id) => ({ id, display_name: `Nick ${id}`, zalo_name: null })) };
    if (/FROM users WHERE id = ANY/.test(text)) return { rows: (params[0] || []).map((id) => ({ id, full_name: `NV ${id}`, username: `u${id}` })) };
    throw new Error(`unexpected sql: ${text}`);
  });
});

describe('validateCampaignPreflight — tài khoản Zalo được giao (G3)', () => {
  it('nhân viên bấm chạy, tài khoản được giao → qua, đi tiếp kiểm kết nối', async () => {
    await expect(validateCampaignPreflight({ campaignId: 10, workspaceOwnerId: OWNER, actorUserIds: [EMP, OWNER] }))
      .resolves.toMatchObject({ valid: true });
    expect(mockFindAssigned).toHaveBeenCalledWith(OWNER, EMP);
    expect(connectivityQueries).toBe(1);
  });

  it('nhân viên bấm chạy, tài khoản CHƯA giao → 403 ZALO_ACCOUNT_NOT_ASSIGNED kèm tên tài khoản + nhân viên, TRƯỚC kiểm kết nối', async () => {
    mockFindAssigned.mockResolvedValue([6]);
    const error = await validateCampaignPreflight({ campaignId: 10, workspaceOwnerId: OWNER, actorUserIds: [EMP] }).catch((e) => e);
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe('ZALO_ACCOUNT_NOT_ASSIGNED');
    expect(error.message).toContain('Tài khoản Zalo "Nick 5" chưa được giao cho nhân viên "NV 20"');
    expect(connectivityQueries).toBe(0);
  });

  it('CHỦ tạo + CHỦ chạy → không lọc, không đọc bảng giao', async () => {
    mockFindAssigned.mockResolvedValue([]);
    await expect(validateCampaignPreflight({ campaignId: 10, workspaceOwnerId: OWNER, actorUserIds: [OWNER, OWNER] }))
      .resolves.toMatchObject({ valid: true });
    expect(mockFindAssigned).not.toHaveBeenCalled();
  });

  it('CHỦ bấm chạy chiến dịch do NHÂN VIÊN tạo (nhân viên đã bị gỡ tài khoản): người kích hoạt là chủ → QUA, không đọc bảng giao', async () => {
    // Callers chỉ truyền NGƯỜI KÍCH HOẠT ([chủ]); người tạo chiến dịch không còn nằm trong danh sách kiểm.
    mockFindAssigned.mockResolvedValue([]);
    await expect(validateCampaignPreflight({ campaignId: 10, workspaceOwnerId: OWNER, actorUserIds: [OWNER] }))
      .resolves.toMatchObject({ valid: true });
    expect(mockFindAssigned).not.toHaveBeenCalled();
  });

  it('nhân viên B kích hoạt chiến dịch của nhân viên A: kiểm theo B', async () => {
    mockFindAssigned.mockImplementation(async (_o, employeeId) => (employeeId === CREATOR ? [5] : []));
    await expect(validateCampaignPreflight({ campaignId: 10, workspaceOwnerId: OWNER, actorUserIds: [EMP] }))
      .rejects.toMatchObject({ code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
    expect(mockFindAssigned).toHaveBeenCalledWith(OWNER, EMP);
    expect(mockFindAssigned).not.toHaveBeenCalledWith(OWNER, CREATOR);
    await expect(validateCampaignPreflight({ campaignId: 10, workspaceOwnerId: OWNER, actorUserIds: [CREATOR] }))
      .resolves.toMatchObject({ valid: true });
  });

  it('nhân viên bấm chạy chiến dịch của CHỦ dùng tài khoản nhân viên chưa có → 403 (nhân viên có campaigns_run không lách được)', async () => {
    mockFindAssigned.mockResolvedValue([]);
    await expect(validateCampaignPreflight({ campaignId: 10, workspaceOwnerId: OWNER, actorUserIds: [EMP, OWNER] }))
      .rejects.toMatchObject({ code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
  });

  it('nhân viên ĐÃ BỊ XOÁ (không còn hàng giao) → 403', async () => {
    mockFindAssigned.mockResolvedValue([]);
    await expect(validateCampaignPreflight({ campaignId: 10, workspaceOwnerId: OWNER, actorUserIds: [CREATOR] }))
      .rejects.toMatchObject({ code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
  });

  it('POOL: MỌI tài khoản trong pool phải được giao (không âm thầm co pool lại)', async () => {
    nodeRows = [{
      id: 1, node_type: 'action', node_subtype: 'select_zalo_account',
      config: { zaloPoolMultiAccountEnabled: true, zaloPoolAccountIds: ['5', '6'] },
    }, { id: 2, node_type: 'action', node_subtype: 'send_zalo_personal', config: {} }];
    mockFindAssigned.mockResolvedValue([5]);
    await expect(validateCampaignPreflight({ campaignId: 10, workspaceOwnerId: OWNER, actorUserIds: [EMP] }))
      .rejects.toMatchObject({ code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
    mockFindAssigned.mockResolvedValue([5, 6]);
    await expect(validateCampaignPreflight({ campaignId: 10, workspaceOwnerId: OWNER, actorUserIds: [EMP] }))
      .resolves.toMatchObject({ valid: true });
  });

  it('hai nhân viên (người tạo + người bấm chạy): tài khoản phải được giao cho CẢ HAI', async () => {
    mockFindAssigned.mockImplementation(async (_o, employeeId) => (employeeId === EMP ? [5] : []));
    await expect(validateCampaignPreflight({ campaignId: 10, workspaceOwnerId: OWNER, actorUserIds: [EMP, CREATOR] }))
      .rejects.toMatchObject({ code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
  });

  it('FAIL-CLOSED: đọc bảng giao lỗi → 403, không cho qua', async () => {
    mockFindAssigned.mockRejectedValue(new Error('db down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(validateCampaignPreflight({ campaignId: 10, workspaceOwnerId: OWNER, actorUserIds: [EMP] }))
      .rejects.toMatchObject({ code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
  });

  it('không truyền actorUserIds (người gọi cũ) → không kiểm giao ở preflight (engine kiểm lại ở đầu mỗi chu kỳ)', async () => {
    mockFindAssigned.mockResolvedValue([]);
    await expect(validateCampaignPreflight({ campaignId: 10, workspaceOwnerId: OWNER })).resolves.toMatchObject({ valid: true });
    expect(mockFindAssigned).not.toHaveBeenCalled();
  });

  it('chiến dịch chỉ email → nhân viên qua, không đọc bảng giao', async () => {
    nodeRows = [{ id: 1, node_type: 'action', node_subtype: 'send_email', config: {} }];
    await expect(validateCampaignPreflight({ campaignId: 10, workspaceOwnerId: OWNER, actorUserIds: [EMP] }))
      .resolves.toMatchObject({ valid: true });
    expect(mockFindAssigned).not.toHaveBeenCalled();
  });
});
