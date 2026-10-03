import { describe, expect, it } from 'vitest';
import vi from '../../../i18n/vi.js';
import en from '../../../i18n/en.js';
import { FORM_TEMPLATES, buildFormFromTemplate, collectTemplateKeys } from '../constants/formTemplates';

/**
 * Khoá của mẫu được dựng ĐỘNG (nameKey/labelKey/optionKeys lưu trong dữ liệu, t(template.nameKey)),
 * nên translationKeys.spec — chỉ quét lời gọi t('a.b') viết thẳng — không bắt được khoá thiếu: t()
 * rơi về chính chuỗi khoá, giao diện hiện "forms.editorPage.templates.survey.q3o2" mà CI vẫn xanh.
 */
const lookup = (dict, key) => key.split('.').reduce((node, part) => (node == null ? node : node[part]), dict);
const tFor = (dict) => (key) => lookup(dict, key) ?? key;

describe('mẫu biểu mẫu dựng sẵn (formTemplates)', () => {
  it('đủ 5 mẫu theo plan, id không trùng, "Trống" đứng cuối', () => {
    expect(FORM_TEMPLATES.map((tpl) => tpl.id)).toEqual(['consult', 'booking', 'payment', 'survey', 'blank']);
  });

  it.each([
    ['vi', vi],
    ['en', en],
  ])('mọi khoá chữ của mẫu đều có bản dịch %s (không rơi về chuỗi khoá)', (_lang, dict) => {
    const missing = [];
    for (const tpl of FORM_TEMPLATES) {
      for (const key of collectTemplateKeys(tpl)) {
        const value = lookup(dict, key);
        if (typeof value !== 'string' || !value.trim()) missing.push(`${tpl.id}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it.each([
    ['vi', vi],
    ['en', en],
  ])('mẫu dựng ra trường hợp lệ trước khi lưu (%s): nhãn không rỗng, role không trùng, lựa chọn không rỗng/không trùng', (_lang, dict) => {
    for (const tpl of FORM_TEMPLATES) {
      const built = buildFormFromTemplate(tpl, tFor(dict));
      expect(built.fields.length).toBeGreaterThan(0);
      expect(built.fields.length).toBeLessThanOrEqual(30);
      const roles = built.fields.map((f) => f.role).filter(Boolean);
      expect(new Set(roles).size).toBe(roles.length);
      for (const f of built.fields) {
        expect(f.label.trim()).not.toBe('');
        expect(f.key).toBe('');
        if (['select', 'radio', 'checkbox'].includes(f.type)) {
          expect(f.options.length).toBeGreaterThan(0);
          expect(new Set(f.options).size).toBe(f.options.length);
        } else {
          expect(f.options).toEqual([]);
        }
      }
    }
  });

  it('chỉ mẫu "Thu tiền" chạm thanh toán (và chỉ chủ tài khoản dùng được); chỉ mẫu "Đặt lịch hẹn" bật đặt lịch', () => {
    expect(FORM_TEMPLATES.filter((tpl) => tpl.payment).map((tpl) => tpl.id)).toEqual(['payment']);
    expect(FORM_TEMPLATES.filter((tpl) => tpl.ownerOnly).map((tpl) => tpl.id)).toEqual(['payment']);
    expect(FORM_TEMPLATES.filter((tpl) => tpl.bookingSlots).map((tpl) => tpl.id)).toEqual(['booking']);
  });

  it('mẫu KHÔNG tự bật ô đồng ý tiếp thị hay đặt đường dẫn chuyển hướng (quyết định của chủ form)', () => {
    for (const tpl of FORM_TEMPLATES) {
      const { settings } = buildFormFromTemplate(tpl, tFor(vi));
      expect(settings).not.toHaveProperty('consentEnabled');
      expect(settings).not.toHaveProperty('redirectUrl');
    }
  });
});
