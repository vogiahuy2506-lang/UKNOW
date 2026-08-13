import { describe, expect, it } from '@jest/globals';
import {
  applyLeadFormDraftToConfig,
  buildLeadFormDraftFromBrief,
  buildTrustedCustomFieldsSnapshot,
  defaultLeadFormConfig,
  mergeLeadFormIntoCustomConfig,
  normalizePersistedLeadForm,
  toPublicLeadFormConfig,
  validateAdminLeadFormConfig,
} from '../landingLeadFormConfig.util.js';
import {
  appendCustomFieldFilterSql,
  normalizeLandingLeadsCustomFilters,
} from '../landingLeadCustomFilters.util.js';

describe('landingLeadFormConfig.util', () => {
  it('null/malformed/unknown version → default legacy visible', () => {
    const d = defaultLeadFormConfig();
    expect(normalizePersistedLeadForm(null)).toEqual(d);
    expect(normalizePersistedLeadForm({ leadForm: { version: 9 } })).toEqual(d);
    expect(normalizePersistedLeadForm('x')).toEqual(d);
    expect(d.fixedFields.occupation.visible).toBe(true);
    expect(d.fixedFields.interestArea.visible).toBe(true);
    expect(d.customFields).toEqual([]);
  });

  it('public DTO whitelist không lộ key lạ', () => {
    const dto = toPublicLeadFormConfig({
      leadForm: {
        version: 1,
        secret: 'nope',
        fixedFields: { occupation: { visible: false }, interestArea: { visible: true } },
        customFields: [{
          key: 'cf_company_size_ab12',
          type: 'select',
          labelVi: 'Quy mô',
          labelEn: 'Size',
          required: true,
          extra: 1,
          options: [{ value: 'small', labelVi: '1-10', labelEn: '1-10', extra: true }],
        }],
      },
    });
    expect(dto.secret).toBeUndefined();
    expect(dto.fixedFields.occupation.visible).toBe(false);
    expect(dto.customFields[0].extra).toBeUndefined();
    expect(dto.customFields[0].options[0].extra).toBeUndefined();
  });

  it('reject prototype key, duplicate, 21 fields, immutable type', () => {
    expect(() => validateAdminLeadFormConfig({
      customFields: [{ key: '__proto__', type: 'text', labelVi: 'Nope' }],
    })).toThrow(/không hợp lệ/i);

    expect(() => validateAdminLeadFormConfig({
      customFields: [
        { key: 'cf_aaaa', type: 'text', labelVi: 'Aaaa' },
        { key: 'cf_aaaa', type: 'text', labelVi: 'Bbbb' },
      ],
    })).toThrow(/trùng/i);

    expect(() => validateAdminLeadFormConfig({
      customFields: Array.from({ length: 21 }, (_, i) => ({
        key: `cf_field_${String(i).padStart(2, '0')}xx`,
        type: 'text',
        labelVi: `Field ${i}`,
      })),
    })).toThrow(/20/);

    expect(() => validateAdminLeadFormConfig(
      {
        customFields: [{ key: 'cf_note_abcd', type: 'textarea', labelVi: 'Ghi chú' }],
      },
      { existing: { version: 1, customFields: [{ key: 'cf_note_abcd', type: 'text', labelVi: 'Ghi chú' }] } }
    )).toThrow(/đổi loại/i);
  });

  it('reject rename option value đã persist (small → tiny)', () => {
    const existing = {
      version: 1,
      customFields: [{
        key: 'cf_company_size_ab12',
        type: 'select',
        labelVi: 'Quy mô',
        options: [
          { value: 'small', labelVi: '1-10' },
          { value: 'large', labelVi: '50+' },
        ],
      }],
    };
    expect(() => validateAdminLeadFormConfig(
      {
        customFields: [{
          key: 'cf_company_size_ab12',
          type: 'select',
          labelVi: 'Quy mô',
          options: [
            { value: 'tiny', labelVi: '1-10' },
            { value: 'large', labelVi: '50+' },
          ],
        }],
      },
      { existing }
    )).toThrow(/mã lựa chọn/i);

    const added = validateAdminLeadFormConfig(
      {
        customFields: [{
          key: 'cf_company_size_ab12',
          type: 'select',
          labelVi: 'Quy mô',
          options: [
            { value: 'small', labelVi: '1-10' },
            { value: 'large', labelVi: '50+' },
            { value: 'xl', labelVi: '200+' },
          ],
        }],
      },
      { existing }
    );
    expect(added.customFields[0].options.map((o) => o.value)).toEqual(['small', 'large', 'xl']);

    expect(() => validateAdminLeadFormConfig(
      {
        customFields: [{
          key: 'cf_company_size_ab12',
          type: 'select',
          labelVi: 'Quy mô',
          options: [
            { value: 'tiny', labelVi: '1-10' },
            { value: 'large', labelVi: '50+' },
            { value: 'xl', labelVi: '200+' },
          ],
        }],
      },
      { existing }
    )).toThrow(/mã lựa chọn/i);

    const removedOnly = validateAdminLeadFormConfig(
      {
        customFields: [{
          key: 'cf_company_size_ab12',
          type: 'select',
          labelVi: 'Quy mô',
          options: [{ value: 'large', labelVi: '50+' }],
        }],
      },
      { existing }
    );
    expect(removedOnly.customFields[0].options.map((o) => o.value)).toEqual(['large']);
  });

  it('merge preserve other JSONB keys when omit leadFormConfig', () => {
    const existing = { theme: 'dark', leadForm: { version: 1, fixedFields: { occupation: { visible: false }, interestArea: { visible: true } }, customFields: [] } };
    const omitted = mergeLeadFormIntoCustomConfig(existing, undefined);
    expect(omitted.theme).toBe('dark');
    expect(omitted.leadForm.fixedFields.occupation.visible).toBe(false);

    const updated = mergeLeadFormIntoCustomConfig(existing, {
      fixedFields: { occupation: { visible: true }, interestArea: { visible: false } },
      customFields: [],
    });
    expect(updated.theme).toBe('dark');
    expect(updated.leadForm.fixedFields.occupation.visible).toBe(true);
    expect(updated.leadForm.fixedFields.interestArea.visible).toBe(false);
  });

  it('hidden fixed ignore; custom snapshot server-owned; unknown key reject', () => {
    const config = {
      version: 1,
      fixedFields: { occupation: { visible: false }, interestArea: { visible: true } },
      customFields: [{
        key: 'cf_company_size_ab12',
        type: 'select',
        labelVi: 'Quy mô công ty',
        labelEn: 'Company size',
        required: true,
        options: [{ value: 'small', labelVi: '1-10', labelEn: '1-10' }],
      }],
    };
    const snap = buildTrustedCustomFieldsSnapshot(config, { cf_company_size_ab12: 'small' });
    expect(snap.cf_company_size_ab12).toMatchObject({
      type: 'select',
      value: 'small',
      displayVi: '1-10',
      labelVi: 'Quy mô công ty',
    });
    expect(() => buildTrustedCustomFieldsSnapshot(config, { cf_unknown_zzzz: 'x' })).toThrow();
    expect(() => buildTrustedCustomFieldsSnapshot(config, { cf_company_size_ab12: 'huge' })).toThrow();
    expect(() => buildTrustedCustomFieldsSnapshot(config, {})).toThrow(/Quy mô/);
  });

  it('AI draft basic/extended/custom', () => {
    expect(buildLeadFormDraftFromBrief({ formFields: { preset: 'basic' } }).fixedFields.occupation.visible).toBe(false);
    expect(buildLeadFormDraftFromBrief({ formFields: { preset: 'extended' } }).fixedFields.interestArea.visible).toBe(true);
    const custom = buildLeadFormDraftFromBrief({
      formFields: { preset: 'custom', customText: 'Quy mô\nGhi chú\nQuy mô' },
      contentLocale: 'vi',
    });
    expect(custom.suggestedCustomFieldLabels).toEqual(['Quy mô', 'Ghi chú']);
    const applied = applyLeadFormDraftToConfig(custom);
    expect(applied.customFields).toHaveLength(2);
    expect(applied.customFields[0].type).toBe('text');
    expect(applied.customFields[0].labelVi).toBe('Quy mô');
  });
});

