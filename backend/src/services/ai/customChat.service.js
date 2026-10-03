import customChatDocumentRepository from '../../repositories/ai/customChatDocument.repository.js';
import { extractTextFromBuffer } from '../../utils/fileExtractor.util.js';
import { stripMarkdown } from '../../utils/aiResponseFormatter.util.js';
import { generateGeminiContent } from '../../utils/geminiClient.util.js';
import { CHAT_REPLY_BUDGET } from '../../utils/aiReplyBudget.util.js';
import { scrapeUrlWithJs } from '../../utils/puppeteerScraper.util.js';
import { assertPublicUrl, isSsrfBlockedError, safeFetch } from '../../utils/ssrfGuard.util.js';
import aiUsageMeter from './aiUsageMeter.service.js';
import { resolveAllowedModel } from './aiModelPolicy.service.js';
import { getResponseStyleInstruction } from '../../utils/chatbotResponseStyle.util.js';
import chatAttachmentService from '../chatbot/chatAttachment.service.js';
import { chunkText as splitIntoChunks } from '../../utils/kbChunker.util.js';
import { CUSTOM_CHATBOT_MIN_SIMILARITY, MAX_KB_CHUNKS, capChunkTexts } from '../../utils/ragLimits.util.js';
import { decodeUploadFilename } from '../../utils/uploadFilename.util.js';
import businessProfileService from './businessProfile.service.js';

function isImageUnsupportedError(err) {
  const msg = String(err?.message || '').toLowerCase();
  const status = err?.geminiStatus ?? err?.status;
  // Only vision-related 400s: must mention inline_data/image AND unsupported/invalid wording.
  // Do NOT treat every HTTP 400 as image failure (content-policy 400s must surface).
  if (status !== 400) return false;
  const mentionsVision = msg.includes('inline_data') || msg.includes('inline data');
  const mentionsImagePart = /\bimage\b/.test(msg) && (
    msg.includes('unsupported') ||
    msg.includes('not supported') ||
    msg.includes('invalid') ||
    msg.includes('mime')
  );
  return mentionsVision || mentionsImagePart;
}

function stripInlineDataParts(parts) {
  const textOnly = (parts || []).filter((p) => !p?.inline_data);
  const hasImagePlaceholder = textOnly.some((p) => String(p?.text || '').includes('[Không đọc được ảnh đính kèm]'));
  if (!hasImagePlaceholder) {
    textOnly.push({ text: '[Không đọc được ảnh đính kèm]' });
  }
  return textOnly.length ? textOnly : [{ text: '[Không đọc được ảnh đính kèm]' }];
}

class CustomChatService {
  /**
   * Gọi Gemini qua lõi dùng chung (`generateGeminiContent`).
   * Accepts either legacy `prompt` (string) or multimodal `parts` (array).
   *
   * G2.2 (03/10/2026). Bản cũ gọi `fetch` thô: thử lại 5xx + lỗi mạng nhưng KHÔNG thử lại 429, không có model dự phòng,
   * và 3 lượt × 30 giây chạm trần 100 giây của Cloudflare (widget quay vòng vòng). Giờ: thử lại 429/5xx/lỗi mạng, chuyển
   * model dự phòng do super admin chọn, và cả lượt (kể cả lượt bỏ ảnh) gói trong ngân sách 25 giây có huỷ fetch thật.
   * Phần thinkingBudget 0 → nới trần khi model chỉ-thinking từ chối do lõi gánh.
   *
   * @returns {Promise<{ text: string, usage: object, modelUsed: string }>}
   */
  async callGeminiWithRetry(promptOrParts, options = {}) {
    const { temperature = 0.7, maxTokens = 2048, userId = null } = options;
    const model = await resolveAllowedModel(userId, process.env.GEMINI_MODEL || 'gemini-2.5-flash');
    const fallbackModel = await aiUsageMeter.resolveFallbackModel();

    let parts;
    if (Array.isArray(promptOrParts)) {
      parts = promptOrParts;
    } else {
      parts = [{ text: String(promptOrParts ?? '') }];
    }

    const startedAt = Date.now();
    const callOnce = async (requestParts) => {
      // Lượt thứ hai (bỏ ảnh) dùng PHẦN CÒN LẠI của ngân sách, không phải 25 giây mới.
      const budgetLeftMs = Math.max(CHAT_REPLY_BUDGET.totalTimeoutMs - (Date.now() - startedAt), 1);
      const result = await generateGeminiContent({
        parts: requestParts,
        model,
        fallbackModel,
        temperature,
        topP: null, // đường này chưa bao giờ gửi topP — giữ nguyên
        maxOutputTokens: Math.min(maxTokens, 65536),
        thinkingBudget: 0,
        ...CHAT_REPLY_BUDGET,
        timeoutMs: budgetLeftMs,
        totalTimeoutMs: budgetLeftMs,
      });
      return { text: result.text, usage: result.usage, modelUsed: result.modelUsed };
    };

    try {
      return await callOnce(parts);
    } catch (err) {
      // Vision fallback: drop images once on 400 related to inline_data/image
      const hasInline = parts.some((p) => p?.inline_data);
      if (hasInline && isImageUnsupportedError(err)) {
        console.warn('[Gemini] Image not supported by model, retrying text-only:', err.message);
        try {
          return await callOnce(stripInlineDataParts(parts));
        } catch (retryErr) {
          if (retryErr.status == null) retryErr.status = 500;
          throw retryErr;
        }
      }
      if (err.status == null) err.status = 500;
      throw err;
    }
  }

