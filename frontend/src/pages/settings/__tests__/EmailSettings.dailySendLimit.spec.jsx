/**
 * LENH_GIAO_GIOI_HAN_GUI_THEO_NGAY tiếp nối 2026-09-23, PR-4 (email). Bẫy lớn nhất: payload PUT
 * luôn mang `userDailySendLimit` (`{...formData}`), và backend coi "có mặt trong body" = ghi đè
 * (PR-3, `'userDailySendLimit' in payload`). Quên nạp giá trị cũ vào form lúc chọn tài khoản (chỗ
 * `setFormData` trong `handleSelectEmail`) thì mỗi lần sửa bất kỳ field nào khác, giới hạn đã đặt
 * bị XOÁ SẠCH im lặng, vẫn báo "Lưu thành công".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EmailSettings from '../EmailSettings';
import emailSettingsApiService from '../../../features/settings/services/emailSettingsApi.service';

vi.mock('../../../i18n', () => ({
  useI18n: () => ({ t: (key) => key }),
}));

vi.mock('../../../features/settings/services/emailSettingsApi.service', () => ({
  default: {
    listEmailSettings: vi.fn(),
    getActiveSettings: vi.fn(),
    getEmailSetting: vi.fn(),
    createEmailSetting: vi.fn(),
    updateEmailSetting: vi.fn(),
    deleteEmailSetting: vi.fn(),
    testConnection: vi.fn(),
    sendTestEmail: vi.fn(),
    sendEmail: vi.fn(),
    initiateDomainVerification: vi.fn(),
    getDomainVerificationStatus: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const rawAccount = {
  id: 9,
  name: 'Digiso',
  replyTo: 'no-reply@digiso.vn',
  emailMode: 'smtp',
  smtpHost: 'smtp.digiso.vn',
  smtpPort: '587',
  smtpUsername: 'no-reply@digiso.vn',
  smtpPassword: 'secret',
  userDailySendLimit: 50,
};

const listItem = (over = {}) => ({ id: 9, name: 'Digiso', email: 'no-reply@digiso.vn', ...over });

beforeEach(() => {
  vi.clearAllMocks();
  emailSettingsApiService.listEmailSettings.mockResolvedValue({
    data: { data: { items: [listItem()] } },
  });
  emailSettingsApiService.getEmailSetting.mockResolvedValue({ data: { data: rawAccount } });
});

const selectAccount = async () => {
  render(<EmailSettings />);
  await waitFor(() => expect(screen.getByText('Digiso')).toBeInTheDocument());
  fireEvent.click(screen.getByText('Digiso'));
  await waitFor(() => expect(emailSettingsApiService.getEmailSetting).toHaveBeenCalledWith(9));
  // input hiện giá trị 50 (đợi setFormData chạy xong sau await getEmailSetting)
  await waitFor(() => expect(screen.getByDisplayValue('50')).toBeInTheDocument());
};

const submitForm = () => {
  const form = document.querySelector('form');
  fireEvent.submit(form);
};

describe('EmailSettings — ô Giới hạn gửi/ngày (PR-4)', () => {
  it('chọn tài khoản đã có giới hạn 50 → ô nhập hiện đúng 50 (không phải rỗng)', async () => {
    await selectAccount();
    expect(screen.getByDisplayValue('50')).toBeInTheDocument();
  });

  it('BẪY: đặt 50 → đổi tên tài khoản (không đụng ô giới hạn) → Lưu → payload vẫn gửi 50, không phải null', async () => {
    emailSettingsApiService.updateEmailSetting.mockResolvedValueOnce({ data: { success: true } });
    await selectAccount();

    const nameInput = screen.getByDisplayValue('Digiso');
    fireEvent.change(nameInput, { target: { value: 'Digiso đổi tên' } });
    submitForm();

    await waitFor(() => expect(emailSettingsApiService.updateEmailSetting).toHaveBeenCalledTimes(1));
    const [, payload] = emailSettingsApiService.updateEmailSetting.mock.calls[0];
    expect(payload.userDailySendLimit).toBe(50);
    expect(payload.name).toBe('Digiso đổi tên');
  });

  it('xoá trắng ô giới hạn → Lưu → payload gửi userDailySendLimit: null (không phải rỗng/undefined)', async () => {
    emailSettingsApiService.updateEmailSetting.mockResolvedValueOnce({ data: { success: true } });
    await selectAccount();

    fireEvent.change(screen.getByDisplayValue('50'), { target: { value: '' } });
    submitForm();

    await waitFor(() => expect(emailSettingsApiService.updateEmailSetting).toHaveBeenCalledTimes(1));
    const [, payload] = emailSettingsApiService.updateEmailSetting.mock.calls[0];
    expect(payload.userDailySendLimit).toBeNull();
  });

  it('nhập 150 → không chặn, vẫn lưu được với đúng giá trị 150 (chính sách sếp chốt, không phải trần kỹ thuật)', async () => {
    emailSettingsApiService.updateEmailSetting.mockResolvedValueOnce({ data: { success: true } });
    await selectAccount();

    fireEvent.change(screen.getByDisplayValue('50'), { target: { value: '150' } });
    submitForm();

    await waitFor(() => expect(emailSettingsApiService.updateEmailSetting).toHaveBeenCalledTimes(1));
    const [, payload] = emailSettingsApiService.updateEmailSetting.mock.calls[0];
    expect(payload.userDailySendLimit).toBe(150);
  });

  /**
   * Ngưỡng cảnh báo của EMAIL là 2.000 — bằng `daily_email_limit` của gói trả tiền cao nhất (Pro),
   * đo từ bảng `plans` trên production 23/09: trial 30 · starter 170 · basic 700 · pro 2.000.
   * KHÁC ngưỡng 100 của Zalo: bên đó 100 là số an toàn chống khoá nick, không liên quan gói.
   * Bản đầu áp chung 100 cho cả hai nên cảnh báo email nổ với gần như mọi khách thật — mà cảnh báo
   * nổ suốt thì người ta thôi đọc.
   */
  it('nhập 1.500 (dưới mức gói Pro) → KHÔNG hiện cảnh báo', async () => {
    await selectAccount();
    fireEvent.change(screen.getByDisplayValue('50'), { target: { value: '1500' } });
    await waitFor(() => expect(screen.getByDisplayValue('1500')).toBeInTheDocument());
    expect(screen.queryByText('emailSettings.dailySendLimitHighWarning')).not.toBeInTheDocument();
  });

  it('nhập 2.500 (trên mọi gói trả tiền) → HIỆN cảnh báo, vẫn không chặn', async () => {
    await selectAccount();
    fireEvent.change(screen.getByDisplayValue('50'), { target: { value: '2500' } });
    // `t` trong spec này trả về CHÍNH khoá (mock ở đầu file), nên tìm theo khoá chứ không
    // theo câu tiếng Việt — câu chữ đổi được, ngưỡng thì không.
    await waitFor(() => expect(screen.getByText('emailSettings.dailySendLimitHighWarning')).toBeInTheDocument());
  });

  // 'abc' không nằm trong danh sách: ô là <input type="number"> nên trình duyệt (và jsdom) đã chặn
  // ký tự chữ ngay từ lúc gõ, không bao giờ tới được state — chặn "ở tầng trình duyệt" còn chắc hơn
  // chặn bằng JS. Ba giá trị dưới đây là số hợp lệ về mặt cú pháp nhưng sai nghiệp vụ (0, âm, thập
  // phân) nên phải tới được validateForm() để chặn đúng chỗ.
  it.each(['0', '-5', '1.5'])('nhập %p → chặn ở form, KHÔNG gọi API', async (badValue) => {
    await selectAccount();

    fireEvent.change(screen.getByDisplayValue('50'), { target: { value: badValue } });
    submitForm();

    await waitFor(() => expect(screen.getByText('emailSettings.dailySendLimitInvalid')).toBeInTheDocument());
    expect(emailSettingsApiService.updateEmailSetting).not.toHaveBeenCalled();
  });
});
