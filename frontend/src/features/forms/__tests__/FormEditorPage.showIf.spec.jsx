import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import toast from 'react-hot-toast';
import { I18nProvider } from '../../../i18n';
import FormEditorPage from '../pages/FormEditorPage';
import * as formAdminApi from '../services/formAdminApi.service';
import { fieldRow, selectFieldRow } from './formEditorTestUtils';

/**
 * PR-8a (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11): mục "Điều kiện hiển thị" trong bảng thuộc tính của trình soạn —
 * chọn nguồn (chỉ ô nhập đứng trước), toán tử và giá trị theo loại nguồn; huy hiệu "Có điều kiện" trên hàng; xoá / đổi chỗ / đổi
 * loại ô nguồn → cảnh báo và GỠ điều kiện hỏng trước khi lưu; xem trước phản ánh logic. Payload biểu mẫu KHÔNG có điều kiện do
 * FormEditorPage.payload.contract.spec.jsx giữ (không đổi).
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

const BASE = {
  id: 'form-showif-1',
  publicKey: 'pub-showif-1',
  title: 'Biểu mẫu điều kiện',
  description: '',
  isPublished: false,
  settings: { notifyOwner: true, consentEnabled: false, sendConfirmation: false, submitButtonText: 'Gửi', successMessage: 'Cảm ơn', redirectUrl: '' },
};

const opt = (v) => ({ label: v, value: v });
const SELECT_FIELD = { key: 'f_svc', label: 'Dịch vụ', type: 'select', required: true, options: [opt('Spa'), opt('Gội đầu')] };
const NOTE_FIELD = { key: 'f_note', label: 'Chi tiết Spa', type: 'short_text', required: false, options: [] };
const NAME_FIELD = { key: 'f_name', label: 'Họ và tên', type: 'short_text', required: true, role: 'name', options: [] };

const formWith = (fields) => ({ ...BASE, fields });

async function renderEdit(form) {
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
const editor = () => within(screen.getByTestId('field-showif-editor'));
const row = (i = 0) => within(screen.getByTestId(`showif-row-${i}`));
const quickAdd = (name) => fireEvent.click(listPane().getByRole('button', { name }));
const removeFieldAt = (idx) => fireEvent.click(within(fieldRow(idx)).getByRole('button', { name: 'Xoá trường' }));
const moveDown = (idx) => fireEvent.click(within(fieldRow(idx)).getByRole('button', { name: 'Di chuyển xuống' }));

const CONDITIONAL = formWith([
  NAME_FIELD,
  SELECT_FIELD,
  { ...NOTE_FIELD, showIf: { match: 'all', conditions: [{ fieldKey: 'f_svc', operator: 'equals', value: 'Spa' }] } },
]);

describe('FormEditorPage — Điều kiện hiển thị (PR-8a)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockAuthState = { user: null, activeContext: { type: 'self' } };
  });

  it('nạp biểu mẫu có điều kiện: huy hiệu "Có điều kiện" trên đúng hàng, bảng thuộc tính hiện nguồn / toán tử / giá trị đã lưu', async () => {
    await renderEdit(CONDITIONAL);
    expect(within(fieldRow(2)).getByTestId('field-showif-badge-2')).toHaveTextContent('Có điều kiện');
    expect(screen.queryByTestId('field-showif-badge-0')).not.toBeInTheDocument();
    expect(screen.queryByTestId('field-showif-badge-1')).not.toBeInTheDocument();

    selectFieldRow(2);
    expect(row().getByLabelText('Câu hỏi')).toHaveDisplayValue('Dịch vụ');
    expect(row().getByLabelText('Điều kiện')).toHaveDisplayValue('là');
    expect(row().getByLabelText('Giá trị')).toHaveDisplayValue('Spa');
  });

  // Review PR-8a 12/10: ô mang vai trò định danh (tên/email/SĐT) bị đặt điều kiện ẩn → cảnh báo bài nộp có thể thiếu thông tin liên hệ.
  it('ô có vai trò định danh mà có điều kiện hiển thị → hiện cảnh báo thiếu thông tin liên hệ; ô thường có điều kiện → không cảnh báo', async () => {
    await renderEdit(formWith([
      SELECT_FIELD,
      { key: 'f_phone', label: 'Số điện thoại', type: 'phone', required: false, role: 'phone', options: [], showIf: { match: 'all', conditions: [{ fieldKey: 'f_svc', operator: 'equals', value: 'Spa' }] } },
      { ...NOTE_FIELD, showIf: { match: 'all', conditions: [{ fieldKey: 'f_svc', operator: 'equals', value: 'Spa' }] } },
    ]));
    selectFieldRow(1);
    expect(screen.getByTestId('showif-role-warning')).toHaveTextContent('thông tin liên hệ');
    selectFieldRow(2);
    expect(screen.queryByTestId('showif-role-warning')).not.toBeInTheDocument();
  });

  it('VÒNG TRÒN nạp → lưu: điều kiện giữ nguyên từng khoá (kể cả value dạng số của sao / số)', async () => {
    const full = formWith([
      { key: 'f_star', label: 'Điểm', type: 'rating', required: false, options: [] },
      { key: 'f_num', label: 'Số người', type: 'number', required: false, options: [] },
      { key: 'f_yn', label: 'Có xe?', type: 'yes_no', required: false, options: [] },
      { key: 'f_chk', label: 'Quan tâm', type: 'checkbox', required: false, options: [opt('A'), opt('B')] },
      { key: 'f_txt', label: 'Ghi chú', type: 'short_text', required: false, options: [] },
      {
        key: 'f_target',
        label: 'Ô phụ thuộc',
        type: 'short_text',
        required: false,
        options: [],
        showIf: {
          match: 'any',
          conditions: [
            { fieldKey: 'f_star', operator: 'equals', value: 4 },
            { fieldKey: 'f_num', operator: 'not_equals', value: 7.5 },
            { fieldKey: 'f_yn', operator: 'equals', value: 'no' },
            { fieldKey: 'f_chk', operator: 'contains', value: 'B' },
            { fieldKey: 'f_txt', operator: 'not_answered' },
          ],
        },
      },
    ]);
    await renderEdit(full);
    save();
    const { fields } = await savedPayload();
    expect(fields[5].showIf).toEqual({
      match: 'any',
      conditions: [
        { fieldKey: 'f_star', operator: 'equals', value: 4 },
        { fieldKey: 'f_num', operator: 'not_equals', value: 7.5 },
        { fieldKey: 'f_yn', operator: 'equals', value: 'no' },
        { fieldKey: 'f_chk', operator: 'contains', value: 'B' },
        { fieldKey: 'f_txt', operator: 'not_answered' },
      ],
    });
    // các trường không có điều kiện KHÔNG có khoá showIf
    for (const f of fields.slice(0, 5)) expect(f).not.toHaveProperty('showIf');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('lựa chọn nguồn có nhãn khác giá trị (tạo qua API): điều kiện nạp theo NHÃN nên không bị coi là hỏng; lưu thì options và điều kiện cùng dùng nhãn', async () => {
    await renderEdit(
      formWith([
        { key: 'f_svc', label: 'Dịch vụ', type: 'select', required: false, options: [{ label: 'Dịch vụ A', value: 'srv_a' }, { label: 'Dịch vụ B', value: 'srv_b' }] },
        { ...NOTE_FIELD, showIf: { match: 'all', conditions: [{ fieldKey: 'f_svc', operator: 'equals', value: 'srv_b' }] } },
      ])
    );
    expect(within(fieldRow(1)).getByTestId('field-showif-badge-1')).toHaveTextContent('Có điều kiện');
    selectFieldRow(1);
    expect(row().getByLabelText('Giá trị')).toHaveDisplayValue('Dịch vụ B');
    save();
    const { fields } = await savedPayload();
    expect(fields[0].options).toEqual(['Dịch vụ A', 'Dịch vụ B']);
    expect(fields[1].showIf.conditions[0]).toEqual({ fieldKey: 'f_svc', operator: 'equals', value: 'Dịch vụ B' });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('thêm điều kiện: nguồn mặc định là ô đứng liền trước, toán tử đầu tiên, giá trị là lựa chọn đầu; lưu → payload showIf', async () => {
    await renderEdit(formWith([NAME_FIELD, SELECT_FIELD, NOTE_FIELD]));
    selectFieldRow(2);
    fireEvent.click(editor().getByRole('button', { name: 'Thêm điều kiện hiển thị' }));
    expect(row().getByLabelText('Câu hỏi')).toHaveDisplayValue('Dịch vụ');
    expect(row().getByLabelText('Điều kiện')).toHaveDisplayValue('là');
    expect(row().getByLabelText('Giá trị')).toHaveDisplayValue('Spa');
    expect(within(fieldRow(2)).getByTestId('field-showif-badge-2')).toBeInTheDocument();

    fireEvent.change(row().getByLabelText('Giá trị'), { target: { value: 'Gội đầu' } });
    fireEvent.change(row().getByLabelText('Điều kiện'), { target: { value: 'not_equals' } });
    save();
    const { fields } = await savedPayload();
    expect(fields[2].showIf).toEqual({ match: 'all', conditions: [{ fieldKey: 'f_svc', operator: 'not_equals', value: 'Gội đầu' }] });
    expect(fields[1]).not.toHaveProperty('showIf');
  });

  it('nguồn chỉ gồm ô NHẬP đứng TRƯỚC (không tính ô tải tệp, khối bố cục, ô đứng sau, chính nó); ô đầu tiên không có nguồn nào', async () => {
    await renderEdit(
      formWith([
        { key: 'f_doc', label: 'Tệp đính kèm', type: 'file', required: false, options: [], fileConfig: { kinds: ['pdf'], maxBytes: 1048576, maxFiles: 1 } },
        { key: 'f_h', label: 'Tiêu đề phần', type: 'heading', required: false, options: [] },
        SELECT_FIELD,
        NOTE_FIELD,
        { key: 'f_later', label: 'Ô đứng sau', type: 'short_text', required: false, options: [] },
      ])
    );
    // hàng 3 = "Chi tiết Spa", là Trường #3 (tiêu đề phần ở hàng 1 không chiếm số)
    fireEvent.click(within(fieldRow(3)).getByRole('button', { name: /^Trường #3:/ }));
    fireEvent.click(editor().getByRole('button', { name: 'Thêm điều kiện hiển thị' }));
    const choices = within(row().getByLabelText('Câu hỏi')).getAllByRole('option').map((o) => o.textContent);
    expect(choices).toEqual(['Dịch vụ']);

    // ô đầu danh sách: chưa có câu hỏi nào đứng trên → nút thêm bị khoá + lời giải thích
    selectFieldRow(0);
    expect(screen.getByTestId('showif-no-source')).toBeInTheDocument();
    expect(editor().getByRole('button', { name: 'Thêm điều kiện hiển thị' })).toBeDisabled();
  });

  it('toán tử và ô giá trị đổi theo loại nguồn: checkbox "có chọn", có/không là dropdown, sao 1-5, số là ô nhập, văn bản chỉ đã/chưa trả lời', async () => {
    await renderEdit(
      formWith([
        { key: 'f_chk', label: 'Quan tâm', type: 'checkbox', required: false, options: [opt('A'), opt('B')] },
        { key: 'f_yn', label: 'Có xe?', type: 'yes_no', required: false, options: [] },
        { key: 'f_star', label: 'Điểm', type: 'rating', required: false, options: [] },
        { key: 'f_num', label: 'Số người', type: 'number', required: false, options: [] },
        { key: 'f_txt', label: 'Ghi chú', type: 'short_text', required: false, options: [] },
        { key: 'f_t', label: 'Ô đích', type: 'short_text', required: false, options: [] },
      ])
    );
    selectFieldRow(5);
    fireEvent.click(editor().getByRole('button', { name: 'Thêm điều kiện hiển thị' }));
    const pick = (label) => fireEvent.change(row().getByLabelText('Câu hỏi'), { target: { value: 'k:' + label } });
    const operators = () => within(row().getByLabelText('Điều kiện')).getAllByRole('option').map((o) => o.textContent);

    // mặc định: nguồn liền trước = Ghi chú (văn bản)
    expect(operators()).toEqual(['đã được trả lời', 'chưa được trả lời']);
    expect(screen.queryByLabelText('Giá trị')).not.toBeInTheDocument();

    pick('f_num');
    expect(operators()).toEqual(['là', 'không phải là', 'đã được trả lời', 'chưa được trả lời']);
    expect(row().getByLabelText('Giá trị')).toHaveAttribute('type', 'number');

    pick('f_star');
    expect(within(row().getByLabelText('Giá trị')).getAllByRole('option').map((o) => o.textContent)).toEqual(['1 sao', '2 sao', '3 sao', '4 sao', '5 sao']);

    pick('f_yn');
    expect(within(row().getByLabelText('Giá trị')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Có', 'Không']);

    pick('f_chk');
    expect(operators()).toEqual(['có chọn', 'đã được trả lời', 'chưa được trả lời']);
    expect(within(row().getByLabelText('Giá trị')).getAllByRole('option').map((o) => o.textContent)).toEqual(['A', 'B']);

    // đổi sang "đã được trả lời" thì ô giá trị biến mất; payload không có value
    fireEvent.change(row().getByLabelText('Điều kiện'), { target: { value: 'answered' } });
    expect(screen.queryByLabelText('Giá trị')).not.toBeInTheDocument();
    save();
    return savedPayload().then(({ fields }) => {
      expect(fields[5].showIf).toEqual({ match: 'all', conditions: [{ fieldKey: 'f_chk', operator: 'answered' }] });
    });
  });

  it('nhiều điều kiện: chọn "tất cả / một trong"; tối đa 5 điều kiện; bỏ từng điều kiện và bỏ hết', async () => {
    await renderEdit(formWith([NAME_FIELD, SELECT_FIELD, NOTE_FIELD]));
    selectFieldRow(2);
    const add = () => fireEvent.click(editor().getByRole('button', { name: /^Thêm điều kiện/ }));
    add();
    expect(screen.queryByLabelText('Hiện ô này khi')).not.toBeInTheDocument(); // 1 điều kiện: chưa cần chọn all/any
    add();
    fireEvent.change(screen.getByLabelText('Hiện ô này khi'), { target: { value: 'any' } });
    add();
    add();
    add();
    expect(editor().getByRole('button', { name: /^Thêm điều kiện/ })).toBeDisabled();
    expect(editor().getByText('Tối đa 5 điều kiện cho mỗi ô.')).toBeInTheDocument();

    // bỏ điều kiện thứ 2
    fireEvent.click(within(screen.getByTestId('showif-row-1')).getByRole('button', { name: 'Bỏ điều kiện này' }));
    expect(screen.queryByTestId('showif-row-4')).not.toBeInTheDocument();
    save();
    const { fields } = await savedPayload();
    expect(fields[2].showIf.match).toBe('any');
    expect(fields[2].showIf.conditions).toHaveLength(4);

    fireEvent.click(editor().getByRole('button', { name: 'Bỏ hết điều kiện' }));
    expect(screen.queryByTestId('showif-row-0')).not.toBeInTheDocument();
    expect(screen.queryByTestId('field-showif-badge-2')).not.toBeInTheDocument();
  });

  it('trường MỚI (chưa có key) làm nguồn: trình soạn cấp key phía trình duyệt, gửi cùng trường nguồn và điều kiện trỏ đúng key đó', async () => {
    await renderEdit(formWith([NAME_FIELD]));
    fireEvent.click(listPane().getByRole('button', { name: 'Loại khác…' }));
    quickAdd('Trắc nghiệm đơn'); // hàng 1: ô chọn mới, chưa có key
    quickAdd('Văn bản ngắn'); // hàng 2: ô đích (đang được chọn)
    fireEvent.click(editor().getByRole('button', { name: 'Thêm điều kiện hiển thị' }));
    save();
    const { fields } = await savedPayload();
    expect(fields[1].key).toMatch(/^f_[0-9a-f]{8}$/);
    expect(fields[2]).not.toHaveProperty('key');
    expect(fields[2].showIf.conditions).toHaveLength(1);
    expect(fields[2].showIf.conditions[0]).toMatchObject({ fieldKey: fields[1].key, operator: 'equals' });
    expect(fields[2].showIf.conditions[0].value).toEqual(expect.any(String));
  });

  it('XOÁ ô nguồn: hàng đích đổi sang "Điều kiện chưa hợp lệ" + báo một lần; lưu → điều kiện bị gỡ khỏi payload kèm thông báo', async () => {
    await renderEdit(CONDITIONAL);
    removeFieldAt(1);
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error.mock.calls[0][0]).toMatch(/1 ô có điều kiện hiển thị không còn hợp lệ/);
    // ô đích nay ở hàng 1
    expect(within(fieldRow(1)).getByTestId('field-showif-badge-1')).toHaveTextContent('Điều kiện chưa hợp lệ');
    selectFieldRow(1);
    expect(screen.getByTestId('showif-issue-0')).toHaveTextContent(/đã bị xoá hoặc đang đứng phía sau/);

    toast.error.mockClear();
    save();
    const { fields } = await savedPayload();
    expect(fields.map((f) => f.key)).toEqual(['f_name', 'f_note']);
    expect(fields[1]).not.toHaveProperty('showIf');
    expect(toast.error).toHaveBeenCalledWith('Đã gỡ 1 điều kiện hiển thị không còn hợp lệ.');
    // trình soạn cũng bỏ huy hiệu sau khi gỡ
    expect(screen.queryByTestId('field-showif-badge-1')).not.toBeInTheDocument();
  });

  it('ĐỔI CHỖ: kéo ô nguồn xuống sau ô đích → điều kiện hỏng, lưu thì gỡ; đổi chỗ lại thì hết hỏng và giữ nguyên', async () => {
    await renderEdit(CONDITIONAL);
    moveDown(1); // Dịch vụ xuống sau Chi tiết Spa
    expect(within(fieldRow(1)).getByTestId('field-showif-badge-1')).toHaveTextContent('Điều kiện chưa hợp lệ');
    // đổi lại → điều kiện lại hợp lệ
    moveDown(1);
    expect(within(fieldRow(2)).getByTestId('field-showif-badge-2')).toHaveTextContent('Có điều kiện');

    moveDown(1); // hỏng lần nữa rồi lưu
    save();
    const { fields } = await savedPayload();
    expect(fields.map((f) => f.key)).toEqual(['f_name', 'f_note', 'f_svc']);
    expect(fields[1]).not.toHaveProperty('showIf');
  });

  it('ĐỔI LOẠI ô nguồn: sang văn bản (toán tử "là" không còn) → hỏng; sang Tải tệp / khối bố cục → hỏng', async () => {
    await renderEdit(CONDITIONAL);
    selectFieldRow(1);
    fireEvent.change(within(fieldRow(1)).getByLabelText('Kiểu dữ liệu'), { target: { value: 'short_text' } });
    expect(within(fieldRow(2)).getByTestId('field-showif-badge-2')).toHaveTextContent('Điều kiện chưa hợp lệ');
    save();
    const { fields } = await savedPayload();
    expect(fields[2]).not.toHaveProperty('showIf');
  });

  it('XOÁ lựa chọn mà điều kiện đang dùng → cảnh báo tại ô (không bật thông báo), lưu thì gỡ; ĐỔI TÊN lựa chọn thì điều kiện đổi theo', async () => {
    await renderEdit(CONDITIONAL);
    // đổi tên "Spa" → "Spa cao cấp"
    selectFieldRow(1);
    const optionInputs = () => within(fieldRow(1)).getAllByPlaceholderText('Nhập lựa chọn...');
    fireEvent.change(optionInputs()[0], { target: { value: 'Spa cao cấp' } });
    expect(within(fieldRow(2)).getByTestId('field-showif-badge-2')).toHaveTextContent('Có điều kiện');
    selectFieldRow(2);
    expect(row().getByLabelText('Giá trị')).toHaveDisplayValue('Spa cao cấp');

    // xoá lựa chọn đầu → điều kiện mất giá trị
    selectFieldRow(1);
    fireEvent.click(within(fieldRow(1)).getAllByRole('button', { name: 'Xoá lựa chọn' })[0]);
    expect(within(fieldRow(2)).getByTestId('field-showif-badge-2')).toHaveTextContent('Điều kiện chưa hợp lệ');
    expect(toast.error).not.toHaveBeenCalled();
    selectFieldRow(2);
    expect(screen.getByTestId('showif-issue-0')).toHaveTextContent(/Giá trị đã chọn không còn/);

    save();
    const { fields } = await savedPayload();
    expect(fields[2]).not.toHaveProperty('showIf');
    expect(toast.error).toHaveBeenCalledWith('Đã gỡ 1 điều kiện hiển thị không còn hợp lệ.');
  });

  it('đổi ô có điều kiện sang Ngắt trang: showIf bị bỏ và bảng thuộc tính không còn mục điều kiện', async () => {
    await renderEdit(CONDITIONAL);
    selectFieldRow(2);
    expect(screen.getByTestId('field-showif-editor')).toBeInTheDocument();
    fireEvent.change(within(fieldRow(2)).getByLabelText('Kiểu dữ liệu'), { target: { value: 'page_break' } });
    expect(screen.queryByTestId('field-showif-editor')).not.toBeInTheDocument();
    expect(screen.queryByTestId('field-showif-badge-2')).not.toBeInTheDocument();
    save();
    const { fields } = await savedPayload();
    expect(fields[2]).toEqual({ key: 'f_note', label: 'Chi tiết Spa', type: 'page_break', required: false });
  });

  it('áp cho khối tiêu đề / đoạn chữ; Ngắt trang không có mục điều kiện', async () => {
    await renderEdit(
      formWith([NAME_FIELD, SELECT_FIELD, { key: 'f_h', label: 'Phần Spa', type: 'heading', required: false, options: [] }, { key: 'f_pb', label: 'Bước 2', type: 'page_break', required: false, options: [] }])
    );
    fireEvent.click(within(fieldRow(2)).getByRole('button', { name: /^Khối bố cục 1:/ }));
    fireEvent.click(editor().getByRole('button', { name: 'Thêm điều kiện hiển thị' }));
    fireEvent.click(within(fieldRow(3)).getByRole('button', { name: /^Khối bố cục 2:/ }));
    expect(screen.queryByTestId('field-showif-editor')).not.toBeInTheDocument();
    save();
    const { fields } = await savedPayload();
    expect(fields[2].showIf.conditions).toHaveLength(1);
    expect(fields[3]).not.toHaveProperty('showIf');
  });

  it('nhân bản ô có điều kiện: bản sao mang điều kiện y hệt (độc lập về sau)', async () => {
    await renderEdit(CONDITIONAL);
    fireEvent.click(within(fieldRow(2)).getByRole('button', { name: 'Nhân bản trường' }));
    save();
    const { fields } = await savedPayload();
    expect(fields).toHaveLength(4);
    expect(fields[3].showIf).toEqual(fields[2].showIf);
    expect(fields[3]).not.toHaveProperty('key');
  });

  describe('xem trước phản ánh logic', () => {
    it('có điều kiện: hiện dòng nhắc; ô nguồn bấm thử được; ô đích hiện / ẩn theo; bỏ điều kiện thì hết nhắc', async () => {
      await renderEdit(CONDITIONAL);
      expect(screen.getByTestId('form-preview-showif-hint')).toBeInTheDocument();
      // chưa chọn dịch vụ → ô đích ẩn trong xem trước
      expect(previewPane().queryByText('Chi tiết Spa')).not.toBeInTheDocument();
      const select = previewPane().getByLabelText(/^Dịch vụ/);
      expect(select).not.toBeDisabled();
      expect(previewPane().getByLabelText(/^Họ và tên/)).toBeDisabled();

      fireEvent.change(select, { target: { value: 'Spa' } });
      expect(previewPane().getByText('Chi tiết Spa')).toBeInTheDocument();
      fireEvent.change(select, { target: { value: 'Gội đầu' } });
      expect(previewPane().queryByText('Chi tiết Spa')).not.toBeInTheDocument();

      selectFieldRow(2);
      fireEvent.click(editor().getByRole('button', { name: 'Bỏ hết điều kiện' }));
      expect(screen.queryByTestId('form-preview-showif-hint')).not.toBeInTheDocument();
      expect(previewPane().getByText('Chi tiết Spa')).toBeInTheDocument();
      expect(previewPane().getByLabelText(/^Dịch vụ/)).toBeDisabled();
    });

    it('điều kiện hỏng bị bỏ trong xem trước (ô luôn hiện) — đúng với bản sẽ được lưu', async () => {
      await renderEdit(CONDITIONAL);
      removeFieldAt(1);
      expect(previewPane().getByText('Chi tiết Spa')).toBeInTheDocument();
    });
  });

  it('biểu mẫu KHÔNG có điều kiện: không có huy hiệu, không có dòng nhắc xem trước, payload không có showIf nào', async () => {
    await renderEdit(formWith([NAME_FIELD, SELECT_FIELD, NOTE_FIELD]));
    expect(screen.queryByTestId('form-preview-showif-hint')).not.toBeInTheDocument();
    expect(document.querySelector('[data-testid^="field-showif-badge-"]')).toBeNull();
    save();
    const { fields } = await savedPayload();
    for (const f of fields) expect(f).not.toHaveProperty('showIf');
  });
});
