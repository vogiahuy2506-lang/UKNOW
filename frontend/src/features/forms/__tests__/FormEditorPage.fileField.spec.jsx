import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import toast from 'react-hot-toast';
import { I18nProvider } from '../../../i18n';
import FormEditorPage from '../pages/FormEditorPage';
import * as formAdminApi from '../services/formAdminApi.service';
import { fieldRow, selectFieldRow } from './formEditorTestUtils';

/**
 * PR-4b (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, QĐ7): loại trường "Tải tệp" trong trình soạn.
 * Cờ backend tắt → ẨN loại này khỏi menu Câu hỏi và ô chọn loại; bật → hiện, thêm trường có cấu hình mặc định
 * (Ảnh + PDF, 10 MB, 1 tệp), bảng thuộc tính có checkbox nhóm loại + dung lượng (MB, 1..1024) + số tệp (1..10),
 * payload gửi `fileConfig { kinds, maxBytes, maxFiles }`, xem trước vẽ ô chọn tệp (khoá, không tải thật).
 */

vi.mock('../services/formAdminApi.service', () => ({
  fetchFormById: vi.fn(),
  createForm: vi.fn(),
  updateForm: vi.fn(),
  publishForm: vi.fn(),
  uploadFormTempFile: vi.fn(),
  uploadFormAsset: vi.fn(),
  fetchFormCapabilities: vi.fn(),
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

const MB = 1024 * 1024;

const FORM = {
  id: 'form-file-1',
  publicKey: 'pub-file-1',
  title: 'Biểu mẫu có tệp',
  description: '',
  isPublished: false,
  fields: [
    { key: 'f_name', label: 'Họ và tên', type: 'short_text', required: true, role: 'name' },
    {
      key: 'f_cv',
      label: 'Hồ sơ xin việc',
      type: 'file',
      required: true,
      options: [],
      fileConfig: { kinds: ['pdf', 'word'], maxBytes: 25 * MB, maxFiles: 3 },
    },
  ],
  settings: { notifyOwner: true, consentEnabled: false, sendConfirmation: false, submitButtonText: 'Gửi', successMessage: 'Cảm ơn', redirectUrl: '' },
};

const PLAIN_FORM = { ...FORM, id: 'form-file-2', fields: [FORM.fields[0]] };

async function renderEdit(form = FORM, { fileUploadsEnabled = true } = {}) {
  formAdminApi.fetchFormCapabilities.mockResolvedValue({ fileUploadsEnabled });
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
  await waitFor(() => expect(formAdminApi.fetchFormCapabilities).toHaveBeenCalled());
}

const listPane = () => within(screen.getByTestId('form-field-list-pane'));
const previewPane = () => within(screen.getByTestId('form-preview-pane'));
const save = () => fireEvent.click(screen.getByRole('button', { name: /Lưu biểu mẫu/i }));
const savedPayload = async () => {
  await waitFor(() => expect(formAdminApi.updateForm).toHaveBeenCalledTimes(1));
  return formAdminApi.updateForm.mock.calls[0][1];
};
const openMoreTypes = () => fireEvent.click(listPane().getByRole('button', { name: 'Loại khác…' }));
const panel = () => within(screen.getByTestId('file-config-panel'));

describe('FormEditorPage — trường Tải tệp (PR-4b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockAuthState = { user: null, activeContext: { type: 'self' } };
  });

  it('cờ TẮT: menu "Loại khác…" không có "Tải tệp", ô chọn loại của trường thường cũng không có', async () => {
    await renderEdit(PLAIN_FORM, { fileUploadsEnabled: false });
    openMoreTypes();
    expect(within(screen.getByTestId('form-more-field-types')).queryByRole('button', { name: 'Tải tệp' })).not.toBeInTheDocument();

    selectFieldRow(0);
    const typeSelect = screen.getByLabelText('Kiểu dữ liệu');
    expect(within(typeSelect).queryByRole('option', { name: /Tải tệp/ })).not.toBeInTheDocument();
  });

  it('cờ TẮT mà biểu mẫu ĐÃ có trường file: trường vẫn hiện, bảng thuộc tính vẫn sửa được, lưu lại giữ nguyên fileConfig', async () => {
    await renderEdit(FORM, { fileUploadsEnabled: false });
    selectFieldRow(1);
    expect(screen.getByTestId('file-config-panel')).toBeInTheDocument();
    // Ô chọn loại vẫn có "Tải tệp" cho đúng trường này (select không rỗng), nhưng menu thêm nhanh thì không.
    expect(within(screen.getByLabelText('Kiểu dữ liệu')).getByRole('option', { name: /Tải tệp/ })).toBeInTheDocument();
    openMoreTypes();
    expect(within(screen.getByTestId('form-more-field-types')).queryByRole('button', { name: 'Tải tệp' })).not.toBeInTheDocument();

    save();
    const { fields } = await savedPayload();
    expect(fields[1].fileConfig).toEqual({ kinds: ['pdf', 'word'], maxBytes: 25 * MB, maxFiles: 3 });
  });

  it('lỗi khi hỏi cờ (mạng) → coi là TẮT, trình soạn vẫn dùng bình thường', async () => {
    formAdminApi.fetchFormCapabilities.mockRejectedValue(new Error('Network Error'));
    formAdminApi.fetchFormById.mockResolvedValue(PLAIN_FORM);
    render(
      <MemoryRouter initialEntries={[`/app/forms/${PLAIN_FORM.id}/edit`]}>
        <I18nProvider>
          <Routes>
            <Route path="/app/forms/:id/edit" element={<FormEditorPage />} />
          </Routes>
        </I18nProvider>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByDisplayValue(PLAIN_FORM.title)).toBeInTheDocument());
    openMoreTypes();
    expect(within(screen.getByTestId('form-more-field-types')).queryByRole('button', { name: 'Tải tệp' })).not.toBeInTheDocument();
  });

  it('cờ BẬT: "Tải tệp" có trong menu "Loại khác…" (nhóm Câu hỏi) và trong ô chọn loại', async () => {
    await renderEdit(PLAIN_FORM, { fileUploadsEnabled: true });
    openMoreTypes();
    expect(within(screen.getByTestId('form-more-field-types')).getByRole('button', { name: 'Tải tệp' })).toBeInTheDocument();
    selectFieldRow(0);
    expect(within(screen.getByLabelText('Kiểu dữ liệu')).getByRole('option', { name: /Tải tệp/ })).toBeInTheDocument();
  });

  it('thêm "Tải tệp": trường mới có cấu hình mặc định, bảng thuộc tính hiện đúng; lưu → payload fileConfig mặc định, không role/placeholder', async () => {
    await renderEdit(PLAIN_FORM);
    openMoreTypes();
    fireEvent.click(within(screen.getByTestId('form-more-field-types')).getByRole('button', { name: 'Tải tệp' }));

    const kinds = panel().getAllByRole('checkbox');
    expect(kinds).toHaveLength(9);
    expect(panel().getByLabelText(/Ảnh/)).toBeChecked();
    expect(panel().getByLabelText(/PDF/)).toBeChecked();
    expect(panel().getByLabelText(/Word/)).not.toBeChecked();
    expect(panel().getByLabelText('Dung lượng tối đa mỗi tệp (MB)')).toHaveValue(10);
    expect(panel().getByLabelText('Số tệp tối đa')).toHaveValue(1);
    // Không có ô Vai trò / Gợi ý trong ô nhập cho trường tệp.
    expect(screen.queryByLabelText('Vai trò')).not.toBeInTheDocument();

    save();
    const { fields } = await savedPayload();
    expect(fields[1]).toEqual({
      label: 'Đính kèm tệp',
      type: 'file',
      required: false,
      fileConfig: { kinds: ['image', 'pdf'], maxBytes: 10 * MB, maxFiles: 1 },
    });
  });

  it('chỉnh nhóm loại, dung lượng (MB) và số tệp → payload đổi MB sang byte, nhóm theo thứ tự danh mục', async () => {
    await renderEdit(FORM);
    selectFieldRow(1);
    expect(panel().getByLabelText(/PDF/)).toBeChecked();
    expect(panel().getByLabelText(/Word/)).toBeChecked();

    fireEvent.click(panel().getByLabelText(/Tệp nén/));
    fireEvent.click(panel().getByLabelText(/Ảnh/));
    fireEvent.click(panel().getByLabelText(/Word/)); // bỏ Word
    fireEvent.change(panel().getByLabelText('Dung lượng tối đa mỗi tệp (MB)'), { target: { value: '500' } });
    fireEvent.change(panel().getByLabelText('Số tệp tối đa'), { target: { value: '5' } });

    save();
    const { fields } = await savedPayload();
    expect(fields[1].fileConfig).toEqual({ kinds: ['image', 'pdf', 'zip'], maxBytes: 500 * MB, maxFiles: 5 });
  });

  it('cho phép 1 GB (1024 MB) làm trần mỗi tệp', async () => {
    await renderEdit(FORM);
    selectFieldRow(1);
    fireEvent.change(panel().getByLabelText('Dung lượng tối đa mỗi tệp (MB)'), { target: { value: '1024' } });
    save();
    const { fields } = await savedPayload();
    expect(fields[1].fileConfig.maxBytes).toBe(1024 * MB);
  });

  it.each([
    ['dung lượng 0', 'Dung lượng tối đa mỗi tệp (MB)', '0', 'Dung lượng tối đa mỗi tệp phải từ 1 MB đến 1024 MB'],
    ['dung lượng 1025', 'Dung lượng tối đa mỗi tệp (MB)', '1025', 'Dung lượng tối đa mỗi tệp phải từ 1 MB đến 1024 MB'],
    ['dung lượng rỗng', 'Dung lượng tối đa mỗi tệp (MB)', '', 'Dung lượng tối đa mỗi tệp phải từ 1 MB đến 1024 MB'],
    ['0 tệp', 'Số tệp tối đa', '0', 'Số tệp tối đa phải từ 1 đến 10'],
    ['11 tệp', 'Số tệp tối đa', '11', 'Số tệp tối đa phải từ 1 đến 10'],
    ['2,5 tệp', 'Số tệp tối đa', '2.5', 'Số tệp tối đa phải từ 1 đến 10'],
  ])('kiểm phía trình soạn: %s → báo lỗi, KHÔNG gọi API lưu', async (_name, label, value, message) => {
    await renderEdit(FORM);
    selectFieldRow(1);
    fireEvent.change(panel().getByLabelText(label), { target: { value } });
    save();
    await waitFor(() => expect(screen.getAllByText(message).length).toBeGreaterThan(0));
    expect(formAdminApi.updateForm).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(message);
  });

  it('bỏ hết nhóm loại → báo "Chọn ít nhất một loại tệp được nhận", không lưu', async () => {
    await renderEdit(FORM);
    selectFieldRow(1);
    fireEvent.click(panel().getByLabelText(/PDF/));
    fireEvent.click(panel().getByLabelText(/Word/));
    save();
    await waitFor(() => expect(screen.getAllByText('Chọn ít nhất một loại tệp được nhận').length).toBeGreaterThan(0));
    expect(formAdminApi.updateForm).not.toHaveBeenCalled();
  });

  it('đổi trường thường sang "Tải tệp" bằng ô chọn loại → có cấu hình mặc định; đổi ngược lại → payload không còn fileConfig', async () => {
    await renderEdit(PLAIN_FORM);
    selectFieldRow(0);
    fireEvent.change(screen.getByLabelText('Kiểu dữ liệu'), { target: { value: 'file' } });
    expect(screen.getByTestId('file-config-panel')).toBeInTheDocument();
    expect(panel().getByLabelText('Số tệp tối đa')).toHaveValue(1);

    fireEvent.change(screen.getByLabelText('Kiểu dữ liệu'), { target: { value: 'short_text' } });
    expect(screen.queryByTestId('file-config-panel')).not.toBeInTheDocument();
    save();
    const { fields } = await savedPayload();
    expect(fields[0]).not.toHaveProperty('fileConfig');
  });

  it('nhân bản trường tệp: bản sao có cấu hình riêng (sửa bản sao không đổi bản gốc)', async () => {
    await renderEdit(FORM);
    fireEvent.click(within(fieldRow(1)).getByRole('button', { name: 'Nhân bản trường' }));
    // Bản sao được chọn sẵn ở hàng 2.
    fireEvent.change(panel().getByLabelText('Số tệp tối đa'), { target: { value: '7' } });
    save();
    const { fields } = await savedPayload();
    expect(fields[1].fileConfig.maxFiles).toBe(3);
    expect(fields[2].fileConfig.maxFiles).toBe(7);
    expect(fields[2]).not.toHaveProperty('key');
  });

  it('bài lưu thất bại FILE_UPLOAD_DISABLED từ server hiện thông báo của server (cờ vừa tắt giữa chừng)', async () => {
    await renderEdit(PLAIN_FORM);
    openMoreTypes();
    fireEvent.click(within(screen.getByTestId('form-more-field-types')).getByRole('button', { name: 'Tải tệp' }));
    formAdminApi.updateForm.mockRejectedValue({
      response: { data: { message: 'Tính năng nhận tệp từ khách chưa được bật. Vui lòng bỏ trường tải tệp khỏi biểu mẫu.' } },
    });
    save();
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.error.mock.calls.flat().join(' ')).toMatch(/chưa được bật/);
  });

  it('xem trước vẽ ô chọn tệp theo cấu hình đang soạn (khoá, không tải thật)', async () => {
    await renderEdit(FORM);
    const input = previewPane().getByLabelText(/Hồ sơ xin việc/);
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute('accept', '.pdf,.doc,.docx');
    expect(previewPane().getByText(/tối đa 25 MB mỗi tệp · tối đa 3 tệp/)).toBeInTheDocument();

    selectFieldRow(1);
    fireEvent.change(panel().getByLabelText('Dung lượng tối đa mỗi tệp (MB)'), { target: { value: '8' } });
    expect(previewPane().getByText(/tối đa 8 MB mỗi tệp/)).toBeInTheDocument();
  });

  it('xem trước với cờ TẮT: thay ô tệp bằng câu "tạm chưa nhận tệp" (đúng cái khách sẽ thấy)', async () => {
    await renderEdit(FORM, { fileUploadsEnabled: false });
    expect(previewPane().getByText(/Hiện tạm chưa nhận tệp đính kèm/)).toBeInTheDocument();
  });
});
