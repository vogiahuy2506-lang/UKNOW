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
import { assertOwnedStorageKey } from '../../utils/storageKey.util.js';
import { fenceUntrustedContent, UNTRUSTED_CONTENT_NOTICE } from '../../utils/untrustedContent.util.js';
import aiUsageMeter from './aiUsageMeter.service.js';
import { resolveAllowedModel } from './aiModelPolicy.service.js';

/**
 * Một lượt trợ lý được chờ TỐI ĐA 85 giây — GỒM cả thử lại và model dự phòng (`totalTimeoutMs` của lõi Gemini huỷ fetch đúng hạn).
 *
 * Trợ lý chat vẫn là MỘT request đồng bộ (không đọc luồng như sinh/sửa landing), mà /api đi thẳng Cloudflare → backend và Cloudflare cắt ở
 * 100 giây. Bản G2 giữ 120 giây (đúng timeout axios cũ) nên một lượt Google chậm vẫn bị Cloudflare cắt (524) trong khi server chạy tiếp,
 * ghi phiên và TRỪ credit; khách bấm lại bị trừ lần hai (D-09). 85 giây chừa ~15 giây cho đọc tệp đính kèm, ghi phiên, mạng. Quá hạn → lõi ném
 * AI_TIMEOUT (câu tiếng Việt "AI phản hồi quá lâu, thử lại", qua `buildAiErrorPayload`) → controller trả lỗi TRƯỚC khi trừ credit.
 */
export const ASSISTANT_TIMEOUT_MS = 85000;

