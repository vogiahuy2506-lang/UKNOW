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
    'auth.agreeAllIntro': 'Tôi đã đọc và đồng ý với',
    'auth.termsOfUse': 'Điều khoản sử dụng',
    'auth.privacyPolicy': 'Chính sách bảo mật',
    'auth.publicDPA': 'Thỏa thuận xử lý dữ liệu',
    'auth.and': 'và',
    'consentRequired.submit': 'Đồng ý và tiếp tục',
    'consentRequired.saving': 'Đang lưu...',
    'consentRequired.declineAndLogout': 'Không đồng ý và đăng xuất',
    'consentRequired.loggingOut': 'Đang đăng xuất...',
    'consentRequired.validationRequired': 'Vui lòng tích chọn đầy đủ cả 3 mục',
    'consentRequired.disagreePrompt': 'Muốn xoá hẳn tài khoản và dữ liệu?',
    'consentRequired.accountSettingsLink': 'Liên hệ hỗ trợ',
  };
  return dict[key] || key;
};

vi.mock('../../../../i18n', () => ({
  useI18n: () => ({ t: mockT }),
}));

describe('ConsentRequiredModal (bắt buộc, một ô đồng ý, không có Để sau)', () => {
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
    // Có nút "Không đồng ý và đăng xuất"
    expect(screen.getByRole('button', { name: 'Không đồng ý và đăng xuất' })).toBeInTheDocument();
    // Có dòng hướng dẫn xoá tài khoản nếu không đồng ý
    expect(screen.getByText('Muốn xoá hẳn tài khoản và dữ liệu?')).toBeInTheDocument();
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

  it('đúng 1 ô tích với 3 link văn bản mở tab mới; chưa tích thì nút Đồng ý khoá và không gửi', async () => {
    render(<ConsentRequiredModal isOpen={true} />);

    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    for (const [name, href] of [
      ['Điều khoản sử dụng', '/terms'],
      ['Chính sách bảo mật', '/privacy-policy'],
      ['Thỏa thuận xử lý dữ liệu', '/public-dpa'],
    ]) {
      const link = screen.getByRole('link', { name });
      expect(link).toHaveAttribute('href', href);
      expect(link).toHaveAttribute('target', '_blank');
    }

    const submitBtn = screen.getByRole('button', { name: 'Đồng ý và tiếp tục' });
    expect(submitBtn).toBeDisabled();
    // Ép submit form khi chưa tích (vd Enter) cũng không được gửi
    fireEvent.submit(submitBtn.closest('form'));
    await waitFor(() => {
      expect(screen.getByText('Vui lòng tích chọn đầy đủ cả 3 mục')).toBeInTheDocument();
    });
    expect(authApiService.submitUserConsents).not.toHaveBeenCalled();
  });

  it('tích 1 ô → nút mở khoá và gửi đủ 3 khoá terms/privacy/dpa = true', async () => {
    authApiService.submitUserConsents.mockResolvedValue({ success: true });
    const onConsented = vi.fn();

    render(<ConsentRequiredModal isOpen={true} onConsented={onConsented} />);

    const submitBtn = screen.getByRole('button', { name: 'Đồng ý và tiếp tục' });
    expect(submitBtn).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox'));
    expect(submitBtn).not.toBeDisabled();

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

  it('bấm Không đồng ý → gọi onDecline 1 lần, không gọi submitUserConsents', async () => {
    const onDecline = vi.fn().mockResolvedValue(undefined);

    render(<ConsentRequiredModal isOpen={true} onDecline={onDecline} />);

    const declineBtn = screen.getByRole('button', { name: 'Không đồng ý và đăng xuất' });
    expect(declineBtn).not.toBeDisabled();

    fireEvent.click(declineBtn);

    await waitFor(() => {
      expect(onDecline).toHaveBeenCalledTimes(1);
      expect(authApiService.submitUserConsents).not.toHaveBeenCalled();
    });
  });

  it('đang submit thì nút từ chối disabled', async () => {
    let resolveSubmit;
    authApiService.submitUserConsents.mockReturnValue(
      new Promise((resolve) => {
        resolveSubmit = resolve;
      })
    );

    render(<ConsentRequiredModal isOpen={true} />);

    fireEvent.click(screen.getByRole('checkbox'));

    const submitBtn = screen.getByRole('button', { name: 'Đồng ý và tiếp tục' });
    const declineBtn = screen.getByRole('button', { name: 'Không đồng ý và đăng xuất' });

    fireEvent.click(submitBtn);

    expect(screen.getByRole('button', { name: 'Đang lưu...' })).toBeDisabled();
    expect(declineBtn).toBeDisabled();

    resolveSubmit({ success: true });
    await waitFor(() => {
      expect(authApiService.submitUserConsents).toHaveBeenCalled();
    });
  });

  it('đang từ chối thì cả hai nút disabled và nút từ chối hiện "Đang đăng xuất..."', async () => {
    let resolveDecline;
    const onDecline = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveDecline = resolve;
      })
    );

    render(<ConsentRequiredModal isOpen={true} onDecline={onDecline} />);

    const declineBtn = screen.getByRole('button', { name: 'Không đồng ý và đăng xuất' });
    const submitBtn = screen.getByRole('button', { name: 'Đồng ý và tiếp tục' });

    fireEvent.click(declineBtn);

    // Cả hai nút đều disabled
    expect(submitBtn).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Đang đăng xuất...' })).toBeDisabled();

    resolveDecline();
    await waitFor(() => {
      expect(onDecline).toHaveBeenCalledTimes(1);
    });
  });
});
