import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { I18nProvider } from '../../../i18n';
import FormRenderer from '../components/FormRenderer';
import { splitFormPages } from '../utils/formFieldTypes.util';

/**
 * PR-4 (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11): loại trường mới (rating, yes_no, time), khối hiển thị
 * (heading, paragraph, page_break), độ rộng half/full và biểu mẫu NHIỀU BƯỚC. Hành vi biểu mẫu cũ (không page_break)
 * do FormRenderer.spec.jsx giữ.
 */

const SETTINGS = {
  consentEnabled: false,
  submitButtonText: 'Gửi thông tin',
  successMessage: 'Cảm ơn bạn!',
  redirectUrl: '',
};

const make = (fields, extra = {}) => ({
  title: 'Biểu mẫu thử',
  description: '',
  fields,
  settings: SETTINGS,
  ...extra,
});

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

// Hai bước: trang 1 có tên (bắt buộc) + tiêu đề phần; trang 2 có ghi chú (bắt buộc).
const TWO_STEP = make([
  f('h1', 'Thông tin cơ bản', 'heading'),
  f('name', 'Họ và tên', 'short_text', { required: true }),
  brk('b1', 'Nhu cầu của bạn'),
  f('note', 'Ghi chú thêm', 'short_text', { required: true }),
]);

describe('splitFormPages — chia trang theo page_break', () => {
  it('không có page_break → đúng 1 trang chứa mọi trường, không tiêu đề (hành vi cũ)', () => {
    const pages = splitFormPages([f('a', 'A'), f('b', 'B')]);
    expect(pages).toHaveLength(1);
    expect(pages[0].fields.map((x) => x.key)).toEqual(['a', 'b']);
    expect(pages[0].title).toBe('');
  });

  it('tiêu đề trang = nhãn page_break MỞ ĐẦU trang đó; trang đầu không có tiêu đề', () => {
    const pages = splitFormPages([f('a', 'A'), brk('x', 'Bước hai'), f('b', 'B'), brk('y', 'Bước ba'), f('c', 'C')]);
    expect(pages.map((p) => p.title)).toEqual(['', 'Bước hai', 'Bước ba']);
    expect(pages.map((p) => p.fields.map((x) => x.key))).toEqual([['a'], ['b'], ['c']]);
  });

  it('page_break đứng đầu / cuối / liền nhau KHÔNG tạo trang rỗng; liền nhau thì lấy nhãn có chữ gần nhất', () => {
    const pages = splitFormPages([brk('p0', 'Mở đầu'), f('a', 'A'), brk('p1', 'Hai'), brk('p2', 'Ba'), brk('p3'), f('b', 'B'), brk('p4', 'Cuối'), brk('p5')]);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toMatchObject({ title: 'Mở đầu' });
    expect(pages[1]).toMatchObject({ title: 'Ba' });
    expect(pages[1].fields.map((x) => x.key)).toEqual(['b']);
  });

  it('trang chỉ có tiêu đề/đoạn chữ vẫn là một trang; chỉ toàn page_break hoặc mảng rỗng → không có trang', () => {
    expect(splitFormPages([f('h', 'Chào', 'heading'), brk('x'), f('a', 'A')])).toHaveLength(2);
    expect(splitFormPages([brk('x'), brk('y')])).toEqual([]);
    expect(splitFormPages([])).toEqual([]);
    expect(splitFormPages(null)).toEqual([]);
  });
});

