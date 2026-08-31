import { describe, expect, it } from '@jest/globals';
import {
  CAMPAIGN_INTENT_V1_SCHEMA,
  deriveIntent,
  isCompilableIntent,
  validateCampaignIntentV1,
} from '../campaignIntent.schema.js';
import {
  extractWizardState,
  mergeWizardState,
  parseWizardMarker,
} from '../aiCampaignWizard.service.js';
import {
  extractCampaignBriefFromHistory,
  mergeCampaignBrief,
  clearCampaignBriefProductFacts,
} from '../campaignBrief.service.js';

import emailSheetUrlAfterDrafts from './fixtures/golden/emailSheetUrlAfterDrafts.fixture.js';
import reloadLostApprovalMarker from './fixtures/golden/reloadLostApprovalMarker.fixture.js';
import planRevisionResetsApproval from './fixtures/golden/planRevisionResetsApproval.fixture.js';
import channelSwitchResetsDownstream from './fixtures/golden/channelSwitchResetsDownstream.fixture.js';
import zaloGroupRequiresPicker from './fixtures/golden/zaloGroupRequiresPicker.fixture.js';
import emailNoSenderSetupGuide from './fixtures/golden/emailNoSenderSetupGuide.fixture.js';
import zaloAllDisconnectedQrLogin from './fixtures/golden/zaloAllDisconnectedQrLogin.fixture.js';
import senderOtherRequestedSetupGuide from './fixtures/golden/senderOtherRequestedSetupGuide.fixture.js';
import onceScheduleSkipsPlanApproval from './fixtures/golden/onceScheduleSkipsPlanApproval.fixture.js';
import recurringScheduleReasks from './fixtures/golden/recurringScheduleReasks.fixture.js';
import zaloFriendsPickerNoLoop from './fixtures/golden/zaloFriendsPickerNoLoop.fixture.js';
import attachedFileSurvivesNextTurn from './fixtures/golden/attachedFileSurvivesNextTurn.fixture.js';
import dripSlotsPerDaySurvivesPlanTurn from './fixtures/golden/dripSlotsPerDaySurvivesPlanTurn.fixture.js';
import reloadThenSaveContinuesChain from './fixtures/golden/reloadThenSaveContinuesChain.fixture.js';
import zaloCustomSenderAccountToNodes from './fixtures/golden/zaloCustomSenderAccountToNodes.fixture.js';
import imageAttachedSurvivesNextTurn from './fixtures/golden/imageAttachedSurvivesNextTurn.fixture.js';
import sheetThieuCotLienHe from './fixtures/golden/sheetThieuCotLienHe.fixture.js';