  async chat({
    history,
    chatbotId,
    userId,
    systemInstruction,
    extraSystemNote,
    responseStyle,
    temperature,
    maxTokens,
    attachments = [],
    attachmentBind = null,
  }) {
    if (!history || !Array.isArray(history) || history.length === 0) {
      const error = new Error('history is required');
      error.status = 400;
      throw error;
    }

    // Hồ sơ doanh nghiệp + sản phẩm ĐANG BÁN của chủ chatbot (cùng khối đường kênh Zalo/Telegram/WhatsApp đưa vào prompt,
    // chatRouter.service.js). Thiếu khối này thì widget nhúng và trang /chat không biết tên, giá, link sản phẩm.
    // Chạy song song với tra tài liệu; lỗi hồ sơ không được làm hỏng câu trả lời → rơi về ''.
    const profilePromise = userId != null
      ? Promise.resolve()
        .then(() => businessProfileService.getFormattedProfileForPrompt(userId))
        .catch((e) => {
          console.warn('[CustomChat] business profile failed:', e?.message || e);
          return '';
        })
      : Promise.resolve('');

    let ragContext = '';
    try {
      const lastUserMessage = [...history].reverse().find((message) => message.role === 'user')?.content || '';
      if (lastUserMessage) {
        // Trần khi dựng prompt (A P0-3): mỗi đoạn ≤ 1.500 ký tự, tổng ≤ 6.000 — đoạn cũ chưa nạp lại vẫn bị cắt.
        const chunks = capChunkTexts(await this.searchChunks({ chatbotId, userId, query: lastUserMessage }));
        if (chunks.length > 0) {
          ragContext = `\n\nTài liệu tham khảo từ Knowledge Base:\n${chunks.map((chunk) => `- ${chunk}`).join('\n')}`;
        }
      }
    } catch (e) {
      console.warn('[CustomChat] RAG search failed:', e.message);
    }

    const defaultSystem = `Bạn là một trợ lý AI hữu ích, thân thiện và chính xác. Trả lời bằng tiếng Việt.

QUY TẮC TRẢ LỜI:
- LUON tra loi bang VAN BAN THUAN, KHONG dung bat ky dinh dang markdown nao
- Khong dung **bold**, *italic*, __underline__, ~~strikethrough~~
- Khong dung \`code\`, \`\`\`code block\`\`\`, # heading, - bullet, 1. numbered list
- Neu can danh sach, chi dung dau gach ngang hoac so thu tu (1, 2, 3)
- Neu can nhan manh thong tin quan trọng, chi can VIET HOA hoac THEM DAU HAI CHAM
- Tra loi ngắn gọn, rõ ràng, dễ đọc
- Neu co link, HIEN THI LINK URL day du dang van ban thuan (VD: Ten trang: https://example.com)
- Khong dung link markdown dang [ten](https://example.com)
- Neu khong biet, noi "Toi khong chắc chắn, vui long lien he ho tro"`;

    const baseSystemRaw = systemInstruction || defaultSystem;
    // Phong cach tra loi (custom_chatbots.response_style): chi noi them khi caller truyen vao,
    // khong truyen thi prompt giu nguyen nhu cu.
    const baseSystem = responseStyle
      ? `${baseSystemRaw}\n\n## PHONG CACH TRA LOI\n${getResponseStyleInstruction(responseStyle)}`
      : baseSystemRaw;
    const systemPrompt = extraSystemNote?.trim()
      ? `${baseSystem}\n\n${extraSystemNote.trim()}`
      : baseSystem;
    const profileContext = String((await profilePromise) || '').trim();
    const profileBlock = profileContext ? `\n\n${profileContext}` : '';
    const prompt = `Hệ thống: ${systemPrompt}${ragContext}${profileBlock}\n\n${history.map((message) => `${message.role === 'user' ? 'Người dùng' : 'Trợ lý'}: ${message.content}`).join('\n')}\n\nTrợ lý:`;

    const resolveBind = attachmentBind || (userId != null && chatbotId
      ? { chatbotId, uid: userId }
      : null);

    let attachmentParts = [];
    try {
      // History may already include current turn; avoid double-counting currentAttachments
      const historyWithoutTrailingCurrent = [...history];
      const last = historyWithoutTrailingCurrent[historyWithoutTrailingCurrent.length - 1];
      const currentFromHistory = last?.role === 'user' ? (last.attachments || []) : [];
      const current = (attachments?.length ? attachments : currentFromHistory);

      // Strip current-turn attachments from history so they are treated as latest
      if (last?.role === 'user' && (attachments?.length || currentFromHistory.length)) {
        historyWithoutTrailingCurrent[historyWithoutTrailingCurrent.length - 1] = {
          ...last,
          attachments: [],
        };
      }

      attachmentParts = await chatAttachmentService.buildAiPartsFromHistory({
        history: historyWithoutTrailingCurrent,
        currentAttachments: current,
        resolveBind,
      });
    } catch (e) {
      console.warn('[CustomChat] buildAiParts failed:', e.message);
      if (e.status) throw e;
    }

    const parts = [{ text: prompt }, ...attachmentParts];

    try {
      const model = await resolveAllowedModel(userId, process.env.GEMINI_MODEL || 'gemini-2.5-flash');
      const contents = [{ role: 'user', parts }];
      const { maxOutputTokens } = await aiUsageMeter.reserve(userId, {
        contents,
        model,
        requestedMaxOutputTokens: maxTokens,
      });
      const rawContent = await this.callGeminiWithRetry(parts, { temperature, maxTokens: maxOutputTokens, userId });
      const content = stripMarkdown(rawContent?.text || 'Xin lỗi, tôi không có câu trả lời.');
      await aiUsageMeter.record(userId, rawContent?.usage, {
        feature: 'kb_chat',
        // Model THẬT đã trả lời (có thể là model dự phòng), không phải model hệ thống.
        model: rawContent?.modelUsed || model,
      });

      return {
        content,
        type: 'text',
      };
    } catch (err) {
      // providerMessage = câu gốc của Google khi lõi đã đổi `message` sang câu tiếng Việt cho khách.
      console.error('[CustomChat] Gemini call failed:', err.providerMessage || err.message);

      // Return user-friendly error
      if (err.name === 'AbortError' || err.message.includes('timeout')) {
        const error = new Error('AI đang bận, vui lòng thử lại sau vài giây.');
        error.status = 503;
        error.code = 'TIMEOUT';
        throw error;
      }

      if (err.status === 503) {
        const error = new Error('AI gặp sự cố tạm thời, vui lòng thử lại.');
        error.status = 503;
        error.code = 'UPSTREAM_ERROR';
        throw error;
      }

      throw err;
    }
  }

