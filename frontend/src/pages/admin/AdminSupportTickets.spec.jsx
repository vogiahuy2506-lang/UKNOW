/**
 * Màn admin ticket góp ý (PR-5 ticket, 10/10/2026): danh sách + tab đếm + lọc, chi tiết trả lời / đổi trạng thái,
 * tab "Liên hệ từ trang chủ".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => mockNavigate,
}));
// `t` ỔN ĐỊNH giữa các lần render như I18nProvider thật (mock realI18nModule tạo hàm mới mỗi lần → effect phụ thuộc `t` lặp vô hạn).
vi.mock('../../i18n', async () => {
  const { makeT } = await import('../../test/realI18n.js');
  const value = { t: makeT(null, 'vi'), locale: 'vi' };
  return { useI18n: (namespace = null) => (namespace ? makeT(namespace, 'vi') : value) };
});

const adminApi = vi.hoisted(() => ({
  listTickets: vi.fn(),
  getTicket: vi.fn(),
  reply: vi.fn(),
  setStatus: vi.fn(),
  uploadAttachment: vi.fn(),
  fetchAttachmentBlob: vi.fn(),
  listContactSubmissions: vi.fn(),
  updateContactSubmission: vi.fn(),
}));
vi.mock('../../features/support/services/supportApi.service', () => ({
  supportAdminApi: adminApi,
  supportUserApi: {},
}));

const { default: AdminSupportTicketsPage } = await import('./AdminSupportTicketsPage');
const { default: AdminSupportTicketDetailPage } = await import('./AdminSupportTicketDetailPage');

const TICKET_LIST = {
  items: [
    {
      id: 9,
      subject: 'Muốn thêm báo cáo',
      category: 'feedback',
      status: 'open',
      lastMessageAt: '2026-10-10T03:00:00.000Z',
      user: { id: 39, fullName: 'Trương Hồ', email: 'a@example.com', username: 'a' },
      lastMessage: { authorRole: 'user', excerpt: 'Cho mình xuất Excel', createdAt: '2026-10-10T03:00:00.000Z' },
    },
  ],
  counts: { open: 4, awaiting_user: 2, closed: 7, all: 13 },
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
};

const CONTACTS = {
  items: [
    {
      id: 3,
      name: 'Lê Khách',
      email: 'khach@example.com',
      phone: '0900000000',
      company: 'Công ty X',
      companySize: '10-50',
      message: 'Tôi muốn tư vấn gói doanh nghiệp',
      status: 'new',
      notes: null,
      createdAt: '2026-08-10T03:00:00.000Z',
    },
  ],
  counts: { new: 1, contacted: 0, qualified: 0, closed: 0, all: 1 },
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
};

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
  globalThis.URL.revokeObjectURL = vi.fn();
  adminApi.listTickets.mockResolvedValue(TICKET_LIST);
  adminApi.listContactSubmissions.mockResolvedValue(CONTACTS);
});

describe('AdminSupportTicketsPage', () => {
  const renderList = () =>
    render(
      <MemoryRouter>
        <AdminSupportTicketsPage />
      </MemoryRouter>,
    );

  it('tab trạng thái hiện số đếm từ counts và bảng có người gửi / loại / tiêu đề / tin cuối', async () => {
    renderList();
    const row = await screen.findByTestId('admin-ticket-row');
    expect(within(row).getByText('Trương Hồ')).toBeInTheDocument();
    expect(within(row).getByText('Góp ý')).toBeInTheDocument();
    expect(within(row).getByText('Muốn thêm báo cáo')).toBeInTheDocument();
    expect(within(row).getByText(/Cho mình xuất Excel/)).toBeInTheDocument();

    const tabs = screen.getAllByRole('tab');
    const label = (re) => tabs.find((tab) => re.test(tab.textContent));
    expect(label(/^Tất cả/).textContent).toContain('(13)');
    expect(label(/^Đang xử lý/).textContent).toContain('(4)');
    expect(label(/^Chờ bạn phản hồi/).textContent).toContain('(2)');
    expect(label(/^Đã đóng/).textContent).toContain('(7)');
    expect(adminApi.listTickets).toHaveBeenCalledWith(expect.objectContaining({ status: 'all', page: 1 }));
  });

  it('bấm tab trạng thái → query truyền đúng status', async () => {
    const user = userEvent.setup();
    renderList();
    await screen.findByTestId('admin-ticket-row');
    await user.click(screen.getByRole('tab', { name: /^Chờ bạn phản hồi/ }));
    await waitFor(() =>
      expect(adminApi.listTickets).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'awaiting_user' })),
    );
  });

  it('lọc loại và tìm kiếm → query truyền category + search', async () => {
    const user = userEvent.setup();
    renderList();
    await screen.findByTestId('admin-ticket-row');
    await user.selectOptions(screen.getByLabelText('Lọc theo loại'), 'bug');
    await waitFor(() => expect(adminApi.listTickets).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'bug' })));

    await user.type(screen.getByLabelText('Tìm tiêu đề, người gửi...'), 'excel');
    await user.click(screen.getByRole('button', { name: 'Tìm' }));
    await waitFor(() =>
      expect(adminApi.listTickets).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'bug', search: 'excel' })),
    );
  });

  it('bấm hàng → mở /admin/tickets/:id', async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(await screen.findByTestId('admin-ticket-row'));
    expect(mockNavigate).toHaveBeenCalledWith('/admin/tickets/9');
  });

  it('tab "Liên hệ từ trang chủ": đổi trạng thái PATCH {status}, lưu ghi chú PATCH {notes}, có mailto', async () => {
    adminApi.updateContactSubmission.mockImplementation(async (id, patch) => ({ id, ...patch }));
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole('tab', { name: 'Liên hệ từ trang chủ' }));

    const row = await screen.findByTestId('contact-row');
    expect(within(row).getByText('Lê Khách')).toBeInTheDocument();
    expect(within(row).getByText('Tôi muốn tư vấn gói doanh nghiệp')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: /Trả lời qua email/ }).getAttribute('href')).toMatch(
      /^mailto:khach@example\.com\?subject=/,
    );

    await user.selectOptions(within(row).getByLabelText('Trạng thái liên hệ'), 'contacted');
    await waitFor(() => expect(adminApi.updateContactSubmission).toHaveBeenCalledWith(3, { status: 'contacted' }));

    await user.type(within(row).getByLabelText('Ghi chú nội bộ'), 'Gọi lại chiều mai');
    await user.click(within(row).getByRole('button', { name: 'Lưu ghi chú' }));
    await waitFor(() => expect(adminApi.updateContactSubmission).toHaveBeenLastCalledWith(3, { notes: 'Gọi lại chiều mai' }));
  });
});

describe('AdminSupportTicketDetailPage', () => {
  const TICKET = {
    id: 9,
    subject: 'Muốn thêm báo cáo',
    category: 'feedback',
    status: 'open',
    user: { id: 39, fullName: 'Trương Hồ', email: 'a@example.com', username: 'a' },
  };
  const MESSAGES = [
    { id: 1, authorRole: 'user', authorName: 'Trương Hồ', body: 'Cho mình xuất Excel', attachments: [] },
    { id: 2, authorRole: 'admin', authorName: null, body: 'Đã ghi nhận', attachments: [] },
  ];

  const renderDetail = () =>
    render(
      <MemoryRouter initialEntries={['/admin/tickets/9']}>
        <Routes>
          <Route path="/admin/tickets/:id" element={<AdminSupportTicketDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

  beforeEach(() => {
    adminApi.getTicket.mockResolvedValue({ ticket: { ...TICKET }, messages: MESSAGES.map((m) => ({ ...m })) });
    adminApi.uploadAttachment.mockResolvedValue({ storageObjectId: 77, name: 'a.png' });
  });

  it('thread hiện tên thật của người gửi; tin admin không tên hiện "Founder AI"', async () => {
    renderDetail();
    const messages = await screen.findAllByTestId('support-message');
    expect(within(messages[0]).getByText('Trương Hồ')).toBeInTheDocument();
    expect(within(messages[1]).getByText('Founder AI')).toBeInTheDocument();
    expect(adminApi.getTicket).toHaveBeenCalledWith('9');
  });

  it('trả lời gọi reply(id, {body, attachmentIds}) rồi tải lại thread', async () => {
    adminApi.reply.mockResolvedValue({ ticket: { ...TICKET, status: 'awaiting_user' } });
    const user = userEvent.setup();
    renderDetail();
    await screen.findAllByTestId('support-message');

    await user.type(screen.getByLabelText('Trả lời'), 'Sẽ có trong bản tới');
    await user.upload(screen.getByTestId('support-file-input'), [new File(['x'], 'a.png', { type: 'image/png' })]);
    await waitFor(() => expect(screen.getByText(/1\/3 ảnh/)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Gửi trả lời' }));

    await waitFor(() =>
      expect(adminApi.reply).toHaveBeenCalledWith('9', { body: 'Sẽ có trong bản tới', attachmentIds: [77] }),
    );
    await waitFor(() => expect(adminApi.getTicket).toHaveBeenCalledTimes(2));
  });

  it('đổi trạng thái gọi setStatus(id, status)', async () => {
    adminApi.setStatus.mockResolvedValue({ ticket: { ...TICKET, status: 'closed' } });
    const user = userEvent.setup();
    renderDetail();
    await screen.findAllByTestId('support-message');

    await user.selectOptions(screen.getByLabelText('Đổi trạng thái'), 'closed');
    await waitFor(() => expect(adminApi.setStatus).toHaveBeenCalledWith('9', 'closed'));
  });
});
