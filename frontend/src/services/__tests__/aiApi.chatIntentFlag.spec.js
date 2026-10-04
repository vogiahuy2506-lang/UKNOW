import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api.js', () => ({ default: { post: vi.fn(), patch: vi.fn(), get: vi.fn() } }));
import api from '../api.js';
import aiApi from '../aiApi.js';

/**
 * PR-9 (C P2-5 / B-5): chat gửi cờ `clientGeneratesLanding` để backend trả Ý ĐỊNH landing_page (client tự gọi route sinh); route sinh nhận
 * `locale` + `skipUserMessage` từ ý định, và `files` đã promote của lượt.
 */
describe('aiApi — chat ý định sinh landing (PR-9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.post.mockResolvedValue({ data: { success: true } });
  });

  it('chat luôn gửi clientGeneratesLanding: true (client cũ không có cờ nên backend giữ cách sinh trong lượt chat)', async () => {
    await aiApi.chat([{ role: 'user', content: 'xin chào' }], [], null, 'vi');
    const [url, payload] = api.post.mock.calls[0];
    expect(url).toBe('/ai/chat');
    expect(payload.clientGeneratesLanding).toBe(true);
  });

  it('generateLandingPage từ ý định: gửi locale, skipUserMessage=true và tệp của lượt (storageKey), kèm requestId', async () => {
    await aiApi.generateLandingPage(
      'Trang landing khoá học', null,
      [{ storageKey: 'uploads/1/chat/logo.png', originalName: 'logo.png', contentType: 'image/png', size: 2048 }],
      55, null, null, { locale: 'en', skipUserMessage: true },
    );
    const [url, payload, config] = api.post.mock.calls[0];
    expect(url).toBe('/ai/generate-landing-html');
    expect(payload).toMatchObject({
      prompt: 'Trang landing khoá học',
      sessionId: 55,
      locale: 'en',
      skipUserMessage: true,
      files: [{ storageKey: 'uploads/1/chat/logo.png', originalName: 'logo.png', contentType: 'image/png', size: 2048 }],
    });
    expect(payload.requestId).toMatch(/^[A-Za-z0-9_-]{8,80}$/);
    expect(config.timeout).toBeGreaterThanOrEqual(240000);
  });

  it('đường bảng hỏi (không options): KHÔNG gửi skipUserMessage; locale lấy từ landingBrief như cũ', async () => {
    await aiApi.generateLandingPage('p', null, [], 55, 'tóm tắt', { contentLocale: 'vi', answers: {} });
    const payload = api.post.mock.calls[0][1];
    expect(payload).not.toHaveProperty('skipUserMessage');
    expect(payload.locale).toBe('vi');
    expect(payload.userSummary).toBe('tóm tắt');
  });

  it('skipUserMessage chỉ nhận đúng boolean true', async () => {
    await aiApi.generateLandingPage('p', null, [], 55, null, null, { skipUserMessage: 'true' });
    expect(api.post.mock.calls[0][1]).not.toHaveProperty('skipUserMessage');
  });
});