  /**
   * Tìm các đoạn tài liệu liên quan tới câu hỏi của khách.
   *
   * Đường widget/trang công khai/"Chat thử" Studio dùng CHÍNH hàm tìm của đường kênh Zalo/Telegram/WhatsApp
   * (`searchChunksByChatbot`: cosine trên embedding của đoạn, cùng ngưỡng) — cùng một bot trả lời giống nhau ở mọi kênh.
   * Bản cũ gọi `searchByEmbedding()`, một hàm rỗng luôn trả [] (A P1-3, D-17): lời gọi embed câu hỏi tốn tiền vô ích rồi mọi
   * lượt rơi về chấm điểm từ khoá, nơi đoạn khổng lồ chứa gần như mọi từ nên LUÔN thắng.
   *
   * Từ khoá chỉ còn là dự phòng khi KHÔNG có embedding để so: (a) embed câu hỏi lỗi → tìm từ khoá trên mọi đoạn;
   * (b) cosine không có đoạn nào đủ giống → chỉ tìm từ khoá trong các đoạn CHƯA có embedding (tài liệu nạp lúc embedding hỏng).
   */
  async searchChunks({ chatbotId, userId, query }) {
    let queryEmbedding = null;
    try {
      const { embedText } = await import('../../utils/embeddingClient.util.js');
      queryEmbedding = await embedText(query, {
        userId,
        feature: 'embedding_rag_query',
        taskType: 'RETRIEVAL_QUERY',
      });
    } catch (embedError) {
      console.warn('[CustomChat] Embed câu hỏi lỗi, dùng tìm kiếm từ khoá:', embedError.message);
    }

    if (Array.isArray(queryEmbedding) && queryEmbedding.length > 0) {
      const results = await customChatDocumentRepository.searchChunksByChatbot(
        chatbotId,
        userId,
        queryEmbedding,
        { limit: MAX_KB_CHUNKS, minSimilarity: CUSTOM_CHATBOT_MIN_SIMILARITY },
      );
      if (results.length > 0) return results.map((row) => row.chunk_text);
      return this._keywordSearchChunks({ chatbotId, userId, query, onlyWithoutEmbedding: true });
    }

    return this._keywordSearchChunks({ chatbotId, userId, query, onlyWithoutEmbedding: false });
  }

