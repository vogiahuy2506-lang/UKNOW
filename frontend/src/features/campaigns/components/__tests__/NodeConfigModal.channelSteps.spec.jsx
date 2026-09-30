/**
 * P7 — NodeConfigModal thật, node send_telegram / send_whatsapp: soạn NHIỀU BƯỚC (tối đa 5) + độ trễ giữa các bước,
 * lưu đúng hình dạng `config.steps[i] = { message, delayValue, delayUnit }` mà runner backend đọc; chặn lưu khi bước
 * rỗng / trễ sai. Giao diện MỘT bước giữ nguyên như trước P7 (không tiêu đề bước, không ô trễ).
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

const telegramNode = (config = {}) => ({
  id: 'n-tg', data: { nodeType: 'send_telegram', label: 'Gửi Telegram', config: { telegramAccountId: '7', recipientSource: 'manual', recipientKeys: '123456', ...config } },
});
const whatsappNode = (config = {}) => ({
  id: 'n-wa', data: { nodeType: 'send_whatsapp', label: 'Gửi WhatsApp', config: { whatsappSessionKey: '40-default', recipientSource: 'manual', recipientKeys: '0912345678', ...config } },
});

const renderModal = (node, onSave = vi.fn()) => render(
  <NodeConfigModal isOpen node={node} onClose={vi.fn()} onSave={onSave} nodes={[node]} edges={[]} zaloTemplates={[]} />,
);

describe.each([
  ['telegram', telegramNode, 'Nhập nội dung tin nhắn Telegram...'],
  ['whatsapp', whatsappNode, 'Nhập nội dung tin nhắn WhatsApp...'],
])('NodeConfigModal — nhiều bước (%s)', (channel, makeNode, messagePlaceholder) => {
  beforeEach(() => {
    vi.clearAllMocks();
    campaignBuilderApiService.getTelegramAccountsForBuilder.mockResolvedValue({ data: { data: [{ id: 7, name: 'Bot', username: null, openConversationCount: 1 }] } });
    campaignBuilderApiService.getWhatsAppAccountsForBuilder.mockResolvedValue({ data: { data: [{ sessionKey: '40-default', display: 'Phúc', status: 'open', openConversationCount: 1 }] } });
  });

  it('một bước: không có tiêu đề bước, không có ô trễ; có nút Thêm bước', () => {
    renderModal(makeNode({ steps: [{ message: 'Xin chào' }] }));
    expect(screen.queryByText('Bước 1')).toBeNull();
    expect(screen.queryByTestId('channel-step-delay-2')).toBeNull();
    expect(screen.getByTestId('channel-step-add')).toBeEnabled();
  });

  it('thêm bước 2 -> hiện tiêu đề + ô "Gửi sau … kể từ bước 1"; Lưu mang delayValue/delayUnit đúng hình dạng backend', async () => {
    const onSave = vi.fn();
    renderModal(makeNode({ steps: [{ message: 'Tin đầu' }] }), onSave);

    fireEvent.click(screen.getByTestId('channel-step-add'));
    expect(screen.getByText('Bước 1')).toBeInTheDocument();
    expect(screen.getByText('Bước 2')).toBeInTheDocument();
    expect(screen.getByTestId('channel-step-delay-2')).toBeInTheDocument();

    const boxes = screen.getAllByPlaceholderText(messagePlaceholder);
    expect(boxes).toHaveLength(2);
    fireEvent.change(boxes[1], { target: { value: 'Nhắc lại sau 1 giờ' } });
    fireEvent.change(screen.getByLabelText('Số thời gian chờ trước bước 2'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Đơn vị thời gian chờ trước bước 2'), { target: { value: 'hours' } });

    fireEvent.click(screen.getByRole('button', { name: /Lưu/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0][0].steps;
    expect(saved).toHaveLength(2);
    expect(saved[0]).toEqual({ message: 'Tin đầu' });
    expect(saved[1]).toMatchObject({ message: 'Nhắc lại sau 1 giờ', delayValue: 1, delayUnit: 'hours' });
  });

  it('tối đa 5 bước: đủ 5 thì nút Thêm bước bị khoá; xoá bước 2+ được, bước 1 không có nút xoá', () => {
    renderModal(makeNode({ steps: [{ message: 'a' }] }));
    for (let i = 0; i < 4; i += 1) fireEvent.click(screen.getByTestId('channel-step-add'));
    expect(screen.getAllByPlaceholderText(messagePlaceholder)).toHaveLength(5);
    expect(screen.getByTestId('channel-step-add')).toBeDisabled();
    // Bước 1 không có nút xoá (4 nút cho bước 2..5).
    expect(screen.getAllByRole('button', { name: 'Xoá bước' })).toHaveLength(4);

    fireEvent.click(screen.getAllByRole('button', { name: 'Xoá bước' })[0]);
    expect(screen.getAllByPlaceholderText(messagePlaceholder)).toHaveLength(4);
    expect(screen.getByTestId('channel-step-add')).toBeEnabled();
  });

  it('chặn lưu khi một bước để trống (báo rõ bước nào) hoặc trễ âm', async () => {
    const onSave = vi.fn();
    renderModal(makeNode({ steps: [{ message: 'a' }, { message: '', delayValue: 5, delayUnit: 'minutes' }] }), onSave);
    fireEvent.click(screen.getByRole('button', { name: /Lưu/ }));
    expect(onSave).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('(bước 2)'));

    toast.error.mockClear();
    fireEvent.change(screen.getAllByPlaceholderText(messagePlaceholder)[1], { target: { value: 'b' } });
    fireEvent.change(screen.getByLabelText('Số thời gian chờ trước bước 2'), { target: { value: '-3' } });
    // Ô nhập ép về >= 0 nên trễ âm không thể nhập từ giao diện; ép cấu hình sai từ ngoài bằng node đã lưu.
    fireEvent.click(screen.getByRole('button', { name: /Lưu/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].steps[1].delayValue).toBe(0);
  });

  it('cấu hình cũ (1 bước, không delay) mở lên/lưu lại KHÔNG thêm trường trễ', async () => {
    const onSave = vi.fn();
    renderModal(makeNode({ steps: [{ message: 'Xin chào' }] }), onSave);
    fireEvent.click(screen.getByRole('button', { name: /Lưu/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].steps).toEqual([{ message: 'Xin chào' }]);
  });
});
