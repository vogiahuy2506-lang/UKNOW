/**
 * PR-7a (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11) — nháp biểu mẫu theo từng chỗ trống của landing:
 * sắp hàng chỗ trống giữa hai bản HTML + KHÔNG tin nháp từ trình duyệt (chuẩn hoá lại bằng bộ chuẩn hoá thật).
 */
import { describe, it, expect } from '@jest/globals';
import {
  alignFormSlotKinds,
  findNewFormSlots,
  realignFormDrafts,
  mergeFormDrafts,
  sanitizeIncomingFormDrafts,
  buildFormInputFromDraft,
} from '../landingFormDrafts.util.js';
import { MAX_FORMS_PER_LANDING } from '../landingHtmlInjection.util.js';
import { AI_FORM_FIELD_TYPES } from '../formFieldTypes.util.js';

const slot = (kind) => (kind === 'bare' ? '<div data-founderai-form-slot></div>' : `<div data-founderai-form-slot="${kind}"></div>`);
const page = (...kinds) => `<body>${kinds.map((k) => `<section>${slot(k)}</section>`).join('')}</body>`;

describe('alignFormSlotKinds — ghép chuỗi loại cũ với chuỗi loại mới', () => {
  it('không đổi → ghép đủ theo thứ tự', () => {
    expect(alignFormSlotKinds(['consult', 'booking'], ['consult', 'booking'])).toEqual([0, 1]);
  });

  it('thêm ở cuối / ở đầu / ở giữa → chỗ trống mới = -1, các chỗ trống cũ đi theo vị trí mới', () => {
    expect(alignFormSlotKinds(['booking'], ['booking', 'payment'])).toEqual([0, -1]);
    expect(alignFormSlotKinds(['booking'], ['survey', 'booking'])).toEqual([-1, 0]);
    expect(alignFormSlotKinds(['consult', 'payment'], ['consult', 'booking', 'payment'])).toEqual([0, -1, 1]);
  });

  it('bớt một chỗ trống → các chỗ còn lại ghép đúng chỗ cũ của nó', () => {
    expect(alignFormSlotKinds(['consult', 'booking', 'payment'], ['consult', 'payment'])).toEqual([0, 2]);
  });

  it('cùng loại liên tiếp: thêm một chỗ cùng loại → chỗ ĐẦU giữ chỗ cũ, chỗ sau là mới (ghép sớm nhất)', () => {
    expect(alignFormSlotKinds(['booking'], ['booking', 'booking'])).toEqual([0, -1]);
  });

  it('đầu vào rỗng / không phải mảng', () => {
    expect(alignFormSlotKinds([], ['booking'])).toEqual([-1]);
    expect(alignFormSlotKinds(['booking'], [])).toEqual([]);
    expect(alignFormSlotKinds(null, undefined)).toEqual([]);
  });
});

describe('findNewFormSlots', () => {
  it('sinh trang mới (HTML cũ rỗng) → mọi chỗ trống đều mới, slotIndex đếm cả chỗ trống trần', () => {
    expect(findNewFormSlots('', page('bare', 'booking', 'payment'))).toEqual([
      { slotIndex: 0, kind: 'consult' },
      { slotIndex: 1, kind: 'booking' },
      { slotIndex: 2, kind: 'payment' },
    ]);
  });

  it('sửa trang: chỉ chỗ trống MỚI; chèn trước chỗ cũ thì slotIndex tính theo HTML mới', () => {
    expect(findNewFormSlots(page('booking'), page('survey', 'booking'))).toEqual([{ slotIndex: 0, kind: 'survey' }]);
    expect(findNewFormSlots(page('booking'), page('booking', 'payment'))).toEqual([{ slotIndex: 1, kind: 'payment' }]);
    expect(findNewFormSlots(page('booking', 'payment'), page('booking', 'payment'))).toEqual([]);
  });

  it('chỗ trống có loại lạ không bao giờ được soạn nháp (vẫn chiếm một chỉ số, vì chốt lưu sẽ từ chối cả trang)', () => {
    expect(findNewFormSlots('', `${slot('contact')}${slot('booking')}`)).toEqual([{ slotIndex: 1, kind: 'booking' }]);
    expect(findNewFormSlots('', slot('contact'))).toEqual([]);
  });
});

