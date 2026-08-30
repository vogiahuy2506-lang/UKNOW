import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();
const mockGetClient = jest.fn(async () => ({
  query: mockClientQuery,
  release: mockClientRelease,
}));

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: {
    getClient: mockGetClient,
    query: jest.fn(),
  },
}));

const mockFindCampaignByIdTx = jest.fn();
const mockHasRunningRunTx = jest.fn();
const mockUpdateCampaignFieldsTx = jest.fn();
const mockDeleteConnectionsByCampaignTx = jest.fn();
const mockDeleteNodesByCampaignTx = jest.fn();
const mockCountNodesByCampaignTx = jest.fn();
const mockInsertNodeTx = jest.fn();
const mockInsertConnectionTx = jest.fn();
const mockFindCampaignById = jest.fn();
const mockFindNodesByCampaignId = jest.fn();
const mockPublishCampaign = jest.fn();

jest.unstable_mockModule('../../../repositories/campaign/campaignCrud.repository.js', () => ({
  default: {
    findCampaignByIdTx: mockFindCampaignByIdTx,
    hasRunningRunTx: mockHasRunningRunTx,
    updateCampaignFieldsTx: mockUpdateCampaignFieldsTx,
    deleteConnectionsByCampaignTx: mockDeleteConnectionsByCampaignTx,
    deleteNodesByCampaignTx: mockDeleteNodesByCampaignTx,
    countNodesByCampaignTx: mockCountNodesByCampaignTx,
    insertNodeTx: mockInsertNodeTx,
    insertConnectionTx: mockInsertConnectionTx,
    findCampaignById: mockFindCampaignById,
    findNodesByCampaignId: mockFindNodesByCampaignId,
    publishCampaign: mockPublishCampaign,
  },
}));

const { default: campaignCrudService } = await import('../campaignCrud.service.js');

