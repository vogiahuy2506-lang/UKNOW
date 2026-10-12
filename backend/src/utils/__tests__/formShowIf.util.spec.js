/**
 * PR-8a (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11) — hiện / ẩn ô theo câu trả lời.
 * Phủ: hàm thuần dùng chung (`checkShowIfCondition`, `getVisibleFieldKeys`), chuẩn hoá lúc lưu (`normalizeFormFields` →
 * `normalizeShowIf`), và validate bài nộp (`validateFormSubmission`) với trường ẩn / hiện.
 */
import { describe, it, expect } from '@jest/globals';
import {
  MAX_SHOW_IF_CONDITIONS,
  SHOW_IF_OPERATORS,
  checkShowIfCondition,
  getShowIfOperatorsForType,
  getVisibleFieldKeys,
} from '../formShowIf.util.js';
import { normalizeFormFields } from '../formDefinition.util.js';
import { validateFormSubmission } from '../formSubmission.util.js';

const opt = (...values) => values.map((v) => ({ label: v, value: v }));

describe('checkShowIfCondition — toán tử và giá trị theo loại nguồn', () => {
  const select = { key: 'f_sel', type: 'select', label: 'Dịch vụ', options: opt('Spa', 'Gội đầu') };
  const checkbox = { key: 'f_chk', type: 'checkbox', label: 'Quan tâm', options: opt('A', 'B') };

  it('bảng toán tử theo loại ghim từng phần tử', () => {
    expect(SHOW_IF_OPERATORS).toEqual(['equals', 'not_equals', 'contains', 'answered', 'not_answered']);
    const eq = ['equals', 'not_equals', 'answered', 'not_answered'];
    const ans = ['answered', 'not_answered'];
    expect(getShowIfOperatorsForType('select')).toEqual(eq);
    expect(getShowIfOperatorsForType('radio')).toEqual(eq);
    expect(getShowIfOperatorsForType('yes_no')).toEqual(eq);
    expect(getShowIfOperatorsForType('rating')).toEqual(eq);
    expect(getShowIfOperatorsForType('number')).toEqual(eq);
    expect(getShowIfOperatorsForType('checkbox')).toEqual(['contains', 'answered', 'not_answered']);
    for (const t of ['short_text', 'long_text', 'email', 'phone', 'date', 'time']) expect(getShowIfOperatorsForType(t)).toEqual(ans);
    for (const t of ['file', 'heading', 'paragraph', 'page_break', 'lạ', undefined]) expect(getShowIfOperatorsForType(t)).toEqual([]);
  });

  it('nguồn thiếu → reason source; loại không làm nguồn → sourceType', () => {
    expect(checkShowIfCondition(undefined, 'answered')).toEqual({ ok: false, reason: 'source' });
    expect(checkShowIfCondition({ type: 'file' }, 'answered')).toEqual({ ok: false, reason: 'sourceType' });
    expect(checkShowIfCondition({ type: 'heading' }, 'answered')).toEqual({ ok: false, reason: 'sourceType' });
  });

  it('toán tử sai loại nguồn → operator (contains cho select, equals cho checkbox, equals cho text)', () => {
    expect(checkShowIfCondition(select, 'contains', 'Spa')).toEqual({ ok: false, reason: 'operator' });
    expect(checkShowIfCondition(checkbox, 'equals', 'A')).toEqual({ ok: false, reason: 'operator' });
    expect(checkShowIfCondition({ type: 'short_text' }, 'equals', 'x')).toEqual({ ok: false, reason: 'operator' });
    expect(checkShowIfCondition(select, 'gt', '1')).toEqual({ ok: false, reason: 'operator' });
  });

  it('giá trị: lựa chọn phải CÓ THẬT, yes/no, 1..5, số hữu hạn; answered/not_answered bỏ value', () => {
    expect(checkShowIfCondition(select, 'equals', 'Spa')).toEqual({ ok: true, operator: 'equals', value: 'Spa' });
    expect(checkShowIfCondition(select, 'equals', ' Spa ')).toEqual({ ok: true, operator: 'equals', value: 'Spa' });
    expect(checkShowIfCondition(select, 'equals', 'Không có')).toEqual({ ok: false, reason: 'value' });
    expect(checkShowIfCondition(select, 'equals', undefined)).toEqual({ ok: false, reason: 'value' });
    expect(checkShowIfCondition(checkbox, 'contains', 'B')).toEqual({ ok: true, operator: 'contains', value: 'B' });
    expect(checkShowIfCondition(checkbox, 'contains', 'Z')).toEqual({ ok: false, reason: 'value' });

    const yn = { type: 'yes_no' };
    expect(checkShowIfCondition(yn, 'equals', 'YES')).toEqual({ ok: true, operator: 'equals', value: 'yes' });
    expect(checkShowIfCondition(yn, 'not_equals', 'no')).toEqual({ ok: true, operator: 'not_equals', value: 'no' });
    expect(checkShowIfCondition(yn, 'equals', 'maybe')).toEqual({ ok: false, reason: 'value' });

    const rating = { type: 'rating' };
    expect(checkShowIfCondition(rating, 'equals', 5)).toEqual({ ok: true, operator: 'equals', value: 5 });
    expect(checkShowIfCondition(rating, 'equals', '3')).toEqual({ ok: true, operator: 'equals', value: 3 });
    for (const bad of [0, 6, '4.5', 'abc', '', null, true]) {
      expect(checkShowIfCondition(rating, 'equals', bad)).toEqual({ ok: false, reason: 'value' });
    }

    const number = { type: 'number' };
    expect(checkShowIfCondition(number, 'equals', '12.5')).toEqual({ ok: true, operator: 'equals', value: 12.5 });
    expect(checkShowIfCondition(number, 'not_equals', -3)).toEqual({ ok: true, operator: 'not_equals', value: -3 });
    for (const bad of ['abc', '', null, NaN, Infinity, '1e3', '1,5']) {
      expect(checkShowIfCondition(number, 'equals', bad)).toEqual({ ok: false, reason: 'value' });
    }

    // answered / not_answered: value bị bỏ dù gửi gì
    expect(checkShowIfCondition(select, 'answered', 'bất kỳ')).toEqual({ ok: true, operator: 'answered' });
    expect(checkShowIfCondition({ type: 'short_text' }, 'not_answered')).toEqual({ ok: true, operator: 'not_answered' });
  });
});