describe('landingLeadCustomFilters.util', () => {
  it('validate operators and parameterize path/value', () => {
    const filters = normalizeLandingLeadsCustomFilters([
      { key: 'cf_company_size_ab12', operator: 'in', values: ['small'] },
      { key: 'cf_note_abcd', operator: 'contains', value: 'demo%_x' },
    ]);
    expect(filters).toHaveLength(2);
    const ctx = appendCustomFieldFilterSql({ conditions: [], params: [], idx: 1 }, filters);
    expect(ctx.conditions[0]).toBe("custom_fields -> $1 ->> 'value' = ANY($2::text[])");
    expect(ctx.params[0]).toBe('cf_company_size_ab12');
    expect(ctx.params[1]).toEqual(['small']);
    expect(ctx.conditions[1]).toContain("custom_fields -> $3 ->> 'value' ILIKE");
    expect(ctx.params[3]).toBe('%demo\\%\\_x%');
    expect(JSON.stringify(ctx.conditions).includes('@>')).toBe(false);
  });

  it('reject operator không khớp loại field đã biết; field đã xóa vẫn nhận operator cũ', () => {
    const types = new Map([
      ['cf_company_size_ab12', 'select'],
      ['cf_note_abcd', 'textarea'],
    ]);
    expect(() => normalizeLandingLeadsCustomFilters(
      [{ key: 'cf_company_size_ab12', operator: 'contains', value: 'small' }],
      { fieldTypeByKey: types }
    )).toThrow(/không khớp loại/i);
    expect(() => normalizeLandingLeadsCustomFilters(
      [{ key: 'cf_note_abcd', operator: 'eq', value: 'demo' }],
      { fieldTypeByKey: types }
    )).toThrow(/không khớp loại/i);

    const ok = normalizeLandingLeadsCustomFilters(
      [{ key: 'cf_company_size_ab12', operator: 'in', values: ['small'] }],
      { fieldTypeByKey: types }
    );
    expect(ok[0].operator).toBe('in');

    const historical = normalizeLandingLeadsCustomFilters(
      [{ key: 'cf_deleted_zzzz', operator: 'contains', value: 'old' }],
      { fieldTypeByKey: types }
    );
    expect(historical[0].key).toBe('cf_deleted_zzzz');
  });

  it('reject bad key/operator and more than 10 filters', () => {
    expect(() => normalizeLandingLeadsCustomFilters([{ key: 'occupation', operator: 'eq', value: 'x' }])).toThrow();
    expect(() => normalizeLandingLeadsCustomFilters([{ key: 'cf_note_abcd', operator: 'drop', value: 'x' }])).toThrow();
    expect(() => normalizeLandingLeadsCustomFilters(
      Array.from({ length: 11 }, (_, i) => ({ key: `cf_note_${String(i).padStart(4, '0')}`, operator: 'eq', value: 'a' }))
    )).toThrow();
  });
});
