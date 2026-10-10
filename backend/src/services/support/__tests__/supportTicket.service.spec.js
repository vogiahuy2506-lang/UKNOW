import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const repo = {
  runInTransaction: jest.fn(),
  lockUserTicketCreation: jest.fn(),
  countCreatedSince: jest.fn(),
  insertTicket: jest.fn(),
  insertMessage: jest.fn(),
  lockTicketById: jest.fn(),
  touchAfterUserMessage: jest.fn(),
  touchAfterAdminReply: jest.fn(),
  setStatus: jest.fn(),
  findById: jest.fn(),
  listMessages: jest.fn(),
  list: jest.fn(),
  countByStatus: jest.fn(),
  findAttachmentInTicket: jest.fn(),
  closeStaleAwaitingUser: jest.fn(),
};
const mockNotifyUsers = jest.fn();
const mockNotifyAdmins = jest.fn();
const mockClaim = jest.fn();
const mockFindObject = jest.fn();
const CLIENT = { tag: 'tx-client' };

jest.unstable_mockModule('../../../repositories/support/supportTicket.repository.js', () => ({ default: repo }));
jest.unstable_mockModule('../../../repositories/storage.repository.js', () => ({
  findSupportTicketStorageObject: mockFindObject,
}));
jest.unstable_mockModule('../../notification/notificationDispatch.service.js', () => ({
  notifyUsers: mockNotifyUsers,
  notifyAdmins: mockNotifyAdmins,
}));
jest.unstable_mockModule('../supportTicketAttachment.service.js', () => ({
  claimAttachments: mockClaim,
  normalizeAttachmentIds: (raw) => (Array.isArray(raw) ? raw.map(Number) : []),
  toAttachmentDto: (a) => ({ storageObjectId: a.storageObjectId, name: a.name, size: a.size, mime: a.mime }),
}));

const svc = await import('../supportTicket.service.js');

const user = { id: 5, role: 'user', full_name: 'Khách A', username: 'khach_a', email: 'a@test.local', activeContext: { type: 'self', ownerId: 5 } };
const employee = { id: 12, role: 'user', full_name: 'NV', username: 'nv', email: 'nv@test.local', activeContext: { type: 'employee', ownerId: 9 } };
const admin = { id: 1, role: 'admin', full_name: 'Quản trị', username: 'root' };

const ticketRow = (over = {}) => ({
  id: '77', user_id: '5', workspace_owner_id: null, subject: 'Lỗi gửi mail', category: 'bug', status: 'open',
  last_message_at: 'T1', last_admin_reply_at: null, closed_at: null, closed_by: null, created_at: 'T0', updated_at: 'T1', ...over,
});
const messageRow = (over = {}) => ({
  id: '500', ticket_id: '77', author_user_id: '5', author_role: 'user', body: 'Nội dung', attachments: [], created_at: 'T1', ...over,
});

beforeEach(() => {
  jest.resetAllMocks();
  delete process.env.SUPPORT_TICKET_DAILY_LIMIT;
  repo.runInTransaction.mockImplementation(async (work) => work(CLIENT));
  repo.countCreatedSince.mockResolvedValue(0);
  repo.insertTicket.mockResolvedValue(ticketRow());
  repo.insertMessage.mockResolvedValue(messageRow());
  mockClaim.mockResolvedValue([]);
  mockNotifyAdmins.mockResolvedValue({});
  mockNotifyUsers.mockResolvedValue({});
});