  async _keywordSearchChunks({ chatbotId, userId, query, onlyWithoutEmbedding }) {
    const words = String(query || '').toLowerCase().split(/\s+/).filter((word) => word.length > 2);
    if (words.length === 0) return [];

    const chunkTexts = await customChatDocumentRepository.findChunkTexts({
      chatbotId,
      userId,
      ...(onlyWithoutEmbedding ? { onlyWithoutEmbedding: true } : {}),
    });
    if (!chunkTexts.length) return [];

    return chunkTexts
      .map((text) => {
        const lowerText = text.toLowerCase();
        return { text, score: words.filter((word) => lowerText.includes(word)).length };
      })
      .filter((chunk) => chunk.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_KB_CHUNKS)
      .map((chunk) => chunk.text);
  }

  async uploadDocument({ chatbotId, userId, file }) {
    if (!file) {
      const error = new Error('No file uploaded');
      error.status = 400;
      throw error;
    }

    // multer giải mã tên tệp bằng latin1 → tên có dấu thành "chuyÃªn" (A P3-1): khôi phục UTF-8 trước khi lưu/hiển thị.
    const cleanName = decodeUploadFilename(file.originalname)
      .trim()
      .normalize('NFC');

    // userId = chủ chatbot: OCR (ảnh / PDF quét) gọi Gemini và ghi token `kb_ocr` cho chủ này, không trừ credit.
    const text = await extractTextFromBuffer(file.buffer, cleanName, { userId });

    if (!text || text.trim().length < 10) {
      const error = new Error('Could not extract text from file');
      error.status = 400;
      throw error;
    }

    const chunks = await this._replaceKnowledgeDocument({
      chatbotId,
      ownerUserId: userId,
      sourceType: 'file',
      sourceKey: cleanName,
      title: cleanName,
      text,
    });

    return {
      message: `Đã xử lý ${chunks.length} đoạn từ file`,
      chunks: chunks.length,
      preview: chunks.slice(0, 3).join('\n\n').substring(0, 500),
    };
  }

