import customChatDocumentRepository from '../../repositories/ai/customChatDocument.repository.js';
import { extractTextFromBuffer } from '../../utils/fileExtractor.util.js';

class CustomChatService {
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

    const defaultSystem = 'Bạn là một trợ lý AI hữu ích, thân thiện và chính xác. Trả lời bằng tiếng Việt.';
    const systemPrompt = systemInstruction || defaultSystem;
    const prompt = `Hệ thống: ${systemPrompt}${ragContext}\n\n${history.map((message) => `${message.role === 'user' ? 'Người dùng' : 'Trợ lý'}: ${message.content}`).join('\n')}\n\nTrợ lý:`;
    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    if (!apiKey) {
      const error = new Error('GEMINI_API_KEY not configured');
      error.status = 500;
      throw error;
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: temperature || 0.7,
          maxOutputTokens: Math.min(maxTokens || 2048, 65536),
        },
      }),
    });

    const data = await response.json();

    if (data.error) {
      const error = new Error(data.error.message);
      error.status = 500;
      throw error;
    }

    return {
      content: data.candidates?.[0]?.content?.parts?.[0]?.text || 'Xin lỗi, tôi không có câu trả lời.',
      type: 'text',
    };
  }

  async searchChunks({ chatbotId, userId, query }) {
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

    const text = await extractTextFromBuffer(file.buffer, file.originalname);

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
      source: file.originalname,
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

export default new CustomChatService();
