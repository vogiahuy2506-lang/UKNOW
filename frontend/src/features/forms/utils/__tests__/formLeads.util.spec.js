import { describe, it, expect } from 'vitest';
import { buildAnswerEntries, getSubmissionDisplayStatus } from '../formLeads.util.js';

describe('getSubmissionDisplayStatus', () => {
  const now = new Date('2026-10-11T00:00:00Z').getTime();

  it('pending_payment còn hạn giữ chỗ → vẫn pending_payment', () => {
    expect(getSubmissionDisplayStatus({ status: 'pending_payment', holdExpiresAt: '2026-10-11T01:00:00Z' }, now)).toBe(
      'pending_payment'
    );
  });

  it('pending_payment hết hạn giữ chỗ (kể cả đúng mốc) → hold_expired', () => {
    expect(getSubmissionDisplayStatus({ status: 'pending_payment', holdExpiresAt: '2026-10-10T23:00:00Z' }, now)).toBe(
      'hold_expired'
    );
    expect(getSubmissionDisplayStatus({ status: 'pending_payment', holdExpiresAt: '2026-10-11T00:00:00Z' }, now)).toBe(
      'hold_expired'
    );
  });

  it('chỉ pending_payment mới thành hold_expired — trạng thái khác giữ nguyên dù holdExpiresAt đã qua', () => {
    expect(getSubmissionDisplayStatus({ status: 'confirmed', holdExpiresAt: '2020-01-01T00:00:00Z' }, now)).toBe('confirmed');
    expect(getSubmissionDisplayStatus({ status: 'cancelled', holdExpiresAt: '2020-01-01T00:00:00Z' }, now)).toBe('cancelled');
  });

  it('thiếu status → submitted; pending_payment không có holdExpiresAt → pending_payment', () => {
    expect(getSubmissionDisplayStatus({}, now)).toBe('submitted');
    expect(getSubmissionDisplayStatus({ status: 'pending_payment' }, now)).toBe('pending_payment');
  });
});

describe('buildAnswerEntries', () => {
  const fields = [
    { key: 'a', label: 'Họ tên' },
    { key: 'b', label: 'Dịch vụ' },
    { key: 'c', label: 'Ghi chú' },
  ];

  it('sắp theo thứ tự trường biểu mẫu, không theo thứ tự khoá trong answers', () => {
    const entries = buildAnswerEntries({ c: 'x', a: 'y', b: 'z' }, fields);
    expect(entries.map((e) => e.key)).toEqual(['a', 'b', 'c']);
  });

  it('ưu tiên nhãn trong ảnh chụp, thiếu thì nhãn của trường, thiếu nữa thì chính khoá', () => {
    const entries = buildAnswerEntries(
      { a: { label: 'Nhãn lúc nộp', type: 'short_text', value: 'v1' }, b: 'v2', zzz: 'v3' },
      fields
    );
    expect(entries).toEqual([
      { key: 'a', label: 'Nhãn lúc nộp', value: 'v1' },
      { key: 'b', label: 'Dịch vụ', value: 'v2' },
      { key: 'zzz', label: 'zzz', value: 'v3' },
    ]);
  });

  it('khoá không còn trong biểu mẫu xếp cuối, theo thứ tự bảng chữ cái', () => {
    const entries = buildAnswerEntries({ y: '1', x: '2', a: '3' }, fields);
    expect(entries.map((e) => e.key)).toEqual(['a', 'x', 'y']);
  });

  it('giá trị mảng (checkbox) nối bằng dấu phẩy; null/undefined → chuỗi rỗng; số/boolean → chuỗi', () => {
    const entries = buildAnswerEntries(
      {
        a: { label: 'A', value: ['Một', 'Hai'] },
        b: { label: 'B', value: null },
        c: { label: 'C', value: 0 },
        d: { label: 'D', value: false },
      },
      fields
    );
    expect(entries.map((e) => e.value)).toEqual(['Một, Hai', '', '0', 'false']);
  });

  it('nhãn ảnh chụp toàn khoảng trắng coi như không có', () => {
    const entries = buildAnswerEntries({ a: { label: '   ', value: 'v' } }, fields);
    expect(entries[0].label).toBe('Họ tên');
  });

  it('đầu vào hỏng (null, mảng, chuỗi) → mảng rỗng, không ném lỗi', () => {
    expect(buildAnswerEntries(null, fields)).toEqual([]);
    expect(buildAnswerEntries(undefined, undefined)).toEqual([]);
    expect(buildAnswerEntries([1, 2], fields)).toEqual([]);
    expect(buildAnswerEntries('abc', fields)).toEqual([]);
  });

  it('formFields không phải mảng → vẫn dựng được từ ảnh chụp / khoá', () => {
    const entries = buildAnswerEntries({ a: { label: 'Họ tên', value: 'v' } }, null);
    expect(entries).toEqual([{ key: 'a', label: 'Họ tên', value: 'v' }]);
  });
});