describe('getVisibleFieldKeys — đánh giá điều kiện', () => {
  const cond = (fieldKey, operator, value) => ({ fieldKey, operator, ...(value !== undefined ? { value } : {}) });
  const showIf = (conditions, match = 'all') => ({ match, conditions });

  const base = [
    { key: 'q_sel', type: 'select', label: 'Dịch vụ', options: opt('Spa', 'Gội đầu') },
    { key: 'q_chk', type: 'checkbox', label: 'Quan tâm', options: opt('A', 'B', 'C') },
    { key: 'q_yn', type: 'yes_no', label: 'Có xe?' },
    { key: 'q_star', type: 'rating', label: 'Điểm' },
    { key: 'q_num', type: 'number', label: 'Số người' },
    { key: 'q_txt', type: 'short_text', label: 'Ghi chú' },
  ];
  const visibleOf = (target, answers) => getVisibleFieldKeys([...base, { key: 'target', type: 'short_text', label: 'T', ...target }], answers).has('target');

  it('không có showIf → luôn hiện; page_break luôn hiện', () => {
    const keys = getVisibleFieldKeys([...base, { key: 'pb', type: 'page_break', label: '' }], {});
    expect([...keys]).toEqual([...base.map((f) => f.key), 'pb']);
  });

  it('equals / not_equals với select: chưa trả lời thì equals sai còn not_equals ĐÚNG', () => {
    const t = { showIf: showIf([cond('q_sel', 'equals', 'Spa')]) };
    expect(visibleOf(t, { q_sel: 'Spa' })).toBe(true);
    expect(visibleOf(t, { q_sel: 'Gội đầu' })).toBe(false);
    expect(visibleOf(t, {})).toBe(false);
    const n = { showIf: showIf([cond('q_sel', 'not_equals', 'Spa')]) };
    expect(visibleOf(n, { q_sel: 'Spa' })).toBe(false);
    expect(visibleOf(n, { q_sel: 'Gội đầu' })).toBe(true);
    expect(visibleOf(n, {})).toBe(true);
  });

  it('contains với checkbox: mảng, chuỗi đơn lẻ, mảng rỗng', () => {
    const t = { showIf: showIf([cond('q_chk', 'contains', 'B')]) };
    expect(visibleOf(t, { q_chk: ['A', 'B'] })).toBe(true);
    expect(visibleOf(t, { q_chk: 'B' })).toBe(true);
    expect(visibleOf(t, { q_chk: ['A', 'C'] })).toBe(false);
    expect(visibleOf(t, { q_chk: [] })).toBe(false);
    expect(visibleOf(t, {})).toBe(false);
  });

  it('answered / not_answered: chuỗi toàn khoảng trắng, mảng rỗng, số 0 của rating/number', () => {
    const a = { showIf: showIf([cond('q_txt', 'answered')]) };
    expect(visibleOf(a, { q_txt: 'x' })).toBe(true);
    expect(visibleOf(a, { q_txt: '   ' })).toBe(false);
    expect(visibleOf(a, { q_txt: '' })).toBe(false);
    expect(visibleOf(a, {})).toBe(false);
    const na = { showIf: showIf([cond('q_txt', 'not_answered')]) };
    expect(visibleOf(na, { q_txt: '  ' })).toBe(true);
    expect(visibleOf(na, { q_txt: 'x' })).toBe(false);
    const chk = { showIf: showIf([cond('q_chk', 'answered')]) };
    expect(visibleOf(chk, { q_chk: [] })).toBe(false);
    expect(visibleOf(chk, { q_chk: ['A'] })).toBe(true);
    const num = { showIf: showIf([cond('q_num', 'answered')]) };
    expect(visibleOf(num, { q_num: 0 })).toBe(true);
    expect(visibleOf(num, { q_num: '0' })).toBe(true);
  });

  it('yes_no / rating / number so sánh theo giá trị, kiểu chuỗi và số đều được', () => {
    expect(visibleOf({ showIf: showIf([cond('q_yn', 'equals', 'yes')]) }, { q_yn: 'yes' })).toBe(true);
    expect(visibleOf({ showIf: showIf([cond('q_yn', 'equals', 'yes')]) }, { q_yn: 'no' })).toBe(false);
    expect(visibleOf({ showIf: showIf([cond('q_star', 'equals', 4)]) }, { q_star: 4 })).toBe(true);
    expect(visibleOf({ showIf: showIf([cond('q_star', 'equals', 4)]) }, { q_star: '4' })).toBe(true);
    expect(visibleOf({ showIf: showIf([cond('q_star', 'equals', 4)]) }, { q_star: 5 })).toBe(false);
    expect(visibleOf({ showIf: showIf([cond('q_star', 'not_equals', 4)]) }, { q_star: '' })).toBe(true);
    expect(visibleOf({ showIf: showIf([cond('q_num', 'equals', 10)]) }, { q_num: '10.0' })).toBe(true);
    expect(visibleOf({ showIf: showIf([cond('q_num', 'equals', 10)]) }, { q_num: 'abc' })).toBe(false);
  });

  it('match all: mọi điều kiện đúng mới hiện; match any: một đúng là hiện', () => {
    const conditions = [cond('q_sel', 'equals', 'Spa'), cond('q_yn', 'equals', 'yes')];
    expect(visibleOf({ showIf: showIf(conditions, 'all') }, { q_sel: 'Spa', q_yn: 'yes' })).toBe(true);
    expect(visibleOf({ showIf: showIf(conditions, 'all') }, { q_sel: 'Spa', q_yn: 'no' })).toBe(false);
    expect(visibleOf({ showIf: showIf(conditions, 'any') }, { q_sel: 'Spa', q_yn: 'no' })).toBe(true);
    expect(visibleOf({ showIf: showIf(conditions, 'any') }, { q_sel: 'Gội đầu', q_yn: 'no' })).toBe(false);
  });

  it('áp cho cả khối tiêu đề / đoạn chữ', () => {
    const fields = [
      base[0],
      { key: 'h1', type: 'heading', label: 'Phần Spa', showIf: showIf([cond('q_sel', 'equals', 'Spa')]) },
      { key: 'p1', type: 'paragraph', label: 'Lưu ý', showIf: showIf([cond('q_sel', 'equals', 'Spa')]) },
    ];
    expect([...getVisibleFieldKeys(fields, { q_sel: 'Spa' })]).toEqual(['q_sel', 'h1', 'p1']);
    expect([...getVisibleFieldKeys(fields, { q_sel: 'Gội đầu' })]).toEqual(['q_sel']);
  });

  it('nguồn đang ẩn coi như CHƯA trả lời → ẩn lan theo chuỗi, kể cả khi client gửi kèm giá trị cho trường ẩn', () => {
    const fields = [
      { key: 'a', type: 'yes_no', label: 'A' },
      { key: 'b', type: 'short_text', label: 'B', showIf: showIf([cond('a', 'equals', 'yes')]) },
      { key: 'c', type: 'short_text', label: 'C', showIf: showIf([cond('b', 'answered')]) },
      { key: 'd', type: 'short_text', label: 'D', showIf: showIf([cond('b', 'not_answered')]) },
    ];
    // a=no → b ẩn; b có giá trị "lén" nhưng vì b ẩn nên c ẩn (b "chưa trả lời") còn d hiện.
    expect([...getVisibleFieldKeys(fields, { a: 'no', b: 'lén' })]).toEqual(['a', 'd']);
    expect([...getVisibleFieldKeys(fields, { a: 'yes', b: 'có' })]).toEqual(['a', 'b', 'c']);
    expect([...getVisibleFieldKeys(fields, { a: 'yes' })]).toEqual(['a', 'b', 'd']);
  });

  it('dữ liệu hỏng: nguồn không còn / đứng sau / loại file / toán tử sai → điều kiện đó bị bỏ qua, không còn điều kiện nào thì LUÔN HIỆN', () => {
    const fields = [
      { key: 'x', type: 'short_text', label: 'X', showIf: showIf([cond('khong_co', 'answered')]) },
      { key: 'y', type: 'short_text', label: 'Y', showIf: showIf([cond('z', 'answered')]) },
      { key: 'z', type: 'short_text', label: 'Z' },
      { key: 'f', type: 'file', label: 'Tệp' },
      { key: 'w', type: 'short_text', label: 'W', showIf: showIf([cond('f', 'answered')]) },
      { key: 'v', type: 'select', label: 'V', options: opt('a'), showIf: showIf([cond('z', 'equals', 'sai')]) },
      { key: 'u', type: 'short_text', label: 'U', showIf: showIf([cond('z', 'answered'), cond('khong_co', 'answered')], 'all') },
    ];
    const visible = getVisibleFieldKeys(fields, {});
    expect(visible.has('x')).toBe(true);
    expect(visible.has('y')).toBe(true);
    expect(visible.has('w')).toBe(true);
    expect(visible.has('v')).toBe(true);
    // u: điều kiện hỏng bị bỏ, điều kiện còn lại (z answered) chưa thoả → ẩn
    expect(visible.has('u')).toBe(false);
    expect(getVisibleFieldKeys(fields, { z: 'có' }).has('u')).toBe(true);
  });

  it('đầu vào lạ không ném lỗi', () => {
    expect([...getVisibleFieldKeys(null, null)]).toEqual([]);
    expect([...getVisibleFieldKeys([null, 5, { key: 'a', type: 'short_text', showIf: 'rác' }], [])]).toEqual(['a']);
    expect(MAX_SHOW_IF_CONDITIONS).toBe(5);
  });
});

