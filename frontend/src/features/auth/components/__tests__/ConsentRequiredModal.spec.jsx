import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ConsentRequiredModal from '../ConsentRequiredModal';
import * as authApiService from '../../services/authApi.service';

vi.mock('../../services/authApi.service', () => ({
  submitUserConsents: vi.fn(),
}));

const mockT = (key) => {
  const dict = {
    'consentRequired.title': 'Cập nhật điều khoản & xử lý dữ liệu',
    'consentRequired.titleOutdated': 'Văn bản pháp lý đã cập nhật, vui lòng xác nhận lại',
    'consentRequired.description': 'Vui lòng đọc và đồng ý...',
    'consentRequired.agreeTerms': 'Tôi đồng ý với',
    'consentRequired.termsLink': 'Điều khoản dịch vụ',
    'consentRequired.agreePrivacy': 'Tôi đồng ý với',
    'consentRequired.privacyLink': 'Chính sách bảo mật',
    'consentRequired.agreeDpa': 'Tôi đồng ý với',
    'consentRequired.dpaLink': 'Thỏa thuận xử lý dữ liệu',
    'consentRequired.submit': 'Đồng ý và tiếp tục',
    'consentRequired.saving': 'Đang lưu...',
    'consentRequired.validationRequired': 'Vui lòng tích chọn đầy đủ cả 3 mục',
    'consentRequired.disagreePrompt': 'Không đồng ý? Bạn có thể yêu cầu xoá tài khoản qua trang',
    'consentRequired.accountSettingsLink': 'Liên hệ hỗ trợ',
  };
  return dict[key] || key;
};

vi.mock('../../../../i18n', () => ({
  useI18n: () => ({ t: mockT }),
}));

describe('ConsentRequiredModal (Bắt buộc theo Nghị định 330, không có Để sau)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('không render gì khi isOpen = false', () => {
    const { container } = render(<ConsentRequiredModal isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('render modal khi isOpen = true, không có nút "Để sau", tiêu đề mặc định', () => {
    render(<ConsentRequiredModal isOpen={true} />);

    expect(screen.getByText('Cập nhật điều khoản & xử lý dữ liệu')).toBeInTheDocument();
    // Bắt buộc: KHÔNG có nút "Để sau"
    expect(screen.queryByText(/Để sau|Later/i)).not.toBeInTheDocument();
    // Có dòng hướng dẫn xoá tài khoản nếu không đồng ý
    expect(screen.getByText('Không đồng ý? Bạn có thể yêu cầu xoá tài khoản qua trang')).toBeInTheDocument();
    expect(screen.getByText('Liên hệ hỗ trợ')).toHaveAttribute('href', '/contact');
  });

  it('đổi tiêu đề khi isOutdated = true', () => {
    render(<ConsentRequiredModal isOpen={true} isOutdated={true} />);

    expect(
      screen.getByText('Văn bản pháp lý đã cập nhật, vui lòng xác nhận lại')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Cập nhật điều khoản & xử lý dữ liệu')
    ).not.toBeInTheDocument();
  });

  it('overlay không có onClick handler đóng modal, bấm overlay không crash hay đóng', () => {
    render(<ConsentRequiredModal isOpen={true} />);
    const overlay = document.querySelector('.modal-overlay');
    expect(overlay).toBeInTheDocument();

    // Click overlay không làm biến mất modal
    fireEvent.click(overlay);
    expect(screen.getByText('Cập nhật điều khoản & xử lý dữ liệu')).toBeInTheDocument();
  });

  it('chỉ submit được khi tick đủ cả 3 checkbox', async () => {
    authApiService.submitUserConsents.mockResolvedValue({ success: true });
    const onConsented = vi.fn();

    render(<ConsentRequiredModal isOpen={true} onConsented={onConsented} />);

    const submitBtn = screen.getByRole('button', { name: 'Đồng ý và tiếp tục' });
    expect(submitBtn).toBeDisabled();

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(3);

    // Tick 2/3 checkbox -> vẫn disabled
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    expect(submitBtn).toBeDisabled();

    // Tick checkbox thứ 3 -> enable
    fireEvent.click(checkboxes[2]);
    expect(submitBtn).not.toBeDisabled();

    // Submit form
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(authApiService.submitUserConsents).toHaveBeenCalledWith({
        terms: true,
        privacy: true,
        dpa: true,
      });
      expect(onConsented).toHaveBeenCalled();
    });
  });
});
