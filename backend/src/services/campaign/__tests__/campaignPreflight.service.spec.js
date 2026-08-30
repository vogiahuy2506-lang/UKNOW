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
