import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { I18nProvider } from '../../../i18n';
import FormEditorPage from '../pages/FormEditorPage';
import * as formAdminApi from '../services/formAdminApi.service';
import productApiService from '../../products/services/productApi.service';

/**
 * HỢP ĐỒNG PAYLOAD của trình soạn biểu mẫu (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, PR-3 bước 0).
 *
 * Viết TRÊN BẢN GỐC (bố cục cũ, mọi khối xếp dọc trong một trang) TRƯỚC khi đổi bố cục: ghim NGUYÊN VĂN những gì
 * trình soạn gửi cho createForm / updateForm. Đổi bố cục trình soạn (danh sách trường + xem trước cố định + Cài đặt
 * dạng modal có tab) KHÔNG được làm đổi payload — bài học NotificationCenter / CanvasEditor 11/10/2026.
 *
 * Phần DUY NHẤT được sửa khi vị trí UI đổi là khối `driver` bên dưới (cách TÌM và BẤM phần tử). Mọi `expect(payload)`
 * là hợp đồng — không đổi kỳ vọng ở đây, đỏ nghĩa là payload đã đổi.
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
  default: { getProducts: vi.fn() },
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

const PRODUCTS = [
  { id: 11, productName: 'Khoá AI thực chiến', price: '500k', priceAmount: 500000 },
  { id: 12, productName: 'Khoá Marketing', price: '1tr', priceAmount: null },
];

// ───────────────────────────── DRIVER (chỉ phần này đổi khi vị trí UI đổi) ─────────────────────────────
//
// Bố cục trình soạn MỚI (PR-3): trái = danh sách trường (chọn một hàng để mở bảng thuộc tính của nó), phải = xem trước cố
// định, mọi cấu hình ngoài trường nằm trong modal "Cài đặt" có tab. Mỗi lệnh dưới đây làm đúng việc cũ qua vị trí UI mới.

const LABEL_PLACEHOLDER = 'Ví dụ: Họ và tên';

const SETTINGS_TAB_NAMES = {
  general: 'Thông tin chung',
  afterSubmit: 'Sau khi gửi',
  booking: 'Đặt lịch hẹn',
  payment: 'Thanh toán',
  theme: 'Giao diện',
  product: 'Sản phẩm',
};

const fieldRow = (idx) => screen.getByTestId(`field-row-${idx}`);

// Ô gắn nhãn kiểu "<div>nhãn</div> … <input>" — nhãn nằm cùng khối cha với ô nhập.
const controlNextToText = (text, selector) => screen.getByText(text).closest('div').querySelector(selector);

const driver = {
  startBlank: () => fireEvent.click(screen.getByTestId('form-template-blank')),
  setTitle: (value) =>
    fireEvent.change(screen.getByPlaceholderText(/Ví dụ: Đăng ký tư vấn lộ trình 1-1/i), { target: { value } }),
  save: () => fireEvent.click(screen.getByRole('button', { name: /Lưu biểu mẫu/i })),

  // Chọn một hàng để mở bảng thuộc tính của nó (chỉ trường đang chọn có ô nhập).
  selectField: (idx) =>
    fireEvent.click(within(fieldRow(idx)).getByRole('button', { name: new RegExp(`^Trường #${idx + 1}:`) })),
  setLabel: (idx, value) =>
    fireEvent.change(within(fieldRow(idx)).getByPlaceholderText(LABEL_PLACEHOLDER), { target: { value } }),
  setType: (idx, value) =>
    fireEvent.change(within(fieldRow(idx)).getByLabelText('Kiểu dữ liệu'), { target: { value } }),
  setRole: (idx, value) =>
    fireEvent.change(within(fieldRow(idx)).getByLabelText('Vai trò định danh'), { target: { value } }),
  toggleRequired: (idx) =>
    fireEvent.click(within(fieldRow(idx)).getByRole('checkbox', { name: /Bắt buộc/ })),
  moveField: (idx, direction) =>
    fireEvent.click(within(fieldRow(idx)).getByTitle(direction < 0 ? 'Di chuyển lên' : 'Di chuyển xuống')),
  removeField: (idx) => fireEvent.click(within(fieldRow(idx)).getByTitle('Xoá trường')),
  addOption: (idx) => fireEvent.click(within(fieldRow(idx)).getByRole('button', { name: /Thêm lựa chọn/ })),
  setOption: (idx, optIdx, value) =>
    fireEvent.change(within(fieldRow(idx)).getAllByPlaceholderText('Nhập lựa chọn...')[optIdx], {
      target: { value },
    }),
  removeOption: (idx, optIdx) =>
    fireEvent.click(within(fieldRow(idx)).getAllByTitle('Xoá lựa chọn')[optIdx]),
  addBlankField: () => fireEvent.click(screen.getByRole('button', { name: /Thêm trường/i })),
  quickAdd: (name) => fireEvent.click(screen.getByRole('button', { name })),
  showMoreFieldTypes: () => fireEvent.click(screen.getByRole('button', { name: 'Loại khác…' })),

  /** Mở modal Cài đặt (nếu chưa mở) rồi chọn tab: 'general' | 'afterSubmit' | 'booking' | 'payment' | 'theme' | 'product'. */
  openSettings: (tab) => {
    if (!screen.queryByRole('dialog')) {
      fireEvent.click(screen.getByRole('button', { name: 'Cài đặt' }));
    }
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: SETTINGS_TAB_NAMES[tab] }));
  },

  descriptionInput: () => screen.getByPlaceholderText(/Mô tả mục đích hoặc hướng dẫn/),
  // Công tắc "Sau khi gửi": nhãn nằm trong khối cha `.justify-between` cùng ô tích.
  settingCheckbox: (text) => screen.getByText(text).closest('.justify-between').querySelector('input[type="checkbox"]'),
  submitButtonTextInput: () => controlNextToText('Chữ trên nút gửi', 'input'),
  successMessageInput: () => controlNextToText('Thông báo sau khi nộp thành công', 'textarea'),
  redirectUrlInput: () => controlNextToText(/Đường dẫn chuyển hướng sau khi nộp/, 'input'),
  productSelect: () => screen.getByTestId('form-product-select'),
  // Ô giờ / ngày nghỉ của tab Đặt lịch hẹn (xem trước bên phải cũng có thể có ô ngày/giờ nên tìm trong modal).
  timeInputs: () => screen.getByRole('dialog').querySelectorAll('input[type="time"]'),
  closedDateInput: () => screen.getByRole('dialog').querySelector('input[type="date"]'),
};

