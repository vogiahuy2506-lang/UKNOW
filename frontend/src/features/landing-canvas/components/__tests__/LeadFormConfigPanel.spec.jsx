import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LeadFormConfigPanel from '../LeadFormConfigPanel.jsx';
import { defaultLeadFormConfig } from '../../../landing-pages/utils/landingLeadFormConfig.js';
import viDict from '../../../../i18n/vi.js';
import { LANDING_COPY } from '../../../landing/constants/landingCopy.js';
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

  /**
   * 03/10/2026: bản xem trước viết cứng formCopy thiếu firstName/lastName (FounderLeadFormCard dùng khi
   * nameMode='split') → hai ô Họ / Tên ra không nhãn; và có câu "Bảo mật tuyệt đối" (NĐ 248). Nay lấy
   * chữ từ LANDING_COPY — cùng nguồn với form công khai (EmbedLeadFormPage). Xem trước thu vào nút,
   * mặc định đóng — các ca dưới mở nó trước.
   */
  describe('xem trước form lấy chữ từ cùng nguồn với form công khai', () => {
    const copy = LANDING_COPY.vi.form;
    const openPreview = () => fireEvent.click(screen.getByRole('button', { name: 'Xem trước form' }));

    it('mặc định ĐÓNG: chưa render khung form; bấm "Xem trước form" mở, "Ẩn xem trước" đóng lại', () => {
      render(<LeadFormConfigPanel form={makeForm()} setForm={vi.fn()} t={t} />);

      expect(screen.queryByText(copy.secureNote)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Xem trước form' })).toHaveAttribute('aria-expanded', 'false');

      openPreview();
      expect(screen.getByText(copy.secureNote)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Ẩn xem trước' })).toHaveAttribute('aria-expanded', 'true');

      fireEvent.click(screen.getByRole('button', { name: 'Ẩn xem trước' }));
      expect(screen.queryByText(copy.secureNote)).not.toBeInTheDocument();
    });

    it('nameMode mặc định (split) → có nhãn ô Họ và ô Tên, không ô nào thiếu nhãn', () => {
      render(<LeadFormConfigPanel form={makeForm()} setForm={vi.fn()} t={t} />);
      openPreview();

      // Ghim chữ thật (không suy từ copy): copy mất khoá thì nhãn rỗng, test vẫn phải đỏ vì lý do đúng.
      expect(screen.getByLabelText(/^Họ\s/)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Tên\s/)).toBeInTheDocument();
      expect(copy.lastName).toBe('Họ');
      expect(copy.firstName).toBe('Tên');
    });

    it('dòng dưới nút gửi đúng bằng LANDING_COPY.vi.form.secureNote và không chứa "tuyệt đối"', () => {
      const { container } = render(<LeadFormConfigPanel form={makeForm()} setForm={vi.fn()} t={t} />);
      openPreview();

      expect(screen.getByText(copy.secureNote)).toBeInTheDocument();
      expect(container.textContent).not.toMatch(/tuyệt đối/i);
    });

    it('tiêu đề / nhãn Email / SĐT / nút gửi cũng là chữ của form công khai', () => {
      render(<LeadFormConfigPanel form={makeForm()} setForm={vi.fn()} t={t} />);
      openPreview();

      expect(screen.getByText(copy.embedTitle)).toBeInTheDocument();
      expect(screen.getByLabelText(new RegExp(`^${copy.email}`))).toBeInTheDocument();
      expect(screen.getByLabelText(new RegExp(`^${copy.phone}`))).toBeInTheDocument();
      expect(screen.getByRole('button', { name: new RegExp(`^${copy.submit}`) })).toBeInTheDocument();
    });
  });

  /**
   * 03/10/2026 PR-1: chọn 1 trong 2 cách thu thông tin khách — chỉ hiện chi tiết của lựa chọn đang chọn
   * (trước đây gộp cả hai hệ thống trong một màn).
   */
  describe('chọn 1 trong 2: Form cơ bản / Dùng biểu mẫu đã tạo', () => {
    const BASIC_MARK = 'Các trường mặc định';
    const LINKED_PICKER_MARK = 'Chọn biểu mẫu để liên kết vào trang:';

    it('mặc định (chưa có biểu mẫu gắn) → "Form cơ bản" được chọn, chỉ hiện cấu hình form cơ bản', () => {
      render(<LeadFormConfigPanel form={makeForm()} setForm={vi.fn()} t={t} />);

      expect(screen.getByRole('radio', { name: 'Form cơ bản' })).toBeChecked();
      expect(screen.getByRole('radio', { name: 'Dùng biểu mẫu đã tạo' })).not.toBeChecked();
      expect(screen.getByText(BASIC_MARK)).toBeInTheDocument();
      expect(screen.getByText('Luôn có: Họ tên, Email, Số điện thoại.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Thêm câu hỏi' })).toBeInTheDocument();
      expect(screen.queryByText(LINKED_PICKER_MARK)).not.toBeInTheDocument();
    });

    it('chọn "Dùng biểu mẫu đã tạo" → ẨN cấu hình form cơ bản, hiện bộ chọn biểu mẫu; chọn lại "Form cơ bản" thì ngược lại', () => {
      render(<LeadFormConfigPanel form={makeForm()} setForm={vi.fn()} t={t} />);

      fireEvent.click(screen.getByRole('radio', { name: 'Dùng biểu mẫu đã tạo' }));

      expect(screen.getByRole('radio', { name: 'Dùng biểu mẫu đã tạo' })).toBeChecked();
      expect(screen.queryByText(BASIC_MARK)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Thêm câu hỏi' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Xem trước form' })).not.toBeInTheDocument();
      expect(screen.getByText(LINKED_PICKER_MARK)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Tạo biểu mẫu mới/ })).toHaveAttribute('href', '/app/forms/new');

      fireEvent.click(screen.getByRole('radio', { name: 'Form cơ bản' }));

      expect(screen.getByText(BASIC_MARK)).toBeInTheDocument();
      expect(screen.queryByText(LINKED_PICKER_MARK)).not.toBeInTheDocument();
    });

    it('trang ĐANG có biểu mẫu gắn (linkedFormId) → mở sẵn ở "Dùng biểu mẫu đã tạo", không hiện cấu hình form cơ bản', () => {
      render(<LeadFormConfigPanel form={makeForm({ linkedFormId: 42 })} setForm={vi.fn()} t={t} />);

      expect(screen.getByRole('radio', { name: 'Dùng biểu mẫu đã tạo' })).toBeChecked();
      expect(screen.getByText('Trang đang liên kết với biểu mẫu')).toBeInTheDocument();
      expect(screen.getByText('Biểu mẫu #42')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Mở sửa biểu mẫu/ })).toHaveAttribute('href', '/app/forms/42/edit');
      expect(screen.queryByText(BASIC_MARK)).not.toBeInTheDocument();
    });

    it('đổi lựa chọn chỉ đổi phần hiển thị, KHÔNG đổi dữ liệu (setForm không được gọi)', () => {
      const setForm = vi.fn();
      render(<LeadFormConfigPanel form={makeForm({ linkedFormId: 42 })} setForm={setForm} t={t} />);

      fireEvent.click(screen.getByRole('radio', { name: 'Form cơ bản' }));
      fireEvent.click(screen.getByRole('radio', { name: 'Dùng biểu mẫu đã tạo' }));

      expect(setForm).not.toHaveBeenCalled();
    });

    it('không còn nhãn "Khuyên dùng" (0/69 trang dùng) và không lộ khoá i18n thô ở cả hai lựa chọn', () => {
      const { container } = render(<LeadFormConfigPanel form={makeForm()} setForm={vi.fn()} t={t} />);
      expect(container.textContent).not.toContain('Khuyên dùng');
      expect(container.textContent).not.toContain('leadFormConfig.');

      fireEvent.click(screen.getByRole('radio', { name: 'Dùng biểu mẫu đã tạo' }));
      expect(container.textContent).not.toContain('Khuyên dùng');
      expect(container.textContent).not.toContain('leadFormConfig.');
    });

    it('danh sách câu hỏi thêm chỉ hiện khi có; chưa có thì hiện dòng gợi ý', () => {
      const { unmount } = render(<LeadFormConfigPanel form={makeForm()} setForm={vi.fn()} t={t} />);
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      expect(screen.getByText(/Chưa có câu hỏi thêm/)).toBeInTheDocument();
      unmount();

      render(
        <LeadFormConfigPanel
          form={makeForm({ leadFormConfig: { ...defaultLeadFormConfig(), customFields: [makeCustomField()] } })}
          setForm={vi.fn()}
          t={t}
        />
      );
      expect(screen.getByRole('combobox')).toBeInTheDocument();
      expect(screen.queryByText(/Chưa có câu hỏi thêm/)).not.toBeInTheDocument();
    });
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

    /**
     * 09/09 (slug-test): AI thêm select đúng name nhưng value là nhãn → backend từ chối mọi lead.
     * Mức 2: có ô nhưng mã lựa chọn không khớp → cảnh báo riêng + nút "Nhờ AI sửa ô này".
     */
    it('select có name trong htmlContent nhưng option value là nhãn (không khớp opt_*) → cảnh báo "không khớp mã" + nút "Nhờ AI sửa ô này"', () => {
      const field = makeCustomField({
        key: 'cf_field_g2e9',
        type: 'select',
        labelVi: 'lươngthưởng',
        options: [
          { value: 'opt_a', labelVi: 'Lựa chọn 1', labelEn: '' },
          { value: 'opt_1', labelVi: 'Lựa chọn 2', labelEn: '' },
        ],
      });
      const form = makeForm({
        leadFormConfig: {
          ...defaultLeadFormConfig(),
          fixedFields: { occupation: { visible: false }, interestArea: { visible: false } },
          customFields: [field],
        },
        htmlContent:
          '<form data-founderai-capture><input name="email" />' +
          '<select name="cf_field_g2e9" required><option value="">Chọn</option><option value="Lựa chọn 1">Lựa chọn 1</option></select></form>',
      });
      render(<LeadFormConfigPanel form={form} setForm={vi.fn()} t={t} />);

      expect(screen.getByText(/không khớp mã đã lưu/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Nhờ AI sửa ô này' })).toBeInTheDocument();
      expect(screen.queryByText(/Trang chưa có ô/)).not.toBeInTheDocument();
    });

    it('select có đủ option value đúng mã → không cảnh báo gì', () => {
      const field = makeCustomField({
        key: 'cf_field_g2e9',
        type: 'select',
        labelVi: 'lươngthưởng',
        options: [
          { value: 'opt_a', labelVi: 'Lựa chọn 1', labelEn: '' },
          { value: 'opt_1', labelVi: 'Lựa chọn 2', labelEn: '' },
        ],
      });
      const form = makeForm({
        leadFormConfig: {
          ...defaultLeadFormConfig(),
          fixedFields: { occupation: { visible: false }, interestArea: { visible: false } },
          customFields: [field],
        },
        htmlContent:
          '<form data-founderai-capture><input name="email" />' +
          '<select name="cf_field_g2e9"><option value="">Chọn</option><option value="opt_a">Lựa chọn 1</option><option value="opt_1">Lựa chọn 2</option></select></form>',
      });
      render(<LeadFormConfigPanel form={form} setForm={vi.fn()} t={t} />);

      expect(screen.queryByText(/không khớp mã đã lưu/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Trang chưa có ô/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Nhờ AI/ })).not.toBeInTheDocument();
    });

    it('occupation bật, select có name="occupation" nhưng option tự chế → cảnh báo "không khớp mã" cho Nghề nghiệp', () => {
      const form = makeForm({
        leadFormConfig: {
          ...defaultLeadFormConfig(),
          fixedFields: { occupation: { visible: true }, interestArea: { visible: false } },
          customFields: [],
        },
        htmlContent:
          '<form data-founderai-capture><input name="email" />' +
          '<select name="occupation"><option value="">Chọn</option><option value="Sinh viên">Sinh viên</option></select></form>',
      });
      render(<LeadFormConfigPanel form={form} setForm={vi.fn()} t={t} />);

      expect(screen.getByText(/Ô "Nghề nghiệp" có trên trang nhưng lựa chọn không khớp mã/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Nhờ AI sửa ô này' })).toBeInTheDocument();
    });

    it('bấm "Nhờ AI sửa ô này" → câu lệnh gửi AI chứa markup <option value="opt_a"> đúng mã, và AI trả select đúng → toast thành công', async () => {
      editLandingHtmlWithAi.mockResolvedValueOnce({
        success: true,
        data: {
          html:
            '<form data-founderai-capture><input name="email" />' +
            '<select name="cf_field_g2e9"><option value="">Chọn</option><option value="opt_a">Lựa chọn 1</option><option value="opt_1">Lựa chọn 2</option></select></form>',
        },
      });
      const setForm = vi.fn();
      const field = makeCustomField({
        key: 'cf_field_g2e9',
        type: 'select',
        labelVi: 'lươngthưởng',
        options: [
          { value: 'opt_a', labelVi: 'Lựa chọn 1', labelEn: '' },
          { value: 'opt_1', labelVi: 'Lựa chọn 2', labelEn: '' },
        ],
      });
      const form = makeForm({
        leadFormConfig: {
          ...defaultLeadFormConfig(),
          fixedFields: { occupation: { visible: false }, interestArea: { visible: false } },
          customFields: [field],
        },
        htmlContent:
          '<form data-founderai-capture><input name="email" />' +
          '<select name="cf_field_g2e9"><option value="Lựa chọn 1">Lựa chọn 1</option></select></form>',
      });
      render(<LeadFormConfigPanel form={form} setForm={setForm} t={t} />);

      fireEvent.click(screen.getByRole('button', { name: 'Nhờ AI sửa ô này' }));

      await waitFor(() => expect(editLandingHtmlWithAi).toHaveBeenCalledTimes(1));
      const { instruction } = editLandingHtmlWithAi.mock.calls[0][0];
      expect(instruction).toContain('<option value="opt_a">Lựa chọn 1</option>');
      expect(instruction).toContain('<option value="opt_1">Lựa chọn 2</option>');
      expect(instruction).toMatch(/ĐÃ có ô name="cf_field_g2e9" thì THAY/);

      await waitFor(() => expect(setForm).toHaveBeenCalled());
      const next = setForm.mock.calls[setForm.mock.calls.length - 1][0](form);
      expect(next.htmlContent).toContain('value="opt_a"');
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
