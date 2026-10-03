import { generateGeminiContent } from '../../utils/geminiClient.util.js';
import { parseAiJson } from '../../utils/aiJsonParse.util.js';
import uploadController from '../../controllers/upload.controller.js';
import { extractTextFromBuffer } from '../../utils/fileParser.util.js';
import {
  PDF_INLINE_MAX_BYTES,
  PDF_INLINE_BUDGET_BYTES,
  isPdfFile,
  formatMb,
} from '../../utils/pdfInline.util.js';
import { attachGoogleUrlParts } from '../../utils/googleUrlFetch.util.js';
import aiUsageMeter from './aiUsageMeter.service.js';
import { resolveAllowedModel } from './aiModelPolicy.service.js';

/**
 * Một lượt trợ lý được chờ tối đa bằng đúng timeout axios cũ (120 giây) — GỒM cả thử lại và model dự phòng.
 * Số này vẫn vượt trần 100 giây của Cloudflare (báo cáo D mục 1c); G2 không đổi nó, chỉ thêm thử lại + dự phòng.
 */
const ASSISTANT_TIMEOUT_MS = 120000;

/**
 * Shared Gemini chat transport — builds history, attaches files, calls API.
 * Moved out of aiCampaign.service.js (god-object split PR4).
 *
 * G2.3 (03/10/2026): gọi qua `generateGeminiContent` (lõi dùng chung) thay vì axios trần. Axios ném
 * `Gemini API Error (503): {json}` KHÔNG có `geminiStatus` nên `buildAiErrorPayload` không nhận ra lỗi của Google và
 * trả nguyên JSON tiếng Anh cho người dùng (sự cố 24/09); và khi hết giờ/đứt mạng, `AxiosError` nguyên bản mang
 * `config.url` (có khoá API trong query) bị controller `console.error` ra log. Lõi đã có thử lại 429/5xx/lỗi mạng,
 * model dự phòng, `geminiStatus`, khoá API ở header. Giữ nguyên: JSON mode, nhiệt độ 0.7, KHÔNG gửi thinkingConfig
 * (thinkingBudget null — model tự quyết như trước), không gửi topP, timeout 120 giây.
 *
 * @param {object} params
 * @param {string} params.systemPrompt
 * @param {Array}  params.history  — [{role, content}]
 * @param {Array}  params.files    — [{tempId, originalName, contentType}]
 * @param {number|null} [params.userId]
 * @param {string|null} [params.requestedModel]
 */
