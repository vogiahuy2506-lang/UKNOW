import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGenerate = jest.fn();
const mockRecord = jest.fn();
const mockSearchHelpChunks = jest.fn();
const mockGetCapabilityMapText = jest.fn();
const mockInsertUnanswered = jest.fn();
const mockAnswerPlanAdvice = jest.fn();

jest.unstable_mockModule('../geminiText.util.js', () => ({
  generateGeminiText: mockGenerate,
}));

jest.unstable_mockModule('../../ai/aiUsageMeter.service.js', () => ({
  default: { record: mockRecord, reserve: jest.fn() },
}));

jest.unstable_mockModule('../helpCenter.service.js', () => ({
  getCapabilityMapText: mockGetCapabilityMapText,
  searchHelpChunks: mockSearchHelpChunks,
}));

jest.unstable_mockModule('../../../repositories/help/helpArticle.repository.js', () => ({
  insertUnanswered: mockInsertUnanswered,
}));

jest.unstable_mockModule('../planAdvisor.service.js', () => ({
  answerPlanAdvice: mockAnswerPlanAdvice,
}));

const {
  tryHandleHelpChat,
  HELP_ROUTE_LABELS,
} = await import('../helpAssistant.service.js');

describe('tryHandleHelpChat route branches', () => {
  beforeEach(() => {
    mockGenerate.mockReset();
    mockRecord.mockReset();
    mockRecord.mockResolvedValue(undefined);
    mockSearchHelpChunks.mockReset();
    mockGetCapabilityMapText.mockReset();
    mockInsertUnanswered.mockReset();
    mockAnswerPlanAdvice.mockReset();
    mockGetCapabilityMapText.mockResolvedValue('');
    mockSearchHelpChunks.mockResolvedValue({ chunks: [], topSimilarity: 0 });
    mockAnswerPlanAdvice.mockResolvedValue({
      type: 'text',
      content: 'Gợi ý gói từ DB.\n\n[Xem Bảng giá](/pricing)',
      data: {
        helpRoute: HELP_ROUTE_LABELS.hỏi_đáp,
        planAdvice: true,
        currentPlanCode: 'starter',
        pricingPath: '/pricing',
      },
    });
  });

  function historyWith(text) {
    return [{ role: 'user', content: text }];
  }

  it('làm_giúp → { handled: false, route } (lọt xuống AI)', async () => {
    mockGenerate.mockResolvedValue({ text: 'làm_giúp', modelName: 'm', raw: {} });
    await expect(tryHandleHelpChat({ history: historyWith('tạo chiến dịch'), userId: 1 }))
      .resolves.toEqual({ handled: false, route: HELP_ROUTE_LABELS.làm_giúp });
  });

  it('không_rõ → { handled: false, route } (thả xuống AI, không CLARIFY cứng)', async () => {
    mockGenerate.mockResolvedValue({ text: 'không_rõ', modelName: 'm', raw: {} });
    await expect(tryHandleHelpChat({ history: historyWith('Zalo'), userId: 1 }))
      .resolves.toEqual({ handled: false, route: HELP_ROUTE_LABELS.không_rõ });
  });

  it.each([
    ['core', 'bạn có thể tạo landing page cho tôi không', /mình làm được/i, 'core'],
    ['guide', 'trợ lý hẹn giờ gửi được không', /mình tạo chiến dịch được ngay/i, 'guide'],
    ['unsupported', 'hệ thống có gửi SMS không', /chưa hỗ trợ/i, 'unsupported'],
  ])('short-circuits %s capability probes without the LLM router', async (_name, question, content, kind) => {
    const result = await tryHandleHelpChat({ history: historyWith(question), userId: 1 });

    expect(result.content).toMatch(content);
    expect(result.data).toMatchObject({ capabilityProbe: true, capabilityKind: kind });
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('plan-advisor short-circuits before sensitive docs/router', async () => {
    const result = await tryHandleHelpChat({
      history: historyWith('bảng giá có những tính năng gì'),
      userId: 1,
      planOwnerUserId: 3,
    });

    expect(result.data.planAdvice).toBe(true);
    expect(mockAnswerPlanAdvice).toHaveBeenCalledWith(expect.objectContaining({
      question: 'bảng giá có những tính năng gì',
      userId: 1,
      planOwnerUserId: 3,
    }));
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockSearchHelpChunks).not.toHaveBeenCalled();
    expect(mockInsertUnanswered).not.toHaveBeenCalled();
  });

  it('pricing intent uses plan-advisor instead of stale help docs', async () => {
    const result = await tryHandleHelpChat({
      history: historyWith('giá gói professional'),
      userId: 1,
    });

    expect(result.data.planAdvice).toBe(true);
    expect(mockAnswerPlanAdvice).toHaveBeenCalled();
    expect(mockSearchHelpChunks).not.toHaveBeenCalled();
  });

  it('sensitive payment question without docs stays behind the fixed guard', async () => {
    const result = await tryHandleHelpChat({
      history: historyWith('thanh toán gói được không'),
      userId: 1,
    });

    expect(result.content).toMatch(/không nên đoán thông tin về thanh toán/i);
    expect(mockAnswerPlanAdvice).not.toHaveBeenCalled();
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockInsertUnanswered).toHaveBeenCalledWith(expect.objectContaining({
      question: 'thanh toán gói được không',
    }));
  });

  it('payment failed stays sensitive, not plan-advisor', async () => {
    const result = await tryHandleHelpChat({
      history: historyWith('Payment failed'),
      userId: 1,
    });
    expect(mockAnswerPlanAdvice).not.toHaveBeenCalled();
    expect(result.content).toMatch(/không nên đoán|should not guess/i);
  });

  it('content-creation pricing email falls through to aiCampaign', async () => {
    mockGenerate.mockResolvedValue({ text: 'làm_giúp', modelName: 'm', raw: {} });
    await expect(tryHandleHelpChat({
      history: historyWith('Write an email about our pricing plans'),
      userId: 1,
    })).resolves.toEqual({ handled: false, route: HELP_ROUTE_LABELS.làm_giúp });
    expect(mockAnswerPlanAdvice).not.toHaveBeenCalled();
  });

  it('campaign plan creation falls through to aiCampaign', async () => {
    mockGenerate.mockResolvedValue({ text: 'làm_giúp', modelName: 'm', raw: {} });
    await expect(tryHandleHelpChat({
      history: historyWith('Create a campaign plan'),
      userId: 1,
    })).resolves.toEqual({ handled: false, route: HELP_ROUTE_LABELS.làm_giúp });
    expect(mockAnswerPlanAdvice).not.toHaveBeenCalled();
  });

  it('hỏi_đáp → answerWithDocs (không null)', async () => {
    mockGenerate
      .mockResolvedValueOnce({ text: 'hỏi_đáp', modelName: 'm', raw: {} })
      .mockResolvedValueOnce({
        text: 'Hướng dẫn tạo chiến dịch...',
        modelName: 'm',
        raw: {},
      });
    mockSearchHelpChunks.mockResolvedValue({
      chunks: [{ slug: 'chien-dich-zalo', title: 'Zalo', content_text: 'bước 1' }],
      topSimilarity: 0.9,
    });

    const result = await tryHandleHelpChat({
      history: historyWith('làm sao tạo chiến dịch Zalo?'),
      userId: 1,
    });
    expect(result).not.toBeNull();
    expect(result.data?.helpRoute).toBe(HELP_ROUTE_LABELS.hỏi_đáp);
    expect(String(result.content || '')).toBeTruthy();
  });

  // PLAN_VA_TRO_LY_AI_2026-09-28 PR-2 mục 4 — không đo được "model có phủ nhận tính năng hay
  // không" bằng unit (cần Gemini thật, ca ghim production: "chỉnh nội dung tin nhắn gửi vào
  // nhóm zalo" bị trả "chưa hỗ trợ" dù có 3 đoạn tài liệu). Ghim câu chữ luật cấm phủ nhận phải
  // còn trong prompt trả lời tài liệu.
  it('mục 4 — prompt trả lời tài liệu (có chunks) chứa luật cấm phủ nhận tính năng ngoài danh sách KHÔNG HỖ TRỢ', async () => {
    mockGenerate
      .mockResolvedValueOnce({ text: 'hỏi_đáp', modelName: 'm', raw: {} })
      .mockResolvedValueOnce({ text: 'Trả lời', modelName: 'm', raw: {} });
    mockSearchHelpChunks.mockResolvedValue({
      chunks: [{ slug: 'zalo-nhom', title: 'Zalo nhóm', content_text: 'bước 1' }],
      topSimilarity: 0.9,
    });

    await tryHandleHelpChat({
      history: historyWith('làm sao tôi chỉnh nội dung tin nhắn gửi vào nhóm zalo'),
      userId: 1,
    });

    const docsPrompt = mockGenerate.mock.calls[1][0].systemPrompt;
    expect(docsPrompt).toContain(
      'KHÔNG BAO GIỜ kết luận một tính năng KHÔNG có / CHƯA hỗ trợ trừ khi nó nằm trong danh sách KHÔNG HỖ TRỢ ở trên.'
    );
    expect(docsPrompt).toContain('Tài liệu không nói tới ≠ không có');
  });

  // PLAN_VA_TRO_LY_AI_2026-09-28 PR-2 mục 5 — help_unanswered từng trống 60 ngày dù model tự nói
  // "chưa có hướng dẫn" 14/42 lượt, vì insertUnanswered cũ chỉ ghi khi 0 chunks. Giờ phải ghi cả
  // khi CÓ chunks nhưng similarity thấp, hoặc câu trả lời chứa "chưa có hướng dẫn".
  describe('mục 5 — backlog help_unanswered dù CÓ chunks', () => {
    it('có chunks nhưng topSimilarity < 0.6 → insertUnanswered reason=low_similarity', async () => {
      mockGenerate
        .mockResolvedValueOnce({ text: 'hỏi_đáp', modelName: 'm', raw: {} })
        .mockResolvedValueOnce({ text: 'Câu trả lời có thể lạc đề.', modelName: 'm', raw: {} });
      mockSearchHelpChunks.mockResolvedValue({
        chunks: [{ slug: 'khong-lien-quan', title: 'X', content_text: 'y' }],
        topSimilarity: 0.4,
      });

      await tryHandleHelpChat({ history: historyWith('câu hỏi lạ ít khớp tài liệu'), userId: 1 });

      expect(mockInsertUnanswered).toHaveBeenCalledWith(expect.objectContaining({
        question: 'câu hỏi lạ ít khớp tài liệu',
        topSimilarity: 0.4,
        reason: 'low_similarity',
      }));
    });

    it('topSimilarity cao nhưng model tự nói "chưa có hướng dẫn" → insertUnanswered reason=model_said_no_doc', async () => {
      mockGenerate
        .mockResolvedValueOnce({ text: 'hỏi_đáp', modelName: 'm', raw: {} })
        .mockResolvedValueOnce({ text: 'Mình chưa có hướng dẫn cho phần này.', modelName: 'm', raw: {} });
      mockSearchHelpChunks.mockResolvedValue({
        chunks: [{ slug: 'zalo-nhom', title: 'Zalo nhóm', content_text: 'bước 1' }],
        topSimilarity: 0.85,
      });

      await tryHandleHelpChat({ history: historyWith('câu hỏi có tài liệu nhưng model tự nhận thua'), userId: 1 });

      expect(mockInsertUnanswered).toHaveBeenCalledWith(expect.objectContaining({
        reason: 'model_said_no_doc',
      }));
    });

    it('topSimilarity cao VÀ câu trả lời không nói "chưa có hướng dẫn" → KHÔNG ghi insertUnanswered', async () => {
      mockGenerate
        .mockResolvedValueOnce({ text: 'hỏi_đáp', modelName: 'm', raw: {} })
        .mockResolvedValueOnce({ text: 'Bước 1: vào Cài đặt > Zalo nhóm.', modelName: 'm', raw: {} });
      mockSearchHelpChunks.mockResolvedValue({
        chunks: [{ slug: 'zalo-nhom', title: 'Zalo nhóm', content_text: 'bước 1' }],
        topSimilarity: 0.9,
      });

      await tryHandleHelpChat({ history: historyWith('câu hỏi có tài liệu tốt'), userId: 1 });

      expect(mockInsertUnanswered).not.toHaveBeenCalled();
    });
  });

  it('includes capability rules in normal document and soft-fallback prompts', async () => {
    mockGenerate
      .mockResolvedValueOnce({ text: 'hỏi_đáp', modelName: 'm', raw: {} })
      .mockResolvedValueOnce({ text: 'Hướng dẫn', modelName: 'm', raw: {} });
    mockSearchHelpChunks.mockResolvedValue({
      chunks: [{ slug: 'chien-dich-zalo', title: 'Zalo', content_text: 'bước 1' }],
      topSimilarity: 0.9,
    });

    await tryHandleHelpChat({ history: historyWith('làm sao tạo chiến dịch Zalo?'), userId: 1 });

    const normalPrompt = mockGenerate.mock.calls[1][0].systemPrompt;
    expect(normalPrompt).toContain('NĂNG LỰC HÀNH ĐỘNG CỦA TRỢ LÝ');
    expect(normalPrompt).toContain('CHỈ HƯỚNG DẪN');
    expect(normalPrompt).toContain('KHÔNG HỖ TRỢ');
    expect(normalPrompt).toContain('QUY TẮC NĂNG LỰC');

    mockGenerate.mockReset();
    mockGenerate
      .mockResolvedValueOnce({ text: 'hỏi_đáp', modelName: 'm', raw: {} })
      .mockResolvedValueOnce({ text: 'Best effort', modelName: 'm', raw: {} });
    mockSearchHelpChunks.mockResolvedValue({ chunks: [], topSimilarity: 0 });

    await tryHandleHelpChat({ history: historyWith('cách dùng tính năng mới'), userId: 1 });

    const softPrompt = mockGenerate.mock.calls[1][0].systemPrompt;
    expect(softPrompt).toContain('NĂNG LỰC HÀNH ĐỘNG CỦA TRỢ LÝ');
    expect(softPrompt).toContain('QUY TẮC NĂNG LỰC');
  });

  it('leaves actual commands to the existing LLM router', async () => {
    mockGenerate.mockResolvedValue({ text: 'làm_giúp', modelName: 'm', raw: {} });

    await expect(tryHandleHelpChat({
      history: historyWith('hãy tạo landing page cho khóa học'),
      userId: 1,
    })).resolves.toEqual({ handled: false, route: HELP_ROUTE_LABELS.làm_giúp });

    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it('ngoài_phạm_vi không có chunk → OUT_OF_SCOPE', async () => {
    mockGenerate.mockResolvedValue({ text: 'ngoài_phạm_vi', modelName: 'm', raw: {} });
    const result = await tryHandleHelpChat({
      history: historyWith('thời tiết hôm nay'),
      userId: 1,
    });
    expect(result).not.toBeNull();
    expect(result.data?.helpRoute).toBe(HELP_ROUTE_LABELS.ngoài_phạm_vi);
    expect(String(result.content || '')).toMatch(/ngoài phạm vi/i);
  });

  it('ngoài_phạm_vi nhưng có chunk khớp → trả lời từ tài liệu', async () => {
    mockGenerate
      .mockResolvedValueOnce({ text: 'ngoài_phạm_vi', modelName: 'm', raw: {} })
      .mockResolvedValueOnce({
        text: 'Chủ sở hữu Founder AI là Ngô Hữu Thống.',
        modelName: 'm',
        raw: {},
      });
    mockSearchHelpChunks.mockResolvedValue({
      chunks: [{
        slug: 'chu-so-huu',
        title: 'Chủ sở hữu',
        content_text: 'Tôi là Ngô Hữu Thống - Chủ sở hữu founderai',
      }],
      topSimilarity: 0.8,
    });

    const result = await tryHandleHelpChat({
      history: historyWith('chủ sở hữu founder ai là ai'),
      userId: 1,
    });
    expect(result).not.toBeNull();
    expect(result.data?.helpRoute).toBe(HELP_ROUTE_LABELS.hỏi_đáp);
    expect(result.data?.recoveredFromOutOfScope).toBe(true);
    expect(result.data?.sources?.length).toBeGreaterThan(0);
    expect(String(result.content || '')).toMatch(/Ngô Hữu Thống/i);
  });

  it('extractLastUserText rỗng → CLARIFY (không gọi route)', async () => {
    const result = await tryHandleHelpChat({
      history: [{ role: 'assistant', content: 'Xin chào' }],
      userId: 1,
    });
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(result.data?.helpRoute).toBe(HELP_ROUTE_LABELS.không_rõ);
    expect(String(result.content || '')).toMatch(/hướng dẫn|làm giúp/i);
  });
});
