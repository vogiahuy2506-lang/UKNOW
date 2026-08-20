import zaloPersonalRepository from '../../repositories/chatbot/zaloPersonal.repository.js';
import aiActivitySummaryRepository from '../../repositories/chatbot/aiActivitySummary.repository.js';
import { getVietnamDayRange } from '../../utils/vnTimeFormat.util.js';
import { generateGeminiText } from '../../utils/geminiClient.util.js';
import { resolveAllowedModel } from '../ai/aiModelPolicy.service.js';
import aiUsageMeter from '../ai/aiUsageMeter.service.js';

function stripCodeFences(text) {
  let t = String(text || '').replace(/^\uFEFF/, '').trim();
  const fenceAt = t.search(/```(?:json)?\s*/i);
  if (fenceAt >= 0) {
    const fromFence = t.slice(fenceAt);
    const m = fromFence.match(/^```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (m) return m[1].trim();
  }
  const whole = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/im);
  if (whole) return whole[1].trim();
  return t;
}

class AiActivityService {
  /**
   * Lấy báo cáo hoạt động AI trong ngày (không dùng LLM)
   * @param {object} params
   * @param {number} params.userId
   * @param {string} [params.date] YYYY-MM-DD
   * @param {number|null} [params.accountId]
   */
  async getActivityReport({ userId, date = null, accountId = null }) {
    const { dayKey, dateStr, startIso, endIso } = getVietnamDayRange(date);

    const [rows, summaryCache, stalePausedCount] = await Promise.all([
      zaloPersonalRepository.getAiActivityReport({
        userId,
        startIso,
        endIso,
        accountId: accountId ? Number(accountId) : null,
      }),
      aiActivitySummaryRepository.findByUserAndDay(userId, dayKey),
      zaloPersonalRepository.countStaleAiPausedConversations(userId, 24),
    ]);

    let totalKhachNhan = 0;
    let totalAiTraLoi = 0;
    let totalNguoiTraLoi = 0;
    let totalChuaDoc = 0;
    let totalAiPaused = 0;

    const summaryMap = new Map();
    if (summaryCache?.payload && Array.isArray(summaryCache.payload)) {
      for (const item of summaryCache.payload) {
        if (item?.conversationId) {
          summaryMap.set(String(item.conversationId), item);
        }
      }
    }

    const conversations = rows.map((r) => {
      const khachNhan = Number(r.khach_nhan) || 0;
      const aiTraLoi = Number(r.ai_tra_loi) || 0;
      const nguoiTraLoi = Number(r.nguoi_tra_loi) || 0;
      const chuaDoc = Number(r.chua_doc) || 0;
      const isPaused = Boolean(r.ai_paused);

      totalKhachNhan += khachNhan;
      totalAiTraLoi += aiTraLoi;
      totalNguoiTraLoi += nguoiTraLoi;
      totalChuaDoc += chuaDoc;
      if (isPaused) totalAiPaused += 1;

      const itemSummary = summaryMap.get(String(r.id)) || null;

      return {
        id: Number(r.id),
        visitorName: r.visitor_name || 'Khách hàng',
        externalId: r.external_id,
        zaloSettingId: r.id_zalo_setting ? Number(r.id_zalo_setting) : null,
        khachNhan,
        aiTraLoi,
        nguoiTraLoi,
        chuaDoc,
        tinDau: r.tin_dau,
        tinCuoi: r.tin_cuoi,
        aiPaused: isPaused,
        aiPausedAt: r.ai_paused_at,
        summary: itemSummary,
      };
    });

    return {
      date: dateStr,
      dayKey,
      conversations,
      stats: {
        totalConversations: conversations.length,
        totalKhachNhan,
        totalAiTraLoi,
        totalNguoiTraLoi,
        totalChuaDoc,
        totalAiPaused,
        stalePausedCount: Number(stalePausedCount) || 0,
      },
      hasSummaryCache: Boolean(summaryCache),
      summaryUpdatedAt: summaryCache?.updated_at || null,
    };
  }

  /**
   * Bật lại tất cả AI đang bị tạm dừng cho user
   * @param {{ userId: number }} params
   */
  async resumeAllAi({ userId }) {
    const count = await zaloPersonalRepository.bulkResumeAiPaused(userId);
    return { resumedCount: count };
  }

