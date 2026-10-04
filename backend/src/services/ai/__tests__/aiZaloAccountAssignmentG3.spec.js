/**
 * PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G3 — trợ lý AI: nhân viên chỉ thấy / dùng tài khoản Zalo ĐƯỢC GIAO.
 * Ba lớp được ghim ở đây: (1) bốn hàm repo lọc NGAY TRONG SQL (trước LIMIT), (2) cổng wizard kiểm lại `senderAccountId` đã lưu
 * khi danh sách đã bị lọc, (3) bản nháp gỡ id chưa giao. Mỗi nhóm có ca "chủ thấy hết" và ca "hỏng thì chặn".
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockDbQuery = jest.fn();
jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query: mockDbQuery, getClient: jest.fn() },
  isConnectionError: jest.fn(() => false),
}));

const { default: aiCampaignRepository } = await import('../../../repositories/ai/aiCampaign.repository.js');
const { default: aiCampaignDraftRepository } = await import('../../../repositories/ai/aiCampaignDraft.repository.js');
const { default: aiPromptResources } = await import('../aiPromptResources.service.js');
const wizard = await import('../aiCampaignWizard.service.js');
const { stripZaloAccountIdsNotAccessible } = await import('../../../utils/campaignZaloAccountResolve.util.js');

const sqlOf = (n = 0) => String(mockDbQuery.mock.calls[n][0]);
const paramsOf = (n = 0) => mockDbQuery.mock.calls[n][1];

describe('4 hàm repo tài khoản / mặc định Zalo của trợ lý lọc theo việc giao (SQL)', () => {
  beforeEach(() => {
    mockDbQuery.mockReset();
    mockDbQuery.mockResolvedValue({ rows: [{ id: 5, display_name: 'A', zalo_name: 'a', status: 'connected' }] });
  });

  it.each([
    ['getZaloAccounts', () => aiCampaignRepository.getZaloAccounts(3, [5, 6])],
    ['getZaloAccountsFull', () => aiCampaignRepository.getZaloAccountsFull(3, [5, 6])],
    ['getDefaultZaloAccountId', () => aiCampaignRepository.getDefaultZaloAccountId(3, [5, 6])],
    ['findDefaultZaloSettingId', () => aiCampaignDraftRepository.findDefaultZaloSettingId(3, [5, 6])],
  ])('%s: nhân viên → tham số 2 là mảng được giao, điều kiện id = ANY nằm trong WHERE', async (_name, call) => {
    await call();
    expect(paramsOf()).toEqual([3, [5, 6]]);
    expect(sqlOf()).toMatch(/\$2::bigint\[\] IS NULL OR id = ANY\(\$2::bigint\[\]\)/);
  });

  it.each([
    ['getZaloAccounts', () => aiCampaignRepository.getZaloAccounts(3)],
    ['getZaloAccountsFull', () => aiCampaignRepository.getZaloAccountsFull(3, null)],
    ['getDefaultZaloAccountId', () => aiCampaignRepository.getDefaultZaloAccountId(3)],
    ['findDefaultZaloSettingId', () => aiCampaignDraftRepository.findDefaultZaloSettingId(3, null)],
  ])('%s: CHỦ (bỏ trống / null) → tham số 2 là null = không lọc', async (_name, call) => {
    await call();
    expect(paramsOf()).toEqual([3, null]);
  });

  it.each([
    ['getZaloAccounts', () => aiCampaignRepository.getZaloAccounts(3, [])],
    ['getZaloAccountsFull', () => aiCampaignRepository.getZaloAccountsFull(3, [])],
    ['getDefaultZaloAccountId', () => aiCampaignRepository.getDefaultZaloAccountId(3, [])],
    ['findDefaultZaloSettingId', () => aiCampaignDraftRepository.findDefaultZaloSettingId(3, [])],
  ])('%s: nhân viên chưa được giao gì → mảng RỖNG (không bị đổi thành null)', async (_name, call) => {
    await call();
    expect(paramsOf()[1]).toEqual([]);
  });

  it('getZaloAccounts: lọc việc giao nằm TRƯỚC LIMIT 5 (lọc sau LIMIT làm nhân viên được giao nick cũ không thấy gì)', async () => {
    await aiCampaignRepository.getZaloAccounts(3, [5]);
    const sql = sqlOf();
    expect(sql.indexOf('id = ANY($2::bigint[])')).toBeGreaterThan(-1);
    expect(sql.indexOf('id = ANY($2::bigint[])')).toBeLessThan(sql.indexOf('LIMIT 5'));
  });
});

describe('aiPromptResources — truyền danh sách được giao xuống repo, lỗi → [] (không lộ nhầm)', () => {
  beforeEach(() => {
    mockDbQuery.mockReset();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('getZaloAccounts / getZaloAccountsFull chuyển accessibleIds xuống repo', async () => {
    mockDbQuery.mockResolvedValue({ rows: [{ id: 5, display_name: 'A', zalo_name: 'a', status: 'connected', is_active: true, is_default: true }] });
    const list = await aiPromptResources.getZaloAccounts(3, [5]);
    expect(list).toEqual([{ id: 5, displayName: 'A', zaloName: 'a', status: 'connected' }]);
    expect(paramsOf(0)).toEqual([3, [5]]);
    await aiPromptResources.getZaloAccountsFull(3, [5]);
    expect(paramsOf(1)).toEqual([3, [5]]);
  });

  it('getZaloGroups: tài khoản mặc định lấy TRONG danh sách được giao; không có tài khoản nào → [] và không đụng bảng nhóm', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    expect(await aiPromptResources.getZaloGroups(3, [])).toEqual([]);
    expect(mockDbQuery).toHaveBeenCalledTimes(1);
    expect(paramsOf(0)).toEqual([3, []]);

    mockDbQuery.mockReset();
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: 6 }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, group_id: 'g', group_name: 'Nhóm', member_count: 2 }] });
    const groups = await aiPromptResources.getZaloGroups(3, [6]);
    expect(paramsOf(0)).toEqual([3, [6]]);
    expect(paramsOf(1)).toEqual([6]);
    expect(groups).toHaveLength(1);
  });

  it('getRecommendedCampaignType (ngành B2C): có tài khoản được giao → gợi ý Zalo; nhân viên chưa được giao gì → KHÔNG gợi ý Zalo', async () => {
    // DB giả đúng nghĩa lọc: mảng rỗng → không hàng, mảng có id → một hàng.
    mockDbQuery.mockImplementation(async (sql, params) => {
      if (/FROM zalo_settings/.test(String(sql))) {
        return { rows: Array.isArray(params?.[1]) && params[1].length === 0 ? [] : [{ id: 5, display_name: 'A', zalo_name: 'a', status: 'connected' }] };
      }
      return { rows: [] };
    });
    const { default: businessProfileService } = await import('../businessProfile.service.js');
    const { default: productRepository } = await import('../../../repositories/products/product.repository.js');
    jest.spyOn(businessProfileService, 'getProfile').mockResolvedValue({ industry: 'b2c retail', target_audience: '' });
    jest.spyOn(productRepository, 'findAllByUser').mockResolvedValue([]);
    expect(await aiPromptResources.getRecommendedCampaignType(3, [5])).toBe('zalo');
    expect(await aiPromptResources.getRecommendedCampaignType(3, [])).toBe('mixed');
    expect(await aiPromptResources.getRecommendedCampaignType(3, null)).toBe('zalo');
  });

  it('lỗi DB → [] cho cả hai danh sách (tầng service nuốt lỗi, nhưng KHÔNG trả null / danh sách đầy)', async () => {
    mockDbQuery.mockRejectedValue(new Error('db down'));
    expect(await aiPromptResources.getZaloAccounts(3, [5])).toEqual([]);
    expect(await aiPromptResources.getZaloAccountsFull(3, [5])).toEqual([]);
  });
});

describe('cổng wizard — kiểm lại senderAccountId khi danh sách đã lọc theo việc giao', () => {
  const baseState = (over = {}) => ({
    ...wizard.createEmptyWizardState(),
    isCampaignFlow: true,
    channel: 'zalo',
    ...over,
  });
  const ACCOUNT_6 = { id: 6, displayName: 'Nick 6', status: 'connected', isActive: true };

  it('nhân viên CHƯA được giao tài khoản nào → thẻ "chưa được giao" (không phải thẻ quét QR "mất kết nối")', () => {
    const gate = wizard.evaluateNextGate(baseState(), { zaloAccounts: [], zaloAccessRestricted: true }, 'vi');
    expect(gate.gate).toBe('senderAccount');
    expect(gate.response.type).toBe('text');
    expect(gate.response.data).toEqual({ zaloNotAssigned: true });
    expect(gate.response.content).toContain('chưa được giao tài khoản Zalo nào');
    expect(gate.response.type).not.toBe('zalo_qr_login');
  });

  it('nhân viên chưa được giao gì NHƯNG marker mang sẵn senderAccountId (giả / giữ từ lượt trước) → vẫn bị chặn, KHÔNG coi "danh sách rỗng" là hợp lệ', () => {
    const gate = wizard.evaluateNextGate(baseState({ senderAccountId: 5 }), { zaloAccounts: [], zaloAccessRestricted: true }, 'vi');
    expect(gate.gate).toBe('senderAccount');
    expect(gate.response.data).toEqual({ zaloNotAssigned: true });
  });

  it('nhân viên được giao [6] mà senderAccountId = 5 (chưa giao) → hỏi lại bằng thẻ chọn trong danh sách được giao, không đi tiếp', () => {
    const gate = wizard.evaluateNextGate(
      baseState({ senderAccountId: 5 }),
      { zaloAccounts: [ACCOUNT_6], zaloAccessRestricted: true },
      'vi'
    );
    expect(gate.gate).toBe('senderAccount');
    expect(gate.response.type).toBe('ask_sender_account');
    expect(gate.response.data.accounts.map((a) => a.id)).toEqual([6]);
  });

  it('nhân viên được giao [6] và senderAccountId = 6 → qua cổng sender, sang cổng kế (nguồn dữ liệu)', () => {
    const gate = wizard.evaluateNextGate(
      baseState({ senderAccountId: 6 }),
      { zaloAccounts: [ACCOUNT_6], zaloAccessRestricted: true },
      'vi'
    );
    expect(gate.gate).toBe('dataSource');
  });

  it('CHỦ (không lọc) chưa kết nối tài khoản nào: hành vi cũ giữ nguyên — id đã chọn vẫn qua cổng, chưa chọn thì ra thẻ quét QR', () => {
    const passed = wizard.evaluateNextGate(baseState({ senderAccountId: 5 }), { zaloAccounts: [], zaloAccessRestricted: false }, 'vi');
    expect(passed.gate).toBe('dataSource');
    const qr = wizard.evaluateNextGate(baseState(), { zaloAccounts: [] }, 'vi');
    expect(qr.response.type).toBe('zalo_qr_login');
  });

  it('kênh EMAIL không bị ảnh hưởng bởi cờ lọc Zalo', () => {
    const gate = wizard.evaluateNextGate(
      baseState({ channel: 'email', senderAccountId: 7 }),
      { emailSenders: [{ id: 7, name: 'Shop', status: 'active' }], zaloAccounts: [], zaloAccessRestricted: true },
      'vi'
    );
    expect(gate.gate).toBe('dataSource');
  });

  it('buildZaloNotAssignedGuide có bản tiếng Anh', () => {
    expect(wizard.buildZaloNotAssignedGuide('en').content).toContain('Ask the account owner to assign one');
  });
});

describe('stripZaloAccountIdsNotAccessible', () => {
  const node = (subtype, config) => ({ nodeSubtype: subtype, config });

  it('chủ (null / undefined) → không đụng gì', () => {
    const nodes = [node('send_zalo_personal', { zaloAccountId: 9 })];
    expect(stripZaloAccountIdsNotAccessible(nodes, null)).toEqual([]);
    expect(stripZaloAccountIdsNotAccessible(nodes, undefined)).toEqual([]);
    expect(nodes[0].config.zaloAccountId).toBe(9);
  });

  it('gỡ id chưa giao ở id đơn và trong danh sách pool / nhiều tài khoản, giữ id được giao, trả danh sách đã gỡ', () => {
    const nodes = [
      node('select_zalo_account', { zaloAccountId: 9, zaloPoolAccountIds: ['5', 6, 9] }),
      node('send_zalo_personal', { zaloPersonalAccountIds: [6, 7], zaloAccountId: '6' }),
      node('get_all_friends', { zaloAccountId: 7 }),
    ];
    const removed = stripZaloAccountIdsNotAccessible(nodes, [6]);
    expect(removed.sort()).toEqual([5, 7, 9]);
    expect(nodes[0].config.zaloAccountId).toBeUndefined();
    expect(nodes[0].config.zaloPoolAccountIds).toEqual([6]);
    expect(nodes[1].config.zaloPersonalAccountIds).toEqual([6]);
    expect(nodes[1].config.zaloAccountId).toBe('6');
    expect(nodes[2].config.zaloAccountId).toBeUndefined();
  });

  it('nhân viên chưa được giao gì ([]) → gỡ hết', () => {
    const nodes = [node('send_zalo_group', { zaloAccountId: 5 })];
    expect(stripZaloAccountIdsNotAccessible(nodes, [])).toEqual([5]);
    expect(nodes[0].config).toEqual({});
  });

  it('"5abc" cũng bị coi là 5 (cùng phép đọc parseInt với engine)', () => {
    const nodes = [node('send_zalo_group', { zaloAccountId: '5abc' })];
    expect(stripZaloAccountIdsNotAccessible(nodes, [6])).toEqual([5]);
    expect(nodes[0].config.zaloAccountId).toBeUndefined();
  });

  it('node không phải Zalo (email, telegram) không bị đụng', () => {
    const nodes = [node('send_email', { zaloAccountId: 5 }), node('send_telegram', { telegramAccountId: 3 })];
    expect(stripZaloAccountIdsNotAccessible(nodes, [])).toEqual([]);
    expect(nodes[0].config.zaloAccountId).toBe(5);
  });
});