describe('createTicket', () => {
  const input = { subject: '  Lỗi   gửi mail ', category: 'bug', body: 'Không gửi được\r\nmail', attachmentIds: [] };

  it('tạo ticket + tin đầu, chuẩn hoá chữ, trả { ticket, messages }; gọi notifyAdmins support_ticket_created với link admin', async () => {
    const data = await svc.createTicket(user, input);
    await svc.settlePendingSupportNotifications();

    expect(repo.insertTicket).toHaveBeenCalledWith(CLIENT, { userId: 5, workspaceOwnerId: null, subject: 'Lỗi gửi mail', category: 'bug' });
    expect(repo.insertMessage).toHaveBeenCalledWith(CLIENT, expect.objectContaining({
      ticketId: '77', authorUserId: 5, authorRole: 'user', body: 'Không gửi được\nmail',
    }));
    expect(data.ticket).toMatchObject({ id: 77, status: 'open', category: 'bug' });
    expect(data.messages).toHaveLength(1);
    expect(mockNotifyAdmins).toHaveBeenCalledTimes(1);
    expect(mockNotifyAdmins).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'support_ticket_created',
      link: '/admin/tickets/77',
      dedupeKey: 'support_ticket:77:created',
    }));
    expect(mockNotifyUsers).not.toHaveBeenCalled();
  });

  it('nhân viên: user_id = người thao tác, workspace_owner_id = chủ workspace', async () => {
    await svc.createTicket(employee, input);
    expect(repo.insertTicket).toHaveBeenCalledWith(CLIENT, expect.objectContaining({ userId: 12, workspaceOwnerId: 9 }));
  });

  it('lỗi dispatcher KHÔNG làm hỏng việc tạo ticket', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockNotifyAdmins.mockRejectedValue(new Error('smtp down'));
    await expect(svc.createTicket(user, input)).resolves.toMatchObject({ ticket: { id: 77 } });
    await svc.settlePendingSupportNotifications();
  });

  it('đủ 10 ticket trong 24 giờ → 429 SUPPORT_TICKET_DAILY_LIMIT, không chèn gì', async () => {
    repo.countCreatedSince.mockResolvedValue(10);
    await expect(svc.createTicket(user, input)).rejects.toMatchObject({ status: 429, code: 'SUPPORT_TICKET_DAILY_LIMIT' });
    expect(repo.insertTicket).not.toHaveBeenCalled();
    expect(repo.lockUserTicketCreation).toHaveBeenCalledWith(CLIENT, 5);
  });

  it('9 ticket → vẫn tạo được; env SUPPORT_TICKET_DAILY_LIMIT đổi trần', async () => {
    repo.countCreatedSince.mockResolvedValue(9);
    await expect(svc.createTicket(user, input)).resolves.toBeDefined();
    process.env.SUPPORT_TICKET_DAILY_LIMIT = '3';
    repo.countCreatedSince.mockResolvedValue(3);
    await expect(svc.createTicket(user, input)).rejects.toMatchObject({ status: 429 });
  });

  it.each([
    [{ subject: '   ', category: 'bug', body: 'x' }, 'SUPPORT_SUBJECT_REQUIRED'],
    [{ subject: 'a'.repeat(201), category: 'bug', body: 'x' }, 'SUPPORT_SUBJECT_TOO_LONG'],
    [{ subject: 's', category: 'khac', body: 'x' }, 'SUPPORT_CATEGORY_INVALID'],
    [{ subject: 's', category: 'bug', body: '' }, 'SUPPORT_BODY_REQUIRED'],
    [{ subject: 's', category: 'bug', body: 'a'.repeat(5001) }, 'SUPPORT_BODY_TOO_LONG'],
    [{ subject: 's', category: 'bug', body: { $ne: 1 } }, 'SUPPORT_BODY_REQUIRED'],
  ])('đầu vào sai %# → 400 %s, không mở giao dịch', async (bad, code) => {
    await expect(svc.createTicket(user, bad)).rejects.toMatchObject({ status: 400, code });
    expect(repo.runInTransaction).not.toHaveBeenCalled();
  });

  it('bỏ ký tự NUL (Postgres từ chối) trong tiêu đề và nội dung', async () => {
    await svc.createTicket(user, { subject: 'a\u0000b', category: 'other', body: 'x\u0000y' });
    expect(repo.insertTicket).toHaveBeenCalledWith(CLIENT, expect.objectContaining({ subject: 'a b' }));
    expect(repo.insertMessage).toHaveBeenCalledWith(CLIENT, expect.objectContaining({ body: 'xy' }));
  });

  it('gắn ảnh trong CÙNG giao dịch, theo id người thao tác và id ticket vừa tạo', async () => {
    mockClaim.mockResolvedValue([{ storageObjectId: 3, key: 'k', name: 'a.png', size: 10, mime: 'image/png' }]);
    await svc.createTicket(user, { ...input, attachmentIds: [3] });
    expect(mockClaim).toHaveBeenCalledWith(CLIENT, { objectIds: [3], actorUserId: 5, ticketId: '77' });
    expect(repo.insertMessage).toHaveBeenCalledWith(CLIENT, expect.objectContaining({
      attachments: [{ storageObjectId: 3, key: 'k', name: 'a.png', size: 10, mime: 'image/png' }],
    }));
  });

  it('ảnh không hợp lệ (claim ném 400) → cả ticket bị từ chối, không báo admin', async () => {
    const err = Object.assign(new Error('bad'), { status: 400, code: 'SUPPORT_ATTACHMENT_INVALID' });
    mockClaim.mockRejectedValue(err);
    await expect(svc.createTicket(user, { ...input, attachmentIds: [9] })).rejects.toMatchObject({ code: 'SUPPORT_ATTACHMENT_INVALID' });
    await svc.settlePendingSupportNotifications();
    expect(mockNotifyAdmins).not.toHaveBeenCalled();
  });
});

