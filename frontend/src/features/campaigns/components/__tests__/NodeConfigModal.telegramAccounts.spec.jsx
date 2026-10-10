/**
 * PLAN_PR7_NODE_TELEGRAM_TRINH_DUNG_2026-09-28 Việc 4 — NodeConfigModal thật, node send_telegram.
 * Khuôn lấy từ NodeConfigModal.zaloAccounts.spec.jsx (cùng cơ chế loading/error/empty).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import NodeConfigModal from '../NodeConfigModal';
import campaignBuilderApiService from '../../services/campaignBuilderApi.service';
import viTranslations from '../../../../i18n/vi';
import { useAuthStore } from '../../../../stores/authStore';

const mockT = (key, params = {}) => {
  const val = key.split('.').reduce((acc, part) => acc?.[part], viTranslations);
  if (typeof val !== 'string') return key;
  return val.replace(/\{(\w+)\}/g, (_, name) => (params[name] ?? `{${name}}`));
};
vi.mock('../../../../i18n', () => ({ useI18n: () => ({ t: mockT }) }));
vi.mock('../../services/campaignBuilderApi.service', () => ({
  default: {
    getTelegramAccountsForBuilder: vi.fn(),
  },
}));

const NODE = { id: 'node-telegram-1', data: { nodeType: 'send_telegram', label: 'Gửi Telegram', config: {} } };
const apiAccount = (over = {}) => ({ id: 7, name: 'Bot chăm sóc khách', username: 'cskh_bot', ...over });
const ok = (items) => ({ data: { data: items } });
const httpError = (status, message) => Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data: { message } } });

const renderModal = (node = NODE, onSave = vi.fn()) => render(
  <NodeConfigModal isOpen node={node} onClose={vi.fn()} onSave={onSave} nodes={[node]} edges={[]} />,
);

describe('NodeConfigModal — send_telegram: danh sách tài khoản Telegram', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tải thành công → liệt kê đủ tài khoản, không báo lỗi', async () => {
    campaignBuilderApiService.getTelegramAccountsForBuilder.mockResolvedValue(ok([
      apiAccount({ id: 7 }), apiAccount({ id: 8, name: 'Bot bán hàng', username: null }),
    ]));
    renderModal();
    await waitFor(() => expect(screen.getByRole('option', { name: /Bot bán hàng/ })).toBeInTheDocument());
    const accountSelect = screen.getByRole('option', { name: /Bot bán hàng/ }).closest('select');
    expect(within(accountSelect).getAllByRole('option')).toHaveLength(3); // 2 tài khoản + dòng "-- Chọn tài khoản --"
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('API lỗi 500 → hộp đỏ nêu nguyên nhân + nút Thử lại', async () => {
    campaignBuilderApiService.getTelegramAccountsForBuilder.mockRejectedValue(httpError(500, 'Lỗi máy chủ khi đọc tài khoản Telegram'));
    renderModal();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Không tải được danh sách tài khoản Telegram');
    expect(alert).toHaveTextContent('Lỗi máy chủ khi đọc tài khoản Telegram');
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });

  it('tải thành công nhưng rỗng → báo "Chưa có tài khoản Telegram nào đang hoạt động"', async () => {
    campaignBuilderApiService.getTelegramAccountsForBuilder.mockResolvedValue(ok([]));
    renderModal();
    expect(await screen.findByText(/Chưa có tài khoản Telegram nào đang hoạt động/)).toBeInTheDocument();
  });

  it('PLAN_GIAO_TK_TG_WA H2: nhân viên 0 tài khoản được giao → "Chủ tài khoản chưa giao tài khoản Telegram nào cho bạn", không nói "chưa kết nối"', async () => {
    useAuthStore.setState({ activeContext: { type: 'employee', ownerId: 1 } });
    try {
      campaignBuilderApiService.getTelegramAccountsForBuilder.mockResolvedValue(ok([]));
      renderModal();
      expect(await screen.findByText('Chủ tài khoản chưa giao tài khoản Telegram nào cho bạn.')).toBeInTheDocument();
      expect(screen.queryByText(/Chưa có tài khoản Telegram nào đang hoạt động/)).not.toBeInTheDocument();
    } finally {
      useAuthStore.setState({ activeContext: null });
    }
  });

  it('nút Thử lại gọi lại API', async () => {
    campaignBuilderApiService.getTelegramAccountsForBuilder
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValueOnce(ok([apiAccount()]));
    renderModal();
    fireEvent.click(await screen.findByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(screen.getByRole('option', { name: /Bot chăm sóc khách/ })).toBeInTheDocument());
    expect(campaignBuilderApiService.getTelegramAccountsForBuilder).toHaveBeenCalledTimes(2);
  });

  it('không gọi API tài khoản Telegram khi node là loại khác (vd send_email)', async () => {
    renderModal({ id: 'node-email', data: { nodeType: 'send_email', label: 'Gửi email', config: {} } });
    await waitFor(() => {});
    expect(campaignBuilderApiService.getTelegramAccountsForBuilder).not.toHaveBeenCalled();
  });

  it('mặc định nguồn người nhận là hội thoại Telegram; đổi sang nhập tay hiện ô chat id', async () => {
    campaignBuilderApiService.getTelegramAccountsForBuilder.mockResolvedValue(ok([apiAccount()]));
    renderModal();
    await waitFor(() => expect(screen.getByRole('option', { name: /Bot chăm sóc khách/ })).toBeInTheDocument());

    expect(screen.queryByPlaceholderText(/123456789/)).not.toBeInTheDocument();
    const sourceSelect = screen.getByDisplayValue('Hội thoại Telegram của tài khoản');
    fireEvent.change(sourceSelect, { target: { value: 'manual' } });
    expect(await screen.findByPlaceholderText(/123456789/)).toBeInTheDocument();
  });

  it('lưu thiếu tài khoản → báo lỗi, KHÔNG gọi onSave', async () => {
    campaignBuilderApiService.getTelegramAccountsForBuilder.mockResolvedValue(ok([apiAccount()]));
    const onSave = vi.fn();
    renderModal(NODE, onSave);
    await waitFor(() => expect(screen.getByRole('option', { name: /Bot chăm sóc khách/ })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Lưu/ }));
    await waitFor(() => expect(onSave).not.toHaveBeenCalled());
  });

  describe('cảnh báo nguồn hội thoại mà tài khoản 0 hội thoại (PLAN_TELEGRAM_0_NGUOI_NHAN)', () => {
    const WARNING = /Tài khoản này chưa có hội thoại nào/;
    const accounts = [
      apiAccount({ id: 7, name: 'Bot rỗng', openConversationCount: 0 }),
      apiAccount({ id: 8, name: 'Bot có khách', openConversationCount: 3 }),
    ];
    const nodeWithAccount = (accountId, recipientSource) => ({
      id: 'node-telegram-w',
      data: { nodeType: 'send_telegram', label: 'Gửi Telegram', config: { telegramAccountId: accountId, ...(recipientSource ? { recipientSource } : {}) } },
    });

    it('nguồn hội thoại + tài khoản 0 -> hiện cảnh báo; nhãn tài khoản kèm số hội thoại', async () => {
      campaignBuilderApiService.getTelegramAccountsForBuilder.mockResolvedValue(ok(accounts));
      renderModal(nodeWithAccount(7));
      expect(await screen.findByText(WARNING)).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /Bot có khách.*3 hội thoại/ })).toBeInTheDocument();
    });

    it('đổi sang tài khoản có hội thoại -> mất cảnh báo', async () => {
      campaignBuilderApiService.getTelegramAccountsForBuilder.mockResolvedValue(ok(accounts));
      renderModal(nodeWithAccount(7));
      await screen.findByText(WARNING);
      const accountSelect = screen.getByRole('option', { name: /Bot có khách/ }).closest('select');
      fireEvent.change(accountSelect, { target: { value: '8' } });
      await waitFor(() => expect(screen.queryByText(WARNING)).not.toBeInTheDocument());
    });

    it('đổi nguồn sang nhập chat id -> mất cảnh báo', async () => {
      campaignBuilderApiService.getTelegramAccountsForBuilder.mockResolvedValue(ok(accounts));
      renderModal(nodeWithAccount(7));
      await screen.findByText(WARNING);
      fireEvent.change(screen.getByDisplayValue('Hội thoại Telegram của tài khoản'), { target: { value: 'manual' } });
      await waitFor(() => expect(screen.queryByText(WARNING)).not.toBeInTheDocument());
    });

    it('BE không trả openConversationCount -> không cảnh báo (không biết thì không dọa)', async () => {
      campaignBuilderApiService.getTelegramAccountsForBuilder.mockResolvedValue(ok([apiAccount({ id: 7 })]));
      renderModal(nodeWithAccount(7));
      await waitFor(() => expect(screen.getByRole('option', { name: /Bot chăm sóc khách/ })).toBeInTheDocument());
      expect(screen.queryByText(WARNING)).not.toBeInTheDocument();
    });
  });
});
