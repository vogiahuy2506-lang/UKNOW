import knowledgeBaseRepository from '../../repositories/ai/knowledgeBase.repository.js';
import { embedTexts } from '../../utils/embeddingClient.util.js';
import { extractTextFromBuffer } from '../../utils/fileParser.util.js';
import { chunkText as splitIntoChunks } from '../../utils/kbChunker.util.js';
import kbDocumentQueue from '../queue/kbDocumentQueue.service.js';
import {
  countExtractedChars,
  withKbQuotaLock,
} from '../storage/kbQuota.service.js';

/** Cùng câu với `customChat.generateEmbeddings` (kho tài liệu Studio): người dùng thấy MỘT câu cho mọi đường nạp tài liệu. */
export const KB_EMBEDDING_FAILED_MESSAGE =
  'Không tạo được chỉ mục tìm kiếm cho tài liệu (dịch vụ AI đang bận hoặc quá tải). Vui lòng thử xử lý lại tài liệu sau ít phút.';

class KnowledgeBaseService {
  /**
   * Process a document: extract text → chunk → embed → store.
   * This is the core processing logic used by both direct calls and queue workers.
   *
   * @param {number} docId
   * @param {number} kbId
   * @param {number} userId
   * @param {object} [_options] giữ để khớp payload job BullMQ cũ (`chunkSize`/`chunkingMode` đã bị bỏ qua — xem `_buildChunks`)
   */
  async processDocument(docId, kbId, userId, _options = {}) {
    let doc;
    let previousDocument;
    try {
      const claim = await withKbQuotaLock(userId, async ({ client, assertDelta }) => {
        const current = await knowledgeBaseRepository.findDocumentById(
          docId, userId, client, { forUpdate: true }
        );
        if (!current) throw new Error('Document not found');
        const extractedChars = countExtractedChars(current.content_text);
        const previousChars = Number(current.extracted_chars || 0);
        const previouslyCounted = current.status !== 'error';
        assertDelta({
          documentDelta: previouslyCounted ? 0 : 1,
          charDelta: extractedChars - (previouslyCounted ? previousChars : 0),
        });
        const updated = await knowledgeBaseRepository.updateDocumentStatus(docId, userId, {
          status: 'processing',
          extracted_chars: extractedChars,
        }, client);
        return { previous: current, updated };
      });
      previousDocument = claim.previous;
      doc = claim.updated;

      const text = doc.content_text || '';

      if (!text || text.trim().length < 10) {
        throw new Error('No readable text content found in document');
      }

      const chunks = this._buildChunks(text);

      // Embed all chunks (uses cache for repeated chunks). Hỏng thì NÉM LỖI → khối catch bên dưới đặt tài liệu `status='error'`
      // (hoặc khôi phục bản `ready` cũ khi xử lý lại) và job BullMQ được thử lại. Bản cũ nuốt lỗi, lưu đoạn KHÔNG có vector rồi
      // vẫn đặt `ready`: tìm kiếm chỉ đọc đoạn có vector nên tài liệu đó KHÔNG BAO GIỜ được dùng mà chủ không hay biết (D-12).
      const embeddings = await this._embedChunks(chunks, userId);

      const chunksWithMeta = chunks.map((c, i) => ({
        text: c.text,
        embedding: embeddings[i],
        metadata: { source: doc.title || doc.file_name || 'unknown', chunkIndex: i },
      }));

      const chunkCount = chunks.length;
      await withKbQuotaLock(userId, async ({ client }) => {
        const current = await knowledgeBaseRepository.findDocumentById(
          docId, userId, client, { forUpdate: true }
        );
        if (!current) throw new Error('Document not found');
        await knowledgeBaseRepository.deleteChunksByDocId(docId, client);
        await knowledgeBaseRepository.insertChunksBatched(
          docId, kbId, userId, chunksWithMeta, client
        );
        await knowledgeBaseRepository.updateDocumentStatus(docId, userId, {
          status: 'ready',
          chunk_count: chunkCount,
          content_text: text,
          extracted_chars: countExtractedChars(text),
        }, client);
      });

      // Clear embedding cache for this user after document update
      const { clearUserCache } = await import('../../utils/embeddingCache.util.js');
      clearUserCache(userId);

      console.log(`[KB] Processed doc ${docId}: ${chunkCount} chunks stored`);
      return { docId, chunkCount, status: 'ready' };
    } catch (err) {
      if (doc) {
        await withKbQuotaLock(userId, async ({ client }) => {
          if (previousDocument?.status === 'ready') {
            await knowledgeBaseRepository.updateDocumentStatus(docId, userId, {
              status: previousDocument.status,
              error_message: previousDocument.error_message,
              chunk_count: previousDocument.chunk_count,
              content_text: previousDocument.content_text,
              extracted_chars: previousDocument.extracted_chars,
            }, client);
          } else {
            await knowledgeBaseRepository.deleteChunksByDocId(docId, client);
            await knowledgeBaseRepository.updateDocumentStatus(docId, userId, {
              status: 'error',
              error_message: err.message,
              chunk_count: 0,
              extracted_chars: 0,
            }, client);
          }
        }).catch((cleanupError) => {
          console.error(`[KB] Failed to release quota for doc ${docId}:`, cleanupError.message);
        });
      }
      throw err;
    }
  }