describe('realignFormDrafts / mergeFormDrafts', () => {
  const draft = (slotIndex, kind, title = `${kind}-${slotIndex}`) => ({ slotIndex, kind, title });

  it('chèn chỗ trống mới ở giữa → nháp phía sau dịch chỉ số theo chỗ trống của nó', () => {
    const drafts = [draft(1, 'booking'), draft(2, 'payment')];
    const out = realignFormDrafts(drafts, page('bare', 'booking', 'payment'), page('bare', 'survey', 'booking', 'payment'));
    expect(out.map((d) => [d.slotIndex, d.kind, d.title])).toEqual([[2, 'booking', 'booking-1'], [3, 'payment', 'payment-2']]);
  });

  it('chỗ trống bị xoá → bỏ nháp của nó, nháp còn lại đi theo chỗ của mình', () => {
    const out = realignFormDrafts([draft(1, 'booking'), draft(2, 'payment')], page('bare', 'booking', 'payment'), page('bare', 'payment'));
    expect(out.map((d) => [d.slotIndex, d.kind])).toEqual([[1, 'payment']]);
  });

  it('đổi loại chỗ trống (booking → survey) → nháp booking không bám sang chỗ survey', () => {
    expect(realignFormDrafts([draft(0, 'booking')], page('booking'), page('survey'))).toEqual([]);
  });

  it('HTML không đổi → giữ nguyên; không có nháp → mảng rỗng', () => {
    const drafts = [draft(1, 'booking')];
    expect(realignFormDrafts(drafts, page('bare', 'booking'), page('bare', 'booking'))).toEqual(drafts);
    expect(realignFormDrafts(undefined, page('booking'), page('booking'))).toEqual([]);
  });

  it('mergeFormDrafts: hợp theo slotIndex, nháp mới thắng, sắp theo slotIndex', () => {
    const merged = mergeFormDrafts([draft(2, 'payment', 'cu'), draft(0, 'booking')], [draft(2, 'payment', 'moi'), draft(1, 'survey')]);
    expect(merged.map((d) => [d.slotIndex, d.title])).toEqual([[0, 'booking-0'], [1, 'survey-1'], [2, 'moi']]);
    expect(mergeFormDrafts(null, undefined)).toEqual([]);
  });
});

describe('sanitizeIncomingFormDrafts — lọc sơ nháp từ trình duyệt', () => {
  it('chỉ nhận object có slotIndex nguyên hợp lệ + kind thuộc 5 loại; trùng slotIndex lấy cái đầu', () => {
    const map = sanitizeIncomingFormDrafts([
      { slotIndex: 1, kind: 'Booking', title: 'a' },
      { slotIndex: 1, kind: 'payment', title: 'trùng' },
      { slotIndex: 2, kind: 'payment', title: 'b' },
      { slotIndex: '3', kind: 'survey' },
      { slotIndex: -1, kind: 'survey' },
      { slotIndex: MAX_FORMS_PER_LANDING, kind: 'survey' },
      { slotIndex: 4, kind: 'contact' },
      { slotIndex: 5 },
      null,
      'x',
      [],
    ]);
    expect([...map.keys()]).toEqual([1, 2]);
    expect(map.get(1)).toMatchObject({ kind: 'booking', draft: { title: 'a' } });
  });

  it('không phải mảng → Map rỗng; mảng dài hơn trần chỉ xét MAX_FORMS_PER_LANDING phần tử đầu', () => {
    expect(sanitizeIncomingFormDrafts(undefined).size).toBe(0);
    expect(sanitizeIncomingFormDrafts({ slotIndex: 0, kind: 'booking' }).size).toBe(0);
    const many = Array.from({ length: 50 }, (_, i) => ({ slotIndex: i % 20, kind: 'blank' }));
    expect(sanitizeIncomingFormDrafts(many).size).toBe(20);
  });
});

