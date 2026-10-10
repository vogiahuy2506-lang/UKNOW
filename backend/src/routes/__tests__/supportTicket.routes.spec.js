import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

/**
 * /api/support/tickets/* và /api/admin/support/* — route + controller + service THẬT, repository / kho / dispatcher giả.
 * authMiddleware giả theo header: không header → 401; "Bearer user" → id 5; "Bearer other" → id 6; "Bearer employee" → nhân viên id 12
 * (workspace chủ 9); "Bearer admin" → super admin id 1.
 */
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
const mockActivate = jest.fn();
const mockFindObject = jest.fn();
const mockNotifyUsers = jest.fn();
const mockNotifyAdmins = jest.fn();
const mockPut = jest.fn();
const mockStream = jest.fn();
const mockRegister = jest.fn();
const mockListContacts = jest.fn();
const mockCountContacts = jest.fn();
const mockUpdateContact = jest.fn();
const CLIENT = {};

const USERS = {
  'Bearer user': { id: 5, role: 'user', full_name: 'Khách A', username: 'a', email: 'a@t.l', activeContext: { type: 'self', ownerId: 5 } },
  'Bearer other': { id: 6, role: 'user', full_name: 'Khách B', username: 'b', email: 'b@t.l', activeContext: { type: 'self', ownerId: 6 } },
  'Bearer employee': { id: 12, role: 'employee', full_name: 'NV', username: 'nv', email: 'nv@t.l', activeContext: { type: 'employee', ownerId: 9, permissions: {} } },
  'Bearer admin': { id: 1, role: 'admin', full_name: 'Admin', username: 'root', email: 'r@t.l', activeContext: { type: 'self', ownerId: 1 } },
};

jest.unstable_mockModule('../../middleware/auth.middleware.js', () => ({
  default: (req, res, next) => {
    const user = USERS[req.headers.authorization];
    if (!user) return res.status(401).json({ success: false, message: 'Không tìm thấy token xác thực' });
    req.user = { ...user };
    return next();
  },
}));
jest.unstable_mockModule('../../repositories/support/supportTicket.repository.js', () => ({ default: repo }));
const actualStorageRepo = await import('../../repositories/storage.repository.js');
jest.unstable_mockModule('../../repositories/storage.repository.js', () => ({
  ...actualStorageRepo,
  activateSupportTicketStorageObjects: mockActivate,
  findSupportTicketStorageObject: mockFindObject,
}));
jest.unstable_mockModule('../../repositories/contact.repository.js', () => ({
  listContactSubmissions: mockListContacts,
  countContactSubmissionsByStatus: mockCountContacts,
  updateContactSubmission: mockUpdateContact,
  createContactSubmission: jest.fn(),
  countRecentSubmissionsByEmail: jest.fn(),
}));
jest.unstable_mockModule('../../services/notification/notificationDispatch.service.js', () => ({
  notifyUsers: mockNotifyUsers,
  notifyAdmins: mockNotifyAdmins,
}));
const actualBackend = await import('../../services/storage/storageBackend.js');
const actualObjectService = await import('../../services/storage/storageObject.service.js');
jest.unstable_mockModule('../../services/storage/storageBackend.js', () => ({
  ...actualBackend,
  getStorageBackend: () => ({ put: mockPut, delete: jest.fn(), stream: mockStream }),
}));
jest.unstable_mockModule('../../services/storage/storageObject.service.js', () => ({
  ...actualObjectService,
  registerWrittenStorageObject: mockRegister,
}));
jest.unstable_mockModule('../../middleware/rateLimiter.middleware.js', () => ({
  uploadLimiter: (req, res, next) => next(),
  supportTicketWriteLimiter: (req, res, next) => next(),
}));

const { default: userRoutes } = await import('../supportTicket.routes.js');
const { default: adminRoutes } = await import('../adminSupportTicket.routes.js');
const { settlePendingSupportNotifications } = await import('../../services/support/supportTicket.service.js');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/support/tickets', userRoutes);
  app.use('/api/admin/support', adminRoutes);
  return app;
}

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const ticketRow = (over = {}) => ({
  id: '77', user_id: '5', workspace_owner_id: null, subject: 'Lỗi', category: 'bug', status: 'open',
  last_message_at: 'T1', last_admin_reply_at: null, closed_at: null, closed_by: null, created_at: 'T0', updated_at: 'T1',
  user_full_name: 'Khách A', user_email: 'a@t.l', user_username: 'a', ...over,
});
const messageRow = (over = {}) => ({
  id: '500', ticket_id: '77', author_user_id: '5', author_role: 'user', body: 'Nội dung', attachments: [], created_at: 'T1', ...over,
});
const withAuth = (req, who) => req.set('Authorization', who);

