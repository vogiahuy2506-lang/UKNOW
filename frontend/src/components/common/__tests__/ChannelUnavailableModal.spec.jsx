import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ChannelUnavailableModal from '../ChannelUnavailableModal';
import { useAuthStore } from '../../../stores/authStore';
import viTranslations from '../../../i18n/vi';

/**
 * PLAN_KENH_KHONG_AN_KHOA_VA_GOI_Y_MUA_2026-10-11 — hộp giải thích vì sao kênh bị khoá + thẻ chọn mua đúng thứ còn thiếu.
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

  it('not_in_plan/accounts (Telegram): tiêu đề "Mở khoá Telegram", thẻ khuyên dùng "Mua thêm tài khoản Telegram" -> /app/topup, thẻ "Nâng gói" -> /app/billing', () => {
    const onClose = renderModal({ channel: 'telegram', info: { reason: 'not_in_plan', detail: 'accounts' } });
    expect(screen.getByRole('dialog')).toHaveAttribute('data-reason', 'not_in_plan');
    expect(screen.getByRole('heading', { name: 'Mở khoá Telegram' })).toBeInTheDocument();
    expect(screen.getByTestId('channel-unavailable-keep-history')).toBeInTheDocument();
    const buy = screen.getByTestId('channel-unavailable-action-buySlot');
    expect(buy).toHaveTextContent('Mua thêm tài khoản Telegram');
    expect(buy).toHaveTextContent('Dùng Telegram ngay với gói hiện tại.');
    fireEvent.click(buy);
    expect(navigateMock).toHaveBeenCalledWith('/app/topup');
    expect(onClose).toHaveBeenCalledTimes(1);

    const upgrade = screen.getByTestId('channel-unavailable-action-upgrade');
    expect(upgrade).toHaveTextContent('Nâng gói');
    fireEvent.click(upgrade);
    expect(navigateMock).toHaveBeenLastCalledWith('/app/billing');
  });

  it('not_in_plan/messages: hạn mức tin của gói bằng 0 -> CHỈ có thẻ "Nâng gói" (mua tài khoản không mở được kênh)', () => {
    renderModal({ channel: 'whatsapp', info: { reason: 'not_in_plan', detail: 'messages' } });
    expect(screen.queryByTestId('channel-unavailable-action-buySlot')).toBeNull();
    expect(screen.queryByTestId('channel-unavailable-action-buyQuota')).toBeNull();
    fireEvent.click(screen.getByTestId('channel-unavailable-action-upgrade'));
    expect(navigateMock).toHaveBeenCalledWith('/app/billing');
  });

  it('quota_exhausted/channel: "Đã dùng hết lượt Zalo", thẻ khuyên dùng "Mua thêm lượt gửi" -> /app/topup, thẻ Nâng gói; không có dòng giữ lịch sử', () => {
    renderModal({ channel: 'zalo', info: { reason: 'quota_exhausted', detail: 'channel', used: 300, limit: 300 } });
    expect(screen.getByRole('heading', { name: 'Đã dùng hết lượt Zalo' })).toBeInTheDocument();
    expect(screen.getByText(/300\/300/)).toBeInTheDocument();
    expect(screen.queryByTestId('channel-unavailable-keep-history')).toBeNull();
    fireEvent.click(screen.getByTestId('channel-unavailable-action-buyQuota'));
    expect(navigateMock).toHaveBeenCalledWith('/app/topup');
    expect(screen.getByTestId('channel-unavailable-action-upgrade')).toBeInTheDocument();
  });

  it('quota_exhausted/combined: chỉ thẻ "Nâng gói" (trần tổng không có ví bù)', () => {
    renderModal({ channel: 'email', info: { reason: 'quota_exhausted', detail: 'combined', used: 1000, limit: 1000 } });
    expect(screen.queryByTestId('channel-unavailable-action-buyQuota')).toBeNull();
    fireEvent.click(screen.getByTestId('channel-unavailable-action-upgrade'));
    expect(navigateMock).toHaveBeenCalledWith('/app/billing');
  });

  it('plan_expired: "Gói đã hết hạn", thẻ "Gia hạn gói" -> /app/billing, không có thẻ mua thêm', () => {
    renderModal({ channel: 'telegram', info: { reason: 'plan_expired' } });
    expect(screen.getByRole('heading', { name: 'Gói đã hết hạn' })).toBeInTheDocument();
    expect(screen.queryByTestId('channel-unavailable-action-buySlot')).toBeNull();
    expect(screen.queryByTestId('channel-unavailable-action-upgrade')).toBeNull();
    fireEvent.click(screen.getByTestId('channel-unavailable-action-renew'));
    expect(navigateMock).toHaveBeenCalledWith('/app/billing');
  });

  it('nhân viên (ngữ cảnh chủ) không vào được trang Nạp/Gói -> KHÔNG có thẻ điều hướng, chỉ lời nhắn liên hệ chủ + nút Đã hiểu', () => {
    useAuthStore.setState({ activeContext: { type: 'employee', ownerId: 5 } });
    const onClose = renderModal({ channel: 'telegram', info: { reason: 'not_in_plan', detail: 'accounts' } });
    expect(screen.getByTestId('channel-unavailable-owner-only')).toBeInTheDocument();
    for (const key of ['buySlot', 'buyQuota', 'upgrade', 'renew']) {
      expect(screen.queryByTestId(`channel-unavailable-action-${key}`)).toBeNull();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Đã hiểu' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('đóng bằng nút "Để sau", phím Esc và bấm nền; không điều hướng', () => {
    const onClose = renderModal({ channel: 'zalo', info: { reason: 'not_in_plan', detail: 'accounts' } });
    fireEvent.click(screen.getByRole('button', { name: 'Để sau' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByTestId('channel-unavailable-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('bẫy focus: Tab ở nút cuối quay về nút đầu, Shift+Tab ở nút đầu nhảy xuống nút cuối', () => {
    renderModal({ channel: 'zalo', info: { reason: 'not_in_plan', detail: 'accounts' } });
    const first = screen.getByTestId('channel-unavailable-action-buySlot');
    const last = screen.getByTestId('channel-unavailable-close');
    last.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
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
