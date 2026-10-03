import { describe, expect, it } from 'vitest';
import {
  FORM_SLOT_HTML,
  applyLinkedFormChoiceToHtml,
  buildLinkedFormPayload,
  htmlEmbedsFormKey,
  htmlHasFormSlot,
  insertFormSlot,
  pickLinkedFormFields,
  replaceFormEmbedSectionWithSlot,
  resolveLinkedFormView,
} from '../landingFormLink.js';

// Khối nhúng đúng hợp đồng backend (landingHtmlInjection.util.js buildFormEmbedSectionHtml).
const embed = (key) => `<section data-founderai-form-section>
  <div data-founderai-form="${key}"></div>
  <noscript><a href="https://app.example/f/${key}">Mở biểu mẫu</a></noscript>
  <script src="https://app.example/form-embed.js" defer></script>
</section>`;

const PAGE = (inner) => `<html><body><h1>Trang</h1>${inner}<footer>chân trang</footer></body></html>`;

describe('landingFormLink — HTML cho lựa chọn "Dùng biểu mẫu đã tạo"', () => {
  it('nhận ra chỗ trống và khối nhúng theo khoá', () => {
    expect(htmlHasFormSlot(`<p/>${FORM_SLOT_HTML}`)).toBe(true);
    expect(htmlHasFormSlot('<div class="x" DATA-FOUNDERAI-FORM-SLOT=""></div>')).toBe(true);
    expect(htmlHasFormSlot('<p>không có</p>')).toBe(false);
    expect(htmlEmbedsFormKey(embed('AbC_1-x'), 'AbC_1-x')).toBe(true);
    expect(htmlEmbedsFormKey(embed('AbC_1-x'), 'AbC')).toBe(false);
    expect(htmlEmbedsFormKey(embed('AbC_1-x'), '')).toBe(false);
  });

  it('không có lựa chọn → HTML y nguyên', () => {
    const html = PAGE(embed('AUTO'));
    expect(applyLinkedFormChoiceToHtml(html, null, 'AUTO')).toBe(html);
    expect(applyLinkedFormChoiceToHtml(html, undefined, 'AUTO')).toBe(html);
  });

  it('đã có chỗ trống → giữ nguyên (không thêm chỗ trống thứ hai)', () => {
    const html = PAGE(FORM_SLOT_HTML);
    const out = applyLinkedFormChoiceToHtml(html, { mode: 'linked', formId: 9, publicKey: 'X9' }, 'AUTO');
    expect(out).toBe(html);
  });

  it('trang đang nhúng form cũ (AUTO) → khối nhúng cũ được THAY bằng đúng một chỗ trống, đúng vị trí cũ', () => {
    const html = PAGE(embed('AUTO'));
    const out = applyLinkedFormChoiceToHtml(html, { mode: 'linked', formId: 9, publicKey: 'X9' }, 'AUTO');
    expect(out).toBe(PAGE(FORM_SLOT_HTML));
    expect(out).not.toContain('AUTO');
    expect(out.match(/data-founderai-form-slot/g)).toHaveLength(1);
  });

  it('chỉ thay khối của ĐÚNG khoá đang gắn, khối nhúng khác (người dùng tự dán) giữ nguyên', () => {
    const html = PAGE(`${embed('OTHER')}${embed('AUTO')}`);
    const out = applyLinkedFormChoiceToHtml(html, { mode: 'linked', formId: 9, publicKey: 'X9' }, 'AUTO');
    expect(out).toContain('data-founderai-form="OTHER"');
    expect(out).not.toContain('data-founderai-form="AUTO"');
    expect(out.match(/data-founderai-form-slot/g)).toHaveLength(1);
  });

  it('trang chưa có khối nhúng nào → chèn chỗ trống trước </body> cuối', () => {
    const html = PAGE('<p>nội dung</p>');
    const out = applyLinkedFormChoiceToHtml(html, { mode: 'linked', formId: 9, publicKey: 'X9' }, null);
    expect(out.match(/data-founderai-form-slot/g)).toHaveLength(1);
    expect(out.indexOf(FORM_SLOT_HTML)).toBeGreaterThan(out.indexOf('chân trang'));
    expect(out.indexOf(FORM_SLOT_HTML)).toBeLessThan(out.lastIndexOf('</body>'));
  });

  it('HTML không có </body> → chỗ trống nối vào cuối', () => {
    expect(insertFormSlot('<p>a</p>')).toContain(FORM_SLOT_HTML);
    expect(insertFormSlot('<p>a</p>').startsWith('<p>a</p>')).toBe(true);
  });

  it('trang ĐÃ nhúng sẵn đúng biểu mẫu được chọn (dán tay) → giữ nguyên, không chèn thêm', () => {
    const html = PAGE(embed('X9'));
    const out = applyLinkedFormChoiceToHtml(html, { mode: 'linked', formId: 9, publicKey: 'X9' }, null);
    expect(out).toBe(html);
  });

  it('quay về Form cơ bản: có khối nhúng của biểu mẫu đã chọn → thay bằng chỗ trống (backend dựng form cơ bản mới)', () => {
    const html = PAGE(embed('X9'));
    expect(applyLinkedFormChoiceToHtml(html, { mode: 'basic' }, 'X9')).toBe(PAGE(FORM_SLOT_HTML));
  });

  it('quay về Form cơ bản mà trang không có khối nhúng nào → KHÔNG tự chèn chỗ trống (backend chỉ gỡ gắn)', () => {
    const html = PAGE('<p>trang có form HTML riêng</p>');
    expect(applyLinkedFormChoiceToHtml(html, { mode: 'basic' }, 'X9')).toBe(html);
  });

  it('replaceFormEmbedSectionWithSlot: khoá không có trong trang → nguyên văn', () => {
    const html = PAGE(embed('A'));
    expect(replaceFormEmbedSectionWithSlot(html, 'B')).toBe(html);
    expect(replaceFormEmbedSectionWithSlot(html, '')).toBe(html);
  });

  it('buildLinkedFormPayload: số → linkedFormId số; basic → null; không có lựa chọn → KHÔNG có khoá linkedFormId', () => {
    expect(buildLinkedFormPayload({ mode: 'linked', formId: '12' })).toEqual({ linkedFormId: 12 });
    expect(buildLinkedFormPayload({ mode: 'basic' })).toEqual({ linkedFormId: null });
    expect(buildLinkedFormPayload(null)).toEqual({});
    expect('linkedFormId' in buildLinkedFormPayload(undefined)).toBe(false);
  });

  it('resolveLinkedFormView: theo nguồn server + lựa chọn chờ lưu', () => {
    expect(resolveLinkedFormView({})).toMatchObject({ mode: 'basic', formId: '', serverChosenId: '' });
    // form tự sinh vẫn là Form cơ bản
    expect(resolveLinkedFormView({ linkedFormId: 7, linkedFormSource: 'basic' })).toMatchObject({ mode: 'basic', formId: '' });
    // biểu mẫu khách chọn
    expect(resolveLinkedFormView({ linkedFormId: 9, linkedFormSource: 'chosen' })).toMatchObject({
      mode: 'linked',
      formId: '9',
      serverChosenId: '9',
    });
    // lựa chọn chờ lưu thắng dữ liệu server
    expect(
      resolveLinkedFormView({ linkedFormId: 9, linkedFormSource: 'chosen', linkedFormChoice: { mode: 'basic' } })
    ).toMatchObject({ mode: 'basic', formId: '', serverChosenId: '9' });
    expect(
      resolveLinkedFormView({ linkedFormId: 7, linkedFormSource: 'basic', linkedFormChoice: { mode: 'linked', formId: 3 } })
    ).toMatchObject({ mode: 'linked', formId: '3', serverChosenId: '' });
  });

  it('pickLinkedFormFields: thiếu trường → null (không undefined)', () => {
    expect(pickLinkedFormFields({})).toEqual({
      linkedFormId: null,
      linkedFormTitle: null,
      linkedFormPublicKey: null,
      linkedFormSource: null,
    });
    expect(
      pickLinkedFormFields({ linkedFormId: 3, linkedFormTitle: 'T', linkedFormPublicKey: 'K', linkedFormSource: 'chosen' })
    ).toEqual({ linkedFormId: 3, linkedFormTitle: 'T', linkedFormPublicKey: 'K', linkedFormSource: 'chosen' });
  });
});
