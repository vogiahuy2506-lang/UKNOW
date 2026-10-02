import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../../../i18n';
import ChannelTemplates from '../ChannelTemplates';

/**
 * Trang Thư viện Template: Email giữ riêng, còn tab thứ hai là kho "Tin nhắn" DÙNG CHUNG Zalo / Telegram / WhatsApp
 * (bảng `zalo_templates` giữ nguyên tên, chỉ đổi chữ hiển thị). Mock ở ranh giới đúng hình dạng thật
 * `{ data: { data: { items, pagination } } }` (xem fetchAllTemplateListPages).
 */
const mocks = vi.hoisted(() => ({
  emailGetTemplates: vi.fn(),
  emailGetTemplateById: vi.fn(),
  zaloGetTemplates: vi.fn(),
  zaloGetTemplateById: vi.fn(),
  getLabels: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../../features/templates/services/emailTemplateApi.service', () => ({
  default: { getTemplates: mocks.emailGetTemplates, getTemplateById: mocks.emailGetTemplateById },
}));
vi.mock('../../../features/templates/services/zaloTemplateApi.service', () => ({
  default: { getTemplates: mocks.zaloGetTemplates, getTemplateById: mocks.zaloGetTemplateById },
}));
vi.mock('../../../features/templates/services/templateLabelApi.service', () => ({
  default: { getLabels: mocks.getLabels },
}));
vi.mock('../../../features/storage/useStorageQuota', () => ({ default: () => ({ usage: null }) }));

const page = (items) => ({ data: { data: { items, pagination: { totalPages: 1 } } } });
const detail = (data) => ({ data: { data } });
const sixImages = Array.from({ length: 6 }, (_, index) => ({
  key: `uploads/1/zalo/anh${index}.jpg`,
  displayName: `anh${index}.jpg`,
  originalName: `anh${index}.jpg`,
  size: 1000,
}));

const renderPage = () => render(
  <I18nProvider>
    <MemoryRouter>
      <ChannelTemplates />
    </MemoryRouter>
  </I18nProvider>
);

const openMessagesTab = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Tin nhắn' }));
};

describe('ChannelTemplates — mẫu tin nhắn dùng chung 3 kênh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLabels.mockResolvedValue({ data: { data: [] } });
    mocks.emailGetTemplates.mockResolvedValue(page([
      { id: 1, templateName: 'Email chào mừng', subject: 'Chào bạn', category: 'marketing', attachments: [] },
    ]));
    mocks.emailGetTemplateById.mockResolvedValue(detail({
      id: 1, templateName: 'Email chào mừng', subject: 'Chào bạn', bodyHtml: '<p>Hi</p>', category: 'marketing', attachments: sixImages,
    }));
    mocks.zaloGetTemplates.mockResolvedValue(page([
      { id: 10, templateName: 'Mẫu 6 ảnh', category: 'marketing' },
      { id: 11, templateName: 'Mẫu 1 ảnh', category: 'marketing' },
    ]));
    mocks.zaloGetTemplateById.mockImplementation(async (id) => detail({
      id,
      templateName: id === 10 ? 'Mẫu 6 ảnh' : 'Mẫu 1 ảnh',
      bodyText: 'Xin chào {{ten}}',
      category: 'marketing',
      attachments: id === 10 ? sixImages : sixImages.slice(0, 1),
    }));
  });

  it('tab thứ hai là "Tin nhắn", không còn tab nào chỉ ghi "Zalo"', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: 'Email' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tin nhắn' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zalo' })).toBeNull();
  });

  it('tab Tin nhắn: tiêu đề trung tính kênh + dòng phụ nói rõ dùng chung Zalo, Telegram và WhatsApp', async () => {
    renderPage();
    await openMessagesTab();
    expect(await screen.findByText('Thư viện mẫu tin nhắn')).toBeInTheDocument();
    expect(screen.getByText(/Dùng chung cho Zalo, Telegram và WhatsApp/)).toBeInTheDocument();
    expect(screen.queryByText(/Thư viện Template Zalo/)).toBeNull();
    expect(screen.getByPlaceholderText('Tìm kiếm mẫu tin nhắn...')).toBeInTheDocument();
    // vẫn đọc đúng kho cũ (route /zalo-templates không đổi)
    await waitFor(() => expect(mocks.zaloGetTemplates).toHaveBeenCalled());
  });

  it('mở mẫu có 6 ảnh: hiện cảnh báo giới hạn Telegram/WhatsApp', async () => {
    renderPage();
    await openMessagesTab();
    fireEvent.click(await screen.findByText('Mẫu 6 ảnh'));
    const warning = await screen.findByTestId('channel-limit-warning');
    expect(warning).toHaveTextContent('Telegram/WhatsApp chỉ gửi được tối đa 5 ảnh');
    expect(warning).toHaveTextContent('tệp vượt sẽ bị chặn khi gửi');
  });

  it('mở mẫu có 1 ảnh: không có cảnh báo (và không chặn lưu)', async () => {
    renderPage();
    await openMessagesTab();
    fireEvent.click(await screen.findByText('Mẫu 1 ảnh'));
    // chờ trình soạn mở xong (ô Tên mẫu có giá trị) rồi mới khẳng định vắng mặt
    expect(await screen.findByDisplayValue('Mẫu 1 ảnh')).toBeInTheDocument();
    expect(screen.queryByTestId('channel-limit-warning')).toBeNull();
  });

  it('mẫu EMAIL có 6 ảnh: không nhắc (trần Telegram/WhatsApp không liên quan tới email)', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('Email chào mừng'));
    expect(await screen.findByDisplayValue('Email chào mừng')).toBeInTheDocument();
    expect(screen.queryByTestId('channel-limit-warning')).toBeNull();
  });
});
