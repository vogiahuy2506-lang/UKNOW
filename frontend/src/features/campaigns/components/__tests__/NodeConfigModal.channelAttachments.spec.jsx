/**
 * P5 — NodeConfigModal thật, node send_telegram / send_whatsapp: chọn MẪU TIN (kho mẫu Zalo) điền nội dung + tệp
 * đính kèm vào bước đầu, bớt từng tệp, chặn lưu khi vượt giới hạn. `campaignBuilderApiService` giả đúng hình dạng thật
 * (`{ data: { data } }`); danh sách mẫu vào qua prop `zaloTemplates` như CampaignBuilder truyền.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
    getZaloTemplateById: vi.fn(),
  },
}));

const TEMPLATE_LIST_ITEM = { id: 5, templateName: 'Báo giá tháng 10', bodyText: 'tóm tắt', attachments: [] };
const TEMPLATE_DETAIL = {
  id: 5,
  templateName: 'Báo giá tháng 10',
  bodyText: 'Chào {{ten}}, báo giá đính kèm',
  attachments: [
    { key: 'uploads/40/zalo-templates/bang-gia.pdf', name: 'bang-gia.pdf', size: 2048 },
    { key: 'uploads/40/zalo-templates/anh-1.jpg', name: 'anh-1.jpg', size: 1024 },
  ],
};

const telegramNode = (config = {}) => ({
  id: 'n-tg', data: { nodeType: 'send_telegram', label: 'Gửi Telegram', config: { telegramAccountId: '7', recipientSource: 'manual', recipientKeys: '123456', ...config } },
});
const whatsappNode = (config = {}) => ({
  id: 'n-wa', data: { nodeType: 'send_whatsapp', label: 'Gửi WhatsApp', config: { whatsappSessionKey: '40-default', recipientSource: 'manual', recipientKeys: '0912345678', ...config } },
});

const renderModal = (node, onSave = vi.fn()) => render(
  <NodeConfigModal
    isOpen
    node={node}
    onClose={vi.fn()}
    onSave={onSave}
    nodes={[node]}
    edges={[]}
    zaloTemplates={[TEMPLATE_LIST_ITEM]}
  />,
);

async function pickTemplate() {
  fireEvent.click(screen.getByRole('button', { name: /Chọn mẫu tin nhắn/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Báo giá tháng 10' }));
}

describe.each([
  ['telegram', telegramNode, 'Nhập nội dung tin nhắn Telegram...'],
  ['whatsapp', whatsappNode, 'Nhập nội dung tin nhắn WhatsApp...'],
])('NodeConfigModal — mẫu tin + đính kèm (%s)', (channel, makeNode, messagePlaceholder) => {
  beforeEach(() => {
    vi.clearAllMocks();
    campaignBuilderApiService.getTelegramAccountsForBuilder.mockResolvedValue({ data: { data: [{ id: 7, name: 'Bot', username: null, openConversationCount: 1 }] } });
    campaignBuilderApiService.getWhatsAppAccountsForBuilder.mockResolvedValue({ data: { data: [{ sessionKey: '40-default', display: 'Phúc', status: 'open', openConversationCount: 1 }] } });
    campaignBuilderApiService.getZaloTemplateById.mockResolvedValue({ data: { data: TEMPLATE_DETAIL } });
  });

  it('chọn mẫu -> điền nội dung, liệt kê tệp của mẫu; Lưu mang templateId + attachments trong steps[0]', async () => {
    const onSave = vi.fn();
    renderModal(makeNode(), onSave);
    await pickTemplate();

    await waitFor(() => expect(screen.getByPlaceholderText(messagePlaceholder)).toHaveValue('Chào {{ten}}, báo giá đính kèm'));
    expect(campaignBuilderApiService.getZaloTemplateById).toHaveBeenCalledWith(5);
    expect(screen.getByText('bang-gia.pdf')).toBeInTheDocument();
    expect(screen.getByText('anh-1.jpg')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Lưu/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0][0];
    expect(saved.steps).toHaveLength(1);
    expect(saved.steps[0]).toMatchObject({ templateId: '5', message: 'Chào {{ten}}, báo giá đính kèm' });
    expect(saved.steps[0].attachments.map((a) => a.key)).toEqual([
      'uploads/40/zalo-templates/bang-gia.pdf',
      'uploads/40/zalo-templates/anh-1.jpg',
    ]);
  });

  it('bỏ từng tệp -> Lưu chỉ còn tệp còn lại; sửa nội dung tay không mất tệp', async () => {
    const onSave = vi.fn();
    renderModal(makeNode(), onSave);
    await pickTemplate();
    await screen.findByText('anh-1.jpg');

    fireEvent.click(screen.getAllByRole('button', { name: 'Bỏ tệp này' })[0]); // bỏ bang-gia.pdf
    fireEvent.change(screen.getByPlaceholderText(messagePlaceholder), { target: { value: 'Nội dung sửa tay' } });

    fireEvent.click(screen.getByRole('button', { name: /Lưu/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const step = onSave.mock.calls[0][0].steps[0];
    expect(step.message).toBe('Nội dung sửa tay');
    expect(step.attachments.map((a) => a.name)).toEqual(['anh-1.jpg']);
  });

  it('lỗi tải chi tiết mẫu -> dùng dòng trong danh sách (không kẹt)', async () => {
    campaignBuilderApiService.getZaloTemplateById.mockRejectedValue(new Error('boom'));
    renderModal(makeNode());
    await pickTemplate();
    await waitFor(() => expect(screen.getByPlaceholderText(messagePlaceholder)).toHaveValue('tóm tắt'));
  });

  it('"Bỏ mẫu đã chọn" -> xoá tệp của mẫu, giữ nội dung', async () => {
    renderModal(makeNode());
    await pickTemplate();
    await screen.findByText('bang-gia.pdf');
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ mẫu đã chọn' }));
    await waitFor(() => expect(screen.queryByText('bang-gia.pdf')).not.toBeInTheDocument());
    expect(screen.getByPlaceholderText(messagePlaceholder)).toHaveValue('Chào {{ten}}, báo giá đính kèm');
  });

  it('vượt giới hạn (4 tài liệu) -> báo đỏ ngay trong khối VÀ chặn Lưu (không onSave)', async () => {
    const onSave = vi.fn();
    const attachments = Array.from({ length: 4 }, (_, i) => ({ key: `uploads/40/d${i}.pdf`, name: `d${i}.pdf`, size: 10 }));
    renderModal(makeNode({ steps: [{ message: 'Có tệp', attachments }] }), onSave);
    expect(await screen.findByTestId('channel-attachment-problem')).toHaveTextContent('Tối đa 3 tài liệu mỗi tin nhắn.');

    fireEvent.click(screen.getByRole('button', { name: /Lưu/ }));
    expect(onSave).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Tối đa 3 tài liệu mỗi tin nhắn.');
  });
});