export async function runChat({
  systemPrompt,
  history = [],
  files = [],
  userId = null,
  requestedModel = null,
} = {}) {
  const googleUrlCache = new Map();
  // Ngân sách inline PDF dạng ảnh (scan) cho cả lịch sử lẫn tin hiện tại của một request
  // Ghi chú: lịch sử duyệt cũ → mới nên ngân sách có thể cạn trước tệp mới nhất; chấp nhận ở bản này (mỗi tệp scan thường 1–3 MB), ưu tiên tệp lượt hiện tại là việc sau.
  let inlinePdfBudget = PDF_INLINE_BUDGET_BYTES;

  // Hàm đọc và đính kèm một file vào parts array
  const attachFileToParts = async (parts, file) => {
    const fileName = file.originalName || 'tệp';
    try {
      let buffer = null;
      if (file.tempId) {
        buffer = await uploadController.readTempFileBuffer(file.tempId, file.originalName);
      } else if (file.storage_key || file.storageKey) {
        const key = String(file.storage_key || file.storageKey).trim();
        buffer = await uploadController.readFileBufferByKey(key);
      }
      if (!buffer || buffer.length === 0) return;
      const mimeType = String(file.contentType || '').toLowerCase();
      if (mimeType.startsWith('image/')) {
        parts.push({ inlineData: { mimeType: file.contentType, data: buffer.toString('base64') } });
      } else {
        const extractedText = await extractTextFromBuffer(buffer, file.originalName, file.contentType);
        if (extractedText.trim()) {
          parts.push({
            text: `[Nội dung tệp đính kèm: "${fileName}"]:\n${extractedText}\n[Hết nội dung tệp: "${fileName}"]`,
          });
        } else if (isPdfFile(file.originalName, mimeType)) {
          if (buffer.length <= PDF_INLINE_MAX_BYTES && buffer.length <= inlinePdfBudget) {
            parts.push({
              text: `[Tệp đính kèm "${fileName}" là PDF dạng ảnh (scan) — nội dung nằm trong tệp PDF ngay sau đây, hãy đọc trực tiếp]`,
            });
            parts.push({
              inlineData: {
                mimeType: 'application/pdf',
                data: buffer.toString('base64'),
              },
            });
            inlinePdfBudget -= buffer.length;
          } else if (buffer.length > PDF_INLINE_MAX_BYTES) {
            parts.push({
              text: `[Tệp đính kèm "${fileName}" là PDF dạng ảnh (scan) nặng ${formatMb(buffer.length)} MB, vượt giới hạn 10 MB nên không đọc được. Hãy nói cho người dùng biết và đề nghị nén tệp, tách nhỏ, hoặc gửi ảnh từng trang]`,
            });
          } else {
            parts.push({
              text: `[Tệp đính kèm "${fileName}" là PDF dạng ảnh (scan), đã hết ngân sách 15 MB PDF dạng ảnh trong một lượt nên không đọc được. Hãy nói cho người dùng biết và đề nghị gửi ở lượt chat tiếp theo]`,
            });
          }
        } else {
          parts.push({
            text: `[Tệp đính kèm "${fileName}" không đọc được chữ nào (tệp rỗng hoặc định dạng không hỗ trợ). Hãy báo cho người dùng]`,
          });
        }
      }
    } catch (err) {
      console.warn(`Could not read file ${file.tempId || file.storage_key || file.storageKey} for AI:`, err.message);
      parts.push({
        text: `[Tệp đính kèm "${fileName}" đã hết hạn hoặc không đọc được, hãy đề nghị người dùng đính kèm lại]`,
      });
    }
  };

  // Build Gemini history — re-attach files + Google URLs từ TẤT CẢ tin nhắn trong lịch sử
  const geminiHistory = await Promise.all(history.map(async (msg) => {
    const parts = [{ text: msg.content || '(no text)' }];
    if (msg.role === 'user') {
      if (Array.isArray(msg.files) && msg.files.length > 0) {
        for (const file of msg.files) {
          // eslint-disable-next-line no-await-in-loop
          await attachFileToParts(parts, file);
        }
      }
      await attachGoogleUrlParts(parts, msg.content, googleUrlCache);
    }
    return { role: msg.role === 'assistant' ? 'model' : 'user', parts };
  }));

  // Đính kèm thêm files của tin nhắn hiện tại (nếu có, không trùng với history)
  if (files.length > 0) {
    const lastMessage = geminiHistory[geminiHistory.length - 1];
    const historyFileIds = new Set(
      (history[history.length - 1]?.files || []).map((f) => f.tempId || f.storage_key || f.storageKey).filter(Boolean)
    );
    for (const file of files) {
      const fileId = file.tempId || file.storage_key || file.storageKey;
      if (!fileId || !historyFileIds.has(fileId)) {
        // eslint-disable-next-line no-await-in-loop
        await attachFileToParts(lastMessage.parts, file);
      }
    }
  }

  const modelName = await resolveAllowedModel(userId, requestedModel);
  const systemInstruction = { parts: [{ text: systemPrompt }] };

  try {
    const { maxOutputTokens } = await aiUsageMeter.reserve(userId, {
      contents: geminiHistory,
      systemInstruction,
      model: modelName,
      requestedMaxOutputTokens: 8192,
    });
    const fallbackModel = await aiUsageMeter.resolveFallbackModel();

    const result = await generateGeminiContent({
      contents: geminiHistory,
      systemInstruction,
      model: modelName,
      fallbackModel,
      jsonMode: true,
      temperature: 0.7,
      topP: null,
      maxOutputTokens,
      thinkingBudget: null,
      timeoutMs: ASSISTANT_TIMEOUT_MS,
      totalTimeoutMs: ASSISTANT_TIMEOUT_MS,
    });

    // Ghi token NGAY sau khi Google trả lời, TRƯỚC mọi kiểm tra kết quả (D-07): Google tính tiền cả lượt bị cắt
    // (MAX_TOKENS), bị lọc hay trả rỗng. Bản cũ chỉ ghi ở nhánh thành công và nhánh MAX_TOKENS nên lượt rỗng tốn tiền mà sổ
    // không có (record tự bỏ qua khi Google không báo token). Ghi theo model THẬT đã trả lời (có thể là model dự phòng).
    try {
      await aiUsageMeter.record(userId, result.usage, {
        feature: 'smart_chat',
        model: result.modelUsed || modelName,
      });
    } catch {
      // record() thật tự nuốt lỗi ghi sổ; chặn thêm ở đây để một lần ghi hụt không bao giờ làm hỏng câu trả lời của trợ lý.
    }

    if (!result.raw?.candidates || result.raw.candidates.length === 0) {
      if (result.blockReason) {
        throw new Error(`Yêu cầu bị chặn: ${result.blockReason}`);
      }
      throw new Error('AI không phản hồi, vui lòng thử lại.');
    }

    if (result.finishReason === 'MAX_TOKENS') {
      console.warn('[AI Chat] Gemini response truncated (finishReason=MAX_TOKENS)');
      throw new Error('AI trả lời quá dài bị cắt, hãy rút ngắn yêu cầu.');
    }

    const text = result.text;
    if (!text) throw new Error('AI trả về kết quả rỗng.');

    console.log(`[AI Chat] Gemini response (first 500 chars, finishReason=${result.finishReason || 'STOP'}):`, text.substring(0, 500));
    return parseAiJson(text);
  } catch (err) {
    if (err.geminiStatus != null) {
      // Câu gốc của Google chỉ ở log máy chủ (đã lọc khoá API); người dùng nhận câu tiếng Việt qua buildAiErrorPayload.
      console.error(`[AI Chat] Gemini lỗi ${err.geminiStatus}:`, String(err.providerMessage || err.message).slice(0, 500));
    }
    throw err;
  }
}

export default { runChat };
