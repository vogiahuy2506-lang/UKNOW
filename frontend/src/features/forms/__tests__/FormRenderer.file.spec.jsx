import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { I18nProvider } from '../../../i18n';
import FormRenderer from '../components/FormRenderer';

/**
 * PR-4b (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, QĐ7): ô "Tải tệp" của biểu mẫu công khai. Renderer không tự gọi API —
 * nhận `onUploadFile` và kiểm: `accept` theo nhóm chủ cho phép, kiểm loại/cỡ/số tệp phía client TRƯỚC khi xin URL, thanh tiến độ,
 * xoá tệp (huỷ yêu cầu), trường bắt buộc chặn gửi, chủ hết dung lượng (dấu skip) vẫn gửi được, cờ tắt thay ô bằng câu báo.
 * Biểu mẫu LUÔN nền sáng nên không có `dark:`.
 */

const MB = 1024 * 1024;

const FILE_FIELD = {
  key: 'f_cv',
  label: 'Hồ sơ',
  type: 'file',
  required: true,
  options: [],
  fileConfig: { kinds: ['image', 'pdf'], maxBytes: 2 * MB, maxFiles: 2 },
};
const NAME_FIELD = { key: 'f_name', label: 'Họ tên', type: 'short_text', required: false, options: [] };

const make = (fields, extra = {}) => ({
  title: 'Biểu mẫu có tệp',
  description: '',
  fields,
  settings: { consentEnabled: false, submitButtonText: 'Gửi thông tin', successMessage: 'Cảm ơn bạn!', redirectUrl: '' },
  ...extra,
});

function renderForm(form, props = {}) {
  const onSubmit = props.onSubmit || vi.fn().mockResolvedValue({});
  const utils = render(
    <I18nProvider>
      <FormRenderer form={form} onSubmit={onSubmit} {...props} />
    </I18nProvider>
  );
  return { ...utils, onSubmit };
}

const fileInput = () => document.getElementById('field_f_cv');
const makeFile = (name, type, size = 100) => {
  const file = new File(['x'.repeat(Math.min(size, 10))], name, { type });
  if (size > 10) Object.defineProperty(file, 'size', { value: size });
  return file;
};
const choose = (...files) => fireEvent.change(fileInput(), { target: { files } });
const submitForm = () => fireEvent.click(screen.getByRole('button', { name: 'Gửi thông tin' }));

/** onUploadFile trả về lời hứa do test điều khiển. */
function controlledUpload() {
  const calls = [];
  const fn = vi.fn((field, file, options) => new Promise((resolve, reject) => {
    calls.push({ field, file, options, resolve, reject });
  }));
  return { fn, calls };
}

