import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../../../i18n';
import ChannelTemplates from '../ChannelTemplates';

/**
 * Trang soạn mẫu gọn: không còn tab "Thiết lập biến"; cột phải "Chèn thông tin khách" chèn vào đúng ô con trỏ,
 * "Đang dùng trong mẫu" tự phát hiện từ tiêu đề + nội dung, và `variables` gửi lên là danh sách tự phát hiện.
 * Mock ở ranh giới service, đúng hình dạng thật `{ data: { data } }`.
 */
const mocks = vi.hoisted(() => ({
  emailGetTemplates: vi.fn(),
  emailGetTemplateById: vi.fn(),
  emailUpdate: vi.fn(),
  zaloGetTemplates: vi.fn(),
  zaloGetTemplateById: vi.fn(),
  getLabels: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('../../../features/templates/services/emailTemplateApi.service', () => ({
  default: {
    getTemplates: mocks.emailGetTemplates,
    getTemplateById: mocks.emailGetTemplateById,
    updateTemplate: mocks.emailUpdate,
  },
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

const OLD_EMAIL = {
  id: 1,
  templateName: 'Thư mời cũ',
  subject: 'Kính mời {{tenkhach}}',
  bodyHtml: '',
  bodyText: 'Kính gửi {{tenkhach}}, lãnh đạo {{donvi}}',
  category: 'marketing',
  attachments: [],
  variables: [
    { name: 'Họ và tên khách', key: 'tenkhach' },
    { name: 'Đơn vị / Cơ quan', key: 'donvi' },
  ],
};

const renderPage = () => render(
  <I18nProvider>
    <MemoryRouter>
      <ChannelTemplates />
    </MemoryRouter>
  </I18nProvider>
);

const openOldEmail = async () => {
  fireEvent.click(await screen.findByText('Thư mời cũ'));
  const subject = await screen.findByDisplayValue('Kính mời {{tenkhach}}');
  return subject;
};

const openTextTab = async () => {
  fireEvent.click(screen.getByRole('button', { name: /Định dạng Text/ }));
  return screen.findByDisplayValue(/Kính gửi \{\{tenkhach\}\}/);
};

describe('Trình soạn mẫu gọn — chèn thông tin khách, không còn tab Thiết lập biến', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLabels.mockResolvedValue({ data: { data: [] } });
    mocks.emailGetTemplates.mockResolvedValue(page([
      { id: 1, templateName: 'Thư mời cũ', subject: OLD_EMAIL.subject, category: 'marketing', attachments: [] },
    ]));
    mocks.emailGetTemplateById.mockResolvedValue(detail(OLD_EMAIL));
    mocks.emailUpdate.mockResolvedValue({ data: { data: {} } });
    mocks.zaloGetTemplates.mockResolvedValue(page([{ id: 10, templateName: 'Tin Zalo', category: 'marketing' }]));
    mocks.zaloGetTemplateById.mockResolvedValue(detail({
      id: 10, templateName: 'Tin Zalo', bodyText: 'Chào {{ten_khach}}', category: 'marketing', attachments: [],
    }));
  });

  it('không còn tab "Thiết lập biến" hay thanh "Thiết lập biến (N)"', async () => {
    renderPage();
    await openOldEmail();
    expect(screen.queryByText(/Thiết lập biến/)).toBeNull();
    expect(screen.queryByText('Tên biến')).toBeNull();
    expect(screen.queryByText('Mã biến')).toBeNull();
    expect(screen.getByTestId('template-customer-info-panel')).toBeInTheDocument();
  });

  it('gợi ý chỉ gồm 3 thông tin bộ chạy tự ghép được; không còn tenkhach/donvi/chucvu/khoá học', async () => {
    renderPage();
    await openOldEmail();
    const panel = screen.getByTestId('template-customer-info-panel');
    expect(within(panel).getByRole('button', { name: /Tên khách hàng/ })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: /Email khách hàng/ })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: /Số điện thoại/ })).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: /Chức vụ|Đơn vị|khóa học|Họ và tên khách/ })).toBeNull();
  });

  it('mẫu cũ có tenkhach/donvi: mục "Đang dùng trong mẫu" vẫn hiện đúng, kèm nguồn giá trị', async () => {
    renderPage();
    await openOldEmail();
    const panel = screen.getByTestId('template-customer-info-panel');
    expect(within(panel).getByText('Đang dùng trong mẫu')).toBeInTheDocument();
    expect(within(panel).getByText('{{tenkhach}}')).toBeInTheDocument();
    expect(within(panel).getByText('{{donvi}}')).toBeInTheDocument();
    expect(within(panel).getByText('Họ và tên khách')).toBeInTheDocument();
    expect(within(panel).getByText(/Lấy từ cột “donvi” trong Google Sheet hoặc biểu mẫu/)).toBeInTheDocument();
    // câu mô tả không còn in nguyên {email} (lỗi nội suy cũ)
    expect(screen.queryByText(/\{email\}/)).toBeNull();
  });

  it('chip chèn vào TIÊU ĐỀ khi con trỏ đang ở tiêu đề', async () => {
    renderPage();
    const subject = await openOldEmail();
    subject.focus();
    subject.setSelectionRange(subject.value.length, subject.value.length);
    fireEvent.click(subject);
    fireEvent.click(within(screen.getByTestId('template-customer-info-panel')).getByRole('button', { name: /Email khách hàng/ }));
    await waitFor(() => expect(screen.getByDisplayValue('Kính mời {{tenkhach}}{{email_khach}}')).toBeInTheDocument());
  });

  it('chip chèn vào NỘI DUNG (không đụng tiêu đề) khi con trỏ đang ở nội dung', async () => {
    renderPage();
    await openOldEmail();
    const body = await openTextTab();
    body.focus();
    body.setSelectionRange(0, 0);
    fireEvent.click(body);
    fireEvent.click(within(screen.getByTestId('template-customer-info-panel')).getByRole('button', { name: /Số điện thoại/ }));
    await waitFor(() => expect(screen.getByDisplayValue(/^\{\{so_dien_thoai\}\}Kính gửi/)).toBeInTheDocument());
    expect(screen.getByDisplayValue('Kính mời {{tenkhach}}')).toBeInTheDocument();
  });

  it('"Đang dùng trong mẫu" tự cập nhật khi gõ thêm / xoá biến ở tiêu đề', async () => {
    renderPage();
    const subject = await openOldEmail();
    const panel = screen.getByTestId('template-customer-info-panel');
    fireEvent.change(subject, { target: { value: 'Chào {{ten_khach}}', selectionStart: 18 } });
    expect(within(panel).getByText('{{ten_khach}}')).toBeInTheDocument();
    expect(within(panel).getByText('Tự lấy tên khách')).toBeInTheDocument();
    fireEvent.change(subject, { target: { value: 'Chào bạn', selectionStart: 8 } });
    expect(within(panel).queryByText('{{ten_khach}}')).toBeNull();
  });

  it('biến phát hiện ở TIÊU ĐỀ cũng được tính (không chỉ nội dung)', async () => {
    renderPage();
    const subject = await openOldEmail();
    const panel = screen.getByTestId('template-customer-info-panel');
    fireEvent.change(subject, { target: { value: '{{email_khach}} ơi', selectionStart: 3 } });
    expect(within(panel).getByText('{{email_khach}}')).toBeInTheDocument();
    expect(within(panel).getByText('Tự lấy email của khách')).toBeInTheDocument();
  });

  it('thêm thông tin khác: "Chức vụ" chèn {{chuc_vu}}, Enter không gửi form', async () => {
    renderPage();
    await openOldEmail();
    const panel = screen.getByTestId('template-customer-info-panel');
    const input = within(panel).getByPlaceholderText('Tên cột trong file của bạn');
    fireEvent.change(input, { target: { value: 'Chức vụ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(within(panel).getByText('{{chuc_vu}}')).toBeInTheDocument());
    expect(mocks.emailUpdate).not.toHaveBeenCalled();
    expect(input).toHaveValue('');
  });

  it('lưu: `variables` gửi lên là danh sách tự phát hiện (hình dạng cũ {name, key}), giữ tên đã khai báo', async () => {
    renderPage();
    const subject = await openOldEmail();
    fireEvent.change(subject, { target: { value: 'Mời {{ten_khach}} {{tenkhach}}', selectionStart: 5 } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(mocks.emailUpdate).toHaveBeenCalledTimes(1));
    const [id, payload] = mocks.emailUpdate.mock.calls[0];
    expect(id).toBe(1);
    expect(payload.variables).toEqual([
      { name: 'Tên khách hàng', key: 'ten_khach' },
      { name: 'Họ và tên khách', key: 'tenkhach' },
      { name: 'Đơn vị / Cơ quan', key: 'donvi' },
    ]);
  });

  it('lưu mẫu không có biến: variables rỗng (không giữ biến cũ không còn trong chữ)', async () => {
    mocks.emailGetTemplateById.mockResolvedValue(detail({
      ...OLD_EMAIL, subject: 'Chào', bodyText: 'Nội dung', variables: OLD_EMAIL.variables,
    }));
    mocks.emailGetTemplates.mockResolvedValue(page([{ id: 1, templateName: 'Thư mời cũ', subject: 'Chào', category: 'marketing' }]));
    renderPage();
    fireEvent.click(await screen.findByText('Thư mời cũ'));
    await screen.findByDisplayValue('Chào');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(mocks.emailUpdate).toHaveBeenCalledTimes(1));
    expect(mocks.emailUpdate.mock.calls[0][1].variables).toEqual([]);
  });

  it('mẫu tin nhắn (không tiêu đề) chạy như email: có cột chèn thông tin khách', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Tin nhắn' }));
    fireEvent.click(await screen.findByText('Tin Zalo'));
    await screen.findByDisplayValue('Chào {{ten_khach}}');
    const panel = screen.getByTestId('template-customer-info-panel');
    expect(within(panel).getByText('{{ten_khach}}')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: /Email khách hàng/ })).toBeInTheDocument();
    expect(screen.queryByText(/Thiết lập biến/)).toBeNull();
  });
});
