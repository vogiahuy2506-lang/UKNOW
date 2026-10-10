/**
 * Trang "Góp ý & hỗ trợ" của người dùng (PR-5 ticket, 10/10/2026): danh sách, modal tạo ticket (payload đúng,
 * chặn ảnh thứ 4 ngay ở FE).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

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

const userApi = vi.hoisted(() => ({
  listTickets: vi.fn(),
  getTicket: vi.fn(),
  createTicket: vi.fn(),
  postMessage: vi.fn(),
  closeTicket: vi.fn(),
  uploadAttachment: vi.fn(),
  fetchAttachmentBlob: vi.fn(),
}));
vi.mock('../../features/support/services/supportApi.service', () => ({
  supportUserApi: userApi,
  supportAdminApi: {},
}));

const { default: SupportTicketsPage } = await import('./SupportTicketsPage');

const LIST = {
  items: [
    {
      id: 7,
      subject: 'Không gửi được Zalo',
      category: 'bug',
      status: 'awaiting_user',
      lastMessageAt: '2026-10-10T03:00:00.000Z',
      lastMessage: { authorRole: 'admin', excerpt: 'Bạn thử đăng nhập lại giúp mình', createdAt: '2026-10-10T03:00:00.000Z' },
    },
  ],
  counts: { open: 0, awaiting_user: 1, closed: 0, all: 1 },
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
};

const png = (name) => new File(['x'], name, { type: 'image/png' });

const renderPage = () =>
  render(
    <MemoryRouter>
      <SupportTicketsPage />
    </MemoryRouter>,
  );

let uploadSeq;
beforeEach(() => {
  vi.clearAllMocks();
  uploadSeq = 0;
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:preview');
  globalThis.URL.revokeObjectURL = vi.fn();
  userApi.listTickets.mockResolvedValue(LIST);
  userApi.uploadAttachment.mockImplementation(async (file) => {
    uploadSeq += 1;
    return { storageObjectId: 100 + uploadSeq, name: file.name, size: 1, mime: 'image/png' };
  });
  userApi.createTicket.mockResolvedValue({ ticket: { id: 55 }, messages: [] });
});

const openModal = async (user) => {
  await screen.findByText('Không gửi được Zalo');
  await user.click(screen.getByRole('button', { name: /Gửi góp ý/ }));
  return screen.findByRole('dialog');
};

describe('SupportTicketsPage', () => {
  it('liệt kê ticket của tôi với trạng thái, loại và tin cuối do "Hỗ trợ Founder AI"', async () => {
    renderPage();
    const row = await screen.findByTestId('support-ticket-row');
    expect(row).toHaveAttribute('href', '/app/support/7');
    expect(within(row).getByText('Chờ phản hồi')).toBeInTheDocument();
    expect(within(row).getByText('Bạn thử đăng nhập lại giúp mình', { exact: false })).toBeInTheDocument();
    expect(within(row).getByText(/Hỗ trợ Founder AI/)).toBeInTheDocument();
    expect(userApi.listTickets).toHaveBeenCalledWith({ page: 1, limit: 20, status: 'all' });
  });

  it('lọc theo tab trạng thái → hỏi API đúng status', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('support-ticket-row');
    await user.click(screen.getByRole('tab', { name: /Chờ bạn phản hồi/ }));
    await waitFor(() =>
      expect(userApi.listTickets).toHaveBeenLastCalledWith({ page: 1, limit: 20, status: 'awaiting_user' }),
    );
  });

  it('tạo ticket: gọi createTicket đúng payload {subject, category, body, attachmentIds} rồi mở trang chi tiết', async () => {
    const user = userEvent.setup();
    renderPage();
    const dialog = await openModal(user);

    await user.selectOptions(within(dialog).getByLabelText('Loại'), 'bug');
    await user.type(within(dialog).getByLabelText('Tiêu đề'), '  Lỗi gửi tin  ');
    await user.type(within(dialog).getByLabelText('Nội dung'), 'Chiến dịch không chạy');
    await user.upload(within(dialog).getByTestId('support-file-input'), [png('a.png')]);
    await waitFor(() => expect(within(dialog).getByText(/1\/3 ảnh/)).toBeInTheDocument());

    await user.click(within(dialog).getByRole('button', { name: 'Gửi' }));

    await waitFor(() => expect(userApi.createTicket).toHaveBeenCalledTimes(1));
    expect(userApi.createTicket).toHaveBeenCalledWith({
      subject: 'Lỗi gửi tin',
      category: 'bug',
      body: 'Chiến dịch không chạy',
      attachmentIds: [101],
    });
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/app/support/55'));
  });

  it('nút Gửi bị khoá khi thiếu tiêu đề hoặc nội dung', async () => {
    const user = userEvent.setup();
    renderPage();
    const dialog = await openModal(user);
    expect(within(dialog).getByRole('button', { name: 'Gửi' })).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Tiêu đề'), 'Chỉ có tiêu đề');
    expect(within(dialog).getByRole('button', { name: 'Gửi' })).toBeDisabled();
  });

  it('chặn ảnh thứ 4 ngay ở FE: KHÔNG gọi upload lần thứ 4', async () => {
    const user = userEvent.setup();
    renderPage();
    const dialog = await openModal(user);
    const input = within(dialog).getByTestId('support-file-input');

    await user.upload(input, [png('a.png'), png('b.png'), png('c.png')]);
    await waitFor(() => expect(within(dialog).getByText(/3\/3 ảnh/)).toBeInTheDocument());
    expect(userApi.uploadAttachment).toHaveBeenCalledTimes(3);

    await user.upload(input, [png('d.png')]);
    expect(userApi.uploadAttachment).toHaveBeenCalledTimes(3);
    expect(within(dialog).getByText(/3\/3 ảnh/)).toBeInTheDocument();
  });

  it('chọn 4 ảnh một lượt chỉ tải 3 ảnh đầu', async () => {
    const user = userEvent.setup();
    renderPage();
    const dialog = await openModal(user);
    await user.upload(within(dialog).getByTestId('support-file-input'), [
      png('a.png'),
      png('b.png'),
      png('c.png'),
      png('d.png'),
    ]);
    await waitFor(() => expect(within(dialog).getByText(/3\/3 ảnh/)).toBeInTheDocument());
    expect(userApi.uploadAttachment).toHaveBeenCalledTimes(3);
  });

  it('từ chối tệp không phải ảnh hợp lệ (pdf) và ảnh > 5 MB: không gọi upload', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderPage();
    const dialog = await openModal(user);
    const input = within(dialog).getByTestId('support-file-input');
    const big = new File(['x'], 'big.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 });

    await user.upload(input, [new File(['x'], 'a.pdf', { type: 'application/pdf' }), big]);
    expect(userApi.uploadAttachment).not.toHaveBeenCalled();
  });
});