describe('FormRenderer — ô Tải tệp', () => {
  it('vẽ ô chọn tệp: accept theo nhóm, gợi ý loại + dung lượng + số tệp, dấu * khi bắt buộc; nhiều tệp thì multiple', () => {
    renderForm(make([FILE_FIELD]), { onUploadFile: vi.fn() });
    const input = fileInput();
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveAttribute('accept', '.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.pdf');
    expect(input).toHaveAttribute('multiple');
    expect(screen.getByText(/Nhận: jpg, jpeg, png, webp, gif, heic, heif, pdf · tối đa 2 MB mỗi tệp · tối đa 2 tệp/)).toBeInTheDocument();
    expect(screen.getByText('*')).toBeInTheDocument();

    const single = { ...FILE_FIELD, key: 'f_one', fileConfig: { kinds: ['word'], maxBytes: 5 * MB, maxFiles: 1 } };
    renderForm(make([single]), { onUploadFile: vi.fn() });
    const oneInput = document.getElementById('field_f_one');
    expect(oneInput).not.toHaveAttribute('multiple');
    expect(oneInput).toHaveAttribute('accept', '.doc,.docx');
  });

  it('KHÔNG có lớp dark: (biểu mẫu luôn nền sáng)', () => {
    const { container } = renderForm(make([FILE_FIELD]), { onUploadFile: vi.fn() });
    expect(container.innerHTML).not.toMatch(/dark:/);
  });

  it('kiểm phía client TRƯỚC khi xin URL: sai loại / đuôi cấm / quá cỡ → báo lỗi, KHÔNG gọi onUploadFile', () => {
    const { fn } = controlledUpload();
    renderForm(make([FILE_FIELD]), { onUploadFile: fn });

    choose(makeFile('bang.docx', 'application/msword'));
    expect(screen.getByText(/Tệp "bang.docx" không đúng loại\. Chỉ nhận: jpg, jpeg, png, webp, gif, heic, heif, pdf\./)).toBeInTheDocument();

    choose(makeFile('virus.exe', 'application/x-msdownload'));
    expect(screen.getByText('Loại tệp "virus.exe" không được phép tải lên.')).toBeInTheDocument();

    choose(makeFile('anh-lon.png', 'image/png', 3 * MB));
    expect(screen.getByText('Tệp "anh-lon.png" quá lớn. Tối đa 2 MB mỗi tệp.')).toBeInTheDocument();

    choose(makeFile('rong.png', 'image/png', 0));
    expect(screen.getByText('Tệp "rong.png" trống.')).toBeInTheDocument();

    expect(fn).not.toHaveBeenCalled();
  });

  it('tải thành công: thanh tiến độ cập nhật, xong hiện "Đã tải lên"; gửi biểu mẫu kèm danh sách uploadId', async () => {
    const { fn, calls } = controlledUpload();
    const { onSubmit } = renderForm(make([NAME_FIELD, FILE_FIELD]), { onUploadFile: fn });

    choose(makeFile('cccd.png', 'image/png', 1234));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0]).toMatchObject({ key: 'f_cv' });
    expect(fn.mock.calls[0][1].name).toBe('cccd.png');

    act(() => calls[0].options.onProgress(40));
    const bar = screen.getByRole('progressbar', { name: 'Đang tải lên cccd.png' });
    expect(bar).toHaveAttribute('aria-valuenow', '40');
    expect(screen.getByText('Đang tải lên… 40%')).toBeInTheDocument();

    await act(async () => calls[0].resolve({ uploadId: 'up-111' }));
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Đã tải lên')).toBeInTheDocument();

    submitForm();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.answers.f_cv).toEqual(['up-111']);
    expect(payload).not.toHaveProperty('fileSkip');
  });

  it('nhiều tệp: tối đa maxFiles; tệp thứ ba bị từ chối bằng câu báo, không xin URL', async () => {
    const { fn, calls } = controlledUpload();
    const { onSubmit } = renderForm(make([FILE_FIELD]), { onUploadFile: fn });
    choose(makeFile('a.png', 'image/png'), makeFile('b.pdf', 'application/pdf'));
    expect(fn).toHaveBeenCalledTimes(2);
    await act(async () => {
      calls[0].resolve({ uploadId: 'up-a' });
      calls[1].resolve({ uploadId: 'up-b' });
    });

    // Ô chọn tệp bị khoá khi đã đủ số tệp.
    expect(fileInput()).toBeDisabled();
    choose(makeFile('c.png', 'image/png'));
    expect(fn).toHaveBeenCalledTimes(2);

    submitForm();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].answers.f_cv).toEqual(['up-a', 'up-b']);
  });

  it('chọn quá số tệp trong một lượt: nhận đủ maxFiles, phần dư báo "tối đa 2 tệp"', () => {
    const { fn } = controlledUpload();
    renderForm(make([FILE_FIELD]), { onUploadFile: fn });
    choose(makeFile('a.png', 'image/png'), makeFile('b.png', 'image/png'), makeFile('c.png', 'image/png'));
    expect(fn).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Chỉ được đính kèm tối đa 2 tệp.')).toBeInTheDocument();
  });

  it('trường bắt buộc chưa có tệp → chặn gửi, onSubmit không được gọi', async () => {
    const { onSubmit } = renderForm(make([FILE_FIELD]), { onUploadFile: vi.fn() });
    submitForm();
    expect(await screen.findByText('Vui lòng điền trường "Hồ sơ"')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('trường KHÔNG bắt buộc để trống → gửi được, answers không có khoá tệp', async () => {
    const { onSubmit } = renderForm(make([{ ...FILE_FIELD, required: false }]), { onUploadFile: vi.fn() });
    submitForm();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].answers).toEqual({});
  });

  it('đang tải dở thì chặn gửi với câu "vui lòng đợi"; xong thì gửi được', async () => {
    const { fn, calls } = controlledUpload();
    const { onSubmit } = renderForm(make([FILE_FIELD]), { onUploadFile: fn });
    choose(makeFile('a.png', 'image/png'));
    submitForm();
    expect(await screen.findByText('Tệp đang được tải lên, vui lòng đợi hoàn tất.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await act(async () => calls[0].resolve({ uploadId: 'up-1' }));
    submitForm();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it('xoá tệp đang tải: huỷ yêu cầu (signal.aborted), tệp biến mất, trường bắt buộc lại chặn gửi', async () => {
    const { fn, calls } = controlledUpload();
    const { onSubmit } = renderForm(make([FILE_FIELD]), { onUploadFile: fn });
    choose(makeFile('a.png', 'image/png'));
    expect(calls[0].options.signal.aborted).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ tệp a.png' }));
    expect(calls[0].options.signal.aborted).toBe(true);
    expect(screen.queryByText('a.png')).not.toBeInTheDocument();
    // Yêu cầu bị huỷ trả lỗi: không được hiện lại tệp lỗi.
    await act(async () => calls[0].reject(Object.assign(new Error('canceled'), { code: 'ERR_CANCELED' })));
    expect(screen.queryByText('a.png')).not.toBeInTheDocument();

    submitForm();
    expect(await screen.findByText('Vui lòng điền trường "Hồ sơ"')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('xoá tệp đã tải xong: không còn trong danh sách uploadId gửi đi', async () => {
    const { fn, calls } = controlledUpload();
    const { onSubmit } = renderForm(make([{ ...FILE_FIELD, required: false }]), { onUploadFile: fn });
    choose(makeFile('a.png', 'image/png'), makeFile('b.png', 'image/png'));
    await act(async () => {
      calls[0].resolve({ uploadId: 'up-a' });
      calls[1].resolve({ uploadId: 'up-b' });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ tệp a.png' }));
    submitForm();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].answers.f_cv).toEqual(['up-b']);
  });

  it('lỗi từ server hiện đúng câu theo mã; lỗi chung hiện câu chung; tệp lỗi không chặn gửi trường không bắt buộc và không được gửi đi', async () => {
    const { fn, calls } = controlledUpload();
    const { onSubmit } = renderForm(make([{ ...FILE_FIELD, required: false }]), { onUploadFile: fn });
    choose(makeFile('a.png', 'image/png'), makeFile('b.png', 'image/png'));
    await act(async () => {
      calls[0].reject({ response: { status: 400, data: { code: 'FILE_TYPE_NOT_ALLOWED' } } });
      calls[1].reject(new Error('Network Error'));
    });
    expect(screen.getByText('Loại tệp này không được nhận ở ô này.')).toBeInTheDocument();
    expect(screen.getByText('Không tải được tệp. Vui lòng thử lại.')).toBeInTheDocument();

    submitForm();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].answers).toEqual({});
  });

  it('lỗi 429 hiện câu "tải quá nhiều lần"', async () => {
    const { fn, calls } = controlledUpload();
    renderForm(make([FILE_FIELD]), { onUploadFile: fn });
    choose(makeFile('a.png', 'image/png'));
    await act(async () => calls[0].reject({ response: { status: 429, data: {} } }));
    expect(screen.getByText('Bạn đã tải tệp quá nhiều lần, vui lòng thử lại sau ít phút.')).toBeInTheDocument();
  });

  it('CHỦ HẾT DUNG LƯỢNG: server trả quotaExceeded → câu báo nhẹ, tệp không vào danh sách; trường BẮT BUỘC vẫn gửi được, payload mang fileSkip', async () => {
    const { fn, calls } = controlledUpload();
    const { onSubmit } = renderForm(make([NAME_FIELD, FILE_FIELD]), { onUploadFile: fn });
    choose(makeFile('a.png', 'image/png'));
    await act(async () => calls[0].resolve({ quotaExceeded: true, skipToken: 'token-do-server' }));

    expect(screen.getByTestId('file-quota-note-f_cv')).toHaveTextContent('Hiện chưa gửi được tệp đính kèm. Bạn vẫn có thể gửi biểu mẫu');
    expect(screen.queryByText('a.png')).not.toBeInTheDocument();
    // Không lộ chi tiết tài khoản của chủ.
    expect(screen.getByTestId('file-quota-note-f_cv').textContent).not.toMatch(/dung lượng|hết|quota|chủ/i);

    submitForm();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.answers).not.toHaveProperty('f_cv');
    expect(payload.fileSkip).toEqual({ f_cv: 'token-do-server' });
  });

  it('cờ backend TẮT (form.fileUploads.enabled=false): thay ô chọn tệp bằng câu "tạm chưa nhận tệp", không dấu *, trường bắt buộc không chặn gửi, payload không có tệp', async () => {
    const { onSubmit } = renderForm(make([NAME_FIELD, FILE_FIELD], { fileUploads: { enabled: false } }), { onUploadFile: vi.fn() });
    expect(fileInput()).toBeNull();
    expect(screen.getByTestId('file-unavailable-f_cv')).toHaveTextContent('Hiện tạm chưa nhận tệp đính kèm');
    expect(screen.queryByText('*')).not.toBeInTheDocument();

    submitForm();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.answers).not.toHaveProperty('f_cv');
    expect(payload).not.toHaveProperty('fileSkip');
  });

  it('xem trước (previewMode) và thiếu onUploadFile: ô chọn tệp bị khoá, không tải gì', () => {
    const { fn } = controlledUpload();
    renderForm(make([FILE_FIELD]), { previewMode: true, onUploadFile: fn });
    expect(fileInput()).toBeDisabled();
    expect(fn).not.toHaveBeenCalled();
  });

  it('thiếu onUploadFile (renderer dùng ngoài trang công khai) cũng khoá ô', () => {
    renderForm(make([FILE_FIELD]));
    expect(fileInput()).toBeDisabled();
  });

  it('nhiều bước: ô tệp nằm ở bước 2; gửi khi chưa có tệp bị chặn, có tệp rồi thì gửi được', async () => {
    const { fn, calls } = controlledUpload();
    const brk = { key: 'b1', type: 'page_break', label: 'Bước 2', required: false, options: [] };
    const { onSubmit } = renderForm(make([NAME_FIELD, brk, FILE_FIELD]), { onUploadFile: fn });

    expect(fileInput()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp' }));
    expect(fileInput()).not.toBeNull();

    submitForm();
    expect(await screen.findByText('Vui lòng điền trường "Hồ sơ"')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    choose(makeFile('a.png', 'image/png'));
    await act(async () => calls[0].resolve({ uploadId: 'up-z' }));
    expect(within(screen.getByTestId('file-field-f_cv')).getByText('a.png')).toBeInTheDocument();
    submitForm();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].answers.f_cv).toEqual(['up-z']);
  });
});
