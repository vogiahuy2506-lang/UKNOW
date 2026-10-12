import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { I18nProvider } from '../../../i18n';
import viDict from '../../../i18n/vi.js';
import FormEditorPage from '../pages/FormEditorPage';
import FormTemplatePicker from '../components/FormTemplatePicker';
import * as formAdminApi from '../services/formAdminApi.service';
import productApiService from '../../products/services/productApi.service';
import toast from 'react-hot-toast';

/**
 * PR-5 (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11): AI soạn biểu mẫu ở giao diện.
 *  - bước chọn mẫu: ô mô tả + "Tạo bằng AI" → nháp đổ vào trình soạn, CHƯA lưu; lỗi thì vẫn chọn mẫu thường được;
 *  - trình soạn: "AI gợi ý câu hỏi" (xem trước, tích chọn từng câu) và "AI viết lại câu chữ" (áp ngay, hoàn tác 1 bước);
 *  - nhắc `needsAttention` (thanh toán / đặt lịch cần chủ tự khai) dẫn tới đúng tab Cài đặt.
 * Chỉ giả ranh giới mạng (formAdminApi.service). Chữ đọc từ vi.js — gõ tay là đỏ giả khi ai đó sửa câu chữ.
 */

vi.mock('../services/formAdminApi.service', () => ({
  fetchFormById: vi.fn(),
  createForm: vi.fn(),
  updateForm: vi.fn(),
  publishForm: vi.fn(),
  uploadFormTempFile: vi.fn(),
  uploadFormAsset: vi.fn(),
  aiDraftForm: vi.fn(),
}));

vi.mock('../../products/services/productApi.service', () => ({
  default: { getProducts: vi.fn() },
}));

vi.mock('../../storage/useStorageQuota', () => ({ default: () => ({ usage: null }) }));
vi.mock('../../storage/storageEvents', () => ({ notifyStorageQuotaRefresh: vi.fn() }));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

let mockAuthState = { user: null, activeContext: { type: 'self' } };
vi.mock('../../../stores/authStore', () => ({
  useAuthStore: (selector) => selector(mockAuthState),
}));

const AI = viDict.forms.editorPage.ai;
const QUOTA_MESSAGE = viDict.aiChatbot.aiCreditExceeded;

const CONSULT_DRAFT = {
  mode: 'create',
  kind: 'consult',
  title: 'Đăng ký học thử tiếng Anh cho bé',
  description: 'Điền thông tin để trung tâm gọi lại tư vấn.',
  fields: [
    { label: 'Họ và tên', type: 'short_text', required: true, role: 'name' },
    { label: 'Số điện thoại', type: 'phone', required: true, role: 'phone' },
    { label: 'Bé mấy tuổi?', type: 'number', required: true },
    { label: 'Khung giờ rảnh', type: 'checkbox', required: false, options: ['Sáng', 'Chiều', 'Tối'] },
    { label: 'Đánh giá buổi học thử', type: 'rating', required: false, helpText: '1 là thấp nhất', width: 'half' },
  ],
  settings: {
    notifyOwner: true,
    consentEnabled: true,
    sendConfirmation: false,
    submitButtonText: 'Đăng ký học thử',
    successMessage: 'Cảm ơn bạn, trung tâm sẽ gọi lại sớm.',
    redirectUrl: null,
  },
  bookingConfig: null,
  paymentConfig: null,
  needsAttention: [],
  businessContextUsed: false,
  usage: { creditCost: 1 },
};

const BOOKING_DRAFT = {
  ...CONSULT_DRAFT,
  kind: 'booking',
  settings: { ...CONSULT_DRAFT.settings, sendConfirmation: true, submitButtonText: 'Đặt lịch' },
  bookingConfig: {
    enabled: true,
    weeklySlots: { 0: [], 1: ['09:00', '14:00'], 2: ['09:00', '14:00'], 3: ['09:00', '14:00'], 4: ['09:00', '14:00'], 5: ['09:00', '14:00'], 6: [] },
    slotCapacity: null,
    daysAhead: 30,
    minNoticeMinutes: 60,
    closedDates: [],
  },
  needsAttention: ['booking'],
};

const PAYMENT_DRAFT = { ...CONSULT_DRAFT, kind: 'payment', needsAttention: ['payment'] };

const quotaError = () => Object.assign(new Error('x'), {
  response: { status: 402, data: { success: false, code: 'RESOURCE_LIMIT_EXCEEDED', resource: 'ai_credit', message: 'Bạn đã dùng hết lượt AI trong kỳ — nâng cấp gói để tiếp tục', upgradeRequired: true } },
});
const serverError = (status, message) => Object.assign(new Error(message), { response: { status, data: { success: false, message } } });

