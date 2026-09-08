import { describe, expect, it } from 'vitest';
import {
  nextUnusedOptionValue,
  normalizeLeadFormConfig,
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

/**
 * PLAN_LEAD_FORM_TRUONG_THEM_2026-09-08.md PR-2d-1 việc 5 — "test vòng tròn" chặn đúng lỗi
 * "mỗi lần lưu là một lần xoá" (commit 3c514bc8 gây ra, sửa ở b8b9725c).
 *
 * Bước 1 "toPublicLeadFormConfig giả lập": object dưới đây có ĐÚNG shape hàm backend cùng tên
 * (landingLeadFormConfig.util.js:225-249) trả về cho GET — xem test "public DTO whitelist không
 * lộ key lạ" ở backend cho shape đó; giả lập ở đây vì vitest (frontend) không import được module
 * backend (khác package/runtime). Bước 2, 3 gọi normalizeLeadFormConfig/prepareLeadFormConfigForSave
 * THẬT — không hand-code lại logic chuyển đổi (Bẫy 7, mục 3 plan).
 */
describe('Vòng tròn GET → normalize → prepare (PR-2d-1 việc 5)', () => {
  it('toPublicLeadFormConfig (giả lập) → normalizeLeadFormConfig → prepareLeadFormConfigForSave: object đưa lên PUT bằng đầu vào', () => {
    const simulatedGetResponse = {
      version: 1,
      fixedFields: {
        occupation: { visible: false },
        interestArea: { visible: true },
      },
      customFields: [
        {
          key: 'cf_company_text',
          type: 'text',
          labelVi: 'Tên công ty',
          labelEn: 'Company name',
          placeholderVi: 'Nhập tên công ty',
          placeholderEn: 'Enter company name',
          required: true,
          options: [],
        },
        {
          key: 'cf_size_select',
          type: 'select',
          labelVi: 'Quy mô',
          labelEn: 'Size',
          placeholderVi: 'Chọn quy mô',
          placeholderEn: 'Select size',
          required: false,
          options: [
            { value: 'small', labelVi: '1-10', labelEn: '1-10' },
            { value: 'large', labelVi: '50+', labelEn: '50+' },
          ],
        },
      ],
      theme: {
        primary: '#111111',
        accent: '#222222',
        bg: '#ffffff',
        text: '#000000',
        border: '#cccccc',
        radius: 4,
        titleText: 'Tiêu đề tuỳ chỉnh',
        subtitleText: 'Mô tả tuỳ chỉnh',
        buttonText: 'Nút tuỳ chỉnh',
      },
    };

    const normalized = normalizeLeadFormConfig(simulatedGetResponse);
    const persistedMeta = snapshotLeadFormPersistedMeta(simulatedGetResponse);
    const { config, errors } = prepareLeadFormConfigForSave(normalized, persistedMeta);

    expect(errors).toEqual([]);
    // Không mất customFields, không đổi theme — đây là ca "mỗi lần lưu là một lần xoá" từng xảy ra.
    expect(config.customFields).toHaveLength(2);
    expect(config).toEqual(simulatedGetResponse);
  });

  it('bản tối giản cũ (không version/fixedFields/customFields) sẽ KHÔNG còn khớp version → về default, không phải giữ nguyên mù quáng', () => {
    // Chốt chặn ngược: nếu ai đó vô tình đưa lại shape tối giản {fields:[...]} vào, normalize
    // phải nhận diện SAI version và trả default — không được coi hình dạng lạ là "hợp lệ".
    const minimalShapeLeftover = { fields: [{ key: 'name', enabled: true }] };
    const normalized = normalizeLeadFormConfig(minimalShapeLeftover);
    expect(normalized.version).toBe(1);
    expect(normalized.customFields).toEqual([]);
    expect(normalized.fixedFields).toEqual({
      occupation: { visible: true },
      interestArea: { visible: true },
    });
  });
});
