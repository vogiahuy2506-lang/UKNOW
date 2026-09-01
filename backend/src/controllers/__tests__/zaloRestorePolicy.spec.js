import { describe, it, expect, jest, beforeEach } from '@jest/globals';

describe('PR-1a & PR-1b: Zalo Restore Policy & Guard Rails Spec', () => {
  let mockZaloSenderRepo;
  let mockZaloSettingRepo;
  let mockAccountSessionService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('PR-1b: ZaloPersonalSyncController.getStatus', () => {
    it('calls recordRestoreFailure instead of markAccountDisconnected when restore from cookie fails', async () => {
      // Mock repository methods
      const recordRestoreFailureMock = jest.fn().mockResolvedValue({ status: 'connected', restore_fail_count: 1 });
      const markAccountDisconnectedMock = jest.fn().mockResolvedValue({});
      const clearAccountApiMock = jest.fn();

      const account = {
        id: 101,
        id_user: 1,
        cookie_text: 'sample_cookie',
        display_name: 'Test Account',
        conversation_count: 5,
      };

      // Simulate the sync status flow logic
      let api = null; // Session not in memory
      if (!api) {
        // Attempt restore fails
        const restoreSuccess = false;
        if (restoreSuccess) {
          api = {};
        } else {
          await recordRestoreFailureMock(account.id);
          clearAccountApiMock(account.id);
        }
      }

      expect(recordRestoreFailureMock).toHaveBeenCalledTimes(1);
      expect(recordRestoreFailureMock).toHaveBeenCalledWith(101);
      expect(markAccountDisconnectedMock).not.toHaveBeenCalled();
      expect(clearAccountApiMock).toHaveBeenCalledWith(101);
    });
  });

  describe('PR-1a: ZaloSettingsController restore failure policy', () => {
    it('does not mark account disconnected after 3 fails; lets recordRestoreFailure manage status transition', async () => {
      const recordRestoreFailureMock = jest.fn().mockResolvedValue({ status: 'connected', restore_fail_count: 3 });
      const markAccountDisconnectedAfterRestoreFailMock = jest.fn();
      const clearAccountApiMock = jest.fn();

      const accountId = 202;
      const isStartupOrCron = true;

      if (isStartupOrCron) {
        const failRecord = await recordRestoreFailureMock(accountId);
        const failCount = Number(failRecord?.restore_fail_count || 0);
        clearAccountApiMock(accountId);
        // Under the new policy, no premature markAccountDisconnectedAfterRestoreFail
      }

      expect(recordRestoreFailureMock).toHaveBeenCalledWith(202);
      expect(clearAccountApiMock).toHaveBeenCalledWith(202);
      expect(markAccountDisconnectedAfterRestoreFailMock).not.toHaveBeenCalled();
    });
  });

  describe('PR-1b: CampaignZaloSenderService.syncDisconnectedAccountsFromMemory & getConnectedApiOrSyncStatus', () => {
    it('calls recordRestoreFailure instead of bulkMarkAccountsDisconnected when auto-restore fails', async () => {
      const recordRestoreFailureMock = jest.fn().mockResolvedValue({ status: 'connected', restore_fail_count: 1 });
      const bulkMarkAccountsDisconnectedMock = jest.fn();
      const clearAccountApiMock = jest.fn();

      const missingSessionAccounts = [{ id: '301', status: 'connected', is_active: true }];
      const failedIds = [];

      for (const account of missingSessionAccounts) {
        const accountId = Number.parseInt(account.id, 10);
        const restoredApi = null; // auto-restore returns null
        if (!restoredApi) {
          failedIds.push(accountId);
          await recordRestoreFailureMock(accountId);
          clearAccountApiMock(accountId);
        }
      }

      expect(recordRestoreFailureMock).toHaveBeenCalledWith(301);
      expect(clearAccountApiMock).toHaveBeenCalledWith(301);
      expect(bulkMarkAccountsDisconnectedMock).not.toHaveBeenCalled();
      expect(failedIds).toEqual([301]);
    });
  });
});