describe('normalizeFormFields — showIf', () => {
  const sel = { key: 'q_sel', type: 'select', label: 'Dịch vụ', options: ['Spa', 'Gội đầu'] };
  const withShowIf = (showIf, extra = {}) => [sel, { key: 'q_t', type: 'short_text', label: 'Chi tiết', showIf, ...extra }];
  const errorOf = (fn) => {
    try {
      fn();
    } catch (e) {
      return e;
    }
    return null;
  };

  it('hợp lệ: ghi `{ match, conditions }` chuẩn hoá (value đã chuẩn, answered không có value); trường cũ không có khoá showIf', () => {
    const out = normalizeFormFields(withShowIf({ conditions: [{ fieldKey: 'q_sel', operator: 'EQUALS', value: ' Spa ' }] }));
    expect(out[0]).not.toHaveProperty('showIf');
    expect(out[1].showIf).toEqual({ match: 'all', conditions: [{ fieldKey: 'q_sel', operator: 'equals', value: 'Spa' }] });

    const answered = normalizeFormFields(withShowIf({ match: 'ANY', conditions: [{ fieldKey: 'q_sel', operator: 'answered', value: 'bỏ' }] }));
    expect(answered[1].showIf).toEqual({ match: 'any', conditions: [{ fieldKey: 'q_sel', operator: 'answered' }] });
  });

  it('showIf null / conditions rỗng / thiếu → không ghi khoá (luôn hiện)', () => {
    for (const showIf of [null, undefined, { conditions: [] }, { match: 'any' }, { conditions: null }]) {
      expect(normalizeFormFields(withShowIf(showIf))[1]).not.toHaveProperty('showIf');
    }
  });

  it('áp cho heading / paragraph; page_break bỏ qua showIf gửi lên', () => {
    const showIf = { conditions: [{ fieldKey: 'q_sel', operator: 'equals', value: 'Spa' }] };
    const out = normalizeFormFields([
      sel,
      { type: 'heading', label: 'Phần Spa', showIf },
      { type: 'paragraph', label: 'Lưu ý Spa', showIf },
      { type: 'page_break', label: 'Bước 2', showIf },
    ]);
    expect(out[1].showIf.conditions).toHaveLength(1);
    expect(out[2].showIf.conditions).toHaveLength(1);
    expect(out[3]).not.toHaveProperty('showIf');
  });

  it('tham chiếu tới trường ĐỨNG SAU hoặc chính nó → 400 nêu rõ "đứng SAU"', () => {
    const after = errorOf(() => normalizeFormFields([
      { key: 'q_a', type: 'short_text', label: 'A', showIf: { conditions: [{ fieldKey: 'q_b', operator: 'answered' }] } },
      { key: 'q_b', type: 'short_text', label: 'B' },
    ]));
    expect(after).toMatchObject({ statusCode: 400, code: 'INVALID_FORM_DEFINITION' });
    expect(after.message).toMatch(/đứng SAU/);

    const self = errorOf(() => normalizeFormFields([
      { key: 'q_a', type: 'short_text', label: 'A', showIf: { conditions: [{ fieldKey: 'q_a', operator: 'answered' }] } },
    ]));
    expect(self.message).toMatch(/đứng SAU/);
  });

  it('vòng A↔B bị chặn (một trong hai luôn trỏ tới sau)', () => {
    const err = errorOf(() => normalizeFormFields([
      { key: 'q_a', type: 'short_text', label: 'A', showIf: { conditions: [{ fieldKey: 'q_b', operator: 'answered' }] } },
      { key: 'q_b', type: 'short_text', label: 'B', showIf: { conditions: [{ fieldKey: 'q_a', operator: 'answered' }] } },
    ]));
    expect(err).not.toBeNull();
  });

  it('trường không tồn tại → 400 "không tồn tại"; thiếu fieldKey → 400', () => {
    const none = errorOf(() => normalizeFormFields(withShowIf({ conditions: [{ fieldKey: 'khong_co', operator: 'answered' }] })));
    expect(none.message).toMatch(/không tồn tại/);
    const empty = errorOf(() => normalizeFormFields(withShowIf({ conditions: [{ operator: 'answered' }] })));
    expect(empty.message).toMatch(/không tồn tại/);
  });

  it('nguồn là khối hiển thị hoặc trường tệp → 400 (không dùng làm điều kiện)', () => {
    const heading = errorOf(() => normalizeFormFields([
      { key: 'h_1', type: 'heading', label: 'Tiêu đề' },
      { key: 'q_t', type: 'short_text', label: 'T', showIf: { conditions: [{ fieldKey: 'h_1', operator: 'answered' }] } },
    ]));
    expect(heading.message).toMatch(/không dùng làm điều kiện được/);
    const file = errorOf(() => normalizeFormFields([
      { key: 'q_f', type: 'file', label: 'Tệp' },
      { key: 'q_t', type: 'short_text', label: 'T', showIf: { conditions: [{ fieldKey: 'q_f', operator: 'answered' }] } },
    ]));
    expect(file.message).toMatch(/không dùng làm điều kiện được/);
  });

  it('giá trị / toán tử / match sai → 400', () => {
    expect(errorOf(() => normalizeFormFields(withShowIf({ conditions: [{ fieldKey: 'q_sel', operator: 'equals', value: 'Không có' }] }))).message)
      .toMatch(/giá trị của điều kiện thứ 1 không hợp lệ/);
    expect(errorOf(() => normalizeFormFields(withShowIf({ conditions: [{ fieldKey: 'q_sel', operator: 'equals' }] }))).message)
      .toMatch(/giá trị của điều kiện thứ 1 không hợp lệ/);
    expect(errorOf(() => normalizeFormFields(withShowIf({ conditions: [{ fieldKey: 'q_sel', operator: 'contains', value: 'Spa' }] }))).message)
      .toMatch(/toán tử "contains" không dùng được/);
    expect(errorOf(() => normalizeFormFields(withShowIf({ match: 'xor', conditions: [{ fieldKey: 'q_sel', operator: 'answered' }] }))).message)
      .toMatch(/match chỉ nhận all hoặc any/);
    expect(errorOf(() => normalizeFormFields(withShowIf('rác'))).statusCode).toBe(400);
    expect(errorOf(() => normalizeFormFields(withShowIf({ conditions: 'x' }))).statusCode).toBe(400);
    expect(errorOf(() => normalizeFormFields(withShowIf({ conditions: ['x'] }))).statusCode).toBe(400);
  });

  it('tối đa 5 điều kiện: 5 qua, 6 → 400', () => {
    const five = Array.from({ length: 5 }, () => ({ fieldKey: 'q_sel', operator: 'answered' }));
    expect(normalizeFormFields(withShowIf({ conditions: five }))[1].showIf.conditions).toHaveLength(5);
    const six = [...five, { fieldKey: 'q_sel', operator: 'answered' }];
    expect(errorOf(() => normalizeFormFields(withShowIf({ conditions: six }))).message).toMatch(/vượt quá 5 điều kiện/);
  });

  it('value của rating/number được lưu dạng SỐ, yes_no dạng yes|no', () => {
    const out = normalizeFormFields([
      { key: 'q_r', type: 'rating', label: 'Sao' },
      { key: 'q_n', type: 'number', label: 'SL' },
      { key: 'q_y', type: 'yes_no', label: 'Xe?' },
      { key: 't1', type: 'short_text', label: 'T1', showIf: { conditions: [{ fieldKey: 'q_r', operator: 'equals', value: '2' }] } },
      { key: 't2', type: 'short_text', label: 'T2', showIf: { conditions: [{ fieldKey: 'q_n', operator: 'not_equals', value: '7.5' }] } },
      { key: 't3', type: 'short_text', label: 'T3', showIf: { conditions: [{ fieldKey: 'q_y', operator: 'equals', value: 'NO' }] } },
    ]);
    expect(out[3].showIf.conditions[0].value).toBe(2);
    expect(out[4].showIf.conditions[0].value).toBe(7.5);
    expect(out[5].showIf.conditions[0].value).toBe('no');
  });

  it('chạy lại qua chuẩn hoá cho cùng kết quả (idempotent): dữ liệu đã lưu đọc lên lưu lại không đổi', () => {
    const once = normalizeFormFields(withShowIf({ match: 'any', conditions: [{ fieldKey: 'q_sel', operator: 'equals', value: 'Spa' }] }));
    const twice = normalizeFormFields(once);
    expect(twice).toEqual(once);
  });
});

