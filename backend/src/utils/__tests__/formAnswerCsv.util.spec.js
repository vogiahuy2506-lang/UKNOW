import { describe, it, expect } from '@jest/globals';
import {
  resolveCsvLang,
  formatAnswerForCsv,
  answerCellText,
  buildAnswerColumns,
} from '../formAnswerCsv.util.js';

describe('resolveCsvLang', () => {
  it('en / en-US → en; còn lại → vi', () => {
    expect(resolveCsvLang('en')).toBe('en');
    expect(resolveCsvLang('EN-us')).toBe('en');
    expect(resolveCsvLang('vi')).toBe('vi');
    expect(resolveCsvLang(undefined)).toBe('vi');
    expect(resolveCsvLang('fr')).toBe('vi');
  });
});

describe('formatAnswerForCsv', () => {
  it('rating → "4/5" (không có sao); giá trị ngoài 1..5 giữ nguyên', () => {
    expect(formatAnswerForCsv('rating', 4)).toBe('4/5');
    expect(formatAnswerForCsv('rating', '5')).toBe('5/5');
    expect(formatAnswerForCsv('rating', 9)).toBe('9');
  });

  it('yes_no → Có / Không (vi), Yes / No (en)', () => {
    expect(formatAnswerForCsv('yes_no', 'yes')).toBe('Có');
    expect(formatAnswerForCsv('yes_no', 'no')).toBe('Không');
    expect(formatAnswerForCsv('yes_no', 'yes', 'en')).toBe('Yes');
    expect(formatAnswerForCsv('yes_no', 'no', 'en')).toBe('No');
    expect(formatAnswerForCsv('yes_no', 'maybe')).toBe('maybe');
  });

  it('checkbox / mảng → nối ", " và bỏ phần tử rỗng', () => {
    expect(formatAnswerForCsv('checkbox', ['A', 'B', '', null])).toBe('A, B');
    expect(formatAnswerForCsv('checkbox', [])).toBe('');
  });

  it('trường tệp: value là mảng TÊN tệp → chỉ ghi tên, nối ", "', () => {
    expect(formatAnswerForCsv('file', ['cv.pdf', 'anh.png'])).toBe('cv.pdf, anh.png');
  });

  it('trường tệp mà value không phải mảng (dữ liệu lạ) → rỗng, không bao giờ lộ object', () => {
    expect(formatAnswerForCsv('file', { storageKey: 'uploads/1/x.pdf' })).toBe('');
    expect(formatAnswerForCsv('file', 'x')).toBe('');
  });

  it('time / date / số / chữ giữ nguyên; null / undefined → rỗng', () => {
    expect(formatAnswerForCsv('time', '09:30')).toBe('09:30');
    expect(formatAnswerForCsv('date', '2026-10-12')).toBe('2026-10-12');
    expect(formatAnswerForCsv('number', 12.5)).toBe('12.5');
    expect(formatAnswerForCsv('short_text', 'Xin chào')).toBe('Xin chào');
    expect(formatAnswerForCsv('short_text', null)).toBe('');
    expect(formatAnswerForCsv('short_text', undefined)).toBe('');
  });

  it('object lạ → JSON (như bản hiển thị ở frontend)', () => {
    expect(formatAnswerForCsv('short_text', { a: 1 })).toBe('{"a":1}');
  });
});

describe('answerCellText', () => {
  const answers = {
    f_name: { label: 'Họ tên', type: 'short_text', value: 'An' },
    f_rate: { label: 'Đánh giá', type: 'rating', value: 4 },
    f_ok: { label: 'Đồng ý', type: 'yes_no', value: 'yes' },
    f_file: { label: 'Hồ sơ', type: 'file', value: ['cv.pdf'], files: [{ name: 'cv.pdf', storageKey: 'uploads/1/forms/2/x.pdf' }], fileStatus: 'received' },
    f_head: { label: 'Phần 1', type: 'heading', value: 'x' },
  };

  it('đọc theo khoá, định dạng theo loại trong ảnh chụp', () => {
    expect(answerCellText(answers, 'f_name')).toBe('An');
    expect(answerCellText(answers, 'f_rate')).toBe('4/5');
    expect(answerCellText(answers, 'f_ok')).toBe('Có');
    expect(answerCellText(answers, 'f_ok', 'en')).toBe('Yes');
  });

  it('trường tệp chỉ ra tên tệp, không lộ khoá kho', () => {
    const text = answerCellText(answers, 'f_file');
    expect(text).toBe('cv.pdf');
    expect(text).not.toContain('uploads/');
  });

  it('khối hiển thị trong dữ liệu bẩn → rỗng', () => {
    expect(answerCellText(answers, 'f_head')).toBe('');
  });

  it('khoá thiếu / answers lạ → rỗng', () => {
    expect(answerCellText(answers, 'nope')).toBe('');
    expect(answerCellText(null, 'f_name')).toBe('');
    expect(answerCellText([], 'f_name')).toBe('');
  });

  it('giá trị thô (không phải ảnh chụp) vẫn đọc được', () => {
    expect(answerCellText({ k: 'abc' }, 'k')).toBe('abc');
  });
});

