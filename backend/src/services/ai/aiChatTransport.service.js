import { extractGeminiUsage } from '../../utils/geminiClient.util.js';
import { parseAiJson } from '../../utils/aiJsonParse.util.js';
import uploadController from '../../controllers/upload.controller.js';
import axios from 'axios';
import * as fileParserUtil from '../../utils/fileParser.util.js';

const {
  extractTextFromBuffer,
  PDF_INLINE_MAX_BYTES = 10 * 1024 * 1024,
  PDF_INLINE_BUDGET_BYTES = 15 * 1024 * 1024,
} = fileParserUtil;
const isPdfFile =
  fileParserUtil.isPdfFile ||
  ((name, mime) =>
    String(name || '').toLowerCase().endsWith('.pdf') ||
    String(mime || '').toLowerCase() === 'application/pdf');
import { attachGoogleUrlParts } from '../../utils/googleUrlFetch.util.js';
import aiUsageMeter from './aiUsageMeter.service.js';
import { resolveAllowedModel } from './aiModelPolicy.service.js';

/**
 * Shared Gemini chat transport — builds history, attaches files, calls API.
 * Moved out of aiCampaign.service.js (god-object split PR4).
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
            const sizeMb = Math.round(buffer.length / (1024 * 1024));
            parts.push({
              text: `[Tệp đính kèm "${fileName}" là PDF dạng ảnh (scan) nặng ${sizeMb} MB, vượt giới hạn 10 MB nên không đọc được. Hãy nói cho người dùng biết và đề nghị nén tệp, tách nhỏ, hoặc gửi ảnh từng trang]`,
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

  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  const modelName = await resolveAllowedModel(userId, requestedModel);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  try {
    const { maxOutputTokens } = await aiUsageMeter.reserve(userId, {
      contents: geminiHistory,
      systemInstruction: { parts: [{ text: systemPrompt }] },
      model: modelName,
      requestedMaxOutputTokens: 8192,
    });

    const { data: result } = await axios.post(url, {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: geminiHistory,
      generationConfig: { responseMimeType: 'application/json', temperature: 0.7, maxOutputTokens },
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 120000 });

    if (!result.candidates || result.candidates.length === 0) {
      if (result.promptFeedback?.blockReason) {
        throw new Error(`Yêu cầu bị chặn: ${result.promptFeedback.blockReason}`);
      }
      throw new Error('AI không phản hồi, vui lòng thử lại.');
    }

    const candidate = result.candidates[0];
    const finishReason = candidate?.finishReason;

    if (finishReason === 'MAX_TOKENS') {
      console.warn('[AI Chat] Gemini response truncated (finishReason=MAX_TOKENS)');
      await aiUsageMeter.record(userId, extractGeminiUsage(result), {
        feature: 'smart_chat',
        model: modelName,
      }).catch(() => {});
      throw new Error('AI trả lời quá dài bị cắt, hãy rút ngắn yêu cầu.');
    }

    const text = (candidate.content?.parts || [])
      .filter((p) => p.text && !p.thought)
      .map((p) => p.text)
      .join('');
    if (!text) throw new Error('AI trả về kết quả rỗng.');

    console.log(`[AI Chat] Gemini response (first 500 chars, finishReason=${finishReason || 'STOP'}):`, text.substring(0, 500));
    await aiUsageMeter.record(userId, extractGeminiUsage(result), {
      feature: 'smart_chat',
      model: modelName,
    });
    return parseAiJson(text);
  } catch (err) {
    if (err.response) {
      console.error('Gemini API Error Detail:', JSON.stringify(err.response.data, null, 2));
      throw new Error(`Gemini API Error (${err.response.status}): ${JSON.stringify(err.response.data)}`);
    }
    throw err;
  }
}

export default { runChat };
