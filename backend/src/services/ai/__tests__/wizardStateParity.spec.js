/**
 * PR-C1 (C-NO-GOC1) — parity: đường ĐỌC DB (gấp riêng tin user mới nhất vào bản đã lưu) phải ra cùng trạng thái với
 * đường CŨ (replay toàn bộ lịch sử + merge), trên cả 18 golden fixture, TỪNG lượt chat.
 *
 * Harness mô phỏng đúng việc production làm quanh mỗi lượt:
 *  - đầu lượt: tin user mới nằm trong history gửi lên nhưng CHƯA có trong ai_chat_messages (messageCount = số tin trước đó);
 *  - cuối lượt: ghi gates đã merge + áp tác động của phản hồi trợ lý (applyAssistantResponseToGates) + dấu
 *    historyBackfilledAt/foldedMessageCount (= số tin sau lượt);
 *  - tin ranh giới (campaign_created/abandoned) do PATCH ghi: reducer + đẩy dấu +1;
 *  - patchPersisted / reduceAction = PATCH; dropMarkers = tải lại trang (history mất marker, số tin trong DB không đổi).
 */
import { describe, expect, it, jest } from '@jest/globals';
import {
  FLOW_BOUNDARY_TYPES,
  applyAssistantResponseToGates,
  applyWizardStateAction,
  normalizeWizardState,
  parseWizardMarker,
} from '../aiCampaignWizard.service.js';
import { mergeCampaignBrief } from '../campaignBrief.service.js';
import { deriveWizardTurnState } from '../wizardStateSource.service.js';

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
import secondCampaignSameChatReasksGates from './fixtures/golden/secondCampaignSameChatReasksGates.fixture.js';

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
  secondCampaignSameChatReasksGates,
];

const clone = (value) => JSON.parse(JSON.stringify(value));

/** Chạy một fixture; trả các dòng log shadow theo thứ tự lượt user. */
const replayFixture = (fixture) => {
  let history = [];
  let persisted = null; // wizard_state thô như nằm trong DB
  let rows = 0; // số tin trong ai_chat_messages
  const lines = [];
  const results = [];

  const stamp = () => {
    persisted.meta = { ...persisted.meta, historyBackfilledAt: '2026-10-10T00:00:00.000Z', foldedMessageCount: rows };
  };

  const onUserMessage = (message) => {
    history.push(message);
    const persistedState = normalizeWizardState(persisted);
    const lastUserText = message.content || '';
    const options = { abandonedAtMessageCount: persistedState.gates?.abandonedAtMessageCount };
    // Chế độ shadow: phục vụ đường cũ + in dòng so sánh.
    const shadow = deriveWizardTurnState({
      mode: 'shadow', history, options, lastUserText, persistedRaw: persisted, persistedState, messageCount: rows, log: (line) => lines.push(line),
    });
    // Chế độ db: kết quả đường mới (nếu đủ điều kiện) phải bằng đường cũ ở mọi trường gates.
    const dbMode = deriveWizardTurnState({
      mode: 'db', history, options, lastUserText, persistedRaw: persisted, persistedState, messageCount: rows, log: () => {},
    });
    results.push({ shadowSource: shadow.source, dbSource: dbMode.source, legacyGates: shadow.mergedGates, dbGates: dbMode.mergedGates });
    // Cuối lượt: ghi gates đã merge (đường cũ) — user message vào DB.
    rows += 1;
    persisted = {
      v: 1,
      gates: clone(shadow.mergedGates),
      plan: persisted?.plan || {},
      // Service ghi brief = mergeCampaignBrief(brief đã lưu, brief suy từ history) mỗi lượt (aiCampaign.service.js).
      brief: shadow.extracted?.invalid
        ? (persisted?.brief || {})
        : mergeCampaignBrief(persisted?.brief, shadow.extracted?.brief ?? null, { defaultContentLocale: 'vi' }),
      meta: { ...(persisted?.meta || {}) },
    };
    stamp();
  };

  const onAssistantMessage = (message) => {
    history.push(message);
    rows += 1;
    if (!persisted) return;
    if (FLOW_BOUNDARY_TYPES.has(message.type)) {
      stamp(); // PATCH đẩy dấu +1 cho tin ranh giới; reducer chạy ở op reduceAction/patchPersisted kế tiếp
      return;
    }
    persisted.gates = clone(applyAssistantResponseToGates(persisted.gates, message));
    stamp();
  };

  fixture.turns.forEach((turn) => {
    if (turn.push) {
      if (turn.push.role === 'user') onUserMessage(turn.push);
      else onAssistantMessage(turn.push);
      return;
    }
    if (turn.patchPersisted && persisted) {
      persisted.gates = { ...persisted.gates, ...turn.patchPersisted };
      return;
    }
    if (turn.reduceAction && persisted) {
      const { state } = applyWizardStateAction(normalizeWizardState(persisted), turn.reduceAction.action, turn.reduceAction.payload || {});
      persisted = { ...state, meta: { ...persisted.meta } };
      return;
    }
    if (turn.dropMarkers) {
      history = history.filter((message) => !(message?.role === 'user' && parseWizardMarker(message.content || '')));
    }
  });
  return { lines, results };
};

describe('PR-C1 parity: đường đọc DB == đường replay lịch sử, trên 18 golden fixture', () => {
  FIXTURES.forEach((fixture) => {
    it(`fixture "${fixture.name}": mọi lượt đủ điều kiện đều khớp (không có dòng ❌ lệch)`, () => {
      const { lines, results } = replayFixture(fixture);
      expect(lines.filter((line) => line.includes('❌'))).toEqual([]);
      results.forEach((r) => {
        if (r.dbSource === 'db') expect(r.dbGates).toEqual(r.legacyGates);
      });
    });
  });

  it('có lượt so sánh thật (không phải toàn bỏ qua): mỗi fixture ≥ 1 lượt ✅ khớp, tổng ≥ 60', () => {
    let matched = 0;
    FIXTURES.forEach((fixture) => {
      const { lines } = replayFixture(fixture);
      const n = lines.filter((line) => line.endsWith('✅ khớp')).length;
      expect(n).toBeGreaterThanOrEqual(1);
      matched += n;
    });
    expect(matched).toBeGreaterThanOrEqual(60);
  });

  it('dòng log chỉ có tiền tố cố định + khớp/lệch/bỏ qua — không chứa giá trị', () => {
    const log = jest.fn();
    const persistedState = normalizeWizardState({
      v: 1,
      gates: { sheetUrl: 'https://docs.google.com/spreadsheets/d/SECRET/edit', channel: 'email' },
      plan: {},
      brief: {},
      meta: { historyBackfilledAt: 'x', foldedMessageCount: 1 },
    });
    deriveWizardTurnState({
      mode: 'shadow',
      history: [{ role: 'user', content: 'Tạo chiến dịch email, khách tên Nguyễn Văn A, 0912345678' }],
      persistedRaw: { v: 1, ...persistedState, meta: { historyBackfilledAt: 'x', foldedMessageCount: 1 } },
      persistedState,
      messageCount: 1,
      log,
    });
    expect(log).toHaveBeenCalledTimes(1);
    const line = log.mock.calls[0][0];
    expect(line).toMatch(/^\[Compiler Shadow WizardState\] (✅ khớp|❌ lệch: [A-Za-z.]+(, [A-Za-z.]+)*|⏭ bỏ qua \([a-z_]+\)|⚠️ lỗi so sánh \(\w+\))$/);
    expect(line).not.toMatch(/SECRET|Nguyễn|0912345678|docs\.google/);
  });
});