describe('buildAnswerColumns', () => {
  const formA = {
    id: 1,
    title: 'Đăng ký học',
    fields: [
      { key: 'a_title', type: 'heading', label: 'Phần 1' },
      { key: 'a_name', type: 'short_text', label: 'Họ tên' },
      { key: 'a_note', type: 'paragraph', label: 'Ghi chú' },
      { key: 'a_goal', type: 'long_text', label: 'Mục tiêu' },
      { key: 'a_break', type: 'page_break', label: '' },
      { key: 'a_file', type: 'file', label: 'Hồ sơ' },
    ],
  };
  const formB = {
    id: 2,
    title: 'Khảo sát',
    fields: [
      { key: 'b_name', type: 'short_text', label: 'Họ tên' },
      { key: 'b_nps', type: 'rating', label: 'Mức hài lòng' },
    ],
  };

  it('một biểu mẫu: cột theo nhãn, đúng thứ tự trường, KHÔNG có heading / paragraph / page_break', () => {
    const cols = buildAnswerColumns({ forms: [formA] });
    expect(cols.map((c) => c.header)).toEqual(['Họ tên', 'Mục tiêu', 'Hồ sơ']);
    expect(cols.map((c) => c.key)).toEqual(['a_name', 'a_goal', 'a_file']);
    expect(new Set(cols.map((c) => c.formId))).toEqual(new Set(['1']));
  });

  it('nhãn trùng giữa các biểu mẫu → "Nhãn (Tên biểu mẫu)"; nhãn không trùng giữ nguyên', () => {
    const cols = buildAnswerColumns({ forms: [formA, formB] });
    expect(cols.map((c) => c.header)).toEqual([
      'Họ tên (Đăng ký học)',
      'Mục tiêu',
      'Hồ sơ',
      'Họ tên (Khảo sát)',
      'Mức hài lòng',
    ]);
  });

  it('hai trường cùng nhãn trong MỘT biểu mẫu → thêm số thứ tự (2), (3)', () => {
    const form = {
      id: 3,
      title: 'F',
      fields: [
        { key: 'x1', type: 'short_text', label: 'Ý kiến' },
        { key: 'x2', type: 'short_text', label: 'Ý kiến' },
        { key: 'x3', type: 'short_text', label: 'ý kiến' },
      ],
    };
    expect(buildAnswerColumns({ forms: [form] }).map((c) => c.header)).toEqual(['Ý kiến', 'Ý kiến (2)', 'ý kiến (3)']);
  });

  it('khoá chỉ còn trong bài nộp cũ (trường đã xoá) vẫn có cột, xếp SAU các trường còn lại, nhãn lấy từ ảnh chụp', () => {
    const cols = buildAnswerColumns({
      forms: [formB],
      snapshotKeys: [
        { formId: 2, key: 'b_old', label: 'Câu hỏi cũ', type: 'short_text' },
        { formId: 2, key: 'b_name', label: 'Tên cũ', type: 'short_text' },
        { formId: 2, key: 'b_blk', label: 'Tiêu đề', type: 'heading' },
        { formId: 99, key: 'zzz', label: 'Của form khác', type: 'short_text' },
      ],
    });
    expect(cols.map((c) => c.key)).toEqual(['b_name', 'b_nps', 'b_old']);
    expect(cols.map((c) => c.header)).toEqual(['Họ tên', 'Mức hài lòng', 'Câu hỏi cũ']);
  });

  it('nhãn thiếu → dùng khoá', () => {
    const cols = buildAnswerColumns({ forms: [{ id: 5, title: 'F', fields: [{ key: 'k1', type: 'short_text', label: '  ' }] }] });
    expect(cols[0].header).toBe('k1');
  });

  it('tiêu đề trùng cột cố định (vd trường tên "Email") → thêm hậu tố, không để hai cột cùng tên', () => {
    const form = {
      id: 6,
      title: 'F',
      fields: [
        { key: 'e', type: 'email', label: 'Email' },
        { key: 't', type: 'short_text', label: 'Thời gian' },
      ],
    };
    const cols = buildAnswerColumns({ forms: [form], fixedHeaders: ['Thời gian', 'Email'], answerSuffix: '(câu trả lời)' });
    expect(cols.map((c) => c.header)).toEqual(['Email (câu trả lời)', 'Thời gian (câu trả lời)']);
  });

  it('không có biểu mẫu → không có cột', () => {
    expect(buildAnswerColumns({})).toEqual([]);
  });
});
