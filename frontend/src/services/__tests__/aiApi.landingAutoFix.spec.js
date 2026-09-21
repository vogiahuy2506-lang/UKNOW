import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api.js', () => ({ default: { post: vi.fn(), patch: vi.fn(), get: vi.fn() } }));
import api from '../api.js';
import aiApi from '../aiApi.js';

describe('aiApi — landing tự kiểm hiển thị (PR-3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.post.mockResolvedValue({ data: { success: true } });
    api.patch.mockResolvedValue({ data: { success: true } });
  });

  it('editLandingHtml thường: KHÔNG mang autoLayoutFix / layoutFindings', async () => {
    await aiApi.editLandingHtml({ instruction: 'đổi màu', currentHtml: '<p/>', sessionId: 5, messageId: 9 });
    const [url, payload] = api.post.mock.calls[0];
    expect(url).toBe('/ai/edit-landing-html');
    expect(payload).toMatchObject({ instruction: 'đổi màu', currentHtml: '<p/>', sessionId: 5, messageId: 9, locale: 'vi' });
    expect(payload).not.toHaveProperty('autoLayoutFix');
    expect(payload).not.toHaveProperty('layoutFindings');
  });

  it('editLandingHtml tự động: gửi autoLayoutFix=true + layoutFindings, không cần instruction', async () => {
    const layoutFindings = [{ kind: 'text_covered', width: 1280, text: 'a', selector: 'p:nth-of-type(1)', coveredBy: null, overlapPx: 12 }];
    await aiApi.editLandingHtml({ currentHtml: '<p/>', sessionId: 5, messageId: 9, autoLayoutFix: true, layoutFindings });
    const [, payload, config] = api.post.mock.calls[0];
    expect(payload.autoLayoutFix).toBe(true);
    expect(payload.layoutFindings).toEqual(layoutFindings);
    expect(payload.instruction).toBeUndefined();
    expect(config).toMatchObject({ timeout: 120000 });
  });

  // Review PR-3: số đo cho lượt sửa THƯỜNG đi bằng trường riêng (server không lưu vào tin người dùng),
  // `instruction` giữ nguyên văn; KHÔNG kèm cờ autoLayoutFix nên lượt này vẫn trừ credit như thường.
  it('editLandingHtml thường KÈM số đo: gửi layoutFindings, instruction nguyên văn, KHÔNG có autoLayoutFix', async () => {
    const layoutFindings = [{ kind: 'text_covered', width: 1280, text: 'a', selector: 'p:nth-of-type(1)', coveredBy: null, overlapPx: 12 }];
    await aiApi.editLandingHtml({ instruction: 'chữ bị đè', currentHtml: '<p/>', sessionId: 5, messageId: 9, layoutFindings });
    const [, payload] = api.post.mock.calls[0];
    expect(payload.instruction).toBe('chữ bị đè');
    expect(payload.layoutFindings).toEqual(layoutFindings);
    expect(payload).not.toHaveProperty('autoLayoutFix');
  });

  it('editLandingHtml thường với layoutFindings rỗng / không phải mảng → không gửi trường này', async () => {
    for (const layoutFindings of [[], null, undefined, 'x']) {
      api.post.mockClear();
      await aiApi.editLandingHtml({ instruction: 'x', currentHtml: '<p/>', layoutFindings });
      expect(api.post.mock.calls[0][1]).not.toHaveProperty('layoutFindings');
    }
  });

  it('chỉ boolean true mới bật chế độ tự động (không gửi cờ khi truyền giá trị khác)', async () => {
    await aiApi.editLandingHtml({ instruction: 'x', currentHtml: '<p/>', autoLayoutFix: 'true', layoutFindings: [1] });
    expect(api.post.mock.calls[0][1]).not.toHaveProperty('autoLayoutFix');
  });

  it('revertLandingMessage: PATCH data.revert=true, KHÔNG gửi html/title; messageId chỉ gửi khi có', async () => {
    await aiApi.revertLandingMessage(55, 4242);
    expect(api.patch).toHaveBeenCalledWith('/ai/sessions/55/landing-message', { data: { revert: true }, messageId: 4242 });
    await aiApi.revertLandingMessage(55);
    expect(api.patch.mock.calls[1][1]).toEqual({ data: { revert: true } });
  });

  it('revertLandingMessage trả nguyên body server; lỗi 409 được ném ra để phía gọi xử lý', async () => {
    api.patch.mockResolvedValueOnce({ data: { success: true, data: { title: 'T', html: '<p/>', canRevert: true } } });
    await expect(aiApi.revertLandingMessage(1, 2)).resolves.toEqual({ success: true, data: { title: 'T', html: '<p/>', canRevert: true } });
    const conflict = Object.assign(new Error('409'), { response: { status: 409 } });
    api.patch.mockRejectedValueOnce(conflict);
    await expect(aiApi.revertLandingMessage(1, 2)).rejects.toBe(conflict);
  });
});
