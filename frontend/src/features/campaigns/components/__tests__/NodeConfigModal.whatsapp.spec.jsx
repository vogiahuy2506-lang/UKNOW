/**
 * PLAN_WHATSAPP_DAY_DU_2026-09-29 PR-W4b — NodeConfigModal thật, node send_whatsapp.
 * Khuôn từ NodeConfigModal.telegramAccounts.spec.jsx. API `GET /campaigns/channels/whatsapp/accounts`
 * được mock theo hợp đồng W4a mục 4 (backend chưa có trên nhánh này).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import NodeConfigModal from '../NodeConfigModal';
import campaignBuilderApiService from '../../services/campaignBuilderApi.service';
import viTranslations from '../../../../i18n/vi';
import toast from 'react-hot-toast';

const mockT = (key, params = {}) => {
  const val = key.split('.').reduce((acc, part) => acc?.[part], viTranslations);
  if (typeof val !== 'string') return key;
  return val.replace(/\{(\w+)\}/g, (_, name) => (params[name] ?? `{${name}}`));
};
vi.mock('../../../../i18n', () => ({ useI18n: () => ({ t: mockT }) }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../services/campaignBuilderApi.service', () => ({
  default: {
    getWhatsAppAccountsForBuilder: vi.fn(),
    getTelegramAccountsForBuilder: vi.fn(),
  },
}));

const NODE = { id: 'node-wa-1', data: { nodeType: 'send_whatsapp', label: 'Gửi WhatsApp', config: {} } };
const account = (over = {}) => ({ sessionKey: '40-default', display: 'Phúc', status: 'open', openConversationCount: 6, ...over });
const ok = (items) => ({ data: { data: items } });
const httpError = (status, message) => Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data: { message } } });

const renderModal = (node = NODE, onSave = vi.fn(), extra = {}) => render(
  <NodeConfigModal isOpen node={node} onClose={vi.fn()} onSave={onSave} nodes={[node]} edges={[]} {...extra} />,
);
const nodeWith = (config) => ({ id: 'node-wa-w', data: { nodeType: 'send_whatsapp', label: 'Gửi WhatsApp', config } });

describe('NodeConfigModal — send_whatsapp: danh sách tài khoản', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tải thành công -> liệt kê tài khoản kèm số hội thoại, không báo lỗi', async () => {
    campaignBuilderApiService.getWhatsAppAccountsForBuilder.mockResolvedValue(ok([
      account(), account({ sessionKey: '40-sales', display: 'Bán hàng', openConversationCount: 2 }),
    ]));
    renderModal();
    await waitFor(() => expect(screen.getByRole('option', { name: /Bán hàng/ })).toBeInTheDocument());
    const select = screen.getByRole('option', { name: /Bán hàng/ }).closest('select');
    expect(within(select).getAllByRole('option')).toHaveLength(3);
    expect(screen.getByRole('option', { name: /Phúc.*6 hội thoại/ })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('API lỗi 500 -> hộp đỏ nêu nguyên nhân + nút Thử lại gọi lại API', async () => {
    campaignBuilderApiService.getWhatsAppAccountsForBuilder
      .mockRejectedValueOnce(httpError(500, 'Lỗi máy chủ khi đọc tài khoản WhatsApp'))
      .mockResolvedValueOnce(ok([account()]));
    renderModal();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Không tải được danh sách tài khoản WhatsApp');
    expect(alert).toHaveTextContent('Lỗi máy chủ khi đọc tài khoản WhatsApp');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(screen.getByRole('option', { name: /Phúc/ })).toBeInTheDocument());
    expect(campaignBuilderApiService.getWhatsAppAccountsForBuilder).toHaveBeenCalledTimes(2);
  });

  it('rỗng -> báo chưa có tài khoản WhatsApp', async () => {
    campaignBuilderApiService.getWhatsAppAccountsForBuilder.mockResolvedValue(ok([]));
    renderModal();
    expect(await screen.findByText(/Chưa có tài khoản WhatsApp nào/)).toBeInTheDocument();
  });

  it('không gọi API WhatsApp khi node là loại khác; node WhatsApp không gọi API Telegram', async () => {
    renderModal({ id: 'node-email', data: { nodeType: 'send_email', label: 'Gửi email', config: {} } });
    await waitFor(() => {});
    expect(campaignBuilderApiService.getWhatsAppAccountsForBuilder).not.toHaveBeenCalled();

    campaignBuilderApiService.getWhatsAppAccountsForBuilder.mockResolvedValue(ok([account()]));
    renderModal();
    await waitFor(() => expect(screen.getByRole('option', { name: /Phúc/ })).toBeInTheDocument());
    expect(campaignBuilderApiService.getTelegramAccountsForBuilder).not.toHaveBeenCalled();
  });

  it('tài khoản status khác open -> cảnh báo vàng "chưa kết nối"; đổi sang tài khoản open -> mất cảnh báo', async () => {
    campaignBuilderApiService.getWhatsAppAccountsForBuilder.mockResolvedValue(ok([
      account({ sessionKey: '40-off', display: 'Máy offline', status: 'offline' }),
      account({ sessionKey: '40-default', display: 'Phúc' }),
    ]));
    renderModal(nodeWith({ whatsappSessionKey: '40-off' }));
    const warning = await screen.findByText(/chưa kết nối/);
    expect(warning).toBeInTheDocument();
    const select = screen.getByRole('option', { name: /Phúc/ }).closest('select');
    fireEvent.change(select, { target: { value: '40-default' } });
    await waitFor(() => expect(screen.queryByText(/chưa kết nối/)).not.toBeInTheDocument());
  });
});

describe('NodeConfigModal — send_whatsapp: nguồn người nhận', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mặc định nguồn là hội thoại WhatsApp; không hiện ô SĐT/khối dữ liệu', async () => {
    campaignBuilderApiService.getWhatsAppAccountsForBuilder.mockResolvedValue(ok([account()]));
    renderModal();
    await waitFor(() => expect(screen.getByRole('option', { name: /Phúc/ })).toBeInTheDocument());
    expect(screen.getByDisplayValue('Hội thoại WhatsApp của tài khoản')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/0912345678/)).not.toBeInTheDocument();
    expect(screen.queryByText('Chọn khối dữ liệu')).not.toBeInTheDocument();
  });

  it('nguồn hội thoại + tài khoản 0 hội thoại -> cảnh báo; tài khoản có hội thoại / đổi nguồn -> mất', async () => {
    const WARNING = /Tài khoản này chưa có hội thoại nào/;
    campaignBuilderApiService.getWhatsAppAccountsForBuilder.mockResolvedValue(ok([
      account({ sessionKey: 'a', display: 'Rỗng', openConversationCount: 0 }),
      account({ sessionKey: 'b', display: 'Có khách', openConversationCount: 3 }),
    ]));
    renderModal(nodeWith({ whatsappSessionKey: 'a' }));
    expect(await screen.findByText(WARNING)).toBeInTheDocument();

    const accountSelect = screen.getByRole('option', { name: /Có khách/ }).closest('select');
    fireEvent.change(accountSelect, { target: { value: 'b' } });
    await waitFor(() => expect(screen.queryByText(WARNING)).not.toBeInTheDocument());

    fireEvent.change(accountSelect, { target: { value: 'a' } });
    await screen.findByText(WARNING);
    fireEvent.change(screen.getByDisplayValue('Hội thoại WhatsApp của tài khoản'), { target: { value: 'manual' } });
    await waitFor(() => expect(screen.queryByText(WARNING)).not.toBeInTheDocument());
  });

  it('BE không trả openConversationCount -> không cảnh báo', async () => {
    campaignBuilderApiService.getWhatsAppAccountsForBuilder.mockResolvedValue(ok([
      { sessionKey: '40-default', display: 'Phúc', status: 'open' },
    ]));
    renderModal(nodeWith({ whatsappSessionKey: '40-default' }));
    await waitFor(() => expect(screen.getByRole('option', { name: /Phúc/ })).toBeInTheDocument());
    expect(screen.queryByText(/chưa có hội thoại nào/)).not.toBeInTheDocument();
  });

  it('nhập SĐT: hiện ô + đếm số hợp lệ; số 7 chữ số/abc hiện cảnh báo sai', async () => {
    campaignBuilderApiService.getWhatsAppAccountsForBuilder.mockResolvedValue(ok([account()]));
    renderModal();
    await waitFor(() => expect(screen.getByRole('option', { name: /Phúc/ })).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue('Hội thoại WhatsApp của tài khoản'), { target: { value: 'manual' } });

    const textarea = await screen.findByPlaceholderText(/0912345678/);
    fireEvent.change(textarea, { target: { value: '0912345678,84913456789\n1234567\nabc' } });
    expect(screen.getByTestId('whatsapp-valid-phones')).toHaveTextContent('2 số hợp lệ');
    const invalid = screen.getByTestId('whatsapp-invalid-phones');
    expect(invalid).toHaveTextContent('2 số không hợp lệ');
    expect(invalid).toHaveTextContent('1234567');
    expect(invalid).toHaveTextContent('abc');
  });

  it('nhập SĐT: bấm Lưu với số sai -> KHÔNG onSave, có toast lỗi; sửa đúng -> onSave với recipientKeys nguyên văn', async () => {
    campaignBuilderApiService.getWhatsAppAccountsForBuilder.mockResolvedValue(ok([account()]));
    const onSave = vi.fn();
    renderModal(nodeWith({
      whatsappSessionKey: '40-default', recipientSource: 'manual', recipientKeys: '1234567', steps: [{ message: 'Xin chào' }],
    }), onSave);
    await waitFor(() => expect(screen.getByRole('option', { name: /Phúc/ })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Lưu/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText(/0912345678/), { target: { value: '0912345678' } });
    fireEvent.click(screen.getByRole('button', { name: /Lưu/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({
      whatsappSessionKey: '40-default', recipientSource: 'manual', recipientKeys: '0912345678',
    });
  });

  it("từ khối dữ liệu: chọn khối phía trước + cột SĐT -> lưu recipientSource 'node', recipientNodeId, recipientColumn", async () => {
    campaignBuilderApiService.getWhatsAppAccountsForBuilder.mockResolvedValue(ok([account()]));
    const sheet = { id: 'n-sheet', type: 'task', data: { nodeType: 'read_sheet', label: 'Đọc Sheet', config: {} } };
    const node = { id: 'node-wa-n', data: { nodeType: 'send_whatsapp', label: 'Gửi WhatsApp', config: { whatsappSessionKey: '40-default', steps: [{ message: 'Chào' }] } } };
    const onSave = vi.fn();
    renderModal(node, onSave, {
      nodes: [sheet, node],
      edges: [{ id: 'e1', source: 'n-sheet', target: 'node-wa-n' }],
    });
    await waitFor(() => expect(screen.getByRole('option', { name: /Phúc/ })).toBeInTheDocument());

    fireEvent.change(screen.getByDisplayValue('Hội thoại WhatsApp của tài khoản'), { target: { value: 'node' } });
    const nodeSelect = (await screen.findByRole('option', { name: 'Đọc Sheet' })).closest('select');

    // chưa chọn khối/cột -> chặn
    fireEvent.click(screen.getByRole('button', { name: /Lưu/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.change(nodeSelect, { target: { value: 'n-sheet' } });
    fireEvent.change(screen.getByPlaceholderText('Tên cột số điện thoại'), { target: { value: 'sdt' } });
    fireEvent.click(screen.getByRole('button', { name: /Lưu/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({
      recipientSource: 'node', recipientNodeId: 'n-sheet', recipientColumn: 'sdt', whatsappSessionKey: '40-default',
    });
  });

  it('lưu thiếu tài khoản -> KHÔNG onSave', async () => {
    campaignBuilderApiService.getWhatsAppAccountsForBuilder.mockResolvedValue(ok([account()]));
    const onSave = vi.fn();
    renderModal(NODE, onSave);
    await waitFor(() => expect(screen.getByRole('option', { name: /Phúc/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Lưu/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(onSave).not.toHaveBeenCalled();
  });

  it('nguồn hội thoại: lưu đủ tài khoản + nội dung -> onSave, config có whatsappSessionKey + steps', async () => {
    campaignBuilderApiService.getWhatsAppAccountsForBuilder.mockResolvedValue(ok([account()]));
    const onSave = vi.fn();
    renderModal(nodeWith({ whatsappSessionKey: '40-default', steps: [{ message: 'Xin chào {{ten}}' }] }), onSave);
    await waitFor(() => expect(screen.getByRole('option', { name: /Phúc/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Lưu/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({
      whatsappSessionKey: '40-default',
      recipientSource: 'whatsapp_conversations',
      steps: [{ message: 'Xin chào {{ten}}' }],
    });
  });
});
