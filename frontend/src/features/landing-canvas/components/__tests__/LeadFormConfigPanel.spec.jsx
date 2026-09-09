import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LeadFormConfigPanel from '../LeadFormConfigPanel.jsx';
import { defaultLeadFormConfig } from '../../../landing-pages/utils/landingLeadFormConfig.js';
import viDict from '../../../../i18n/vi.js';
import { editLandingHtmlWithAi } from '../../../landing-pages/services/landingPagesAdminApi.service.js';

vi.mock('../../../landing-pages/services/landingPagesAdminApi.service.js', () => ({
  editLandingHtmlWithAi: vi.fn(),
}));

/**
 * PLAN_LEAD_FORM_TRUONG_THEM_2026-09-08.md PR-2d-2 việc 4.
 *
 * LeadFormConfigPanel (khôi phục nguyên vẹn ở PR-2d-2 việc 1) nhận `t` như một PROP thuần —
 * dùng thẳng từ điển vi.js thật (không mock chuỗi) để test cũng bắt được lỗi thiếu khoá dịch
 * (t trả về nguyên key thô "leadFormConfig.xxx" khi không tìm thấy).
 */
const t = (key) => {
  const parts = key.split('.');
  let current = viDict;
  for (const part of parts) {
    current = current?.[part];
  }
  return current !== undefined ? current : key;
};

function makeForm(overrides = {}) {
  return {
    leadFormConfig: defaultLeadFormConfig(),
    leadFormPersistedMeta: { keys: [], optionValuesByKey: {} },
    leadFormFieldErrors: {},
    ...overrides,
  };
}

function makeCustomField(overrides = {}) {
  return {
    key: 'cf_test_aaaa',
    type: 'text',
    labelVi: 'Trường thử',
    labelEn: '',
    placeholderVi: '',
    placeholderEn: '',
    required: false,
    options: [],
    ...overrides,
  };
}

