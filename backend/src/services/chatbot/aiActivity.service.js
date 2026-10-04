import zaloPersonalRepository from '../../repositories/chatbot/zaloPersonal.repository.js';
import aiActivitySummaryRepository from '../../repositories/chatbot/aiActivitySummary.repository.js';
import { getVietnamDayRange } from '../../utils/vnTimeFormat.util.js';
import { generateGeminiText } from '../../utils/geminiClient.util.js';
import { resolveAllowedModel } from '../ai/aiModelPolicy.service.js';
import aiUsageMeter from '../ai/aiUsageMeter.service.js';
import { AI_UNAVAILABLE_SOURCE } from '../../utils/aiUnavailable.util.js';

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

// Giới hạn trần tối đa 30 hội thoại có hoạt động gần nhất để tránh tràn output token (maxOutputTokens: 8192)
const MAX_CONVERSATIONS_FOR_SUMMARY = 30;
/** Mỗi hội thoại chỉ đưa 15 tin gần nhất vào prompt — cắt NGAY trong SQL (D-21), không kéo cả ngày rồi cắt bằng JS. */
const MAX_MESSAGES_PER_CONVERSATION = 15;
/** Mỗi tin cắt ở 1.000 ký tự (cũng cắt ngay trong SQL): một tin dán cả bài/log dài không được phình prompt và phí token. */
const MAX_MESSAGE_CHARS = 1000;

/**
 * Lượt tóm tắt ĐANG chạy theo `userId:dayKey` (D-21): bấm đôi / hai tab / hai thiết bị cùng lúc = MỘT lượt Gemini; lượt đến sau
 * chờ chung kết quả thay vì gọi Gemini lần nữa (trước đây 2 cú bấm = 2 lượt Gemini + 2 credit). Một tiến trình duy nhất
 * (production chạy 1 replica) nên bản đồ trong RAM đủ; xem CLAUDE.md "Campaign runtime — single process only".
 *
 * @type {Map<string, Promise<object>>}
 */
const summarizeInFlight = new Map();

/** Mốc tin nhắn mới nhất trong các hội thoại sẽ đưa vào tóm tắt (null nếu không có). */
function latestMessageAt(targetRows) {
  let maxTinCuoi = null;
  for (const r of targetRows) {
    if (r.tin_cuoi) {
      const d = new Date(r.tin_cuoi);
      if (!maxTinCuoi || d > maxTinCuoi) maxTinCuoi = d;
    }
  }
  return maxTinCuoi;
}

/** Cache còn "tươi": có nội dung và mốc tin cuối của cache không cũ hơn tin mới nhất hiện có. */
function isFreshCache(existingCache, maxTinCuoi) {
  if (!existingCache || !existingCache.last_message_at || !maxTinCuoi) return false;
  const cachedLastAt = new Date(existingCache.last_message_at);
  return cachedLastAt >= maxTinCuoi
    && Array.isArray(existingCache.payload)
    && existingCache.payload.length > 0;
}

