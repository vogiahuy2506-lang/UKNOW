import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import ReferralPromptModal from '../ReferralPromptModal';

const stableT = (key, params) => {
  if (params && Object.keys(params).length > 0) {
    return `${key}:${JSON.stringify(params)}`;
  }
  return key;
};
vi.mock('../../../../i18n', () => ({ useI18n: () => ({ t: stableT }) }));

const m = vi.hoisted(() => ({
  bindReferrer: vi.fn(),
}));

vi.mock('../../services/authApi.service', () => ({
  bindReferrer: m.bindReferrer,
}));

const noop = () => {};

describe('ReferralPromptModal (Nhập mã giới thiệu onboarding)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('không render gì nếu isOpen = false', () => {
    const { container } = render(
      <ReferralPromptModal isOpen={false} onClose={noop} onSuccess={noop} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('render đầy đủ tiêu đề, mô tả, lưu ý cảnh báo, input và nút khi isOpen = true', () => {
    render(<ReferralPromptModal isOpen onClose={noop} onSuccess={noop} />);

    expect(screen.getByText('referralPromptModal.title')).toBeInTheDocument();
    expect(screen.getByText('referralPromptModal.description')).toBeInTheDocument();
    expect(screen.getByText('referralPromptModal.warningNote')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('referralPromptModal.placeholder')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'referralPromptModal.skip' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'referralPromptModal.submit' })).toBeInTheDocument();
  });

  it('tự động chuyển mã nhập sang chữ in hoa và bỏ khoảng trắng', () => {
    render(<ReferralPromptModal isOpen onClose={noop} onSuccess={noop} />);

    const input = screen.getByPlaceholderText('referralPromptModal.placeholder');
    fireEvent.change(input, { target: { value: ' ref 123 ab ' } });

    expect(input.value).toBe('REF123AB');
  });

  it('bấm nút "Bỏ qua" gọi callback onClose', () => {
    const onClose = vi.fn();
    render(<ReferralPromptModal isOpen onClose={onClose} onSuccess={noop} />);

    fireEvent.click(screen.getByRole('button', { name: 'referralPromptModal.skip' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('submit thành công gọi bindReferrer và onSuccess', async () => {
    const responseData = {
      referredByUserId: 10,
      referredAt: '2026-09-18T10:00:00.000Z',
      referrerCode: 'VIPREF',
      referrerName: 'Nguyen Van A',
    };
    m.bindReferrer.mockResolvedValue({ success: true, data: responseData });
    const onSuccess = vi.fn();

    render(<ReferralPromptModal isOpen onClose={noop} onSuccess={onSuccess} />);

    const input = screen.getByPlaceholderText('referralPromptModal.placeholder');
    fireEvent.change(input, { target: { value: 'vipref' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'referralPromptModal.submit' }));
    });

    expect(m.bindReferrer).toHaveBeenCalledWith({ referralCode: 'VIPREF' });
    expect(onSuccess).toHaveBeenCalledWith(responseData);
  });

  it('xử lý các mã lỗi đặc biệt: SELF_REFERRAL, ALREADY_REFERRED, REFERRAL_EXPIRED, INVALID_REFERRAL_CODE', async () => {
    m.bindReferrer.mockRejectedValueOnce({
      response: { data: { code: 'SELF_REFERRAL' } },
    });

    render(<ReferralPromptModal isOpen onClose={noop} onSuccess={noop} />);

    const input = screen.getByPlaceholderText('referralPromptModal.placeholder');
    fireEvent.change(input, { target: { value: 'MYCODE' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'referralPromptModal.submit' }));
    });
    expect(screen.getByText('referralPromptModal.selfReferral')).toBeInTheDocument();

    // Thử lỗi ALREADY_REFERRED
    m.bindReferrer.mockRejectedValueOnce({
      response: { data: { code: 'ALREADY_REFERRED' } },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'referralPromptModal.submit' }));
    });
    expect(screen.getByText('referralPromptModal.alreadyReferred')).toBeInTheDocument();

    // Thử lỗi REFERRAL_EXPIRED
    m.bindReferrer.mockRejectedValueOnce({
      response: { data: { code: 'REFERRAL_EXPIRED' } },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'referralPromptModal.submit' }));
    });
    expect(screen.getByText('referralPromptModal.timeExpired')).toBeInTheDocument();

    // Thử lỗi INVALID_REFERRAL_CODE
    m.bindReferrer.mockRejectedValueOnce({
      response: { data: { code: 'INVALID_REFERRAL_CODE' } },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'referralPromptModal.submit' }));
    });
    expect(screen.getByText('referralPromptModal.invalidCode')).toBeInTheDocument();
  });
});