  /**
   * Embed các đoạn của MỘT tài liệu. Hỏng thì NÉM LỖI (tài liệu → `status='error'` kèm lý do tiếng Việt, hoặc khôi phục bản
   * cũ khi nạp lại) thay vì trả [] cho tài liệu vẫn `ready` (A P2-8, D-12): bản cũ `return embedTexts(...)` không `await` nên
   * `catch` là mã chết, và một đoạn lỗi khiến cả tài liệu không có vector — Zalo/Telegram/WhatsApp (lọc `embedding IS NOT NULL`)
   * KHÔNG BAO GIỜ dùng tài liệu đó mà chủ không hay biết.
   *
   * Không đặt tiền tố `[chỉ số]` trước văn bản: nó làm vector dính số thứ tự (chèn một đoạn là mọi đoạn sau đổi) và làm bộ
   * nhớ đệm vô dụng (D-24).
   */
  async generateEmbeddings(chunks, userId) {
    // Môi trường không có khoá Gemini (máy dev): chạy chế độ từ khoá, không có vector.
    if (!process.env.GEMINI_API_KEY) return [];

    try {
      const { embedTexts } = await import('../../utils/embeddingClient.util.js');
      const vectors = await embedTexts(chunks, {
        userId,
        feature: 'embedding_custom_chat_doc',
      });
      const complete = Array.isArray(vectors)
        && vectors.length === chunks.length
        && vectors.every((vector) => Array.isArray(vector) && vector.length > 0);
      if (!complete) throw new Error('Số vector trả về không khớp số đoạn');
      return vectors;
    } catch (e) {
      console.error('[CustomChat] Embedding tài liệu lỗi:', e.message);
      const error = new Error(
        'Không tạo được chỉ mục tìm kiếm cho tài liệu (dịch vụ AI đang bận hoặc quá tải). Vui lòng thử tải lại tài liệu sau ít phút.'
      );
      error.status = 503;
      error.code = 'EMBEDDING_FAILED';
      error.cause = e;
      throw error;
    }
  }

  async getDocuments(chatbotId, ownerUserId) {
    return customChatDocumentRepository.listDocuments(chatbotId, ownerUserId);
  }

  async getDocumentById(chatbotId, ownerUserId, documentId) {
    const doc = await customChatDocumentRepository.getDocumentById(documentId, chatbotId, ownerUserId);
    if (!doc) {
      const error = new Error('Document not found');
      error.status = 404;
      throw error;
    }
    return doc;
  }

  async deleteDocument(chatbotId, ownerUserId, docId) {
    const { withKbQuotaLock } = await import('../storage/kbQuota.service.js');
    const decodedDocId = decodeURIComponent(docId);
    return withKbQuotaLock(ownerUserId, async ({ client }) => {
      const numericId = Number(decodedDocId);
      let doc = Number.isSafeInteger(numericId) && numericId > 0
        ? await customChatDocumentRepository.findDocumentById(
          chatbotId, ownerUserId, numericId, client, { forUpdate: true }
        )
        : null;
      if (!doc && Number.isSafeInteger(numericId) && numericId > 0) {
        doc = await customChatDocumentRepository.findDocumentByLegacyChunkId(
          chatbotId, ownerUserId, numericId, client
        );
      }
      if (!doc) {
        doc = await customChatDocumentRepository.findDocumentBySource(
          chatbotId, ownerUserId, decodedDocId, client, { forUpdate: true }
        );
      }
      if (!doc) throw new Error('Document not found');
      await customChatDocumentRepository.deleteDocument(doc.id, chatbotId, ownerUserId, client);
      return true;
    });
  }

  async addTextDocument({ chatbotId, userId, title, content }) {
    if (!content || !content.trim()) {
      const error = new Error('Content is required');
      error.status = 400;
      throw error;
    }

    const cleanTitle = title ? title.trim().normalize('NFC') : 'Text Document';
    const text = content.trim();
    const chunks = await this._replaceKnowledgeDocument({
      chatbotId,
      ownerUserId: userId,
      sourceType: 'text',
      sourceKey: cleanTitle,
      title: cleanTitle,
      text,
    });

    return {
      message: `Đã xử lý ${chunks.length} đoạn từ văn bản`,
      chunks: chunks.length,
    };
  }

