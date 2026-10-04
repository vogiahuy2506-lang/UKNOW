/**
 * H-20 — ô chọn tài khoản Zalo: chỉ hiện từ 2 tài khoản, mục đầu "Tất cả tài khoản Zalo" (không lọc ngầm),
 * tài khoản hết phiên ghi mờ thay vì nền vàng, gợi ý đồng bộ nằm ở tooltip, không CTA ở tab "Tất cả".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ZaloAccountSelector from '../ZaloAccountSelector';
import chatbotApi from '../../chatbot/services/chatbotApi.service';

vi.mock('../../../i18n', () => {
  const t = (key) => key;
  return { useI18n: () => ({ t, locale: 'vi' }) };
});
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../chatbot/services/chatbotApi.service', () => ({
  default: { syncZaloAll: vi.fn() },
}));

const ACCOUNTS = [
  { id: 103, displayName: 'Nhật Minh', isConnected: true },
  { id: 45, displayName: 'Cũ', isConnected: false },
];

const renderSelector = (props = {}) => render(
  <MemoryRouter>
    <ZaloAccountSelector
      selectedAccountId={null}
      onAccountChange={vi.fn()}
      onSyncComplete={vi.fn()}
      statusAccounts={ACCOUNTS}
      {...props}
    />
  </MemoryRouter>
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ZaloAccountSelector (H-20)', () => {
  it('mặc định "Tất cả tài khoản Zalo" (không tự chọn ngầm một tài khoản)', () => {
    renderSelector();

    expect(screen.getByText('inbox.allZaloAccounts')).toBeInTheDocument();
    expect(screen.queryByText('Nhật Minh')).not.toBeInTheDocument();
  });

  it('mở ra: mục đầu là "Tất cả", tài khoản hết phiên ghi mờ "— cần đăng nhập lại"; chọn gọi onAccountChange', () => {
    const onAccountChange = vi.fn();
    renderSelector({ onAccountChange });

    fireEvent.click(screen.getByText('inbox.allZaloAccounts'));
    expect(screen.getByText(/Cũ — inbox\.accountNeedsRelogin/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Nhật Minh'));
    expect(onAccountChange).toHaveBeenCalledWith(103);

    fireEvent.click(screen.getByText('inbox.allZaloAccounts'));
    fireEvent.click(screen.getAllByText('inbox.allZaloAccounts').at(-1));
    expect(onAccountChange).toHaveBeenLastCalledWith(null);
  });

  it('chỉ MỘT tài khoản → không có ô chọn, chỉ còn nút đồng bộ có tooltip thay cho dòng gợi ý', () => {
    renderSelector({ statusAccounts: [ACCOUNTS[0]] });

    expect(screen.queryByText('inbox.allZaloAccounts')).not.toBeInTheDocument();
    const syncButton = screen.getByTitle('inbox.syncTooltip');
    expect(syncButton).toBeInTheDocument();
    expect(screen.queryByText('inbox.syncTipShort')).not.toBeInTheDocument();
  });

  it('không có nền vàng cảnh báo dù có tài khoản hết phiên', () => {
    const { container } = renderSelector();

    expect(container.innerHTML).not.toMatch(/amber-50|bg-amber/);
  });

  it('không có tài khoản: ẩn hẳn ở tab "Tất cả"; hiện lời mời kết nối ở tab Zalo', () => {
    const { container, rerender } = renderSelector({ statusAccounts: [] });
    expect(container.textContent).toBe('');

    rerender(
      <MemoryRouter>
        <ZaloAccountSelector statusAccounts={[]} showEmptyCta onAccountChange={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByText('inbox.noZaloAccount')).toBeInTheDocument();
  });

  it('đồng bộ khi đang chọn "tất cả" dùng tài khoản đang kết nối đầu tiên', async () => {
    chatbotApi.syncZaloAll.mockResolvedValue({ data: { success: true, data: { groups: { synced: 3, totalGroups: 3 } } } });
    const onSyncComplete = vi.fn();
    renderSelector({ onSyncComplete });

    fireEvent.click(screen.getByTitle('inbox.syncTooltip'));

    await waitFor(() => expect(chatbotApi.syncZaloAll).toHaveBeenCalledWith(103));
    await waitFor(() => expect(onSyncComplete).toHaveBeenCalled());
  });

  it('nhân viên không quyền đồng bộ (canSync=false) → không có nút đồng bộ', () => {
    renderSelector({ canSync: false });
    expect(screen.queryByTitle('inbox.syncTooltip')).not.toBeInTheDocument();
  });
});
