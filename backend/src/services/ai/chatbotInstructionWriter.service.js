import businessProfileService from './businessProfile.service.js';
import { runChat } from './aiChatTransport.service.js';

// PLAN_AI_VIET_HO_CHI_DAN_CHATBOT_2026-09-13.md, mục 3.1 — "AI viết hộ" chỉ dẫn hệ thống cho
// chatbot. Nguyên văn PROMPT (bản chính thức) TRÍCH BẰNG SCRIPT từ
// _internal/PROMPT_AI_VIET_HO_CHI_DAN_CHATBOT_2026-09-13.md (không gõ tay lại, để không sai một
// chữ trong luật — file đó đã qua một vòng rà với sếp, mỗi ràng buộc có lý do ghi kèm ở đó).
// TUYỆT ĐỐI đừng sửa chuỗi này mà không báo lại — xem mục "Việc KHÔNG làm" của plan.
const OFFICIAL_PROMPT_TEMPLATE =
  "Bạn là chuyên gia viết prompt chỉ dẫn (system instruction) cho chatbot AI.\n\nKhách hàng sẽ đưa một gợi ý ngắn — có thể chỉ là tên trợ lý, hoặc một câu mô tả. Nhiệm vụ của\nbạn: tư duy kỹ rồi viết thành một prompt chỉ dẫn hoàn chỉnh cho trợ lý AI đó, thể hiện rõ vai\ntrò, chức năng và tính cách.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nLUẬT ĐẦU RA — đọc trước, quan trọng hơn mọi phần còn lại\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n1. CHỈ trả về nội dung prompt chỉ dẫn. Không thêm lời dẫn, không lời chào, không giải thích,\n   không hỏi lại, không ghi chú ở cuối.\n   TUYỆT ĐỐI KHÔNG viết những câu như \"Đây là prompt của bạn:\" hay \"Hãy copy prompt sau:\".\n\n2. KHÔNG bọc kết quả trong khối mã (```). Trả về văn bản thuần.\n   Ký tự ``` không được xuất hiện ở đầu hay cuối kết quả.\n\n3. Kết quả sẽ được ghi THẲNG vào ô cấu hình của chatbot bằng mã chương trình. Bất kỳ chữ nào\n   không thuộc về prompt chỉ dẫn đều trở thành một phần chỉ dẫn của con chatbot đó.\n\n4. Độ dài: khoảng 300–500 từ, tối đa 600 từ. Chỉ dẫn này được nạp lại ở MỖI tin nhắn của\n   chatbot, nên dài dòng làm mọi câu trả lời chậm hơn và tốn kém hơn, vĩnh viễn.\n   Viết đủ và chặt, đừng viết dài.\n\n5. Ngôn ngữ: viết bằng {{language}}.\n   Ngoại lệ: nếu khách nói rõ trong gợi ý rằng họ muốn ngôn ngữ khác, làm theo yêu cầu đó.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nKHÔNG ĐƯỢC BỊA\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nGợi ý của khách thường rất ngắn. Chỗ nào không biết, ĐỪNG tự nghĩ ra.\n\nTuyệt đối không bịa: tên công ty, tên thương hiệu, số điện thoại, email, địa chỉ, giá,\nchính sách đổi trả/bảo hành, cam kết, số liệu, tên sản phẩm cụ thể.\n\nThay vào đó dùng chỗ trống vuông để khách tự điền, ví dụ: [tên công ty], [số hotline],\n[chính sách đổi trả], [danh sách sản phẩm].\n\nBịa một chính sách không có thật vào chỉ dẫn chatbot nghĩa là con chatbot sẽ nói điều đó với\nkhách hàng thật của họ. Đó là thiệt hại thật, không phải lỗi văn phong.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCẤU TRÚC — năm thành phần, viết đủ cả năm\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n1. ĐỊNH DANH VAI TRÒ (Persona)\n   Chatbot là ai, chuyên môn gì, tính cách thế nào.\n\n2. NHIỆM VỤ CHÍNH (Core Tasks)\n   Chatbot làm gì, nêu theo các bước rõ ràng.\n\n3. GIỌNG ĐIỆU (Tone & Style)\n   Chọn giọng hợp với người dùng mục tiêu: cách xưng hô, mức trang trọng, có dùng thuật ngữ\n   chuyên ngành hay không.\n\n4. GIỚI HẠN / QUY TẮC (Rules)\n   Đặt ranh giới để chatbot không trả lời sai lệch. Bắt buộc có một quy tắc xử lý khi không\n   biết câu trả lời — nói thật là chưa có thông tin và chuyển tiếp cho người thật, thay vì đoán.\n\n5. ĐỊNH DẠNG ĐẦU RA (Output format)\n   Cấu trúc câu trả lời mà chatbot nên theo.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nVÍ DỤ MINH HOẠ — CHỈ để hiểu hình dạng, KHÔNG được sao chép\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nCác ví dụ dưới đây thuộc một lĩnh vực hoàn toàn khác với yêu cầu của khách. Chúng chỉ minh hoạ\nCẤU TRÚC. Tuyệt đối không bê tên riêng, tên tổ chức, hay lĩnh vực trong ví dụ vào kết quả.\n\n- Persona: \"Bạn là [tên trợ lý] — trợ lý ảo tư vấn [lĩnh vực] cho [tên công ty].\"\n- Core Tasks: \"Bước 1: Xác định nhu cầu của khách. Bước 2: Phân tích các phương án phù hợp.\n  Bước 3: Đề xuất 3 lựa chọn tốt nhất kèm lý do.\"\n- Tone & Style: \"Dùng ngôn ngữ thân thiện, dễ hiểu, tránh thuật ngữ chuyên ngành.\n  Xưng hô anh/chị, dùng 'Dạ' / 'Thưa' cho phù hợp.\"\n- Rules: \"Nếu không có thông tin, trả lời 'Tiếc quá, em chưa có thông tin về vấn đề này' rồi\n  chuyển tiếp sang nhân viên. Không đoán, không bịa số liệu.\"\n- Output format: \"Trả lời theo 3 phần: Tóm tắt — Hướng dẫn chi tiết — Gợi ý bước tiếp theo.\"\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nBối cảnh doanh nghiệp của khách (có thể để trống — nếu trống thì dùng chỗ trống vuông):\n{{business_context}}\n\nGợi ý của khách:\n{{user_hint}}";

