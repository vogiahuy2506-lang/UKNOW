import { describe, expect, it } from '@jest/globals';
import {
  computeWizardMeta,
  createEmptyWizardState,
  extractWizardState,
  mergeWizardState,
  normalizeWizardState,
} from '../aiCampaignWizard.service.js';

describe('extractWizardState — sheetUrl & markerGates', () => {
  it('captures the latest Google Sheet URL from plain user messages, stripping trailing punctuation', () => {
    const state = extractWizardState([
      { role: 'user', content: 'Danh sách ở đây: https://docs.google.com/spreadsheets/d/old/edit' },
      { role: 'user', content: 'À nhầm, dùng cái này (https://docs.google.com/spreadsheets/d/new/edit?usp=sharing).' },
    ]);
    expect(state.sheetUrl).toBe('https://docs.google.com/spreadsheets/d/new/edit?usp=sharing');
  });

  it('collects markerGates after the last channel marker and resets them on channel switch', () => {
    const state = extractWizardState([
      { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nEmail' },
      { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"email","accountId":7}\nSales' },
      { role: 'user', content: '[wizard]{"gate":"channel","channel":"zalo"}\nĐổi kênh' },
      { role: 'user', content: '[wizard]{"gate":"schedule","value":"once","mode":"once"}\nMột lần' },
    ]);
    expect(state.markerGates).toEqual(['channel', 'schedule']);
    expect(state.senderAccountId).toBeNull();
  });
});

describe('mergeWizardState — precedence', () => {
  const persisted = {
    isCampaignFlow: true,
    channel: 'email',
    senderAccountId: 7,
    senderAccountName: 'Sales',
    dataSource: 'sheet',
    sheetUrl: 'https://docs.google.com/spreadsheets/d/persisted/edit',
    zaloGroupIds: [],
    schedule: { mode: 'drip', days: 3, slotsPerDay: 1 },
    planApproved: true,
    senderOtherRequested: false,
    hasContentPlan: true,
  };

  it('persisted fills gaps when markers are missing from history (reload case)', () => {
    const derived = extractWizardState([
      { role: 'user', content: 'Tạo chiến dịch ra mắt sản phẩm' },
    ]);
    const merged = mergeWizardState(persisted, derived, { lastUserText: 'Tạo chiến dịch ra mắt sản phẩm' });
    expect(merged.channel).toBe('email');
    expect(merged.senderAccountId).toBe(7);
    expect(merged.dataSource).toBe('sheet');
    expect(merged.schedule).toEqual({ mode: 'drip', days: 3, slotsPerDay: 1 });
    expect(merged.planApproved).toBe(true);
  });

  it('explicit marker in derived wins over persisted', () => {
    const derived = extractWizardState([
      { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"email","accountId":9,"accountName":"Support"}\nSupport' },
    ]);
    const merged = mergeWizardState(persisted, derived, {});
    expect(merged.senderAccountId).toBe(9);
    expect(merged.senderAccountName).toBe('Support');
  });

  it('newest derived sheetUrl wins; persisted survives when history has none', () => {
    const withUrl = extractWizardState([
      { role: 'user', content: 'https://docs.google.com/spreadsheets/d/fresh/edit' },
    ]);
    expect(mergeWizardState(persisted, withUrl, {}).sheetUrl)
      .toBe('https://docs.google.com/spreadsheets/d/fresh/edit');

    const withoutUrl = extractWizardState([{ role: 'user', content: 'ok tiếp tục đi' }]);
    expect(mergeWizardState(persisted, withoutUrl, {}).sheetUrl)
      .toBe('https://docs.google.com/spreadsheets/d/persisted/edit');
  });

  it('channel switch blocks gap-filling of downstream fields from persisted', () => {
    const derived = extractWizardState([
      { role: 'user', content: '[wizard]{"gate":"channel","channel":"zalo"}\nĐổi qua Zalo' },
    ]);
    const merged = mergeWizardState(persisted, derived, {});
    expect(merged.channel).toBe('zalo');
    expect(merged.senderAccountId).toBeNull();
    expect(merged.dataSource).toBeNull();
    expect(merged.schedule).toBeNull();
    expect(merged.planApproved).toBe(false);
    expect(merged.sheetUrl).toBeNull();
  });

  it('re-selecting the SAME channel does not wipe persisted downstream answers', () => {
    const derived = extractWizardState([
      { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nEmail' },
    ]);
    const merged = mergeWizardState(persisted, derived, {});
    expect(merged.channel).toBe('email');
    expect(merged.senderAccountId).toBe(7);
    expect(merged.dataSource).toBe('sheet');
  });

  it('revision text resets plan flags even when persisted approved', () => {
    const derived = extractWizardState([
      { role: 'user', content: 'Góp ý chỉnh kế hoạch: đổi giờ gửi' },
    ]);
    const merged = mergeWizardState(persisted, derived, { lastUserText: 'Góp ý chỉnh kế hoạch: đổi giờ sending' });
    expect(merged.planApproved).toBe(false);
    expect(merged.hasContentPlan).toBe(false);
  });

  it('handles null persisted (legacy session) as pass-through of derived', () => {
    const derived = extractWizardState([
      { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nEmail' },
    ]);
    const merged = mergeWizardState(null, derived, {});
    expect(merged.channel).toBe('email');
    expect(merged.senderAccountId).toBeNull();
    expect(merged.planApproved).toBe(false);
  });
});

describe('normalizeWizardState / computeWizardMeta', () => {
  it('returns empty state for null, wrong version, or garbage', () => {
    const empty = createEmptyWizardState();
    expect(normalizeWizardState(null)).toEqual(empty);
    expect(normalizeWizardState({ v: 2, gates: { channel: 'email' } })).toEqual(empty);
    expect(normalizeWizardState('what')).toEqual(empty);
  });

  it('deep-defaults missing sections while keeping known values', () => {
    const normalized = normalizeWizardState({ v: 1, gates: { channel: 'zalo' } });
    expect(normalized.gates.channel).toBe('zalo');
    expect(normalized.gates.zaloGroupIds).toEqual([]);
    expect(normalized.plan.savedTemplates).toEqual([]);
    expect(normalized.brief.contentMode).toBeNull();
    expect(normalized.meta.lastGateCount).toBe(0);
  });

  it('counts consecutive same-gate asks and preserves deadEndLoggedAt within a streak', () => {
    let meta = computeWizardMeta({}, 'senderAccount');
    expect(meta).toMatchObject({ lastGate: 'senderAccount', lastGateCount: 1, deadEndLoggedAt: null });

    meta = computeWizardMeta({ ...meta, deadEndLoggedAt: '2026-07-11T00:00:00.000Z' }, 'senderAccount');
    expect(meta.lastGateCount).toBe(2);
    expect(meta.deadEndLoggedAt).toBe('2026-07-11T00:00:00.000Z');

    meta = computeWizardMeta(meta, 'schedule');
    expect(meta).toMatchObject({ lastGate: 'schedule', lastGateCount: 1, deadEndLoggedAt: null });

    meta = computeWizardMeta(meta, null);
    expect(meta).toMatchObject({ lastGate: null, lastGateCount: 0, deadEndLoggedAt: null });
  });
});
