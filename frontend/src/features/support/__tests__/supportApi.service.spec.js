/**
 * Service ticket: route người dùng KHÔNG gắn X-Owner-Context (skipOwnerContext), ảnh tải bằng blob, query gọn.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: api, setAuthStore: vi.fn() }));

const { supportUserApi, supportAdminApi } = await import('../services/supportApi.service');

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: { data: {} } });
  api.post.mockResolvedValue({ data: { data: {} } });
  api.patch.mockResolvedValue({ data: { data: {} } });
});

describe('supportApi.service', () => {
  it('mọi route người dùng mang skipOwnerContext', async () => {
    await supportUserApi.listTickets({ status: 'open' });
    await supportUserApi.getTicket(5);
    await supportUserApi.createTicket({ subject: 's', category: 'bug', body: 'b', attachmentIds: [1] });
    await supportUserApi.postMessage(5, { body: 'b', attachmentIds: [] });
    await supportUserApi.closeTicket(5);
    await supportUserApi.uploadAttachment(new File(['x'], 'a.png', { type: 'image/png' }));
    await supportUserApi.fetchAttachmentBlob(5, 9);

    const configs = [...api.get.mock.calls.map((c) => c[c.length - 1]), ...api.post.mock.calls.map((c) => c[c.length - 1])];
    expect(configs).toHaveLength(7);
    configs.forEach((config) => expect(config.skipOwnerContext).toBe(true));
  });

  it('ảnh đính kèm tải với responseType blob; upload gửi field "file"', async () => {
    await supportUserApi.fetchAttachmentBlob(5, 9);
    expect(api.get).toHaveBeenCalledWith('/support/tickets/5/attachments/9', expect.objectContaining({ responseType: 'blob' }));

    const file = new File(['x'], 'a.png', { type: 'image/png' });
    await supportUserApi.uploadAttachment(file);
    const [url, form] = api.post.mock.calls[0];
    expect(url).toBe('/support/tickets/attachments');
    expect(form.get('file')).toBe(file);
  });

  it('createTicket / postMessage gửi đúng thân', async () => {
    await supportUserApi.createTicket({ subject: 's', category: 'bug', body: 'b', attachmentIds: [1, 2] });
    expect(api.post).toHaveBeenLastCalledWith(
      '/support/tickets',
      { subject: 's', category: 'bug', body: 'b', attachmentIds: [1, 2] },
      { skipOwnerContext: true },
    );
    await supportUserApi.postMessage(5, { body: 'x', attachmentIds: [3] });
    expect(api.post).toHaveBeenLastCalledWith(
      '/support/tickets/5/messages',
      { body: 'x', attachmentIds: [3] },
      { skipOwnerContext: true },
    );
  });

  it('admin: query bỏ tham số rỗng / "all", giữ status thật', async () => {
    await supportAdminApi.listTickets({ status: 'all', category: '', search: '  ' });
    expect(api.get).toHaveBeenLastCalledWith('/admin/support/tickets', { params: { page: 1, limit: 20 } });
    await supportAdminApi.listTickets({ status: 'open', category: 'bug', search: ' abc ' });
    expect(api.get).toHaveBeenLastCalledWith('/admin/support/tickets', {
      params: { page: 1, limit: 20, status: 'open', category: 'bug', search: 'abc' },
    });
  });

  it('admin: reply / status / contact PATCH đúng đường và thân', async () => {
    await supportAdminApi.reply(9, { body: 'x', attachmentIds: [] });
    expect(api.post).toHaveBeenLastCalledWith('/admin/support/tickets/9/reply', { body: 'x', attachmentIds: [] });
    await supportAdminApi.setStatus(9, 'closed');
    expect(api.post).toHaveBeenLastCalledWith('/admin/support/tickets/9/status', { status: 'closed' });
    await supportAdminApi.updateContactSubmission(3, { status: 'contacted' });
    expect(api.patch).toHaveBeenLastCalledWith('/admin/support/contact-submissions/3', { status: 'contacted' });
  });
});
