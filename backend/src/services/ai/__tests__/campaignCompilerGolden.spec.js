import { describe, expect, it } from '@jest/globals';
import campaignNodeRegistryService from '../../campaign/campaignNodeRegistry.service.js';
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

describe('PR-2.4: Replay 17 golden fixtures qua Intent Compiler', () => {
  FIXTURES.forEach((fixture) => {
    it(`Replay fixture: "${fixture.name}"`, () => {
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

      if (check.ok) {
        // Với các fixture email đã compilable, kiểm tra compiler biên dịch hợp lệ 100%
        if (intent.channel === 'email') {
          const graph = compileCampaign(intent);
          expect(Array.isArray(graph.nodes)).toBe(true);
          expect(Array.isArray(graph.connections)).toBe(true);
          expect(Array.isArray(graph.contentSlots)).toBe(true);
          expect(graph.nodes.length).toBeGreaterThanOrEqual(2);

          for (const node of graph.nodes) {
            const validation = campaignNodeRegistryService.validateNodeConfig(
              node.nodeSubtype,
              node.config
            );
            expect(validation.valid).toBe(true);
            expect(validation.errors).toEqual([]);
          }
        }
      } else {
        // Các fixture dở dang bị compiler từ chối an toàn
        expect(() => compileCampaign(intent)).toThrow(/Cannot compile incomplete intent/);
      }
    });
  });
});