// Tin "marker" của wizard: `[wizard]{"gate":"dataSource","value":"sheet","sheetUrl":"…"}\n<câu đọc được>`. Cùng khuôn
// WIZARD_MARKER_RE ở aiCampaignWizard.service.js (không import: kéo cả module wizard vào transport, và nhiều spec mock từng phần).
// Marker mang `sheetUrl` để model dùng URL cho node read_sheet — KHÔNG phải yêu cầu "hãy đọc nội dung sheet".
const WIZARD_MARKER_FIRST_LINE_RE = /^\[wizard\]\{/;
const isWizardMarkerContent = (content) => WIZARD_MARKER_FIRST_LINE_RE.test(String(content || '').split('\n')[0].trim());
// Không import extractGoogleUrls từ googleUrlFetch.util.js: nhiều spec mock util đó chỉ với `attachGoogleUrlParts`.
const GOOGLE_DOC_OR_SHEET_URL_RE = /https:\/\/docs\.google\.com\/(?:spreadsheets|document)\/d\//;
const isImageFile = (file) => String(file?.contentType || '').toLowerCase().startsWith('image/');
// Cùng khuôn `isSpreadsheetFile` ở aiCampaignWizard.service.js (không import vì lý do như trên): tệp bảng tính Excel/CSV.
const isSpreadsheetFile = (file) => {
  const name = String(file?.originalName || file?.name || '').toLowerCase();
  const mime = String(file?.contentType || '').toLowerCase();
  return name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')
    || mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv');
};
// Nạp LƯỜI (chỉ khi `summarizeRecipientLists`): bộ tóm tắt kéo theo bộ đọc người nhận (exceljs, papaparse, bộ đọc .xls) — các nơi
// gọi `runChat` khác (chat thường, trợ lý admin, viết chỉ dẫn) và nhiều spec không cần và không nên bị nạp theo.
let recipientListSummaryModule = null;
const loadRecipientListSummary = async () => {
  recipientListSummaryModule ||= await import('./recipientListSummary.service.js');
  return recipientListSummaryModule;
};

const droppedFilesNote = (names) => ({
  text: `[Tệp đính kèm ở tin này (${names.map((n) => `"${n}"`).join(', ')}) đã được xử lý ở lượt trước và KHÔNG được gửi lại nội dung — có thể chứa dữ liệu cá nhân của khách. Chỉ dựa vào thông tin đã có trong hội thoại và khối CAMPAIGN_BRIEF; không đoán nội dung tệp. Cần xem lại thì đề nghị người dùng đính kèm lại ở tin mới]`,
});
const droppedGoogleUrlNote = () => ({
  text: '[Liên kết Google Sheet/Docs trong tin này chỉ còn là đường dẫn: nội dung đã được đọc ở lượt trước và KHÔNG gửi lại (có thể chứa dữ liệu cá nhân của khách). Vẫn dùng đường dẫn khi cần (vd node read_sheet); không đoán nội dung, cần xem lại thì nhờ người dùng dán lại ở tin mới]',
});

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
 * @param {number|null} [params.userId] — người thao tác (actor): tính credit/token, chọn model
 * @param {number|null} [params.ownerUserId] — CHỦ workspace: tệp theo `storage_key` chỉ được đọc khi nằm dưới
 *   `uploads/<ownerUserId>/` (C P1-1: khoá do client gửi mà không kiểm chủ thì đọc được tệp của workspace khác).
 *   Thiếu thì rơi về `userId` (đúng với chủ; nhân viên gọi mà quên truyền sẽ KHÔNG đọc được tệp của chủ — hỏng theo
 *   hướng an toàn, không phải hướng lộ tệp).
 * @param {string|null} [params.requestedModel]
 * @param {'current'|'images'|'all'} [params.historyAttachments] — tệp/liên kết Google của các tin user CŨ có được đính lại cho
 *   Gemini không (C P1-6, 03/10/2026). Mặc định `'current'`: chỉ tin user CUỐI (lượt hiện tại) được đính tệp + tải nội dung URL
 *   Google. Trước đây MỌI tin user trong lịch sử đều bị đính lại ở mọi lượt: danh sách người nhận (Sheet ≤300 dòng, tệp Excel/CSV
 *   nguyên văn) — tên/SĐT/email khách cuối — đi sang Google ở mọi lượt LLM còn lại của phiên (bên XỬ LÝ dữ liệu theo NĐ 13 không
 *   được gửi nhiều hơn mức cần), và tốn token lặp. Tin cũ chỉ còn một dòng báo "đã xử lý, không gửi lại" để model không tưởng
 *   là không có tệp. `'images'`: như `'current'` nhưng ẢNH ở tin cũ vẫn đính lại — dành cho brief `attached_file` + ảnh, nơi ảnh
 *   là nguồn nội dung DUY NHẤT và chỉ có bytes (brief chỉ ghi "AI đọc trực tiếp từ dữ liệu ảnh", không có chữ để lưu).
 *   `'all'`: hành vi cũ (đính lại tất cả) — chỉ trợ lý super admin dùng, vì hỏi-đáp nhiều lượt trên một tài liệu cần lại tệp cũ
 *   mà nhánh đó không có brief để lưu bản trích.
 * @param {string[]} [params.excludeGoogleUrls] — URL Google Sheet ĐÃ chọn làm nguồn người nhận: không bao giờ tải nội dung vào prompt.
 * @param {string} [params.feature='smart_chat'] — tên tính năng ghi vào sổ token (`usage_logs`) VÀ sổ lỗi bền (`ai_call_events`). Mặc định 'smart_chat'
 *   (trợ lý chiến dịch); các nơi gọi khác (vd viết chỉ dẫn chatbot) truyền tên riêng để chi phí/lỗi không lẫn với trợ lý (D-23).
 * @param {number|null} [params.actorUserId] — người bấm thật khi `userId` là CHỦ workspace (ghi vào metadata sổ token). Thiếu = không ghi.
 * @param {boolean} [params.summarizeRecipientLists] — (C P1-6 (d), 04/10/2026) wizard đang ở bước nguồn người nhận (Sheet/tệp): tệp
 *   Excel/CSV và link Google Sheet ở TIN HIỆN TẠI mà bộ đọc người nhận tất định nhận ra là DANH SÁCH NGƯỜI NHẬN thì KHÔNG đính
 *   nguyên văn (tới 300 dòng Sheet / cả tệp không trần — tên/SĐT/email khách cuối) mà chỉ đính bản tóm tắt: số email/SĐT hợp lệ, số
 *   dòng bị loại, tên cột, vài dòng mẫu đã che. Bảng không nhận ra là danh sách người nhận (bảng giá, sản phẩm) vẫn đính nguyên văn.
 *   Mặc định false: chat thường / trợ lý admin hỏi-đáp tài liệu cần nội dung thật.
 */
export async function runChat({
  systemPrompt,
  history = [],
  files = [],
  userId = null,
  ownerUserId = null,
  requestedModel = null,
  historyAttachments = 'current',
  excludeGoogleUrls = [],
  summarizeRecipientLists = false,
  feature = 'smart_chat',
  actorUserId = null,
} = {}) {
  const fileOwnerId = ownerUserId ?? userId;
  const googleUrlCache = new Map();
  // Ngân sách inline PDF dạng ảnh (scan) cho cả lịch sử lẫn tin hiện tại của một request. Từ khi tin cũ không còn đính lại
  // (`historyAttachments` mặc định 'current') chỉ tin hiện tại tiêu ngân sách này, nên tệp mới nhất luôn được ưu tiên.
  let inlinePdfBudget = PDF_INLINE_BUDGET_BYTES;

  // Hàm đọc và đính kèm một file vào parts array
  const attachFileToParts = async (parts, file) => {
    const fileName = file.originalName || 'tệp';
    try {
      let buffer = null;
      if (file.tempId) {
        buffer = await uploadController.readTempFileBuffer(file.tempId, file.originalName);
      } else if (file.storage_key || file.storageKey) {
        // Khoá do CLIENT gửi (history[].files[].storage_key) — chỉ đọc tệp của chính workspace này. Khoá lạ ném 403 và
        // rơi xuống catch bên dưới (log + câu "không đọc được", y hệt tệp không tồn tại nên không lộ tệp có thật hay không).
        const key = assertOwnedStorageKey(file.storage_key || file.storageKey, fileOwnerId);
        buffer = await uploadController.readFileBufferByKey(key);
      }
      if (!buffer || buffer.length === 0) return;
      const mimeType = String(file.contentType || '').toLowerCase();
      if (mimeType.startsWith('image/')) {
        parts.push({ inlineData: { mimeType: file.contentType, data: buffer.toString('base64') } });
      } else {
        if (summarizeRecipientLists && isSpreadsheetFile(file)) {
          const { summarizeRecipientListBuffer } = await loadRecipientListSummary();
          const summary = await summarizeRecipientListBuffer(buffer, file.originalName, file.contentType, { sourceLabel: `tệp ${JSON.stringify(fileName)}` });
          if (summary) {
            parts.push({ text: summary });
            return;
          }
        }
        const extractedText = await extractTextFromBuffer(buffer, file.originalName, file.contentType);
        if (extractedText.trim()) {
          // C P1-4 (d): chữ trong tệp là DỮ LIỆU người dùng đưa vào, không phải mệnh lệnh cho trợ lý — gắn rào quanh khối.
          parts.push({
            text: fenceUntrustedContent(`Nội dung tệp đính kèm: "${fileName}"`, extractedText, `Hết nội dung tệp: "${fileName}"`),
          });
        } else if (isPdfFile(file.originalName, mimeType)) {
          if (buffer.length <= PDF_INLINE_MAX_BYTES && buffer.length <= inlinePdfBudget) {
            parts.push({
              text: `[Tệp đính kèm "${fileName}" là PDF dạng ảnh (scan) — nội dung nằm trong tệp PDF ngay sau đây, hãy đọc trực tiếp. ${UNTRUSTED_CONTENT_NOTICE}]`,
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

  // Tin user CUỐI = lượt hiện tại. Chỉ tin này được đính tệp + tải nội dung URL Google (xem `historyAttachments` ở đầu hàm).
  let currentUserIdx = -1;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i]?.role === 'user') {
      currentUserIdx = i;
      break;
    }
  }

  const googleUrlOptions = { excludeUrls: excludeGoogleUrls };
  if (summarizeRecipientLists) {
    googleUrlOptions.summarizeSheetCsv = async (csvText, info) => {
      const { summarizeRecipientListCsv } = await loadRecipientListSummary();
      return summarizeRecipientListCsv(csvText, { sourceLabel: `Google Sheet "${info.url}"` });
    };
  }

  // Build Gemini history
  const geminiHistory = await Promise.all(history.map(async (msg, idx) => {
    const parts = [{ text: msg.content || '(no text)' }];
    if (msg.role === 'user') {
      const msgFiles = Array.isArray(msg.files) ? msg.files : [];
      // Tin marker wizard KHÔNG bao giờ kéo nội dung Sheet vào prompt, kể cả khi là tin hiện tại: sheetUrl trong marker là
      // nguồn người nhận đã chọn — model chỉ cần URL (read_sheet) + tên cột/số dòng do hệ thống kiểm tất định.
      const isMarker = isWizardMarkerContent(msg.content);
      if (idx === currentUserIdx || historyAttachments === 'all') {
        for (const file of msgFiles) {
          // eslint-disable-next-line no-await-in-loop
          await attachFileToParts(parts, file);
        }
        if (!isMarker) {
          await attachGoogleUrlParts(parts, msg.content, googleUrlCache, googleUrlOptions);
        }
      } else {
        const droppedNames = [];
        for (const file of msgFiles) {
          if (historyAttachments === 'images' && isImageFile(file)) {
            // eslint-disable-next-line no-await-in-loop
            await attachFileToParts(parts, file);
          } else {
            droppedNames.push(file?.originalName || 'tệp');
          }
        }
        if (droppedNames.length > 0) parts.push(droppedFilesNote(droppedNames));
        if (!isMarker && GOOGLE_DOC_OR_SHEET_URL_RE.test(String(msg.content || ''))) parts.push(droppedGoogleUrlNote());
      }
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
      feature,
      ownerUserId: userId,
      actorUserId,
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

    // D-28: KHÔNG in nội dung câu trả lời — nó có thể mang tên/SĐT/email khách (danh sách người nhận, tệp đính kèm) hoặc chỉ dẫn
    // viết hộ của khách. Chỉ ghi độ dài + mã kết thúc + model thật (đủ để dò sự cố cắt cụt / model dự phòng).
    console.log(`[AI Chat] Gemini response (${text.length} chars, finishReason=${result.finishReason || 'STOP'}, model=${result.modelUsed || modelName})`);
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
