import businessProfileRepository from '../../repositories/ai/businessProfile.repository.js';
import { embedText, embedTexts } from '../../utils/embeddingClient.util.js';

/**
 * Chuyển hồ sơ doanh nghiệp thành mảng chunks text để embed.
 * Mỗi field là 1 chunk riêng để tìm kiếm chính xác hơn.
 */
function buildChunksFromProfile(profile) {
  const chunks = [];

  if (profile.company_name) {
    chunks.push({ text: `Tên công ty: ${profile.company_name}`, metadata: { field: 'company_name' } });
  }
  if (profile.industry) {
    chunks.push({ text: `Ngành nghề: ${profile.industry}`, metadata: { field: 'industry' } });
  }
  if (profile.products) {
    chunks.push({ text: `Sản phẩm / Dịch vụ: ${profile.products}`, metadata: { field: 'products' } });
  }
  if (profile.target_audience) {
    chunks.push({ text: `Đối tượng khách hàng mục tiêu: ${profile.target_audience}`, metadata: { field: 'target_audience' } });
  }
  if (profile.tone || profile.brand_color) {
    const brandParts = [];
    if (profile.tone) brandParts.push(`Giọng điệu: ${profile.tone}`);
    if (profile.brand_color) brandParts.push(`Màu thương hiệu: ${profile.brand_color}`);
    chunks.push({ text: `Nhận diện thương hiệu — ${brandParts.join(', ')}`, metadata: { field: 'brand' } });
  }
  // extra_context có thể dài — chia theo đoạn văn (~500 ký tự/chunk)
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
    const profile = await businessProfileRepository.upsert(userId, profileData);

    // Re-embed chunks
    const chunks = buildChunksFromProfile(profile);
    if (chunks.length > 0) {
      const embeddings = await embedTexts(chunks.map(c => c.text));
      const chunksWithEmbeddings = chunks.map((c, i) => ({ ...c, embedding: embeddings[i] }));

      await businessProfileRepository.deleteChunksByUserId(userId);
      await businessProfileRepository.insertChunks(userId, chunksWithEmbeddings);
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
}

export default new BusinessProfileService();