const renderCreate = () => render(
  <MemoryRouter initialEntries={['/app/forms/new']}>
    <I18nProvider>
      <Routes>
        <Route path="/app/forms/new" element={<FormEditorPage />} />
      </Routes>
    </I18nProvider>
  </MemoryRouter>
);

const EXISTING_FORM = {
  id: 'form-ai-1',
  title: 'Biểu mẫu khảo sát',
  description: '',
  isPublished: false,
  fields: [
    { key: 'f_name0001', label: 'ten', type: 'short_text', required: true, role: 'name' },
    { key: 'f_mail0002', label: 'mail', type: 'email', required: true, role: 'email' },
    { key: 'f_city0003', label: 'tinh', type: 'select', required: false, role: '', options: ['hn', 'hcm', 'dn'] },
  ],
  settings: { notifyOwner: true, consentEnabled: true, sendConfirmation: false, submitButtonText: 'Gửi', successMessage: 'Cảm ơn' },
};

const renderEdit = (form = EXISTING_FORM) => {
  formAdminApi.fetchFormById.mockResolvedValue(form);
  return render(
    <MemoryRouter initialEntries={[`/app/forms/${form.id}/edit`]}>
      <I18nProvider>
        <Routes>
          <Route path="/app/forms/:id/edit" element={<FormEditorPage />} />
        </Routes>
      </I18nProvider>
    </MemoryRouter>
  );
};

const typeDescription = (text) => fireEvent.change(screen.getByTestId('form-ai-description'), { target: { value: text } });
const clickCreateWithAi = () => fireEvent.click(screen.getByTestId('form-ai-draft-submit'));
const save = () => fireEvent.click(screen.getByRole('button', { name: /Lưu biểu mẫu/i }));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockAuthState = { user: null, activeContext: { type: 'self' } };
  productApiService.getProducts.mockResolvedValue({ data: { data: { products: [] } } });
  formAdminApi.createForm.mockResolvedValue({ id: 99 });
  formAdminApi.updateForm.mockResolvedValue({ id: 'form-ai-1' });
});