const GOLDEN_FIXTURES = [
  emailSheetUrlAfterDrafts,
  reloadLostApprovalMarker,
  planRevisionResetsApproval,
  channelSwitchResetsDownstream,
  zaloGroupRequiresPicker,
  emailNoSenderSetupGuide,
  zaloAllDisconnectedQrLogin,
  senderOtherRequestedSetupGuide,
  onceScheduleSkipsPlanApproval,
  recurringScheduleReasks,
  zaloFriendsPickerNoLoop,
  attachedFileSurvivesNextTurn,
  dripSlotsPerDaySurvivesPlanTurn,
  reloadThenSaveContinuesChain,
  zaloCustomSenderAccountToNodes,
  imageAttachedSurvivesNextTurn,
  sheetThieuCotLienHe,
];

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

  describe('isCompilableIntent (PR-2.0 Compiler Gate)', () => {
    it('chấp nhận intent email-once hoàn chỉnh', () => {
      const validEmailOnce = {
        version: 1,
        channel: 'email',
        sender: { type: 'email_account', id: 1 },
        audience: { type: 'sheet', url: 'https://docs.google.com/spreadsheets/d/123', recipientKind: 'email' },
        schedule: { type: 'once' },
      };
      const result = isCompilableIntent(validEmailOnce);
      expect(result.ok).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('chấp nhận intent drip nhiều ngày', () => {
      const validDrip = {
        version: 1,
        channel: 'zalo',
        sender: { type: 'zalo_account', id: 2 },
        audience: { type: 'db', recipientKind: 'phone' },
        schedule: { type: 'drip', days: 5, slotsPerDay: 1 },
      };
      const result = isCompilableIntent(validDrip);
      expect(result.ok).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('bắt chính xác các trường thiếu khi intent khuyết', () => {
      // Thiếu sender và schedule
      const incomplete1 = {
        version: 1,
        channel: 'email',
        audience: { type: 'sheet', url: 'https://sheet.link' },
      };
      const res1 = isCompilableIntent(incomplete1);
      expect(res1.ok).toBe(false);
      expect(res1.missing).toContain('sender');
      expect(res1.missing).toContain('schedule');

      // Sheet thiếu url
      const incomplete2 = {
        version: 1,
        channel: 'email',
        sender: { type: 'email_account', id: 1 },
        audience: { type: 'sheet', url: '' },
        schedule: { type: 'once' },
      };
      const res2 = isCompilableIntent(incomplete2);
      expect(res2.ok).toBe(false);
      expect(res2.missing).toContain('audience.url');

      // Drip thiếu days
      const incomplete3 = {
        version: 1,
        channel: 'email',
        sender: { type: 'email_account', id: 1 },
        audience: { type: 'db' },
        schedule: { type: 'drip' },
      };
      const res3 = isCompilableIntent(incomplete3);
      expect(res3.ok).toBe(false);
      expect(res3.missing).toContain('schedule.days');
    });

    it('nghiệm thu 17 golden fixtures: số lượng fixture compilable <= 12 và nêu đúng trường thiếu', () => {
      const clone = (value) => JSON.parse(JSON.stringify(value));
      const lastUserContent = (history) => {
        for (let i = history.length - 1; i >= 0; i -= 1) {
          if (history[i]?.role === 'user') return history[i].content || '';
        }
        return '';
      };

      let compilableCount = 0;
      const failedMap = new Map();

      GOLDEN_FIXTURES.forEach((fixture) => {
        let history = [];
        let persistedGates = null;
        let persistedBrief = null;
        const { locale = 'vi' } = fixture;

        const currentState = () => {
          const gates = mergeWizardState(
            persistedGates,
            extractWizardState(history),
            { lastUserText: lastUserContent(history) }
          );
          let derivedBrief = null;
          let extractInvalid = false;
          const extracted = extractCampaignBriefFromHistory(history);
          if (extracted.invalid) {
            extractInvalid = true;
            derivedBrief = null;
          } else {
            derivedBrief = extracted.brief;
          }
          const brief = extractInvalid
            ? clearCampaignBriefProductFacts({
              contentMode: extracted.preferredContentMode,
              contentLocale: locale === 'en' ? 'en' : 'vi',
            })
            : mergeCampaignBrief(persistedBrief, derivedBrief, { defaultContentLocale: locale === 'en' ? 'en' : 'vi' });
          return { ...gates, brief };
        };

        fixture.turns.forEach((turn) => {
          if (turn.push) {
            history.push(turn.push);
            return;
          }
          if (turn.snapshotPersisted) {
            const state = currentState();
            const { brief, ...gates } = state;
            persistedGates = clone(gates);
            persistedBrief = clone(brief);
            return;
          }
          if (turn.patchPersisted) {
            persistedGates = { ...(persistedGates || {}), ...turn.patchPersisted };
            return;
          }
          if (turn.dropMarkers) {
            history = history.filter((message) => !(message?.role === 'user' && parseWizardMarker(message.content || '')));
            return;
          }
        });

        const state = currentState();
        const { brief, ...gates } = state;
        const { intent } = deriveIntent(gates, brief);
        const result = isCompilableIntent(intent);

        if (result.ok) {
          compilableCount++;
        } else {
          failedMap.set(fixture.name, result.missing);
        }
      });

      // Tiêu chí nghiệm thu Việc 2.0: <= 12
      expect(compilableCount).toBeLessThanOrEqual(12);
      expect(compilableCount).toBe(12);

      // Các fixture dở dang bị loại đúng danh tính và nêu đúng trường thiếu
      expect(failedMap.has('đổi kênh reset downstream, persisted không hồi sinh')).toBe(true);
      expect(failedMap.get('đổi kênh reset downstream, persisted không hồi sinh')).toEqual(
        expect.arrayContaining(['sender', 'audience', 'schedule'])
      );

      expect(failedMap.has('email không có sender → email_setup_guide')).toBe(true);
      expect(failedMap.get('email không có sender → email_setup_guide')).toEqual(
        expect.arrayContaining(['sender', 'audience', 'schedule'])
      );

      expect(failedMap.has('zalo toàn tài khoản disconnected → zalo_qr_login')).toBe(true);
      expect(failedMap.get('zalo toàn tài khoản disconnected → zalo_qr_login')).toEqual(
        expect.arrayContaining(['sender', 'audience', 'schedule'])
      );

      expect(failedMap.has('sender other:true → setup guide, chọn lại account thật → đi tiếp')).toBe(true);
      expect(failedMap.get('sender other:true → setup guide, chọn lại account thật → đi tiếp')).toEqual(
        expect.arrayContaining(['audience', 'schedule'])
      );

      expect(failedMap.has('google sheet thiếu cột liên hệ: chặn ở gate sheetUrl và không tạo chiến dịch')).toBe(true);
      expect(failedMap.get('google sheet thiếu cột liên hệ: chặn ở gate sheetUrl và không tạo chiến dịch')).toEqual(
        expect.arrayContaining(['schedule'])
      );
    });
  });
});

