import { normalizePersistedLeadForm, OCCUPATION_VALUES, INTEREST_AREA_VALUES } from './landingLeadFormConfig.util.js';

/**
 * PR-5b-2a (`PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md`, "Bổ sung 15/09 khi soạn lệnh
 * PR-5b-2") — chuyển `leadFormConfig` (landing cũ, `custom_config.leadForm`) sang `fields[]` cho
 * Biểu mẫu mới (`forms.fields`, còn phải qua `formDefinition.util.js` `normalizeFormFields` để
 * validate/sinh key). Ba trường cố định (họ tên/email/SĐT) luôn có, gán đúng `role` để
 * `read_form_submissions`/`listConsentedSubmissionsForCampaign` nhận diện đúng cột
 * `respondent_name/email/phone` — KHÔNG đặt key `name`/`email`/`phone` tường minh vì đó là khoá
 * CẤM của item chiến dịch (`formCampaignItem.util.js` RESERVED_CAMPAIGN_ITEM_FIELD_KEYS, so
 * không phân biệt hoa thường) nên `normalizeFormFields` sẽ tự sinh khoá khác — để trống cho nó tự
 * làm, `role` mới là thứ mang ý nghĩa thật.
 *
 * Bẫy (đã kiểm khi phản biện plan): checkbox của `leadFormConfig` là MỘT ô đồng ý đúng/sai
 * (`founderai-capture.js` gán `true/false` thẳng), còn `checkbox` của Biểu mẫu là NHIỀU lựa chọn
 * bắt buộc có `options` (`formDefinition.util.js` ALLOWED_FIELD_TYPES đòi ≥1 option cho cả
 * 'select'/'radio'/'checkbox') — ánh xạ thẳng type='checkbox' sẽ tạo một ô multi-select 1 lựa
 * chọn, sai hẳn ý nghĩa gốc. Chọn RADIO 2 lựa chọn Có/Không (giữ đúng `required`) thay vì
 * 'checkbox' hay 'select' — đúng bản chất nhị phân, không cần mở dropdown cho 2 lựa chọn.
 *
 * @param {object|null|undefined} leadFormConfig `customConfig.leadForm` đã persist (hoặc
 *   null/{} — coi như mặc định, cả hai trường cố định occupation/interestArea đều hiện)
 * @returns {Array<object>} fields[] thô — CHƯA qua `normalizeFormFields`, caller tự gọi tiếp
 */
export function buildFormFieldsFromLeadFormConfig(leadFormConfig) {
  const config = normalizePersistedLeadForm(leadFormConfig);

  const fields = [
    { type: 'short_text', label: 'Họ và tên', role: 'name', required: true },
    { type: 'email', label: 'Email', role: 'email', required: true },
    { type: 'phone', label: 'Số điện thoại', role: 'phone', required: false },
  ];

  if (config.fixedFields.occupation.visible) {
    fields.push({
      key: 'occupation',
      type: 'select',
      label: 'Nghề nghiệp',
      required: false,
      options: OCCUPATION_VALUES.map((value) => ({ label: value, value })),
    });
  }
  if (config.fixedFields.interestArea.visible) {
    fields.push({
      key: 'interest_area',
      type: 'select',
      label: 'Lĩnh vực quan tâm',
      required: false,
      options: INTEREST_AREA_VALUES.map((value) => ({ label: value, value })),
    });
  }

  const CUSTOM_TYPE_MAP = { text: 'short_text', textarea: 'long_text', select: 'select', radio: 'radio' };
  for (const custom of config.customFields) {
    if (custom.type === 'checkbox') {
      fields.push({
        key: custom.key,
        type: 'radio',
        label: custom.labelVi,
        required: Boolean(custom.required),
        options: [
          { label: 'Có', value: 'yes' },
          { label: 'Không', value: 'no' },
        ],
      });
      continue;
    }
    fields.push({
      key: custom.key,
      type: CUSTOM_TYPE_MAP[custom.type] || 'short_text',
      label: custom.labelVi,
      required: Boolean(custom.required),
      options: (custom.options || []).map((opt) => ({ label: opt.labelVi, value: opt.value })),
    });
  }

  return fields;
}
