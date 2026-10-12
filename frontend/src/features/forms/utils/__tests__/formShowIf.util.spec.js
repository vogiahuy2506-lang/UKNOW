import { describe, it, expect } from 'vitest';
import {
  MAX_SHOW_IF_CONDITIONS,
  checkShowIfCondition,
  findShowIfIssues,
  getShowIfSourceKeys,
  getVisibleFieldKeys,
  hasShowIf,
  renameOptionInConditions,
  sanitizeEditorShowIf,
  toPayloadShowIf,
} from '../formShowIf.util';

/**
 * PR-8a — hiện / ẩn ô theo câu trả lời, phần TRÌNH SOẠN của util (trạng thái nháp: `value` là chuỗi, trường mới chưa có key phía
 * server) và vài ca của hàm thuần dùng chung. Hợp đồng frontend == backend của hàm thuần nằm ở
 * backend/src/utils/__tests__/formShowIf.contract.spec.js.
 */

const cond = (fieldKey, operator, value) => ({ fieldKey, operator, ...(value !== undefined ? { value } : {}) });
const editorField = (uid, key, type, extra = {}) => ({ uid, key, type, label: uid, options: [], showIf: null, ...extra });

describe('getVisibleFieldKeys (bản frontend)', () => {
  it('ô ẩn không đóng góp câu trả lời cho ô sau (ẩn lan theo chuỗi); page_break luôn hiện', () => {
    const fields = [
      { key: 'a', type: 'yes_no' },
      { key: 'b', type: 'short_text', showIf: { match: 'all', conditions: [cond('a', 'equals', 'yes')] } },
      { key: 'p', type: 'page_break' },
      { key: 'c', type: 'short_text', showIf: { match: 'all', conditions: [cond('b', 'answered')] } },
    ];
    expect([...getVisibleFieldKeys(fields, { a: 'no', b: 'lén' })]).toEqual(['a', 'p']);
    expect([...getVisibleFieldKeys(fields, { a: 'yes', b: 'x' })]).toEqual(['a', 'b', 'p', 'c']);
  });

  it('nguồn đứng SAU hoặc không tồn tại bị bỏ qua → ô luôn hiện', () => {
    const fields = [
      { key: 'x', type: 'short_text', showIf: { match: 'all', conditions: [cond('y', 'answered')] } },
      { key: 'y', type: 'short_text' },
    ];
    expect(getVisibleFieldKeys(fields, {}).has('x')).toBe(true);
  });
});

describe('hasShowIf / getShowIfSourceKeys', () => {
  it('chỉ tính ô có điều kiện thật; page_break bỏ qua', () => {
    expect(hasShowIf([{ key: 'a', type: 'short_text' }])).toBe(false);
    expect(hasShowIf([{ key: 'a', type: 'short_text', showIf: { conditions: [] } }])).toBe(false);
    expect(hasShowIf([{ key: 'a', type: 'page_break', showIf: { conditions: [cond('z', 'answered')] } }])).toBe(false);
    expect(hasShowIf([{ key: 'a', type: 'short_text', showIf: { conditions: [cond('z', 'answered')] } }])).toBe(true);
    expect(hasShowIf(null)).toBe(false);
  });

  it('tập key nguồn gồm mọi fieldKey được dùng', () => {
    const keys = getShowIfSourceKeys([
      { key: 'a', type: 'short_text' },
      { key: 'b', type: 'short_text', showIf: { conditions: [cond('a', 'answered'), cond('c', 'answered')] } },
      { key: 'd', type: 'short_text', showIf: { conditions: [cond('a', 'answered')] } },
    ]);
    expect([...keys].sort()).toEqual(['a', 'c']);
  });
});

