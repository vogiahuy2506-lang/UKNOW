import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import LeadFormConfigPanel from '../LeadFormConfigPanel.jsx';
import { defaultLeadFormConfig } from '../../../landing-pages/utils/landingLeadFormConfig.js';
import viDict from '../../../../i18n/vi.js';
import { LANDING_COPY } from '../../../landing/constants/landingCopy.js';
import {
  editLandingHtmlWithAi,
  fetchLandingPagesAdminList,
} from '../../../landing-pages/services/landingPagesAdminApi.service.js';
import { fetchForms } from '../../../forms/services/formAdminApi.service.js';

vi.mock('../../../landing-pages/services/landingPagesAdminApi.service.js', () => ({
  editLandingHtmlWithAi: vi.fn(),
  fetchLandingPagesAdminList: vi.fn(),
}));

vi.mock('../../../forms/services/formAdminApi.service.js', () => ({
  fetchForms: vi.fn(),
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
   * PR-F (PLAN_TEN_MIEN_RIENG_VA_BIEU_MAU_LIEN_KET_LANDING_2026-10-03.md): "Dùng biểu mẫu đã tạo" lưu được thật.
   * Panel CHỈ ghi `form.linkedFormChoice` (lựa chọn chờ bấm Lưu trang); không bao giờ đổi `linkedFormId` / `htmlContent`
   * (đó là việc của editor sau khi backend lưu).
   */
  describe('chọn Form cơ bản / Dùng biểu mẫu đã tạo', () => {
    const BASIC_MARK = 'Các trường mặc định';
    const FORMS = [
      { id: 3, title: 'Đăng ký khoá IELTS', publicKey: 'KEY3', isPublished: true, landingPageId: null, fields: [{}, {}] },
      { id: 4, title: 'Biểu mẫu nháp', publicKey: 'KEY4', isPublished: false, landingPageId: null, fields: [] },
      { id: 5, title: 'Form trang Beta', publicKey: 'KEY5', isPublished: true, landingPageId: 200, fields: [] },
      { id: 6, title: 'Form bị khoá', publicKey: 'KEY6', isPublished: true, landingPageId: null, adminDisabledAt: '2026-10-01T00:00:00Z', fields: [] },
      { id: 7, title: 'Form cơ bản tự sinh', publicKey: 'KEY7', isPublished: true, landingPageId: 100, fields: [] },
      { id: 9, title: 'Biểu mẫu đang dùng', publicKey: 'KEY9', isPublished: true, landingPageId: 100, fields: [] },
    ];

    let latestForm;
    function Harness({ initial, editingId = 100 }) {
      const [form, setForm] = useState(initial);
      latestForm = form;
      return <LeadFormConfigPanel form={form} setForm={setForm} t={t} editingId={editingId} />;
    }
    const renderPanel = (overrides = {}, editingId = 100) => {
      const initial = makeForm(overrides);
      latestForm = initial;
      return { initial, ...render(<Harness initial={initial} editingId={editingId} />) };
    };

    beforeEach(() => {
      fetchForms.mockReset();
      fetchLandingPagesAdminList.mockReset();
      fetchForms.mockResolvedValue(FORMS);
      fetchLandingPagesAdminList.mockResolvedValue([
        { id: 100, title: 'Trang Alpha' },
        { id: 200, title: 'Trang Beta' },
      ]);
    });

    const radioBasic = () => screen.getByRole('radio', { name: 'Form cơ bản' });
    const radioLinked = () => screen.getByRole('radio', { name: 'Dùng biểu mẫu đã tạo' });

    it('trang chưa gắn biểu mẫu → mở ở "Form cơ bản": có cấu hình Form cơ bản, KHÔNG có bộ chọn, KHÔNG gọi API biểu mẫu', () => {
      const { container } = renderPanel();

      expect(radioBasic()).toBeChecked();
      expect(radioLinked()).not.toBeChecked();
      expect(radioLinked()).toBeEnabled();
      expect(screen.getByText(BASIC_MARK)).toBeInTheDocument();
      expect(screen.queryByTestId('linked-form-picker')).not.toBeInTheDocument();
      expect(screen.queryByTestId('linked-form-readonly')).not.toBeInTheDocument();
      expect(fetchForms).not.toHaveBeenCalled();
      expect(container.textContent).not.toContain('leadFormConfig.');
    });

    it('trang CHƯA lưu lần nào (không có editingId) → "Dùng biểu mẫu đã tạo" bị khoá + nhắc lưu trang trước; bấm vào không đổi gì', () => {
      renderPanel({}, null);

      expect(radioLinked()).toBeDisabled();
      expect(screen.getByText('Lưu trang trước, rồi mới chọn được biểu mẫu.')).toBeInTheDocument();
      fireEvent.click(radioLinked());
      expect(radioBasic()).toBeChecked();
      expect(screen.queryByTestId('linked-form-picker')).not.toBeInTheDocument();
      expect(fetchForms).not.toHaveBeenCalled();
      expect(latestForm.linkedFormChoice ?? null).toBeNull();
    });

    it('form TỰ SINH (linkedFormSource=basic) vẫn là "Form cơ bản": thẻ biểu mẫu chỉ-đọc + cấu hình Form cơ bản, không tải danh sách', () => {
      renderPanel({ linkedFormId: 7, linkedFormTitle: 'Form cơ bản tự sinh', linkedFormSource: 'basic' });

      expect(radioBasic()).toBeChecked();
      const card = screen.getByTestId('linked-form-readonly');
      expect(card).toHaveTextContent('Form cơ bản tự sinh');
      expect(screen.getByRole('link', { name: /Mở sửa biểu mẫu/ })).toHaveAttribute('href', '/app/forms/7/edit');
      expect(screen.getByText(BASIC_MARK)).toBeInTheDocument();
      expect(fetchForms).not.toHaveBeenCalled();
    });

    it('biểu mẫu KHÁCH CHỌN (linkedFormSource=chosen) → mở ở "Dùng biểu mẫu đã tạo", chọn sẵn đúng biểu mẫu, ẩn cấu hình Form cơ bản', async () => {
      renderPanel({ linkedFormId: 9, linkedFormTitle: 'Biểu mẫu đang dùng', linkedFormSource: 'chosen' });

      expect(radioLinked()).toBeChecked();
      expect(screen.queryByText(BASIC_MARK)).not.toBeInTheDocument();
      expect(screen.getByTestId('linked-form-readonly')).toHaveTextContent('Biểu mẫu đang dùng');
      await waitFor(() => expect(fetchForms).toHaveBeenCalledTimes(1));
      const select = await screen.findByRole('combobox');
      await waitFor(() => expect(select).toHaveValue('9'));
    });

    it('chọn "Dùng biểu mẫu đã tạo" → danh sách: loại form tự sinh của trang này; form đang gắn trang KHÁC / bị khoá bị làm mờ kèm lý do; có link Tạo biểu mẫu mới', async () => {
      renderPanel({ linkedFormId: 7, linkedFormSource: 'basic' });

      fireEvent.click(radioLinked());
      const select = await screen.findByRole('combobox');
      await waitFor(() => expect(within(select).getByRole('option', { name: /Đăng ký khoá IELTS/ })).toBeInTheDocument());

      // form tự sinh (id 7) của chính trang này không có trong danh sách chọn
      expect(within(select).queryByRole('option', { name: /Form cơ bản tự sinh/ })).not.toBeInTheDocument();
      // form đang dùng ở trang khác: mờ + tên trang
      const taken = within(select).getByRole('option', { name: /Form trang Beta/ });
      expect(taken).toBeDisabled();
      expect(taken).toHaveTextContent('đang dùng ở trang Trang Beta');
      // form bị quản trị khoá: mờ
      expect(within(select).getByRole('option', { name: /Form bị khoá/ })).toBeDisabled();
      // form nháp: chọn được, ghi chú sẽ được xuất bản
      const draft = within(select).getByRole('option', { name: /Biểu mẫu nháp/ });
      expect(draft).toBeEnabled();
      expect(draft).toHaveTextContent('bản nháp');
      // form của chính trang (đã chọn trước đó) và form tự do chọn được
      expect(within(select).getByRole('option', { name: 'Biểu mẫu đang dùng' })).toBeEnabled();
      expect(within(select).getByRole('option', { name: 'Đăng ký khoá IELTS' })).toBeEnabled();

      const createLink = screen.getByRole('link', { name: /Tạo biểu mẫu mới/ });
      expect(createLink).toHaveAttribute('href', '/app/forms/new');
      expect(createLink).toHaveAttribute('target', '_blank');
    });

    it('chọn một biểu mẫu → CHỈ ghi linkedFormChoice (formId/publicKey/title); linkedFormId, htmlContent giữ nguyên; hiện câu "sẽ dùng khi Lưu"', async () => {
      const { initial } = renderPanel({ linkedFormId: 7, linkedFormSource: 'basic', htmlContent: '<p>trang</p>' });

      fireEvent.click(radioLinked());
      const select = await screen.findByRole('combobox');
      await waitFor(() => expect(within(select).getByRole('option', { name: 'Đăng ký khoá IELTS' })).toBeInTheDocument());
      fireEvent.change(select, { target: { value: '3' } });

      expect(latestForm.linkedFormChoice).toEqual({ mode: 'linked', formId: 3, publicKey: 'KEY3', title: 'Đăng ký khoá IELTS' });
      expect(latestForm.linkedFormId).toBe(initial.linkedFormId);
      expect(latestForm.htmlContent).toBe('<p>trang</p>');
      expect(screen.getByTestId('linked-form-pending')).toHaveTextContent('Sẽ dùng biểu mẫu "Đăng ký khoá IELTS" khi bạn bấm Lưu trang.');
      // có thay đổi chờ lưu thì không còn thẻ "đang liên kết" cũ gây hiểu nhầm
      expect(screen.queryByTestId('linked-form-readonly')).not.toBeInTheDocument();
      // cấu hình Form cơ bản vẫn còn nguyên trong form (chỉ ẩn phần hiển thị)
      expect(latestForm.leadFormConfig).toEqual(initial.leadFormConfig);
    });

    it('đang dùng biểu mẫu khách chọn → bấm "Form cơ bản" ghi {mode:basic}; bấm lại "Dùng biểu mẫu đã tạo" (cùng biểu mẫu) thì bỏ lựa chọn chờ lưu', async () => {
      renderPanel({ linkedFormId: 9, linkedFormSource: 'chosen' });
      await screen.findByRole('combobox');

      fireEvent.click(radioBasic());
      expect(latestForm.linkedFormChoice).toEqual({ mode: 'basic' });
      expect(screen.getByTestId('linked-form-pending')).toHaveTextContent('Sẽ quay về Form cơ bản khi bạn bấm Lưu trang.');
      expect(screen.getByText(BASIC_MARK)).toBeInTheDocument();

      fireEvent.click(radioLinked());
      expect(latestForm.linkedFormChoice).toBeNull();
      expect(radioLinked()).toBeChecked();
    });

    it('chọn lại ĐÚNG biểu mẫu đang gắn → không có thay đổi chờ lưu', async () => {
      renderPanel({ linkedFormId: 9, linkedFormSource: 'chosen' });
      const select = await screen.findByRole('combobox');
      await waitFor(() => expect(within(select).getByRole('option', { name: 'Đăng ký khoá IELTS' })).toBeInTheDocument());

      fireEvent.change(select, { target: { value: '3' } });
      expect(latestForm.linkedFormChoice).toMatchObject({ mode: 'linked', formId: 3 });
      fireEvent.change(select, { target: { value: '9' } });
      expect(latestForm.linkedFormChoice).toBeNull();
    });

    it('trang đang Form cơ bản: bấm "Dùng biểu mẫu đã tạo" mà CHƯA chọn biểu mẫu → chưa đổi gì; bấm lại "Form cơ bản" cũng không có gì chờ lưu', async () => {
      renderPanel();

      fireEvent.click(radioLinked());
      await screen.findByRole('combobox');
      expect(latestForm.linkedFormChoice ?? null).toBeNull();
      expect(screen.getByText('Chọn một biểu mẫu rồi bấm Lưu trang để áp dụng.')).toBeInTheDocument();

      fireEvent.click(radioBasic());
      expect(latestForm.linkedFormChoice ?? null).toBeNull();
      expect(screen.getByText(BASIC_MARK)).toBeInTheDocument();
    });

    it('chữ ghi chú nói rõ bài nộp nằm ở mục Biểu mẫu (không ở Khách hàng từ Landing page) và không dùng cụm quảng cáo cấm', async () => {
      const { container } = renderPanel();
      fireEvent.click(radioLinked());
      await screen.findByRole('combobox');

      expect(container.textContent).toContain('Bài nộp');
      expect(container.textContent).toContain('Khách hàng từ Landing page');
      expect(container.textContent).toContain('Dữ liệu Biểu mẫu');
      expect(container.textContent).not.toMatch(/nhất|hàng đầu|tuyệt đối/i);
    });

    it('không tải được danh sách biểu mẫu → báo lỗi, vẫn bấm Làm mới thử lại được', async () => {
      fetchForms.mockRejectedValueOnce(new Error('boom'));
      renderPanel();
      fireEvent.click(radioLinked());

      expect(await screen.findByText(/Không tải được danh sách biểu mẫu/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Làm mới/ }));
      await waitFor(() => expect(fetchForms).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.queryByText(/Không tải được danh sách biểu mẫu/)).not.toBeInTheDocument());
    });
  });

  it('bấm/gõ mọi thứ trong phần Form cơ bản KHÔNG làm đổi linkedFormId / linkedFormChoice / htmlContent', () => {
    const setForm = vi.fn();
    const initial = makeForm({ linkedFormId: 42, linkedFormSource: 'basic' });
    render(<LeadFormConfigPanel form={initial} setForm={setForm} t={t} editingId={null} />);

    for (const el of screen.queryAllByRole('button')) fireEvent.click(el);
    for (const el of screen.queryAllByRole('checkbox')) fireEvent.click(el);

    expect(setForm).toHaveBeenCalled(); // có tương tác thật (bật Nghề nghiệp, Thêm câu hỏi...)
    for (const [update] of setForm.mock.calls) {
      const next = typeof update === 'function' ? update(initial) : { ...initial, ...update };
      expect(next.linkedFormId).toBe(42);
      expect(next.linkedFormChoice ?? null).toBeNull();
      expect(next.htmlContent).toBe(initial.htmlContent);
    }
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