// PHẢN BIỆN (trước khi code) — runChat() KHÔNG "chỉ cần gọi thẳng" như plan mục 1.2 mô tả.
//
// aiChatTransport.service.js:21 ép `responseMimeType: 'application/json'` khi gọi Gemini, rồi tự
// `parseAiJson(text)` (aiJsonParse.util.js:92) kết quả — trong khi prompt chính thức của tính
// năng này muốn VĂN BẢN THUẦN. Tệ hơn — đây là lỗi thật, không phải chỉ khác kỳ vọng: nếu model
// bọc kết quả trong ``` (đúng thứ Việc 2 phải gỡ), `parseAiJson` sẽ đọc chuỗi ĐÓ là "trông giống
// JSON hỏng" — biến `looksLikeJson` ở dòng 128 của file đó test lại `text` GỐC (còn nguyên dấu
// ``` ở đầu), không phải phần đã tách khỏi cặp fence — và trả về MỘT CÂU XIN LỖI SOẠN SẴN, nuốt
// mất nội dung thật TRƯỚC KHI code làm sạch của Việc 2 kịp chạm vào. Test được:
// `parseAiJson("```markdown\nBạn là...\n```")` trả `{ content: 'Xin lỗi, tôi gặp lỗi định dạng
// khi tạo câu trả lời. Bạn gửi lại yêu cầu giúp tôi nhé.' }`, không phải nội dung bên trong fence.
//
// Không đụng runChat (đúng yêu cầu — nhiều tính năng khác dùng). Cách né: dặn thêm MỘT chỉ dẫn
// KỸ THUẬT (không phải nội dung sáng tạo, không sửa OFFICIAL_PROMPT_TEMPLATE ở trên) yêu cầu
// model bọc kết quả trong một object JSON {"content": "..."}. Ở chế độ JSON, Gemini tự đảm bảo
// cú pháp JSON hợp lệ ở lớp ngoài (tự escape backtick/dấu ngoặc kép/newline bên trong giá trị
// chuỗi) — nên nhánh `JSON.parse` ĐẦU TIÊN trong parseAiJson thành công luôn, nhánh fallback lỗi
// ở trên không bao giờ chạy tới. cleanInstructionOutput() bên dưới vẫn chạy TRÊN GIÁ TRỊ đã lấy
// ra khỏi JSON — nếu model vẫn lỡ nhồi khối mã/câu dẫn NGAY TRONG giá trị đó, code vẫn gỡ được.
const JSON_ENVELOPE_INSTRUCTION = [
  '',
  '━'.repeat(60),
  'ĐỊNH DẠNG PHẢN HỒI KỸ THUẬT — không phải một phần chỉ dẫn chatbot, chỉ để hệ thống đọc',
  '━'.repeat(60),
  '',
  'Trả về ĐÚNG một object JSON, duy nhất một khoá "content", giá trị là toàn văn kết quả theo',
  'mọi luật ở trên. Không thêm khoá nào khác, không thêm chữ nào ngoài object JSON đó.',
].join('\n');