  /**
   * Enqueue document processing to queue (non-blocking).
   * Falls back to direct processing if queue is not available.
   *
   * @param {number} docId
   * @param {number} kbId
   * @param {number} userId
   * @param {object} options
   * @returns {Promise<{enqueued: boolean, jobId: string|null}>}
   */
  async enqueueDocumentProcessing(docId, kbId, userId, options = {}) {
    // First, update status to 'queued'
    await knowledgeBaseRepository.updateDocumentStatus(docId, userId, { status: 'queued' });

    const result = await kbDocumentQueue.enqueueProcessDocument({
      docId,
      kbId,
      userId,
      options,
    });

    if (!result.enqueued) {
      // Fallback: process directly
      console.warn(`[KB] Queue not available, processing doc ${docId} directly`);
      try {
        await this.processDocument(docId, kbId, userId, options);
        return { enqueued: false, jobId: null, processedDirectly: true };
      } catch (err) {
        throw err;
      }
    }

    return result;
  }

  /**
   * Get processing status for a document.
   * @param {number} docId
   * @param {number} userId
   * @param {string|number} [jobId] - optional BullMQ job ID
   * @returns {Promise<object>}
   */
  async getDocumentStatus(docId, userId, jobId = null) {
    const doc = await knowledgeBaseRepository.findDocumentById(docId, userId);
    if (!doc) throw new Error('Document not found');

    const status = {
      docId,
      status: doc.status,
      chunkCount: doc.chunk_count,
      errorMessage: doc.error_message,
      updatedAt: doc.updated_at,
    };

    // If jobId provided, get queue status
    if (jobId && doc.status === 'queued') {
      const queueStatus = await kbDocumentQueue.getJobStatus(jobId);
      if (queueStatus) {
        status.jobId = jobId;
        status.queueStatus = queueStatus.status;
        status.progress = queueStatus.progress;
        status.attempts = queueStatus.attemptsMade;
      }
    }

    return status;
  }

  /**
   * Chia đoạn bằng `kbChunker.util.js` — CÙNG bộ chia với kho tài liệu Studio (đoạn mục tiêu ~1.100, cứng ≤ 1.500 ký tự, chồng lấn
   * ~150, không cắt giữa ký tự). Bản cũ có bộ chia riêng 500 ký tự không chồng lấn (EXTRA-A1).
   *
   * Cột `knowledge_bases.chunk_size` / `chunking_mode` KHÔNG còn được dùng: giao diện chưa từng cho chọn (mặc định DB 500 / 'paragraph'
   * cho mọi KB), và để mặc định 500 chạy tiếp sẽ giữ nguyên đoạn nhỏ hơn hẳn đường Studio. Muốn cho khách chỉnh thì truyền
   * `targetSize` / `maxSize` của `kbChunker` — đừng khôi phục bộ chia cũ.
   */
  _buildChunks(text) {
    return splitIntoChunks(text).map((t) => ({ text: t }));
  }

