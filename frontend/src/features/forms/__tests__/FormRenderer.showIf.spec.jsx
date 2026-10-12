import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { I18nProvider } from '../../../i18n';
import FormRenderer from '../components/FormRenderer';

/**
 * PR-8a (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11): hiện / ẩn ô theo câu trả lời (`field.showIf`) ở biểu mẫu khách điền.
 * Ẩn / hiện tức thì; ô ẩn không bắt buộc, giá trị đã nhập bị xoá khỏi state và KHÔNG có trong payload; nhiều bước bỏ trang không
 * còn ô nào hiện; xem trước mở khoá đúng các ô là nguồn điều kiện. Biểu mẫu luôn sáng — không có `dark:`.
 */

const SETTINGS = { consentEnabled: false, submitButtonText: 'Gửi thông tin', successMessage: 'Cảm ơn bạn!', redirectUrl: '' };

const make = (fields, extra = {}) => ({ title: 'Biểu mẫu thử', description: '', fields, settings: SETTINGS, ...extra });

const renderForm = (form, props = {}) => {
  const onSubmit = props.onSubmit || vi.fn().mockResolvedValue({});
  const utils = render(
    <I18nProvider>
      <FormRenderer form={form} onSubmit={onSubmit} {...props} />
    </I18nProvider>
  );
  return { ...utils, onSubmit };
};

const f = (key, label, type = 'short_text', extra = {}) => ({ key, label, type, required: false, options: [], ...extra });
const brk = (key, label = '') => ({ key, type: 'page_break', label, required: false, options: [] });
const cond = (fieldKey, operator, value) => ({ fieldKey, operator, ...(value !== undefined ? { value } : {}) });
const showIf = (conditions, match = 'all') => ({ match, conditions });

const input = (key) => document.getElementById(`field_${key}`);
const answerYes = () => fireEvent.click(screen.getByLabelText('Có'));
const answerNo = () => fireEvent.click(screen.getByLabelText('Không'));
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Gửi thông tin' }));

// Có xe? → (có) Biển số xe; (không) Lý do không dùng xe.
const CAR_FORM = make([
  f('f_car', 'Bạn có xe không?', 'yes_no'),
  f('f_plate', 'Biển số xe', 'short_text', { required: true, showIf: showIf([cond('f_car', 'equals', 'yes')]) }),
  f('f_why', 'Lý do không dùng xe', 'short_text', { showIf: showIf([cond('f_car', 'equals', 'no')]) }),
]);

