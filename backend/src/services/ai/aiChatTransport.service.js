import { extractGeminiUsage } from '../../utils/geminiClient.util.js';
import { parseAiJson } from '../../utils/aiJsonParse.util.js';
import uploadController from '../../controllers/upload.controller.js';
import axios from 'axios';
import { extractTextFromBuffer } from '../../utils/fileParser.util.js';
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

  // Hàm đọc và đính kèm một file vào parts array
  const attachFileToParts = async (parts, file) => {
    try {
      const buffer = await uploadController.readTempFileBuffer(file.tempId, file.originalName);
      const mimeType = String(file.contentType || '').toLowerCase();
      if (mimeType.startsWith('image/')) {
        parts.push({ inlineData: { mimeType: file.contentType, data: buffer.toString('base64') } });
      } else {
        const extractedText = await extractTextFromBuffer(buffer, file.originalName, file.contentType);
        if (extractedText.trim()) {
          parts.push({
            text: `[Nội dung tệp đính kèm: "${file.originalName}"]:\n${extractedText}\n[Hết nội dung tệp: "${file.originalName}"]`,
          });
        }
      }
    } catch (err) {
      console.warn(`Could not read file ${file.tempId} for AI:`, err.message);
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
      (history[history.length - 1]?.files || []).map((f) => f.tempId)
    );
    for (const file of files) {
      if (!historyFileIds.has(file.tempId)) {
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

    const text = (result.candidates[0].content?.parts || [])
      .filter((p) => p.text && !p.thought)
      .map((p) => p.text)
      .join('');
    if (!text) throw new Error('AI trả về kết quả rỗng.');

    console.log('[AI Chat] Gemini response (first 500 chars):', text.substring(0, 500));
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
