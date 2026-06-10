import customChatDocumentRepository from '../../repositories/ai/customChatDocument.repository.js';
import { extractTextFromBuffer } from '../../utils/fileExtractor.util.js';
import { stripMarkdown } from '../../utils/aiResponseFormatter.util.js';
import usageTrackingService from '../payment/usageTracking.service.js';

/** Timeout for Gemini API calls (30 seconds) */
const GEMINI_TIMEOUT_MS = 30000;

/** Retry configuration for transient errors */
const RETRY_CONFIG = {
  maxRetries: 2,
  retryDelayMs: 1000,
  retryableErrors: ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'ENETUNREACH', 'EAI_AGAIN'],
};

class CustomChatService {
  /**
   * Call Gemini API with timeout and retry logic
   */
  async callGeminiWithRetry(prompt, options = {}) {
    const { temperature = 0.7, maxTokens = 2048 } = options;
    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    if (!apiKey) {
      const error = new Error('GEMINI_API_KEY not configured');
      error.status = 500;
      throw error;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        maxOutputTokens: Math.min(maxTokens, 65536),
      },
    });

    // Retry loop
    let lastError;
    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
      try {
        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          // Retry on 5xx errors
          if (response.status >= 500 && attempt < RETRY_CONFIG.maxRetries) {
            console.warn(`[Gemini] Attempt ${attempt + 1} failed with ${response.status}, retrying...`);
            await sleep(RETRY_CONFIG.retryDelayMs * (attempt + 1));
            continue;
          }
          const error = new Error(errorData?.error?.message || `Gemini API error: ${response.status}`);
          error.status = response.status >= 500 ? 502 : 500;
          throw error;
        }

        const data = await response.json();
        if (data.error) {
          const error = new Error(data.error.message);
          error.status = 500;
          throw error;
        }

        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } catch (err) {
        lastError = err;

        // Check if error is retryable
        const isRetryable =
          err.name === 'AbortError' || // Timeout
          RETRY_CONFIG.retryableErrors.some(e => err.message?.includes(e) || err.code === e);

        if (isRetryable && attempt < RETRY_CONFIG.maxRetries) {
          console.warn(`[Gemini] Attempt ${attempt + 1} failed (${err.message}), retrying...`);
          await sleep(RETRY_CONFIG.retryDelayMs * (attempt + 1));
          continue;
        }

        // Non-retryable error or max retries reached
        throw err;
      }
    }

    // Should not reach here, but just in case
    throw lastError;
  }

  async chat({ history, chatbotId, userId, systemInstruction, temperature, maxTokens }) {
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

    try {
      await usageTrackingService.ensureAvailable(userId, 'ai_credit', 1);
      const rawContent = await this.callGeminiWithRetry(prompt, { temperature, maxTokens });
      const content = stripMarkdown(rawContent || 'Xin lỗi, tôi không có câu trả lời.');
      await usageTrackingService.incrementUsage(userId, 'ai_credit', 1);

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
      const queryEmbedding = await embedText(query);
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

    const chunks = this.chunkText(text, 500);
    const embeddings = await this.generateEmbeddings(chunks);

    await customChatDocumentRepository.replaceChunks({
      chatbotId,
      userId,
      chunks,
      embeddings,
      source: cleanName,
    });

    return {
      message: `Đã xử lý ${chunks.length} đoạn từ file`,
      chunks: chunks.length,
      preview: chunks.slice(0, 3).join('\n\n').substring(0, 500),
    };
  }

  async generateEmbeddings(chunks) {
    if (!process.env.GEMINI_API_KEY) return [];

    try {
      const { embedTexts } = await import('../../utils/embeddingClient.util.js');
      return embedTexts(chunks.map((chunk, index) => `[${index}] ${chunk}`));
    } catch (e) {
      console.warn('[CustomChat] Embedding failed, using text only:', e.message);
      return [];
    }
  }

  async getDocuments(chatbotId) {
    const rows = await customChatDocumentRepository.listDocuments(chatbotId);
    const docsMap = {};

    for (const row of rows) {
      const source = row.source || 'Unknown';
      if (!docsMap[source]) {
        docsMap[source] = {
          id: row.id,
          title: source,
          source: source,
          type: 'file',
          status: 'ready',
          chunk_count: 0,
          created_at: row.created_at,
        };
      }
      docsMap[source].chunk_count += 1;
    }

    return Object.values(docsMap);
  }

  async deleteDocument(chatbotId, docId) {
    const decodedDocId = decodeURIComponent(docId);
    const rows = await customChatDocumentRepository.listDocuments(chatbotId);
    const numericDocId = Number(decodedDocId);
    if (Number.isInteger(numericDocId) && numericDocId > 0) {
      const deletedById = await customChatDocumentRepository.deleteChunksById(chatbotId, numericDocId);
      if (deletedById > 0) return true;
    }
    
    const normalize = (s) => s ? s.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\.docx?$/, '').replace(/\.pdf$/, '').trim() : '';
    const normDocId = normalize(decodedDocId);
    
    const doc = rows.find(r => {
      if (r.source === decodedDocId || String(r.id) === decodedDocId || r.source === docId) return true;
      return normalize(r.source) === normDocId;
    });
    
    if (!doc) {
      console.log('[CustomChat] Delete debug - docId:', docId, 'decoded:', decodedDocId, 'normalized:', normDocId);
      console.log('[CustomChat] Delete debug - available sources:', rows.map(r => r.source));
      throw new Error('Document not found');
    }
    await customChatDocumentRepository.deleteChunksBySource(chatbotId, doc.source);
    return true;
  }

  async addTextDocument({ chatbotId, userId, title, content }) {
    if (!content || !content.trim()) {
      const error = new Error('Content is required');
      error.status = 400;
      throw error;
    }

    const cleanTitle = title ? title.trim().normalize('NFC') : 'Text Document';
    const text = content.trim();
    const chunks = this.chunkText(text, 500);
    const embeddings = await this.generateEmbeddings(chunks);

    await customChatDocumentRepository.replaceChunks({
      chatbotId,
      userId,
      chunks,
      embeddings,
      source: cleanTitle,
    });

    return {
      message: `Đã xử lý ${chunks.length} đoạn từ văn bản`,
      chunks: chunks.length,
    };
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