// Câu xin lỗi soạn sẵn của parseAiJson khi nó tưởng nhầm kết quả là JSON hỏng (xem phản biện
// trên). Nếu vì lý do gì đó envelope JSON ở trên không ăn và model vẫn bị parseAiJson đọc nhầm,
// đừng để câu này lọt ra như một chỉ dẫn hợp lệ — coi như rỗng, để rơi vào nhánh 502 bên dưới.
const AI_JSON_PARSE_FALLBACK_MESSAGE =
  'Xin lỗi, tôi gặp lỗi định dạng khi tạo câu trả lời. Bạn gửi lại yêu cầu giúp tôi nhé.';

const LANGUAGE_LABELS = { vi: 'tiếng Việt', en: 'English' };

function badGateway(message) {
  const error = new Error(message);
  error.status = 502;
  return error;
}

// PLAN_..., mục 3.2/Bẫy 2 — chỉ gỡ khi khối mã BỌC TRỌN toàn bộ văn bản (dòng đầu VÀ dòng cuối,
// sau khi trim, đều là fence marker riêng một dòng). Không quét/cắt các dòng ở giữa.
const WRAP_FENCE_OPEN_RE = /^```[a-zA-Z]*\s*$/;
const WRAP_FENCE_CLOSE_RE = /^```\s*$/;

function stripWrappingCodeFence(text) {
  const trimmed = text.trim();
  const lines = trimmed.split('\n');
  if (
    lines.length >= 2 &&
    WRAP_FENCE_OPEN_RE.test(lines[0]) &&
    WRAP_FENCE_CLOSE_RE.test(lines[lines.length - 1])
  ) {
    return lines.slice(1, -1).join('\n');
  }
  return trimmed;
}

// Chỉ gỡ khi câu dẫn đứng MỘT MÌNH ở dòng đầu — chỉ kiểm tra lines[0], không quét toàn bài, để
// không cắt nhầm một chỉ dẫn hợp lệ có nhắc tới chữ "prompt" ở giữa (Bẫy 2 của plan).
// Câu dẫn gần như luôn KẾT THÚC BẰNG DẤU HAI CHẤM ("Hãy copy prompt sau:", "Đây là prompt của
// bạn:"). Bản đầu PR-1 dùng `.*$` nên bắt cả câu mở đầu hợp lệ — review 13/09/2026 thử
// "Đây là trợ lý chuyên hỗ trợ khách viết prompt cho ChatGPT của [tên công ty]." thì MẤT NGUYÊN
// DÒNG ĐỊNH DANH VAI TRÒ, dòng quan trọng nhất của chỉ dẫn. Đòi dấu hai chấm cuối dòng: để lọt một
// câu dẫn hiếm hoi không có dấu hai chấm còn hơn cắt mất vai trò của con chatbot.
const LEAD_IN_LINE_PATTERNS = [
  /^h[aã]y\s+copy\s+.*(?:prompt|frompt).*:\s*$/i,
  /^đây\s+là\s+.*(?:prompt|frompt).*:\s*$/i,
  /^prompt\s*:?\s*$/i,
];

