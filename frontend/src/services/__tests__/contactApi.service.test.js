import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../api', () => ({
  default: { post: vi.fn() },
}));

const { submitContactForm } = await import('../contactApi.service');
const { default: api } = await import('../api');

beforeEach(() => {
  api.post.mockReset();
});

describe('submitContactForm', () => {
  it('POST /contact với payload đầy đủ', async () => {
    api.post.mockResolvedValue({ data: { success: true } });
    const payload = {
      name: 'Nguyễn Văn A',
      email: 'a@x.com',
      phone: '0900000000',
      company: 'ACME',
      companySize: '10-50',
      message: 'Hello',
    };
    await submitContactForm(payload);
    expect(api.post).toHaveBeenCalledWith('/contact', payload);
  });

  it('payload tối thiểu (chỉ name/email/message) vẫn truyền nguyên', async () => {
    api.post.mockResolvedValue({ data: {} });
    const minimal = { name: 'B', email: 'b@x.com', message: 'hi' };
    await submitContactForm(minimal);
    expect(api.post).toHaveBeenCalledWith('/contact', minimal);
  });

  it('axios reject → propagate lên caller', async () => {
    api.post.mockRejectedValue(new Error('400 invalid'));
    await expect(submitContactForm({ name: 'x', email: 'y', message: 'z' })).rejects.toThrow('400 invalid');
  });
});
