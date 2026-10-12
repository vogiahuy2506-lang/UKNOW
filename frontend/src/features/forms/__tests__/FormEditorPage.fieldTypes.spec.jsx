import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import toast from 'react-hot-toast';
import { I18nProvider } from '../../../i18n';
import FormEditorPage from '../pages/FormEditorPage';
import * as formAdminApi from '../services/formAdminApi.service';
import { fieldRow, selectFieldRow } from './formEditorTestUtils';

/**
 * PR-4 (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11): trình soạn có loại trường mới (Chấm sao, Có/Không, Giờ) và khối
 * bố cục (Tiêu đề phần, Đoạn chữ, Ngắt trang), độ rộng Cả dòng / Nửa dòng, đếm riêng 30 trường nhập + 20 khối bố cục.
 * Payload của trường cũ do FormEditorPage.payload.contract.spec.jsx giữ (không đổi).
 */

vi.mock('../services/formAdminApi.service', () => ({
  fetchFormById: vi.fn(),
  createForm: vi.fn(),
  updateForm: vi.fn(),
  publishForm: vi.fn(),
  uploadFormTempFile: vi.fn(),
  uploadFormAsset: vi.fn(),
}));

vi.mock('../../products/services/productApi.service', () => ({
  default: { getProducts: vi.fn().mockResolvedValue({ data: { data: { products: [] } } }) },
}));

vi.mock('../../storage/useStorageQuota', () => ({
  default: () => ({ usage: null }),
}));