describe('FormRenderer — hiện / ẩn ô theo câu trả lời', () => {
  it('ẩn / hiện tức thì theo câu trả lời của ô nguồn; chưa trả lời thì ô equals ẩn', () => {
    renderForm(CAR_FORM);
    expect(screen.queryByText('Biển số xe')).not.toBeInTheDocument();
    expect(screen.queryByText('Lý do không dùng xe')).not.toBeInTheDocument();

    answerYes();
    expect(screen.getByText('Biển số xe')).toBeInTheDocument();
    expect(input('f_plate')).toBeInTheDocument();
    expect(screen.queryByText('Lý do không dùng xe')).not.toBeInTheDocument();

    answerNo();
    expect(screen.queryByText('Biển số xe')).not.toBeInTheDocument();
    expect(screen.getByText('Lý do không dùng xe')).toBeInTheDocument();
  });

  it('ô ẩn KHÔNG bắt buộc: gửi được dù ô "Biển số xe" (bắt buộc) đang ẩn; payload không có khoá của nó', async () => {
    const { onSubmit } = renderForm(CAR_FORM);
    answerNo();
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.answers).toEqual({ f_car: 'no' });
    expect(payload.answers).not.toHaveProperty('f_plate');
  });

  it('ô đang HIỆN vẫn bắt buộc như cũ: báo lỗi, không gửi', async () => {
    const { onSubmit } = renderForm(CAR_FORM);
    answerYes();
    submit();
    expect(await screen.findByText('Vui lòng điền trường "Biển số xe"')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(input('f_plate'), { target: { value: '51A-12345' } });
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].answers).toEqual({ f_car: 'yes', f_plate: '51A-12345' });
  });

  it('ẩn thì XOÁ giá trị đã nhập: đổi ý rồi hiện lại ô trống, và payload không mang giá trị cũ', async () => {
    const { onSubmit } = renderForm(CAR_FORM);
    answerYes();
    fireEvent.change(input('f_plate'), { target: { value: '51A-12345' } });
    expect(input('f_plate')).toHaveValue('51A-12345');

    answerNo(); // ẩn
    expect(input('f_plate')).toBeNull();
    answerYes(); // hiện lại
    expect(input('f_plate')).toHaveValue('');

    answerNo();
    fireEvent.change(input('f_why'), { target: { value: 'Đi xe buýt' } });
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].answers).toEqual({ f_car: 'no', f_why: 'Đi xe buýt' });
  });

  it('lỗi cũ của ô bị ẩn biến mất (không hiện lại khi ô hiện trở lại)', async () => {
    renderForm(CAR_FORM);
    answerYes();
    submit();
    expect(await screen.findByText('Vui lòng điền trường "Biển số xe"')).toBeInTheDocument();
    answerNo();
    answerYes();
    expect(screen.queryByText('Vui lòng điền trường "Biển số xe"')).not.toBeInTheDocument();
  });

  it('ẩn lan theo chuỗi: nguồn của điều kiện cũng ẩn thì ô phụ thuộc ẩn theo', () => {
    renderForm(
      make([
        f('f_car', 'Bạn có xe không?', 'yes_no'),
        f('f_plate', 'Biển số xe', 'short_text', { showIf: showIf([cond('f_car', 'equals', 'yes')]) }),
        f('f_note', 'Ghi chú về biển số', 'short_text', { showIf: showIf([cond('f_plate', 'answered')]) }),
      ])
    );
    answerYes();
    fireEvent.change(input('f_plate'), { target: { value: '51A' } });
    expect(screen.getByText('Ghi chú về biển số')).toBeInTheDocument();
    answerNo();
    expect(screen.queryByText('Biển số xe')).not.toBeInTheDocument();
    expect(screen.queryByText('Ghi chú về biển số')).not.toBeInTheDocument();
  });

  it('áp cho cả tiêu đề / đoạn chữ; any = một điều kiện đúng là hiện; checkbox contains', () => {
    renderForm(
      make([
        f('f_svc', 'Dịch vụ quan tâm', 'checkbox', { options: [{ label: 'Spa', value: 'Spa' }, { label: 'Gội', value: 'Gội' }, { label: 'Cắt', value: 'Cắt' }] }),
        f('h_spa', 'Phần dành cho Spa', 'heading', { showIf: showIf([cond('f_svc', 'contains', 'Spa')]) }),
        f('p_note', 'Lưu ý Spa hoặc Gội', 'paragraph', { showIf: showIf([cond('f_svc', 'contains', 'Spa'), cond('f_svc', 'contains', 'Gội')], 'any') }),
      ])
    );
    expect(screen.queryByText('Phần dành cho Spa')).not.toBeInTheDocument();
    expect(screen.queryByText('Lưu ý Spa hoặc Gội')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Gội'));
    expect(screen.queryByText('Phần dành cho Spa')).not.toBeInTheDocument();
    expect(screen.getByText('Lưu ý Spa hoặc Gội')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Spa'));
    expect(screen.getByText('Phần dành cho Spa')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Spa'));
    fireEvent.click(screen.getByLabelText('Gội'));
    expect(screen.queryByText('Lưu ý Spa hoặc Gội')).not.toBeInTheDocument();
  });

  it('select + rating + answered / not_answered đánh giá đúng', () => {
    renderForm(
      make([
        f('f_sel', 'Gói', 'select', { options: [{ label: 'Cơ bản', value: 'basic' }, { label: 'Cao cấp', value: 'pro' }] }),
        f('f_star', 'Đánh giá', 'rating'),
        f('t_pro', 'Ô riêng gói cao cấp', 'short_text', { showIf: showIf([cond('f_sel', 'equals', 'pro')]) }),
        f('t_notbasic', 'Ô khi không chọn cơ bản', 'short_text', { showIf: showIf([cond('f_sel', 'not_equals', 'basic')]) }),
        f('t_low', 'Vì sao chưa hài lòng', 'short_text', { showIf: showIf([cond('f_star', 'equals', 2)]) }),
        f('t_unrated', 'Chưa đánh giá', 'short_text', { showIf: showIf([cond('f_star', 'not_answered')]) }),
      ])
    );
    // chưa trả lời gì: not_equals và not_answered hiện
    expect(screen.getByText('Ô khi không chọn cơ bản')).toBeInTheDocument();
    expect(screen.getByText('Chưa đánh giá')).toBeInTheDocument();
    expect(screen.queryByText('Ô riêng gói cao cấp')).not.toBeInTheDocument();

    fireEvent.change(input('f_sel'), { target: { value: 'basic' } });
    expect(screen.queryByText('Ô khi không chọn cơ bản')).not.toBeInTheDocument();
    fireEvent.change(input('f_sel'), { target: { value: 'pro' } });
    expect(screen.getByText('Ô riêng gói cao cấp')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Chấm 2 sao' }));
    expect(screen.getByText('Vì sao chưa hài lòng')).toBeInTheDocument();
    expect(screen.queryByText('Chưa đánh giá')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Chấm 3 sao' }));
    expect(screen.queryByText('Vì sao chưa hài lòng')).not.toBeInTheDocument();
  });

  it('KHÔNG có lớp dark: (biểu mẫu luôn nền sáng)', () => {
    const { container } = renderForm(CAR_FORM);
    answerYes();
    expect(container.innerHTML).not.toMatch(/dark:/);
  });
});

describe('FormRenderer — nhiều bước + hiện / ẩn', () => {
  // Trang 1: Có xe? ; trang 2 chỉ có ô phụ thuộc "có"; trang 3: Ghi chú (bắt buộc).
  const THREE_PAGES = make([
    f('f_car', 'Bạn có xe không?', 'yes_no'),
    brk('b1', 'Thông tin xe'),
    f('f_plate', 'Biển số xe', 'short_text', { required: true, showIf: showIf([cond('f_car', 'equals', 'yes')]) }),
    brk('b2', 'Ghi chú'),
    f('f_note', 'Ghi chú thêm', 'short_text', { required: true }),
  ]);

  it('trang mà mọi ô đều ẩn bị BỎ QUA: đếm bước theo số trang còn lại, Tiếp nhảy thẳng sang trang có ô hiện', () => {
    renderForm(THREE_PAGES);
    answerNo();
    expect(screen.getByText('Bước 1/2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp' }));
    expect(screen.getByText('Bước 2/2')).toBeInTheDocument();
    expect(screen.getByText('Ghi chú thêm')).toBeInTheDocument();
    expect(screen.queryByText('Biển số xe')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gửi thông tin' })).toBeInTheDocument();
  });

  it('đổi câu trả lời khiến trang giữa hiện lại: có 3 bước, trang giữa bắt buộc ô Biển số xe', () => {
    renderForm(THREE_PAGES);
    answerYes();
    expect(screen.getByText('Bước 1/3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp' }));
    expect(screen.getByText('Bước 2/3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp' }));
    expect(screen.getByText('Vui lòng điền trường "Biển số xe"')).toBeInTheDocument();
    expect(screen.getByText('Bước 2/3')).toBeInTheDocument();
  });

  it('chỉ còn MỘT trang hiện → không có thanh tiến trình, không có Tiếp, nút gửi ngay trang 1', () => {
    renderForm(
      make([
        f('f_car', 'Bạn có xe không?', 'yes_no'),
        brk('b1', 'Thông tin xe'),
        f('f_plate', 'Biển số xe', 'short_text', { showIf: showIf([cond('f_car', 'equals', 'yes')]) }),
      ])
    );
    answerNo();
    expect(screen.queryByTestId('form-step-progress')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tiếp' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gửi thông tin' })).toBeInTheDocument();
    answerYes();
    expect(screen.getByTestId('form-step-progress')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tiếp' })).toBeInTheDocument();
  });

  it('validate theo trang chỉ xét ô đang hiện: ô bắt buộc bị ẩn ở trang 1 không chặn nút Tiếp', () => {
    renderForm(
      make([
        f('f_car', 'Bạn có xe không?', 'yes_no'),
        f('f_plate', 'Biển số xe', 'short_text', { required: true, showIf: showIf([cond('f_car', 'equals', 'yes')]) }),
        brk('b1', 'Bước hai'),
        f('f_note', 'Ghi chú thêm', 'short_text'),
      ])
    );
    answerNo();
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp' }));
    expect(screen.getByText('Bước 2/2')).toBeInTheDocument();
  });

  it('gửi từ trang cuối: payload gom đủ ô hiện của mọi trang, không có ô ẩn', async () => {
    const { onSubmit } = renderForm(THREE_PAGES);
    answerYes();
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp' }));
    fireEvent.change(input('f_plate'), { target: { value: '51A-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp' }));
    fireEvent.change(input('f_note'), { target: { value: 'ok' } });
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].answers).toEqual({ f_car: 'yes', f_plate: '51A-1', f_note: 'ok' });
  });
});