describe('findShowIfIssues — điều kiện hỏng của danh sách trường trình soạn', () => {
  const sel = editorField('u1', 'f_sel', 'select', { options: ['Spa', 'Gội'] });

  it('hợp lệ → không lỗi; trường mới chưa key không làm nguồn được', () => {
    const fields = [sel, editorField('u2', '', 'short_text', { showIf: { match: 'all', conditions: [cond('f_sel', 'equals', 'Spa')] } })];
    expect(findShowIfIssues(fields)).toEqual([]);
    const keyless = [editorField('u0', '', 'short_text'), editorField('u2', '', 'short_text', { showIf: { match: 'all', conditions: [cond('', 'answered')] } })];
    expect(findShowIfIssues(keyless)).toEqual([{ uid: 'u2', index: 1, conditionIndex: 0, reason: 'source' }]);
  });

  it('nguồn bị xoá, đứng sau (sau khi đổi chỗ), đổi loại, lựa chọn không còn, toán tử không hợp loại, page_break còn showIf', () => {
    const target = (conditions) => editorField('t', 'f_t', 'short_text', { showIf: { match: 'all', conditions } });
    // bị xoá
    expect(findShowIfIssues([target([cond('f_sel', 'equals', 'Spa')])])[0].reason).toBe('source');
    // đứng sau
    expect(findShowIfIssues([target([cond('f_sel', 'equals', 'Spa')]), sel])[0].reason).toBe('source');
    // đổi loại sang file / khối
    expect(findShowIfIssues([{ ...sel, type: 'file' }, target([cond('f_sel', 'answered')])])[0].reason).toBe('sourceType');
    expect(findShowIfIssues([{ ...sel, type: 'heading' }, target([cond('f_sel', 'answered')])])[0].reason).toBe('sourceType');
    // đổi từ select sang văn bản: toán tử equals không còn
    expect(findShowIfIssues([{ ...sel, type: 'short_text' }, target([cond('f_sel', 'equals', 'Spa')])])[0].reason).toBe('operator');
    // lựa chọn bị xoá
    expect(findShowIfIssues([{ ...sel, options: ['Gội'] }, target([cond('f_sel', 'equals', 'Spa')])])[0].reason).toBe('value');
    // page_break không có điều kiện
    expect(findShowIfIssues([sel, editorField('p', 'f_p', 'page_break', { showIf: { match: 'all', conditions: [cond('f_sel', 'answered')] } })])[0].reason).toBe('pageBreak');
    // chỉ điều kiện hỏng bị báo (điều kiện tốt trong cùng ô thì không)
    const mixed = findShowIfIssues([sel, target([cond('f_sel', 'equals', 'Spa'), cond('f_sel', 'equals', 'Không có')])]);
    expect(mixed).toEqual([{ uid: 't', index: 1, conditionIndex: 1, reason: 'value' }]);
  });
});

describe('toPayloadShowIf — dạng gửi lên server', () => {
  const earlier = new Map([
    ['f_sel', editorField('u1', 'f_sel', 'select', { options: ['Spa'] })],
    ['f_star', editorField('u2', 'f_star', 'rating')],
    ['f_num', editorField('u3', 'f_num', 'number')],
    ['f_yn', editorField('u4', 'f_yn', 'yes_no')],
    ['f_txt', editorField('u5', 'f_txt', 'short_text')],
  ]);

  it('value chuỗi → chuẩn theo loại (số cho sao / số, yes|no, lựa chọn đã trim); answered bỏ value', () => {
    const { showIf, removed } = toPayloadShowIf(
      { match: 'any', conditions: [cond('f_sel', 'equals', 'Spa'), cond('f_star', 'equals', '4'), cond('f_num', 'not_equals', '7.5'), cond('f_yn', 'equals', 'NO'), cond('f_txt', 'answered', 'bỏ')] },
      earlier
    );
    expect(removed).toBe(0);
    expect(showIf).toEqual({
      match: 'any',
      conditions: [
        { fieldKey: 'f_sel', operator: 'equals', value: 'Spa' },
        { fieldKey: 'f_star', operator: 'equals', value: 4 },
        { fieldKey: 'f_num', operator: 'not_equals', value: 7.5 },
        { fieldKey: 'f_yn', operator: 'equals', value: 'no' },
        { fieldKey: 'f_txt', operator: 'answered' },
      ],
    });
  });

  it('bỏ điều kiện hỏng và đếm; không còn điều kiện nào → null; vượt trần bị cắt', () => {
    expect(toPayloadShowIf({ match: 'all', conditions: [cond('khong_co', 'answered'), cond('f_sel', 'equals', 'Sai')] }, earlier)).toEqual({ showIf: null, removed: 2 });
    expect(toPayloadShowIf(null, earlier)).toEqual({ showIf: null, removed: 0 });
    const many = Array.from({ length: MAX_SHOW_IF_CONDITIONS + 2 }, () => cond('f_txt', 'answered'));
    expect(toPayloadShowIf({ match: 'all', conditions: many }, earlier).showIf.conditions).toHaveLength(MAX_SHOW_IF_CONDITIONS);
  });
});

