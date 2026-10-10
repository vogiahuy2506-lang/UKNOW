/**
 * Chi tiết ticket của người dùng (PR-5 ticket, 10/10/2026): thread, nhãn "Hỗ trợ Founder AI", trả lời, đóng.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

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

const { default: SupportTicketDetailPage } = await import('./SupportTicketDetailPage');

const TICKET = {
  id: 5,
  subject: 'Hoá đơn sai',
  category: 'billing',
  status: 'awaiting_user',
};

const MESSAGES = [
  { id: 1, authorRole: 'user', authorName: 'Nguyễn Văn A', body: 'Hoá đơn của tôi sai MST', attachments: [] },
  {
    id: 2,
    authorRole: 'admin',
    authorName: null,
    body: 'Bạn gửi giúp mình ảnh chụp nhé\n(xuống dòng)',
    attachments: [{ storageObjectId: 90, name: 'hoa-don.png', size: 10, mime: 'image/png' }],
  },
];

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/app/support/5']}>
      <Routes>
        <Route path="/app/support/:id" element={<SupportTicketDetailPage />} />
        <Route path="/app/support" element={<div>DANH-SACH</div>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:thumb');
  globalThis.URL.revokeObjectURL = vi.fn();
  userApi.getTicket.mockResolvedValue({ ticket: { ...TICKET }, messages: MESSAGES.map((m) => ({ ...m })) });
  userApi.fetchAttachmentBlob.mockResolvedValue(new Blob(['img'], { type: 'image/png' }));
  userApi.uploadAttachment.mockResolvedValue({ storageObjectId: 321, name: 'x.png' });
});

describe('SupportTicketDetailPage', () => {
  it('tin admin (authorName null) hiện "Hỗ trợ Founder AI", tin của tôi hiện "Bạn"', async () => {
    renderPage();
    const messages = await screen.findAllByTestId('support-message');
    expect(messages).toHaveLength(2);
    expect(within(messages[0]).getByText('Bạn')).toBeInTheDocument();
    expect(within(messages[1]).getByText('Hỗ trợ Founder AI')).toBeInTheDocument();
    expect(userApi.getTicket).toHaveBeenCalledWith('5');
  });

  it('ảnh đính kèm tải bằng blob (fetchAttachmentBlob), không gắn URL API vào <img>', async () => {
    renderPage();
    const img = await screen.findByRole('img', { name: 'hoa-don.png' });
    expect(userApi.fetchAttachmentBlob).toHaveBeenCalledWith(5, 90);
    expect(img.getAttribute('src')).toBe('blob:thumb');
  });

  it('bấm ảnh thu nhỏ mở ảnh lớn', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: /Xem ảnh hoa-don\.png/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('trả lời gọi postMessage(id, {body, attachmentIds}) và thêm tin vào thread', async () => {
    userApi.postMessage.mockResolvedValue({
      ticket: { ...TICKET, status: 'open' },
      message: { id: 3, authorRole: 'user', authorName: 'Nguyễn Văn A', body: 'Đây là ảnh', attachments: [] },
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByTestId('support-message');

    await user.type(screen.getByLabelText('Trả lời'), '  Đây là ảnh  ');
    await user.click(screen.getByRole('button', { name: 'Gửi trả lời' }));

    await waitFor(() => expect(userApi.postMessage).toHaveBeenCalledWith('5', { body: 'Đây là ảnh', attachmentIds: [] }));
    expect(await screen.findAllByTestId('support-message')).toHaveLength(3);
    expect(screen.getByText('Đang xử lý')).toBeInTheDocument();
  });

  it('trả lời kèm ảnh: attachmentIds lấy từ ảnh đã tải', async () => {
    userApi.postMessage.mockResolvedValue({ ticket: { ...TICKET, status: 'open' }, message: { id: 4, authorRole: 'user', body: 'k', attachments: [] } });
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByTestId('support-message');
    await user.type(screen.getByLabelText('Trả lời'), 'có ảnh');
    await user.upload(screen.getByTestId('support-file-input'), [new File(['x'], 'x.png', { type: 'image/png' })]);
    await waitFor(() => expect(screen.getByText(/1\/3 ảnh/)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Gửi trả lời' }));
    await waitFor(() => expect(userApi.postMessage).toHaveBeenCalledWith('5', { body: 'có ảnh', attachmentIds: [321] }));
  });

  it('nút Đóng: xác nhận rồi gọi closeTicket; ticket đóng vẫn có ô trả lời kèm lời nhắn mở lại', async () => {
    userApi.closeTicket.mockResolvedValue({ ticket: { ...TICKET, status: 'closed' } });
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByTestId('support-message');

    await user.click(screen.getByRole('button', { name: 'Đóng góp ý' }));
    const confirm = await screen.findByText('Đóng góp ý này?');
    const dialogButtons = within(confirm.closest('[role="dialog"]') || document.body).getAllByRole('button', { name: 'Đóng góp ý' });
    await user.click(dialogButtons[dialogButtons.length - 1]);

    await waitFor(() => expect(userApi.closeTicket).toHaveBeenCalledWith('5'));
    expect(await screen.findByText(/Góp ý đã đóng/)).toBeInTheDocument();
    expect(screen.getByLabelText('Trả lời')).toBeInTheDocument();
  });

  it('ticket của người khác (404) → báo không tìm thấy', async () => {
    userApi.getTicket.mockRejectedValue({ response: { status: 404 } });
    renderPage();
    expect(await screen.findByText('Không tìm thấy góp ý này')).toBeInTheDocument();
  });
});