class AiActivityService {
  /**
   * Lấy báo cáo hoạt động AI trong ngày (không dùng LLM)
   * @param {object} params
   * @param {number} params.userId
   * @param {string} [params.date] YYYY-MM-DD
   * @param {number|null} [params.accountId]
   * @param {number[]|null} [params.accessibleZaloAccountIds] G2: null = chủ / super admin; mảng = nhân viên; thiếu = không thấy gì
   */
  async getActivityReport({ userId, date = null, accountId = null, accessibleZaloAccountIds }) {
    const { dayKey, dateStr, startIso, endIso } = getVietnamDayRange(date);

    const [rows, summaryCache, stalePausedCount] = await Promise.all([
      zaloPersonalRepository.getAiActivityReport({
        userId,
        startIso,
        endIso,
        accountId: accountId ? Number(accountId) : null,
        accessibleZaloAccountIds,
      }),
      aiActivitySummaryRepository.findByUserAndDay(userId, dayKey),
      zaloPersonalRepository.countStaleAiPausedConversations(userId, 24, { accessibleZaloAccountIds }),
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
   * @param {{ userId: number, accessibleZaloAccountIds?: number[]|null }} params G2: nhân viên chỉ bật lại hội thoại của tài
   *   khoản Zalo được giao (null = chủ / super admin; thiếu = không bật gì)
   */
  async resumeAllAi({ userId, accessibleZaloAccountIds }) {
    const count = await zaloPersonalRepository.bulkResumeAiPaused(userId, { accessibleZaloAccountIds });
    return { resumedCount: count };
  }

  /**
   * Chỉ ĐỌC bản tóm tắt đã lưu của ngày nếu còn tươi (không có tin mới hơn mốc lưu) — KHÔNG gọi Gemini, KHÔNG trừ credit.
   * Route gọi hàm này TRƯỚC cổng credit (D-21): hết credit vẫn xem lại bản đã trả tiền.
   *
   * @param {object} params
   * @param {number} params.userId
   * @param {string} [params.date]
   * @returns {Promise<{ date: string, dayKey: string, summaries: object[], cached: true, updatedAt: any } | null>}
   */
  async findFreshCachedSummary({ userId, date = null }) {
    const { dayKey, dateStr, startIso, endIso } = getVietnamDayRange(date);
    // Đường CHỈ-CHỦ (route /ai-activity/summarize đứng sau requireSelfContext): null = không lọc theo việc giao tài khoản.
    const rows = await zaloPersonalRepository.getAiActivityReport({ userId, startIso, endIso, accessibleZaloAccountIds: null });
    if (!rows || rows.length === 0) return null;
    const maxTinCuoi = latestMessageAt(rows.slice(0, MAX_CONVERSATIONS_FOR_SUMMARY));
    const existingCache = await aiActivitySummaryRepository.findByUserAndDay(userId, dayKey);
    if (!isFreshCache(existingCache, maxTinCuoi)) return null;
    return {
      date: dateStr,
      dayKey,
      summaries: existingCache.payload,
      cached: true,
      updatedAt: existingCache.updated_at,
    };
  }

  /**
   * Tóm tắt ý chính các hội thoại trong ngày bằng Gemini (có cache & credit gate)
   *
   * Khoá "đang chạy" theo `userId:dayKey` (D-21): lượt đến khi đã có lượt cùng khoá đang chạy KHÔNG gọi Gemini nữa mà chờ chung
   * kết quả, và trả về `cached: true` (controller chỉ trừ credit khi `cached === false`) — bấm đôi = 1 lượt Gemini, 1 credit.
   * Lượt đầu lỗi thì lượt chờ nhận cùng lỗi; khoá luôn được dọn (`finally`) nên lần bấm sau chạy lại bình thường.
   *
   * @param {object} params
   * @param {number} params.userId
   * @param {string} [params.date]
   * @param {number|null} [params.actorUserId]
   */
  async summarizeDailyActivity({ userId, date = null, actorUserId = null }) {
    const { dayKey } = getVietnamDayRange(date);
    const key = `${userId}:${dayKey}`;

    const running = summarizeInFlight.get(key);
    if (running) {
      const shared = await running;
      return { ...shared, cached: true, deduped: true };
    }

    const promise = this._summarizeFresh({ userId, date, actorUserId });
    summarizeInFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      if (summarizeInFlight.get(key) === promise) summarizeInFlight.delete(key);
    }
  }

  async _summarizeFresh({ userId, date = null, actorUserId = null }) {
    const { dayKey, dateStr, startIso, endIso } = getVietnamDayRange(date);

    // Đường CHỈ-CHỦ (route /ai-activity/summarize đứng sau requireSelfContext): null = không lọc theo việc giao tài khoản.
    const rows = await zaloPersonalRepository.getAiActivityReport({
      userId,
      startIso,
      endIso,
      accessibleZaloAccountIds: null,
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

    const targetRows = rows.slice(0, MAX_CONVERSATIONS_FOR_SUMMARY);

    // Tìm mốc tin nhắn mới nhất trong ngày
    const maxTinCuoi = latestMessageAt(targetRows);
    const conversationIds = targetRows.map((r) => r.id);

    // Kiểm tra cache (chốt chặn thứ hai: route đã thử đọc cache trước cổng credit, nhưng lượt khác có thể vừa ghi xong)
    const existingCache = await aiActivitySummaryRepository.findByUserAndDay(userId, dayKey);
    if (isFreshCache(existingCache, maxTinCuoi)) {
      return {
        date: dateStr,
        dayKey,
        summaries: existingCache.payload,
        cached: true,
        updatedAt: existingCache.updated_at,
      };
    }

    // Lấy chi tiết tin nhắn để tóm tắt — SQL đã giới hạn số tin mỗi hội thoại và độ dài mỗi tin (D-21)
    const rawMessages = await zaloPersonalRepository.getMessagesForSummary({
      conversationIds,
      userId,
      startIso,
      endIso,
      limitPerConversation: MAX_MESSAGES_PER_CONVERSATION,
      maxContentChars: MAX_MESSAGE_CHARS,
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

      // SQL đã giới hạn; cắt lại ở đây để mock/đường gọi khác không vượt trần
      const recentMsgs = msgs.slice(-MAX_MESSAGES_PER_CONVERSATION);

      const formattedMsgs = recentMsgs.map((m) => {
        let senderLabel = 'Khách';
        if (m.role === 'agent') {
          // Câu xin lỗi tự động (AI hết credit / lỗi) KHÔNG phải người trực chat và cũng không phải AI trả lời được:
          // gắn nhầm "Người trực chat" thì bản tóm tắt tưởng khách đã có người xử lý (G3b, A P1-6).
          if (m.source === AI_UNAVAILABLE_SOURCE) senderLabel = 'Hệ thống (xin lỗi tự động, AI chưa trả lời được)';
          else senderLabel = m.source === 'ai_auto_reply' ? 'AI' : 'Người trực chat';
        }
        return `[${senderLabel}]: ${String(m.content || '').trim().slice(0, MAX_MESSAGE_CHARS)}`;
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
      // KHÔNG in `result.text` và cũng KHÔNG in `err.message`: V8 chèn đoạn đầu của chuỗi vừa parse vào câu lỗi
      // (`Unexpected token 'K', "Khách Nguy"... is not valid JSON`) — đó là nội dung hội thoại của khách (PII).
      // Chỉ ghi loại lỗi + độ dài + mã kết thúc (D-21/D-28).
      console.error(
        '[AiActivityService] JSON parse failed from Gemini summary:',
        `(${err.name}, độ dài ${String(result.text || '').length} ký tự, finishReason=${result.finishReason || 'n/a'})`
      );
      const parseErr = new Error('AI tóm tắt trả về định dạng không hợp lệ hoặc bị cắt ngắn. Vui lòng thử lại.');
      parseErr.status = 422;
      throw parseErr;
    }

    if (!Array.isArray(summaries) || summaries.length === 0) {
      const emptyErr = new Error('AI không thể trích xuất tóm tắt từ các hội thoại. Vui lòng thử lại.');
      emptyErr.status = 422;
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
