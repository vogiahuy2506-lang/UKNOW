import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockDeleteAccount = jest.fn();
const mockClearAccountApi = jest.fn();
const mockRemoveMessageHandler = jest.fn();
const mockUnmarkAccountRegistered = jest.fn();
const mockForgetAccount = jest.fn();
const mockPromoteNextDefaultAccount = jest.fn();

jest.unstable_mockModule('../../repositories/zalo/zaloSetting.repository.js', () => ({
  default: {
    deleteAccount: mockDeleteAccount,
    promoteNextDefaultAccount: mockPromoteNextDefaultAccount,
  },
}));

jest.unstable_mockModule('../../services/zalo/zaloAccountSession.service.js', () => ({
  default: {
    clearAccountApi: mockClearAccountApi,
  },
}));

jest.unstable_mockModule('../../services/chatbot/channelAdapters/zaloPersonal.adapter.js', () => ({
  default: {
    removeMessageHandler: mockRemoveMessageHandler,
  },
}));

jest.unstable_mockModule('../../services/zalo/zaloAccountRegistry.service.js', () => ({
  addPendingAccount: jest.fn(),
  unmarkAccountRegistered: mockUnmarkAccountRegistered,
}));

jest.unstable_mockModule('../../services/chatbot/zaloInbox.service.js', () => ({
  default: {
    forgetAccount: mockForgetAccount,
    invalidateAccountCache: jest.fn(),
  },
}));

const zaloSettingsController = (await import('../zaloSettings.controller.js')).default;

describe('zaloSettings.controller deleteAccount cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('cleans up session, handler, registry and inbox cache when account is deleted', async () => {
    mockDeleteAccount.mockResolvedValue({
      id: 55,
      id_user: 12,
      is_default: false,
    });

    const req = {
      user: { id: 12, role: 'user' },
      params: { id: '55' },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await zaloSettingsController.deleteAccount(req, res);

    expect(mockClearAccountApi).toHaveBeenCalledWith(55);
    expect(mockRemoveMessageHandler).toHaveBeenCalledWith(55);
    expect(mockUnmarkAccountRegistered).toHaveBeenCalledWith(55);
    expect(mockForgetAccount).toHaveBeenCalledWith(12, 55);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, message: 'Đã xóa tài khoản Zalo' })
    );
  });
});