function stripLeadInLine(text) {
  const newlineIndex = text.indexOf('\n');
  const firstLine = (newlineIndex === -1 ? text : text.slice(0, newlineIndex)).trim();
  if (LEAD_IN_LINE_PATTERNS.some((pattern) => pattern.test(firstLine))) {
    return newlineIndex === -1 ? '' : text.slice(newlineIndex + 1);
  }
  return text;
}

/**
 * Làm sạch đầu ra bằng code — prompt chỉ là lời khuyên cho model, không phải ràng buộc (Bẫy 1).
 * Chạy hai lượt để tự chịu được cả hai thứ tự lồng (fence-quanh-câu-dẫn hoặc câu-dẫn-trước-fence).
 *
 * @param {string} rawText
 * @returns {string}
 */
export function cleanInstructionOutput(rawText) {
  let text = String(rawText || '');
  if (text === AI_JSON_PARSE_FALLBACK_MESSAGE) return '';
  for (let pass = 0; pass < 2; pass += 1) {
    text = text.trim();
    text = stripWrappingCodeFence(text);
    text = text.trim();
    text = stripLeadInLine(text);
  }
  return text.trim();
}

/**
 * Dựng systemPrompt đầy đủ: OFFICIAL_PROMPT_TEMPLATE thay 3 biến + envelope JSON kỹ thuật.
 *
 * @param {{language: 'vi'|'en', userHint: string, businessContext: string}} params
 * @returns {string}
 */
export function buildSystemInstructionPrompt({ language, userHint, businessContext }) {
  // Thay bằng HÀM, không bằng chuỗi: String.prototype.replace diễn giải `$$`, `$&`, `` $` ``,
  // `$'` trong chuỗi thay thế kể cả khi mẫu tìm là chuỗi thường. userHint và businessContext là
  // chữ khách tự gõ — review 13/09/2026 đo được: gợi ý chứa `` $` `` làm prompt phình 4303 → 8197
  // ký tự (chèn nguyên phần prompt phía trước vào chỗ gợi ý), `$$` bị nuốt thành `$`.
  const filled = OFFICIAL_PROMPT_TEMPLATE
    .replace('{{language}}', () => LANGUAGE_LABELS[language] || LANGUAGE_LABELS.vi)
    .replace('{{business_context}}', () => businessContext || '')
    .replace('{{user_hint}}', () => userHint);
  return `${filled}\n${JSON_ENVELOPE_INSTRUCTION}`;
}

/**
 * "AI viết hộ" chỉ dẫn hệ thống cho chatbot.
 *
 * @param {{userId: number, hint: string, language?: 'vi'|'en'}} params
 * @returns {Promise<{instruction: string, businessContextUsed: boolean}>}
 */
export async function generateSystemInstruction({ userId, hint, language = 'vi' }) {
  // Bẫy 5 — hồ sơ doanh nghiệp hỏng/rỗng không được chặn tính năng. getFormattedProfileForPrompt
  // (businessProfile.service.js:192) đã tự catch lỗi đọc profile/sản phẩm bên trong, nhưng vẫn
  // .catch() thêm ở đây — cùng khuôn chatRouter.service.js:78/172 đang làm cho chính hàm này.
  const businessContext = await businessProfileService
    .getFormattedProfileForPrompt(userId)
    .catch(() => '');

  const systemPrompt = buildSystemInstructionPrompt({ language, userHint: hint, businessContext });

  const result = await runChat({
    systemPrompt,
    // Hint/business_context/language đã nằm trong systemPrompt (đúng thiết kế template của
    // chính file prompt — có sẵn "Gợi ý của khách:\n{{user_hint}}"). History chỉ cần một lượt
    // user tối thiểu để Gemini có nội dung `contents` không rỗng.
    history: [{ role: 'user', content: 'Viết chỉ dẫn theo yêu cầu ở trên.' }],
    userId,
  });

  const rawText = result?.content ?? result?.instruction ?? '';
  const instruction = cleanInstructionOutput(rawText);

  if (!instruction) {
    throw badGateway('AI không trả về nội dung hợp lệ, vui lòng thử lại.');
  }

  return { instruction, businessContextUsed: Boolean(businessContext) };
}
