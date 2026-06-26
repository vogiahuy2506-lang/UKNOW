import knowledgeBaseRepository from '../../repositories/ai/knowledgeBase.repository.js';
import { embedText, embedTexts } from '../../utils/embeddingClient.util.js';
import { extractTextFromBuffer } from '../../utils/fileParser.util.js';
import uploadController from '../../controllers/upload.controller.js';

const DEFAULT_CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;

/**
 * Chunk text into overlapping segments.
 * @param {string} text
 * @param {number} chunkSize
 * @param {number} overlap
 * @returns {string[]}
 */
function chunkText(text, chunkSize = DEFAULT_CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const paragraphs = text.split(/\n{2,}|\n/).map(s => s.trim()).filter(Boolean);
  const chunks = [];
  let buffer = '';

  for (const para of paragraphs) {
    if (buffer.length + para.length + 1 <= chunkSize) {
      buffer += (buffer ? '\n\n' : '') + para;
    } else {
      if (buffer) chunks.push(buffer);
      buffer = para;
    }
  }
  if (buffer) chunks.push(buffer);

  // Ensure no chunk exceeds chunkSize
  const finalChunks = [];
  for (const chunk of chunks) {
    if (chunk.length <= chunkSize) {
      finalChunks.push(chunk);
    } else {
      // Split long chunk further by sentences
      const sentences = chunk.split(/(?<=[.!?])\s+/);
      let subBuffer = '';
      for (const sentence of sentences) {
        if (subBuffer.length + sentence.length + 1 <= chunkSize) {
          subBuffer += (subBuffer ? ' ' : '') + sentence;
        } else {
          if (subBuffer) finalChunks.push(subBuffer);
          subBuffer = sentence;
        }
      }
      if (subBuffer) finalChunks.push(subBuffer);
    }
  }

  return finalChunks;
}

/**
 * Chunk text by sentences (for 'sentence' mode).
 */
function chunkBySentence(text, chunkSize) {
  const sentences = text.split(/(?<=[.!?。])\s+/).map(s => s.trim()).filter(Boolean);
  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length + sentence.length + 1 <= chunkSize) {
      current += (current ? ' ' : '') + sentence;
    } else {
      if (current) chunks.push(current);
      current = sentence;
    }
  }
  if (current) chunks.push(current);

  return chunks;
}

class KnowledgeBaseService {
  /**
   * Process a document: extract text → chunk → embed → store.
   * @param {number} docId
   * @param {number} kbId
   * @param {number} userId
   * @param {object} options
   */
  async processDocument(docId, kbId, userId, options = {}) {
    const doc = await knowledgeBaseRepository.findDocumentById(docId, userId);
    if (!doc) throw new Error('Document not found');

    await knowledgeBaseRepository.updateDocumentStatus(docId, userId, { status: 'processing' });

    try {
      let text = doc.content_text || '';

      // Nếu là file đã upload, đọc lại từ temp
      if (doc.source_type === 'file' && doc.file_name && !text) {
        try {
          const buffer = await uploadController.readTempFileBuffer(
            `kb_${docId}`, doc.file_name
          );
          text = await extractTextFromBuffer(buffer, doc.file_name, doc.mime_type);
        } catch (e) {
          console.warn(`[KB] Could not read temp file for doc ${docId}:`, e.message);
        }
      }

      if (!text || text.trim().length < 10) {
        throw new Error('No readable text content found in document');
      }

      const chunks = this._buildChunks(text, options.chunkSize || DEFAULT_CHUNK_SIZE, options.chunkingMode);

      // Embed all chunks
      let embeddings;
      try {
        embeddings = await embedTexts(chunks.map(c => c.text), {
          userId,
          feature: 'embedding_kb_ingest',
        });
      } catch (e) {
        console.warn('[KB] Embedding failed, storing without vectors:', e.message);
        embeddings = chunks.map(() => null);
      }

      const chunksWithMeta = chunks.map((c, i) => ({
        text: c.text,
        embedding: embeddings[i],
        metadata: { source: doc.title || doc.file_name || 'unknown', chunkIndex: i },
      }));

      // Remove old chunks and insert new
      await knowledgeBaseRepository.deleteChunksByDocId(docId);
      await knowledgeBaseRepository.insertChunksBatched(docId, kbId, userId, chunksWithMeta);

      const chunkCount = chunks.length;
      await knowledgeBaseRepository.updateDocumentStatus(docId, userId, {
        status: 'ready',
        chunk_count: chunkCount,
        content_text: text.slice(0, 10000),
      });

      console.log(`[KB] Processed doc ${docId}: ${chunkCount} chunks stored`);
    } catch (err) {
      await knowledgeBaseRepository.updateDocumentStatus(docId, userId, {
        status: 'error',
        error_message: err.message,
      });
      throw err;
    }
  }