describe('quyền xem ticket', () => {
  it('getMyTicket hỏi repo với userId của chính người gọi; ticket của người khác (repo trả null) → 404', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(svc.getMyTicket(user, '77')).rejects.toMatchObject({ status: 404, code: 'SUPPORT_TICKET_NOT_FOUND' });
    expect(repo.findById).toHaveBeenCalledWith('77', { userId: 5 });
    expect(repo.listMessages).not.toHaveBeenCalled();
  });

  it('id không phải số → 400', async () => {
    await expect(svc.getMyTicket(user, 'abc')).rejects.toMatchObject({ status: 400, code: 'SUPPORT_TICKET_ID_INVALID' });
  });

  it('thread: tin của admin ẩn tên thật với người dùng, hiện với admin; ảnh không lộ khoá kho', async () => {
    repo.findById.mockResolvedValue(ticketRow());
    repo.listMessages.mockResolvedValue([
      messageRow(),
      messageRow({
        id: '501', author_role: 'admin', author_full_name: 'Admin Thật',
        attachments: [{ storageObjectId: 3, key: 'uploads/1/support/x.png', name: 'x.png', size: 5, mime: 'image/png' }],
      }),
    ]);
    const mine = await svc.getMyTicket(user, '77');
    expect(mine.messages[1]).toMatchObject({ authorRole: 'admin', authorName: null });
    expect(mine.messages[1].attachments[0]).toEqual({ storageObjectId: 3, name: 'x.png', size: 5, mime: 'image/png' });

    repo.findById.mockResolvedValue(ticketRow({ user_full_name: 'Khách A' }));
    const seenByAdmin = await svc.adminGetTicket('77');
    expect(repo.findById).toHaveBeenLastCalledWith('77');
    expect(seenByAdmin.messages[1].authorName).toBe('Admin Thật');
    expect(seenByAdmin.ticket.user).toMatchObject({ id: 5, fullName: 'Khách A' });
  });

  it('listMyTickets chỉ lọc theo userId của người gọi, status sai → 400', async () => {
    repo.list.mockResolvedValue({ rows: [ticketRow()], total: 1 });
    repo.countByStatus.mockResolvedValue({ open: 1, awaiting_user: 0, closed: 0 });
    const res = await svc.listMyTickets(employee, { status: 'open', page: '2', limit: '5' });
    expect(repo.list).toHaveBeenCalledWith({ userId: 12, status: 'open', page: 2, limit: 5 });
    expect(res.counts).toEqual({ open: 1, awaiting_user: 0, closed: 0, all: 1 });
    await expect(svc.listMyTickets(user, { status: 'x' })).rejects.toMatchObject({ status: 400, code: 'SUPPORT_STATUS_INVALID' });
  });
});

