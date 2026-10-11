import { describe, expect, it } from 'vitest';
import {
  FORM_SLOT_HTML,
  FORM_SLOT_KINDS,
  MAX_FORMS_PER_LANDING,
  addFormSlot,
  addPendingForm,
  buildFormRows,
  buildFormSlotHtml,
  buildLinkedFormsPayload,
  htmlEmbedsFormKey,
  listFormBlocks,
  moveFormBlock,
  pickLinkedFormFields,
  removeFormBlock,
  removePendingForm,
} from '../landingFormLink.js';

// Khối nhúng đúng hợp đồng backend (landingHtmlInjection.util.js buildFormEmbedSectionHtml).
const embed = (key) => `<section data-founderai-form-section>
  <div data-founderai-form="${key}"></div>
  <noscript><a href="https://app.example/f/${key}">Mở biểu mẫu</a></noscript>
  <script src="https://app.example/form-embed.js" defer></script>
</section>`;

const PAGE = (inner) => `<html><body><h1>Trang</h1>${inner}<footer>chân trang</footer></body></html>`;
const keysOf = (html) => listFormBlocks(html).map((b) => (b.type === 'embed' ? `embed:${b.key}` : `slot:${b.kind}`));

describe('landingFormLink — nhận ra khối biểu mẫu trong HTML', () => {
  it('hằng số bằng backend: 5 loại, trần 20, chỗ trống trần = FORM_SLOT_HTML', () => {
    expect(FORM_SLOT_KINDS).toEqual(['consult', 'booking', 'payment', 'survey', 'blank']);
    expect(MAX_FORMS_PER_LANDING).toBe(20);
    expect(FORM_SLOT_HTML).toBe('<div data-founderai-form-slot></div>');
    expect(buildFormSlotHtml('booking')).toBe('<div data-founderai-form-slot="booking"></div>');
  });

  it('htmlEmbedsFormKey khớp ĐÚNG khoá (không khớp tiền tố, không khớp khoá rỗng)', () => {
    expect(htmlEmbedsFormKey(embed('AbC_1-x'), 'AbC_1-x')).toBe(true);
    expect(htmlEmbedsFormKey(embed('AbC_1-x'), 'AbC')).toBe(false);
    expect(htmlEmbedsFormKey(embed('AbC_1-x'), '')).toBe(false);
  });

  it('liệt kê khối nhúng + chỗ trống theo thứ tự xuất hiện, kèm loại (trần = consult, bare=true)', () => {
    const html = PAGE(`${embed('K1')}<p>x</p>${buildFormSlotHtml('booking')}${FORM_SLOT_HTML}${embed('K2')}`);
    expect(keysOf(html)).toEqual(['embed:K1', 'slot:booking', 'slot:consult', 'embed:K2']);
    const blocks = listFormBlocks(html);
    expect(blocks.map((b) => b.bare)).toEqual([undefined, false, true, undefined]);
    // mỗi khối có vị trí ký tự khớp đúng nội dung
    for (const b of blocks) expect(html.slice(b.start, b.end)).toBe(b.text);
  });

  it('khối nhúng KHÔNG có <section> bọc (dán tay) vẫn nhận ra; khối trong <section> không bị đếm hai lần', () => {
    const bare = '<div data-founderai-form="HAND_1"></div>';
    expect(keysOf(PAGE(bare))).toEqual(['embed:HAND_1']);
    expect(keysOf(PAGE(embed('K1')))).toEqual(['embed:K1']);
    // chỗ trống không bị nhầm là khối nhúng (data-founderai-form-slot ≠ data-founderai-form=)
    expect(keysOf(PAGE(FORM_SLOT_HTML))).toEqual(['slot:consult']);
  });

  it('chỗ trống giá trị lạ vẫn liệt kê nhưng valid=false (backend sẽ từ chối khi lưu)', () => {
    const [block] = listFormBlocks(PAGE('<div data-founderai-form-slot="contact"></div>'));
    expect(block).toMatchObject({ type: 'slot', valid: false, rawKind: 'contact' });
  });

  it('trang không có khối nào → rỗng', () => {
    expect(listFormBlocks('<p>không có</p>')).toEqual([]);
    expect(listFormBlocks('')).toEqual([]);
    expect(listFormBlocks(null)).toEqual([]);
  });
});

