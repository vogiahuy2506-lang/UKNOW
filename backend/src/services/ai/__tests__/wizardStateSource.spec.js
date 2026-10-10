import { describe, expect, it } from '@jest/globals';
import { applyAssistantResponseToGates } from '../aiCampaignWizard.service.js';
import {
  buildBackfillStamp,
  diffChangedKeys,
  isWizardStateInSync,
  resolveWizardStateSource,
} from '../wizardStateSource.service.js';

const stateWithMeta = (meta) => ({ v: 1, gates: {}, plan: {}, brief: {}, meta });

describe('resolveWizardStateSource', () => {
  it('mặc định shadow; giá trị lạ cũng về shadow', () => {
    expect(resolveWizardStateSource(undefined)).toBe('shadow');
    expect(resolveWizardStateSource('')).toBe('shadow');
    expect(resolveWizardStateSource('bậy')).toBe('shadow');
  });

  it.each(['history', 'shadow', 'db'])('nhận %s (không phân biệt hoa thường/khoảng trắng)', (value) => {
    expect(resolveWizardStateSource(` ${value.toUpperCase()} `)).toBe(value);
  });
});

describe('isWizardStateInSync', () => {
  const ok = stateWithMeta({ historyBackfilledAt: '2026-10-10T00:00:00Z', foldedMessageCount: 6 });

  it('khớp khi đã backfill và số tin bằng nhau', () => {
    expect(isWizardStateInSync(ok, 6)).toEqual({ ok: true, reason: null });
  });

  it.each([
    ['không có state', null, 6, 'no_state'],
    ['v khác 1', { ...ok, v: 2 }, 6, 'no_state'],
    ['chưa backfill', stateWithMeta({ foldedMessageCount: 6 }), 6, 'not_backfilled'],
    ['không biết số tin thật', ok, null, 'count_unknown'],
    ['chưa có dấu số tin', stateWithMeta({ historyBackfilledAt: 'x' }), 6, 'no_folded_count'],
    ['lệch số tin (lượt ghi hỏng / tin chèn ngoài)', ok, 7, 'count_mismatch'],
  ])('rơi về replay: %s', (_label, raw, count, reason) => {
    expect(isWizardStateInSync(raw, count)).toEqual({ ok: false, reason });
  });
});

describe('buildBackfillStamp', () => {
  it('giữ mốc backfill đầu tiên', () => {
    expect(buildBackfillStamp({ historyBackfilledAt: 'cũ' }).historyBackfilledAt).toBe('cũ');
  });
  it('đặt mốc mới khi chưa có', () => {
    expect(buildBackfillStamp({}, new Date('2026-10-10T01:00:00Z')).historyBackfilledAt).toBe('2026-10-10T01:00:00.000Z');
  });
});

describe('diffChangedKeys', () => {
  it('chỉ trả khoá khác bản đầu lượt (so sâu)', () => {
    const start = { channel: 'email', zaloGroupIds: ['a'], planApproved: false, schedule: { mode: 'once' } };
    const turn = { channel: 'email', zaloGroupIds: ['a'], planApproved: false, schedule: { mode: 'drip', days: 3 }, senderAccountId: 7 };
    expect(diffChangedKeys(start, turn)).toEqual({ schedule: { mode: 'drip', days: 3 }, senderAccountId: 7 });
  });

  it('khoá mới (không có ở bản đầu lượt) được tính là thay đổi; đầu vào null an toàn', () => {
    expect(diffChangedKeys(null, { a: 1 })).toEqual({ a: 1 });
    expect(diffChangedKeys({ a: 1 }, null)).toEqual({});
  });
});

describe('applyAssistantResponseToGates', () => {
  it('content_plan: bật luồng, hasContentPlan, lịch drip mặc định và kênh từ ngày đầu', () => {
    const next = applyAssistantResponseToGates({ channel: null, schedule: null }, {
      type: 'content_plan',
      data: { totalDays: 3, days: [{ day: 1, channel: 'zalo_group' }] },
    });
    expect(next).toMatchObject({ isCampaignFlow: true, hasContentPlan: true, channel: 'zalo_group', schedule: { mode: 'drip', days: 3 } });
  });

  it('không đè kênh/lịch đã có', () => {
    const next = applyAssistantResponseToGates({ channel: 'email', schedule: { mode: 'once' } }, {
      type: 'content_plan',
      data: { totalDays: 3, days: [{ channel: 'zalo' }] },
    });
    expect(next.channel).toBe('email');
    expect(next.schedule).toEqual({ mode: 'once' });
  });

  it('template_draft sau content_plan ⇒ planApproved; không có kế hoạch thì không', () => {
    expect(applyAssistantResponseToGates({ hasContentPlan: true }, { type: 'template_draft' }).planApproved).toBe(true);
    expect(applyAssistantResponseToGates({ hasContentPlan: false }, { type: 'template_draft' }).planApproved).toBeUndefined();
  });

  it('tin thường không đổi gates và không mutate đầu vào', () => {
    const gates = Object.freeze({ channel: 'email' });
    expect(applyAssistantResponseToGates(gates, { type: 'text' })).toEqual({ channel: 'email' });
  });
});