describe('addUserMessage', () => {
  it('ticket của người khác → 404, không chèn tin', async () => {
    repo.lockTicketById.mockResolvedValue(ticketRow({ user_id: '99' }));
    await expect(svc.addUserMessage(user, '77', { body: 'hi' })).rejects.toMatchObject({ status: 404 });
    expect(repo.insertMessage).not.toHaveBeenCalled();
  });

  it('của mình: chèn tin, ticket về open, báo admin support_ticket_user_replied (dedupe theo id tin)', async () => {
    repo.lockTicketById.mockResolvedValue(ticketRow({ status: 'awaiting_user' }));
    repo.touchAfterUserMessage.mockResolvedValue(ticketRow({ status: 'open' }));
    repo.insertMessage.mockResolvedValue(messageRow({ id: '501' }));
    const data = await svc.addUserMessage(user, '77', { body: ' trả lời ' });
    await svc.settlePendingSupportNotifications();

    expect(repo.touchAfterUserMessage).toHaveBeenCalledWith(CLIENT, '77');
    expect(data.ticket.status).toBe('open');
    expect(mockNotifyAdmins).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'support_ticket_user_replied', link: '/admin/tickets/77', dedupeKey: 'support_ticket:77:msg:501',
    }));
  });
});

describe('closeMyTicket', () => {
  it('đóng ticket của mình, closedBy = chính mình, KHÔNG báo chính mình', async () => {
    repo.lockTicketById.mockResolvedValue(ticketRow());
    repo.setStatus.mockResolvedValue(ticketRow({ status: 'closed' }));
    const res = await svc.closeMyTicket(user, '77');
    await svc.settlePendingSupportNotifications();
    expect(repo.setStatus).toHaveBeenCalledWith(CLIENT, '77', 'closed', 5);
    expect(res.ticket.status).toBe('closed');
    expect(mockNotifyUsers).not.toHaveBeenCalled();
  });

  it('đã đóng → trả nguyên trạng, không ghi lại; ticket người khác → 404', async () => {
    repo.lockTicketById.mockResolvedValue(ticketRow({ status: 'closed' }));
    await svc.closeMyTicket(user, '77');
    expect(repo.setStatus).not.toHaveBeenCalled();
    repo.lockTicketById.mockResolvedValue(ticketRow({ user_id: '99' }));
    await expect(svc.closeMyTicket(user, '77')).rejects.toMatchObject({ status: 404 });
  });
});

