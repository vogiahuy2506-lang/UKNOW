import { describe, expect, it } from 'vitest';
import {
  nextUnusedOptionValue,
  prepareLeadFormConfigForSave,
  snapshotLeadFormPersistedMeta,
} from '../landingLeadFormConfig.js';

const saved = {
  version: 1,
  fixedFields: { occupation: { visible: true }, interestArea: { visible: true } },
  customFields: [{
    key: 'cf_note_abcd',
    type: 'text',
    labelVi: 'Ghi chú',
    labelEn: '',
    required: false,
    options: [],
  }],
};

describe('prepareLeadFormConfigForSave', () => {
  it('không drop field đã lưu khi xóa nhãn — trả lỗi', () => {
    const persisted = snapshotLeadFormPersistedMeta(saved);
    const { config, errors } = prepareLeadFormConfigForSave({
      ...saved,
      customFields: [{ ...saved.customFields[0], labelVi: '' }],
    }, persisted);
    expect(config.customFields).toHaveLength(1);
    expect(config.customFields[0].key).toBe('cf_note_abcd');
    expect(errors[0]).toMatchObject({ key: 'cf_note_abcd', field: 'labelVi' });
  });

  it('bỏ hàng mới chưa điền nhãn', () => {
    const persisted = snapshotLeadFormPersistedMeta(saved);
    const { config, errors } = prepareLeadFormConfigForSave({
      ...saved,
      customFields: [
        saved.customFields[0],
        {
          key: 'cf_new_zzzz',
          type: 'text',
          labelVi: '',
          labelEn: '',
          required: false,
          options: [],
        },
      ],
    }, persisted);
    expect(config.customFields.map((f) => f.key)).toEqual(['cf_note_abcd']);
    expect(errors).toEqual([]);
  });

  it('giữ field mới có nhãn 1 ký tự và trả lỗi', () => {
    const persisted = snapshotLeadFormPersistedMeta(saved);
    const { config, errors } = prepareLeadFormConfigForSave({
      ...saved,
      customFields: [
        saved.customFields[0],
        {
          key: 'cf_new_zzzz',
          type: 'text',
          labelVi: 'A',
          labelEn: '',
          required: false,
          options: [],
        },
      ],
    }, persisted);
    expect(config.customFields.map((f) => f.key)).toEqual(['cf_note_abcd', 'cf_new_zzzz']);
    expect(errors[0]).toMatchObject({ key: 'cf_new_zzzz', field: 'labelVi' });
  });
});

describe('nextUnusedOptionValue', () => {
  it('bỏ qua mã đang có; lỗ trống chỉ tái dùng khi chưa từng persist', () => {
    expect(nextUnusedOptionValue([])).toBe('opt_1');
    expect(nextUnusedOptionValue([{ value: 'opt_1' }])).toBe('opt_2');
    expect(nextUnusedOptionValue([{ value: 'opt_1' }, { value: 'opt_2' }])).toBe('opt_3');
    expect(nextUnusedOptionValue([{ value: 'opt_1' }, { value: 'opt_3' }])).toBe('opt_2');
    expect(nextUnusedOptionValue([{ value: 'small' }, { value: 'opt_1' }])).toBe('opt_2');
  });

  it('không tái dùng mã đã persist sau khi xóa option trên UI', () => {
    expect(nextUnusedOptionValue(
      [{ value: 'opt_1' }, { value: 'opt_3' }],
      ['opt_1', 'opt_2', 'opt_3'],
    )).toBe('opt_4');
    expect(nextUnusedOptionValue(
      [{ value: 'opt_1' }],
      new Set(['opt_1', 'opt_2']),
    )).toBe('opt_3');
  });
});