describe('FormTemplatePicker — ô "Tạo bằng AI"', () => {
  const renderPicker = (props = {}) => {
    const onSelect = vi.fn();
    const onAiDraft = vi.fn();
    const utils = render(
      <I18nProvider>
        <FormTemplatePicker onSelect={onSelect} onAiDraft={onAiDraft} onBack={vi.fn()} {...props} />
      </I18nProvider>
    );
    return { onSelect, onAiDraft, ...utils };
  };

  it('có ô mô tả + 4 gợi ý nhanh: bấm gợi ý thì điền sẵn vào ô', () => {
    renderPicker();
    expect(screen.getByLabelText(AI.picker.label)).toBeInTheDocument();
    for (const id of ['englishTrial', 'clinicBooking', 'courseDeposit', 'satisfactionSurvey']) {
      expect(screen.getByTestId(`form-ai-example-${id}`)).toHaveTextContent(AI.picker.examples[id].label);
    }
    fireEvent.click(screen.getByTestId('form-ai-example-englishTrial'));
    expect(screen.getByTestId('form-ai-description')).toHaveValue(AI.picker.examples.englishTrial.text);
    expect(AI.picker.examples.englishTrial.text).toContain('đăng ký học thử tiếng Anh cho trẻ');
  });

  it('mô tả rỗng → báo lỗi tại chỗ, KHÔNG gọi API (không tốn lượt AI)', () => {
    renderPicker();
    clickCreateWithAi();
    expect(screen.getByRole('alert')).toHaveTextContent(AI.picker.descriptionRequired);
    expect(formAdminApi.aiDraftForm).not.toHaveBeenCalled();
  });

  it('thành công: gọi API chế độ create đúng mô tả + ngôn ngữ, rồi đưa nháp cho trình soạn (chưa lưu)', async () => {
    formAdminApi.aiDraftForm.mockResolvedValue(CONSULT_DRAFT);
    const { onAiDraft } = renderPicker();
    typeDescription('  Form đăng ký học thử tiếng Anh cho trẻ  ');
    clickCreateWithAi();

    await waitFor(() => expect(onAiDraft).toHaveBeenCalledWith(CONSULT_DRAFT));
    expect(formAdminApi.aiDraftForm).toHaveBeenCalledTimes(1);
    expect(formAdminApi.aiDraftForm).toHaveBeenCalledWith({
      mode: 'create',
      description: 'Form đăng ký học thử tiếng Anh cho trẻ',
      locale: 'vi',
    });
    expect(formAdminApi.createForm).not.toHaveBeenCalled();
  });

  it('đang chờ: nút đổi chữ + khoá, các mẫu thường cũng khoá; bấm đúp chỉ gọi MỘT lần (không trừ hai lượt AI)', async () => {
    let resolve;
    formAdminApi.aiDraftForm.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { onAiDraft } = renderPicker();
    typeDescription('Form liên hệ');
    // Ba cú bấm trong CÙNG một lượt render (chưa kịp khoá nút theo state): chỉ cờ trong ref chặn được lời gọi thứ hai, thứ ba.
    const submit = screen.getByTestId('form-ai-draft-submit');
    act(() => { submit.click(); submit.click(); submit.click(); });

    expect(await screen.findByText(AI.picker.creating)).toBeInTheDocument();
    expect(screen.getByTestId('form-ai-draft-submit')).toBeDisabled();
    expect(screen.getByTestId('form-template-blank')).toBeDisabled();
    expect(screen.getByTestId('form-ai-draft-card')).toHaveAttribute('aria-busy', 'true');
    expect(formAdminApi.aiDraftForm).toHaveBeenCalledTimes(1);

    await act(async () => { resolve(CONSULT_DRAFT); });
    await waitFor(() => expect(onAiDraft).toHaveBeenCalledTimes(1));
  });

  it('HẾT LƯỢT AI (402) → báo bằng câu chuẩn của app, mẫu thường VẪN chọn được', async () => {
    formAdminApi.aiDraftForm.mockRejectedValue(quotaError());
    const { onSelect, onAiDraft } = renderPicker();
    typeDescription('Form liên hệ');
    clickCreateWithAi();

    expect(await screen.findByTestId('form-ai-draft-error')).toHaveTextContent(QUOTA_MESSAGE);
    expect(onAiDraft).not.toHaveBeenCalled();
    expect(screen.getByTestId('form-ai-draft-submit')).not.toBeDisabled();

    fireEvent.click(screen.getByTestId('form-template-consult'));
    expect(onSelect).toHaveBeenCalledWith('consult');
  });

  it('lỗi nghiệp vụ có câu tiếng Việt từ server → hiện nguyên câu đó', async () => {
    formAdminApi.aiDraftForm.mockRejectedValue(serverError(502, 'AI không trả về biểu mẫu hợp lệ, vui lòng thử lại.'));
    renderPicker();
    typeDescription('Form liên hệ');
    clickCreateWithAi();
    expect(await screen.findByTestId('form-ai-draft-error')).toHaveTextContent('AI không trả về biểu mẫu hợp lệ, vui lòng thử lại.');
  });

  it('mất mạng (không có phản hồi) → câu dự phòng thân thiện', async () => {
    formAdminApi.aiDraftForm.mockRejectedValue(new Error('Network Error'));
    renderPicker();
    typeDescription('Form liên hệ');
    clickCreateWithAi();
    expect(await screen.findByTestId('form-ai-draft-error')).toHaveTextContent(AI.picker.failed);
  });

  it('nháp không có câu hỏi nào → báo lỗi, không đưa vào trình soạn', async () => {
    formAdminApi.aiDraftForm.mockResolvedValue({ ...CONSULT_DRAFT, fields: [] });
    const { onAiDraft } = renderPicker();
    typeDescription('Form liên hệ');
    clickCreateWithAi();
    expect(await screen.findByTestId('form-ai-draft-error')).toHaveTextContent(AI.picker.emptyResult);
    expect(onAiDraft).not.toHaveBeenCalled();
  });

  it('rời bước chọn mẫu giữa lúc AI đang chạy → bỏ kết quả, không đè trình soạn', async () => {
    let resolve;
    formAdminApi.aiDraftForm.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { onAiDraft, unmount } = renderPicker();
    typeDescription('Form liên hệ');
    clickCreateWithAi();
    unmount();
    await act(async () => { resolve(CONSULT_DRAFT); });
    expect(onAiDraft).not.toHaveBeenCalled();
  });

  it('không truyền onAiDraft (nơi khác dùng picker) → không hiện ô AI', () => {
    renderPicker({ onAiDraft: undefined });
    expect(screen.queryByTestId('form-ai-draft-card')).not.toBeInTheDocument();
    expect(screen.getByTestId('form-template-blank')).toBeInTheDocument();
  });
});