describe('admin', () => {
  it('adminReply: chèn tin role admin, ticket sang awaiting_user, báo ĐÚNG người tạo ticket (support_ticket_replied)', async () => {
    repo.lockTicketById.mockResolvedValue(ticketRow({ status: 'closed' }));
    repo.insertMessage.mockResolvedValue(messageRow({ id: '600', author_role: 'admin', body: 'x'.repeat(400) }));
    repo.touchAfterAdminReply.mockResolvedValue(ticketRow({ status: 'awaiting_user', last_admin_reply_at: 'T2' }));

    const data = await svc.adminReply(admin, '77', { body: 'x'.repeat(400) });
    await svc.settlePendingSupportNotifications();

    expect(repo.insertMessage).toHaveBeenCalledWith(CLIENT, expect.objectContaining({ authorUserId: 1, authorRole: 'admin' }));
    expect(repo.touchAfterAdminReply).toHaveBeenCalledWith(CLIENT, '77');
    expect(data.ticket.status).toBe('awaiting_user');
    expect(mockNotifyUsers).toHaveBeenCalledTimes(1);
    const call = mockNotifyUsers.mock.calls[0][0];
    expect(call).toMatchObject({
      eventType: 'support_ticket_replied', userIds: [5], link: '/app/support/77', dedupeKey: 'support_ticket:77:msg:600',
    });
    expect(call.message.length).toBeLessThanOrEqual(301); // trích 300 ký tự đầu (+ dấu …)
    expect(mockNotifyAdmins).not.toHaveBeenCalled();
  });

  it('adminReply: ticket không tồn tại → 404; thiếu nội dung → 400', async () => {
    repo.lockTicketById.mockResolvedValue(null);
    await expect(svc.adminReply(admin, '77', { body: 'a' })).rejects.toMatchObject({ status: 404 });
    await expect(svc.adminReply(admin, '77', { body: '  ' })).rejects.toMatchObject({ status: 400 });
  });

  it('adminSetStatus closed: ghi closedBy admin và báo người tạo (support_ticket_closed); trạng thái trùng → không đổi, không báo', async () => {
    repo.lockTicketById.mockResolvedValue(ticketRow({ status: 'open' }));
    repo.setStatus.mockResolvedValue(ticketRow({ status: 'closed', closed_at: new Date('2026-10-10T00:00:00Z') }));
    await svc.adminSetStatus(admin, '77', 'closed');
    await svc.settlePendingSupportNotifications();
    expect(repo.setStatus).toHaveBeenCalledWith(CLIENT, '77', 'closed', 1);
    expect(mockNotifyUsers).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'support_ticket_closed', userIds: [5] }));

    jest.clearAllMocks();
    repo.runInTransaction.mockImplementation(async (work) => work(CLIENT));
    repo.lockTicketById.mockResolvedValue(ticketRow({ status: 'closed' }));
    await svc.adminSetStatus(admin, '77', 'closed');
    await svc.settlePendingSupportNotifications();
    expect(repo.setStatus).not.toHaveBeenCalled();
    expect(mockNotifyUsers).not.toHaveBeenCalled();
  });

  it('adminSetStatus: trạng thái lạ → 400; mở lại (open) không báo', async () => {
    await expect(svc.adminSetStatus(admin, '77', 'xoa')).rejects.toMatchObject({ status: 400, code: 'SUPPORT_STATUS_INVALID' });
    repo.lockTicketById.mockResolvedValue(ticketRow({ status: 'closed' }));
    repo.setStatus.mockResolvedValue(ticketRow({ status: 'open' }));
    await svc.adminSetStatus(admin, '77', 'open');
    await svc.settlePendingSupportNotifications();
    expect(repo.setStatus).toHaveBeenCalledWith(CLIENT, '77', 'open', null);
    expect(mockNotifyUsers).not.toHaveBeenCalled();
  });

  it('adminListTickets: lọc status/category/search + đếm theo tab', async () => {
    repo.list.mockResolvedValue({ rows: [ticketRow({ user_email: 'a@test.local', last_author_role: 'user', last_excerpt: 'hi', last_message_created_at: 'T1', message_count: 2 })], total: 1 });
    repo.countByStatus.mockResolvedValue({ open: 3, awaiting_user: 2, closed: 1 });
    const res = await svc.adminListTickets({ status: 'open', category: 'bug', search: ' mail ' });
    expect(repo.list).toHaveBeenCalledWith({ status: 'open', category: 'bug', search: 'mail', page: 1, limit: 20 });
    expect(res.counts).toEqual({ open: 3, awaiting_user: 2, closed: 1, all: 6 });
    expect(res.items[0]).toMatchObject({ messageCount: 2, lastMessage: { authorRole: 'user', excerpt: 'hi' }, user: { email: 'a@test.local' } });
    await expect(svc.adminListTickets({ category: 'zzz' })).rejects.toMatchObject({ code: 'SUPPORT_CATEGORY_INVALID' });
  });
});