describe('sanitizeEditorShowIf — gỡ điều kiện hỏng trước khi lưu / xem trước', () => {
  it('không có gì hỏng → danh sách và từng trường giữ nguyên tham chiếu', () => {
    const fields = [editorField('u1', 'f_sel', 'select', { options: ['Spa'] }), editorField('u2', 'f_t', 'short_text', { showIf: { match: 'all', conditions: [cond('f_sel', 'equals', 'Spa')] } })];
    const out = sanitizeEditorShowIf(fields);
    expect(out.removed).toBe(0);
    expect(out.fields[0]).toBe(fields[0]);
    expect(out.fields[1]).toBe(fields[1]);
  });

  it('gỡ điều kiện hỏng, giữ điều kiện tốt; hết điều kiện → showIf null; page_break bị gỡ showIf', () => {
    const fields = [
      editorField('u1', 'f_sel', 'select', { options: ['Gội'] }),
      editorField('u2', 'f_a', 'short_text', { showIf: { match: 'any', conditions: [cond('f_sel', 'equals', 'Spa'), cond('f_sel', 'equals', 'Gội')] } }),
      editorField('u3', 'f_b', 'short_text', { showIf: { match: 'all', conditions: [cond('f_sel', 'equals', 'Spa')] } }),
      editorField('u4', 'f_p', 'page_break', { showIf: { match: 'all', conditions: [cond('f_sel', 'answered')] } }),
    ];
    const out = sanitizeEditorShowIf(fields);
    expect(out.removed).toBe(3);
    expect(out.fields[1].showIf).toEqual({ match: 'any', conditions: [{ fieldKey: 'f_sel', operator: 'equals', value: 'Gội' }] });
    expect(out.fields[2].showIf).toBeNull();
    expect(out.fields[3].showIf).toBeNull();
  });
});

describe('renameOptionInConditions — đổi tên lựa chọn không làm hỏng điều kiện', () => {
  it('đổi giá trị đang trỏ đúng lựa chọn cũ của đúng trường nguồn; không có gì khớp → cùng tham chiếu', () => {
    const fields = [
      editorField('u1', 'f_sel', 'select', { options: ['Spa'] }),
      editorField('u2', 'f_other', 'select', { options: ['Spa'] }),
      editorField('u3', 'f_t', 'short_text', { showIf: { match: 'all', conditions: [cond('f_sel', 'equals', 'Spa'), cond('f_other', 'equals', 'Spa')] } }),
    ];
    const out = renameOptionInConditions(fields, 'f_sel', 'Spa', 'Spa cao cấp');
    expect(out[2].showIf.conditions.map((c) => c.value)).toEqual(['Spa cao cấp', 'Spa']);
    expect(renameOptionInConditions(fields, 'f_sel', 'Không có', 'x')).toBe(fields);
    expect(renameOptionInConditions(fields, '', 'Spa', 'x')).toBe(fields);
  });
});

describe('checkShowIfCondition (bản frontend) — vài ca', () => {
  it('lựa chọn dạng chuỗi của trình soạn và dạng {label,value} của backend đều nhận', () => {
    expect(checkShowIfCondition({ type: 'select', options: ['A'] }, 'equals', 'A')).toEqual({ ok: true, operator: 'equals', value: 'A' });
    expect(checkShowIfCondition({ type: 'select', options: [{ label: 'Nhãn', value: 'A' }] }, 'equals', 'A')).toEqual({ ok: true, operator: 'equals', value: 'A' });
    expect(checkShowIfCondition({ type: 'select', options: ['A'] }, 'equals', 'B')).toEqual({ ok: false, reason: 'value' });
  });
});
