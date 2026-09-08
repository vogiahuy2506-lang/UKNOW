import { describe, expect, it } from '@jest/globals';
import aiCampaignDraftService from '../aiCampaignDraft.service.js';
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
import { compileCampaign } from '../campaignCompiler.service.js';
import { deriveIntent, isCompilableIntent } from '../campaignIntent.schema.js';

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

/**
 * PLAN_COMPILER_GD5_DON_DEP_2026-09-08 PR-1, mục 1.1.
 *
 * Chứng minh: với MỌI intent compile được, chạy patchDeterministicCampaignScript (11 nhánh
 * [AI Patch] cũ, viết cho script LLM trước khi có compiler) lên graph compileCampaign() vừa
 * sinh ra là NO-OP tuyệt đối. Đây là bằng chứng cho phép bỏ qua patch khi
 * script.compilerApplied === true (aiCampaign.service.js:1685, prepareScript) mà không đổi
 * hành vi observable.
 *
 * Nguồn intent: (A) 17 fixture golden — dựng đúng cách campaignCompilerGolden.spec.js
 * (extractWizardState → mergeWizardState → deriveIntent → isCompilableIntent), chỉ lấy ca
 * compilable (12/17 thực tế — 5 fixture còn lại mô tả trạng thái dở dang, không compile
 * được). (B) Bảng tổng hợp viết tay: 3 kênh (email/zalo/zalo_group) × 2 lịch (once/drip) ×
 * 5 loại audience (sheet/db/landing/manual/zalo_contacts — campaignIntent.schema.js:72-76),
 * TRỪ zalo_group × {sheet,db,landing} — compileZaloGroupOnceCampaign/Drip không đọc
 * audience.type (đích luôn là nhóm Zalo đã chọn, không phải "nguồn danh sách người" như
 * sheet/db/landing), tổ hợp đó không phát sinh từ wizard gate thật (xem audiencesFor bên
 * dưới) → 24 ca. Tổng (A)+(B) = 36, in ra ở test cuối — ≥ 30 theo nghiệm thu PR-1.
 */

/**
 * Ánh xạ CampaignIntentV1 → options mà aiCampaign.service.js:1685-1697 truyền cho
 * patchDeterministicCampaignScript khi gọi từ gateState thật. Dùng bộ khoá ĐẦY ĐỦ hơn cả
 * prepareScript (chỉ truyền defaultZaloAccountId) — nếu no-op với bộ đầy đủ này thì chắc chắn
 * no-op với tập con hẹp hơn prepareScript dùng.
 */
function optionsFromIntent(intent) {
  const audience = intent.audience || {};
  return {
    senderAccountId: intent.sender?.id ?? null,
    dataSource: audience.type ?? null,
    sheetUrl: audience.url ?? null,
    zaloGroupIds: Array.isArray(audience.groupIds) ? audience.groupIds : null,
    zaloFriendIds: Array.isArray(audience.friendIds) ? audience.friendIds : null,
    landingPageSlug: Array.isArray(audience.slugs) ? audience.slugs : null,
    defaultZaloAccountId: intent.sender?.id ?? null,
    channel: intent.channel ?? null,
    // patchDeterministicCampaignScript đọc options.schedule.mode ('once'|'drip') — shape của
    // wizard gate. CampaignIntentV1.schedule dùng khoá `type`, không phải `mode` — phải map
    // lại, không truyền thẳng intent.schedule (Bẫy 7: nếu truyền thẳng, scheduleMode luôn
    // undefined nên nhánh "once" của patch không bao giờ chạy, che mất phần cần so sánh).
    schedule: intent.schedule
      ? { mode: intent.schedule.type, days: intent.schedule.days, slotsPerDay: intent.schedule.slotsPerDay }
      : null,
  };
}

/** So sánh graph trước/sau patch, gọi compileCampaign + patchDeterministicCampaignScript THẬT. */
function expectPatchIsNoop(intent, label) {
  const graph = compileCampaign(intent);
  const original = JSON.parse(JSON.stringify(graph));
  const patchedTarget = JSON.parse(JSON.stringify(graph));
  aiCampaignDraftService.patchDeterministicCampaignScript(patchedTarget, optionsFromIntent(intent));
  expect({ label, patched: patchedTarget }).toEqual({ label, patched: original });
}

const FIXTURES = [
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

const clone = (value) => JSON.parse(JSON.stringify(value));

const lastUserContent = (history) => {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i]?.role === 'user') return history[i].content || '';
  }
  return '';
};

/** Đếm số ca THẬT SỰ đã compile-và-so (chỉ tính ca compilable — báo cáo nghiệm thu cần số này). */
let compiledAndComparedCount = 0;

