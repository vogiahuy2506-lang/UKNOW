/**
 * PR-E2 — NodeConfigModal, node send_telegram, nguồn "Nhóm Telegram" (chiến dịch telegram_group).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NodeConfigModal from '../NodeConfigModal';
import campaignBuilderApiService from '../../services/campaignBuilderApi.service';
import viTranslations from '../../../../i18n/vi';

const mockT = (key, params = {}) => {
  const val = key.split('.').reduce((acc, part) => acc?.[part], viTranslations);
  if (typeof val !== 'string') return key;
  return val.replace(/\{(\w+)\}/g, (_, name) => (params[name] ?? `{${name}}`));
};
vi.mock('../../../../i18n', () => ({ useI18n: () => ({ t: mockT }) }));
vi.mock('../../services/campaignBuilderApi.service', () => ({
  default: {
    getTelegramAccountsForBuilder: vi.fn(),
    getTelegramAccountGroups: vi.fn(),
  },
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const NODE = { id: 'node-tg-g', data: { nodeType: 'send_telegram', label: 'Gửi nhóm', config: {} } };
const ok = (items) => ({ data: { data: items } });
const ACCOUNTS = [
  { id: 7, name: 'Bot A', username: null, openConversationCount: 0 },
  { id: 8, name: 'Bot B', username: null, openConversationCount: 0 },
];
const GROUPS = [
  { chatId: -1001, title: 'Nhóm Bán hàng', type: 'supergroup', membersCount: 40 },
  { chatId: -1002, title: 'Nhóm Khách VIP', type: 'group', membersCount: null },
  { chatId: -1003, title: 'Cộng đồng', type: 'supergroup', membersCount: 5 },
];

const renderModal = ({ node = NODE, campaignType = 'telegram_group', onSave = vi.fn() } = {}) => render(
  <NodeConfigModal isOpen node={node} onClose={vi.fn()} onSave={onSave} nodes={[node]} edges={[]} campaignType={campaignType} />,
);

const pickAccount = async (id) => {
  await waitFor(() => expect(screen.getByRole('option', { name: /Bot A/ })).toBeInTheDocument());
  const accountSelect = screen.getByRole('option', { name: /Bot A/ }).closest('select');
  fireEvent.change(accountSelect, { target: { value: String(id) } });
};

describe('NodeConfigModal — send_telegram nguồn Nhóm Telegram (PR-E2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    campaignBuilderApiService.getTelegramAccountsForBuilder.mockResolvedValue(ok(ACCOUNTS));
    campaignBuilderApiService.getTelegramAccountGroups.mockResolvedValue(ok(GROUPS));
  });

  it("chiến dịch 'telegram_group' -> nguồn mặc định là Nhóm Telegram, có bộ chọn nhóm", async () => {
    renderModal();
    expect(await screen.findByTestId('telegram-groups-picker')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Nhóm Telegram')).toBeInTheDocument();
  });

  it("chiến dịch 'telegram' -> KHÔNG có tuỳ chọn Nhóm Telegram", async () => {
    renderModal({ campaignType: 'telegram' });
    await waitFor(() => expect(screen.getByRole('option', { name: /Bot A/ })).toBeInTheDocument());
    expect(screen.queryByTestId('telegram-groups-picker')).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Nhóm Telegram' })).not.toBeInTheDocument();
  });

  it('chọn tài khoản -> tải nhóm theo tài khoản đó, tick 2 nhóm -> lưu recipientKeys là 2 object đúng', async () => {
    const onSave = vi.fn();
    renderModal({ onSave });
    await pickAccount(7);
    fireEvent.click(await screen.findByRole('button', { name: 'Tải danh sách nhóm' }));
    await screen.findByText('Nhóm Bán hàng');
    expect(campaignBuilderApiService.getTelegramAccountGroups).toHaveBeenCalledWith('7', {});

    fireEvent.click(screen.getByLabelText(/Nhóm Bán hàng/));
    fireEvent.click(screen.getByLabelText(/Cộng đồng/));
    expect(screen.getByTestId('telegram-groups-selected')).toHaveTextContent('Đã chọn 2 nhóm');

    // nhập nội dung rồi lưu
    fireEvent.change(screen.getByPlaceholderText(/Nhập nội dung tin nhắn Telegram/), { target: { value: 'xin chào' } });
    fireEvent.click(screen.getByRole('button', { name: /Lưu/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0][0];
    expect(saved.recipientSource).toBe('telegram_groups');
    expect(saved.telegramAccountId).toBe('7');
    expect(saved.recipientKeys).toEqual([
      { recipientKey: '-1001', display: 'Nhóm Bán hàng' },
      { recipientKey: '-1003', display: 'Cộng đồng' },
    ]);
  });

  it('đổi tài khoản -> xoá lựa chọn nhóm cũ và danh sách đã tải', async () => {
    renderModal();
    await pickAccount(7);
    fireEvent.click(await screen.findByRole('button', { name: 'Tải danh sách nhóm' }));
    await screen.findByText('Nhóm Bán hàng');
    fireEvent.click(screen.getByLabelText(/Nhóm Bán hàng/));
    expect(screen.getByTestId('telegram-groups-selected')).toHaveTextContent('Đã chọn 1 nhóm');

    const accountSelect = screen.getByRole('option', { name: /Bot B/ }).closest('select');
    fireEvent.change(accountSelect, { target: { value: '8' } });
    await waitFor(() => expect(screen.getByTestId('telegram-groups-selected')).toHaveTextContent('Đã chọn 0 nhóm'));
    expect(screen.queryByText('Nhóm Bán hàng')).not.toBeInTheDocument();
  });

  it('lọc theo tên nhóm', async () => {
    renderModal();
    await pickAccount(7);
    fireEvent.click(await screen.findByRole('button', { name: 'Tải danh sách nhóm' }));
    await screen.findByText('Nhóm Bán hàng');
    fireEvent.change(screen.getByPlaceholderText('Lọc theo tên nhóm...'), { target: { value: 'vip' } });
    expect(screen.getByText('Nhóm Khách VIP')).toBeInTheDocument();
    expect(screen.queryByText('Nhóm Bán hàng')).not.toBeInTheDocument();
  });

  it('API nhóm lỗi 409 -> hiện câu lỗi của BE', async () => {
    campaignBuilderApiService.getTelegramAccountGroups.mockRejectedValue(
      Object.assign(new Error('x'), { response: { status: 409, data: { message: 'Phiên Telegram hết hiệu lực — đăng nhập lại trong Quản lý kênh gửi.' } } })
    );
    renderModal();
    await pickAccount(7);
    fireEvent.click(await screen.findByRole('button', { name: 'Tải danh sách nhóm' }));
    const alert = await screen.findByText(/Phiên Telegram hết hiệu lực/);
    expect(alert).toBeInTheDocument();
  });

  it('lưu khi chưa chọn nhóm nào -> KHÔNG gọi onSave', async () => {
    const onSave = vi.fn();
    renderModal({ onSave });
    await pickAccount(7);
    fireEvent.change(screen.getByPlaceholderText(/Nhập nội dung tin nhắn Telegram/), { target: { value: 'xin chào' } });
    fireEvent.click(screen.getByRole('button', { name: /Lưu/ }));
    await waitFor(() => {});
    expect(onSave).not.toHaveBeenCalled();
  });

  it('node đã lưu nguồn telegram_groups -> mở lại vẫn giữ mảng nhóm đã chọn (không thành "[object Object]")', async () => {
    const node = {
      id: 'n2',
      data: {
        nodeType: 'send_telegram',
        label: 'x',
        config: {
          telegramAccountId: '7',
          recipientSource: 'telegram_groups',
          recipientKeys: [{ recipientKey: '-1001', display: 'Nhóm Bán hàng' }],
          steps: [{ message: 'hi' }],
        },
      },
    };
    const onSave = vi.fn();
    renderModal({ node, onSave });
    await waitFor(() => expect(screen.getByTestId('telegram-groups-selected')).toHaveTextContent('Đã chọn 1 nhóm'));
    fireEvent.click(screen.getByRole('button', { name: /Lưu/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].recipientKeys).toEqual([{ recipientKey: '-1001', display: 'Nhóm Bán hàng' }]);
  });
});
