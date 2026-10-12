/**
 * HỢP ĐỒNG giữa hàm đánh giá điều kiện hiển thị của frontend (renderer + trình soạn) và của backend (nguồn sự thật) — PR-8a.
 * Frontend giữ bản sao `frontend/src/features/forms/utils/formShowIf.util.js`. Lệch hằng số, bảng toán tử, kết quả kiểm một điều kiện
 * hay tập ô đang hiện thì đỏ ở đây — thay vì khách thấy một ô mà server coi là ẩn (bị bỏ câu trả lời) hoặc ngược lại (server đòi ô mà
 * giao diện đã giấu: khách không thể gửi biểu mẫu).
 */
import { describe, expect, it } from '@jest/globals';
import * as be from '../formShowIf.util.js';
import * as fe from '../../../../frontend/src/features/forms/utils/formShowIf.util.js';
import viDictionary from '../../../../frontend/src/i18n/vi.js';
import enDictionary from '../../../../frontend/src/i18n/en.js';

const opt = (...values) => values.map((v) => ({ label: v, value: v }));

const TYPES = ['short_text', 'long_text', 'email', 'phone', 'number', 'select', 'radio', 'checkbox', 'date', 'rating', 'yes_no', 'time', 'file', 'heading', 'paragraph', 'page_break', 'lạ'];
const OPERATORS = [...be.SHOW_IF_OPERATORS, 'gt', '', undefined, ' EQUALS '];
const VALUES = ['Spa', ' Spa ', 'Khác', 'yes', 'NO', 'maybe', '3', 3, 5, 6, 0, '4.5', 12.5, '12.5', -3, '1e3', '', null, undefined, NaN, true, ['Spa']];

describe('formShowIf: frontend ↔ backend', () => {
  it('cùng hằng số', () => {
    expect(fe.SHOW_IF_OPERATORS).toEqual([...be.SHOW_IF_OPERATORS]);
    expect(fe.SHOW_IF_MATCH_MODES).toEqual([...be.SHOW_IF_MATCH_MODES]);
    expect(fe.SHOW_IF_VALUE_OPERATORS).toEqual([...be.SHOW_IF_VALUE_OPERATORS]);
    expect(fe.MAX_SHOW_IF_CONDITIONS).toBe(be.MAX_SHOW_IF_CONDITIONS);
  });

  it.each(TYPES)('loại %s: cùng danh sách toán tử và cùng khả năng làm nguồn', (type) => {
    expect(fe.getShowIfOperatorsForType(type)).toEqual(be.getShowIfOperatorsForType(type));
    expect(fe.isShowIfSourceType(type)).toBe(be.isShowIfSourceType(type));
  });

  it('cùng toán tử cần giá trị', () => {
    for (const op of OPERATORS) expect(fe.showIfOperatorNeedsValue(op)).toBe(be.showIfOperatorNeedsValue(op));
  });

  it('checkShowIfCondition cho cùng kết quả trên mọi tổ hợp loại × toán tử × giá trị', () => {
    let compared = 0;
    for (const type of TYPES) {
      const source = { key: 'q', type, options: opt('Spa', 'Gội đầu') };
      for (const op of OPERATORS) {
        for (const value of VALUES) {
          expect(fe.checkShowIfCondition(source, op, value)).toEqual(be.checkShowIfCondition(source, op, value));
          compared += 1;
        }
      }
    }
    expect(compared).toBeGreaterThan(3000);
    expect(fe.checkShowIfCondition(undefined, 'answered')).toEqual(be.checkShowIfCondition(undefined, 'answered'));
  });

  it('lựa chọn dạng chuỗi (trình soạn) và dạng {label,value} (backend) cho cùng kết quả', () => {
    const asObjects = { type: 'select', options: opt('Spa', 'Gội đầu') };
    const asStrings = { type: 'select', options: ['Spa', 'Gội đầu'] };
    for (const value of VALUES) {
      expect(be.checkShowIfCondition(asStrings, 'equals', value)).toEqual(be.checkShowIfCondition(asObjects, 'equals', value));
      expect(fe.checkShowIfCondition(asStrings, 'equals', value)).toEqual(be.checkShowIfCondition(asObjects, 'equals', value));
    }
  });

  it('getVisibleFieldKeys cho cùng tập ô hiện trên bộ biểu mẫu × bộ câu trả lời', () => {
    const c = (fieldKey, operator, value) => ({ fieldKey, operator, ...(value !== undefined ? { value } : {}) });
    const si = (conditions, match = 'all') => ({ match, conditions });
    const fields = [
      { key: 'q_sel', type: 'select', options: opt('Spa', 'Gội đầu') },
      { key: 'q_chk', type: 'checkbox', options: opt('A', 'B') },
      { key: 'q_yn', type: 'yes_no' },
      { key: 'q_star', type: 'rating' },
      { key: 'q_num', type: 'number' },
      { key: 'q_txt', type: 'short_text' },
      { key: 'q_file', type: 'file' },
      { key: 'h1', type: 'heading', showIf: si([c('q_sel', 'equals', 'Spa')]) },
      { key: 'pb', type: 'page_break', showIf: si([c('q_sel', 'equals', 'Spa')]) },
      { key: 't1', type: 'short_text', showIf: si([c('q_chk', 'contains', 'B'), c('q_yn', 'not_equals', 'no')], 'any') },
      { key: 't2', type: 'short_text', showIf: si([c('q_star', 'equals', 4), c('q_num', 'equals', 10), c('t1', 'answered')]) },
      { key: 't3', type: 'short_text', showIf: si([c('q_txt', 'not_answered'), c('t2', 'not_answered')], 'any') },
      { key: 't4', type: 'short_text', showIf: si([c('t5', 'answered'), c('khong_co', 'answered'), c('q_file', 'answered')]) }, // hỏng → luôn hiện
      { key: 't5', type: 'short_text' },
      { key: 't6', type: 'select', options: opt('x'), showIf: si([c('q_sel', 'equals', 'Không có')]) }, // giá trị hỏng
    ];
    const answerSets = [
      {},
      { q_sel: 'Spa' },
      { q_sel: 'Gội đầu', q_chk: ['A', 'B'], q_yn: 'yes' },
      { q_chk: 'B', q_yn: 'no', q_star: 4, q_num: '10' },
      { q_sel: 'Spa', q_star: '4', q_num: 10, q_txt: 'x', t1: 'có', t2: 'hai' },
      { q_chk: [], q_txt: '   ', t1: 'lén', t2: 'lén' },
      { q_star: 'abc', q_num: 'abc', q_yn: 'YES' },
      null,
    ];
    for (const answers of answerSets) {
      expect([...fe.getVisibleFieldKeys(fields, answers)]).toEqual([...be.getVisibleFieldKeys(fields, answers)]);
    }
  });

  it('khoá dịch vi + en cho mọi toán tử và mọi lý do hỏng mà trình soạn hiển thị', () => {
    for (const dict of [viDictionary, enDictionary]) {
      const showIf = dict.forms.editorPage.showIf;
      for (const op of be.SHOW_IF_OPERATORS) expect(showIf.operator[op]).toEqual(expect.any(String));
      for (const reason of ['source', 'sourceType', 'operator', 'value', 'pageBreak', 'fixHint']) {
        expect(showIf.issue[reason]).toEqual(expect.any(String));
      }
    }
  });
});
