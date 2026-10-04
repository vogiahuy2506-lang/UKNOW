import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * D-13 — `extra_context` không còn phình prompt chatbot / chunk embedding. Dữ liệu ĐÃ LƯU quá dài chỉ bị CẮT khi dựng
 * prompt và chunk; bản ghi trong DB (đối tượng profile) KHÔNG bị sửa.
 */
const findByUserId = jest.fn();
const deleteChunksByUserId = jest.fn();
const insertChunks = jest.fn();
const embedTexts = jest.fn();
const findAllByUser = jest.fn();

jest.unstable_mockModule('../../../repositories/ai/businessProfile.repository.js', () => ({
  default: { findByUserId, deleteChunksByUserId, insertChunks, upsert: jest.fn() },
}));
jest.unstable_mockModule('../../../repositories/products/product.repository.js', () => ({ default: { findAllByUser } }));
jest.unstable_mockModule('../../../utils/embeddingClient.util.js', () => ({ embedText: jest.fn(), embedTexts }));

const { default: svc } = await import('../businessProfile.service.js');
const { MAX_EXTRA_CONTEXT_CHARS } = await import('../../../utils/businessProfileLimits.util.js');

const HUGE = Array.from({ length: 3000 }, (_, i) => `Đoạn ${i} nói về chính sách số ${i}, ${'chi tiết '.repeat(20)}`).join('\n\n');

beforeEach(() => {
  findByUserId.mockReset();
  deleteChunksByUserId.mockReset().mockResolvedValue(undefined);
  insertChunks.mockReset().mockResolvedValue(undefined);
  embedTexts.mockReset().mockImplementation(async (texts) => texts.map(() => [0.1, 0.2]));
  findAllByUser.mockReset().mockResolvedValue([]);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('prompt chatbot: "Bổ sung" bị cắt ≤ 20.000 ký tự', () => {
  it('extra_context 100k+ ký tự → dòng "Bổ sung" trong prompt ≤ 20.000 ký tự nội dung, kết thúc bằng "…"', () => {
    const profile = { company_name: 'Shop A', extra_context: HUGE };
    expect(HUGE.length).toBeGreaterThan(100000);

    const text = svc.formatProfileForPrompt(profile, [], { includeLogo: false });

    // "Bổ sung" là dòng CUỐI của khối và nội dung có thể nhiều đoạn (xuống dòng) → lấy từ tiền tố tới dấu kết thúc khối.
    const start = text.indexOf('- Bổ sung: ');
    expect(start).toBeGreaterThanOrEqual(0);
    const body = text.slice(start + '- Bổ sung: '.length, text.lastIndexOf('\n=== HẾT HỒ SƠ ==='));
    expect(body.length).toBeLessThanOrEqual(MAX_EXTRA_CONTEXT_CHARS);
    expect(body.endsWith('…')).toBe(true);
    // Cả khối hồ sơ không phình theo dữ liệu khách nhập.
    expect(text.length).toBeLessThan(MAX_EXTRA_CONTEXT_CHARS + 500);
  });

  it('KHÔNG đổi dữ liệu đã lưu: đối tượng profile (bản ghi DB) giữ nguyên độ dài', () => {
    const profile = { company_name: 'Shop A', extra_context: HUGE };
    svc.formatProfileForPrompt(profile, []);
    expect(profile.extra_context).toBe(HUGE);
  });

  it('extra_context ngắn (đa số khách) → vào prompt NGUYÊN VĂN, không dấu "…"', () => {
    const text = svc.formatProfileForPrompt({ company_name: 'Shop A', extra_context: 'Mở cửa 8h-21h, nghỉ Chủ nhật.' }, []);
    expect(text).toContain('- Bổ sung: Mở cửa 8h-21h, nghỉ Chủ nhật.');
    expect(text).not.toContain('…');
  });

  it('đúng 20.000 ký tự → không bị cắt', () => {
    const exact = 'x'.repeat(MAX_EXTRA_CONTEXT_CHARS);
    const text = svc.formatProfileForPrompt({ company_name: 'Shop A', extra_context: exact }, []);
    expect(text).toContain(`- Bổ sung: ${exact}`);
  });
});

describe('chunk embedding hồ sơ: dữ liệu quá dài không sinh hàng trăm chunk', () => {
  it('extra_context 100k+ ký tự → các chunk extra_context gộp lại ≤ 20.000 ký tự (không còn ~3.000 chunk)', async () => {
    findByUserId.mockResolvedValue({ company_name: 'Shop A', extra_context: HUGE });

    await svc.reembedChunks(5);

    const embedded = embedTexts.mock.calls[0][0];
    const extraChunks = insertChunks.mock.calls[0][1].filter((c) => c.metadata.field === 'extra_context');
    expect(extraChunks.length).toBeGreaterThan(0);
    expect(extraChunks.length).toBeLessThan(200);
    const total = extraChunks.reduce((sum, c) => sum + c.text.length, 0);
    expect(total).toBeLessThanOrEqual(MAX_EXTRA_CONTEXT_CHARS);
    expect(embedded.length).toBe(insertChunks.mock.calls[0][1].length);
  });

  it('extra_context ngắn → chunk theo đoạn như cũ', async () => {
    findByUserId.mockResolvedValue({ company_name: 'Shop A', extra_context: 'Đoạn một.\n\nĐoạn hai.' });

    await svc.reembedChunks(5);

    const extraChunks = insertChunks.mock.calls[0][1].filter((c) => c.metadata.field === 'extra_context');
    expect(extraChunks.map((c) => c.text)).toEqual(['Đoạn một.', 'Đoạn hai.']);
  });
});
