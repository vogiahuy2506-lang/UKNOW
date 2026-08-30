import { describe, expect, it } from '@jest/globals';
import {
  CAMPAIGN_INTENT_V1_SCHEMA,
  deriveIntent,
  validateCampaignIntentV1,
} from '../campaignIntent.schema.js';

const FORBIDDEN_UI_FLAGS = [
  'planApproved',
  'hasContentPlan',
  'abandonedAtMessageCount',
  'senderOtherRequested',
  'isCampaignFlow',
  'hasAttachedFile',
  'hasAttachedSpreadsheet',
  'sheetCheck',
];

describe('PR-1: CampaignIntentV1 schema & deriveIntent', () => {
  describe('CAMPAIGN_INTENT_V1_SCHEMA & validateCampaignIntentV1', () => {
    it('schema định nghĩa đúng cấu trúc OpenAPI subset cho Gemini', () => {
      expect(CAMPAIGN_INTENT_V1_SCHEMA.type).toBe('object');
      expect(CAMPAIGN_INTENT_V1_SCHEMA.required).toEqual(['version', 'channel']);
      expect(CAMPAIGN_INTENT_V1_SCHEMA.properties.channel.enum).toEqual(['email', 'zalo', 'zalo_group']);
    });

    it('validateCampaignIntentV1 chấp nhận intent hợp lệ', () => {
      const valid = {
        version: 1,
        channel: 'email',
        sender: { type: 'email_account', id: 5 },
        audience: { type: 'sheet', url: 'https://docs.google.com/spreadsheets/d/123', recipientKind: 'email' },
        schedule: { type: 'drip', days: 3, slotsPerDay: 2 },
        contentBrief: { topic: 'Khuyến mãi hè', locale: 'vi' },
      };
      const result = validateCampaignIntentV1(valid);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('validateCampaignIntentV1 từ chối version sai hoặc channel sai', () => {
      const invalid = {
        version: 2,
        channel: 'sms',
      };
      const result = validateCampaignIntentV1(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('deriveIntent mapping', () => {
    it('ánh xạ đúng audience.type và recipientKind cho từng loại dataSource', () => {
      const emailSheet = deriveIntent({ channel: 'email', dataSource: 'sheet', sheetUrl: 'https://sheet.link' });
      expect(emailSheet.intent.channel).toBe('email');
      expect(emailSheet.intent.audience.type).toBe('sheet');
      expect(emailSheet.intent.audience.recipientKind).toBe('email');
      expect(emailSheet.intent.audience.url).toBe('https://sheet.link');

      const zaloDb = deriveIntent({ channel: 'zalo', dataSource: 'db' });
      expect(zaloDb.intent.channel).toBe('zalo');
      expect(zaloDb.intent.audience.type).toBe('db');
      expect(zaloDb.intent.audience.recipientKind).toBe('phone');

      const zaloGroup = deriveIntent({ channel: 'zalo_group', zaloGroupIds: ['g1', 'g2'] });
      expect(zaloGroup.intent.channel).toBe('zalo_group');
      expect(zaloGroup.intent.audience.groupIds).toEqual(['g1', 'g2']);
      expect(zaloGroup.intent.audience.recipientKind).toBe('phone');
    });

    it('schedule drip có days/slotsPerDay, once không có', () => {
      const drip = deriveIntent({ channel: 'email', schedule: { mode: 'drip', days: 5, slotsPerDay: 2 } });
      expect(drip.intent.schedule).toEqual({ type: 'drip', days: 5, slotsPerDay: 2 });

      const once = deriveIntent({ channel: 'email', schedule: { mode: 'once' } });
      expect(once.intent.schedule).toEqual({ type: 'once' });
    });

    it('gates thiếu channel → missing: ["channel"], không throw', () => {
      const missingChan = deriveIntent({ dataSource: 'db' });
      expect(missingChan.missing).toContain('channel');
      expect(missingChan.intent.version).toBe(1);
    });

    it('KHÔNG cờ UI nào lọt vào intent (khóa cấm tuyệt đối)', () => {
      const fullGates = {
        isCampaignFlow: true,
        channel: 'email',
        senderAccountId: 12,
        senderAccountName: 'Marketing',
        dataSource: 'sheet',
        sheetUrl: 'https://docs.google.com/spreadsheets/d/abc',
        sheetCheck: { valid: true },
        zaloGroupIds: [],
        zaloFriendIds: [],
        schedule: { mode: 'once' },
        planApproved: true,
        senderOtherRequested: true,
        hasContentPlan: true,
        hasAttachedFile: true,
        hasAttachedSpreadsheet: true,
        abandonedAtMessageCount: 4,
      };

      const { intent } = deriveIntent(fullGates);

      for (const flag of FORBIDDEN_UI_FLAGS) {
        expect(intent).not.toHaveProperty(flag);
      }

      const topLevelKeys = Object.keys(intent);
      const allowedKeys = new Set(['version', 'channel', 'sender', 'audience', 'schedule', 'contentBrief']);
      for (const key of topLevelKeys) {
        expect(allowedKeys.has(key)).toBe(true);
      }
    });
  });
});
