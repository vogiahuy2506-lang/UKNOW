import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGetFormattedProfileForPrompt = jest.fn();
const mockRunChat = jest.fn();

jest.unstable_mockModule('../businessProfile.service.js', () => ({
  default: { getFormattedProfileForPrompt: mockGetFormattedProfileForPrompt },
}));
jest.unstable_mockModule('../aiChatTransport.service.js', () => ({
  runChat: mockRunChat,
}));

const {
  generateSystemInstruction,
  cleanInstructionOutput,
  buildSystemInstructionPrompt,
} = await import('../chatbotInstructionWriter.service.js');

// PLAN_AI_VIET_HO_CHI_DAN_CHATBOT_2026-09-13.md, mục 3.4 — danh sách test của Việc 4.
describe('chatbotInstructionWriter.service', () => {
  beforeEach(() => {
    mockGetFormattedProfileForPrompt.mockReset();
    mockRunChat.mockReset();
    mockGetFormattedProfileForPrompt.mockResolvedValue('');
    mockRunChat.mockResolvedValue({ content: 'Bạn là trợ lý bán hàng chuyên nghiệp.' });
  });

  describe('buildSystemInstructionPrompt', () => {
    it('prompt dựng ra CÓ chứa hồ sơ doanh nghiệp khi có', () => {
      const prompt = buildSystemInstructionPrompt({
        language: 'vi',
        userHint: 'Trợ lý bán hàng',
        businessContext: '=== HỒ SƠ DOANH NGHIỆP (đầy đủ) ===\n- Tên công ty: ABC\n=== HẾT HỒ SƠ ===',
      });
      expect(prompt).toContain('=== HỒ SƠ DOANH NGHIỆP (đầy đủ) ===');
      expect(prompt).toContain('Tên công ty: ABC');
      expect(prompt).toContain('Trợ lý bán hàng');
    });

    it('KHÔNG vỡ khi không có hồ sơ (chuỗi rỗng) — vẫn dựng được prompt đầy đủ', () => {
      const prompt = buildSystemInstructionPrompt({
        language: 'vi',
        userHint: 'Trợ lý bán hàng',
        businessContext: '',
      });
      expect(prompt).toContain('Trợ lý bán hàng');
      expect(prompt).not.toContain('undefined');
      expect(prompt).not.toContain('null');
      // Chỗ business_context để trống — đúng khuôn "nếu trống thì dùng chỗ trống vuông" của
      // chính prompt chính thức (không tự chèn thêm câu giải thích nào khác).
      expect(prompt).toContain('Bối cảnh doanh nghiệp của khách');
    });

    it('nguyên văn 5 luật đầu ra của prompt chính thức không bị đổi chữ', () => {
      const prompt = buildSystemInstructionPrompt({ language: 'vi', userHint: 'X', businessContext: '' });
      expect(prompt).toContain('KHÔNG ĐƯỢC BỊA');
      expect(prompt).toContain('CẤU TRÚC — năm thành phần, viết đủ cả năm');
      expect(prompt).toContain('ĐỊNH DANH VAI TRÒ (Persona)');
      expect(prompt).toContain('NHIỆM VỤ CHÍNH (Core Tasks)');
      expect(prompt).toContain('GIỌNG ĐIỆU (Tone & Style)');
      expect(prompt).toContain('GIỚI HẠN / QUY TẮC (Rules)');
      expect(prompt).toContain('ĐỊNH DẠNG ĐẦU RA (Output format)');
    });
  });

  describe('cleanInstructionOutput', () => {
    it('gỡ khối mã bọc ngoài (```markdown ... ```)', () => {
      expect(cleanInstructionOutput('```markdown\nBạn là trợ lý.\nLàm việc A.\n```'))
        .toBe('Bạn là trợ lý.\nLàm việc A.');
    });

    it('gỡ khối mã bọc ngoài (``` trần, không tag ngôn ngữ)', () => {
      expect(cleanInstructionOutput('```\nBạn là trợ lý.\n```')).toBe('Bạn là trợ lý.');
    });

    it('gỡ câu dẫn "Hãy copy prompt sau:" ở dòng đầu', () => {
      expect(cleanInstructionOutput('Hãy copy prompt sau:\nBạn là trợ lý.'))
        .toBe('Bạn là trợ lý.');
    });

    it('gỡ câu dẫn "Đây là prompt của bạn:" ở dòng đầu', () => {
      expect(cleanInstructionOutput('Đây là prompt của bạn:\nBạn là trợ lý.'))
        .toBe('Bạn là trợ lý.');
    });

    it('trả về sạch sẵn → GIỮ NGUYÊN, không cắt nhầm', () => {
      const clean = 'Bạn là trợ lý bán hàng.\nNhiệm vụ: tư vấn sản phẩm.\nGiọng điệu: thân thiện.';
      expect(cleanInstructionOutput(clean)).toBe(clean);
    });

    // Bẫy 2 / đột biến "làm sạch quá tay" — plan yêu cầu viết thêm nếu chưa có ca canh.
    it('KHÔNG cắt nhầm — một chỉ dẫn hợp lệ nhắc tới chữ "prompt" ở GIỮA bài phải được giữ nguyên', () => {
      const clean = 'Bạn là trợ lý.\nNếu khách hỏi cách viết prompt cho chatbot khác, hãy hướng dẫn họ.\nKết thúc.';
      expect(cleanInstructionOutput(clean)).toBe(clean);
    });

    it('gỡ cả hai (khối mã bọc quanh câu dẫn) — không phụ thuộc thứ tự lồng', () => {
      expect(cleanInstructionOutput('```markdown\nHãy copy prompt sau:\nBạn là trợ lý.\n```'))
        .toBe('Bạn là trợ lý.');
    });

    it('coi câu xin lỗi soạn sẵn của parseAiJson (khi nó đọc nhầm là JSON hỏng) là rỗng', () => {
      expect(cleanInstructionOutput(
        'Xin lỗi, tôi gặp lỗi định dạng khi tạo câu trả lời. Bạn gửi lại yêu cầu giúp tôi nhé.'
      )).toBe('');
    });
  });

  describe('generateSystemInstruction', () => {
    it('nạp hồ sơ doanh nghiệp và gọi runChat với systemPrompt đã có hồ sơ đó (đột biến bắt buộc: bỏ nạp hồ sơ → ca này phải đỏ)', async () => {
      mockGetFormattedProfileForPrompt.mockResolvedValue(
        '=== HỒ SƠ DOANH NGHIỆP (đầy đủ) ===\n- Tên công ty: Trung tâm ABC\n=== HẾT HỒ SƠ ==='
      );

      const result = await generateSystemInstruction({ userId: 42, hint: 'Trợ lý tư vấn khoá học', language: 'vi' });

      expect(mockGetFormattedProfileForPrompt).toHaveBeenCalledWith(42);
      const [callArgs] = mockRunChat.mock.calls[0];
      expect(callArgs.systemPrompt).toContain('Trung tâm ABC');
      expect(callArgs.userId).toBe(42);
      expect(result.businessContextUsed).toBe(true);
    });

    it('hồ sơ doanh nghiệp rỗng/lỗi (đã .catch ở service) → vẫn viết được, businessContextUsed=false', async () => {
      mockGetFormattedProfileForPrompt.mockRejectedValue(new Error('DB tạm lỗi'));

      const result = await generateSystemInstruction({ userId: 7, hint: 'Trợ lý bán hàng', language: 'vi' });

      expect(result.instruction).toBe('Bạn là trợ lý bán hàng chuyên nghiệp.');
      expect(result.businessContextUsed).toBe(false);
    });

    it('làm sạch đầu ra của runChat (bọc ``` + câu dẫn) trước khi trả về', async () => {
      mockRunChat.mockResolvedValue({ content: '```markdown\nHãy copy prompt sau:\nBạn là trợ lý.\n```' });

      const result = await generateSystemInstruction({ userId: 1, hint: 'X' });

      expect(result.instruction).toBe('Bạn là trợ lý.');
    });

    it('model trả rỗng sau khi làm sạch → 502, KHÔNG trả chuỗi rỗng cho khách', async () => {
      mockRunChat.mockResolvedValue({ content: '' });

      await expect(generateSystemInstruction({ userId: 1, hint: 'X' })).rejects.toMatchObject({ status: 502 });
    });

    it('model chỉ trả câu xin lỗi soạn sẵn (parseAiJson đọc nhầm) → cũng 502, không lọt ra như chỉ dẫn thật', async () => {
      mockRunChat.mockResolvedValue({
        content: 'Xin lỗi, tôi gặp lỗi định dạng khi tạo câu trả lời. Bạn gửi lại yêu cầu giúp tôi nhé.',
      });

      await expect(generateSystemInstruction({ userId: 1, hint: 'X' })).rejects.toMatchObject({ status: 502 });
    });

    it('đọc result.instruction nếu model dùng khoá "instruction" thay vì "content"', async () => {
      mockRunChat.mockResolvedValue({ instruction: 'Bạn là trợ lý tư vấn.' });

      const result = await generateSystemInstruction({ userId: 1, hint: 'X' });

      expect(result.instruction).toBe('Bạn là trợ lý tư vấn.');
    });

    it('truyền history không rỗng cho runChat (Gemini cần contents không rỗng)', async () => {
      await generateSystemInstruction({ userId: 1, hint: 'X' });

      const [callArgs] = mockRunChat.mock.calls[0];
      expect(Array.isArray(callArgs.history)).toBe(true);
      expect(callArgs.history.length).toBeGreaterThan(0);
    });
  });
});