describe('FormEditorPage — nháp AI đổ vào trình soạn', () => {
  it('đổ tiêu đề, mô tả, câu hỏi, cài đặt vào trình soạn; CHƯA lưu; bấm Lưu mới gửi đúng payload (paymentConfig null)', async () => {
    formAdminApi.aiDraftForm.mockResolvedValue(CONSULT_DRAFT);
    renderCreate();
    typeDescription('Form đăng ký học thử tiếng Anh cho trẻ');
    clickCreateWithAi();

    // vào trình soạn: tiêu đề + 5 hàng câu hỏi
    expect(await screen.findByDisplayValue(CONSULT_DRAFT.title)).toBeInTheDocument();
    expect(screen.queryByTestId('form-template-picker')).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/^field-row-/)).toHaveLength(5);
    expect(toast.success).toHaveBeenCalledWith(AI.draftReady);
    expect(formAdminApi.createForm).not.toHaveBeenCalled();
    expect(screen.queryByTestId('form-setup-hints')).not.toBeInTheDocument();

    save();
    await waitFor(() => expect(formAdminApi.createForm).toHaveBeenCalledTimes(1));
    expect(formAdminApi.createForm.mock.calls[0][0]).toEqual({
      title: 'Đăng ký học thử tiếng Anh cho bé',
      description: 'Điền thông tin để trung tâm gọi lại tư vấn.',
      fields: [
        { label: 'Họ và tên', type: 'short_text', required: true, role: 'name' },
        { label: 'Số điện thoại', type: 'phone', required: true, role: 'phone' },
        { label: 'Bé mấy tuổi?', type: 'number', required: true },
        { label: 'Khung giờ rảnh', type: 'checkbox', required: false, options: ['Sáng', 'Chiều', 'Tối'] },
        { label: 'Đánh giá buổi học thử', type: 'rating', required: false, helpText: '1 là thấp nhất', width: 'half' },
      ],
      settings: {
        notifyOwner: true,
        consentEnabled: true,
        sendConfirmation: false,
        submitButtonText: 'Đăng ký học thử',
        successMessage: 'Cảm ơn bạn, trung tâm sẽ gọi lại sớm.',
        redirectUrl: null,
      },
      bookingConfig: null,
      theme: {},
      paymentConfig: null,
    });
  });

  it('nháp loại đặt lịch: bật sẵn đặt lịch với khung giờ mặc định + nhắc "kiểm lại", nhắc dẫn thẳng tới tab Đặt lịch hẹn', async () => {
    formAdminApi.aiDraftForm.mockResolvedValue(BOOKING_DRAFT);
    renderCreate();
    typeDescription('Đặt lịch tư vấn');
    clickCreateWithAi();
    await screen.findByDisplayValue(BOOKING_DRAFT.title);

    const hints = within(screen.getByTestId('form-setup-hints'));
    expect(hints.queryByRole('button', { name: viDict.forms.editorPage.setupHint.payment })).not.toBeInTheDocument();
    fireEvent.click(hints.getByRole('button', { name: viDict.forms.editorPage.setupHint.booking }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Bật đặt lịch hẹn/i })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));

    save();
    await waitFor(() => expect(formAdminApi.createForm).toHaveBeenCalled());
    const payload = formAdminApi.createForm.mock.calls[0][0];
    expect(payload.bookingConfig).toEqual(BOOKING_DRAFT.bookingConfig);
    expect(payload.settings.sendConfirmation).toBe(true);
    expect(payload.paymentConfig).toBeNull();
  });

  it('nháp loại thu tiền: KHÔNG bật thanh toán, chỉ nhắc khai số tiền + tài khoản, nhắc dẫn tới tab Thanh toán; payload paymentConfig null', async () => {
    formAdminApi.aiDraftForm.mockResolvedValue(PAYMENT_DRAFT);
    renderCreate();
    typeDescription('Đặt cọc khoá học');
    clickCreateWithAi();
    await screen.findByDisplayValue(PAYMENT_DRAFT.title);

    const hints = within(screen.getByTestId('form-setup-hints'));
    expect(hints.queryByRole('button', { name: viDict.forms.editorPage.setupHint.booking })).not.toBeInTheDocument();
    fireEvent.click(hints.getByRole('button', { name: viDict.forms.editorPage.setupHint.payment }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // đúng tab Thanh toán (có công tắc "Bật thanh toán") và công tắc CHƯA bật — chủ tự bật + khai số tiền, tài khoản
    expect(screen.getByRole('checkbox', { name: /Bật thanh toán/i })).not.toBeChecked();
    expect(screen.queryByRole('checkbox', { name: /Bật đặt lịch hẹn/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));

    save();
    await waitFor(() => expect(formAdminApi.createForm).toHaveBeenCalled());
    const payload = formAdminApi.createForm.mock.calls[0][0];
    expect(payload.paymentConfig).toBeNull();
    expect(JSON.stringify(payload)).not.toMatch(/accountNumber|bankBin|momo/);
  });

  it('nhân viên + nháp thu tiền: không nhắc khai thanh toán (họ không khai được) và payload KHÔNG có khoá paymentConfig', async () => {
    mockAuthState = { user: { id: 31 }, activeContext: { type: 'employee', ownerId: 7 } };
    formAdminApi.aiDraftForm.mockResolvedValue(PAYMENT_DRAFT);
    renderCreate();
    typeDescription('Đặt cọc khoá học');
    clickCreateWithAi();
    await screen.findByDisplayValue(PAYMENT_DRAFT.title);

    expect(screen.queryByTestId('form-setup-hints')).not.toBeInTheDocument();
    save();
    await waitFor(() => expect(formAdminApi.createForm).toHaveBeenCalled());
    expect(formAdminApi.createForm.mock.calls[0][0]).not.toHaveProperty('paymentConfig');
  });

  it('nháp có loại lạ / vai trò vô nghĩa vẫn được dựng an toàn: khối bố cục không bắt buộc, sao/có-không không có vai trò', async () => {
    formAdminApi.aiDraftForm.mockResolvedValue({
      ...CONSULT_DRAFT,
      fields: [
        { label: 'Thông tin liên hệ', type: 'heading', required: true, role: 'name', options: ['x'] },
        { label: 'Họ và tên', type: 'short_text', required: true, role: 'name' },
        { label: 'Hài lòng?', type: 'yes_no', required: false, role: 'phone' },
      ],
    });
    renderCreate();
    typeDescription('x');
    clickCreateWithAi();
    await screen.findByDisplayValue(CONSULT_DRAFT.title);
    save();
    await waitFor(() => expect(formAdminApi.createForm).toHaveBeenCalled());
    expect(formAdminApi.createForm.mock.calls[0][0].fields).toEqual([
      { label: 'Thông tin liên hệ', type: 'heading', required: false },
      { label: 'Họ và tên', type: 'short_text', required: true, role: 'name' },
      { label: 'Hài lòng?', type: 'yes_no', required: false },
    ]);
  });

  // Review PR-5 12/10: lựa chọn dạng {label, value} (hình dạng chuẩn hoá của backend) KHÔNG được thành "[object Object]".
  it('nháp có lựa chọn dạng {label, value} → hiện đúng chữ, payload lưu lựa chọn là chữ', async () => {
    formAdminApi.aiDraftForm.mockResolvedValue({
      ...CONSULT_DRAFT,
      fields: [
        { label: 'Họ và tên', type: 'short_text', required: true, role: 'name' },
        { label: 'Bé đã học chưa?', type: 'radio', required: false, options: [{ label: 'Chưa', value: 'chua' }, { label: 'Rồi', value: 'roi' }] },
      ],
    });
    renderCreate();
    typeDescription('x');
    clickCreateWithAi();
    await screen.findByDisplayValue(CONSULT_DRAFT.title);
    expect(screen.queryByText('[object Object]')).toBeNull();
    save();
    await waitFor(() => expect(formAdminApi.createForm).toHaveBeenCalled());
    const radio = formAdminApi.createForm.mock.calls[0][0].fields.find((f) => f.type === 'radio');
    expect(JSON.stringify(radio.options)).not.toContain('[object Object]');
    expect(JSON.stringify(radio.options)).toContain('Chưa');
  });
});

describe('FormEditorPage — "AI gợi ý câu hỏi"', () => {
  const SUGGESTED = [
    { label: 'Bé học lớp mấy?', type: 'short_text', required: true },
    { label: 'Mục tiêu học', type: 'checkbox', required: false, options: ['Giao tiếp', 'Thi chứng chỉ'] },
    { label: 'Tên phụ huynh', type: 'short_text', required: false, role: 'name' },
  ];
  const openSuggest = () => fireEvent.click(screen.getByTestId('form-ai-suggest-toggle'));
  const runSuggest = () => fireEvent.click(screen.getByTestId('form-ai-suggest-run'));

  const startBlank = () => {
    renderCreate();
    fireEvent.click(screen.getByTestId('form-template-blank'));
  };

  it('gửi biểu mẫu đang soạn cho AI, hiện danh sách XEM TRƯỚC (chưa thêm gì), tích chọn từng câu rồi mới thêm vào CUỐI', async () => {
    formAdminApi.aiDraftForm.mockResolvedValue({ mode: 'suggest_questions', fields: SUGGESTED });
    startBlank();
    expect(screen.queryByTestId('form-ai-panel-suggest')).not.toBeInTheDocument();
    openSuggest();
    expect(screen.getByTestId('form-ai-panel-suggest')).toBeInTheDocument();
    expect(formAdminApi.aiDraftForm).not.toHaveBeenCalled(); // mở panel KHÔNG tốn lượt AI
    fireEvent.change(screen.getByLabelText(AI.tools.suggest.noteLabel), { target: { value: 'hỏi thêm về bé' } });
    runSuggest();

    const list = await screen.findByTestId('form-ai-suggestions');
    expect(formAdminApi.aiDraftForm).toHaveBeenCalledTimes(1);
    expect(formAdminApi.aiDraftForm).toHaveBeenCalledWith({
      mode: 'suggest_questions',
      description: 'hỏi thêm về bé',
      locale: 'vi',
      existingForm: {
        title: '',
        description: '',
        fields: [{ key: '', type: 'short_text', label: 'Họ và tên', required: true, role: 'name', placeholder: '', helpText: '', width: 'full', options: [] }],
      },
    });
    expect(within(list).getAllByRole('checkbox')).toHaveLength(3);
    expect(within(list).getByText(/Giao tiếp · Thi chứng chỉ/)).toBeInTheDocument();
    // xem trước thôi: danh sách trường chưa đổi
    expect(screen.getAllByTestId(/^field-row-/)).toHaveLength(1);

    fireEvent.click(within(list).getByRole('checkbox', { name: 'Mục tiêu học' })); // bỏ chọn câu giữa
    expect(screen.getByTestId('form-ai-suggest-add')).toHaveTextContent(AI.tools.suggest.add.replace('{count}', '2'));
    fireEvent.click(screen.getByTestId('form-ai-suggest-add'));

    expect(screen.getAllByTestId(/^field-row-/)).toHaveLength(3);
    expect(screen.queryByTestId('form-ai-suggestions')).not.toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith(AI.tools.suggest.added.replace('{count}', '2'));

    // thứ tự: câu cũ rồi 2 câu mới; vai trò "name" trùng với trường đã có nên bị bỏ ở câu mới
    fireEvent.change(screen.getByPlaceholderText(/Ví dụ: Đăng ký tư vấn lộ trình 1-1/i), { target: { value: 'Biểu mẫu thử' } });
    save();
    await waitFor(() => expect(formAdminApi.createForm).toHaveBeenCalled());
    expect(formAdminApi.createForm.mock.calls[0][0].fields).toEqual([
      { label: 'Họ và tên', type: 'short_text', required: true, role: 'name' },
      { label: 'Bé học lớp mấy?', type: 'short_text', required: true },
      { label: 'Tên phụ huynh', type: 'short_text', required: false },
    ]);
  });

  it('bấm "Gợi ý" hai lần liên tiếp chỉ gọi MỘT lần; đang chờ thì khoá nút', async () => {
    let resolve;
    formAdminApi.aiDraftForm.mockReturnValue(new Promise((r) => { resolve = r; }));
    startBlank();
    openSuggest();
    const run = screen.getByTestId('form-ai-suggest-run');
    act(() => { run.click(); run.click(); }); // cùng một lượt render: chỉ cờ trong ref chặn được lời gọi thứ hai
    expect(formAdminApi.aiDraftForm).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('form-ai-suggest-run')).toBeDisabled();
    expect(screen.getByTestId('form-ai-suggest-toggle')).toBeDisabled();
    await act(async () => { resolve({ fields: SUGGESTED }); });
    expect(await screen.findByTestId('form-ai-suggestions')).toBeInTheDocument();
  });

  it('hết lượt AI (402) → báo trong panel bằng câu chuẩn, không thêm gì; AI không còn gợi ý (422) → hiện câu của server', async () => {
    startBlank();
    openSuggest();
    formAdminApi.aiDraftForm.mockRejectedValueOnce(quotaError());
    runSuggest();
    expect(await screen.findByTestId('form-ai-tools-error')).toHaveTextContent(QUOTA_MESSAGE);

    formAdminApi.aiDraftForm.mockRejectedValueOnce(serverError(422, 'AI không có thêm gợi ý nào mới cho biểu mẫu này.'));
    runSuggest();
    await waitFor(() => expect(screen.getByTestId('form-ai-tools-error')).toHaveTextContent('AI không có thêm gợi ý nào mới cho biểu mẫu này.'));
    expect(screen.getAllByTestId(/^field-row-/)).toHaveLength(1);
  });

  it('chỉ còn chỗ cho 1 câu (29/30 trường): nút thêm đếm đúng 1, có chú thích, và chỉ câu đầu được thêm', async () => {
    const manyFields = Array.from({ length: 29 }, (_, i) => ({ key: `f_q${String(i).padStart(6, '0')}`, label: `Câu ${i + 1}`, type: 'short_text', required: false, role: '' }));
    formAdminApi.aiDraftForm.mockResolvedValue({ fields: SUGGESTED });
    renderEdit({ ...EXISTING_FORM, fields: manyFields });
    await screen.findByDisplayValue(EXISTING_FORM.title);
    openSuggest();
    runSuggest();
    await screen.findByTestId('form-ai-suggestions');

    expect(screen.getByText(AI.tools.suggest.capacityNote.replace('{count}', '1'))).toBeInTheDocument();
    expect(screen.getByTestId('form-ai-suggest-add')).toHaveTextContent(AI.tools.suggest.add.replace('{count}', '1'));
    fireEvent.click(screen.getByTestId('form-ai-suggest-add'));
    expect(screen.getAllByTestId(/^field-row-/)).toHaveLength(30);
    expect(toast.success).toHaveBeenCalledWith(AI.tools.suggest.addedCapped.replaceAll('{count}', '1'));
  });

  it('biểu mẫu đã đủ 30 trường nhập → báo ngay, KHÔNG gọi API', async () => {
    const full = Array.from({ length: 30 }, (_, i) => ({ key: `f_q${String(i).padStart(6, '0')}`, label: `Câu ${i + 1}`, type: 'short_text', required: false, role: '' }));
    renderEdit({ ...EXISTING_FORM, fields: full });
    await screen.findByDisplayValue(EXISTING_FORM.title);
    openSuggest();
    runSuggest();
    expect(await screen.findByTestId('form-ai-tools-error')).toHaveTextContent(AI.tools.suggest.full.replace('{max}', '30'));
    expect(formAdminApi.aiDraftForm).not.toHaveBeenCalled();
  });
});