describe('PLAN_COMPILER_GD5 PR-1 mục 1.1: patchDeterministicCampaignScript là no-op trên graph compiler', () => {
  describe('Nguồn A — 17 fixture golden (chỉ ca compilable)', () => {
    FIXTURES.forEach((fixture) => {
      it(`fixture "${fixture.name}"`, () => {
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

        const finalState = currentState();
        const { brief, ...gates } = finalState;
        const { intent } = deriveIntent(gates, brief);
        const check = isCompilableIntent(intent);

        if (!check.ok) {
          // Fixture dở dang — không compile được, không có gì để chứng minh no-op.
          return;
        }
        compiledAndComparedCount += 1;
        expectPatchIsNoop(intent, fixture.name);
      });
    });
  });

  describe('Nguồn B — bảng tổng hợp 3 kênh × 2 lịch × 5 audience (30 ca)', () => {
    const CHANNELS = [
      { channel: 'email', senderType: 'email_account' },
      { channel: 'zalo', senderType: 'zalo_account' },
      { channel: 'zalo_group', senderType: 'zalo_account' },
    ];
    const SCHEDULES = [
      { type: 'once' },
      { type: 'drip', days: 3, slotsPerDay: 1 },
    ];
    // 5 loại audience đúng enum campaignIntent.schema.js:72-76 (VALID_AUDIENCE_TYPES).
    // zalo_contacts theo kênh thật: zalo_group dùng groupIds (nhóm đã chọn qua
    // ZaloGroupPickerCard), zalo (cá nhân) dùng friendIds (bạn bè đã chọn qua
    // ZaloFriendPickerCard) — không có UID/groupId thật thì compiler không có gì để giới hạn,
    // nhưng test vẫn cần phủ ca CÓ dữ liệu vì đó là ca compileZaloPersonalOnceCampaign/Drip và
    // compileZaloGroupOnceCampaign/Drip THẬT SỰ chạy trong sản xuất (bắt được bug thiếu
    // zaloGroupIds/zaloRecipientPhones — xem sửa campaignCompiler.service.js cùng commit).
    const audiencesFor = (channel) => {
      if (channel === 'zalo_group') {
        // zalo_group biên dịch KHÔNG đọc audience.type (compileZaloGroupOnceCampaign/Drip
        // luôn cùng 1 graph select_zalo_account → get_all_groups → send_zalo_group — nhóm
        // Zalo là đích, không phải "nguồn danh sách người" như sheet/db/landing). Đích thực tế
        // duy nhất là zalo_contacts (deriveIntent mặc định audience.type='zalo_contacts' cho
        // kênh này khi không có dataSource khác — campaignIntent.schema.js:192); audience.type
        // sheet/db/landing cho kênh này không phát sinh từ wizard gate thật, chỉ hợp lệ theo
        // schema suông — bỏ khỏi bảng, giữ zalo_contacts + manual (2 audience thực sự có ý
        // nghĩa cho kênh nhóm).
        return [
          { type: 'zalo_contacts', groupIds: ['g1', 'g2'] },
          { type: 'manual' },
        ];
      }
      const base = [
        { type: 'sheet', url: 'https://docs.google.com/spreadsheets/d/abc/edit' },
        { type: 'db' },
        { type: 'landing', slugs: ['khoa-hoc-ai'] },
        { type: 'manual' },
      ];
      if (channel === 'zalo') {
        base.push({ type: 'zalo_contacts', friendIds: ['1111111111111111111', '2222222222222222222'] });
      } else {
        base.push({ type: 'zalo_contacts' });
      }
      return base;
    };

    for (const { channel, senderType } of CHANNELS) {
      for (const schedule of SCHEDULES) {
        for (const audienceBase of audiencesFor(channel)) {
          const label = `${channel} / ${schedule.type} / audience=${audienceBase.type}`;
          it(label, () => {
            const recipientKind = channel === 'email' ? 'email' : 'phone';
            const audience = { ...audienceBase, recipientKind };
            const intent = {
              version: 1,
              channel,
              sender: { type: senderType, id: 7 },
              audience,
              schedule,
              contentBrief: { topic: 'Khoá học AI', locale: 'vi', mode: 'create' },
            };

            const check = isCompilableIntent(intent);
            expect({ label, check }).toEqual({ label, check: { ok: true, missing: [] } });

            compiledAndComparedCount += 1;
            expectPatchIsNoop(intent, label);
          });
        }
      }
    }
  });

  it('in ra tổng số ca đã compile-và-so (nghiệm thu PR-1: kỳ vọng >= 30)', () => {
    // eslint-disable-next-line no-console
    console.log(`[campaignCompilerPatchNoop] Tổng số ca đã compile-và-so: ${compiledAndComparedCount}`);
    expect(compiledAndComparedCount).toBeGreaterThanOrEqual(30);
  });
});