describe('resolveAttachmentForDownload', () => {
  const attachment = { storageObjectId: 3, key: 'uploads/5/support/1_ab_x.png', name: 'x.png', size: 5, mime: 'image/png' };
  const object = { id: '3', state: 'active', reference_id: '77', storage_key: attachment.key };

  it('người tạo ticket: hỏi repo theo userId của mình, trả khoá + tên + mime', async () => {
    repo.findById.mockResolvedValue(ticketRow());
    repo.findAttachmentInTicket.mockResolvedValue(attachment);
    mockFindObject.mockResolvedValue(object);
    await expect(svc.resolveAttachmentForDownload(user, '77', '3')).resolves.toEqual({ storageKey: attachment.key, name: 'x.png', mime: 'image/png' });
    expect(repo.findById).toHaveBeenCalledWith('77', { userId: 5 });
  });

  it('super admin: không bị giới hạn theo userId', async () => {
    repo.findById.mockResolvedValue(ticketRow());
    repo.findAttachmentInTicket.mockResolvedValue(attachment);
    mockFindObject.mockResolvedValue(object);
    await svc.resolveAttachmentForDownload(admin, '77', '3');
    expect(repo.findById).toHaveBeenCalledWith('77', { userId: null });
  });

  it('người lạ (repo trả null) → 404 và KHÔNG tra tệp', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(svc.resolveAttachmentForDownload(user, '77', '3')).rejects.toMatchObject({ status: 404 });
    expect(repo.findAttachmentInTicket).not.toHaveBeenCalled();
    expect(mockFindObject).not.toHaveBeenCalled();
  });

  it.each([
    ['tệp không nằm trong tin nào của ticket', null, object],
    ['sổ cái không còn active', attachment, { ...object, state: 'cleanup_pending' }],
    ['sổ cái trỏ ticket khác', attachment, { ...object, reference_id: '78' }],
    ['khoá sổ cái khác khoá trong tin', attachment, { ...object, storage_key: 'uploads/9/other.png' }],
    ['không có dòng sổ cái', attachment, null],
  ])('%s → 404', async (_label, att, obj) => {
    repo.findById.mockResolvedValue(ticketRow());
    repo.findAttachmentInTicket.mockResolvedValue(att);
    mockFindObject.mockResolvedValue(obj);
    await expect(svc.resolveAttachmentForDownload(user, '77', '3')).rejects.toMatchObject({ status: 404 });
  });
});

describe('autoCloseStaleTickets', () => {
  it('đóng theo số ngày mặc định 7, báo từng người tạo ticket; lỗi một người không dừng cả lượt', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    repo.closeStaleAwaitingUser.mockResolvedValue([
      { id: '1', user_id: '5', subject: 'A', closed_at: new Date('2026-10-10T20:20:00Z') },
      { id: '2', user_id: '6', subject: 'B', closed_at: new Date('2026-10-10T20:20:00Z') },
    ]);
    mockNotifyUsers.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({});

    const result = await svc.autoCloseStaleTickets();

    expect(repo.closeStaleAwaitingUser).toHaveBeenCalledWith({ days: 7 });
    expect(result).toEqual({ closed: 2, notified: 1, notifyFailed: 1, days: 7 });
    expect(mockNotifyUsers).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'support_ticket_closed', userIds: [6], link: '/app/support/2',
    }));
  });

  it('env SUPPORT_TICKET_AUTO_CLOSE_DAYS đổi ngưỡng; không có ticket quá hạn → không báo ai', async () => {
    process.env.SUPPORT_TICKET_AUTO_CLOSE_DAYS = '3';
    repo.closeStaleAwaitingUser.mockResolvedValue([]);
    const result = await svc.autoCloseStaleTickets();
    delete process.env.SUPPORT_TICKET_AUTO_CLOSE_DAYS;
    expect(repo.closeStaleAwaitingUser).toHaveBeenCalledWith({ days: 3 });
    expect(result.closed).toBe(0);
    expect(mockNotifyUsers).not.toHaveBeenCalled();
  });
});