describe('FormEditorPage — "AI viết lại câu chữ"', () => {
  const REWRITTEN = {
    mode: 'rewrite',
    fields: [
      { key: 'f_name0001', label: 'Họ và tên của bạn', type: 'short_text', required: true, role: 'name' },
      { key: 'f_mail0002', label: 'Địa chỉ email', type: 'email', required: true, role: 'email' },
      { key: 'f_city0003', label: 'Bạn ở tỉnh nào?', type: 'select', required: false, options: ['Hà Nội', 'TP. Hồ Chí Minh', 'Đà Nẵng'] },
    ],
  };
  const openRewrite = () => fireEvent.click(screen.getByTestId('form-ai-rewrite-toggle'));
  const runRewrite = () => fireEvent.click(screen.getByTestId('form-ai-rewrite-run'));
  const rowButton = (idx) => within(screen.getByTestId(`field-row-${idx}`)).getByRole('button', { name: new RegExp(`^Trường #${idx + 1}:`) });

  it('áp ngay lên nhãn + lựa chọn; số lượng, loại, bắt buộc, vai trò, key giữ nguyên; payload lưu đúng', async () => {
    formAdminApi.aiDraftForm.mockResolvedValue(REWRITTEN);
    renderEdit();
    await screen.findByDisplayValue(EXISTING_FORM.title);
    openRewrite();
    expect(formAdminApi.aiDraftForm).not.toHaveBeenCalled();
    runRewrite();

    await waitFor(() => expect(rowButton(0)).toHaveTextContent('Họ và tên của bạn'));
    expect(formAdminApi.aiDraftForm).toHaveBeenCalledTimes(1);
    const request = formAdminApi.aiDraftForm.mock.calls[0][0];
    expect(request.mode).toBe('rewrite');
    expect(request.existingForm.fields.map((f) => [f.key, f.type, f.label, f.required])).toEqual([
      ['f_name0001', 'short_text', 'ten', true],
      ['f_mail0002', 'email', 'mail', true],
      ['f_city0003', 'select', 'tinh', false],
    ]);
    expect(rowButton(1)).toHaveTextContent('Địa chỉ email');
    expect(rowButton(2)).toHaveTextContent('Bạn ở tỉnh nào?');
    expect(screen.getAllByTestId(/^field-row-/)).toHaveLength(3);
    expect(toast.success).toHaveBeenCalledWith(AI.tools.rewrite.done.replace('{count}', '3'));
    expect(screen.getByTestId('form-ai-rewrite-undo')).toBeInTheDocument();

    save();
    await waitFor(() => expect(formAdminApi.updateForm).toHaveBeenCalled());
    expect(formAdminApi.updateForm.mock.calls[0][1].fields).toEqual([
      { key: 'f_name0001', label: 'Họ và tên của bạn', type: 'short_text', required: true, role: 'name' },
      { key: 'f_mail0002', label: 'Địa chỉ email', type: 'email', required: true, role: 'email' },
      { key: 'f_city0003', label: 'Bạn ở tỉnh nào?', type: 'select', required: false, options: ['Hà Nội', 'TP. Hồ Chí Minh', 'Đà Nẵng'] },
    ]);
  });

  it('bấm "Viết lại" hai lần trong cùng một lượt render chỉ gọi MỘT lần (không trừ hai lượt AI)', async () => {
    let resolve;
    formAdminApi.aiDraftForm.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderEdit();
    await screen.findByDisplayValue(EXISTING_FORM.title);
    openRewrite();
    const run = screen.getByTestId('form-ai-rewrite-run');
    act(() => { run.click(); run.click(); });
    expect(formAdminApi.aiDraftForm).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(REWRITTEN); });
    await waitFor(() => expect(rowButton(0)).toHaveTextContent('Họ và tên của bạn'));
  });

  it('HOÀN TÁC 1 bước trả lại đúng chữ cũ (nhãn + lựa chọn) rồi ẩn nút hoàn tác', async () => {
    formAdminApi.aiDraftForm.mockResolvedValue(REWRITTEN);
    renderEdit();
    await screen.findByDisplayValue(EXISTING_FORM.title);
    openRewrite();
    runRewrite();
    await waitFor(() => expect(rowButton(0)).toHaveTextContent('Họ và tên của bạn'));

    fireEvent.click(screen.getByTestId('form-ai-rewrite-undo'));
    expect(rowButton(0)).toHaveTextContent('ten');
    expect(rowButton(1)).toHaveTextContent('mail');
    expect(rowButton(2)).toHaveTextContent('tinh');
    expect(screen.queryByTestId('form-ai-rewrite-undo')).not.toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith(AI.tools.rewrite.undone);

    save();
    await waitFor(() => expect(formAdminApi.updateForm).toHaveBeenCalled());
    expect(formAdminApi.updateForm.mock.calls[0][1].fields[2]).toEqual({ key: 'f_city0003', label: 'tinh', type: 'select', required: false, options: ['hn', 'hcm', 'dn'] });
  });

  it('AI trả sai số lượng lựa chọn → lựa chọn cũ giữ nguyên, nhãn vẫn được viết lại', async () => {
    formAdminApi.aiDraftForm.mockResolvedValue({
      fields: [REWRITTEN.fields[0], REWRITTEN.fields[1], { ...REWRITTEN.fields[2], options: ['Chỉ một'] }],
    });
    renderEdit();
    await screen.findByDisplayValue(EXISTING_FORM.title);
    openRewrite();
    runRewrite();
    await waitFor(() => expect(rowButton(2)).toHaveTextContent('Bạn ở tỉnh nào?'));
    save();
    await waitFor(() => expect(formAdminApi.updateForm).toHaveBeenCalled());
    expect(formAdminApi.updateForm.mock.calls[0][1].fields[2].options).toEqual(['hn', 'hcm', 'dn']);
  });

  it('AI trả số trường khác số đã gửi → từ chối áp, báo lỗi, không đổi gì (cũng không có nút hoàn tác)', async () => {
    formAdminApi.aiDraftForm.mockResolvedValue({ fields: [REWRITTEN.fields[0]] });
    renderEdit();
    await screen.findByDisplayValue(EXISTING_FORM.title);
    openRewrite();
    runRewrite();
    expect(await screen.findByTestId('form-ai-tools-error')).toHaveTextContent(AI.tools.rewrite.failed);
    expect(rowButton(0)).toHaveTextContent('ten');
    expect(screen.queryByTestId('form-ai-rewrite-undo')).not.toBeInTheDocument();
  });

  it('hết lượt AI (402) → báo bằng câu chuẩn, không đổi gì', async () => {
    formAdminApi.aiDraftForm.mockRejectedValue(quotaError());
    renderEdit();
    await screen.findByDisplayValue(EXISTING_FORM.title);
    openRewrite();
    runRewrite();
    expect(await screen.findByTestId('form-ai-tools-error')).toHaveTextContent(QUOTA_MESSAGE);
    expect(rowButton(0)).toHaveTextContent('ten');
  });

  it('biểu mẫu chưa có chữ nào → báo ngay, KHÔNG gọi API', async () => {
    formAdminApi.aiDraftForm.mockResolvedValue(REWRITTEN);
    renderEdit({ ...EXISTING_FORM, fields: [] });
    await screen.findByDisplayValue(EXISTING_FORM.title);
    openRewrite();
    runRewrite();
    expect(await screen.findByTestId('form-ai-tools-error')).toHaveTextContent(AI.tools.rewrite.empty);
    expect(formAdminApi.aiDraftForm).not.toHaveBeenCalled();
  });

  it('tiêu đề / mô tả đang soạn (chưa lưu) được gửi cho AI làm ngữ cảnh', async () => {
    formAdminApi.aiDraftForm.mockResolvedValue(REWRITTEN);
    renderEdit({ ...EXISTING_FORM, description: 'Mô tả cũ' });
    await screen.findByDisplayValue(EXISTING_FORM.title);
    openRewrite();
    runRewrite();
    await waitFor(() => expect(formAdminApi.aiDraftForm).toHaveBeenCalled());
    expect(formAdminApi.aiDraftForm.mock.calls[0][0].existingForm).toMatchObject({ title: EXISTING_FORM.title, description: 'Mô tả cũ' });
  });
});
