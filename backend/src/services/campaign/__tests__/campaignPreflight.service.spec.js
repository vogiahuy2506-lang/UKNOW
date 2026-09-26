import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockResourceIsLocked = jest.fn(async () => false);

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: {
    query: mockQuery,
  },
}));

jest.unstable_mockModule('../../../utils/topupLockGate.util.js', () => ({
  resourceIsLocked: mockResourceIsLocked,
}));

const { validateCampaignPreflight } = await import('../campaignPreflight.service.js');

describe('validateCampaignPreflight service (PR-A3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResourceIsLocked.mockResolvedValue(false);
  });

  it('rejects with NO_SEND_NODE when campaign has 0 send nodes', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 1, node_type: 'trigger', node_subtype: 'manual_trigger', config: {} },
        { id: 2, node_type: 'data', node_subtype: 'read_sheet', config: { sheetUrl: 'https://docs.google.com/spreadsheets/d/123/edit' } },
      ],
    });

    await expect(validateCampaignPreflight({ campaignId: 10, workspaceOwnerId: 1 })).rejects.toMatchObject({
      code: 'NO_SEND_NODE',
      statusCode: 400,
    });
  });

  /**
   * Bộ test này mock trọn `db.query`, nên tên cột sai vẫn xanh: bản đầu PR-A3 viết
   * `WHERE campaign_id = $1` trong khi cột thật là `id_campaign`, và hậu quả là MỌI lần
   * chạy chiến dịch đều 400 (lỗi Postgres 42703 rơi vào catch của controller).
   * Khoá lại hình dạng câu SQL — cùng cách `campaignApprovalThreshold.spec.js:265` đang làm.
   */
  it('truy vấn campaign_nodes theo đúng cột id_campaign', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, node_type: 'action', node_subtype: 'send_email', config: {} }],
    });

    await validateCampaignPreflight({ campaignId: 10 });

    expect(mockQuery.mock.calls[0][0]).toMatch(/FROM campaign_nodes\s+WHERE id_campaign = \$1/i);
    expect(mockQuery.mock.calls[0][0]).not.toMatch(/campaign_id/i);
  });

  it('rejects with SENDER_DISCONNECTED when Zalo account is disconnected or inactive', async () => {
    mockQuery
      // 1. Get campaign nodes
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            node_type: 'action',
            node_subtype: 'send_zalo_personal',
            config: { zaloAccountId: 99 },
          },
        ],
      })
      // 2. Query zalo_settings
      .mockResolvedValueOnce({
        rows: [
          { id: 99, is_active: true, status: 'disconnected' },
        ],
      });

    await expect(validateCampaignPreflight({ campaignId: 10, workspaceOwnerId: 1 })).rejects.toMatchObject({
      code: 'SENDER_DISCONNECTED',
      statusCode: 400,
    });
  });

  it('passes when Zalo account is connected and active', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            node_type: 'action',
            node_subtype: 'send_zalo_personal',
            config: { zaloAccountId: 99 },
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { id: 99, is_active: true, status: 'connected' },
        ],
      });

    const result = await validateCampaignPreflight({ campaignId: 10, workspaceOwnerId: 1 });
    expect(result.valid).toBe(true);
    expect(mockQuery.mock.calls[1][0]).toMatch(/id_user = \$2/i);
    expect(mockQuery.mock.calls[1][1]).toEqual([[99], 1]);
  });

  it('rejects with SENDER_DISCONNECTED when a Zalo send node has no selected account', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, node_type: 'action', node_subtype: 'send_zalo_personal', config: {} }],
    });

    await expect(validateCampaignPreflight({ campaignId: 10, workspaceOwnerId: 1 })).rejects.toMatchObject({
      code: 'SENDER_DISCONNECTED',
      statusCode: 400,
    });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('rejects with SENDER_DISCONNECTED when the selected Zalo account is top-up locked', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 1, node_type: 'action', node_subtype: 'send_zalo_personal', config: { zaloAccountId: 99 } }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 99, is_active: true, status: 'connected' }],
      });
    mockResourceIsLocked.mockResolvedValueOnce(true);

    await expect(validateCampaignPreflight({ campaignId: 10, workspaceOwnerId: 1 })).rejects.toMatchObject({
      code: 'SENDER_DISCONNECTED',
      statusCode: 400,
    });
  });

  // PR-4 (PLAN_ON_DINH_GUI_CHIEN_DICH_2026-09-26) Việc 2 — kiểm đúng id engine thật sự dùng
  describe('select_zalo_account pool — Việc 2', () => {
    // A = tài khoản 201, B = tài khoản 202 (id phải là số nguyên như production, khớp
    // parseInt(rawId, 10) trong addZaloAccountId).
    it('pool [A disconnected, B connected] → kiểm poolIds[0]=A → SENDER_DISCONNECTED', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            node_type: 'action',
            node_subtype: 'select_zalo_account',
            config: { zaloPoolMultiAccountEnabled: true, zaloPoolAccountIds: [201, 202], zaloAccountId: 201 },
          }, {
            id: 2,
            node_type: 'action',
            node_subtype: 'send_zalo_personal',
            config: {},
          }],
        })
        .mockResolvedValueOnce({
          rows: [
            { id: 201, is_active: true, status: 'disconnected' },
            { id: 202, is_active: true, status: 'connected' },
          ],
        });

      await expect(validateCampaignPreflight({ campaignId: 10, workspaceOwnerId: 1 })).rejects.toMatchObject({
        code: 'SENDER_DISCONNECTED',
        statusCode: 400,
      });
    });

    it('pool [B connected, A disconnected] với zaloAccountId sót = A trên node → kiểm poolIds[0]=B → qua', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            node_type: 'action',
            node_subtype: 'select_zalo_account',
            config: { zaloPoolMultiAccountEnabled: true, zaloPoolAccountIds: [202, 201], zaloAccountId: 201 },
          }, {
            id: 2,
            node_type: 'action',
            node_subtype: 'send_zalo_personal',
            config: {},
          }],
        })
        .mockResolvedValueOnce({
          rows: [
            { id: 202, is_active: true, status: 'connected' },
            { id: 201, is_active: true, status: 'disconnected' },
          ],
        });

      const result = await validateCampaignPreflight({ campaignId: 10, workspaceOwnerId: 1 });
      expect(result.valid).toBe(true);
      // KHÔNG được kiểm A=201 (id còn sót trên node select_zalo_account) — chỉ poolIds[0]=B=202.
      expect(mockQuery.mock.calls[1][1][0]).toEqual([202]);
    });

    it('send_zalo_personal có zaloAccountId riêng nhưng flow CÓ select_zalo_account → bỏ qua id riêng, chỉ kiểm id của select_zalo_account', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            node_type: 'action',
            node_subtype: 'select_zalo_account',
            config: { zaloAccountId: 202 },
          }, {
            id: 2,
            node_type: 'action',
            node_subtype: 'send_zalo_personal',
            config: { zaloAccountId: 201 }, // id riêng còn sót — engine sẽ dùng selectedZaloAccount (202), không phải 201
          }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 202, is_active: true, status: 'connected' }],
        });

      const result = await validateCampaignPreflight({ campaignId: 10, workspaceOwnerId: 1 });
      expect(result.valid).toBe(true);
      expect(mockQuery.mock.calls[1][1][0]).toEqual([202]);
    });
  });

  describe('get_all_groups / get_all_friends — Việc 2', () => {
    it('get_all_groups tự chọn tài khoản disconnected (không có select_zalo_account trong flow) → SENDER_DISCONNECTED', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            node_type: 'action',
            node_subtype: 'get_all_groups',
            config: { zaloAccountId: 99 },
          }, {
            id: 2,
            node_type: 'action',
            node_subtype: 'send_zalo_group',
            config: { zaloAccountId: 99 },
          }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 99, is_active: true, status: 'disconnected' }],
        });

      await expect(validateCampaignPreflight({ campaignId: 10, workspaceOwnerId: 1 })).rejects.toMatchObject({
        code: 'SENDER_DISCONNECTED',
        statusCode: 400,
      });
    });

    it('get_all_friends trỏ zaloFriendAccountNodeId tới node khác → KHÔNG kiểm zaloAccountId riêng (dù id đó trỏ tài khoản disconnected)', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            node_type: 'action',
            node_subtype: 'get_all_friends',
            config: { zaloFriendAccountNodeId: '5', zaloAccountId: 999 }, // 999 không phải id engine sẽ dùng
          }, {
            id: 2,
            node_type: 'action',
            node_subtype: 'send_zalo_personal',
            config: { zaloAccountId: 100 }, // id thật engine dùng, đang connected
          }],
        })
        .mockResolvedValueOnce({
          // Cố ý KHÔNG có id 999 — nếu code lỡ gom 999 thì accountMap.get(999) rỗng → throw SENDER_DISCONNECTED
          rows: [{ id: 100, is_active: true, status: 'connected' }],
        });

      const result = await validateCampaignPreflight({ campaignId: 10, workspaceOwnerId: 1 });
      expect(result.valid).toBe(true);
      expect(mockQuery.mock.calls[1][1][0]).toEqual([100]);
    });
  });

  describe('Google Sheet Preflight Checks', () => {
    const makeSheetScenario = (sheetStatus, sheetExtra = {}) => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            node_type: 'data',
            node_subtype: 'read_sheet',
            config: { sheetUrl: 'https://docs.google.com/spreadsheets/d/123/edit' },
          },
          {
            id: 2,
            node_type: 'action',
            node_subtype: 'send_zalo_personal',
            config: { zaloAccountId: 99 },
          },
        ],
      }).mockResolvedValueOnce({
        rows: [{ id: 99, is_active: true, status: 'connected' }],
      });

      const mockSheetCheck = jest.fn().mockResolvedValue({
        status: sheetStatus,
        ...sheetExtra,
      });

      return mockSheetCheck;
    };

    it('rejects with SHEET_NOT_ACCESSIBLE when sheet is not public', async () => {
      const mockSheetCheck = makeSheetScenario('not_public');
      await expect(
        validateCampaignPreflight({ campaignId: 10, workspaceOwnerId: 1, sheetCheckFn: mockSheetCheck })
      ).rejects.toMatchObject({
        code: 'SHEET_NOT_ACCESSIBLE',
        statusCode: 400,
      });
    });

    it('rejects with SHEET_NOT_ACCESSIBLE when sheet URL is invalid', async () => {
      const mockSheetCheck = makeSheetScenario('invalid_url');
      await expect(
        validateCampaignPreflight({ campaignId: 10, workspaceOwnerId: 1, sheetCheckFn: mockSheetCheck })
      ).rejects.toMatchObject({
        code: 'SHEET_NOT_ACCESSIBLE',
        statusCode: 400,
      });
    });

    it('rejects with RECIPIENT_COLUMN_MISSING when sheet lacks required contact column for channel', async () => {
      const mockSheetCheck = makeSheetScenario('wrong_channel');
      await expect(
        validateCampaignPreflight({ campaignId: 10, workspaceOwnerId: 1, sheetCheckFn: mockSheetCheck })
      ).rejects.toMatchObject({
        code: 'RECIPIENT_COLUMN_MISSING',
        statusCode: 400,
      });
    });

    it('rejects with ZERO_VALID_RECIPIENTS when sheet has no contact columns at all', async () => {
      const mockSheetCheck = makeSheetScenario('no_contact');
      await expect(
        validateCampaignPreflight({ campaignId: 10, workspaceOwnerId: 1, sheetCheckFn: mockSheetCheck })
      ).rejects.toMatchObject({
        code: 'ZERO_VALID_RECIPIENTS',
        statusCode: 400,
      });
    });

    it('rejects with RECIPIENTS_LIMIT_EXCEEDED when sheet exceeds recipient limit', async () => {
      const mockSheetCheck = makeSheetScenario('too_many', { totalCount: 1500, limit: 1000 });
      await expect(
        validateCampaignPreflight({ campaignId: 10, workspaceOwnerId: 1, sheetCheckFn: mockSheetCheck })
      ).rejects.toMatchObject({
        code: 'RECIPIENTS_LIMIT_EXCEEDED',
        statusCode: 400,
      });
    });

    it('allows campaign run when sheet check returns unknown (Google 5xx/timeout - transient error)', async () => {
      const mockSheetCheck = makeSheetScenario('unknown', { error: '504 Gateway Timeout' });
      const result = await validateCampaignPreflight({
        campaignId: 10,
        workspaceOwnerId: 1,
        sheetCheckFn: mockSheetCheck,
      });
      expect(result.valid).toBe(true);
    });

    it('allows campaign run when sheet check returns ok', async () => {
      const mockSheetCheck = makeSheetScenario('ok', { phoneCount: 50 });
      const result = await validateCampaignPreflight({
        campaignId: 10,
        workspaceOwnerId: 1,
        sheetCheckFn: mockSheetCheck,
      });
      expect(result.valid).toBe(true);
    });

    it('requires both email and phone columns when the campaign sends through both channels', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            { id: 1, node_type: 'data', node_subtype: 'read_sheet', config: { sheetUrl: 'https://docs.google.com/spreadsheets/d/123/edit' } },
            { id: 2, node_type: 'action', node_subtype: 'send_email', config: {} },
            { id: 3, node_type: 'action', node_subtype: 'send_zalo_personal', config: { zaloAccountId: 99 } },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 99, is_active: true, status: 'connected' }],
        });
      const mockSheetCheck = jest.fn()
        .mockResolvedValueOnce({ status: 'ok', emailCount: 3 })
        .mockResolvedValueOnce({ status: 'wrong_channel', emailCount: 3, phoneCount: 0 });

      await expect(
        validateCampaignPreflight({ campaignId: 10, workspaceOwnerId: 1, sheetCheckFn: mockSheetCheck })
      ).rejects.toMatchObject({
        code: 'RECIPIENT_COLUMN_MISSING',
        statusCode: 400,
      });
      expect(mockSheetCheck).toHaveBeenNthCalledWith(
        1,
        'https://docs.google.com/spreadsheets/d/123/edit',
        'email'
      );
      expect(mockSheetCheck).toHaveBeenNthCalledWith(
        2,
        'https://docs.google.com/spreadsheets/d/123/edit',
        'zalo'
      );
    });
  });
});