  /**
   * Scrape URL and extract content
   * Uses Puppeteer for JavaScript-rendered sites, falls back to simple fetch
   */
  async scrapeUrl({ chatbotId, userId, url }) {
    if (!url || !url.trim()) {
      const error = new Error('URL is required');
      error.status = 400;
      throw error;
    }

    // Validate URL
    let normalizedUrl;
    try {
      normalizedUrl = new URL(url);
    } catch {
      const err = new Error('URL không hợp lệ');
      err.status = 400;
      throw err;
    }

    // Only allow http/https
    if (!['http:', 'https:'].includes(normalizedUrl.protocol)) {
      const err = new Error('Chỉ hỗ trợ URL http:// hoặc https://');
      err.status = 400;
      throw err;
    }

    // Chống SSRF: host phải công khai (chặn localhost, mạng nội bộ, metadata cloud, tên container...)
    // TRƯỚC khi mở trình duyệt hay gửi request.
    try {
      await assertPublicUrl(url);
    } catch (guardErr) {
      if (isSsrfBlockedError(guardErr)) {
        console.warn(`[KB] Chặn URL không công khai (${guardErr.reason || 'blocked'}): ${url}`);
        throw guardErr;
      }
      const error = new Error(`Không thể truy cập URL: ${guardErr.message}`);
      error.status = 503;
      throw error;
    }

    let text;
    let title;
    let pages = 1;
    let usedPuppeteer = false;

    // Try Puppeteer first for JS-rendered content
    try {
      console.log(`[KB] Scraping with Puppeteer: ${url}`);
      const result = await scrapeUrlWithJs(url, {
        waitForTimeout: 2000,
      });

      text = result.content;
      title = result.title || '';
      usedPuppeteer = true;
      console.log(`[KB] Puppeteer extracted ${text?.length || 0} chars`);
    } catch (puppeteerErr) {
      // Trang (hoặc redirect của nó) trỏ vào địa chỉ nội bộ → dừng, không thử lại bằng fetch.
      if (isSsrfBlockedError(puppeteerErr)) {
        console.warn(`[KB] Chặn điều hướng tới địa chỉ không công khai khi cào: ${url}`);
        throw puppeteerErr;
      }
      console.warn(`[KB] Puppeteer failed for ${url}: ${puppeteerErr.message}, falling back to simple fetch`);
      usedPuppeteer = false;

      // Fallback to simple fetch — safeFetch kiểm lại host ở mọi chặng redirect và ghim IP đã kiểm.
      try {
        const response = await safeFetch(url, {
          timeoutMs: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; UKnowBot/1.0; +https://uknow.vn)',
            'Accept': 'text/html,application/xhtml+xml',
          },
        });

        if (!response.ok) {
          const err = new Error(`Không thể truy cập URL: HTTP ${response.status}`);
          err.status = 503;
          throw err;
        }

        const html = await response.text();
        text = this.extractTextFromHtml(html);
        title = normalizedUrl.hostname.replace(/^www\./, '');
      } catch (fetchErr) {
        if (isSsrfBlockedError(fetchErr)) throw fetchErr;
        if (fetchErr.code === 'ETIMEDOUT') {
          const error = new Error('Yêu cầu hết thời gian (15 giây)');
          error.status = 503;
          throw error;
        }
        if (fetchErr.status) throw fetchErr;
        const error = new Error(`Không thể truy cập URL: ${fetchErr.message}`);
        error.status = 503;
        throw error;
      }
    }

    if (!text || text.trim().length < 50) {
      const err = new Error('Không tìm thấy nội dung văn bản trong URL này');
      err.status = 422;
      throw err;
    }

    // Generate title if not set by Puppeteer
    if (!title) {
      const hostname = normalizedUrl.hostname.replace(/^www\./, '');
      const path = normalizedUrl.pathname.replace(/\/$/, '').split('/').pop() || '';
      title = path ? `${hostname} - ${path}` : hostname;
    }

    const chunks = await this._replaceKnowledgeDocument({
      chatbotId,
      ownerUserId: userId,
      sourceType: 'url',
      sourceKey: url,
      title: title.substring(0, 200),
      text: text.trim(),
    });