describe('support tickets API', () => {
  let app;
  beforeEach(() => {
    jest.resetAllMocks();
    app = makeApp();
    repo.runInTransaction.mockImplementation(async (work) => work(CLIENT));
    repo.countCreatedSince.mockResolvedValue(0);
    repo.insertTicket.mockResolvedValue(ticketRow());
    repo.insertMessage.mockResolvedValue(messageRow());
    repo.countByStatus.mockResolvedValue({ open: 0, awaiting_user: 0, closed: 0 });
    mockNotifyAdmins.mockResolvedValue({});
    mockNotifyUsers.mockResolvedValue({});
    mockPut.mockResolvedValue(undefined);
    mockRegister.mockResolvedValue({ id: '41' });
    mockActivate.mockResolvedValue([]);
  });

  describe('xác thực', () => {
    it.each([
      ['get', '/api/support/tickets'],
      ['post', '/api/support/tickets'],
      ['get', '/api/support/tickets/77'],
      ['post', '/api/support/tickets/77/messages'],
      ['post', '/api/support/tickets/77/close'],
      ['post', '/api/support/tickets/attachments'],
      ['get', '/api/support/tickets/77/attachments/3'],
      ['get', '/api/admin/support/tickets'],
      ['get', '/api/admin/support/contact-submissions'],
    ])('%s %s không token → 401', async (method, url) => {
      expect((await request(app)[method](url)).status).toBe(401);
    });

    it.each([
      ['get', '/api/admin/support/tickets'],
      ['get', '/api/admin/support/tickets/77'],
      ['post', '/api/admin/support/tickets/77/reply'],
      ['post', '/api/admin/support/tickets/77/status'],
      ['post', '/api/admin/support/attachments'],
      ['get', '/api/admin/support/tickets/77/attachments/3'],
      ['get', '/api/admin/support/contact-submissions'],
      ['patch', '/api/admin/support/contact-submissions/1'],
    ])('người dùng thường gọi %s %s → 403, không chạm DB', async (method, url) => {
      const res = await withAuth(request(app)[method](url), 'Bearer user');
      expect(res.status).toBe(403);
      expect(repo.findById).not.toHaveBeenCalled();
      expect(mockListContacts).not.toHaveBeenCalled();
    });
  });

  describe('POST / (tạo ticket)', () => {
    it('201 { ticket, messages } và báo admin', async () => {
      const res = await withAuth(request(app).post('/api/support/tickets'), 'Bearer user')
        .send({ subject: 'Lỗi', category: 'bug', body: 'Không gửi được', attachmentIds: [] });
      await settlePendingSupportNotifications();
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.ticket).toMatchObject({ id: 77, status: 'open', category: 'bug' });
      expect(res.body.data.messages).toHaveLength(1);
      expect(mockNotifyAdmins).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'support_ticket_created' }));
    });

    it('thiếu nội dung → 400 kèm code; quá 10 ticket → 429', async () => {
      const bad = await withAuth(request(app).post('/api/support/tickets'), 'Bearer user').send({ subject: 'x', category: 'bug' });
      expect(bad.status).toBe(400);
      expect(bad.body.code).toBe('SUPPORT_BODY_REQUIRED');
      repo.countCreatedSince.mockResolvedValue(10);
      const limited = await withAuth(request(app).post('/api/support/tickets'), 'Bearer user').send({ subject: 'x', category: 'bug', body: 'y' });
      expect(limited.status).toBe(429);
      expect(limited.body.code).toBe('SUPPORT_TICKET_DAILY_LIMIT');
    });

    it('ảnh thứ 4 → 400 SUPPORT_ATTACHMENT_LIMIT, không mở giao dịch', async () => {
      const res = await withAuth(request(app).post('/api/support/tickets'), 'Bearer user')
        .send({ subject: 'x', category: 'bug', body: 'y', attachmentIds: [1, 2, 3, 4] });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('SUPPORT_ATTACHMENT_LIMIT');
      expect(repo.runInTransaction).not.toHaveBeenCalled();
    });

    it('ảnh không phải của mình / đã dùng (claim trả thiếu dòng) → 400 SUPPORT_ATTACHMENT_INVALID', async () => {
      mockActivate.mockResolvedValue([]);
      const res = await withAuth(request(app).post('/api/support/tickets'), 'Bearer user')
        .send({ subject: 'x', category: 'bug', body: 'y', attachmentIds: [9] });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('SUPPORT_ATTACHMENT_INVALID');
      expect(mockActivate).toHaveBeenCalledWith({ objectIds: [9], actorUserId: 5, ticketId: '77' }, CLIENT);
      expect(mockNotifyAdmins).not.toHaveBeenCalled();
    });

    it('nhân viên: ticket gắn user_id = nhân viên, workspace_owner_id = chủ', async () => {
      await withAuth(request(app).post('/api/support/tickets'), 'Bearer employee').send({ subject: 'x', category: 'other', body: 'y' }).expect(201);
      expect(repo.insertTicket).toHaveBeenCalledWith(CLIENT, expect.objectContaining({ userId: 12, workspaceOwnerId: 9 }));
    });
  });

  describe('GET / và GET /:id', () => {
    it('danh sách chỉ của CHÍNH người gọi', async () => {
      repo.list.mockResolvedValue({ rows: [ticketRow()], total: 1 });
      const res = await withAuth(request(app).get('/api/support/tickets?status=open'), 'Bearer employee');
      expect(res.status).toBe(200);
      expect(repo.list).toHaveBeenCalledWith({ userId: 12, status: 'open', page: 1, limit: 20 });
      expect(res.body.data.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    });

    it('của mình → 200 { ticket, messages }; của người lạ → 404 (repo bị hỏi đúng cặp id + người gọi)', async () => {
      repo.findById.mockResolvedValue(null);
      const stranger = await withAuth(request(app).get('/api/support/tickets/77'), 'Bearer other');
      expect(stranger.status).toBe(404);
      expect(stranger.body.code).toBe('SUPPORT_TICKET_NOT_FOUND');
      expect(repo.findById).toHaveBeenCalledWith('77', { userId: 6 });

      repo.findById.mockResolvedValue(ticketRow());
      repo.listMessages.mockResolvedValue([messageRow()]);
      const mine = await withAuth(request(app).get('/api/support/tickets/77'), 'Bearer user');
      expect(mine.status).toBe(200);
      expect(mine.body.data.messages).toHaveLength(1);
    });

    it('id không phải số → 400', async () => {
      expect((await withAuth(request(app).get('/api/support/tickets/abc'), 'Bearer user')).status).toBe(400);
    });
  });

  describe('POST /:id/messages và /:id/close', () => {
    it('nhắn vào ticket của người khác → 404', async () => {
      repo.lockTicketById.mockResolvedValue(ticketRow({ user_id: '5' }));
      const res = await withAuth(request(app).post('/api/support/tickets/77/messages'), 'Bearer other').send({ body: 'hi' });
      expect(res.status).toBe(404);
      expect(repo.insertMessage).not.toHaveBeenCalled();
    });

    it('nhắn ticket của mình → 201 { ticket, message }', async () => {
      repo.lockTicketById.mockResolvedValue(ticketRow());
      repo.touchAfterUserMessage.mockResolvedValue(ticketRow());
      const res = await withAuth(request(app).post('/api/support/tickets/77/messages'), 'Bearer user').send({ body: 'hi' });
      expect(res.status).toBe(201);
      expect(res.body.data.message).toMatchObject({ authorRole: 'user', body: 'Nội dung' });
    });

    it('đóng ticket của mình → 200; của người khác → 404', async () => {
      repo.lockTicketById.mockResolvedValue(ticketRow());
      repo.setStatus.mockResolvedValue(ticketRow({ status: 'closed' }));
      expect((await withAuth(request(app).post('/api/support/tickets/77/close'), 'Bearer user')).body.data.ticket.status).toBe('closed');
      expect((await withAuth(request(app).post('/api/support/tickets/77/close'), 'Bearer other')).status).toBe(404);
    });
  });

  describe('POST /attachments (multipart)', () => {
    it('ảnh PNG → 201 { storageObjectId, key, name, size, mime, expiresAt }', async () => {
      const res = await withAuth(request(app).post('/api/support/tickets/attachments'), 'Bearer user')
        .attach('file', PNG, { filename: 'loi.png', contentType: 'image/png' });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ storageObjectId: 41, name: 'loi.png', mime: 'image/png', size: PNG.length });
      expect(res.body.data.key).toMatch(/^uploads\/5\/support\//);
    });

    it('sai loại (PDF) → 400; không đính tệp → 400; quá 5 MB → 400 SUPPORT_ATTACHMENT_TOO_LARGE', async () => {
      const pdf = await withAuth(request(app).post('/api/support/tickets/attachments'), 'Bearer user')
        .attach('file', Buffer.from('%PDF-1.4 abcdefgh'), { filename: 'a.pdf', contentType: 'application/pdf' });
      expect(pdf.status).toBe(400);
      expect(pdf.body.code).toBe('SUPPORT_ATTACHMENT_TYPE_INVALID');

      const none = await withAuth(request(app).post('/api/support/tickets/attachments'), 'Bearer user').field('x', '1');
      expect(none.status).toBe(400);
      expect(none.body.code).toBe('SUPPORT_ATTACHMENT_REQUIRED');

      const big = await withAuth(request(app).post('/api/support/tickets/attachments'), 'Bearer user')
        .attach('file', Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024 + 10)]), { filename: 'big.png', contentType: 'image/png' });
      expect(big.status).toBe(400);
      expect(big.body.code).toBe('SUPPORT_ATTACHMENT_TOO_LARGE');
      expect(mockRegister).not.toHaveBeenCalled();
    });
  });

  describe('GET /:id/attachments/:objectId (phát ảnh)', () => {
    const attachment = { storageObjectId: 3, key: 'uploads/5/support/1_ab_x.png', name: 'x.png', size: 5, mime: 'image/png' };
    const object = { id: '3', state: 'active', reference_id: '77', storage_key: attachment.key };

    it('người tạo ticket → stream inline với tên + mime; Cache-Control private', async () => {
      repo.findById.mockResolvedValue(ticketRow());
      repo.findAttachmentInTicket.mockResolvedValue(attachment);
      mockFindObject.mockResolvedValue(object);
      mockStream.mockImplementation(async (key, res) => { res.status(200).send('PNGDATA'); return true; });

      const res = await withAuth(request(app).get('/api/support/tickets/77/attachments/3'), 'Bearer user');
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(mockStream).toHaveBeenCalledWith(attachment.key, expect.anything(), { fileName: 'x.png', mimeType: 'image/png', preview: true });
    });

    it('super admin xem được ticket của người khác (cả qua route admin)', async () => {
      repo.findById.mockResolvedValue(ticketRow());
      repo.findAttachmentInTicket.mockResolvedValue(attachment);
      mockFindObject.mockResolvedValue(object);
      mockStream.mockImplementation(async (key, res) => { res.status(200).send('x'); return true; });
      expect((await withAuth(request(app).get('/api/support/tickets/77/attachments/3'), 'Bearer admin')).status).toBe(200);
      expect((await withAuth(request(app).get('/api/admin/support/tickets/77/attachments/3'), 'Bearer admin')).status).toBe(200);
      expect(repo.findById).toHaveBeenCalledWith('77', { userId: null });
    });

    it('NGƯỜI LẠ → 404 và KHÔNG stream', async () => {
      repo.findById.mockResolvedValue(null);
      const res = await withAuth(request(app).get('/api/support/tickets/77/attachments/3'), 'Bearer other');
      expect(res.status).toBe(404);
      expect(repo.findById).toHaveBeenCalledWith('77', { userId: 6 });
      expect(mockStream).not.toHaveBeenCalled();
    });

    it('tệp không còn trong kho (stream trả false) → 404', async () => {
      repo.findById.mockResolvedValue(ticketRow());
      repo.findAttachmentInTicket.mockResolvedValue(attachment);
      mockFindObject.mockResolvedValue(object);
      mockStream.mockResolvedValue(false);
      const res = await withAuth(request(app).get('/api/support/tickets/77/attachments/3'), 'Bearer user');
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('SUPPORT_ATTACHMENT_NOT_FOUND');
    });
  });

  describe('admin', () => {
    it('GET /tickets → { items, counts, pagination }', async () => {
      repo.list.mockResolvedValue({ rows: [ticketRow({ last_author_role: 'user', last_excerpt: 'hi', message_count: 1 })], total: 1 });
      repo.countByStatus.mockResolvedValue({ open: 1, awaiting_user: 0, closed: 0 });
      const res = await withAuth(request(app).get('/api/admin/support/tickets?status=open&search=abc'), 'Bearer admin');
      expect(res.status).toBe(200);
      expect(res.body.data.items[0].user).toMatchObject({ id: 5, email: 'a@t.l' });
      expect(res.body.data.counts).toEqual({ open: 1, awaiting_user: 0, closed: 0, all: 1 });
      expect(repo.list).toHaveBeenCalledWith(expect.objectContaining({ status: 'open', search: 'abc' }));
    });

    it('admin thấy ticket của bất kỳ ai (findById không giới hạn userId)', async () => {
      repo.findById.mockResolvedValue(ticketRow({ user_id: '99' }));
      repo.listMessages.mockResolvedValue([]);
      const res = await withAuth(request(app).get('/api/admin/support/tickets/77'), 'Bearer admin');
      expect(res.status).toBe(200);
      expect(repo.findById).toHaveBeenCalledWith('77');
    });

    it('POST /tickets/:id/reply → 201, báo người tạo ticket qua notifyUsers', async () => {
      repo.lockTicketById.mockResolvedValue(ticketRow());
      repo.insertMessage.mockResolvedValue(messageRow({ id: '600', author_role: 'admin', body: 'Đã sửa' }));
      repo.touchAfterAdminReply.mockResolvedValue(ticketRow({ status: 'awaiting_user' }));
      const res = await withAuth(request(app).post('/api/admin/support/tickets/77/reply'), 'Bearer admin').send({ body: 'Đã sửa' });
      await settlePendingSupportNotifications();
      expect(res.status).toBe(201);
      expect(res.body.data.ticket.status).toBe('awaiting_user');
      expect(mockNotifyUsers).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'support_ticket_replied', userIds: [5] }));
    });

    it('POST /tickets/:id/status: closed → 200 + báo; trạng thái lạ → 400', async () => {
      repo.lockTicketById.mockResolvedValue(ticketRow());
      repo.setStatus.mockResolvedValue(ticketRow({ status: 'closed', closed_at: new Date() }));
      const ok = await withAuth(request(app).post('/api/admin/support/tickets/77/status'), 'Bearer admin').send({ status: 'closed' });
      await settlePendingSupportNotifications();
      expect(ok.status).toBe(200);
      expect(mockNotifyUsers).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'support_ticket_closed' }));
      expect((await withAuth(request(app).post('/api/admin/support/tickets/77/status'), 'Bearer admin').send({ status: 'zzz' })).status).toBe(400);
    });

    it('GET /contact-submissions → danh sách + đếm; status sai → 400', async () => {
      mockListContacts.mockResolvedValue({
        rows: [{ id: '3', name: 'Lan', email: 'l@x.vn', phone: null, company: null, company_size: null, message: 'Cần tư vấn', status: null, notes: null, created_at: 'T', updated_at: 'T' }],
        total: 1,
      });
      mockCountContacts.mockResolvedValue({ new: 1, contacted: 0, qualified: 0, closed: 0 });
      const res = await withAuth(request(app).get('/api/admin/support/contact-submissions?status=new'), 'Bearer admin');
      expect(res.status).toBe(200);
      expect(res.body.data.items[0]).toMatchObject({ id: 3, name: 'Lan', status: 'new' });
      expect(res.body.data.counts).toEqual({ new: 1, contacted: 0, qualified: 0, closed: 0, all: 1 });
      expect(mockListContacts).toHaveBeenCalledWith({ status: 'new', search: null, page: 1, limit: 20 });
      expect((await withAuth(request(app).get('/api/admin/support/contact-submissions?status=x'), 'Bearer admin')).status).toBe(400);
    });

    it('PATCH /contact-submissions/:id: đổi status + ghi chú; rỗng → 400; không có dòng → 404; status lạ → 400', async () => {
      mockUpdateContact.mockResolvedValue({ id: '3', name: 'Lan', email: 'l@x.vn', message: 'm', status: 'contacted', notes: 'Đã gọi', created_at: 'T', updated_at: 'T2' });
      const ok = await withAuth(request(app).patch('/api/admin/support/contact-submissions/3'), 'Bearer admin').send({ status: 'contacted', notes: ' Đã gọi ' });
      expect(ok.status).toBe(200);
      expect(mockUpdateContact).toHaveBeenCalledWith('3', { status: 'contacted', notes: 'Đã gọi' });
      expect(ok.body.data).toMatchObject({ status: 'contacted', notes: 'Đã gọi' });

      expect((await withAuth(request(app).patch('/api/admin/support/contact-submissions/3'), 'Bearer admin').send({})).status).toBe(400);
      expect((await withAuth(request(app).patch('/api/admin/support/contact-submissions/3'), 'Bearer admin').send({ status: 'zzz' })).status).toBe(400);
      mockUpdateContact.mockResolvedValue(null);
      expect((await withAuth(request(app).patch('/api/admin/support/contact-submissions/999'), 'Bearer admin').send({ notes: 'x' })).status).toBe(404);
    });
  });
});
