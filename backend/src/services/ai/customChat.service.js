import customChatDocumentRepository from '../../repositories/ai/customChatDocument.repository.js';
import { extractTextFromBuffer } from '../../utils/fileExtractor.util.js';
import { stripMarkdown } from '../../utils/aiResponseFormatter.util.js';
import { extractGeminiUsage, isThinkingBudgetRejection, joinGeminiTextParts } from '../../utils/geminiClient.util.js';
import { scrapeUrlWithJs } from '../../utils/puppeteerScraper.util.js';
import aiUsageMeter from './aiUsageMeter.service.js';
import { resolveAllowedModel } from './aiModelPolicy.service.js';
import chatAttachmentService from '../chatbot/chatAttachment.service.js';

/** Timeout for Gemini API calls (30 seconds) */
const GEMINI_TIMEOUT_MS = 30000;

/** Retry configuration for transient errors */
const RETRY_CONFIG = {
  maxRetries: 2,
  retryDelayMs: 1000,
  retryableErrors: ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'ENETUNREACH', 'EAI_AGAIN'],
};

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
   * Call Gemini API with timeout and retry logic.
   * Accepts either legacy `prompt` (string) or multimodal `parts` (array).
   */
  async callGeminiWithRetry(promptOrParts, options = {}) {
    const { temperature = 0.7, maxTokens = 2048, userId = null } = options;
    const apiKey = process.env.GEMINI_API_KEY;
    const model = await resolveAllowedModel(userId, process.env.GEMINI_MODEL || 'gemini-2.5-flash');

    if (!apiKey) {
      const error = new Error('GEMINI_API_KEY not configured');
      error.status = 500;
      throw error;
    }

    let parts;
    if (Array.isArray(promptOrParts)) {
      parts = promptOrParts;
    } else {
      parts = [{ text: String(promptOrParts ?? '') }];
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const doFetch = async (requestParts, { disableThinking = false } = {}) => {
      const maxOut = Math.min(maxTokens, 65536);
      const generationConfig = {
        temperature,
        maxOutputTokens: disableThinking ? Math.max(maxOut, 3072) : maxOut,
      };
      if (!disableThinking) {
        generationConfig.thinkingConfig = { thinkingBudget: 0 };
      }

      const body = JSON.stringify({
        contents: [{ parts: requestParts }],
        generationConfig,
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const error = new Error(errorData?.error?.message || `Gemini API error: ${response.status}`);
          // Keep client-facing status as before this feature: 5xx→502, else→500.
          // Preserve raw Gemini status only for internal fallback decisions.
          error.geminiStatus = response.status;
          error.status = response.status >= 500 ? 502 : 500;
          throw error;
        }

        const data = await response.json();
        if (data.error) {
          const error = new Error(data.error.message);
          error.status = 500;
          throw error;
        }

        return {
          text: joinGeminiTextParts(data.candidates?.[0]?.content?.parts),
          usage: extractGeminiUsage(data),
        };
      } catch (err) {
        // Thinking-fallback: one shot inside doFetch — does not consume RETRY_CONFIG slots.
        if (!disableThinking && isThinkingBudgetRejection(err)) {
          return doFetch(requestParts, { disableThinking: true });
        }
        throw err;
      } finally {
        clearTimeout(timeoutId);
      }
    };

    let lastError;
    let imageFallbackDone = false;
    let currentParts = parts;

    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
      try {
        return await doFetch(currentParts);
      } catch (err) {
        lastError = err;

        // Vision fallback: drop images once on 400 related to inline_data/image
        const hasInline = currentParts.some((p) => p?.inline_data);
        if (!imageFallbackDone && hasInline && isImageUnsupportedError(err)) {
          console.warn('[Gemini] Image not supported by model, retrying text-only:', err.message);
          currentParts = stripInlineDataParts(currentParts);
          imageFallbackDone = true;
          attempt -= 1; // don't consume a network retry slot
          continue;
        }

        const isRetryable =
          err.name === 'AbortError' ||
          (err.geminiStatus >= 500) ||
          RETRY_CONFIG.retryableErrors.some((e) => err.message?.includes(e) || err.code === e);

        if (isRetryable && attempt < RETRY_CONFIG.maxRetries) {
          console.warn(`[Gemini] Attempt ${attempt + 1} failed (${err.message}), retrying...`);
          await sleep(RETRY_CONFIG.retryDelayMs * (attempt + 1));
          continue;
        }

        if (err.geminiStatus >= 500) {
          err.status = 502;
        } else if (err.status == null) {
          err.status = 500;
        }
        throw err;
      }
    }

    throw lastError;
  }

  async chat({
    history,
    chatbotId,
    userId,
    systemInstruction,
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

    let ragContext = '';
    try {
      const lastUserMessage = [...history].reverse().find((message) => message.role === 'user')?.content || '';
      if (lastUserMessage) {
        const chunks = await this.searchChunks({ chatbotId, userId, query: lastUserMessage });
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

    const systemPrompt = systemInstruction || defaultSystem;
    const prompt = `Hệ thống: ${systemPrompt}${ragContext}\n\n${history.map((message) => `${message.role === 'user' ? 'Người dùng' : 'Trợ lý'}: ${message.content}`).join('\n')}\n\nTrợ lý:`;

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
        model,
      });

      return {
        content,
        type: 'text',
      };
    } catch (err) {
      console.error('[CustomChat] Gemini call failed:', err.message);

      // Return user-friendly error
      if (err.name === 'AbortError' || err.message.includes('timeout')) {
        const error = new Error('AI đang bận, vui lòng thử lại sau vài giây.');
        error.status = 504;
        error.code = 'TIMEOUT';
        throw error;
      }

      if (err.status === 502) {
        const error = new Error('AI gặp sự cố tạm thời, vui lòng thử lại.');
        error.status = 502;
        error.code = 'UPSTREAM_ERROR';
        throw error;
      }

      throw err;
    }
  }

  async searchChunks({ chatbotId, userId, query }) {
    try {
      // Try embedding-based search first
      const { embedText } = await import('../../utils/embeddingClient.util.js');
      const queryEmbedding = await embedText(query, {
        userId,
        feature: 'embedding_rag_query',
      });
      const results = await customChatDocumentRepository.searchByEmbedding({
        chatbotId,
        userId,
        queryEmbedding,
        minSimilarity: 0.35, // Lower threshold for better recall
        limit: 5,
      });
      if (results.length > 0) {
        console.log(`[RAG] Found ${results.length} relevant chunks for query: "${query.substring(0, 50)}..."`);
        return results.map(r => r.chunk_text);
      }
    } catch (embedError) {
      console.warn('[CustomChat] Embedding search failed, falling back to keyword search:', embedError.message);
    }

    // Fallback: keyword matching
    const words = query.toLowerCase().split(/\s+/).filter((word) => word.length > 2);
    if (words.length === 0) return [];

    const chunkTexts = await customChatDocumentRepository.findChunkTexts({ chatbotId, userId });
    if (!chunkTexts.length) return [];

    const scored = chunkTexts.map((text) => {
      const lowerText = text.toLowerCase();
      const score = words.filter((word) => lowerText.includes(word)).length;
      return { text, score };
    });

    return scored
      .filter((chunk) => chunk.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((chunk) => chunk.text);
  }

  async uploadDocument({ chatbotId, userId, file }) {
    if (!file) {
      const error = new Error('No file uploaded');
      error.status = 400;
      throw error;
    }

    const rawName = file.originalname;
    const cleanName = rawName
      .trim()
      .normalize('NFC');

    const text = await extractTextFromBuffer(file.buffer, cleanName);

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

  async generateEmbeddings(chunks, userId) {
    if (!process.env.GEMINI_API_KEY) return [];

    try {
      const { embedTexts } = await import('../../utils/embeddingClient.util.js');
      return embedTexts(chunks.map((chunk, index) => `[${index}] ${chunk}`), {
        userId,
        feature: 'embedding_custom_chat_doc',
      });
    } catch (e) {
      console.warn('[CustomChat] Embedding failed, using text only:', e.message);
      return [];
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
      console.warn(`[KB] Puppeteer failed for ${url}: ${puppeteerErr.message}, falling back to simple fetch`);
      usedPuppeteer = false;

      // Fallback to simple fetch
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; UKnowBot/1.0; +https://uknow.vn)',
            'Accept': 'text/html,application/xhtml+xml',
          },
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          const err = new Error(`Không thể truy cập URL: HTTP ${response.status}`);
          err.status = 502;
          throw err;
        }

        const html = await response.text();
        text = this.extractTextFromHtml(html);
        title = normalizedUrl.hostname.replace(/^www\./, '');
      } catch (fetchErr) {
        if (fetchErr.name === 'AbortError') {
          const error = new Error('Yêu cầu hết thời gian (15 giây)');
          error.status = 504;
          throw error;
        }
        if (fetchErr.status) throw fetchErr;
        const error = new Error(`Không thể truy cập URL: ${fetchErr.message}`);
        error.status = 502;
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

      const chunks = this.chunkText(text, 500);
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

  chunkText(text, chunkSize = 500) {
    const paragraphs = text.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
    const chunks = [];
    let buffer = '';

    for (const paragraph of paragraphs) {
      if (buffer.length + paragraph.length + 1 <= chunkSize) {
        buffer += (buffer ? '\n\n' : '') + paragraph;
      } else {
        if (buffer) chunks.push(buffer);
        buffer = paragraph;
      }
    }
    if (buffer) chunks.push(buffer);

    return chunks;
  }
}

/** Helper function for sleep/delay */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default new CustomChatService();
