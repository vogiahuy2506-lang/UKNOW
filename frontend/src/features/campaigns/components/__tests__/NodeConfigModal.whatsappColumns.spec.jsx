/**
 * P8b — NodeConfigModal, node send_whatsapp, nguồn "khối dữ liệu": gợi ý cột làm biến `{{cột}}` (như Zalo).
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
  default: { getWhatsAppAccountsForBuilder: vi.fn(), getTelegramAccountsForBuilder: vi.fn() },
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const sheet = {
  id: 'n-sheet',
  type: 'task',
  data: { nodeType: 'read_sheet', label: 'Đọc Sheet', config: { columns: ['sdt', 'Họ tên', 'goi'] } },
};
const waNode = (config) => ({ id: 'node-wa-c', data: { nodeType: 'send_whatsapp', label: 'Gửi WhatsApp', config } });
const renderModal = (node, onSave = vi.fn()) => render(
  <NodeConfigModal
    isOpen
    node={node}
    onClose={vi.fn()}
    onSave={onSave}
    nodes={[sheet, node]}
    edges={[{ id: 'e1', source: 'n-sheet', target: node.id }]}
  />,
);

describe('NodeConfigModal — send_whatsapp gợi ý cột làm biến (P8b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    campaignBuilderApiService.getWhatsAppAccountsForBuilder.mockResolvedValue({
      data: { data: [{ sessionKey: '40-default', display: 'Phúc', status: 'open', openConversationCount: 1 }] },
    });
  });

  it('nguồn khối dữ liệu đã chọn khối -> hiện các cột; bấm cột chèn {{cột}} vào nội dung', async () => {
    const onSave = vi.fn();
    renderModal(waNode({
      whatsappSessionKey: '40-default',
      recipientSource: 'node',
      recipientNodeId: 'n-sheet',
      recipientColumn: 'sdt',
      steps: [{ message: 'Chào' }],
    }), onSave);
    const panel = await screen.findByTestId('whatsapp-column-variables');
    expect(panel).toHaveTextContent('{{sdt}}');
    expect(panel).toHaveTextContent('{{Họ tên}}');

    fireEvent.click(screen.getByRole('button', { name: '{{Họ tên}}' }));
    expect(screen.getByPlaceholderText(/Nhập nội dung tin nhắn WhatsApp/)).toHaveValue('Chào {{Họ tên}}');

    fireEvent.click(screen.getByRole('button', { name: /Lưu/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].steps[0].message).toBe('Chào {{Họ tên}}');
  });

  it('nguồn khác (hội thoại) -> KHÔNG hiện gợi ý cột', async () => {
    renderModal(waNode({ whatsappSessionKey: '40-default', steps: [{ message: 'Chào' }] }));
    await waitFor(() => expect(screen.getByRole('option', { name: /Phúc/ })).toBeInTheDocument());
    expect(screen.queryByTestId('whatsapp-column-variables')).not.toBeInTheDocument();
  });
});
