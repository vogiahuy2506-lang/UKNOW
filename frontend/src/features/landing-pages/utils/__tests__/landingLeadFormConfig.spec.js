import { describe, it, expect } from 'vitest';
import { prepareLeadFormConfigForSave, defaultLeadFormConfig } from '../landingLeadFormConfig.js';

/**
 * Bug tìm thấy khi dọn lint (07/09/2026): sau khi landingLeadFormConfig.js được rút gọn còn
 * "minimal for compatibility" (bỏ custom-field-builder), errors trả về là mảng CHUỖI, nhưng
 * caller duy nhất (LandingCanvasEditor.jsx resolveLeadFormConfigForSave) đọc
 * `errors.map((e) => [e.key, e.message])` và `errors[0].message` — trên chuỗi, cả hai đều
 * undefined. Toast lỗi hiện ra rỗng/"undefined" thay vì câu tiếng Việt thật.
 */
describe('prepareLeadFormConfigForSave — shape lỗi khớp caller (LandingCanvasEditor.jsx)', () => {
  it('thiếu cả name lẫn phone → errors là mảng object { key, message }, không phải chuỗi', () => {
    const config = { ...defaultLeadFormConfig(), fields: [{ key: 'note', enabled: true, required: false }] };
    const { errors } = prepareLeadFormConfigForSave(config);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toHaveProperty('key');
    expect(errors[0]).toHaveProperty('message');
    expect(errors[0].message).toMatch(/Họ tên hoặc Số điện thoại/);
  });

  it('có name hoặc phone enabled → không lỗi', () => {
    const { errors } = prepareLeadFormConfigForSave(defaultLeadFormConfig());
    expect(errors).toHaveLength(0);
  });
});