describe('FormRenderer — ô tải tệp bị ẩn', () => {
  const FILE_FORM = make(
    [
      f('f_car', 'Bạn có xe không?', 'yes_no'),
      f('f_doc', 'Giấy tờ xe', 'file', {
        required: true,
        fileConfig: { kinds: ['image', 'pdf'], maxBytes: 2 * 1024 * 1024, maxFiles: 1 },
        showIf: showIf([cond('f_car', 'equals', 'yes')]),
      }),
    ],
    { fileUploads: { enabled: true } }
  );

  it('ẩn thì không đòi tệp dù bắt buộc, payload không có khoá tệp / fileSkip', async () => {
    const { onSubmit } = renderForm(FILE_FORM, { onUploadFile: vi.fn() });
    expect(screen.queryByText('Giấy tờ xe')).not.toBeInTheDocument();
    answerNo();
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.answers).toEqual({ f_car: 'no' });
    expect(payload).not.toHaveProperty('fileSkip');
  });

  it('tệp đã tải rồi mới ẩn ô: tệp bị bỏ, không gửi uploadId của ô ẩn', async () => {
    const onUploadFile = vi.fn().mockResolvedValue({ uploadId: '123e4567-e89b-42d3-a456-426614174000' });
    const { onSubmit } = renderForm(FILE_FORM, { onUploadFile });
    answerYes();
    const file = new File(['x'], 'giay-to.pdf', { type: 'application/pdf' });
    fireEvent.change(input('f_doc'), { target: { files: [file] } });
    await waitFor(() => expect(onUploadFile).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(/giay-to\.pdf/)).toBeInTheDocument());

    answerNo();
    expect(screen.queryByText(/giay-to\.pdf/)).not.toBeInTheDocument();
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].answers).toEqual({ f_car: 'no' });
  });

  it('ô tệp HIỆN và bắt buộc: chưa chọn tệp thì không gửi được', async () => {
    const { onSubmit } = renderForm(FILE_FORM, { onUploadFile: vi.fn() });
    answerYes();
    submit();
    expect(await screen.findByText('Vui lòng điền trường "Giấy tờ xe"')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('FormRenderer — xem trước (previewMode) với điều kiện', () => {
  it('chỉ ô là NGUỒN của điều kiện được mở khoá để bấm thử; ô khác vẫn khoá; ô phụ thuộc hiện / ẩn theo', () => {
    renderForm(
      make([
        f('f_car', 'Bạn có xe không?', 'yes_no'),
        f('f_name', 'Họ và tên', 'short_text'),
        f('f_plate', 'Biển số xe', 'short_text', { showIf: showIf([cond('f_car', 'equals', 'yes')]) }),
      ]),
      { previewMode: true }
    );
    expect(input('f_name')).toBeDisabled();
    expect(screen.getByLabelText('Có')).not.toBeDisabled();
    expect(screen.getByLabelText('Không')).not.toBeDisabled();
    expect(screen.queryByText('Biển số xe')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Có'));
    expect(screen.getByText('Biển số xe')).toBeInTheDocument();
    expect(input('f_plate')).toBeDisabled(); // ô phụ thuộc không phải nguồn → vẫn khoá
    expect(input('f_name')).toBeDisabled();
  });

  it('biểu mẫu KHÔNG có điều kiện: xem trước khoá mọi ô như cũ', () => {
    renderForm(make([f('f_car', 'Bạn có xe không?', 'yes_no'), f('f_name', 'Họ và tên')]), { previewMode: true });
    expect(screen.getByLabelText('Có')).toBeDisabled();
    expect(input('f_name')).toBeDisabled();
  });

  it('xem trước không bao giờ gọi onSubmit', () => {
    const { onSubmit } = renderForm(CAR_FORM, { previewMode: true });
    fireEvent.click(screen.getByLabelText('Có'));
    fireEvent.submit(within(document.body).getByRole('button', { name: 'Gửi thông tin' }).closest('form'));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
