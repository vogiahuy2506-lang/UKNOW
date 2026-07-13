import { describe, expect, it } from '@jest/globals';
import {
  evaluateNextGate,
  extractWizardState,
  mergeWizardState,
  parseWizardMarker,
} from '../aiCampaignWizard.service.js';

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
];

const clone = (value) => JSON.parse(JSON.stringify(value));

const lastUserContent = (history) => {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i]?.role === 'user') return history[i].content || '';
  }
  return '';
};

/**
 * Replay engine: state tại mỗi thời điểm = mergeWizardState(persistedGates,
 * extractWizardState(history), { lastUserText }) — đúng công thức production.
 * `snapshotPersisted` mô phỏng server ghi wizard_state sau 1 request;
 * `dropMarkers` mô phỏng session reload làm mất các marker [wizard] khỏi history.
 */
const runFixture = (fixture) => {
  let history = [];
  let persistedGates = null;
  const { resources = {}, locale = 'vi' } = fixture;

  const currentState = () => mergeWizardState(
    persistedGates,
    extractWizardState(history),
    { lastUserText: lastUserContent(history) }
  );

  fixture.turns.forEach((turn, turnIndex) => {
    const label = `${fixture.name} — turn ${turnIndex}`;
    if (turn.push) {
      history.push(turn.push);
      return;
    }
    if (turn.snapshotPersisted) {
      persistedGates = clone(currentState());
      return;
    }
    if (turn.dropMarkers) {
      history = history.filter((message) => !(message?.role === 'user' && parseWizardMarker(message.content || '')));
      return;
    }
    if (turn.expectGate) {
      const gate = evaluateNextGate(currentState(), resources, locale);
      expect({ label, gate: gate?.gate ?? null }).toEqual({ label, gate: turn.expectGate });
      return;
    }
    if (turn.expectGateResponseType) {
      const gate = evaluateNextGate(currentState(), resources, locale);
      expect({ label, responseType: gate?.response?.type ?? null })
        .toEqual({ label, responseType: turn.expectGateResponseType });
      return;
    }
    if (turn.expectNoGate) {
      const gate = evaluateNextGate(currentState(), resources, locale);
      expect({ label, gate: gate?.gate ?? null }).toEqual({ label, gate: null });
      return;
    }
    if (turn.expectState) {
      const state = currentState();
      Object.entries(turn.expectState).forEach(([key, value]) => {
        expect({ label, key, value: state[key] }).toEqual({ label, key, value });
      });
      return;
    }
    throw new Error(`Turn op không hợp lệ tại ${label}: ${JSON.stringify(turn)}`);
  });
};

describe('golden conversations — wizard state machine', () => {
  FIXTURES.forEach((fixture) => {
    it(fixture.name, () => {
      runFixture(fixture);
    });
  });
});
