import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockCheckSendQuota = jest.fn();
const mockRecordDirectSendUsage = jest.fn();
const mockSendPersonalMessage = jest.fn();
const mockPrepareZaloAttachmentSources = jest.fn();
const mockSendCustomEmail = jest.fn();
const mockResolvePreviewAccountAndApi = jest.fn();

jest.unstable_mockModule('../../utils/userSendLimit.util.js', () => ({
  checkSendQuota: mockCheckSendQuota,
  recordDirectSendUsage: mockRecordDirectSendUsage,
}));

jest.unstable_mockModule('../../services/campaign/campaignZaloSender.service.js', () => ({
  default: {
    sendPersonalMessage: mockSendPersonalMessage,
    prepareZaloAttachmentSources: mockPrepareZaloAttachmentSources,
  },
}));

jest.unstable_mockModule('../zaloSettings.controller.js', () => ({
  default: {
    resolvePreviewAccountAndApi: mockResolvePreviewAccountAndApi,
  },
}));

jest.unstable_mockModule('../emailSettings.controller.js', () => ({
  default: {
    resolveTrackingBaseUrl: jest.fn(() => ({})),
    normalizeEmailList: jest.fn((v) => [v]),
    buildTrackedHtml: jest.fn((h) => h),
    buildMailAttachments: jest.fn(() => []),
    createSmtpTransporter: jest.fn(),
    formatUtc7: jest.fn(() => ''),
  },
}));

jest.unstable_mockModule('../../services/email/emailSettingsSmtp.service.js', () => ({
  default: {
    sendCustomEmail: mockSendCustomEmail,
  },
}));

import campaignRunService from '../../services/campaign/campaignRun.service.js';
const campaignController = (await import('../campaign.controller.js')).default;

