import { describe, it, expect } from 'vitest';
import { formatAnswerForDisplay, isDisplayBlockAnswer } from '../formAnswerDisplay.util.js';
import { buildAnswerEntries } from '../formLeads.util.js';

const t = (key) => ({ 'forms.answerValue.yes': 'Có', 'forms.answerValue.no': 'Không' }[key] ?? key);

describe('formatAnswerForDisplay (PR-4)', () => {
  it('rating → "4/5 ★" (số nguyên 1..5); giá trị ngoài khoảng hiện nguyên văn thay vì bịa số sao', () => {
    expect(formatAnswerForDisplay('rating', 4, t)).toBe('4/5 ★');
    expect(formatAnswerForDisplay('rating', '5', t)).toBe('5/5 ★');
    expect(formatAnswerForDisplay('rating', 1, t)).toBe('1/5 ★');
    expect(formatAnswerForDisplay('rating', 9, t)).toBe('9');
    expect(formatAnswerForDisplay('rating', 0, t)).toBe('0');
  });

  it('yes_no → Có / Không theo hàm dịch; giá trị lạ hoặc thiếu hàm dịch thì hiện nguyên văn', () => {
    expect(formatAnswerForDisplay('yes_no', 'yes', t)).toBe('Có');
    expect(formatAnswerForDisplay('yes_no', 'no', t)).toBe('Không');
    expect(formatAnswerForDisplay('yes_no', 'maybe', t)).toBe('maybe');
    expect(formatAnswerForDisplay('yes_no', 'yes')).toBe('yes');
  });

  it('time hiện như nhập; loại cũ giữ nguyên hành vi (checkbox nối ", ", rỗng → "")', () => {
    expect(formatAnswerForDisplay('time', '14:30', t)).toBe('14:30');
    expect(formatAnswerForDisplay('checkbox', ['A', 'B'], t)).toBe('A, B');
    expect(formatAnswerForDisplay('short_text', 'abc', t)).toBe('abc');
    expect(formatAnswerForDisplay('number', 12, t)).toBe('12');
    expect(formatAnswerForDisplay('short_text', null, t)).toBe('');
    expect(formatAnswerForDisplay(undefined, undefined, t)).toBe('');
  });
});

describe('isDisplayBlockAnswer', () => {
  it('chỉ true với ảnh chụp mang loại heading / paragraph / page_break', () => {
    expect(isDisplayBlockAnswer({ label: 'x', type: 'heading', value: 'y' })).toBe(true);
    expect(isDisplayBlockAnswer({ label: 'x', type: 'paragraph', value: 'y' })).toBe(true);
    expect(isDisplayBlockAnswer({ label: 'x', type: 'page_break', value: 'y' })).toBe(true);
    expect(isDisplayBlockAnswer({ label: 'x', type: 'rating', value: 3 })).toBe(false);
    expect(isDisplayBlockAnswer('heading')).toBe(false);
    expect(isDisplayBlockAnswer(null)).toBe(false);
  });
});

describe('buildAnswerEntries — loại trường mới (PR-4)', () => {
  const fields = [
    { key: 'h', label: 'Phần 1', type: 'heading' },
    { key: 'r', label: 'Hài lòng', type: 'rating' },
    { key: 'p', label: 'Lời dẫn', type: 'paragraph' },
    { key: 'y', label: 'Dùng thử', type: 'yes_no' },
    { key: 't', label: 'Giờ gọi', type: 'time' },
  ];

  it('định dạng rating / yes_no theo loại trong ảnh chụp; bỏ mục của khối hiển thị (theo ảnh chụp hoặc theo trường hiện tại)', () => {
    const entries = buildAnswerEntries(
      {
        r: { label: 'Hài lòng', type: 'rating', value: 4 },
        y: { label: 'Dùng thử', type: 'yes_no', value: 'no' },
        t: { label: 'Giờ gọi', type: 'time', value: '09:30' },
        h: { label: 'Phần 1', type: 'heading', value: 'rác' }, // ảnh chụp là khối hiển thị
        p: 'rác khác', // không có ảnh chụp nhưng trường hiện tại là paragraph
      },
      fields,
      t
    );
    expect(entries).toEqual([
      { key: 'r', label: 'Hài lòng', value: '4/5 ★' },
      { key: 'y', label: 'Dùng thử', value: 'Không' },
      { key: 't', label: 'Giờ gọi', value: '09:30' },
    ]);
  });

  it('ảnh chụp thiếu `type` thì lấy loại hiện tại của trường', () => {
    const entries = buildAnswerEntries({ r: { label: 'Hài lòng', value: 5 }, y: 'yes' }, fields, t);
    expect(entries.map((e) => e.value)).toEqual(['5/5 ★', 'Có']);
  });

  it('không truyền hàm dịch (gọi kiểu cũ 2 tham số) vẫn chạy: yes_no hiện nguyên giá trị', () => {
    const entries = buildAnswerEntries({ y: { label: 'Dùng thử', type: 'yes_no', value: 'yes' } }, fields);
    expect(entries).toEqual([{ key: 'y', label: 'Dùng thử', value: 'yes' }]);
  });
});