describe('campaignCrudService - CANNOT_EMPTY_ACTIVE_CAMPAIGN & CANNOT_ACTIVATE_EMPTY_CAMPAIGN (PR-A4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('updateCampaign', () => {
    it('rejects with 409 CANNOT_EMPTY_ACTIVE_CAMPAIGN when campaign is active and nodes is empty array', async () => {
      mockFindCampaignByIdTx.mockResolvedValueOnce({
        id: 10,
        status: 'active',
        campaign_name: 'Active Campaign',
      });
      mockHasRunningRunTx.mockResolvedValueOnce(false);
      mockUpdateCampaignFieldsTx.mockResolvedValueOnce({
        id: 10,
        campaign_name: 'Active Campaign',
        status: 'active',
      });
      mockCountNodesByCampaignTx.mockResolvedValueOnce(5); // currently has 5 nodes

      await expect(
        campaignCrudService.updateCampaign({
          campaignId: 10,
          authUser: { id: 1, role: 'user_admin' },
          isContentUpdate: false,
          nodes: [], // empty nodes
          connections: [],
        })
      ).rejects.toMatchObject({
        code: 'CANNOT_EMPTY_ACTIVE_CAMPAIGN',
        statusCode: 409,
      });

      expect(mockDeleteNodesByCampaignTx).not.toHaveBeenCalled();
      expect(mockDeleteConnectionsByCampaignTx).not.toHaveBeenCalled();
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('rejects with 409 CANNOT_ACTIVATE_EMPTY_CAMPAIGN when updating draft campaign with status: active and nodes: []', async () => {
      mockFindCampaignByIdTx.mockResolvedValueOnce({
        id: 10,
        status: 'draft',
        campaign_name: 'Draft Campaign',
      });
      mockHasRunningRunTx.mockResolvedValueOnce(false);
      mockUpdateCampaignFieldsTx.mockResolvedValueOnce({
        id: 10,
        campaign_name: 'Draft Campaign',
        status: 'active',
      });
      mockCountNodesByCampaignTx.mockResolvedValueOnce(5);

      await expect(
        campaignCrudService.updateCampaign({
          campaignId: 10,
          authUser: { id: 1, role: 'user_admin' },
          isContentUpdate: false,
          status: 'active',
          nodes: [], // emptying nodes and activating simultaneously
          connections: [],
        })
      ).rejects.toMatchObject({
        code: 'CANNOT_ACTIVATE_EMPTY_CAMPAIGN',
        statusCode: 409,
      });

      expect(mockDeleteNodesByCampaignTx).not.toHaveBeenCalled();
      expect(mockDeleteConnectionsByCampaignTx).not.toHaveBeenCalled();
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('rejects with 409 CANNOT_ACTIVATE_EMPTY_CAMPAIGN when activating 0-node draft campaign without sending nodes', async () => {
      mockFindCampaignByIdTx.mockResolvedValueOnce({
        id: 10,
        status: 'draft',
        campaign_name: 'Empty Draft Campaign',
      });
      mockHasRunningRunTx.mockResolvedValueOnce(false);
      mockUpdateCampaignFieldsTx.mockResolvedValueOnce({
        id: 10,
        campaign_name: 'Empty Draft Campaign',
        status: 'active',
      });
      mockCountNodesByCampaignTx.mockResolvedValueOnce(0); // 0 nodes in DB

      await expect(
        campaignCrudService.updateCampaign({
          campaignId: 10,
          authUser: { id: 1, role: 'user_admin' },
          isContentUpdate: false,
          status: 'active',
        })
      ).rejects.toMatchObject({
        code: 'CANNOT_ACTIVATE_EMPTY_CAMPAIGN',
        statusCode: 409,
      });

      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('allows emptying nodes when campaign is draft (and remaining draft)', async () => {
      mockFindCampaignByIdTx.mockResolvedValueOnce({
        id: 10,
        status: 'draft',
        campaign_name: 'Draft Campaign',
      });
      mockHasRunningRunTx.mockResolvedValueOnce(false);
      mockUpdateCampaignFieldsTx.mockResolvedValueOnce({
        id: 10,
        campaign_name: 'Draft Campaign',
        status: 'draft',
      });
      mockCountNodesByCampaignTx.mockResolvedValueOnce(5);

      const result = await campaignCrudService.updateCampaign({
        campaignId: 10,
        authUser: { id: 1, role: 'user_admin' },
        isContentUpdate: false,
        nodes: [], // empty nodes for draft
        connections: [],
      });

      expect(mockDeleteNodesByCampaignTx).toHaveBeenCalledWith(expect.anything(), 10);
      expect(mockDeleteConnectionsByCampaignTx).toHaveBeenCalledWith(expect.anything(), 10);
      expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
      expect(result.nodesTruoc).toBe(5);
    });

    it('rejects emptying nodes when a draft campaign is changed to paused in the same request', async () => {
      mockFindCampaignByIdTx.mockResolvedValueOnce({
        id: 10,
        status: 'draft',
        campaign_name: 'Draft Campaign',
      });
      mockHasRunningRunTx.mockResolvedValueOnce(false);
      mockUpdateCampaignFieldsTx.mockResolvedValueOnce({
        id: 10,
        campaign_name: 'Draft Campaign',
        status: 'paused',
      });
      mockCountNodesByCampaignTx.mockResolvedValueOnce(5);

      await expect(
        campaignCrudService.updateCampaign({
          campaignId: 10,
          authUser: { id: 1, role: 'user_admin' },
          isContentUpdate: false,
          status: 'paused',
          nodes: [],
          connections: [],
        })
      ).rejects.toMatchObject({
        code: 'CANNOT_EMPTY_ACTIVE_CAMPAIGN',
        statusCode: 409,
      });

      expect(mockDeleteNodesByCampaignTx).not.toHaveBeenCalled();
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('does not touch nodes when nodes is undefined (e.g. rename only)', async () => {
      mockFindCampaignByIdTx.mockResolvedValueOnce({
        id: 10,
        status: 'active',
        campaign_name: 'Renamed Campaign',
      });
      mockHasRunningRunTx.mockResolvedValueOnce(false);
      mockUpdateCampaignFieldsTx.mockResolvedValueOnce({
        id: 10,
        campaignName: 'Renamed Campaign',
        status: 'active',
      });
      mockCountNodesByCampaignTx.mockResolvedValueOnce(5);

      const result = await campaignCrudService.updateCampaign({
        campaignId: 10,
        authUser: { id: 1, role: 'user_admin' },
        isContentUpdate: false,
        campaignName: 'Renamed Campaign',
        // nodes is undefined
      });

      expect(mockCountNodesByCampaignTx).toHaveBeenCalledWith(expect.anything(), 10);
      expect(mockDeleteNodesByCampaignTx).not.toHaveBeenCalled();
      expect(mockDeleteConnectionsByCampaignTx).not.toHaveBeenCalled();
      expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
      expect(result.nodesTruoc).toBeNull();
    });
  });

  describe('publishCampaign', () => {
    it('rejects with 409 CANNOT_ACTIVATE_EMPTY_CAMPAIGN when campaign has 0 nodes', async () => {
      mockFindCampaignById.mockResolvedValueOnce({ id: 10, status: 'draft' });
      mockFindNodesByCampaignId.mockResolvedValueOnce([]);

      await expect(
        campaignCrudService.publishCampaign({
          campaignId: 10,
          authUser: { id: 1, role: 'user_admin' },
        })
      ).rejects.toMatchObject({
        code: 'CANNOT_ACTIVATE_EMPTY_CAMPAIGN',
        statusCode: 409,
      });

      expect(mockPublishCampaign).not.toHaveBeenCalled();
    });

    it('successfully publishes campaign when it has >= 1 nodes', async () => {
      mockFindCampaignById.mockResolvedValueOnce({ id: 10, status: 'draft' });
      mockFindNodesByCampaignId.mockResolvedValueOnce([
        { id: 1, node_type: 'trigger', node_subtype: 'manual_trigger' },
      ]);
      mockPublishCampaign.mockResolvedValueOnce({
        id: 10,
        status: 'active',
      });

      const result = await campaignCrudService.publishCampaign({
        campaignId: 10,
        authUser: { id: 1, role: 'user_admin' },
      });

      expect(result).toEqual({ id: 10, status: 'active' });
      expect(mockPublishCampaign).toHaveBeenCalled();
    });
  });
});
