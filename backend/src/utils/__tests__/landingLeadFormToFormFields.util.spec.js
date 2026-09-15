import { describe, it, expect } from '@jest/globals';
import { buildFormFieldsFromLeadFormConfig } from '../landingLeadFormToFormFields.util.js';
import { normalizeFormFields } from '../formDefinition.util.js';
import { OCCUPATION_VALUES, INTEREST_AREA_VALUES } from '../landingLeadFormConfig.util.js';

describe('buildFormFieldsFromLeadFormConfig (PR-5b-2a)', () => {
  it('null/undefined → 3 trường cố định + occupation/interestArea mặc định hiện (fallback legacy)', () => {
    const fields = buildFormFieldsFromLeadFormConfig(null);
    const roles = fields.map((f) => f.role).filter(Boolean);
    expect(roles).toEqual(['name', 'email', 'phone']);
    const labels = fields.map((f) => f.label);
    expect(labels).toContain('Nghề nghiệp');
    expect(labels).toContain('Lĩnh vực quan tâm');
    // Kết quả phải qua được normalizeFormFields (formDefinition.util.js) không throw.
    expect(() => normalizeFormFields(fields)).not.toThrow();
  });

  it('occupation/interestArea visible=false → không có 2 trường select tương ứng', () => {
    const fields = buildFormFieldsFromLeadFormConfig({
      version: 1,
      fixedFields: { occupation: { visible: false }, interestArea: { visible: false } },
      customFields: [],
    });
    const labels = fields.map((f) => f.label);
    expect(labels).not.toContain('Nghề nghiệp');
    expect(labels).not.toContain('Lĩnh vực quan tâm');
    expect(fields).toHaveLength(3);
  });

  it('occupation visible=true → options khớp ĐÚNG OCCUPATION_VALUES (value=label=chuỗi hệ thống)', () => {
    const fields = buildFormFieldsFromLeadFormConfig({
      version: 1,
      fixedFields: { occupation: { visible: true }, interestArea: { visible: false } },
      customFields: [],
    });
    const occupationField = fields.find((f) => f.key === 'occupation');
    expect(occupationField.type).toBe('select');
    expect(occupationField.options.map((o) => o.value)).toEqual(OCCUPATION_VALUES);
    expect(occupationField.options.map((o) => o.label)).toEqual(OCCUPATION_VALUES);
  });

  it('interestArea visible=true → options khớp ĐÚNG INTEREST_AREA_VALUES', () => {
    const fields = buildFormFieldsFromLeadFormConfig({
      version: 1,
      fixedFields: { occupation: { visible: false }, interestArea: { visible: true } },
      customFields: [],
    });
    const interestField = fields.find((f) => f.key === 'interest_area');
    expect(interestField.options.map((o) => o.value)).toEqual(INTEREST_AREA_VALUES);
  });

  it('customFields type=text/textarea/select/radio → ánh xạ đúng short_text/long_text/select/radio, giữ key/label/required/options', () => {
    const fields = buildFormFieldsFromLeadFormConfig({
      version: 1,
      fixedFields: { occupation: { visible: false }, interestArea: { visible: false } },
      customFields: [
        { key: 'cf_company', type: 'text', labelVi: 'Tên công ty', required: true, options: [] },
        { key: 'cf_note', type: 'textarea', labelVi: 'Ghi chú', required: false, options: [] },
        {
          key: 'cf_size',
          type: 'select',
          labelVi: 'Quy mô',
          required: false,
          options: [{ value: 'small', labelVi: 'Nhỏ' }, { value: 'large', labelVi: 'Lớn' }],
        },
        {
          key: 'cf_channel',
          type: 'radio',
          labelVi: 'Kênh',
          required: true,
          options: [{ value: 'fb', labelVi: 'Facebook' }],
        },
      ],
    });

    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
    expect(byKey.cf_company).toMatchObject({ type: 'short_text', label: 'Tên công ty', required: true });
    expect(byKey.cf_note).toMatchObject({ type: 'long_text', label: 'Ghi chú', required: false });
    expect(byKey.cf_size).toMatchObject({
      type: 'select',
      label: 'Quy mô',
      options: [{ label: 'Nhỏ', value: 'small' }, { label: 'Lớn', value: 'large' }],
    });
    expect(byKey.cf_channel).toMatchObject({
      type: 'radio',
      label: 'Kênh',
      required: true,
      options: [{ label: 'Facebook', value: 'fb' }],
    });
  });

  // Bẫy đã kiểm khi phản biện plan: checkbox landing = MỘT ô đồng ý đúng/sai, checkbox Biểu mẫu =
  // nhiều lựa chọn có options — ánh xạ thẳng sẽ sai ý nghĩa hoặc bị normalizeFormFields từ chối
  // (ALLOWED_FIELD_TYPES đòi ≥1 option cho type='checkbox', nhưng landing checkbox không có
  // options nào). Chọn RADIO 2 lựa chọn Có/Không.
  it('customFields type=checkbox → ánh xạ sang RADIO 2 lựa chọn Có/Không (KHÔNG giữ type=checkbox)', () => {
    const fields = buildFormFieldsFromLeadFormConfig({
      version: 1,
      fixedFields: { occupation: { visible: false }, interestArea: { visible: false } },
      customFields: [
        { key: 'cf_agree_terms', type: 'checkbox', labelVi: 'Đồng ý điều khoản', required: true, options: [] },
      ],
    });
    const field = fields.find((f) => f.key === 'cf_agree_terms');
    expect(field.type).toBe('radio');
    expect(field.required).toBe(true);
    expect(field.options).toEqual([
      { label: 'Có', value: 'yes' },
      { label: 'Không', value: 'no' },
    ]);
    // Phải qua được normalizeFormFields — nếu lỡ giữ type='checkbox' không options thì sẽ throw ở đây.
    expect(() => normalizeFormFields(fields)).not.toThrow();
  });

  it('3 trường cố định KHÔNG có key "name"/"email"/"phone" tường minh (khoá cấm của item chiến dịch) — role mới mang ý nghĩa', () => {
    const fields = buildFormFieldsFromLeadFormConfig(null);
    const roleFields = fields.filter((f) => f.role);
    for (const f of roleFields) {
      expect(f.key).toBeUndefined();
    }
    // normalizeFormFields tự sinh key khác, role vẫn đúng sau khi normalize.
    const normalized = normalizeFormFields(fields);
    const rolesAfterNormalize = normalized.map((f) => f.role).filter(Boolean);
    expect(rolesAfterNormalize).toEqual(['name', 'email', 'phone']);
    for (const f of normalized) {
      if (f.role) expect(f.key).not.toBe(f.role);
    }
  });
});
