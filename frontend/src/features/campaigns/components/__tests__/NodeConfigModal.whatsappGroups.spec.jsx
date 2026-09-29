/**
 * P8b — NodeConfigModal, node send_whatsapp, nguồn "Nhóm WhatsApp". Khuôn NodeConfigModal.telegramGroups.spec.jsx.
 * API nhóm giả đúng hình dạng thật: axios bọc `{ data: { data: [{ recipientKey: '<id>@g.us', title, membersCount }] } }`.
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
    getWhatsAppAccountsForBuilder: vi.fn(),
    getTelegramAccountsForBuilder: vi.fn(),
    getWhatsAppAccountGroups: vi.fn(),
  },
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const NODE = { id: 'node-wa-g', data: { nodeType: 'send_whatsapp', label: 'Gửi nhóm', config: {} } };
const ok = (items) => ({ data: { data: items } });
const ACCOUNTS = [
  { sessionKey: '40-default', display: 'Phúc', status: 'open', openConversationCount: 1 },
  { sessionKey: '40-sales', display: 'Bán hàng', status: 'open', openConversationCount: 0 },
];
const GROUPS = [
  { recipientKey: '120363000000000001@g.us', title: 'Khách VIP', membersCount: 12 },
  { recipientKey: '120363000000000002@g.us', title: 'Đại lý', membersCount: 3 },
];

const renderModal = ({ node = NODE, onSave = vi.fn() } = {}) => render(
  <NodeConfigModal isOpen node={node} onClose={vi.fn()} onSave={onSave} nodes={[node]} edges={[]} />,
);

const pickAccount = async (sessionKey) => {
  await waitFor(() => expect(screen.getByRole('option', { name: /Phúc/ })).toBeInTheDocument());
  const select = screen.getByRole('option', { name: /Phúc/ }).closest('select');
  fireEvent.change(select, { target: { value: sessionKey } });
};

const chooseGroupsSource = () => {
  const sourceSelect = screen.getByRole('option', { name: 'Nhóm WhatsApp' }).closest('select');
  fireEvent.change(sourceSelect, { target: { value: 'whatsapp_groups' } });
};

describe('NodeConfigModal — send_whatsapp nguồn Nhóm WhatsApp (P8b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    campaignBuilderApiService.getWhatsAppAccountsForBuilder.mockResolvedValue(ok(ACCOUNTS));
    campaignBuilderApiService.getWhatsAppAccountGroups.mockResolvedValue(ok(GROUPS));
  });

  it('chọn nguồn Nhóm -> hiện bộ chọn nhóm; tải nhóm theo sessionKey; lưu recipientKeys là mảng {recipientKey, display}', async () => {
    const onSave = vi.fn();
    renderModal({ onSave });
    await pickAccount('40-default');
    chooseGroupsSource();
    expect(await screen.findByTestId('whatsapp-groups-picker')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tải danh sách nhóm' }));
    await screen.findByText('Khách VIP');
    expect(campaignBuilderApiService.getWhatsAppAccountGroups).toHaveBeenCalledWith('40-default', {});

    fireEvent.click(screen.getByLabelText(/Khách VIP/));
    fireEvent.click(screen.getByLabelText(/Đại lý/));
    expect(screen.getByTestId('whatsapp-groups-selected')).toHaveTextContent('Đã chọn 2 nhóm');

    fireEvent.change(screen.getByPlaceholderText(/Nhập nội dung tin nhắn WhatsApp/), { target: { value: 'chào cả nhóm' } });
    fireEvent.click(screen.getByRole('button', { name: /Lưu/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0][0];
    expect(saved.recipientSource).toBe('whatsapp_groups');
    expect(saved.whatsappSessionKey).toBe('40-default');
    expect(saved.recipientKeys).toEqual([
      { recipientKey: '120363000000000001@g.us', display: 'Khách VIP' },
      { recipientKey: '120363000000000002@g.us', display: 'Đại lý' },
    ]);
  });

  it('đổi tài khoản -> xoá lựa chọn nhóm cũ và danh sách đã tải', async () => {
    renderModal();
    await pickAccount('40-default');
    chooseGroupsSource();
    fireEvent.click(await screen.findByRole('button', { name: 'Tải danh sách nhóm' }));
    await screen.findByText('Khách VIP');
    fireEvent.click(screen.getByLabelText(/Khách VIP/));
    expect(screen.getByTestId('whatsapp-groups-selected')).toHaveTextContent('Đã chọn 1 nhóm');

    const select = screen.getByRole('option', { name: /Bán hàng/ }).closest('select');
    fireEvent.change(select, { target: { value: '40-sales' } });
    await waitFor(() => expect(screen.getByTestId('whatsapp-groups-selected')).toHaveTextContent('Đã chọn 0 nhóm'));
    expect(screen.queryByText('Khách VIP')).not.toBeInTheDocument();
  });

  it('API nhóm lỗi 409 -> hiện câu lỗi của BE', async () => {
    campaignBuilderApiService.getWhatsAppAccountGroups.mockRejectedValue(
      Object.assign(new Error('x'), { response: { status: 409, data: { message: 'Tài khoản WhatsApp chưa kết nối — quét lại QR trong Quản lý kênh gửi.' } } })
    );
    renderModal();
    await pickAccount('40-default');
    chooseGroupsSource();
    fireEvent.click(await screen.findByRole('button', { name: 'Tải danh sách nhóm' }));
    expect(await screen.findByText(/quét lại QR/)).toBeInTheDocument();
  });

  it('lưu khi chưa chọn nhóm nào -> KHÔNG gọi onSave', async () => {
    const onSave = vi.fn();
    renderModal({ onSave });
    await pickAccount('40-default');
    chooseGroupsSource();
    fireEvent.change(screen.getByPlaceholderText(/Nhập nội dung tin nhắn WhatsApp/), { target: { value: 'chào' } });
    fireEvent.click(screen.getByRole('button', { name: /Lưu/ }));
    await waitFor(() => {});
    expect(onSave).not.toHaveBeenCalled();
  });

  it('node đã lưu nguồn whatsapp_groups -> mở lại vẫn giữ mảng nhóm (không thành "[object Object]")', async () => {
    const node = {
      id: 'n2',
      data: {
        nodeType: 'send_whatsapp',
        label: 'x',
        config: {
          whatsappSessionKey: '40-default',
          recipientSource: 'whatsapp_groups',
          recipientKeys: [{ recipientKey: '120363000000000001@g.us', display: 'Khách VIP' }],
          steps: [{ message: 'hi' }],
        },
      },
    };
    const onSave = vi.fn();
    renderModal({ node, onSave });
    await waitFor(() => expect(screen.getByTestId('whatsapp-groups-selected')).toHaveTextContent('Đã chọn 1 nhóm'));
    fireEvent.click(screen.getByRole('button', { name: /Lưu/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].recipientKeys).toEqual([{ recipientKey: '120363000000000001@g.us', display: 'Khách VIP' }]);
  });
});
