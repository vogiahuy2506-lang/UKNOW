import { jest } from '@jest/globals';

/**
 * V-9: backfillGroupConversationNames must not abort syncGroups.
 * Persist groups first; name backfill is best-effort.
 */
const { default: syncService } = await import('../zaloPersonalSync.service.js');

describe('syncGroups — backfill non-fatal (V-9)', () => {
  const ACCOUNT_ID = 42;
  const USER_ID = 7;

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('vẫn trả nhóm khi backfillGroupConversationNames ném lỗi', async () => {
    jest.spyOn(syncService, 'getApi').mockReturnValue({
      getAllGroups: async () => ({ gridVerMap: { g1: 1 } }),
      getGroupInfo: async () => ({
        gridInfoMap: {
          g1: { name: 'Nhóm Test', totalMember: 3 },
        },
      }),
    });

    // Avoid depending on campaignZaloSenderService; return enriched names as-is path
    const campaignMod = await import('../../campaign/campaignZaloSender.service.js');
    jest.spyOn(campaignMod.default, 'enrichGroupNames').mockImplementation(async (_api, groups) =>
      groups.map((g) => ({ ...g, groupName: g.groupName || 'Nhóm Test' }))
    );

    jest.spyOn(syncService, 'persistGroups').mockResolvedValue(1);
    jest
      .spyOn(syncService, 'backfillGroupConversationNames')
      .mockRejectedValue(new Error('inconsistent types deduced for parameter $3'));

    const res = await syncService.syncGroups(ACCOUNT_ID, USER_ID);

    expect(syncService.persistGroups).toHaveBeenCalled();
    expect(res.synced).toBeGreaterThanOrEqual(1);
    expect(res.conversationsUpdated).toBe(0);
    expect(res.groups?.length).toBeGreaterThanOrEqual(1);
  });
});