  _buildChunks(text, chunkSize, chunkingMode) {
    if (chunkingMode === 'sentence') {
      return chunkBySentence(text, chunkSize).map(t => ({ text: t }));
    }
    return chunkText(text, chunkSize, CHUNK_OVERLAP).map(t => ({ text: t }));
  }

  // ── KB CRUD ─────────────────────────────────────────────────────

  async getKBs(userId) {
    return knowledgeBaseRepository.findAllByUser(userId);
  }

  async getKBById(id, userId) {
    return knowledgeBaseRepository.findByIdWithStats(id, userId);
  }

  async createKB(userId, data) {
    return knowledgeBaseRepository.create(userId, data);
  }

  async updateKB(id, userId, data) {
    return knowledgeBaseRepository.update(id, userId, data);
  }

  async deleteKB(id, userId) {
    return knowledgeBaseRepository.delete(id, userId);
  }

  // ── Document CRUD ────────────────────────────────────────────────

  async getDocuments(kbId, userId) {
    await this._verifyKbOwnership(kbId, userId);
    return knowledgeBaseRepository.findDocumentsByKb(kbId, userId);
  }

  async addDocument(kbId, userId, { title, source_type, source_url, content_text, file_name, file_size, mime_type }) {
    await this._verifyKbOwnership(kbId, userId);
    return knowledgeBaseRepository.createDocument(kbId, userId, {
      title, source_type, source_url, content_text, file_name, file_size, mime_type,
    });
  }

  async updateDocument(docId, userId, data) {
    const doc = await knowledgeBaseRepository.findDocumentById(docId, userId);
    if (!doc) throw new Error('Document not found');
    // Only allow updating title for now
    await knowledgeBaseRepository.updateDocumentStatus(docId, userId, {});
    return { ...doc, ...data };
  }

  async deleteDocument(docId, userId) {
    const doc = await knowledgeBaseRepository.findDocumentById(docId, userId);
    if (!doc) throw new Error('Document not found');
    return knowledgeBaseRepository.deleteDocument(docId, userId);
  }

  async reprocessDocument(docId, userId, options = {}) {
    const doc = await knowledgeBaseRepository.findDocumentById(docId, userId);
    if (!doc) throw new Error('Document not found');
    const kb = await knowledgeBaseRepository.findById(doc.id_kb, userId);
    return this.processDocument(docId, kb.id, userId, { chunkSize: kb.chunk_size, chunkingMode: kb.chunking_mode, ...options });
  }

  // ── Chunks ──────────────────────────────────────────────────────

  async getChunks(kbId, userId, options = {}) {
    await this._verifyKbOwnership(kbId, userId);
    return knowledgeBaseRepository.getChunksByKbId(kbId, userId, options);
  }

  // ── Helpers ─────────────────────────────────────────────────────

  async _verifyKbOwnership(kbId, userId) {
    const kb = await knowledgeBaseRepository.findById(kbId, userId);
    if (!kb) throw new Error('Knowledge base not found');
    return kb;
  }
}

export default new KnowledgeBaseService();