describe('LeadFormConfigPanel', () => {
  it('bấm "+ Thêm trường" → customFields dài 1, khoá khớp /^cf_[a-z0-9_]{4,40}$/', () => {
    const setForm = vi.fn();
    const form = makeForm();
    render(<LeadFormConfigPanel form={form} setForm={setForm} t={t} />);

    fireEvent.click(screen.getByRole('button', { name: t('leadFormConfig.addField') }));

    expect(setForm).toHaveBeenCalledTimes(1);
    const updater = setForm.mock.calls[0][0];
    const next = updater(form);
    expect(next.leadFormConfig.customFields).toHaveLength(1);
    expect(next.leadFormConfig.customFields[0].key).toMatch(/^cf_[a-z0-9_]{4,40}$/);
  });

  it('bấm nút xoá trường → customFields rỗng lại', () => {
    const setForm = vi.fn();
    const form = makeForm({
      leadFormConfig: { ...defaultLeadFormConfig(), customFields: [makeCustomField()] },
    });
    render(<LeadFormConfigPanel form={form} setForm={setForm} t={t} />);

    fireEvent.click(screen.getByRole('button', { name: 'Xoá trường' }));

    expect(setForm).toHaveBeenCalledTimes(1);
    const updater = setForm.mock.calls[0][0];
    const next = updater(form);
    expect(next.leadFormConfig.customFields).toHaveLength(0);
  });

  it('field có khoá nằm trong leadFormPersistedMeta.keys → ô chọn kiểu bị disabled (bất biến sau khi có lead)', () => {
    const setForm = vi.fn();
    const persistedField = makeCustomField({ key: 'cf_persisted_aaaa', labelVi: 'Đã lưu' });
    const form = makeForm({
      leadFormConfig: { ...defaultLeadFormConfig(), customFields: [persistedField] },
      leadFormPersistedMeta: { keys: ['cf_persisted_aaaa'], optionValuesByKey: {} },
    });
    render(<LeadFormConfigPanel form={form} setForm={setForm} t={t} />);

    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('field CHƯA có trong persistedMeta.keys → ô chọn kiểu KHÔNG bị disabled', () => {
    const setForm = vi.fn();
    const newField = makeCustomField({ key: 'cf_new_field_bbbb', labelVi: 'Mới' });
    const form = makeForm({
      leadFormConfig: { ...defaultLeadFormConfig(), customFields: [newField] },
      leadFormPersistedMeta: { keys: [], optionValuesByKey: {} },
    });
    render(<LeadFormConfigPanel form={form} setForm={setForm} t={t} />);

    expect(screen.getByRole('combobox')).not.toBeDisabled();
  });

  it('render không lộ chuỗi khoá i18n thô kiểu "leadFormConfig."', () => {
    const setForm = vi.fn();
    const form = makeForm({
      leadFormConfig: { ...defaultLeadFormConfig(), customFields: [makeCustomField()] },
    });
    const { container } = render(<LeadFormConfigPanel form={form} setForm={setForm} t={t} />);
    expect(container.textContent).not.toContain('leadFormConfig.');
  });

  /**
   * PLAN_LEAD_FORM_TRUONG_THEM_2026-09-08.md PR-2d-3 việc 3: so name="<khoá>" trong
   * form.htmlContent với từng trường — thiếu → cảnh báo + nút "Nhờ AI thêm ô này".
   */
  describe('cảnh báo thiếu ô trong htmlContent', () => {
    beforeEach(() => {
      editLandingHtmlWithAi.mockReset();
    });

    it('custom field CHƯA có name="<khoá>" trong htmlContent → cảnh báo + nút "Nhờ AI thêm ô này" hiện', () => {
      const setForm = vi.fn();
      const field = makeCustomField({ key: 'cf_test_aaaa', labelVi: 'Trường thử' });
      const form = makeForm({
        leadFormConfig: {
          ...defaultLeadFormConfig(),
          fixedFields: { occupation: { visible: false }, interestArea: { visible: false } },
          customFields: [field],
        },
        htmlContent: '<form data-founderai-capture><input name="email" /></form>',
      });
      render(<LeadFormConfigPanel form={form} setForm={setForm} t={t} />);

      expect(screen.getByText(/Trang chưa có ô/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Nhờ AI thêm ô này' })).toBeInTheDocument();
    });

    it('custom field ĐÃ có name="<khoá>" trong htmlContent → không cảnh báo', () => {
      const setForm = vi.fn();
      const field = makeCustomField({ key: 'cf_test_aaaa', labelVi: 'Trường thử' });
      const form = makeForm({
        leadFormConfig: {
          ...defaultLeadFormConfig(),
          fixedFields: { occupation: { visible: false }, interestArea: { visible: false } },
          customFields: [field],
        },
        htmlContent: '<form data-founderai-capture><input name="cf_test_aaaa" /></form>',
      });
      render(<LeadFormConfigPanel form={form} setForm={setForm} t={t} />);

      expect(screen.queryByText(/Trang chưa có ô/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Nhờ AI thêm ô này' })).not.toBeInTheDocument();
    });

    it('chưa có htmlContent (trang mới, chưa sinh HTML) → không cảnh báo dù thiếu ô', () => {
      const setForm = vi.fn();
      const field = makeCustomField({ key: 'cf_test_aaaa', labelVi: 'Trường thử' });
      const form = makeForm({
        leadFormConfig: { ...defaultLeadFormConfig(), customFields: [field] },
        htmlContent: '',
      });
      render(<LeadFormConfigPanel form={form} setForm={setForm} t={t} />);

      expect(screen.queryByText(/Trang chưa có ô/)).not.toBeInTheDocument();
    });

    it('occupation bật nhưng htmlContent thiếu name="occupation" → cảnh báo hiện; interestArea đã có → không cảnh báo riêng nó', () => {
      const setForm = vi.fn();
      const form = makeForm({
        leadFormConfig: {
          ...defaultLeadFormConfig(),
          fixedFields: {
            occupation: { visible: true },
            interestArea: { visible: true },
          },
        },
        htmlContent: '<form data-founderai-capture><select name="interestArea"></select></form>',
      });
      render(<LeadFormConfigPanel form={form} setForm={setForm} t={t} />);

      expect(screen.getByText(/Trang chưa có ô "Nghề nghiệp"/)).toBeInTheDocument();
      expect(screen.queryByText(/Trang chưa có ô "Lĩnh vực quan tâm"/)).not.toBeInTheDocument();
    });

    it('bấm "Nhờ AI thêm ô này" → gọi editLandingHtmlWithAi rồi setForm cập nhật htmlContent với HTML mới', async () => {
      editLandingHtmlWithAi.mockResolvedValueOnce({
        success: true,
        data: { html: '<form data-founderai-capture><input name="cf_test_aaaa" /></form>' },
      });
      const setForm = vi.fn();
      const field = makeCustomField({ key: 'cf_test_aaaa', labelVi: 'Trường thử' });
      const form = makeForm({
        leadFormConfig: {
          ...defaultLeadFormConfig(),
          fixedFields: { occupation: { visible: false }, interestArea: { visible: false } },
          customFields: [field],
        },
        htmlContent: '<form data-founderai-capture><input name="email" /></form>',
      });
      render(<LeadFormConfigPanel form={form} setForm={setForm} t={t} />);

      fireEvent.click(screen.getByRole('button', { name: 'Nhờ AI thêm ô này' }));

      await waitFor(() => expect(editLandingHtmlWithAi).toHaveBeenCalledTimes(1));
      expect(editLandingHtmlWithAi.mock.calls[0][0]).toMatchObject({
        currentHtml: form.htmlContent,
        instruction: expect.stringContaining('cf_test_aaaa'),
      });

      await waitFor(() => expect(setForm).toHaveBeenCalled());
      const updater = setForm.mock.calls[setForm.mock.calls.length - 1][0];
      const next = updater(form);
      expect(next.htmlContent).toContain('name="cf_test_aaaa"');
    });

    it('editLandingHtmlWithAi lỗi → không throw ra ngoài, không gọi setForm cập nhật htmlContent', async () => {
      editLandingHtmlWithAi.mockRejectedValueOnce(new Error('AI tạo form đăng ký lead nhưng thiếu trường'));
      const setForm = vi.fn();
      const field = makeCustomField({ key: 'cf_test_aaaa', labelVi: 'Trường thử' });
      const form = makeForm({
        leadFormConfig: {
          ...defaultLeadFormConfig(),
          fixedFields: { occupation: { visible: false }, interestArea: { visible: false } },
          customFields: [field],
        },
        htmlContent: '<form data-founderai-capture><input name="email" /></form>',
      });
      render(<LeadFormConfigPanel form={form} setForm={setForm} t={t} />);

      fireEvent.click(screen.getByRole('button', { name: 'Nhờ AI thêm ô này' }));

      await waitFor(() => expect(editLandingHtmlWithAi).toHaveBeenCalledTimes(1));
      expect(setForm).not.toHaveBeenCalled();
    });
  });
});
