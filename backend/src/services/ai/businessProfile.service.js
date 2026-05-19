import businessProfileRepository from '../../repositories/ai/businessProfile.repository.js';
import { embedText, embedTexts } from '../../utils/embeddingClient.util.js';

/** Parse JSON array field — fallback về text nếu không phải JSON. */
function parseArrayField(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

/** Serialize products array thành text đọc được cho AI. */
function serializeProducts(products) {
  const arr = parseArrayField(products);
  if (!arr.length) return '';
  return arr.map((p, i) => {
    const parts = [`${i + 1}. ${p.name || 'Sản phẩm'}`];
    if (p.price) parts.push(`Giá: ${p.price}`);
    if (p.description) parts.push(p.description);
    if (p.usp) parts.push(`Điểm nổi bật: ${p.usp}`);
    return parts.join(' — ');
  }).join('\n');
}

/** Serialize segments array thành text đọc được cho AI. */
function serializeSegments(segments) {
  const arr = parseArrayField(segments);
  if (!arr.length) return '';
  return arr.map((s, i) => {
    const parts = [`${i + 1}. ${s.name || 'Phân khúc'}`];
    if (s.description) parts.push(s.description);
    if (s.painPoint) parts.push(`Vấn đề: ${s.painPoint}`);
    return parts.join(' — ');
  }).join('\n');
}

/**
 * Chuyển hồ sơ doanh nghiệp thành mảng chunks text để embed.
 * Hỗ trợ cả text thuần và JSON array cho products/target_audience.
 */
function buildChunksFromProfile(profile) {
  const chunks = [];

  if (profile.company_name) {
    chunks.push({ text: `Tên công ty: ${profile.company_name}`, metadata: { field: 'company_name' } });
  }
  if (profile.industry) {
    chunks.push({ text: `Ngành nghề: ${profile.industry}`, metadata: { field: 'industry' } });
  }

  const productsText = serializeProducts(profile.products) || (typeof profile.products === 'string' ? profile.products : '');
  if (productsText) {
    chunks.push({ text: `Sản phẩm / Dịch vụ:\n${productsText}`, metadata: { field: 'products' } });
  }

  const segmentsText = serializeSegments(profile.target_audience) || (typeof profile.target_audience === 'string' ? profile.target_audience : '');
  if (segmentsText) {
    chunks.push({ text: `Đối tượng khách hàng mục tiêu:\n${segmentsText}`, metadata: { field: 'target_audience' } });
  }

  if (profile.tone || profile.brand_color) {
    const brandParts = [];
    if (profile.tone) brandParts.push(`Giọng điệu: ${profile.tone}`);
    if (profile.brand_color) brandParts.push(`Màu thương hiệu: ${profile.brand_color}`);
    chunks.push({ text: `Nhận diện thương hiệu — ${brandParts.join(', ')}`, metadata: { field: 'brand' } });
  }
  if (profile.extra_context) {
    const paragraphs = profile.extra_context.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
    paragraphs.forEach((para, i) => {
      chunks.push({ text: para, metadata: { field: 'extra_context', index: i } });
    });
  }
  return chunks;
}

class BusinessProfileService {
  /**
   * Lưu hồ sơ doanh nghiệp và re-embed toàn bộ chunks.
   * @param {number} userId
   * @param {object} profileData
   * @returns {Promise<object>} profile đã lưu
   */
  async saveProfile(userId, profileData) {
    // Serialize array fields thành JSON string trước khi lưu
    const normalized = { ...profileData };
    if (Array.isArray(normalized.products)) normalized.products = JSON.stringify(normalized.products);
    if (Array.isArray(normalized.target_audience)) normalized.target_audience = JSON.stringify(normalized.target_audience);
    const profile = await businessProfileRepository.upsert(userId, normalized);

    // Re-embed chunks — không throw nếu embedding lỗi (pgvector/API có thể chưa sẵn sàng)
    try {
      const chunks = buildChunksFromProfile(profile);
      if (chunks.length > 0) {
        const embeddings = await embedTexts(chunks.map(c => c.text));
        const chunksWithEmbeddings = chunks.map((c, i) => ({ ...c, embedding: embeddings[i] }));
        await businessProfileRepository.deleteChunksByUserId(userId);
        await businessProfileRepository.insertChunks(userId, chunksWithEmbeddings);
      }
    } catch (e) {
      console.warn('[BusinessProfile] Embedding không khả dụng, bỏ qua RAG chunks:', e?.message || e);
    }

    return profile;
  }

  /**
   * Lấy hồ sơ doanh nghiệp của user.
   * @param {number} userId
   * @returns {Promise<object|null>}
   */
  async getProfile(userId) {
    return businessProfileRepository.findByUserId(userId);
  }

  /**
   * RAG: Tìm context phù hợp nhất với prompt của user để bơm vào Gemini.
   * Trả về string context sẵn sàng chèn vào system prompt.
   *
   * @param {number} userId
   * @param {string} userPrompt
   * @returns {Promise<string>} context string (rỗng nếu chưa có hồ sơ)
   */
  async getContextForPrompt(userId, userPrompt) {
    // Kiểm tra user có hồ sơ chưa
    const profile = await businessProfileRepository.findByUserId(userId);
    if (!profile) return '';

    // Embed query của user
    const queryEmbedding = await embedText(userPrompt);

    // Tìm top-5 chunks liên quan nhất
    const relevantChunks = await businessProfileRepository.searchSimilarChunks(userId, queryEmbedding, 5);
    if (!relevantChunks.length) return '';

    const contextLines = relevantChunks
      .filter(c => c.similarity > 0.5) // chỉ lấy chunk thực sự liên quan
      .map(c => `- ${c.chunk_text}`);

    if (!contextLines.length) return '';

    return [
      `=== THÔNG TIN DOANH NGHIỆP CỦA KHÁCH HÀNG (dùng để cá nhân hóa nội dung) ===`,
      ...contextLines,
      `=== HẾT THÔNG TIN DOANH NGHIỆP ===`,
    ].join('\n');
  }

  /**
   * Gộp toàn bộ field hồ sơ thành một khối text (khi không dùng được RAG hoặc RAG không trả chunk đủ liên quan).
   * @param {object|null} profile
   * @returns {string}
   */
  formatProfileForPrompt(profile) {
    if (!profile) return '';
    const lines = [];
    if (profile.company_name) lines.push(`Tên công ty: ${profile.company_name}`);
    if (profile.industry) lines.push(`Ngành: ${profile.industry}`);
    const productsText = serializeProducts(profile.products) || (typeof profile.products === 'string' ? profile.products : '');
    if (productsText) lines.push(`Sản phẩm / dịch vụ:\n${productsText}`);
    const segmentsText = serializeSegments(profile.target_audience) || (typeof profile.target_audience === 'string' ? profile.target_audience : '');
    if (segmentsText) lines.push(`Khách mục tiêu:\n${segmentsText}`);
    if (profile.tone) lines.push(`Giọng điệu: ${profile.tone}`);
    if (profile.brand_color) lines.push(`Màu thương hiệu: ${profile.brand_color}`);
    if (profile.logo_url) lines.push(`Logo URL: ${profile.logo_url}`);
    else lines.push(`Logo URL: (chưa có — dùng text header thay thế)`);
    if (profile.extra_context) lines.push(`Bổ sung: ${profile.extra_context}`);
    if (!lines.length) return '';
    return [
      '=== HỒ SƠ DOANH NGHIỆP (đầy đủ) ===',
      ...lines.map((l) => `- ${l}`),
      '=== HẾT HỒ SƠ ===',
    ].join('\n');
  }

  /**
   * Context cho sinh landing: ưu tiên RAG theo prompt; nếu lỗi / rỗng thì dùng toàn bộ hồ sơ (không phụ thuộc pgvector).
   * @param {number} userId
   * @param {string} userPrompt
   * @returns {Promise<string>}
   */
  async getContextForLandingAi(userId, userPrompt) {
    let rag = '';
    try {
      rag = await this.getContextForPrompt(userId, userPrompt);
    } catch (e) {
      console.warn('[AI Landing] RAG không khả dụng, fallback hồ sơ đầy đủ:', e?.message || e);
    }
    if (String(rag || '').trim()) return rag;
    const profile = await this.getProfile(userId);
    return this.formatProfileForPrompt(profile);
  }
}

export default new BusinessProfileService();
