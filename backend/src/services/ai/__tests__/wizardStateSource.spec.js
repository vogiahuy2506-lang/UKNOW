import { describe, expect, it } from '@jest/globals';
import {
  buildBackfillStamp,
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
