/**
 * Ranh giới Google GIẢ cho các spec luồng trợ lý (processSmartChat → `runChat`).
 *
 * Các spec này từng giả `axios.post` làm ranh giới Google của `runChat`. Từ G2.3 (03/10/2026) `runChat` đi qua
 * `generateGeminiContent` (lõi dùng chung), nên ranh giới giả chuyển lên đó. Hàm này trả về đúng HÌNH DẠNG kết quả của lõi
 * (`{ text, finishReason, blockReason, usage, modelUsed, raw }`) từ phản hồi viết theo kiểu cũ `axiosPost(url, body)` → `{ data }`,
 * nhờ vậy mọi ca cũ — vốn đọc `axiosPost.mock.calls[..][1]` (systemInstruction / contents / generationConfig) và đặt
 * `axiosPost.mockResolvedValue({ data: { candidates } })` — giữ nguyên, mà không phải viết lại hàng chục assertion.
 *
 * Hành vi THẬT của lõi (khoá API ở header, thử lại, model dự phòng, hết giờ, JSON mode, hội thoại nhiều lượt) KHÔNG kiểm ở đây:
 * xem `utils/__tests__/geminiClient.util.spec.js` và `aiChatTransport.service.spec.js` (fetch giả bằng `Response` thật).
 */
export function createBrainGeminiAdapter({ axiosPost, extractGeminiUsage }) {
  return async function brainGenerateGeminiContent(args = {}) {
    const generationConfig = { temperature: args.temperature, maxOutputTokens: args.maxOutputTokens };
    if (args.jsonMode) generationConfig.responseMimeType = 'application/json';

    const reply = await axiosPost(
      `https://generativelanguage.googleapis.com/v1beta/models/${args.model}:generateContent`,
      { systemInstruction: args.systemInstruction, contents: args.contents, generationConfig },
    );
    const data = reply?.data ?? {};
    const candidate = data.candidates?.[0];

    return {
      text: (candidate?.content?.parts || []).filter((p) => p?.text && !p.thought).map((p) => p.text).join(''),
      finishReason: candidate?.finishReason,
      blockReason: data.promptFeedback?.blockReason,
      usage: extractGeminiUsage(data),
      modelUsed: args.model,
      raw: data,
    };
  };
}