describe('campaign.controller quick-send and delay config endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getDelayConfig', () => {
    it('returns shared policy delays for Zalo and Email (single source of truth)', async () => {
      const req = {};
      const res = { json: jest.fn() };

      await campaignController.getDelayConfig(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          zalo_personal: expect.objectContaining({
            minMs: expect.any(Number),
            maxMs: expect.any(Number),
          }),
          email: {
            minMs: 50,
            maxMs: 250,
          },
        }),
      });
    });
  });

  describe('getQuickSendEstimate', () => {
    it('returns immediate for 1 recipient', async () => {
      const req = { query: { channel: 'zalo', recipients: '1' } };
      const res = { json: jest.fn() };

      await campaignController.getQuickSendEstimate(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          estimatedMs: 0,
          unit: 'immediate',
          value: 0,
          quietHours: expect.objectContaining({
            enabled: false,
          }),
        }),
      });
    });

    it('estimates ~2 ngày and notes quiet hours for 1000 Zalo recipients with production delays', async () => {
      const origMin = campaignRunService.zaloRateLimiter.ZALO_PERSONAL_INTER_MESSAGE_MIN_MS;
      const origMax = campaignRunService.zaloRateLimiter.ZALO_PERSONAL_INTER_MESSAGE_MAX_MS;
      campaignRunService.zaloRateLimiter.ZALO_PERSONAL_INTER_MESSAGE_MIN_MS = 80000;
      campaignRunService.zaloRateLimiter.ZALO_PERSONAL_INTER_MESSAGE_MAX_MS = 150000;

      try {
        const req = { query: { channel: 'zalo', recipients: '1000' } };
        const res = { json: jest.fn() };

        await campaignController.getQuickSendEstimate(req, res);

        expect(res.json).toHaveBeenCalledWith({
          success: true,
          data: expect.objectContaining({
            unit: 'days',
            value: expect.any(Number),
            quietHours: expect.objectContaining({
              enabled: true,
              start: expect.any(Number),
              end: expect.any(Number),
              startFormatted: expect.stringMatching(/^\d{2}:00$/),
              endFormatted: expect.stringMatching(/^\d{2}:00$/),
            }),
          }),
        });
      } finally {
        campaignRunService.zaloRateLimiter.ZALO_PERSONAL_INTER_MESSAGE_MIN_MS = origMin;
        campaignRunService.zaloRateLimiter.ZALO_PERSONAL_INTER_MESSAGE_MAX_MS = origMax;
      }
    });

    it('estimates email using actual fast delay (~150ms default) without quiet hours', async () => {
      const req = { query: { channel: 'email', recipients: '50' } };
      const res = { json: jest.fn() };

      await campaignController.getQuickSendEstimate(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          unit: 'seconds',
          value: expect.any(Number),
          quietHours: expect.objectContaining({
            enabled: false,
          }),
        }),
      });
    });
  });

  describe('testSendQuickCampaign', () => {
    it('rejects with 400 if recipient is empty', async () => {
      const req = {
        user: { id: 1, role: 'user' },
        body: { channel: 'zalo', recipient: '' },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await campaignController.testSendQuickCampaign(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('rejects with 403 if send quota is exceeded', async () => {
      mockCheckSendQuota.mockResolvedValueOnce({
        allowed: false,
        message: 'Hết hạn mức gửi',
      });

      const req = {
        user: { id: 1, role: 'user' },
        body: { channel: 'zalo', recipient: '0901234567', message: 'Xin chào' },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await campaignController.testSendQuickCampaign(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('rejects Zalo test message if currently in quiet hours', async () => {
      mockCheckSendQuota.mockResolvedValueOnce({ allowed: true });
      const origStart = campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_START_SAFE;
      const origEnd = campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_END_SAFE;
      // Set quiet hours to cover entire day
      campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_START_SAFE = 0;
      campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_END_SAFE = 24;

      try {
        const req = {
          user: { id: 1, role: 'user' },
          body: { channel: 'zalo', recipient: '0901234567', message: 'Tin test' },
        };
        const res = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn(),
        };

        await campaignController.testSendQuickCampaign(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
          code: 'QUIET_HOURS_ACTIVE',
        }));
        expect(mockRecordDirectSendUsage).not.toHaveBeenCalled();
      } finally {
        campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_START_SAFE = origStart;
        campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_END_SAFE = origEnd;
      }
    });

    it('sends Zalo test message via canonical personal sender and records usage on success', async () => {
      mockCheckSendQuota.mockResolvedValueOnce({ allowed: true, billingUserId: 50 });
      mockResolvePreviewAccountAndApi.mockResolvedValueOnce({
        account: { id: 10 },
        api: {},
      });
      mockPrepareZaloAttachmentSources.mockResolvedValueOnce([]);
      mockSendPersonalMessage.mockResolvedValueOnce({
        status: 'success',
        msgId: 'zalo_123',
      });

      const origStart = campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_START_SAFE;
      const origEnd = campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_END_SAFE;
      // Disable quiet hours for this test
      campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_START_SAFE = 24;
      campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_END_SAFE = 0;

      try {
        const req = {
          user: { id: 1, role: 'user' },
          body: { channel: 'zalo', recipient: '0901234567', message: 'Tin test' },
        };
        const res = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn(),
        };

        await campaignController.testSendQuickCampaign(req, res);

        expect(mockSendPersonalMessage).toHaveBeenCalledWith(expect.objectContaining({
          recipient: '0901234567',
          message: 'Tin test',
        }));
        expect(mockRecordDirectSendUsage).toHaveBeenCalledWith({
          billingUserId: 50,
          channel: 'zalo',
          amount: 1,
          actorUserId: 1,
          source: 'zalo_quick_send',
        });
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
          success: true,
        }));
      } finally {
        campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_START_SAFE = origStart;
        campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_END_SAFE = origEnd;
      }
    });

    it('does not record usage when admin sends Zalo test message (admin bypass has billingUserId: null)', async () => {
      // Admin bypass returns allowed: true with billingUserId: null
      mockCheckSendQuota.mockResolvedValueOnce({ allowed: true, billingUserId: null });
      mockResolvePreviewAccountAndApi.mockResolvedValueOnce({
        account: { id: 10 },
        api: {},
      });
      mockPrepareZaloAttachmentSources.mockResolvedValueOnce([]);
      mockSendPersonalMessage.mockResolvedValueOnce({
        status: 'success',
        msgId: 'zalo_admin_123',
      });

      const origStart = campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_START_SAFE;
      const origEnd = campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_END_SAFE;
      campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_START_SAFE = 24;
      campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_END_SAFE = 0;

      try {
        const req = {
          user: { id: 999, role: 'admin' },
          body: { channel: 'zalo', recipient: '0901234567', message: 'Tin admin' },
        };
        const res = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn(),
        };

        await campaignController.testSendQuickCampaign(req, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
          success: true,
        }));
        expect(mockRecordDirectSendUsage).not.toHaveBeenCalled();
      } finally {
        campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_START_SAFE = origStart;
        campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_END_SAFE = origEnd;
      }
    });

    it('does not record usage when quota result has no billing context (billingUserId is null/undefined)', async () => {
      mockCheckSendQuota.mockResolvedValueOnce({ allowed: true });
      mockResolvePreviewAccountAndApi.mockResolvedValueOnce({
        account: { id: 10 },
        api: {},
      });
      mockPrepareZaloAttachmentSources.mockResolvedValueOnce([]);
      mockSendPersonalMessage.mockResolvedValueOnce({
        status: 'success',
        msgId: 'zalo_nobilling_123',
      });

      const origStart = campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_START_SAFE;
      const origEnd = campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_END_SAFE;
      campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_START_SAFE = 24;
      campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_END_SAFE = 0;

      try {
        const req = {
          user: { id: 1, role: 'user' },
          body: { channel: 'zalo', recipient: '0901234567', message: 'Tin test' },
        };
        const res = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn(),
        };

        await campaignController.testSendQuickCampaign(req, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
          success: true,
        }));
        expect(mockRecordDirectSendUsage).not.toHaveBeenCalled();
      } finally {
        campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_START_SAFE = origStart;
        campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_END_SAFE = origEnd;
      }
    });

    it('does not record usage when Zalo outbound fails', async () => {
      mockCheckSendQuota.mockResolvedValueOnce({ allowed: true, billingUserId: 50 });
      mockResolvePreviewAccountAndApi.mockResolvedValueOnce({
        account: { id: 10 },
        api: {},
      });
      mockPrepareZaloAttachmentSources.mockResolvedValueOnce([]);
      mockSendPersonalMessage.mockResolvedValueOnce({
        status: 'error',
        error: 'Network timeout',
      });

      const origStart = campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_START_SAFE;
      const origEnd = campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_END_SAFE;
      campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_START_SAFE = 24;
      campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_END_SAFE = 0;

      try {
        const req = {
          user: { id: 1, role: 'user' },
          body: { channel: 'zalo', recipient: '0901234567', message: 'Tin test' },
        };
        const res = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn(),
        };

        await campaignController.testSendQuickCampaign(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(mockRecordDirectSendUsage).not.toHaveBeenCalled();
      } finally {
        campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_START_SAFE = origStart;
        campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_END_SAFE = origEnd;
      }
    });

    it('sends Email test message via emailSettingsSmtpService without double-recording usage', async () => {
      mockCheckSendQuota.mockResolvedValueOnce({ allowed: true, billingUserId: 50 });
      mockSendCustomEmail.mockResolvedValueOnce({
        messageId: 'email_msg_123',
      });

      const req = {
        user: { id: 1, role: 'user' },
        body: { channel: 'email', recipient: 'test@example.com', message: 'Hello' },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await campaignController.testSendQuickCampaign(req, res);

      expect(mockSendCustomEmail).toHaveBeenCalledWith(expect.objectContaining({
        payload: expect.objectContaining({
          to: 'test@example.com',
          content: 'Hello',
        }),
      }), expect.anything());
      // sendCustomEmail handles its own usage persistence, campaignController must not duplicate
      expect(mockRecordDirectSendUsage).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
      }));
    });
  });
});