vi.mock('../../storage/storageEvents', () => ({
  notifyStorageQuotaRefresh: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

let mockAuthState = { user: null, activeContext: { type: 'self' } };
vi.mock('../../../stores/authStore', () => ({
  useAuthStore: (selector) => selector(mockAuthState),
}));

const FORM = {
  id: 'form-types-1',
  publicKey: 'pub-types-1',
  title: 'Biểu mẫu thử loại trường',
  description: '',
  isPublished: false,
  fields: [
    { key: 'f_name', label: 'Họ và tên', type: 'short_text', required: true, role: 'name' },
    { key: 'f_mail', label: 'Email', type: 'email', required: true, role: 'email' },
  ],
  settings: {
    notifyOwner: true,
    consentEnabled: false,
    sendConfirmation: false,
    submitButtonText: 'Gửi',
    successMessage: 'Cảm ơn',
    redirectUrl: '',
  },
};

async function renderEdit(form = FORM) {
  formAdminApi.fetchFormById.mockResolvedValue(form);
  formAdminApi.updateForm.mockResolvedValue(form);
  render(
    <MemoryRouter initialEntries={[`/app/forms/${form.id}/edit`]}>
      <I18nProvider>
        <Routes>
          <Route path="/app/forms/:id/edit" element={<FormEditorPage />} />
        </Routes>
      </I18nProvider>
    </MemoryRouter>
  );
  await waitFor(() => expect(screen.getByDisplayValue(form.title)).toBeInTheDocument());
}

const listPane = () => within(screen.getByTestId('form-field-list-pane'));
const previewPane = () => within(screen.getByTestId('form-preview-pane'));
const save = () => fireEvent.click(screen.getByRole('button', { name: /Lưu biểu mẫu/i }));
const savedPayload = async () => {
  await waitFor(() => expect(formAdminApi.updateForm).toHaveBeenCalledTimes(1));
  return formAdminApi.updateForm.mock.calls[0][1];
};
const openMoreTypes = () => fireEvent.click(listPane().getByRole('button', { name: 'Loại khác…' }));
const quickAdd = (name) => fireEvent.click(listPane().getByRole('button', { name }));
// Hàng khối bố cục có nhãn đọc màn hình "Khối bố cục N: …" (selectFieldRow chỉ dành cho trường nhập "Trường #N: …").
const selectBlockRow = (idx) =>
  fireEvent.click(within(fieldRow(idx)).getByRole('button', { name: /^Khối bố cục \d+:/ }));

describe('FormEditorPage — loại trường & bố cục mới (PR-4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockAuthState = { user: null, activeContext: { type: 'self' } };
  });

  it('"Loại khác…" mở hai nhóm: Câu hỏi (có Chấm sao, Có / Không, Giờ) và Bố cục (Tiêu đề phần, Đoạn chữ, Ngắt trang)', async () => {
    await renderEdit();
    expect(screen.queryByTestId('form-more-field-types')).not.toBeInTheDocument();

    openMoreTypes();
    const more = within(screen.getByTestId('form-more-field-types'));
    expect(more.getByText('Câu hỏi')).toBeInTheDocument();
    expect(more.getByText('Bố cục')).toBeInTheDocument();
    for (const name of ['Chấm sao', 'Có / Không', 'Giờ', 'Tiêu đề phần', 'Đoạn chữ', 'Ngắt trang']) {
      expect(more.getByRole('button', { name })).toBeInTheDocument();
    }
    // Các loại cũ vẫn ở đó
    expect(more.getByRole('button', { name: 'Trắc nghiệm đơn' })).toBeInTheDocument();

    fireEvent.click(listPane().getByRole('button', { name: 'Ẩn bớt' }));
    expect(screen.queryByTestId('form-more-field-types')).not.toBeInTheDocument();
  });

  it('thêm đủ 6 loại mới → payload đúng từng khoá; khối bố cục KHÔNG required/role/placeholder/options/width, page_break nhãn rỗng', async () => {
    await renderEdit();
    openMoreTypes();
    for (const name of ['Chấm sao', 'Có / Không', 'Giờ', 'Tiêu đề phần', 'Đoạn chữ', 'Ngắt trang']) quickAdd(name);

    save();
    const { fields } = await savedPayload();
    expect(fields.slice(2)).toEqual([
      { label: 'Bạn đánh giá thế nào?', type: 'rating', required: false },
      { label: 'Câu hỏi Có / Không', type: 'yes_no', required: false },
      { label: 'Giờ mong muốn', type: 'time', required: false },
      { label: 'Tiêu đề phần mới', type: 'heading', required: false },
      { label: 'Nhập nội dung đoạn chữ ở đây', type: 'paragraph', required: false },
      { label: '', type: 'page_break', required: false },
    ]);
  });

  it('hàng khối bố cục: huy hiệu loại riêng, KHÔNG có "Bắt buộc"/vai trò, không đánh số "Trường #n"; trường nhập đánh số bỏ qua khối', async () => {
    await renderEdit();
    openMoreTypes();
    quickAdd('Tiêu đề phần');
    quickAdd('Ngắt trang');
    quickAdd('Chấm sao');

    // rows: 0 Họ và tên, 1 Email, 2 heading, 3 page_break, 4 rating
    expect(within(fieldRow(2)).getByTestId('field-block-badge-2')).toHaveTextContent('Tiêu đề phần');
    expect(within(fieldRow(3)).getByTestId('field-block-badge-3')).toHaveTextContent('Ngắt trang (sang bước mới)');
    expect(within(fieldRow(3)).getByText('Sang trang mới')).toBeInTheDocument();
    for (const idx of [2, 3]) {
      expect(within(fieldRow(idx)).queryByText('Bắt buộc')).not.toBeInTheDocument();
      expect(within(fieldRow(idx)).queryByText(/^Trường #/)).not.toBeInTheDocument();
    }
    expect(within(fieldRow(2)).getByRole('button', { name: /^Khối bố cục 1:/ })).toBeInTheDocument();
    expect(within(fieldRow(3)).getByRole('button', { name: /^Khối bố cục 2:/ })).toBeInTheDocument();
    // Chấm sao là trường nhập thứ 3 (khối không chiếm số)
    expect(within(fieldRow(4)).getByRole('button', { name: /^Trường #3:/ })).toBeInTheDocument();
  });

  it('đếm "x/30" chỉ tính trường nhập; khối bố cục hiện số riêng', async () => {
    await renderEdit();
    expect(listPane().getByText('2/30')).toBeInTheDocument();
    expect(screen.queryByTestId('form-block-count')).not.toBeInTheDocument();

    openMoreTypes();
    quickAdd('Tiêu đề phần');
    quickAdd('Đoạn chữ');
    expect(listPane().getByText('2/30')).toBeInTheDocument();
    expect(screen.getByTestId('form-block-count')).toHaveTextContent('+ 2 khối bố cục');

    quickAdd('Giờ');
    expect(listPane().getByText('3/30')).toBeInTheDocument();
  });

  it('bảng thuộc tính khối bố cục ẩn ô không áp dụng: heading chỉ còn chữ tiêu đề + mô tả phụ + loại', async () => {
    await renderEdit();
    openMoreTypes();
    quickAdd('Tiêu đề phần');

    const panel = within(within(fieldRow(2)).getByTestId('field-properties-panel'));
    expect(panel.getByLabelText(/Chữ tiêu đề/)).toHaveValue('Tiêu đề phần mới');
    expect(panel.getByLabelText('Mô tả phụ (không bắt buộc)')).toBeInTheDocument();
    expect(panel.getByLabelText('Kiểu dữ liệu')).toHaveValue('heading');
    expect(panel.queryByRole('checkbox', { name: /Bắt buộc/ })).not.toBeInTheDocument();
    expect(panel.queryByLabelText('Vai trò định danh')).not.toBeInTheDocument();
    expect(panel.queryByLabelText('Độ rộng')).not.toBeInTheDocument();
    expect(panel.queryByLabelText(/Gợi ý trong ô nhập/)).not.toBeInTheDocument();
    expect(panel.queryByText('Danh sách lựa chọn')).not.toBeInTheDocument();
  });

  it('paragraph: ô nội dung dài (≤2000) thay cho nhãn, KHÔNG có chữ hướng dẫn; page_break: tiêu đề bước tuỳ chọn + lời nhắc, không có chữ hướng dẫn', async () => {
    await renderEdit();
    openMoreTypes();
    quickAdd('Đoạn chữ');

    const para = within(within(fieldRow(2)).getByTestId('field-properties-panel'));
    const content = para.getByLabelText(/Nội dung đoạn chữ/);
    expect(content.tagName).toBe('TEXTAREA');
    expect(content).toHaveAttribute('maxlength', '2000');
    expect(para.queryByLabelText(/Chữ hướng dẫn|Mô tả phụ/)).not.toBeInTheDocument();
    expect(para.queryByRole('checkbox', { name: /Bắt buộc/ })).not.toBeInTheDocument();

    quickAdd('Ngắt trang'); // hàng vừa thêm tự được chọn
    const brk = within(within(fieldRow(3)).getByTestId('field-properties-panel'));
    expect(brk.getByLabelText(/Tiêu đề bước/)).toHaveValue('');
    expect(brk.getByText(/Ngắt trang chia biểu mẫu thành nhiều bước/)).toBeInTheDocument();
    expect(brk.queryByLabelText(/Chữ hướng dẫn|Mô tả phụ/)).not.toBeInTheDocument();
    expect(brk.queryByRole('checkbox', { name: /Bắt buộc/ })).not.toBeInTheDocument();
  });

  it('trường nhập: có ô Độ rộng (Cả dòng mặc định); rating / yes_no / time KHÔNG có Vai trò, loại cũ vẫn có', async () => {
    await renderEdit();
    selectFieldRow(0);
    const name = within(within(fieldRow(0)).getByTestId('field-properties-panel'));
    expect(name.getByLabelText('Độ rộng')).toHaveValue('full');
    expect(name.getByLabelText('Vai trò định danh')).toBeInTheDocument();

    openMoreTypes();
    quickAdd('Chấm sao');
    const rating = within(within(fieldRow(2)).getByTestId('field-properties-panel'));
    expect(rating.getByLabelText('Độ rộng')).toBeInTheDocument();
    expect(rating.getByRole('checkbox', { name: /Bắt buộc/ })).toBeInTheDocument();
    expect(rating.queryByLabelText('Vai trò định danh')).not.toBeInTheDocument();
    expect(rating.queryByLabelText(/Gợi ý trong ô nhập/)).not.toBeInTheDocument();
  });

  it('chọn "Nửa dòng" → payload có width:"half" CHỈ ở trường đó; quay lại "Cả dòng" thì vắng khoá', async () => {
    await renderEdit();
    selectFieldRow(1);
    const widthSelect = () => within(fieldRow(1)).getByLabelText('Độ rộng');
    fireEvent.change(widthSelect(), { target: { value: 'half' } });
    expect(within(fieldRow(1)).getByText('Nửa dòng')).toBeInTheDocument(); // huy hiệu trên hàng

    save();
    let payload = await savedPayload();
    expect(payload.fields[1]).toEqual({ key: 'f_mail', label: 'Email', type: 'email', required: true, role: 'email', width: 'half' });
    expect(payload.fields[0]).not.toHaveProperty('width');

    formAdminApi.updateForm.mockClear();
    fireEvent.change(widthSelect(), { target: { value: 'full' } });
    save();
    await waitFor(() => expect(formAdminApi.updateForm).toHaveBeenCalledTimes(1));
    payload = formAdminApi.updateForm.mock.calls[0][1];
    expect(payload.fields[1]).not.toHaveProperty('width');
  });

  it('SỬA — vòng tròn nạp → lưu: biểu mẫu có khối bố cục + loại mới + width giữ NGUYÊN từng khoá', async () => {
    const full = {
      ...FORM,
      fields: [
        { key: 'f_h', label: 'Thông tin liên hệ', type: 'heading', required: false, role: null, helpText: 'Mất 1 phút', options: [] },
        { key: 'f_name', label: 'Họ', type: 'short_text', required: true, role: 'name', width: 'half', options: [] },
        { key: 'f_last', label: 'Tên', type: 'short_text', required: false, role: null, width: 'half', options: [] },
        { key: 'f_p', label: 'Lời dẫn dài\nhai dòng', type: 'paragraph', required: false, role: null, options: [] },
        { key: 'f_pb', label: 'Bước 2', type: 'page_break', required: false, role: null, options: [] },
        { key: 'f_rate', label: 'Hài lòng?', type: 'rating', required: true, role: null, options: [] },
        { key: 'f_yn', label: 'Đã dùng thử?', type: 'yes_no', required: false, role: null, options: [] },
        { key: 'f_t', label: 'Giờ gọi', type: 'time', required: false, role: null, options: [] },
      ],
    };
    await renderEdit(full);
    save();
    const { fields } = await savedPayload();
    expect(fields).toEqual([
      { key: 'f_h', label: 'Thông tin liên hệ', type: 'heading', required: false, helpText: 'Mất 1 phút' },
      { key: 'f_name', label: 'Họ', type: 'short_text', required: true, role: 'name', width: 'half' },
      { key: 'f_last', label: 'Tên', type: 'short_text', required: false, width: 'half' },
      { key: 'f_p', label: 'Lời dẫn dài\nhai dòng', type: 'paragraph', required: false },
      { key: 'f_pb', label: 'Bước 2', type: 'page_break', required: false },
      { key: 'f_rate', label: 'Hài lòng?', type: 'rating', required: true },
      { key: 'f_yn', label: 'Đã dùng thử?', type: 'yes_no', required: false },
      { key: 'f_t', label: 'Giờ gọi', type: 'time', required: false },
    ]);
  });

  it('dữ liệu bẩn nạp từ server: khối bố cục lỡ mang required/role/placeholder, rating lỡ mang role → lưu lại thì payload bỏ hết (không lan dữ liệu bẩn)', async () => {
    await renderEdit({
      ...FORM,
      fields: [
        { key: 'f_h', label: 'Tiêu đề', type: 'heading', required: true, role: 'name', placeholder: 'rác' },
        { key: 'f_pb', label: 'Bước 2', type: 'page_break', required: true, role: 'email' },
        { key: 'f_rate', label: 'Sao', type: 'rating', required: true, role: 'phone' },
        { key: 'f_ok', label: 'Họ tên', type: 'short_text', required: true, role: 'name' },
      ],
    });
    save();
    const { fields } = await savedPayload();
    expect(fields).toEqual([
      { key: 'f_h', label: 'Tiêu đề', type: 'heading', required: false },
      { key: 'f_pb', label: 'Bước 2', type: 'page_break', required: false },
      { key: 'f_rate', label: 'Sao', type: 'rating', required: true },
      { key: 'f_ok', label: 'Họ tên', type: 'short_text', required: true, role: 'name' },
    ]);
  });

  it('đổi trường nhập (bắt buộc + vai trò + nửa dòng + gợi ý) sang Tiêu đề phần: payload bỏ required/role/width/placeholder; đổi sang Chấm sao: bỏ role', async () => {
    const form = {
      ...FORM,
      fields: [
        { key: 'f_name', label: 'Họ và tên', type: 'short_text', required: true, role: 'name', placeholder: 'Nguyễn Văn A', width: 'half' },
        { key: 'f_mail', label: 'Email', type: 'email', required: true, role: 'email' },
      ],
    };
    await renderEdit(form);

    // Đổi hàng 2 trước (số thứ tự "Trường #n" của các hàng nhập đổi khi hàng trên biến thành khối bố cục)
    selectFieldRow(1);
    fireEvent.change(within(fieldRow(1)).getByLabelText('Kiểu dữ liệu'), { target: { value: 'rating' } });
    selectFieldRow(0);
    fireEvent.change(within(fieldRow(0)).getByLabelText('Kiểu dữ liệu'), { target: { value: 'heading' } });

    save();
    const { fields } = await savedPayload();
    expect(fields[0]).toEqual({ key: 'f_name', label: 'Họ và tên', type: 'heading', required: false });
    expect(fields[1]).toEqual({ key: 'f_mail', label: 'Email', type: 'rating', required: true });
  });

  it('đổi Tiêu đề phần sang trường nhập: ô Bắt buộc / Vai trò / Độ rộng xuất hiện lại với giá trị mặc định', async () => {
    await renderEdit();
    openMoreTypes();
    quickAdd('Tiêu đề phần');
    fireEvent.change(within(fieldRow(2)).getByLabelText('Kiểu dữ liệu'), { target: { value: 'short_text' } });
    const panel = within(within(fieldRow(2)).getByTestId('field-properties-panel'));
    expect(panel.getByRole('checkbox', { name: /Bắt buộc/ })).not.toBeChecked();
    expect(panel.getByLabelText('Vai trò định danh')).toHaveValue('');
    expect(panel.getByLabelText('Độ rộng')).toHaveValue('full');
  });

  describe('giới hạn 30 trường nhập + 20 khối bố cục', () => {
    const inputs = (n) => Array.from({ length: n }, (_, i) => ({ key: `f_${i}`, label: `Câu ${i + 1}`, type: 'short_text', required: false }));
    const blocks = (n) => Array.from({ length: n }, (_, i) => ({ key: `b_${i}`, label: `Khối ${i + 1}`, type: i % 2 ? 'page_break' : 'heading', required: false }));

    it('đủ 30 trường nhập vẫn thêm được khối bố cục (không ăn vào hạn mức câu hỏi), nhưng thêm trường nhập thứ 31 thì bị chặn', async () => {
      await renderEdit({ ...FORM, fields: inputs(30) });
      openMoreTypes();
      quickAdd('Tiêu đề phần');
      expect(toast.error).not.toHaveBeenCalled();
      expect(screen.getByTestId('field-row-30')).toBeInTheDocument();

      quickAdd('Giờ');
      expect(toast.error).toHaveBeenCalledWith('Mỗi biểu mẫu tối đa 30 trường thông tin');
      expect(screen.queryByTestId('field-row-31')).not.toBeInTheDocument();
    });

    it('đủ 20 khối bố cục: thêm khối thứ 21 bị chặn với thông báo riêng, nhưng vẫn thêm được trường nhập', async () => {
      await renderEdit({ ...FORM, fields: [...inputs(2), ...blocks(20)] });
      openMoreTypes();
      quickAdd('Ngắt trang');
      expect(toast.error).toHaveBeenCalledWith('Mỗi biểu mẫu tối đa 20 khối bố cục (tiêu đề, đoạn chữ, ngắt trang)');
      expect(screen.queryByTestId('field-row-22')).not.toBeInTheDocument();

      toast.error.mockClear();
      quickAdd('Giờ');
      expect(toast.error).not.toHaveBeenCalled();
      expect(screen.getByTestId('field-row-22')).toBeInTheDocument();
    });

    it('đổi loại sang nhóm đã đầy bị chặn: 30 trường nhập không đổi thêm được khối thành trường nhập; 20 khối không đổi thêm trường thành khối', async () => {
      await renderEdit({ ...FORM, fields: [...inputs(30), ...blocks(1)] });
      selectBlockRow(30);
      fireEvent.change(within(fieldRow(30)).getByLabelText('Kiểu dữ liệu'), { target: { value: 'short_text' } });
      expect(toast.error).toHaveBeenCalledWith('Mỗi biểu mẫu tối đa 30 trường thông tin');
      expect(within(fieldRow(30)).getByLabelText('Kiểu dữ liệu')).toHaveValue('heading');
    });

    it('nhân bản khối bố cục khi đã đủ 20 khối bị chặn', async () => {
      await renderEdit({ ...FORM, fields: [...inputs(2), ...blocks(20)] });
      fireEvent.click(within(fieldRow(2)).getByTitle('Nhân bản trường'));
      expect(toast.error).toHaveBeenCalledWith('Mỗi biểu mẫu tối đa 20 khối bố cục (tiêu đề, đoạn chữ, ngắt trang)');
    });
  });

  describe('kiểm tra trước khi lưu', () => {
    it('đoạn chữ để trống → báo lỗi ở ô nội dung, không gọi API', async () => {
      await renderEdit();
      openMoreTypes();
      quickAdd('Đoạn chữ');
      fireEvent.change(within(fieldRow(2)).getByLabelText(/Nội dung đoạn chữ/), { target: { value: '   ' } });
      save();

      expect(await within(fieldRow(2)).findByText('Nội dung đoạn chữ không được để trống')).toBeInTheDocument();
      expect(formAdminApi.updateForm).not.toHaveBeenCalled();
    });

    it('tiêu đề phần để trống → báo lỗi; ngắt trang để trống tiêu đề thì KHÔNG lỗi', async () => {
      await renderEdit();
      openMoreTypes();
      quickAdd('Tiêu đề phần');
      fireEvent.change(within(fieldRow(2)).getByLabelText(/Chữ tiêu đề/), { target: { value: '' } });
      save();
      expect(await within(fieldRow(2)).findByText(/không được để trống/)).toBeInTheDocument();
      expect(formAdminApi.updateForm).not.toHaveBeenCalled();

      fireEvent.change(within(fieldRow(2)).getByLabelText(/Chữ tiêu đề/), { target: { value: 'Phần 1' } });
      quickAdd('Ngắt trang');
      save();
      const { fields } = await savedPayload();
      expect(fields.map((x) => x.type)).toEqual(['short_text', 'email', 'heading', 'page_break']);
    });

    it('biểu mẫu chỉ toàn khối bố cục (không trường nhập nào) → báo "ít nhất 1 trường", không gọi API', async () => {
      await renderEdit({
        ...FORM,
        fields: [
          { key: 'b_1', label: 'Chỉ có tiêu đề', type: 'heading', required: false },
          { key: 'b_2', label: 'Và ngắt trang', type: 'page_break', required: false },
        ],
      });
      save();
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Biểu mẫu phải có ít nhất 1 trường thông tin'));
      expect(formAdminApi.updateForm).not.toHaveBeenCalled();
    });
  });

  describe('xem trước dùng FormRenderer thật', () => {
    const multiStep = {
      ...FORM,
      fields: [
        { key: 'f_name', label: 'Họ và tên', type: 'short_text', required: true, role: 'name' },
        { key: 'f_pb', label: 'Nhu cầu', type: 'page_break', required: false },
        { key: 'f_note', label: 'Ghi chú', type: 'short_text', required: true },
      ],
    };

    it('có ngắt trang → xem trước có "Bước 1/2", Tiếp / Quay lại dùng được dù ô bắt buộc trống, KHÔNG gọi API nộp/lưu', async () => {
      await renderEdit(multiStep);
      expect(previewPane().getByTestId('form-step-progress')).toHaveTextContent('Bước 1/2');
      expect(previewPane().queryByLabelText(/Ghi chú/)).not.toBeInTheDocument();

      fireEvent.click(previewPane().getByRole('button', { name: 'Tiếp' }));
      expect(previewPane().getByTestId('form-step-progress')).toHaveTextContent('Bước 2/2');
      expect(previewPane().getByTestId('form-step-progress')).toHaveTextContent('Nhu cầu');
      expect(previewPane().getByLabelText(/Ghi chú/)).toBeDisabled();
      expect(previewPane().getByRole('button', { name: 'Gửi' })).toBeDisabled();

      fireEvent.click(previewPane().getByRole('button', { name: 'Quay lại' }));
      expect(previewPane().getByTestId('form-step-progress')).toHaveTextContent('Bước 1/2');
      expect(formAdminApi.updateForm).not.toHaveBeenCalled();
      expect(formAdminApi.createForm).not.toHaveBeenCalled();
    });

    it('xem trước thấy ngay trường mới, tiêu đề phần, đoạn chữ, sao, có/không, giờ khi thêm', async () => {
      await renderEdit();
      openMoreTypes();
      for (const name of ['Tiêu đề phần', 'Đoạn chữ', 'Chấm sao', 'Có / Không', 'Giờ']) quickAdd(name);

      expect(previewPane().getByRole('heading', { name: 'Tiêu đề phần mới' })).toBeInTheDocument();
      expect(previewPane().getByText('Nhập nội dung đoạn chữ ở đây')).toBeInTheDocument();
      expect(previewPane().getAllByRole('radio', { name: /Chấm \d sao/ })).toHaveLength(5);
      expect(previewPane().getByRole('radiogroup', { name: 'Câu hỏi Có / Không' })).toBeInTheDocument();
      expect(previewPane().getByLabelText('Giờ mong muốn')).toHaveAttribute('type', 'time');
    });

    it('trường nửa dòng: xem trước máy tính chia 2 cột; chuyển sang Điện thoại thì ép 1 cột', async () => {
      await renderEdit({
        ...FORM,
        fields: [
          { key: 'f_a', label: 'Họ', type: 'short_text', required: false, width: 'half' },
          { key: 'f_b', label: 'Tên', type: 'short_text', required: false, width: 'half' },
        ],
      });
      const grid = () => screen.getByTestId('form-preview-frame').querySelector('form .grid');
      expect(grid().className).toContain('sm:grid-cols-2');

      fireEvent.click(screen.getByRole('tab', { name: 'Điện thoại' }));
      expect(grid().className).not.toContain('sm:grid-cols-2');
    });
  });
});