describe('FormRenderer — nhiều bước (page_break)', () => {
  it('không có page_break: không có thanh tiến trình, không có Tiếp/Quay lại, nút gửi ở ngay trang duy nhất', () => {
    renderForm(make([f('a', 'Ô A'), f('b', 'Ô B')]));
    expect(screen.queryByTestId('form-step-progress')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tiếp' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Quay lại' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gửi thông tin' })).toBeInTheDocument();
  });

  it('chỉ page_break đứng đầu/cuối (chỉ 1 trang có chữ) → vẫn là biểu mẫu một trang, không hiện thanh tiến trình', () => {
    renderForm(make([brk('b0', 'Mở đầu'), f('a', 'Ô A'), brk('b9')]));
    expect(screen.queryByTestId('form-step-progress')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gửi thông tin' })).toBeInTheDocument();
  });

  it('trang 1 chỉ hiện trường của trang 1 + "Bước 1/2" + nút Tiếp (chưa có nút gửi, chưa có Quay lại)', () => {
    renderForm(TWO_STEP);
    expect(screen.getByTestId('form-step-progress')).toHaveTextContent('Bước 1/2');
    expect(screen.getByLabelText(/Họ và tên/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Ghi chú thêm/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Thông tin cơ bản' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tiếp' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gửi thông tin' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Quay lại' })).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '2');
  });

  it('thiếu trường bắt buộc của TRANG HIỆN TẠI: "Tiếp" không sang trang, hiện lỗi đúng trường', () => {
    renderForm(TWO_STEP);
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp' }));

    expect(screen.getByText('Vui lòng điền trường "Họ và tên"')).toBeInTheDocument();
    expect(screen.getByTestId('form-step-progress')).toHaveTextContent('Bước 1/2');
    expect(screen.queryByLabelText(/Ghi chú thêm/)).not.toBeInTheDocument();
  });

  it('điền đủ trang 1 rồi Tiếp: sang trang 2 (tiêu đề bước hiện ra), có Quay lại và nút gửi; trường trang 1 ẩn đi', () => {
    renderForm(TWO_STEP);
    fireEvent.change(screen.getByLabelText(/Họ và tên/), { target: { value: 'Lan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp' }));

    expect(screen.getByTestId('form-step-progress')).toHaveTextContent('Bước 2/2');
    expect(screen.getByTestId('form-step-progress')).toHaveTextContent('Nhu cầu của bạn');
    expect(screen.getByLabelText(/Ghi chú thêm/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Họ và tên/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quay lại' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gửi thông tin' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tiếp' })).not.toBeInTheDocument();
  });

  it('"Quay lại" giữ nguyên giá trị đã điền ở cả hai trang và KHÔNG kiểm bắt buộc', () => {
    renderForm(TWO_STEP);
    fireEvent.change(screen.getByLabelText(/Họ và tên/), { target: { value: 'Lan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp' }));
    // Trang 2 để trống ô bắt buộc rồi quay lại: không bị chặn
    fireEvent.click(screen.getByRole('button', { name: 'Quay lại' }));
    expect(screen.getByLabelText(/Họ và tên/)).toHaveValue('Lan');
    expect(screen.getByTestId('form-step-progress')).toHaveTextContent('Bước 1/2');

    fireEvent.click(screen.getByRole('button', { name: 'Tiếp' }));
    fireEvent.change(screen.getByLabelText(/Ghi chú thêm/), { target: { value: 'cần gấp' } });
    fireEvent.click(screen.getByRole('button', { name: 'Quay lại' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp' }));
    expect(screen.getByLabelText(/Ghi chú thêm/)).toHaveValue('cần gấp');
  });

  it('gửi ở trang cuối: payload.answers gồm trường của MỌI trang, không có khoá của khối hiển thị', async () => {
    const { onSubmit } = renderForm(TWO_STEP);
    fireEvent.change(screen.getByLabelText(/Họ và tên/), { target: { value: 'Lan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp' }));
    fireEvent.change(screen.getByLabelText(/Ghi chú thêm/), { target: { value: 'cần gấp' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi thông tin' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].answers).toEqual({ name: 'Lan', note: 'cần gấp' });
    await waitFor(() => expect(screen.getByText('Cảm ơn bạn!')).toBeInTheDocument());
  });

  it('trang cuối thiếu trường bắt buộc: nút gửi báo lỗi, không gọi onSubmit', async () => {
    const { onSubmit } = renderForm(TWO_STEP);
    fireEvent.change(screen.getByLabelText(/Họ và tên/), { target: { value: 'Lan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gửi thông tin' }));

    expect(await screen.findByText('Vui lòng điền trường "Ghi chú thêm"')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('Enter trong ô nhập ở trang giữa (submit form) = Tiếp, không gửi bài', () => {
    const { onSubmit, container } = renderForm(TWO_STEP);
    fireEvent.change(screen.getByLabelText(/Họ và tên/), { target: { value: 'Lan' } });
    fireEvent.submit(container.querySelector('form'));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId('form-step-progress')).toHaveTextContent('Bước 2/2');
  });

  it('sang trang cuối: nút "Tiếp" vừa bấm phải bị GỠ khỏi DOM, không được "biến" thành nút gửi (trình duyệt thật gửi biểu mẫu ngay)', () => {
    // Lỗi thật (ảnh chụp Playwright 12/10): cùng vị trí, cùng thẻ button → React tái dùng nút DOM và đổi type
    // button→submit giữa lúc xử lý click; hành vi mặc định của click chạy SAU đó nên gửi luôn biểu mẫu. jsdom/act gom cập
    // nhật nên không tái hiện được hành vi, ở đây ghim cơ chế: nút Tiếp phải là một nút DOM khác nút gửi.
    renderForm(
      make([
        f('a', 'Ô A'),
        brk('b1', 'Bước 2'),
        f('b', 'Ô B'),
        brk('b2', 'Bước 3'),
        f('c', 'Ô C'),
      ])
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp' })); // → trang 2 (vẫn còn Tiếp)
    const nextOnPage2 = screen.getByRole('button', { name: 'Tiếp' });
    expect(nextOnPage2).toHaveAttribute('type', 'button');

    fireEvent.click(nextOnPage2); // → trang 3 = trang cuối
    expect(screen.getByTestId('form-step-progress')).toHaveTextContent('Bước 3/3');
    expect(nextOnPage2.isConnected).toBe(false);
    expect(nextOnPage2).toHaveAttribute('type', 'button');
    expect(screen.getByRole('button', { name: 'Gửi thông tin' })).not.toBe(nextOnPage2);
    expect(screen.getByRole('button', { name: 'Gửi thông tin' })).toHaveAttribute('type', 'submit');
  });

  it('bộ chọn lịch + ô đồng ý chỉ hiện ở TRANG CUỐI', () => {
    const form = make(TWO_STEP.fields, {
      settings: { ...SETTINGS, consentEnabled: true },
      booking: { enabled: true, daysAhead: 30 },
    });
    renderForm(form);
    expect(screen.queryByText('Chọn ngày và giờ hẹn')).not.toBeInTheDocument();
    expect(screen.queryByText(/Tôi đồng ý nhận thông tin tư vấn/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Họ và tên/), { target: { value: 'Lan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp' }));
    expect(screen.getByText('Chọn ngày và giờ hẹn')).toBeInTheDocument();
    expect(screen.getByText(/Tôi đồng ý nhận thông tin tư vấn/)).toBeInTheDocument();
  });

  it('xem trước (previewMode): Tiếp/Quay lại dùng được dù ô bắt buộc trống (ô nhập bị khoá), nút gửi trang cuối vẫn khoá', () => {
    renderForm(TWO_STEP, { previewMode: true });
    expect(screen.getByLabelText(/Họ và tên/)).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp' }));
    expect(screen.getByTestId('form-step-progress')).toHaveTextContent('Bước 2/2');
    expect(screen.getByRole('button', { name: 'Gửi thông tin' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Quay lại' }));
    expect(screen.getByTestId('form-step-progress')).toHaveTextContent('Bước 1/2');
  });

  it('xem trước: xoá page_break khi đang ở trang 2 thì kẹp về trang cuối còn lại, không vỡ', () => {
    const { rerender } = renderForm(TWO_STEP, { previewMode: true });
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp' }));
    expect(screen.getByLabelText(/Ghi chú thêm/)).toBeInTheDocument();

    rerender(
      <I18nProvider>
        <FormRenderer form={make(TWO_STEP.fields.filter((x) => x.type !== 'page_break'))} onSubmit={vi.fn()} previewMode />
      </I18nProvider>
    );
    expect(screen.queryByTestId('form-step-progress')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Ghi chú thêm/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Họ và tên/)).toBeInTheDocument();
  });
});

describe('FormRenderer — khối hiển thị (heading, paragraph)', () => {
  it('heading hiện chữ tiêu đề + mô tả phụ; paragraph hiện đoạn chữ; không có ô nhập, không có dấu * bắt buộc', () => {
    const { container } = renderForm(
      make([
        f('h', 'Thông tin liên hệ', 'heading', { helpText: 'Chỉ mất 1 phút', required: true }),
        f('p', 'Vui lòng điền chính xác.\nChúng tôi sẽ gọi lại.', 'paragraph', { required: true }),
        f('a', 'Ô A'),
      ])
    );
    expect(screen.getByRole('heading', { name: 'Thông tin liên hệ' })).toBeInTheDocument();
    expect(screen.getByText('Chỉ mất 1 phút')).toBeInTheDocument();
    expect(container.querySelector('[data-block="paragraph"]')).toHaveTextContent('Vui lòng điền chính xác.');
    // Chỉ một ô nhập thật (ô A) + ô bẫy bot ẩn; khối hiển thị không sinh ô nhập hay dấu *
    expect(container.querySelectorAll('input:not([name="_hp_website"])')).toHaveLength(1);
    expect(container.querySelector('[data-block="heading"] .text-red-500')).toBeNull();
  });

  it('khối hiển thị "bắt buộc" (dữ liệu bẩn) không chặn gửi và không vào answers', async () => {
    const { onSubmit } = renderForm(
      make([f('h', 'Phần 1', 'heading', { required: true }), f('p', 'Lời dẫn', 'paragraph', { required: true }), f('a', 'Ô A')])
    );
    fireEvent.click(screen.getByRole('button', { name: 'Gửi thông tin' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].answers).toEqual({});
  });
});

describe('FormRenderer — độ rộng half / full', () => {
  const wrapperOf = (labelText) => screen.getByText(labelText).closest('div.min-w-0');

  it('lưới 2 cột ≥ sm: trường half chiếm 1 cột (hai half liền nhau chung hàng), trường full chiếm cả hàng; mobile 1 cột', () => {
    const { container } = renderForm(
      make([
        f('a', 'Họ', 'short_text', { width: 'half' }),
        f('b', 'Tên', 'short_text', { width: 'half' }),
        f('c', 'Địa chỉ', 'short_text'),
        f('d', 'Ghi chú', 'short_text', { width: 'full' }),
      ])
    );
    const grid = container.querySelector('form .grid');
    expect(grid.className).toContain('grid-cols-1');
    expect(grid.className).toContain('sm:grid-cols-2');

    expect(wrapperOf('Họ').className).not.toContain('sm:col-span-2');
    expect(wrapperOf('Tên').className).not.toContain('sm:col-span-2');
    expect(wrapperOf('Địa chỉ').className).toContain('sm:col-span-2');
    expect(wrapperOf('Ghi chú').className).toContain('sm:col-span-2');
  });

  it('khối hiển thị luôn cả hàng dù có width half', () => {
    renderForm(make([f('h', 'Tiêu đề', 'heading', { width: 'half' }), f('a', 'Ô A', 'short_text', { width: 'half' })]));
    expect(screen.getByRole('heading', { name: 'Tiêu đề' }).closest('[data-block]').className).toContain('sm:col-span-2');
  });

  it('singleColumn (khung điện thoại của xem trước): không có lớp sm: nào — luôn 1 cột dù viewport rộng', () => {
    const { container } = renderForm(
      make([f('a', 'Họ', 'short_text', { width: 'half' }), f('c', 'Địa chỉ')]),
      { singleColumn: true, previewMode: true }
    );
    const grid = container.querySelector('form .grid');
    expect(grid.className).not.toContain('sm:grid-cols-2');
    expect(wrapperOf('Địa chỉ').className).not.toContain('sm:col-span-2');
  });
});

describe('FormRenderer — rating / yes_no / time', () => {
  it('rating: bấm sao ghi giá trị SỐ vào answers; bấm lại đúng sao đang chọn thì bỏ chọn', async () => {
    const { onSubmit } = renderForm(make([f('r', 'Mức hài lòng', 'rating')]));
    const stars = screen.getAllByRole('radio', { name: /Chấm \d sao/ });
    expect(stars).toHaveLength(5);

    fireEvent.click(stars[3]);
    expect(stars[3]).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('4/5')).toBeInTheDocument();
    fireEvent.click(stars[3]);
    expect(stars[3]).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(stars[4]);
    fireEvent.click(screen.getByRole('button', { name: 'Gửi thông tin' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].answers).toEqual({ r: 5 });
  });

  it('rating bắt buộc mà chưa chọn: báo lỗi, không gửi', () => {
    const { onSubmit } = renderForm(make([f('r', 'Mức hài lòng', 'rating', { required: true })]));
    fireEvent.click(screen.getByRole('button', { name: 'Gửi thông tin' }));
    expect(screen.getByText('Vui lòng điền trường "Mức hài lòng"')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('yes_no: hai lựa chọn Có / Không; chọn Không ghi "no"', async () => {
    const { onSubmit } = renderForm(make([f('y', 'Bạn đã dùng thử chưa?', 'yes_no')]));
    const group = screen.getByRole('radiogroup', { name: 'Bạn đã dùng thử chưa?' });
    expect(within(group).getByLabelText('Có')).not.toBeChecked();
    fireEvent.click(within(group).getByLabelText('Không'));
    expect(within(group).getByLabelText('Không')).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Gửi thông tin' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].answers).toEqual({ y: 'no' });
  });

  it('time: ô giờ HH:MM, ghi chuỗi giờ vào answers', async () => {
    const { onSubmit } = renderForm(make([f('t', 'Giờ liên hệ', 'time')]));
    const input = screen.getByLabelText('Giờ liên hệ');
    expect(input).toHaveAttribute('type', 'time');
    fireEvent.change(input, { target: { value: '14:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi thông tin' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].answers).toEqual({ t: '14:30' });
  });

  it('xem trước: ô sao / có-không / giờ bị khoá', () => {
    renderForm(
      make([f('r', 'Sao', 'rating'), f('y', 'Có hay không', 'yes_no'), f('t', 'Giờ', 'time')]),
      { previewMode: true }
    );
    screen.getAllByRole('radio', { name: /Chấm \d sao/ }).forEach((star) => expect(star).toBeDisabled());
    expect(screen.getByLabelText('Có')).toBeDisabled();
    expect(screen.getByLabelText('Giờ')).toBeDisabled();
  });
});