  /**
   * Embed các đoạn của MỘT tài liệu; thiếu/sai bất kỳ vector nào cũng là lỗi (khuôn `customChat.generateEmbeddings`).
   * Lỗi ném ra mang câu tiếng Việt (hiện ở `kb_documents.error_message`), câu gốc của Google chỉ ở log máy chủ + `cause`.
   */
  async _embedChunks(chunks, userId) {
    try {
      const vectors = await embedTexts(chunks.map((c) => c.text), {
        userId,
        feature: 'embedding_kb_ingest',
      });
      const complete = Array.isArray(vectors)
        && vectors.length === chunks.length
        && vectors.every((vector) => Array.isArray(vector) && vector.length > 0);
      if (!complete) throw new Error('Số vector trả về không khớp số đoạn');
      return vectors;
    } catch (e) {
      console.error('[KB] Embedding tài liệu lỗi:', e.message);
      const error = new Error(KB_EMBEDDING_FAILED_MESSAGE);
      error.status = 503;
      error.code = 'EMBEDDING_FAILED';
      error.cause = e;
      throw error;
    }
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
    return withKbQuotaLock(userId, async ({ client }) => {
      const kb = await knowledgeBaseRepository.findById(id, userId, client, { forUpdate: true });
      if (!kb) return null;
      return knowledgeBaseRepository.delete(id, userId, client);
    });
  }

  // ── Document CRUD ────────────────────────────────────────────────

  async getDocuments(kbId, userId) {
    await this._verifyKbOwnership(kbId, userId);
    return knowledgeBaseRepository.findDocumentsByKb(kbId, userId);
  }

  async addDocument(kbId, userId, {
    title, source_type, source_url, content_text, file_name, file_size, mime_type,
  }) {
    const extractedChars = countExtractedChars(content_text);
    return withKbQuotaLock(userId, async ({ client, assertDelta }) => {
      const kb = await knowledgeBaseRepository.findById(kbId, userId, client, { forUpdate: true });
      if (!kb) throw new Error('Knowledge base not found');
      assertDelta({ documentDelta: 1, charDelta: extractedChars });
      return knowledgeBaseRepository.createDocument(kbId, userId, {
        title, source_type, source_url, content_text, file_name, file_size, mime_type,
        extracted_chars: extractedChars,
      }, client);
    });
  }

  async addFileDocument(kbId, userId, { title, file }) {
    if (!file) {
      const error = new Error('No file uploaded');
      error.status = 400;
      throw error;
    }
    const contentText = await extractTextFromBuffer(
      file.buffer,
      file.originalname,
      file.mimetype
    );
    if (!contentText || contentText.trim().length < 10) {
      const error = new Error('No readable text content found in document');
      error.status = 400;
      throw error;
    }
    return this.addDocument(kbId, userId, {
      title: title || file.originalname,
      source_type: 'file',
      content_text: contentText,
      file_name: file.originalname,
      file_size: file.size,
      mime_type: file.mimetype,
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
    return withKbQuotaLock(userId, async ({ client }) => {
      const doc = await knowledgeBaseRepository.findDocumentById(
        docId, userId, client, { forUpdate: true }
      );
      if (!doc) throw new Error('Document not found');
      return knowledgeBaseRepository.deleteDocument(docId, userId, client);
    });
  }

  async reprocessDocument(docId, userId, options = {}) {
    const doc = await knowledgeBaseRepository.findDocumentById(docId, userId);
    if (!doc) throw new Error('Document not found');
    const kb = await knowledgeBaseRepository.findById(doc.id_kb, userId);
    return this.processDocument(docId, kb.id, userId, options);
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