describe('landingFormLink — dòng danh sách', () => {
  const linkedForms = [
    { id: 11, title: 'Tư vấn', publicKey: 'K1', isPublished: true, kind: 'consult', needsPaymentSetup: false },
    { id: 12, title: 'Thu cọc', publicKey: 'K2', isPublished: false, kind: 'payment', needsPaymentSetup: true },
  ];

  it('khối nhúng tra được → saved (tên, loại, nháp, cờ cần bổ sung); khoá lạ → external; chỗ trống → new; chờ gắn → pending', () => {
    const html = PAGE(`${embed('K1')}${embed('K2')}${embed('LA')}${buildFormSlotHtml('survey')}`);
    const rows = buildFormRows({
      html,
      linkedForms,
      pending: [{ formId: 30, publicKey: 'K30', title: 'Có sẵn' }],
    });
    expect(rows.map((r) => r.source)).toEqual(['saved', 'saved', 'external', 'new', 'pending']);
    expect(rows[0]).toMatchObject({ formId: 11, title: 'Tư vấn', kind: 'consult', blockIndex: 0, isPublished: true });
    expect(rows[1]).toMatchObject({ formId: 12, kind: 'payment', needsPaymentSetup: true, isPublished: false });
    expect(rows[2]).toMatchObject({ formId: null, publicKey: 'LA' });
    expect(rows[3]).toMatchObject({ kind: 'survey', blockIndex: 3, valid: true });
    expect(rows[4]).toMatchObject({ formId: 30, title: 'Có sẵn', blockIndex: null });
    // id dòng duy nhất
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });

  it('biểu mẫu chờ gắn mà HTML ĐÃ nhúng khoá của nó → không hiện hai lần', () => {
    const rows = buildFormRows({
      html: PAGE(embed('K30')),
      linkedForms: [],
      pending: [{ formId: 30, publicKey: 'K30', title: 'X' }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('external');
  });

  it('thiếu mọi tham số → rỗng, không throw', () => {
    expect(buildFormRows({ html: '' })).toEqual([]);
    expect(buildFormRows({ html: undefined, linkedForms: null, pending: null })).toEqual([]);
  });
});

describe('landingFormLink — sửa HTML: bỏ / đổi thứ tự / thêm', () => {
  it('removeFormBlock xoá đúng khối (khối nhúng LẪN chỗ trống), phần còn lại của trang nguyên vẹn', () => {
    const html = PAGE(`${embed('K1')}\n${buildFormSlotHtml('booking')}\n${embed('K2')}`);
    const noSecond = removeFormBlock(html, 1);
    expect(keysOf(noSecond)).toEqual(['embed:K1', 'embed:K2']);
    expect(noSecond).toContain('<h1>Trang</h1>');
    expect(noSecond).toContain('<footer>chân trang</footer>');
    expect(keysOf(removeFormBlock(html, 0))).toEqual(['slot:booking', 'embed:K2']);
    expect(removeFormBlock(html, 99)).toBe(html); // không có khối đó → nguyên văn
  });

  it('moveFormBlock đổi chỗ hai khối kề, giữ nguyên nội dung giữa; hết đường thì nguyên văn', () => {
    const html = PAGE(`${embed('K1')}<p>giữa</p>${buildFormSlotHtml('booking')}${embed('K2')}`);
    expect(keysOf(moveFormBlock(html, 0, 1))).toEqual(['slot:booking', 'embed:K1', 'embed:K2']);
    expect(keysOf(moveFormBlock(html, 2, -1))).toEqual(['embed:K1', 'embed:K2', 'slot:booking']);
    expect(moveFormBlock(html, 0, -1)).toBe(html);
    expect(moveFormBlock(html, 2, 1)).toBe(html);
    // nội dung không phải khối ở giữa vẫn còn đúng một lần
    expect((moveFormBlock(html, 0, 1).match(/<p>giữa<\/p>/g) || []).length).toBe(1);
  });

  it('đổi chỗ rồi đổi lại → HTML y nguyên ban đầu', () => {
    const html = PAGE(`${embed('K1')}<p>giữa</p>${buildFormSlotHtml('payment')}`);
    expect(moveFormBlock(moveFormBlock(html, 0, 1), 1, -1)).toBe(html);
  });

  it('addFormSlot chèn chỗ trống CÓ LOẠI ngay sau khối biểu mẫu cuối; chưa có khối nào thì trước </body>; không có </body> thì cuối', () => {
    const withForms = PAGE(`${embed('K1')}<p>sau</p>`);
    const added = addFormSlot(withForms, 'booking');
    expect(keysOf(added)).toEqual(['embed:K1', 'slot:booking']);
    expect(added.indexOf('data-founderai-form-slot')).toBeLessThan(added.indexOf('<p>sau</p>'));

    const empty = addFormSlot(PAGE(''), 'survey');
    expect(keysOf(empty)).toEqual(['slot:survey']);
    expect(empty.indexOf('data-founderai-form-slot')).toBeLessThan(empty.lastIndexOf('</body>'));

    const noBody = addFormSlot('<p>a</p>', 'blank');
    expect(noBody.startsWith('<p>a</p>')).toBe(true);
    expect(keysOf(noBody)).toEqual(['slot:blank']);
  });

  it('thêm nhiều loại liên tiếp → mỗi lần thêm một chỗ trống, đúng thứ tự thêm', () => {
    let html = PAGE('');
    for (const kind of ['consult', 'booking', 'payment']) html = addFormSlot(html, kind);
    expect(keysOf(html)).toEqual(['slot:consult', 'slot:booking', 'slot:payment']);
  });
});

describe('landingFormLink — biểu mẫu có sẵn chờ gắn + body PUT', () => {
  it('addPendingForm không trùng, nhận cả {id} lẫn {formId}; removePendingForm bỏ đúng id', () => {
    let pending = [];
    pending = addPendingForm(pending, { id: 5, publicKey: 'K5', title: 'A' });
    pending = addPendingForm(pending, { id: 5, publicKey: 'K5', title: 'A' });
    pending = addPendingForm(pending, { formId: 6, publicKey: 'K6', title: 'B' });
    expect(pending).toEqual([
      { formId: 5, publicKey: 'K5', title: 'A' },
      { formId: 6, publicKey: 'K6', title: 'B' },
    ]);
    expect(removePendingForm(pending, 5)).toEqual([{ formId: 6, publicKey: 'K6', title: 'B' }]);
    expect(addPendingForm(null, { id: 'abc' })).toEqual([]); // id không hợp lệ → bỏ qua
  });

  it('buildLinkedFormsPayload: có chờ gắn → linkedFormIds đúng thứ tự (số); rỗng/null → không gửi khoá nào', () => {
    expect(buildLinkedFormsPayload([{ formId: '7' }, { formId: 3 }])).toEqual({ linkedFormIds: [7, 3] });
    expect(buildLinkedFormsPayload([])).toEqual({});
    expect(buildLinkedFormsPayload(null)).toEqual({});
    expect('linkedFormId' in buildLinkedFormsPayload([{ formId: 1 }])).toBe(false);
  });

  it('pickLinkedFormFields: lấy linkedForms của server; server cũ chỉ có khoá đơn → dựng danh sách 1 phần tử; không có → []', () => {
    const list = [{ id: 1, publicKey: 'K1' }];
    expect(pickLinkedFormFields({ linkedForms: list, linkedFormId: 9 })).toEqual({ linkedForms: list });
    expect(pickLinkedFormFields({ linkedFormId: 7, linkedFormTitle: 'T', linkedFormPublicKey: 'KT' })).toEqual({
      linkedForms: [
        { id: 7, title: 'T', publicKey: 'KT', isPublished: true, kind: null, position: 0, needsPaymentSetup: false },
      ],
    });
    expect(pickLinkedFormFields({})).toEqual({ linkedForms: [] });
    expect(pickLinkedFormFields(null)).toEqual({ linkedForms: [] });
  });
});
