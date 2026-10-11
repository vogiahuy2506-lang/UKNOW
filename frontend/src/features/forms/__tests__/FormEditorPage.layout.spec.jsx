import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import toast from 'react-hot-toast';
import { I18nProvider } from '../../../i18n';
import FormEditorPage from '../pages/FormEditorPage';
import * as formAdminApi from '../services/formAdminApi.service';
import { openSettingsTab, fieldRow, selectFieldRow } from './formEditorTestUtils';

/**
 * Bố cục trình soạn MỚI (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, PR-3): danh sách trường bên trái (kéo-thả, nút
 * lên/xuống, nhân bản), bảng thuộc tính (placeholder, chữ hướng dẫn), xem trước SỐNG cố định bên phải (Máy tính / Điện thoại),
 * lời đồng ý tuỳ chỉnh trong Cài đặt. Payload khi Lưu của các luồng cũ do FormEditorPage.payload.contract.spec.jsx giữ.
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
  id: 'form-layout-1',
  publicKey: 'pub-layout-1',
  title: 'Biểu mẫu thử bố cục',
  description: '',
  isPublished: false,
  fields: [
    { key: 'f_name', label: 'Họ và tên', type: 'short_text', required: true, role: 'name' },
    { key: 'f_mail', label: 'Email', type: 'email', required: true, role: 'email' },
    { key: 'f_city', label: 'Thành phố', type: 'select', required: false, role: '', options: ['Hà Nội', 'Đà Nẵng'] },
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
  const utils = render(
    <MemoryRouter initialEntries={[`/app/forms/${form.id}/edit`]}>
      <I18nProvider>
        <Routes>
          <Route path="/app/forms/:id/edit" element={<FormEditorPage />} />
        </Routes>
      </I18nProvider>
    </MemoryRouter>
  );
  await waitFor(() => expect(screen.getByDisplayValue(form.title)).toBeInTheDocument());
  return utils;
}

function renderCreateBlank() {
  const utils = render(
    <MemoryRouter initialEntries={['/app/forms/new']}>
      <I18nProvider>
        <Routes>
          <Route path="/app/forms/new" element={<FormEditorPage />} />
        </Routes>
      </I18nProvider>
    </MemoryRouter>
  );
  fireEvent.click(screen.getByTestId('form-template-blank'));
  return utils;
}

const save = () => fireEvent.click(screen.getByRole('button', { name: /Lưu biểu mẫu/i }));
const savedPayload = async () => {
  await waitFor(() => expect(formAdminApi.updateForm).toHaveBeenCalledTimes(1));
  return formAdminApi.updateForm.mock.calls[0][1];
};
const rowHeader = (idx) =>
  within(fieldRow(idx)).getByRole('button', { name: new RegExp(`^Trường #${idx + 1}:`) }).closest('[draggable="true"]');
const preview = () => within(screen.getByTestId('form-preview-pane'));

describe('FormEditorPage — bố cục soạn + xem trước sống (PR-3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockAuthState = { user: null, activeContext: { type: 'self' } };
  });

  // ───────────────────────────────────── Bố cục ─────────────────────────────────────

  it('hai cột ≥ lg: danh sách trường bên trái, xem trước bên phải; mỗi cột tự cuộn nên xem trước đứng yên; < lg xếp dọc, xem trước sau cùng', async () => {
    await renderEdit();

    const listPane = screen.getByTestId('form-field-list-pane');
    const previewPane = screen.getByTestId('form-preview-pane');
    const listColumn = listPane.parentElement;
    const previewColumn = previewPane.parentElement;

    // Cùng một lưới, danh sách đứng TRƯỚC xem trước (xếp dọc thì xem trước ở sau cùng)
    expect(listColumn.parentElement).toBe(previewColumn.parentElement);
    expect(listColumn.compareDocumentPosition(previewColumn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(listColumn.parentElement.className).toContain('grid-cols-1');
    expect(listColumn.parentElement.className).toContain('lg:grid-cols-2');
    // Mỗi cột tự cuộn ở màn rộng, vùng ngoài không cuộn → xem trước không trôi theo danh sách trường
    expect(listColumn.className).toContain('lg:overflow-y-auto');
    expect(previewColumn.className).toContain('lg:overflow-y-auto');
    expect(listColumn.parentElement.parentElement.className).toContain('lg:overflow-hidden');
  });

  it('thanh trên gọn: nút quay lại, ô tên biểu mẫu, Cài đặt, Chia sẻ, Bài nộp, Xuất bản, Lưu — các khối cũ KHÔNG còn xếp dọc trong trang', async () => {
    await renderEdit({ ...FORM, submissionCount: 3 });

    const bar = within(screen.getByTestId('form-editor-topbar'));
    expect(bar.getByRole('button', { name: 'Quay lại danh sách biểu mẫu' })).toBeInTheDocument();
    expect(bar.getByDisplayValue(FORM.title)).toBeInTheDocument();
    expect(bar.getByRole('button', { name: 'Cài đặt' })).toBeInTheDocument();
    expect(bar.getByText('Chia sẻ & QR')).toBeInTheDocument();
    expect(bar.getByText('Bài nộp (3)')).toBeInTheDocument();
    expect(bar.getByRole('button', { name: 'Xuất bản' })).toBeInTheDocument();
    expect(bar.getByRole('button', { name: /Lưu biểu mẫu/ })).toBeInTheDocument();

    // Không còn khối cấu hình nào nằm sẵn trong trang
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Mẫu dựng sẵn')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Bật thanh toán/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Bật đặt lịch hẹn/i })).not.toBeInTheDocument();
  });

  it('modal Cài đặt có đủ 6 tab: Thông tin chung · Sau khi gửi · Đặt lịch hẹn · Thanh toán · Giao diện · Sản phẩm', async () => {
    await renderEdit();
    fireEvent.click(screen.getByRole('button', { name: 'Cài đặt' }));
    const dialog = within(screen.getByRole('dialog'));
    for (const name of ['Thông tin chung', 'Sau khi gửi', 'Đặt lịch hẹn', 'Thanh toán', 'Giao diện', 'Sản phẩm']) {
      expect(dialog.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('chỉ trường đang chọn có bảng thuộc tính; bấm hàng khác thì bảng chuyển sang trường đó', async () => {
    await renderEdit();

    expect(screen.getAllByTestId('field-properties-panel')).toHaveLength(1);
    expect(within(fieldRow(0)).getByTestId('field-properties-panel')).toBeInTheDocument();

    selectFieldRow(2);
    expect(screen.getAllByTestId('field-properties-panel')).toHaveLength(1);
    expect(within(fieldRow(2)).getByTestId('field-properties-panel')).toBeInTheDocument();
    expect(within(fieldRow(0)).queryByTestId('field-properties-panel')).not.toBeInTheDocument();
    expect(within(fieldRow(2)).getByDisplayValue('Thành phố')).toBeInTheDocument();
  });

  // ──────────────────────────────── Đổi thứ tự ────────────────────────────────

  it('kéo-thả: kéo trường 1 thả lên trường 3 → thứ tự mới nằm trong payload, key giữ nguyên', async () => {
    await renderEdit();

    fireEvent.dragStart(rowHeader(0));
    fireEvent.dragOver(fieldRow(2));
    fireEvent.drop(fieldRow(2));
    fireEvent.dragEnd(rowHeader(0));

    // Danh sách trên màn hình đổi ngay
    expect(within(fieldRow(0)).getByRole('button', { name: /^Trường #1: Email/ })).toBeInTheDocument();
    expect(within(fieldRow(2)).getByRole('button', { name: /^Trường #3: Họ và tên/ })).toBeInTheDocument();

    save();
    const payload = await savedPayload();
    expect(payload.fields.map((f) => f.key)).toEqual(['f_mail', 'f_city', 'f_name']);
  });

  it('kéo-thả: kéo trường 3 thả lên trường 1 → trường 3 lên đầu; thả vào chính nó hoặc kéo ra ngoài thì KHÔNG đổi gì', async () => {
    await renderEdit();

    // Thả vào chính nó
    fireEvent.dragStart(rowHeader(1));
    fireEvent.dragOver(fieldRow(1));
    fireEvent.drop(fieldRow(1));
    // Kéo rồi huỷ (dragEnd không có drop)
    fireEvent.dragStart(rowHeader(0));
    fireEvent.dragEnd(rowHeader(0));
    // Thả mà không có phiên kéo nào (vd kéo tệp từ ngoài vào)
    fireEvent.drop(fieldRow(0));

    fireEvent.dragStart(rowHeader(2));
    fireEvent.dragOver(fieldRow(0));
    fireEvent.drop(fieldRow(0));

    save();
    const payload = await savedPayload();
    expect(payload.fields.map((f) => f.key)).toEqual(['f_city', 'f_name', 'f_mail']);
  });

  it('nút lên/xuống (bàn phím, cảm ứng) vẫn đổi thứ tự trong payload; nút lên ở đầu và xuống ở cuối bị khoá', async () => {
    await renderEdit();

    expect(within(fieldRow(0)).getByTitle('Di chuyển lên')).toBeDisabled();
    expect(within(fieldRow(2)).getByTitle('Di chuyển xuống')).toBeDisabled();

    fireEvent.click(within(fieldRow(2)).getByTitle('Di chuyển lên')); // city lên giữa
    fireEvent.click(within(fieldRow(0)).getByTitle('Di chuyển xuống')); // name xuống sau city

    save();
    const payload = await savedPayload();
    expect(payload.fields.map((f) => f.key)).toEqual(['f_city', 'f_name', 'f_mail']);
  });

  // ──────────────────────────────── Nhân bản trường ────────────────────────────────

  it('nhân bản: bản sao chèn NGAY DƯỚI, key rỗng (server tự sinh), KHÔNG nhân bản vai trò, được chọn sẵn; bản gốc giữ key + vai trò', async () => {
    await renderEdit();

    fireEvent.click(within(fieldRow(0)).getByTitle('Nhân bản trường'));

    expect(within(fieldRow(1)).getByRole('button', { name: /^Trường #2: Họ và tên/ })).toBeInTheDocument();
    expect(fieldRow(1)).toHaveAttribute('data-selected', 'true');
    expect(fieldRow(0)).toHaveAttribute('data-selected', 'false');
    // Bản sao không mang vai trò
    expect(within(fieldRow(1)).getByLabelText('Vai trò định danh')).toHaveValue('');

    save();
    const payload = await savedPayload();
    expect(payload.fields).toHaveLength(4);
    expect(payload.fields[0]).toEqual({ key: 'f_name', label: 'Họ và tên', type: 'short_text', required: true, role: 'name' });
    expect(payload.fields[1]).toEqual({ label: 'Họ và tên', type: 'short_text', required: true });
    expect(payload.fields[1]).not.toHaveProperty('key');
    expect(payload.fields[1]).not.toHaveProperty('role');
    expect(payload.fields.slice(2).map((f) => f.key)).toEqual(['f_mail', 'f_city']);
  });

  it('nhân bản trường có lựa chọn: bản sao sửa lựa chọn không làm đổi bản gốc', async () => {
    await renderEdit();

    fireEvent.click(within(fieldRow(2)).getByTitle('Nhân bản trường'));
    fireEvent.change(within(fieldRow(3)).getAllByPlaceholderText('Nhập lựa chọn...')[0], { target: { value: 'Huế' } });

    save();
    const payload = await savedPayload();
    expect(payload.fields[2]).toMatchObject({ key: 'f_city', options: ['Hà Nội', 'Đà Nẵng'] });
    expect(payload.fields[3]).toMatchObject({ label: 'Thành phố', type: 'select', options: ['Huế', 'Đà Nẵng'] });
    expect(payload.fields[3]).not.toHaveProperty('key');
  });

  it('đã đủ 30 trường: nhân bản bị chặn với thông báo, danh sách không đổi', async () => {
    const many = {
      ...FORM,
      fields: Array.from({ length: 30 }, (_, i) => ({ key: `f_${i}`, label: `Câu ${i + 1}`, type: 'short_text', required: false })),
    };
    await renderEdit(many);

    fireEvent.click(within(fieldRow(0)).getByTitle('Nhân bản trường'));

    expect(toast.error).toHaveBeenCalledWith('Mỗi biểu mẫu tối đa 30 trường thông tin');
    expect(screen.queryByTestId('field-row-30')).not.toBeInTheDocument();
  });

  it('xoá trường đang chọn: chọn sang trường kế bên; xoá hết thì hiện chỗ trống hướng dẫn', async () => {
    await renderEdit();

    fireEvent.click(within(fieldRow(0)).getByTitle('Xoá trường'));
    expect(fieldRow(0)).toHaveAttribute('data-selected', 'true');
    expect(within(fieldRow(0)).getByPlaceholderText(/Ví dụ: Họ và tên/i)).toHaveValue('Email');

    fireEvent.click(within(fieldRow(0)).getByTitle('Xoá trường'));
    fireEvent.click(within(fieldRow(0)).getByTitle('Xoá trường'));
    expect(screen.queryByTestId('field-row-0')).not.toBeInTheDocument();
    expect(screen.getByText(/Chưa có trường nào/)).toBeInTheDocument();
  });

  // ────────────────────── placeholder · chữ hướng dẫn · lời đồng ý ──────────────────────

  it('placeholder + chữ hướng dẫn nhập ở bảng thuộc tính → vào payload (đã trim) và hiện ngay ở xem trước', async () => {
    await renderEdit();

    fireEvent.change(within(fieldRow(0)).getByLabelText(/Gợi ý trong ô nhập/), { target: { value: '  Nguyễn Văn A  ' } });
    fireEvent.change(within(fieldRow(0)).getByLabelText(/Chữ hướng dẫn dưới tên trường/), {
      target: { value: '  Ghi đúng như trên CMND  ' },
    });

    // Xem trước sống
    expect(preview().getByPlaceholderText('Nguyễn Văn A')).toBeInTheDocument();
    expect(preview().getByText('Ghi đúng như trên CMND')).toBeInTheDocument();

    save();
    const payload = await savedPayload();
    expect(payload.fields[0]).toEqual({
      key: 'f_name',
      label: 'Họ và tên',
      type: 'short_text',
      required: true,
      role: 'name',
      placeholder: 'Nguyễn Văn A',
      helpText: 'Ghi đúng như trên CMND',
    });
    // Trường khác không bị thêm khoá
    expect(payload.fields[1]).not.toHaveProperty('placeholder');
    expect(payload.fields[1]).not.toHaveProperty('helpText');
  });

  it('chỉ có khoảng trắng → KHÔNG gửi placeholder / chữ hướng dẫn (payload y như trước)', async () => {
    await renderEdit();

    fireEvent.change(within(fieldRow(0)).getByLabelText(/Gợi ý trong ô nhập/), { target: { value: '   ' } });
    fireEvent.change(within(fieldRow(0)).getByLabelText(/Chữ hướng dẫn dưới tên trường/), { target: { value: '  ' } });

    save();
    const payload = await savedPayload();
    expect(payload.fields[0]).toEqual({ key: 'f_name', label: 'Họ và tên', type: 'short_text', required: true, role: 'name' });
  });

  it('placeholder chỉ có với loại có ô nhập chữ: loại select không có ô nhập; đổi loại sang select thì placeholder cũ không được gửi', async () => {
    await renderEdit();

    // Trường 3 là select → không có ô placeholder, vẫn có ô chữ hướng dẫn
    selectFieldRow(2);
    expect(within(fieldRow(2)).queryByLabelText(/Gợi ý trong ô nhập/)).not.toBeInTheDocument();
    expect(within(fieldRow(2)).getByLabelText(/Chữ hướng dẫn dưới tên trường/)).toBeInTheDocument();

    // Trường 1: gõ placeholder rồi đổi loại sang select
    selectFieldRow(0);
    fireEvent.change(within(fieldRow(0)).getByLabelText(/Gợi ý trong ô nhập/), { target: { value: 'Gõ gì đó' } });
    fireEvent.change(within(fieldRow(0)).getByLabelText('Kiểu dữ liệu'), { target: { value: 'select' } });
    expect(within(fieldRow(0)).queryByLabelText(/Gợi ý trong ô nhập/)).not.toBeInTheDocument();

    save();
    const payload = await savedPayload();
    expect(payload.fields[0]).not.toHaveProperty('placeholder');
    expect(payload.fields[0].type).toBe('select');
  });

  it('SỬA: placeholder / chữ hướng dẫn / lời đồng ý đã lưu được nạp lên và gửi lại nguyên vẹn khi Lưu (không mất dữ liệu)', async () => {
    await renderEdit({
      ...FORM,
      fields: [
        { key: 'f_name', label: 'Họ và tên', type: 'short_text', required: true, role: 'name', placeholder: 'Nguyễn Văn A', helpText: 'Ghi đúng CMND' },
        { key: 'f_city', label: 'Thành phố', type: 'select', required: false, options: ['Hà Nội'], helpText: 'Chọn nơi ở' },
      ],
      settings: { ...FORM.settings, consentEnabled: true, consentText: 'Tôi đồng ý nhận tin từ Công ty A.' },
    });

    save();
    const payload = await savedPayload();
    expect(payload.fields).toEqual([
      { key: 'f_name', label: 'Họ và tên', type: 'short_text', required: true, role: 'name', placeholder: 'Nguyễn Văn A', helpText: 'Ghi đúng CMND' },
      { key: 'f_city', label: 'Thành phố', type: 'select', required: false, options: ['Hà Nội'], helpText: 'Chọn nơi ở' },
    ]);
    expect(payload.settings).toEqual({
      notifyOwner: true,
      consentEnabled: true,
      sendConfirmation: false,
      submitButtonText: 'Gửi',
      successMessage: 'Cảm ơn',
      redirectUrl: null,
      consentText: 'Tôi đồng ý nhận tin từ Công ty A.',
    });
  });

  it('lời đồng ý tuỳ chỉnh: chỉ có ô nhập khi bật ô đồng ý; nhập → vào payload (đã trim) + hiện ở xem trước; xoá hết → vắng khoá', async () => {
    await renderEdit();

    openSettingsTab('afterSubmit');
    expect(screen.queryByLabelText('Lời đồng ý hiển thị cho khách')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bật ô đồng ý nhận thông tin tiếp thị (Marketing Consent)' }));

    const consentInput = screen.getByLabelText('Lời đồng ý hiển thị cho khách');
    fireEvent.change(consentInput, { target: { value: '  Tôi đồng ý nhận ưu đãi từ Công ty A.  ' } });
    expect(preview().getByText('Tôi đồng ý nhận ưu đãi từ Công ty A.')).toBeInTheDocument();

    save();
    const payload = await savedPayload();
    expect(payload.settings.consentEnabled).toBe(true);
    expect(payload.settings.consentText).toBe('Tôi đồng ý nhận ưu đãi từ Công ty A.');
  });

  it('lời đồng ý rỗng → payload KHÔNG có khoá consentText (renderer dùng câu mặc định)', async () => {
    await renderEdit({ ...FORM, settings: { ...FORM.settings, consentEnabled: true, consentText: 'Cũ' } });

    openSettingsTab('afterSubmit');
    fireEvent.change(screen.getByLabelText('Lời đồng ý hiển thị cho khách'), { target: { value: '   ' } });

    save();
    const payload = await savedPayload();
    expect(payload.settings).not.toHaveProperty('consentText');
    expect(payload.settings.consentEnabled).toBe(true);
  });

  it('validate: chữ hướng dẫn > 300 ký tự chặn lưu và chọn đúng trường lỗi; lời đồng ý > 500 ký tự chặn lưu và mở tab Sau khi gửi', async () => {
    await renderEdit();

    selectFieldRow(1);
    fireEvent.change(within(fieldRow(1)).getByLabelText(/Chữ hướng dẫn dưới tên trường/), { target: { value: 'a'.repeat(301) } });
    selectFieldRow(0);
    save();
    expect(formAdminApi.updateForm).not.toHaveBeenCalled();
    expect(fieldRow(1)).toHaveAttribute('data-selected', 'true');
    expect(screen.getByText('Chữ hướng dẫn không được vượt quá 300 ký tự')).toBeInTheDocument();

    fireEvent.change(within(fieldRow(1)).getByLabelText(/Chữ hướng dẫn dưới tên trường/), { target: { value: 'ok' } });
    openSettingsTab('afterSubmit');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bật ô đồng ý nhận thông tin tiếp thị (Marketing Consent)' }));
    fireEvent.change(screen.getByLabelText('Lời đồng ý hiển thị cho khách'), { target: { value: 'c'.repeat(501) } });
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    save();
    expect(formAdminApi.updateForm).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Lời đồng ý không được vượt quá 500 ký tự')).toBeInTheDocument();
  });

  // ───────────────────────────────────── Xem trước ─────────────────────────────────────

  it('xem trước dựng từ bản NHÁP: gõ nhãn / đổi tiêu đề / thêm trường là thấy ngay, chưa cần Lưu', async () => {
    await renderEdit();

    expect(preview().getByRole('heading', { name: FORM.title })).toBeInTheDocument();
    expect(preview().getByLabelText(/Họ và tên/)).toBeInTheDocument();

    fireEvent.change(within(fieldRow(0)).getByPlaceholderText(/Ví dụ: Họ và tên/i), { target: { value: 'Tên đầy đủ' } });
    fireEvent.change(screen.getByDisplayValue(FORM.title), { target: { value: 'Tiêu đề nháp mới' } });
    fireEvent.click(screen.getByRole('button', { name: /Thêm trường/i }));

    expect(preview().getByLabelText(/Tên đầy đủ/)).toBeInTheDocument();
    expect(preview().getByRole('heading', { name: 'Tiêu đề nháp mới' })).toBeInTheDocument();
    expect(preview().getByLabelText(/Trường mới 4/)).toBeInTheDocument();
    expect(formAdminApi.updateForm).not.toHaveBeenCalled();
  });

  it('xem trước hiện ô đồng ý THEO cài đặt thật: tắt thì không có, bật thì có (không còn ép consentEnabled:false)', async () => {
    await renderEdit();

    expect(preview().queryByRole('checkbox')).not.toBeInTheDocument();

    openSettingsTab('afterSubmit');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bật ô đồng ý nhận thông tin tiếp thị (Marketing Consent)' }));
    expect(preview().getByRole('checkbox')).toBeInTheDocument();
    expect(preview().getByText('Tôi đồng ý nhận thông tin tư vấn và ưu đãi tiếp thị.')).toBeInTheDocument();
  });

  it('xem trước hiện bộ chọn lịch khi bật đặt lịch (từ state nháp), ẩn khi tắt', async () => {
    await renderEdit();

    expect(preview().queryByText('Chọn ngày và giờ hẹn')).not.toBeInTheDocument();

    openSettingsTab('booking');
    fireEvent.click(screen.getByRole('checkbox', { name: /Bật đặt lịch hẹn/i }));
    expect(preview().getByText('Chọn ngày và giờ hẹn')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /Bật đặt lịch hẹn/i }));
    expect(preview().queryByText('Chọn ngày và giờ hẹn')).not.toBeInTheDocument();
  });

  it('xem trước đổi theo giao diện nháp: màu chủ đạo → nút gửi, nền khung xem trước theo màu nền', async () => {
    await renderEdit();

    openSettingsTab('theme');
    fireEvent.click(screen.getByRole('button', { name: /Tươi mới/i }));

    const rendererRoot = screen.getByTestId('form-preview-frame').firstElementChild;
    expect(rendererRoot.style.getPropertyValue('--form-primary')).toBe('#16A34A');
    expect(screen.getByTestId('form-preview-canvas').style.backgroundColor).toBe('rgb(240, 253, 244)');
  });

  it('xem trước KHÔNG gửi bài thật: nút gửi bị khoá, bấm / submit không gọi API nào', async () => {
    await renderEdit();

    const submitBtn = preview().getByRole('button', { name: 'Gửi' });
    expect(submitBtn).toBeDisabled();
    fireEvent.click(submitBtn);
    fireEvent.submit(submitBtn.closest('form'));

    expect(formAdminApi.createForm).not.toHaveBeenCalled();
    expect(formAdminApi.updateForm).not.toHaveBeenCalled();
    expect(formAdminApi.publishForm).not.toHaveBeenCalled();
  });

  it('chuyển Máy tính / Điện thoại: khung xem trước đổi sang rộng 390px rồi trở lại', async () => {
    await renderEdit();

    const frame = screen.getByTestId('form-preview-frame');
    expect(frame).toHaveAttribute('data-device', 'desktop');
    expect(frame.style.width).toBe('');

    fireEvent.click(screen.getByRole('tab', { name: 'Điện thoại' }));
    expect(screen.getByTestId('form-preview-frame')).toHaveAttribute('data-device', 'mobile');
    expect(screen.getByTestId('form-preview-frame').style.width).toBe('390px');
    expect(screen.getByTestId('form-preview-frame').style.maxWidth).toBe('100%');
    expect(screen.getByRole('tab', { name: 'Điện thoại' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByRole('tab', { name: 'Máy tính' }));
    expect(screen.getByTestId('form-preview-frame')).toHaveAttribute('data-device', 'desktop');
  });

  // ─────────────────────────────────── Mẫu bật sẵn tính năng ───────────────────────────────────

  it('chọn mẫu "Trống": không có gợi ý khai thêm; mẫu Đặt lịch: gợi ý dẫn thẳng tới tab Đặt lịch hẹn, ẩn được', async () => {
    const { unmount } = renderCreateBlank();
    expect(screen.queryByTestId('form-setup-hints')).not.toBeInTheDocument();
    unmount();

    render(
      <MemoryRouter initialEntries={['/app/forms/new']}>
        <I18nProvider>
          <Routes>
            <Route path="/app/forms/new" element={<FormEditorPage />} />
          </Routes>
        </I18nProvider>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByTestId('form-template-booking'));

    const hints = within(screen.getByTestId('form-setup-hints'));
    fireEvent.click(hints.getByRole('button', { name: 'Khai khung giờ đặt lịch' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Bật đặt lịch hẹn/i })).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    fireEvent.click(hints.getByRole('button', { name: 'Ẩn gợi ý' }));
    expect(screen.queryByTestId('form-setup-hints')).not.toBeInTheDocument();
  });

  // ─────────────────────────────────── Quyền (nhân viên) ───────────────────────────────────

  it('nhân viên: tab Thanh toán chỉ đọc (công tắc khoá, có câu giải thích), các tab khác sửa được bình thường', async () => {
    mockAuthState = { user: { id: 9 }, activeContext: { type: 'employee' } };
    await renderEdit({
      ...FORM,
      paymentConfig: { enabled: true, methods: ['bank'], method: 'bank', amount: 100000, bankBin: '970436', accountNumber: '0123456789', accountName: 'NGUYEN VAN A', holdMinutes: 30 },
    });

    openSettingsTab('payment');
    expect(screen.getByRole('checkbox', { name: /Bật thanh toán/i })).toBeDisabled();
    expect(screen.getByText(/Chỉ chủ tài khoản đổi được thông tin nhận tiền/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Vd: 150.000')).toBeDisabled();

    openSettingsTab('afterSubmit');
    expect(screen.getByDisplayValue('Gửi')).not.toBeDisabled();
    openSettingsTab('theme');
    expect(screen.getByText('Mẫu dựng sẵn')).toBeInTheDocument();
  });

  it('chuyển qua lại giữa các tab không làm mất dữ liệu đã nhập ở tab trước', async () => {
    await renderEdit();

    openSettingsTab('booking');
    fireEvent.click(screen.getByRole('checkbox', { name: /Bật đặt lịch hẹn/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /Thêm khung giờ/i })[0]);
    fireEvent.change(screen.getByRole('dialog').querySelector('input[type="time"]'), { target: { value: '08:30' } });

    openSettingsTab('product');
    openSettingsTab('booking');
    expect(screen.getByRole('checkbox', { name: /Bật đặt lịch hẹn/i })).toBeChecked();
    expect(screen.getByDisplayValue('08:30')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    save();
    const payload = await savedPayload();
    expect(payload.bookingConfig.weeklySlots['1']).toEqual(['08:30']);
  });
});
