import { describe, it, expect } from '@jest/globals';
import { collectEmailTemplateReferences, parseEmailTemplateId } from '../emailTemplateReference.util.js';

/**
 * PLAN_VA_CO_LAP_DU_LIEU_TENANT_DOT2 A1 — "node gửi email lúc chạy dùng mẫu nào" phải khớp engine:
 * còn bước hợp lệ (templateId đọc được thành số) thì chỉ các bước đó; không thì `emailTemplateId || templateId`.
 */
describe('parseEmailTemplateId', () => {
  it.each([
    [5, 5],
    ['12', 12],
    [' 7 ', 7],
    ['0', null],
    [0, null],
    [-3, null],
    ['12abc', null],
    ['1e30', null],
    [1e30, null],
    ['', null],
    [null, null],
    [undefined, null],
    [{}, null],
    ['1234567890123456', null],
  ])('%j -> %j', (raw, expected) => {
    expect(parseEmailTemplateId(raw)).toBe(expected);
  });
});

describe('collectEmailTemplateReferences', () => {
  it('không có templateId nào (nội dung soạn thẳng trong config) -> không có tham chiếu', () => {
    expect(collectEmailTemplateReferences({ emailSubject: 'Chào', emailBody: '<p>x</p>' })).toEqual([]);
    expect(collectEmailTemplateReferences(null)).toEqual([]);
    expect(collectEmailTemplateReferences(undefined)).toEqual([]);
    expect(collectEmailTemplateReferences({ emailTemplateId: '', templateId: null, emailSteps: [] })).toEqual([]);
  });

  it('mẫu cấp node: emailTemplateId ưu tiên hơn templateId (khớp sendEmailToCustomerDirect)', () => {
    expect(collectEmailTemplateReferences({ emailTemplateId: 5, templateId: 9 })).toEqual([{ raw: '5', id: 5 }]);
    expect(collectEmailTemplateReferences({ templateId: 9 })).toEqual([{ raw: '9', id: 9 }]);
  });

  it('còn bước hợp lệ -> chỉ các bước (mẫu cấp node không dùng tới, kể cả khi cũ/đã xoá)', () => {
    const refs = collectEmailTemplateReferences({
      emailTemplateId: 999,
      emailSteps: [{ templateId: 3 }, { templateId: '4' }, { delayDays: 1 }, { templateId: null }],
    });
    expect(refs).toEqual([{ raw: '3', id: 3 }, { raw: '4', id: 4 }]);
  });

  it('không bước nào hợp lệ -> rơi về mẫu cấp node', () => {
    expect(collectEmailTemplateReferences({ emailTemplateId: 8, emailSteps: [{ delayDays: 1 }] })).toEqual([{ raw: '8', id: 8 }]);
  });

  it('tham chiếu không phải id hợp lệ vẫn được trả về với id null (để preflight coi là mẫu không tồn tại)', () => {
    expect(collectEmailTemplateReferences({ emailTemplateId: 'abc' })).toEqual([{ raw: 'abc', id: null }]);
    expect(collectEmailTemplateReferences({ emailSteps: [{ templateId: '12abc' }] })).toEqual([{ raw: '12abc', id: null }]);
  });
});
