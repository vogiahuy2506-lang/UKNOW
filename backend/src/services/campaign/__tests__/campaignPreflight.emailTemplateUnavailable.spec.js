/**
 * PLAN_VA_CO_LAP_DU_LIEU_TENANT_DOT2 A1 — preflight chặn node gửi email trỏ mẫu không tồn tại / không thuộc chủ chiến dịch
 * (EMAIL_TEMPLATE_UNAVAILABLE, 400). Chỉ SQL đọc node được mock; kiểm "mẫu còn và thuộc chủ" đi qua hàm tiêm
 * `findAvailableEmailTemplateIdsFn` (SQL thật được kiểm ở integration emailTemplateCoLapChuTenantDot2.test.js).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockQuery = jest.fn();
jest.unstable_mockModule('../../../config/database.js', () => ({ default: { query: mockQuery } }));
jest.unstable_mockModule('../../../utils/topupLockGate.util.js', () => ({ resourceIsLocked: jest.fn(async () => false) }));
jest.unstable_mockModule('../channelEntitlement.service.js', () => ({
  assertChannelEntitled: jest.fn(async () => undefined),
  default: { assertChannelEntitled: jest.fn(async () => undefined) },
}));

const { validateCampaignPreflight } = await import('../campaignPreflight.service.js');

const emailNode = (id, config, name = `Gửi email ${id}`) => ({
  id: String(id), node_type: 'action', node_subtype: 'send_email', node_name: name, execution_order: id, config,
});

let nodeRows;
beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockImplementation(async (sql) => {
    if (/FROM campaign_nodes/.test(String(sql))) return { rows: nodeRows };
    throw new Error(`unexpected sql: ${sql}`);
  });
});

const run = (findAvailableEmailTemplateIdsFn) => validateCampaignPreflight({ campaignId: 10, workspaceOwnerId: 7, findAvailableEmailTemplateIdsFn });

describe('validateCampaignPreflight — EMAIL_TEMPLATE_UNAVAILABLE', () => {
  it('mẫu không thuộc chủ / đã xoá (không nằm trong tập còn khả dụng) -> 400, message nêu TÊN node và hướng dẫn chọn lại mẫu', async () => {
    nodeRows = [emailNode(4, { emailTemplateId: 55, recipientSource: 'manual' }, 'Email chào mừng')];
    const find = jest.fn(async () => new Set());

    const error = await run(find).catch((e) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('EMAIL_TEMPLATE_UNAVAILABLE');
    expect(error.statusCode).toBe(400);
    expect(error.message).toContain('"Email chào mừng" (node 4)');
    expect(error.message).toContain('chọn lại mẫu email');
    expect(error.details).toEqual([{ nodeId: '4', nodeName: 'Email chào mừng', templateIds: ['55'] }]);
    expect(find).toHaveBeenCalledTimes(1);
    expect(find).toHaveBeenCalledWith([55], 10);
  });

  it('MỘT truy vấn cho mọi id của mọi node (gồm các bước email), id trùng chỉ hỏi một lần', async () => {
    nodeRows = [
      emailNode(1, { emailSteps: [{ templateId: 3 }, { templateId: 4 }] }),
      emailNode(2, { emailTemplateId: 3 }),
    ];
    const find = jest.fn(async () => new Set([3, 4]));

    await expect(run(find)).resolves.toMatchObject({ valid: true });

    expect(find).toHaveBeenCalledTimes(1);
    expect(find.mock.calls[0][0].sort()).toEqual([3, 4]);
  });

  it('chỉ MỘT bước trỏ mẫu hỏng cũng chặn, details nêu đúng id hỏng', async () => {
    nodeRows = [emailNode(1, { emailSteps: [{ templateId: 3 }, { templateId: 4 }] }, 'Chuỗi email')];

    const error = await run(async () => new Set([3])).catch((e) => e);

    expect(error.code).toBe('EMAIL_TEMPLATE_UNAVAILABLE');
    expect(error.details).toEqual([{ nodeId: '1', nodeName: 'Chuỗi email', templateIds: ['4'] }]);
  });

  it('nhiều node hỏng -> thông điệp liệt kê tất cả', async () => {
    nodeRows = [emailNode(1, { emailTemplateId: 3 }, 'A'), emailNode(2, { emailTemplateId: 4 }, 'B')];

    const error = await run(async () => new Set()).catch((e) => e);

    expect(error.message).toContain('"A" (node 1)');
    expect(error.message).toContain('"B" (node 2)');
    expect(error.details).toHaveLength(2);
  });

  it('id không phải số -> coi như mẫu không tồn tại, KHÔNG hỏi DB cho id đó', async () => {
    nodeRows = [emailNode(1, { emailTemplateId: 'abc' })];
    const find = jest.fn(async () => new Set());

    const error = await run(find).catch((e) => e);

    expect(error.code).toBe('EMAIL_TEMPLATE_UNAVAILABLE');
    expect(find).not.toHaveBeenCalled();
  });

  it('node KHÔNG có templateId (nội dung soạn thẳng trong config) -> qua, không truy vấn mẫu', async () => {
    nodeRows = [emailNode(1, { emailSubject: 'Chào', emailBody: '<p>x</p>', recipientSource: 'manual' })];
    const find = jest.fn();

    await expect(run(find)).resolves.toMatchObject({ valid: true });

    expect(find).not.toHaveBeenCalled();
  });

  it('mẫu cấp node cũ/đã xoá nhưng mọi bước hợp lệ đều trỏ mẫu còn sống -> qua (engine chỉ dùng các bước)', async () => {
    nodeRows = [emailNode(1, { emailTemplateId: 999, emailSteps: [{ templateId: 3 }] })];
    const find = jest.fn(async () => new Set([3]));

    await expect(run(find)).resolves.toMatchObject({ valid: true });

    expect(find).toHaveBeenCalledWith([3], 10);
  });

  it('node không phải send_email (vd. Zalo có templateId riêng) không bị kiểm mẫu email', async () => {
    nodeRows = [{ id: '1', node_type: 'action', node_subtype: 'send_zalo_personal', node_name: 'Zalo', config: { emailTemplateId: 77, zaloAccountId: 5 } }];
    const find = jest.fn();

    // Preflight dừng ở bước Zalo phía sau (thiếu mock) — chỉ cần chắc lỗi (nếu có) không phải EMAIL_TEMPLATE_UNAVAILABLE.
    const error = await run(find).catch((e) => e);

    expect(error?.code).not.toBe('EMAIL_TEMPLATE_UNAVAILABLE');
    expect(find).not.toHaveBeenCalled();
  });
});