describe('buildFormInputFromDraft — không tin nháp: chuẩn hoá lại bằng bộ chuẩn hoá thật', () => {
  const contact = [
    { label: 'Họ và tên', type: 'short_text', required: true, role: 'name' },
    { label: 'Số điện thoại', type: 'phone', required: true, role: 'phone' },
    { label: 'Email', type: 'email', required: true, role: 'email' },
  ];
  const bookingDraft = (over = {}) => ({
    kind: 'booking',
    title: 'Đặt lịch khám răng',
    description: 'Chọn ngày giờ phù hợp',
    fields: [...contact, { label: 'Bạn muốn khám gì?', type: 'radio', required: true, options: ['Tẩy trắng', 'Niềng răng'] }],
    settings: { submitButtonText: 'Đặt lịch ngay', successMessage: 'Hẹn gặp bạn!', sendConfirmation: true },
    bookingConfig: { enabled: true, weeklySlots: { 2: ['08:00', '10:00'] }, daysAhead: 14 },
    ...over,
  });

  it('nháp booking hợp lệ → đầu vào createForm: trường chuẩn hoá (có key), tiêu đề + mô tả của nháp, đồng ý + báo chủ BẬT, paymentConfig null', () => {
    const input = buildFormInputFromDraft(bookingDraft(), 'booking');
    expect(input.title).toBe('Đặt lịch khám răng');
    expect(input.description).toBe('Chọn ngày giờ phù hợp');
    expect(input.fields.map((f) => f.label)).toEqual(['Họ và tên', 'Số điện thoại', 'Email', 'Bạn muốn khám gì?']);
    expect(input.fields.every((f) => typeof f.key === 'string' && f.key.length >= 3)).toBe(true);
    expect(input.fields[3].options).toEqual([{ label: 'Tẩy trắng', value: 'Tẩy trắng' }, { label: 'Niềng răng', value: 'Niềng răng' }]);
    expect(input.settings).toMatchObject({
      consentEnabled: true, notifyOwner: true, sendConfirmation: true, submitButtonText: 'Đặt lịch ngay', successMessage: 'Hẹn gặp bạn!', redirectUrl: null,
    });
    expect(input.bookingConfig.weeklySlots['2']).toEqual(['08:00', '10:00']);
    expect(input.paymentConfig).toBeNull();
  });

  it('paymentConfig do nháp mang theo bị BỎ; consentEnabled:false / notifyOwner:false của nháp bị ÉP lại true; cài đặt lạ (redirectUrl, consentText…) bị bỏ', () => {
    const input = buildFormInputFromDraft(
      bookingDraft({
        kind: 'payment',
        paymentConfig: { enabled: true, amount: 5000000, bank: 'VCB', accountNumber: '0123456789' },
        settings: { consentEnabled: false, notifyOwner: false, redirectUrl: 'https://evil.example', consentText: 'x', showProductCard: false },
        bookingConfig: { enabled: true, weeklySlots: { 1: ['09:00'] } },
      }),
      'payment',
    );
    expect(input.paymentConfig).toBeNull();
    expect(JSON.stringify(input)).not.toContain('0123456789');
    expect(input.settings.consentEnabled).toBe(true);
    expect(input.settings.notifyOwner).toBe(true);
    expect(input.settings.redirectUrl).toBeNull();
    expect(input.settings).not.toHaveProperty('consentText');
    expect(input.settings).not.toHaveProperty('showProductCard');
    expect(input.bookingConfig).toBeNull(); // chỗ trống payment không có đặt lịch
  });

  it('PR-8a: nháp từ trình duyệt mang `showIf` → bị BỎ (chỉ trình soạn tạo điều kiện hiển thị), key do trình duyệt đặt cũng bị bỏ nên không thể trỏ vào đâu', () => {
    const input = buildFormInputFromDraft(
      bookingDraft({
        fields: [
          ...contact,
          { label: 'Bạn có xe không?', type: 'yes_no', key: 'f_xe00001' },
          { label: 'Biển số xe', type: 'short_text', showIf: { match: 'all', conditions: [{ fieldKey: 'f_xe00001', operator: 'equals', value: 'yes' }] } },
        ],
      }),
      'booking',
    );
    expect(input.fields.map((f) => f.label)).toEqual(['Họ và tên', 'Số điện thoại', 'Email', 'Bạn có xe không?', 'Biển số xe']);
    expect(input.fields.some((f) => 'showIf' in f)).toBe(false);
    expect(JSON.stringify(input)).not.toContain('showIf');
  });

  it('nháp sai loại so với chỗ trống → null (dùng mẫu backend)', () => {
    expect(buildFormInputFromDraft(bookingDraft(), 'payment')).toBeNull();
    expect(buildFormInputFromDraft(bookingDraft({ kind: 'survey' }), 'booking')).toBeNull();
    expect(buildFormInputFromDraft(bookingDraft({ kind: undefined }), 'booking')).toBeNull();
  });

  it('chỗ trống consult luôn dựng từ leadFormConfig → không dùng nháp', () => {
    expect(buildFormInputFromDraft(bookingDraft({ kind: 'consult' }), 'consult')).toBeNull();
  });

  it.each([
    ['trường loại file', [...contact, { label: 'Tải CV', type: 'file', required: false }]],
    ['trường loại lạ', [...contact, { label: 'Ký tên', type: 'signature' }]],
    ['mục trường không phải object', [...contact, 'oops']],
    ['option lạ trong select rỗng', [...contact, { label: 'Chọn', type: 'select', options: [] }]],
    ['nhãn rỗng', [...contact, { label: '', type: 'short_text' }]],
    ['quá nhiều trường (>50)', Array.from({ length: 51 }, (_, i) => ({ label: `Câu ${i}`, type: 'short_text' }))],
    ['không có trường nhập nào (chỉ tiêu đề)', [{ label: 'Giới thiệu', type: 'heading' }]],
    ['hai trường cùng vai trò name', [...contact, { label: 'Tên nữa', type: 'short_text', role: 'name' }]],
  ])('chuẩn hoá chặn: %s → null (không ném)', (_name, fields) => {
    expect(buildFormInputFromDraft(bookingDraft({ fields }), 'booking')).toBeNull();
  });

  it('biểu mẫu đặt lịch / thu tiền không có ô SĐT lẫn email → null; survey thì không đòi', () => {
    const noContact = [{ label: 'Họ và tên', type: 'short_text', required: true, role: 'name' }];
    expect(buildFormInputFromDraft(bookingDraft({ fields: noContact }), 'booking')).toBeNull();
    expect(buildFormInputFromDraft(bookingDraft({ kind: 'payment', fields: noContact }), 'payment')).toBeNull();
    const survey = buildFormInputFromDraft({ kind: 'survey', fields: [{ label: 'Bạn hài lòng?', type: 'rating', required: true }] }, 'survey');
    expect(survey.fields).toHaveLength(1);
    expect(survey.bookingConfig).toBeNull();
  });

  it('bookingConfig của nháp hỏng / tắt → dùng khung giờ MẪU; booking mà nháp không kèm bookingConfig → khung giờ mẫu', () => {
    for (const bookingConfig of [{ enabled: true, weeklySlots: {} }, { enabled: false }, 'sai', undefined, { enabled: true, weeklySlots: { 1: ['25:99'] } }]) {
      const input = buildFormInputFromDraft(bookingDraft({ bookingConfig }), 'booking');
      expect(input.bookingConfig.enabled).toBe(true);
      expect(input.bookingConfig.weeklySlots['1']).toEqual(['09:00', '14:00']);
    }
  });

  it('cắt độ dài: tiêu đề > 200 ký tự bị cắt, chữ nút gửi / lời cảm ơn quá dài bị cắt thay vì làm hỏng nháp; thiếu tiêu đề → null (caller dùng tên mặc định)', () => {
    const input = buildFormInputFromDraft(
      bookingDraft({ title: 'T'.repeat(500), description: 'D'.repeat(900), settings: { submitButtonText: 'N'.repeat(200), successMessage: 'M'.repeat(2000) } }),
      'booking',
    );
    expect(input.title).toHaveLength(200);
    expect(input.description).toHaveLength(500);
    expect(input.settings.submitButtonText).toHaveLength(50);
    expect(input.settings.successMessage).toHaveLength(500);
    expect(buildFormInputFromDraft(bookingDraft({ title: '   ' }), 'booking').title).toBeNull();
  });

  it('khoá `key` do client gửi bị bỏ (khoá trường sinh lại), khoá lạ trong trường bị bỏ', () => {
    const input = buildFormInputFromDraft(
      bookingDraft({ fields: [{ key: 'email', label: 'Họ tên', type: 'short_text', role: 'name', evil: '<script>' }, contact[1]] }),
      'booking',
    );
    expect(input.fields[0].key).not.toBe('email');
    expect(input.fields[0]).not.toHaveProperty('evil');
  });

  it('đầu vào rác (null, chuỗi, mảng, thiếu fields) → null, không ném', () => {
    for (const raw of [null, undefined, 'x', 5, [], {}, { kind: 'booking' }, { kind: 'booking', fields: [] }, { kind: 'booking', fields: 'x' }]) {
      expect(buildFormInputFromDraft(raw, 'booking')).toBeNull();
    }
  });

  it('danh sách loại trường AI không có `file`', () => {
    expect(AI_FORM_FIELD_TYPES).not.toContain('file');
  });
});