    return {
      message: `Đã xử lý ${chunks.length} đoạn từ URL${usedPuppeteer ? ' (rendered JS)' : ''}`,
      chunks: chunks.length,
      pages,
    };
  }

  /**
   * Extract clean text from HTML
   */
  extractTextFromHtml(html) {
    if (!html) return '';

    let text = html
      // Remove scripts and styles first
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');

    // Extract text from various HTML elements - keep content from common text containers
    // Handle meta tags for descriptions
    const metaDescription = text.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    let metaText = metaDescription ? metaDescription[1] + '. ' : '';

    // Handle data attributes that might contain text
    text = text.replace(/data-value=["']([^"']+)["']/gi, ' $1 ')
               .replace(/data-text=["']([^"']+)["']/gi, ' $1 ')
               .replace(/alt=["']([^"']+)["']/gi, ' $1 ')
               .replace(/title=["']([^"']+)["']/gi, ' $1 ')
               .replace(/aria-label=["']([^"']+)["']/gi, ' $1 ')
               .replace(/placeholder=["']([^"']+)["']/gi, ' $1 ');

    // Replace block elements with newlines (expanded list)
    text = text
      .replace(/<\/(p|div|h[1-6]|li|tr|th|td|article|section|header|footer|main|aside|blockquote|pre|ul|ol|table|nav|figure|figcaption)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<p[^>]*>/gi, '\n')
      .replace(/<h[1-6][^>]*>/gi, '\n');

    // Replace inline elements with spaces
    text = text.replace(/<\/(span|a|strong|b|em|i|u|mark|small|sub|sup|code|var)>/gi, ' ');

    // Remove all remaining HTML tags
    text = text.replace(/<[^>]+>/g, ' ');

    // Decode HTML entities
    text = text
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));

    // Clean up whitespace - be more aggressive
    text = text
      .replace(/\n{3,}/g, '\n\n')  // Max 2 newlines
      .replace(/[ \t]{2,}/g, ' ')  // Max 1 space
      .replace(/[ \t]*\n[ \t]*/g, '\n')  // Trim around newlines
      .trim();

    // Combine meta description with extracted text for more content
    text = metaText + text;

    return text;
  }

  async _replaceKnowledgeDocument({ chatbotId, ownerUserId, sourceType, sourceKey, title, text }) {
    const {
      countExtractedChars,
      withKbQuotaLock,
    } = await import('../storage/kbQuota.service.js');
    let claimed;
    try {
      claimed = await withKbQuotaLock(ownerUserId, async ({ client, assertDelta }) => {
        const previous = await customChatDocumentRepository.findDocumentBySource(
          chatbotId, ownerUserId, sourceKey, client, { forUpdate: true }
        );
        const previousCounted = previous && previous.status !== 'error';
        const extractedChars = countExtractedChars(text);
        assertDelta({
          documentDelta: previousCounted ? 0 : 1,
          charDelta: extractedChars - (previousCounted ? Number(previous.extracted_chars || 0) : 0),
        });
        const document = await customChatDocumentRepository.upsertProcessingDocument({
          chatbotId,
          ownerUserId,
          sourceType,
          sourceKey,
          title,
          contentText: text,
          extractedChars,
        }, client);
        return { document, previous };
      });

      const chunks = this.chunkText(text);
      const embeddings = await this.generateEmbeddings(chunks, ownerUserId);
      await withKbQuotaLock(ownerUserId, async ({ client }) => {
        const current = await customChatDocumentRepository.findDocumentById(
          chatbotId, ownerUserId, claimed.document.id, client, { forUpdate: true }
        );
        if (!current) throw new Error('Document not found');
        await customChatDocumentRepository.replaceChunks({
          documentId: current.id,
          chatbotId,
          userId: ownerUserId,
          chunks,
          embeddings,
          source: sourceKey,
        }, client);
        await customChatDocumentRepository.markReady(current.id, chunks.length, client);
      });
      return chunks;
    } catch (error) {
      if (claimed?.document) {
        await withKbQuotaLock(ownerUserId, async ({ client }) => {
          if (claimed.previous) {
            await customChatDocumentRepository.restoreDocument(claimed.previous, client);
          } else {
            await customChatDocumentRepository.markError(
              claimed.document.id, error.message, client
            );
          }
        }).catch((cleanupError) => {
          console.error('[CustomChat] Failed to compensate KB catalog:', cleanupError.message);
        });
      }
      throw error;
    }
  }

  /**
   * Chia văn bản thành các đoạn ≤ 1.500 ký tự (mục tiêu ~1.100, chồng lấn ~150) — xem `utils/kbChunker.util.js`.
   * Bản cũ chỉ tách ở dòng trống và giữ nguyên đoạn văn dài: tài liệu không có dòng trống thành MỘT đoạn hàng trăm nghìn ký tự.
   */
  chunkText(text, options = {}) {
    return splitIntoChunks(text, options);
  }
}

export default new CustomChatService();
