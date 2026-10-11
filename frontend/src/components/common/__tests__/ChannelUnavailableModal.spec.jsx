import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ChannelUnavailableModal from '../ChannelUnavailableModal';
import { useAuthStore } from '../../../stores/authStore';
import viTranslations from '../../../i18n/vi';

/**
 * PLAN_KENH_KHONG_AN_KHOA_VA_GOI_Y_MUA_2026-10-11 — modal giải thích vì sao kênh bị khoá + nút mua đúng thứ còn thiếu.
 */
const navigateMock = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

const getNested = (obj, path) => path.split('.').reduce((acc, part) => acc?.[part], obj);
vi.mock('../../../i18n', () => ({
  useI18n: () => ({
    t: (key, params = {}) => {
      const raw = getNested(viTranslations, key);
      if (typeof raw !== 'string') return key;
      return raw.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`));
    },
  }),
}));

const renderModal = (props) => {
  const onClose = props.onClose || vi.fn();
  render(<ChannelUnavailableModal {...props} onClose={onClose} />);
  return onClose;
};

describe('ChannelUnavailableModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ activeContext: { type: 'self' } });
  });

  it('not_in_plan/accounts (Telegram): tiêu đề "Gói hiện tại không có Telegram", nút chính "Mua thêm slot tài khoản Telegram" -> /app/topup, phụ "Nâng gói" -> /app/billing', () => {
    const onClose = renderModal({ channel: 'telegram', info: { reason: 'not_in_plan', detail: 'accounts' } });
    expect(screen.getByRole('dialog')).toHaveAttribute('data-reason', 'not_in_plan');
    expect(screen.getByText('Gói hiện tại không có Telegram')).toBeInTheDocument();
    const buy = screen.getByRole('button', { name: 'Mua thêm slot tài khoản Telegram' });
    fireEvent.click(buy);
    expect(navigateMock).toHaveBeenCalledWith('/app/topup');
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Nâng gói' }));
    expect(navigateMock).toHaveBeenLastCalledWith('/app/billing');
  });

  it('not_in_plan/messages: hạn mức tin của gói bằng 0 -> CHỈ có "Nâng gói" (mua slot không mở được kênh)', () => {
    renderModal({ channel: 'whatsapp', info: { reason: 'not_in_plan', detail: 'messages' } });
    expect(screen.queryByTestId('channel-unavailable-action-buySlot')).toBeNull();
    fireEvent.click(screen.getByTestId('channel-unavailable-action-upgrade'));
    expect(navigateMock).toHaveBeenCalledWith('/app/billing');
  });

  it('quota_exhausted/channel: "Đã hết lượt gửi Zalo trong kỳ (300/300)", nút chính "Mua thêm lượt" -> /app/topup, phụ Nâng gói', () => {
    renderModal({ channel: 'zalo', info: { reason: 'quota_exhausted', detail: 'channel', used: 300, limit: 300 } });
    expect(screen.getByText('Đã hết lượt gửi Zalo trong kỳ (300/300)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mua thêm lượt' }));
    expect(navigateMock).toHaveBeenCalledWith('/app/topup');
    expect(screen.getByRole('button', { name: 'Nâng gói' })).toBeInTheDocument();
  });

  it('quota_exhausted/combined: chỉ "Nâng gói" (trần tổng không có ví bù)', () => {
    renderModal({ channel: 'email', info: { reason: 'quota_exhausted', detail: 'combined', used: 1000, limit: 1000 } });
    expect(screen.queryByRole('button', { name: 'Mua thêm lượt' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Nâng gói' })).toBeInTheDocument();
  });

  it('plan_expired: "Gói đã hết hạn — gửi tin tạm dừng", nút chính "Gia hạn gói" -> /app/billing', () => {
    renderModal({ channel: 'telegram', info: { reason: 'plan_expired' } });
    expect(screen.getByText('Gói đã hết hạn — gửi tin tạm dừng')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Gia hạn gói' }));
    expect(navigateMock).toHaveBeenCalledWith('/app/billing');
  });

  it('nhân viên (ngữ cảnh chủ) không vào được trang Nạp/Gói -> KHÔNG có nút điều hướng, chỉ lời nhắn liên hệ chủ + nút Đóng', () => {
    useAuthStore.setState({ activeContext: { type: 'employee', ownerId: 5 } });
    renderModal({ channel: 'telegram', info: { reason: 'not_in_plan', detail: 'accounts' } });
    expect(screen.getByTestId('channel-unavailable-owner-only')).toBeInTheDocument();
    expect(screen.queryByTestId('channel-unavailable-action-buySlot')).toBeNull();
    expect(screen.queryByTestId('channel-unavailable-action-upgrade')).toBeNull();
    expect(screen.getByRole('button', { name: 'Đóng' })).toBeInTheDocument();
  });

  it('đóng bằng nút Đóng, phím Esc và bấm nền; không điều hướng', () => {
    const onClose = renderModal({ channel: 'zalo', info: { reason: 'not_in_plan', detail: 'accounts' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByTestId('channel-unavailable-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('onClose truyền mũi tên inline mới mỗi lần vẽ lại vẫn gọi bản mới nhất khi Esc (giữ qua ref, không gắn/gỡ phím mỗi lần)', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <ChannelUnavailableModal channel="zalo" info={{ reason: 'plan_expired' }} onClose={() => first()} />
    );
    rerender(<ChannelUnavailableModal channel="zalo" info={{ reason: 'plan_expired' }} onClose={() => second()} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