describe('validateFormSubmission — trường ẩn theo câu trả lời thật', () => {
  const fields = normalizeFormFields([
    { key: 'f_name', type: 'short_text', label: 'Họ tên', required: true, role: 'name' },
    { key: 'f_car', type: 'yes_no', label: 'Có xe?', required: true },
    { key: 'f_plate', type: 'short_text', label: 'Biển số', required: true, showIf: { conditions: [{ fieldKey: 'f_car', operator: 'equals', value: 'yes' }] } },
    { key: 'f_email', type: 'email', label: 'Email', required: true, role: 'email', showIf: { conditions: [{ fieldKey: 'f_car', operator: 'equals', value: 'no' }] } },
    { key: 'f_cv', type: 'file', label: 'Hồ sơ xe', required: true, showIf: { conditions: [{ fieldKey: 'f_car', operator: 'equals', value: 'yes' }] } },
  ]);
  const UPLOAD = '123e4567-e89b-42d3-a456-426614174000';

  it('ẩn → không bắt buộc, KHÔNG kiểm giá trị, câu trả lời gửi kèm bị BỎ (kể cả role email → không thành respondentEmail)', () => {
    const result = validateFormSubmission(
      fields,
      { f_name: 'An', f_car: 'yes', f_plate: '51A-12345', f_email: 'rác-không-phải-email' },
      {},
      { fileUploadsEnabled: false }
    );
    // f_car=yes: f_plate hiện, f_email ẩn (giá trị rác không bị kiểm). Trường tệp bỏ qua vì cờ tệp tắt (chuyện riêng của PR-4b).
    expect(result.answers.f_email).toBeUndefined();
    expect(result.respondentEmail).toBeNull();
    expect(Object.keys(result.answers).sort()).toEqual(['f_car', 'f_name', 'f_plate']);
  });

  it('đổi câu trả lời nguồn: ẩn f_plate (bắt buộc) thì không đòi, câu trả lời lén của nó bị bỏ, f_email hiện nên bắt buộc như cũ', () => {
    const ok = validateFormSubmission(fields, { f_name: 'An', f_car: 'no', f_plate: 'lén', f_email: 'A@B.vn' }, {}, {});
    expect(ok.answers.f_plate).toBeUndefined();
    expect(ok.answers.f_email.value).toBe('a@b.vn');
    expect(ok.respondentEmail).toBe('a@b.vn');

    expect(() => validateFormSubmission(fields, { f_name: 'An', f_car: 'no' }, {}, {})).toThrow(/Email.*bắt buộc/);
  });

  it('trường HIỆN vẫn bắt buộc như cũ', () => {
    expect(() => validateFormSubmission(fields, { f_name: 'An', f_car: 'yes' }, {}, {})).toThrow(/Biển số.*bắt buộc/);
  });

  it('nguồn (không bắt buộc) chưa trả lời: ô not_equals HIỆN và bắt buộc, ô equals ẩn', () => {
    const optionalSource = normalizeFormFields([
      { key: 'q_a', type: 'yes_no', label: 'A' },
      { key: 'q_b', type: 'short_text', label: 'B', required: true, showIf: { conditions: [{ fieldKey: 'q_a', operator: 'not_equals', value: 'yes' }] } },
      { key: 'q_c', type: 'short_text', label: 'C', required: true, showIf: { conditions: [{ fieldKey: 'q_a', operator: 'equals', value: 'yes' }] } },
    ]);
    expect(() => validateFormSubmission(optionalSource, {}, {}, {})).toThrow(/B.*bắt buộc/);
    expect(Object.keys(validateFormSubmission(optionalSource, { q_b: 'x', q_c: 'lén' }, {}, {}).answers)).toEqual(['q_b']);
  });

  it('trường file bị ẩn: không đòi tệp dù bắt buộc, uploadId và fileSkip gửi kèm bị bỏ (không vào fileInputs)', () => {
    const hidden = validateFormSubmission(
      fields,
      { f_name: 'An', f_car: 'no', f_email: 'a@b.vn', f_cv: [UPLOAD] },
      { fileSkip: { f_cv: 'token-lén' } },
      { fileUploadsEnabled: true }
    );
    expect(hidden.fileInputs).toBeUndefined();
    expect(hidden.answers.f_cv).toBeUndefined();
  });

  it('trường file HIỆN: bắt buộc như cũ (không tệp → lỗi), có tệp → vào fileInputs', () => {
    expect(() => validateFormSubmission(fields, { f_name: 'An', f_car: 'yes', f_plate: 'x' }, {}, { fileUploadsEnabled: true }))
      .toThrow(/Hồ sơ xe.*bắt buộc/);
    const shown = validateFormSubmission(fields, { f_name: 'An', f_car: 'yes', f_plate: 'x', f_cv: [UPLOAD] }, {}, { fileUploadsEnabled: true });
    expect(shown.fileInputs.f_cv.uploadIds).toEqual([UPLOAD]);
  });

  it('ẩn lan theo chuỗi: nguồn của điều kiện cũng đang ẩn thì trường phụ thuộc thấy nó "chưa trả lời"', () => {
    const chain = normalizeFormFields([
      { key: 'q_a', type: 'yes_no', label: 'A', required: true },
      { key: 'q_b', type: 'short_text', label: 'B', showIf: { conditions: [{ fieldKey: 'q_a', operator: 'equals', value: 'yes' }] } },
      { key: 'q_c', type: 'short_text', label: 'C', required: true, showIf: { conditions: [{ fieldKey: 'q_b', operator: 'answered' }] } },
    ]);
    // a=no → b ẩn → b "chưa trả lời" dù client gửi b → c ẩn nên không bắt buộc
    const result = validateFormSubmission(chain, { q_a: 'no', q_b: 'lén' }, {}, {});
    expect(Object.keys(result.answers)).toEqual(['q_a']);
    // a=yes, b trả lời → c hiện, bắt buộc
    expect(() => validateFormSubmission(chain, { q_a: 'yes', q_b: 'có' }, {}, {})).toThrow(/C.*bắt buộc/);
  });

  it('biểu mẫu KHÔNG có showIf: hành vi y như cũ (mọi trường hiện)', () => {
    const plain = normalizeFormFields([
      { key: 'q_p1', type: 'short_text', label: 'P1', required: true },
      { key: 'q_p2', type: 'short_text', label: 'P2' },
    ]);
    expect(() => validateFormSubmission(plain, { q_p2: 'x' }, {}, {})).toThrow(/P1.*bắt buộc/);
    expect(validateFormSubmission(plain, { q_p1: 'a', q_p2: 'b' }, {}, {}).answers.q_p2.value).toBe('b');
  });
});