// ───────────────────────────────────────────── Dàn dựng ─────────────────────────────────────────────

function renderCreate() {
  return render(
    <MemoryRouter initialEntries={['/app/forms/new']}>
      <I18nProvider>
        <Routes>
          <Route path="/app/forms/new" element={<FormEditorPage />} />
        </Routes>
      </I18nProvider>
    </MemoryRouter>
  );
}

async function renderEdit(form) {
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

const lastCreatePayload = async () => {
  await waitFor(() => expect(formAdminApi.createForm).toHaveBeenCalledTimes(1));
  return formAdminApi.createForm.mock.calls[0][0];
};
const lastUpdatePayload = async () => {
  await waitFor(() => expect(formAdminApi.updateForm).toHaveBeenCalledTimes(1));
  return formAdminApi.updateForm.mock.calls[0][1];
};

describe('FormEditorPage — hợp đồng payload gửi API khi Lưu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockAuthState = { user: null, activeContext: { type: 'self' } };
    productApiService.getProducts.mockResolvedValue({ data: { data: { products: PRODUCTS } } });
  });

  // ─────────────────────────────────────────── TRƯỜNG ───────────────────────────────────────────

  it('TẠO MỚI — trường: thêm / sửa nhãn / đổi loại / vai trò / bắt buộc / lựa chọn / đổi thứ tự / xoá → payload.fields đúng từng khoá', async () => {
    formAdminApi.createForm.mockResolvedValue({ id: 'new-fields' });
    renderCreate();
    driver.startBlank();
    driver.setTitle('Biểu mẫu trường');

    // idx1: trường trống → email, vai trò email, bắt buộc
    driver.addBlankField();
    driver.selectField(1);
    driver.setLabel(1, '  Email liên hệ  ');
    driver.setType(1, 'email');
    driver.setRole(1, 'email');
    driver.toggleRequired(1);

    // idx2: trắc nghiệm đơn từ "Thêm nhanh" → sửa nhãn, thêm / sửa / xoá lựa chọn
    driver.showMoreFieldTypes();
    driver.quickAdd('Trắc nghiệm đơn');
    driver.selectField(2);
    driver.setLabel(2, 'Bạn biết chúng tôi qua đâu?');
    driver.addOption(2); // Lựa chọn 3
    driver.setOption(2, 0, 'Facebook');
    driver.setOption(2, 1, 'Zalo');
    driver.setOption(2, 2, '  Bạn bè  ');
    driver.addOption(2); // Lựa chọn 4 → để trống, bị lọc khi lưu
    driver.setOption(2, 3, '   ');
    driver.addOption(2); // Lựa chọn 5 → rồi xoá
    driver.removeOption(2, 4);

    // idx3: hộp kiểm → sửa nhãn
    driver.quickAdd('Hộp kiểm');
    driver.selectField(3);
    driver.setLabel(3, 'Quan tâm');

    // idx4: văn bản ngắn → thêm rồi xoá (không được có mặt trong payload)
    driver.quickAdd('Văn bản ngắn');
    driver.removeField(4);

    // Đổi thứ tự: [name,email,radio,checkbox] → đẩy name xuống → [email,name,radio,checkbox] → đẩy checkbox lên
    driver.moveField(0, 1);
    driver.moveField(3, -1);

    driver.save();
    const payload = await lastCreatePayload();

    expect(payload.fields).toEqual([
      { label: 'Email liên hệ', type: 'email', required: true, role: 'email' },
      { label: 'Họ và tên', type: 'short_text', required: true, role: 'name' },
      { label: 'Quan tâm', type: 'checkbox', required: false, options: ['Mục 1', 'Mục 2'] },
      {
        label: 'Bạn biết chúng tôi qua đâu?',
        type: 'radio',
        required: false,
        options: ['Facebook', 'Zalo', 'Bạn bè'],
      },
    ]);
    // Trường mới KHÔNG có key (server tự sinh), không có khoá nào ngoài các khoá trên.
    for (const f of payload.fields) expect(f).not.toHaveProperty('key');
  });

  it('TẠO MỚI — đổi loại sang/khỏi select|radio|checkbox: xoá lựa chọn khi sang loại thường, nạp 2 lựa chọn mẫu khi sang loại có lựa chọn', async () => {
    formAdminApi.createForm.mockResolvedValue({ id: 'new-types' });
    renderCreate();
    driver.startBlank();
    driver.setTitle('Biểu mẫu đổi loại');

    // idx1 radio (2 lựa chọn mẫu) → đổi sang văn bản dài: lựa chọn bị xoá
    driver.showMoreFieldTypes();
    driver.quickAdd('Trắc nghiệm đơn');
    driver.selectField(1);
    driver.setType(1, 'long_text');
    // idx2 văn bản ngắn → đổi sang select: tự có 2 lựa chọn mẫu
    driver.quickAdd('Văn bản ngắn');
    driver.selectField(2);
    driver.setLabel(2, 'Thành phố');
    driver.setType(2, 'select');

    driver.save();
    const payload = await lastCreatePayload();

    expect(payload.fields).toEqual([
      { label: 'Họ và tên', type: 'short_text', required: true, role: 'name' },
      { label: 'Trắc nghiệm đơn', type: 'long_text', required: false },
      { label: 'Thành phố', type: 'select', required: false, options: ['Lựa chọn 1', 'Lựa chọn 2'] },
    ]);
  });

  it('TẠO MỚI — đặt vai trò đã có ở trường khác: trường cũ bị bỏ vai trò (mỗi vai trò tối đa 1 trường)', async () => {
    formAdminApi.createForm.mockResolvedValue({ id: 'new-role-dup' });
    renderCreate();
    driver.startBlank();
    driver.setTitle('Biểu mẫu vai trò');

    driver.quickAdd('Văn bản ngắn');
    driver.selectField(1);
    driver.setRole(1, 'name'); // idx0 đang giữ role name → bị gỡ

    driver.save();
    const payload = await lastCreatePayload();
    expect(payload.fields).toEqual([
      { label: 'Họ và tên', type: 'short_text', required: true },
      { label: 'Văn bản ngắn', type: 'short_text', required: false, role: 'name' },
    ]);
  });

  it('SỬA — trường có key + lựa chọn dạng đối tượng: giữ NGUYÊN key qua đổi thứ tự / sửa nhãn / xoá, lựa chọn ra nhãn chuỗi', async () => {
    const form = {
      id: 'form-fields-1',
      title: 'Biểu mẫu khảo sát khoá học',
      description: '',
      isPublished: false,
      fields: [
        { key: 'f_name', label: 'Họ và tên', type: 'short_text', required: true, role: 'name' },
        { key: 'f_mail', label: 'Email', type: 'email', required: true, role: 'email' },
        {
          key: 'f_city',
          label: 'Thành phố',
          type: 'select',
          required: false,
          role: '',
          options: [
            { label: 'Hà Nội', value: 'hn' },
            { label: 'Đà Nẵng', value: 'dn' },
            'TP.HCM',
          ],
        },
        { key: 'f_like', label: 'Quan tâm', type: 'checkbox', required: false, options: ['A', 'B'] },
        { key: 'f_note', label: 'Ghi chú', type: 'long_text', required: false },
      ],
      settings: {},
    };
    await renderEdit(form);

    driver.selectField(2);
    driver.setLabel(2, 'Tỉnh / thành');
    driver.removeOption(2, 1); // bỏ Đà Nẵng
    driver.moveField(2, -1); // city lên trên email
    driver.removeField(4); // bỏ ghi chú
    driver.selectField(0);
    driver.toggleRequired(0); // name: bắt buộc → không bắt buộc

    driver.save();
    const payload = await lastUpdatePayload();

    expect(formAdminApi.updateForm.mock.calls[0][0]).toBe('form-fields-1');
    expect(payload.fields).toEqual([
      { key: 'f_name', label: 'Họ và tên', type: 'short_text', required: false, role: 'name' },
      { key: 'f_city', label: 'Tỉnh / thành', type: 'select', required: false, options: ['Hà Nội', 'TP.HCM'] },
      { key: 'f_mail', label: 'Email', type: 'email', required: true, role: 'email' },
      { key: 'f_like', label: 'Quan tâm', type: 'checkbox', required: false, options: ['A', 'B'] },
    ]);
  });

  // ──────────────────────────────── CÀI ĐẶT "SAU KHI GỬI" ────────────────────────────────

  it('TẠO MỚI — "Sau khi gửi": đủ 6 khoá, giá trị đã trim, redirectUrl rỗng → null, chữ nút / lời cảm ơn rỗng → mặc định', async () => {
    formAdminApi.createForm.mockResolvedValue({ id: 'new-settings-1' });
    renderCreate();
    driver.startBlank();
    driver.setTitle('Biểu mẫu cài đặt');

    driver.openSettings('afterSubmit');
    fireEvent.click(driver.settingCheckbox('Gửi email thông báo cho chủ form khi có bài nộp mới')); // true → false
    fireEvent.click(driver.settingCheckbox('Bật ô đồng ý nhận thông tin tiếp thị (Marketing Consent)')); // false → true
    fireEvent.click(driver.settingCheckbox('Gửi email xác nhận cho người điền sau khi nộp')); // false → true
    fireEvent.change(driver.submitButtonTextInput(), { target: { value: '   ' } });
    fireEvent.change(driver.successMessageInput(), { target: { value: '' } });
    fireEvent.change(driver.redirectUrlInput(), { target: { value: '   ' } });

    driver.save();
    const payload = await lastCreatePayload();

    expect(payload.settings).toEqual({
      notifyOwner: false,
      consentEnabled: true,
      sendConfirmation: true,
      submitButtonText: 'Gửi thông tin',
      successMessage: 'Cảm ơn bạn đã gửi thông tin!',
      redirectUrl: null,
    });
  });

  it('TẠO MỚI — "Sau khi gửi": nhập chữ nút, lời cảm ơn, đường dẫn chuyển hướng → gửi đúng giá trị (đã trim)', async () => {
    formAdminApi.createForm.mockResolvedValue({ id: 'new-settings-2' });
    renderCreate();
    driver.startBlank();
    driver.setTitle('Biểu mẫu cài đặt 2');

    driver.openSettings('afterSubmit');
    fireEvent.change(driver.submitButtonTextInput(), { target: { value: '  Đăng ký ngay  ' } });
    fireEvent.change(driver.successMessageInput(), { target: { value: '  Cảm ơn bạn!  ' } });
    fireEvent.change(driver.redirectUrlInput(), { target: { value: '  https://example.com/cam-on  ' } });

    driver.save();
    const payload = await lastCreatePayload();

    expect(payload.settings).toEqual({
      notifyOwner: true,
      consentEnabled: false,
      sendConfirmation: false,
      submitButtonText: 'Đăng ký ngay',
      successMessage: 'Cảm ơn bạn!',
      redirectUrl: 'https://example.com/cam-on',
    });
  });

  // ─────────────────────────────────── TOÀN BỘ PAYLOAD KHI TẠO MỚI ───────────────────────────────────

  it('TẠO MỚI — toàn bộ: tiêu đề + mô tả + trường + sau khi gửi + đặt lịch + thanh toán (chủ) + giao diện + sản phẩm → payload đúng từng khoá', async () => {
    formAdminApi.createForm.mockResolvedValue({ id: 'new-golden' });
    renderCreate();
    driver.startBlank();
    driver.setTitle('  Đăng ký khoá AI  ');

    driver.openSettings('general');
    fireEvent.change(driver.descriptionInput(), { target: { value: '  Điền thông tin để giữ chỗ  ' } });

    // Trường
    driver.quickAdd('Địa chỉ Email');
    driver.selectField(1);
    driver.quickAdd('Số điện thoại');
    driver.selectField(2);

    // Sau khi gửi
    driver.openSettings('afterSubmit');
    fireEvent.click(driver.settingCheckbox('Bật ô đồng ý nhận thông tin tiếp thị (Marketing Consent)'));
    fireEvent.click(driver.settingCheckbox('Gửi email xác nhận cho người điền sau khi nộp'));
    fireEvent.change(driver.submitButtonTextInput(), { target: { value: 'Giữ chỗ' } });
    fireEvent.change(driver.successMessageInput(), { target: { value: 'Đã nhận thông tin, mời bạn chuyển khoản.' } });
    fireEvent.change(driver.redirectUrlInput(), { target: { value: 'https://example.com/cam-on' } });

    // Đặt lịch hẹn
    driver.openSettings('booking');
    fireEvent.click(screen.getByRole('checkbox', { name: /Bật đặt lịch hẹn/i }));
    const addSlotButtons = screen.getAllByRole('button', { name: /Thêm khung giờ/i });
    fireEvent.click(addSlotButtons[0]); // Thứ 2
    fireEvent.click(addSlotButtons[6]); // Chủ nhật
    const timeInputs = driver.timeInputs();
    fireEvent.change(timeInputs[0], { target: { value: '09:00' } });
    fireEvent.change(timeInputs[1], { target: { value: '10:30' } });
    fireEvent.change(controlNextToText('Sức chứa mỗi khung giờ', 'input'), { target: { value: '5' } });
    fireEvent.change(controlNextToText('Số ngày cho đặt trước', 'input'), { target: { value: '14' } });
    fireEvent.change(controlNextToText('Báo trước tối thiểu (phút)', 'input'), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: /Thêm ngày nghỉ/ }));
    fireEvent.change(driver.closedDateInput(), { target: { value: '2026-12-25' } });

    // Thanh toán (chủ tài khoản)
    driver.openSettings('payment');
    fireEvent.click(screen.getByRole('checkbox', { name: /Bật thanh toán/i }));
    fireEvent.change(screen.getByLabelText('Khách thấy khoản tiền này là'), { target: { value: 'deposit' } });
    fireEvent.change(screen.getByPlaceholderText('Vd: 150.000'), { target: { value: '500000' } });
    fireEvent.change(screen.getByText('Ngân hàng').closest('div').querySelector('select'), {
      target: { value: '970436' },
    });
    fireEvent.change(screen.getByText('Số tài khoản').closest('div').querySelector('input'), {
      target: { value: '0123456789' },
    });
    fireEvent.change(screen.getByPlaceholderText(/NGUYEN VAN A/i), { target: { value: 'Nguyen Van A' } });
    fireEvent.change(controlNextToText(/^Thời hạn đặt cọc/, 'input'), { target: { value: '60' } });

    // Giao diện
    driver.openSettings('theme');
    fireEvent.click(screen.getByRole('button', { name: /Thanh lịch/i }));
    fireEvent.change(controlNextToText('Font chữ', 'select'), { target: { value: 'Roboto' } });
    fireEvent.change(controlNextToText('Chiều cao banner', 'select'), { target: { value: 'sm' } });

    // Sản phẩm
    driver.openSettings('product');
    await waitFor(() => expect(screen.getByRole('option', { name: 'Khoá AI thực chiến' })).toBeInTheDocument());
    fireEvent.change(driver.productSelect(), { target: { value: '11' } });

    driver.save();
    const payload = await lastCreatePayload();

    expect(payload).toEqual({
      title: 'Đăng ký khoá AI',
      description: 'Điền thông tin để giữ chỗ',
      fields: [
        { label: 'Họ và tên', type: 'short_text', required: true, role: 'name' },
        { label: 'Địa chỉ Email', type: 'email', required: true, role: 'email' },
        { label: 'Số điện thoại', type: 'phone', required: true, role: 'phone' },
      ],
      settings: {
        notifyOwner: true,
        consentEnabled: true,
        sendConfirmation: true,
        submitButtonText: 'Giữ chỗ',
        successMessage: 'Đã nhận thông tin, mời bạn chuyển khoản.',
        redirectUrl: 'https://example.com/cam-on',
      },
      bookingConfig: {
        enabled: true,
        weeklySlots: { 0: ['10:30'], 1: ['09:00'], 2: [], 3: [], 4: [], 5: [], 6: [] },
        slotCapacity: 5,
        daysAhead: 14,
        minNoticeMinutes: 120,
        closedDates: ['2026-12-25'],
      },
      theme: {
        preset: 'elegant',
        primaryColor: '#1D4ED8',
        backgroundColor: '#F8FAFC',
        fontFamily: 'Roboto',
        layout: 'wide',
        bannerHeight: 'sm',
      },
      productId: 11,
      paymentConfig: {
        enabled: true,
        methods: ['bank'],
        method: 'bank',
        amount: 500000,
        holdMinutes: 60,
        purpose: 'deposit',
        bankBin: '970436',
        accountNumber: '0123456789',
        accountName: 'Nguyen Van A',
      },
    });
  });

  // ─────────────────────────────────── VÒNG TRÒN NẠP → LƯU (SỬA) ───────────────────────────────────

  const FULL_FORM = {
    id: 'form-roundtrip-1',
    publicKey: 'pub-rt-1',
    title: 'Khảo sát khách hàng',
    description: 'Mô tả khảo sát',
    isPublished: false,
    productId: 12,
    fields: [
      { key: 'f_name', label: 'Họ và tên', type: 'short_text', required: true, role: 'name' },
      { key: 'f_mail', label: 'Email', type: 'email', required: true, role: 'email' },
      {
        key: 'f_city',
        label: 'Thành phố',
        type: 'select',
        required: false,
        role: '',
        options: [{ label: 'Hà Nội', value: 'hn' }, { label: 'Đà Nẵng', value: 'dn' }],
      },
      { key: 'f_note', label: 'Ghi chú', type: 'long_text', required: false },
    ],
    settings: {
      notifyOwner: false,
      consentEnabled: true,
      sendConfirmation: true,
      submitButtonText: 'Gửi khảo sát',
      successMessage: 'Cảm ơn bạn đã phản hồi!',
      redirectUrl: 'https://example.com/thanks',
    },
    bookingConfig: {
      enabled: true,
      weeklySlots: { 0: [], 1: ['09:00', '14:00'], 2: [], 3: [], 4: [], 5: ['08:00'], 6: [] },
      slotCapacity: 3,
      daysAhead: 21,
      minNoticeMinutes: 90,
      closedDates: ['2026-12-24', '2026-12-25'],
    },
    paymentConfig: {
      enabled: true,
      methods: ['bank'],
      method: 'bank',
      amount: 250000,
      bankBin: '970436',
      accountNumber: '0123456789',
      accountName: 'NGUYEN VAN A',
      holdMinutes: 45,
      purpose: 'deposit',
    },
    theme: {
      preset: 'bold',
      primaryColor: '#7C3AED',
      backgroundColor: '#F5F3FF',
      fontFamily: 'Montserrat',
      layout: 'wide',
      bannerHeight: 'lg',
      bannerKey: 'uploads/1/forms/banner.png',
      bannerUrl: 'https://cdn.example.com/banner.png',
      logoKey: 'uploads/1/forms/logo.png',
      logoUrl: 'https://cdn.example.com/logo.png',
    },
  };

  const EXPECTED_ROUNDTRIP_PAYLOAD = {
    title: 'Khảo sát khách hàng',
    description: 'Mô tả khảo sát',
    fields: [
      { key: 'f_name', label: 'Họ và tên', type: 'short_text', required: true, role: 'name' },
      { key: 'f_mail', label: 'Email', type: 'email', required: true, role: 'email' },
      { key: 'f_city', label: 'Thành phố', type: 'select', required: false, options: ['Hà Nội', 'Đà Nẵng'] },
      { key: 'f_note', label: 'Ghi chú', type: 'long_text', required: false },
    ],
    settings: {
      notifyOwner: false,
      consentEnabled: true,
      sendConfirmation: true,
      submitButtonText: 'Gửi khảo sát',
      successMessage: 'Cảm ơn bạn đã phản hồi!',
      redirectUrl: 'https://example.com/thanks',
    },
    bookingConfig: {
      enabled: true,
      weeklySlots: { 0: [], 1: ['09:00', '14:00'], 2: [], 3: [], 4: [], 5: ['08:00'], 6: [] },
      slotCapacity: 3,
      daysAhead: 21,
      minNoticeMinutes: 90,
      closedDates: ['2026-12-24', '2026-12-25'],
    },
    theme: {
      preset: 'bold',
      primaryColor: '#7C3AED',
      backgroundColor: '#F5F3FF',
      fontFamily: 'Montserrat',
      layout: 'wide',
      bannerHeight: 'lg',
      bannerKey: 'uploads/1/forms/banner.png',
      logoKey: 'uploads/1/forms/logo.png',
    },
    productId: 12,
    paymentConfig: {
      enabled: true,
      methods: ['bank'],
      method: 'bank',
      amount: 250000,
      holdMinutes: 45,
      purpose: 'deposit',
      bankBin: '970436',
      accountNumber: '0123456789',
      accountName: 'NGUYEN VAN A',
    },
  };

  it('SỬA (chủ) — nạp biểu mẫu đầy đủ rồi Lưu không đổi gì: payload khớp từng khoá (vòng tròn nạp → lưu), KHÔNG có bannerUrl/logoUrl', async () => {
    await renderEdit(FULL_FORM);
    driver.save();
    const payload = await lastUpdatePayload();

    expect(payload).toEqual(EXPECTED_ROUNDTRIP_PAYLOAD);
    expect(payload.theme).not.toHaveProperty('bannerUrl');
    expect(payload.theme).not.toHaveProperty('logoUrl');
  });

  it('SỬA (nhân viên) — cùng biểu mẫu: payload y hệt nhưng KHÔNG có khoá paymentConfig (kể cả null)', async () => {
    mockAuthState = { user: { id: 7 }, activeContext: { type: 'employee' } };
    await renderEdit(FULL_FORM);
    driver.save();
    const payload = await lastUpdatePayload();

    const { paymentConfig: _omit, ...expectedWithoutPayment } = EXPECTED_ROUNDTRIP_PAYLOAD;
    void _omit;
    expect(payload).toEqual(expectedWithoutPayment);
    expect(payload).not.toHaveProperty('paymentConfig');
  });

  it('SỬA — tắt thanh toán + tắt đặt lịch (có xác nhận) + gỡ sản phẩm → paymentConfig: null, bookingConfig: null, productId: null', async () => {
    await renderEdit(FULL_FORM);

    driver.openSettings('payment');
    fireEvent.click(screen.getByRole('checkbox', { name: /Bật thanh toán/i }));
    driver.openSettings('booking');
    fireEvent.click(screen.getByRole('checkbox', { name: /Bật đặt lịch hẹn/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Tôi đã hiểu, vẫn lưu để tắt đặt lịch/i }));
    driver.openSettings('product');
    await waitFor(() => expect(screen.getByRole('option', { name: 'Khoá Marketing' })).toBeInTheDocument());
    fireEvent.change(driver.productSelect(), { target: { value: '' } });

    driver.save();
    const payload = await lastUpdatePayload();

    expect(payload.paymentConfig).toBeNull();
    expect(payload.bookingConfig).toBeNull();
    expect(payload.productId).toBeNull();
  });

  it('SỬA — thay đổi giao diện: đổi mẫu dựng sẵn giữ NGUYÊN bannerKey/logoKey; gỡ logo → vắng logoKey; đổi bố cục/chiều cao banner', async () => {
    await renderEdit(FULL_FORM);

    driver.openSettings('theme');
    fireEvent.click(screen.getByRole('button', { name: /Tươi mới/i }));
    fireEvent.change(controlNextToText('Bố cục', 'select'), { target: { value: 'card' } });
    fireEvent.change(controlNextToText('Chiều cao banner', 'select'), { target: { value: 'md' } });
    const removeButtons = screen.getAllByRole('button', { name: 'Gỡ ảnh' });
    fireEvent.click(removeButtons[1]); // logo (banner là nút đầu tiên)

    driver.save();
    const payload = await lastUpdatePayload();

    expect(payload.theme).toEqual({
      preset: 'fresh',
      primaryColor: '#16A34A',
      backgroundColor: '#F0FDF4',
      fontFamily: 'Nunito',
      layout: 'card',
      bannerHeight: 'md',
      bannerKey: 'uploads/1/forms/banner.png',
    });
  });

  it('SỬA — thanh toán MoMo (chủ): paymentConfig có nhóm trường MoMo, không có bankBin/accountNumber', async () => {
    const momoForm = {
      ...FULL_FORM,
      paymentConfig: {
        enabled: true,
        methods: ['momo'],
        method: 'momo',
        amount: 300000,
        momoPhone: '0912345678',
        momoName: 'NGUYEN VAN MOMO',
        momoQrMode: 'phone',
        momoQrBin: '971025',
        momoQrAccount: '0912345678',
        holdMinutes: 30,
        purpose: 'order',
      },
    };
    await renderEdit(momoForm);
    driver.save();
    const payload = await lastUpdatePayload();

    expect(payload.paymentConfig).toEqual({
      enabled: true,
      methods: ['momo'],
      method: 'momo',
      amount: 300000,
      holdMinutes: 30,
      purpose: 'order',
      momoPhone: '0912345678',
      momoName: 'NGUYEN VAN MOMO',
      momoQrMode: 'phone',
      momoQrBin: '971025',
      momoQrAccount: '0912345678',
    });
  });

  // ─────────────────────────────────────── XUẤT BẢN ───────────────────────────────────────

  it('Xuất bản khi đang ẩn: LƯU TRƯỚC (payload đầy đủ) rồi mới publish', async () => {
    formAdminApi.publishForm.mockResolvedValue({ id: FULL_FORM.id, isPublished: true });
    await renderEdit(FULL_FORM);

    fireEvent.click(screen.getByRole('button', { name: 'Xuất bản' }));

    await waitFor(() => expect(formAdminApi.publishForm).toHaveBeenCalledWith(FULL_FORM.id, true));
    expect(formAdminApi.updateForm).toHaveBeenCalledTimes(1);
    expect(formAdminApi.updateForm.mock.calls[0][1]).toEqual(EXPECTED_ROUNDTRIP_PAYLOAD);
    expect(formAdminApi.updateForm.mock.invocationCallOrder[0]).toBeLessThan(
      formAdminApi.publishForm.mock.invocationCallOrder[0]
    );
  });

  it('Tạo mới + Xuất bản: createForm đúng payload rồi publish bằng id vừa tạo', async () => {
    formAdminApi.createForm.mockResolvedValue({ id: 'new-publish-1' });
    formAdminApi.publishForm.mockResolvedValue({ id: 'new-publish-1', isPublished: true });
    renderCreate();
    driver.startBlank();
    driver.setTitle('Biểu mẫu xuất bản ngay');

    fireEvent.click(screen.getByRole('button', { name: 'Xuất bản' }));

    await waitFor(() => expect(formAdminApi.publishForm).toHaveBeenCalledWith('new-publish-1', true));
    const [payload] = formAdminApi.createForm.mock.calls[0];
    expect(payload.title).toBe('Biểu mẫu xuất bản ngay');
    expect(payload.fields).toEqual([{ label: 'Họ và tên', type: 'short_text', required: true, role: 'name' }]);
  });
});