  /**
   * Tóm tắt ý chính các hội thoại trong ngày bằng Gemini (có cache & credit gate)
   * @param {object} params
   * @param {number} params.userId
   * @param {string} [params.date]
   * @param {number|null} [params.actorUserId]
   */
  async summarizeDailyActivity({ userId, date = null, actorUserId = null }) {
    const { dayKey, dateStr, startIso, endIso } = getVietnamDayRange(date);

    const rows = await zaloPersonalRepository.getAiActivityReport({
      userId,
      startIso,
      endIso,
    });

    if (!rows || rows.length === 0) {
      return {
        date: dateStr,
        dayKey,
        summaries: [],
        cached: false,
        message: 'Không có hội thoại nào phát sinh tin nhắn trong ngày.',
      };
    }

    // Giới hạn trần tối đa 30 hội thoại có hoạt động gần nhất để tránh tràn output token (maxOutputTokens: 8192)
    const MAX_CONVERSATIONS_FOR_SUMMARY = 30;
    const targetRows = rows.slice(0, MAX_CONVERSATIONS_FOR_SUMMARY);

    // Tìm mốc tin nhắn mới nhất trong ngày
    let maxTinCuoi = null;
    const conversationIds = [];
    for (const r of targetRows) {
      conversationIds.push(r.id);
      if (r.tin_cuoi) {
        const d = new Date(r.tin_cuoi);
        if (!maxTinCuoi || d > maxTinCuoi) {
          maxTinCuoi = d;
        }
      }
    }

    // Kiểm tra cache
    const existingCache = await aiActivitySummaryRepository.findByUserAndDay(userId, dayKey);
    if (existingCache && existingCache.last_message_at && maxTinCuoi) {
      const cachedLastAt = new Date(existingCache.last_message_at);
      if (cachedLastAt >= maxTinCuoi && Array.isArray(existingCache.payload) && existingCache.payload.length > 0) {
        return {
          date: dateStr,
          dayKey,
          summaries: existingCache.payload,
          cached: true,
          updatedAt: existingCache.updated_at,
        };
      }
    }

    // Lấy chi tiết tin nhắn để tóm tắt
    const rawMessages = await zaloPersonalRepository.getMessagesForSummary({
      conversationIds,
      userId,
      startIso,
      endIso,
    });

    const messagesByConv = new Map();
    for (const m of rawMessages) {
      const cid = Number(m.id_conversation);
      if (!messagesByConv.has(cid)) messagesByConv.set(cid, []);
      messagesByConv.get(cid).push(m);
    }

    const conversationContexts = [];
    for (const r of targetRows) {
      const msgs = messagesByConv.get(Number(r.id)) || [];
      if (msgs.length === 0) continue;

      // Giới hạn 15 tin nhắn gần nhất mỗi hội thoại
      const recentMsgs = msgs.slice(-15);

      const formattedMsgs = recentMsgs.map((m) => {
        let senderLabel = 'Khách';
        if (m.role === 'agent') {
          senderLabel = m.source === 'ai_auto_reply' ? 'AI' : 'Người trực chat';
        }
        return `[${senderLabel}]: ${String(m.content || '').trim()}`;
      }).join('\n');

      conversationContexts.push(
        `--- Hội thoại ID ${r.id} (Tên khách: "${r.visitor_name || 'Khách'}") ---\n${formattedMsgs}`
      );
    }

    if (conversationContexts.length === 0) {
      return {
        date: dateStr,
        dayKey,
        summaries: [],
        cached: false,
      };
    }

    const prompt = `Bạn là trợ lý phân tích hội thoại chăm sóc khách hàng.
Dưới đây là ${conversationContexts.length} hội thoại giữa khách hàng và trợ lý AI/chủ shop trong ngày ${dateStr}.

Nhiệm vụ:
Tóm tắt ngắn gọn từng hội thoại và phân loại xem khách hàng này có đang cần người thật gọi điện/nhắn tin hỗ trợ gấp không.

QUY TẮC:
1. Trả về ĐÚNG MỘT MẢNG JSON, không markdown ngoài JSON, cấu trúc:
[
  {
    "conversationId": <number, ID hội thoại>,
    "y_chinh": "<1-2 câu tóm tắt ý chính câu chuyện>",
    "khach_muon_gi": "<nhu cầu, câu hỏi chính của khách>",
    "can_nguoi_that_khong": <true nếu khách cần tư vấn chuyên sâu, hỏi giá chốt đơn, phàn nàn, hoặc AI chưa giải quyết xong; false nếu chỉ chào hỏi hoặc AI đã xử lý trọn vẹn>,
    "ly_do_can_nguoi": "<lý do ngắn gọn nếu can_nguoi_that_khong = true, ngược lại để null hoặc chuỗi rỗng>"
  }
]

DỮ LIỆU CÁC HỘI THOẠI:
${conversationContexts.join('\n\n')}
`;

    const model = await resolveAllowedModel(userId, process.env.GEMINI_MODEL || 'gemini-2.5-flash');

    const result = await generateGeminiText({
      prompt,
      model,
      timeoutMs: 90000,
      jsonMode: true,
      maxOutputTokens: 8192,
      temperature: 0.2,
    });

    if (userId) {
      await aiUsageMeter.record(userId, result?.usage, {
        feature: 'inbox_ai_summary',
        model,
        actorUserId,
      });
    }

    let summaries = [];
    try {
      const parsed = JSON.parse(stripCodeFences(result.text));
      summaries = Array.isArray(parsed) ? parsed : (parsed?.summaries || []);
    } catch (err) {
      console.error('[AiActivityService] JSON parse failed from Gemini summary:', err.message, result.text);
      const parseErr = new Error('AI tóm tắt trả về định dạng không hợp lệ hoặc bị cắt ngắn. Vui lòng thử lại.');
      parseErr.status = 502;
      throw parseErr;
    }

    if (!Array.isArray(summaries) || summaries.length === 0) {
      const emptyErr = new Error('AI không thể trích xuất tóm tắt từ các hội thoại. Vui lòng thử lại.');
      emptyErr.status = 502;
      throw emptyErr;
    }

    // Lưu cache
    await aiActivitySummaryRepository.upsertSummary(
      userId,
      dayKey,
      maxTinCuoi ? maxTinCuoi.toISOString() : new Date().toISOString(),
      summaries
    );

    return {
      date: dateStr,
      dayKey,
      summaries,
      cached: false,
      updatedAt: new Date().toISOString(),
    };
  }
}

export default new AiActivityService();
