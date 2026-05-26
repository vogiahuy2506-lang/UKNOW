import { generateGeminiText } from '../../utils/geminiClient.util.js';
import businessProfileService from './businessProfile.service.js';

/** Marker để frontend (khi đã có slug) thay bằng iframe form embed. */
const LANDING_FORM_PLACEHOLDER = '<!-- UKNOW_LP_FORM -->';

function stripJsonFences(raw) {
  let t = String(raw || '').trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }
  return t.trim();
}

class AiLandingPageService {
  /**
   * Sinh một tài liệu HTML5 đầy đủ (Tailwind CDN), JSON { title, html }.
   *
   * @param {{ userId: number, prompt: string, titleHint?: string }} opts
   * @returns {Promise<{ title: string, html: string }>}
   */
  async generate({ userId, prompt, titleHint = '' }) {
    const businessCtx = await businessProfileService.getContextForLandingAi(userId, prompt);
    const hasBusinessCtx = String(businessCtx || '').trim().length > 0;
    const hintLine = String(titleHint || '').trim()
      ? `Gợi ý tiêu đề trang (title / <title>): "${String(titleHint).trim()}".`
      : 'Không có gợi ý tiêu đề — bạn tự đặt title phù hợp.';

    const noProfileNote = hasBusinessCtx ? '' : `LƯU Ý: Chưa có hồ sơ doanh nghiệp — hãy tự suy luận ngành nghề, tên công ty, sản phẩm và khách hàng mục tiêu hợp lý từ yêu cầu của người dùng bên dưới.\n\n`;

    const fullPrompt = `Bạn là UI/UX + front-end (HTML) chuyên landing page marketing tại Việt Nam.

Nhiệm vụ: tạo MỘT trang landing HTML5 hoàn chỉnh, đẹp, responsive, theo đúng yêu cầu người dùng.

QUAN TRỌNG: TUYỆT ĐỐI KHÔNG dùng placeholder dạng {{variable}}, [text], hoặc "Lorem ipsum" — hãy viết nội dung thật, cụ thể, tiếng Việt tự nhiên ngay trong HTML.

${hasBusinessCtx ? `${businessCtx}\n\n` : noProfileNote}YÊU CẦU NỘI DUNG / CHỦ ĐỀ TỪ NGƯỜI DÙNG:
"""${prompt}"""

${hintLine}

QUY TẮC KỸ THUẬT (bắt buộc):
1) Trả về ĐÚNG một đối tượng JSON, không markdown, không giải thích ngoài JSON. Hai khóa: "title" (string) và "html" (string).
2) "html" phải là tài liệu HTML5 đầy đủ: bắt đầu bằng <!DOCTYPE html>, có <html lang="vi">, <head>, <body>.
3) Trong <head> luôn có:
   - <meta charset="utf-8"/>
   - <meta name="viewport" content="width=device-width, initial-scale=1"/>
   - <title> khớp hoặc gần với "title" JSON
   - <script src="https://cdn.tailwindcss.com"></script>
4) Styling: CHỈ dùng lớp Tailwind utility trên các phần tử (không file CSS ngoài, không <style> lớn trừ khi cần vài dòng cho animation tối thiểu).
5) Không dùng JavaScript ngoài script Tailwind CDN ở trên (không thư viện khác, không inline script logic).
6) Trang phải có vùng đăng ký lead: tại vị trí form (ví dụ sau khối CTA chính), chèn ĐÚNG một dòng comment HTML sau, đứng một mình giữa các thẻ cha phù hợp (ví dụ trong <section>):
   ${LANDING_FORM_PLACEHOLDER}
   Không bọc comment trong <script>. Không thay nội dung comment — giữ nguyên ký tự.
7) Nội dung chữ có thể tiếng Việt. Link ngoài dùng https, ngắn gọn.
8) Tránh ảnh placeholder URL giả; nếu cần hình minh họa, dùng gradient/icon Unicode hoặc bỏ ảnh.

Ví dụ cấu trúc JSON (minh họa — không copy nội dung):
{"title":"...","html":"<!DOCTYPE html>..."}`;

    const { text, blockReason, finishReason } = await generateGeminiText({
      prompt: fullPrompt,
      jsonMode: true,
      maxOutputTokens: 16384,
      timeoutMs: 120000,
      temperature: 0.4,
    });

    if (blockReason) {
      const err = new Error('Nội dung bị chặn bởi chính sách mô hình. Hãy thử prompt khác.');
      err.status = 400;
      throw err;
    }

    let title = 'Landing';
    let html = '';

    // Thử parse JSON trước; nếu fail (model truncate hoặc escape sai) → fallback extract HTML từ raw text
    try {
      const parsed = JSON.parse(stripJsonFences(text));
      title = String(parsed?.title || '').trim() || 'Landing';
      html = String(parsed?.html || '').trim();
    } catch {
      console.warn(`[LandingAI] JSON parse failed (finishReason=${finishReason}), thử fallback extract HTML từ raw text`);
      // Fallback: tìm khối HTML trong raw text
      const htmlMatch = text.match(/<!DOCTYPE html[\s\S]*<\/html>/i);
      if (!htmlMatch) {
        const err = new Error(
          finishReason === 'MAX_TOKENS'
            ? 'AI sinh HTML quá dài bị cắt ngắn. Hãy thử yêu cầu ngắn gọn hơn.'
            : 'AI trả về không phải HTML hợp lệ. Thử lại hoặc rút ngắn yêu cầu.'
        );
        err.status = 502;
        throw err;
      }
      html = htmlMatch[0].trim();
      // Lấy title từ thẻ <title> trong HTML
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) title = titleMatch[1].trim();
    }
    if (!html.toLowerCase().includes('<!doctype')) {
      const err = new Error('Thiếu <!DOCTYPE html> trong phản hồi AI.');
      err.status = 502;
      throw err;
    }
    if (!html.includes('cdn.tailwindcss.com')) {
      const err = new Error('Thiếu Tailwind CDN trong HTML do AI sinh.');
      err.status = 502;
      throw err;
    }
    if (/\{\{[^}]+\}\}/.test(html)) {
      const err = new Error('AI trả về template chưa điền nội dung ({{...}}). Vui lòng thử lại hoặc bổ sung hồ sơ doanh nghiệp để AI có đủ context.');
      err.status = 502;
      throw err;
    }
    if (!html.includes(LANDING_FORM_PLACEHOLDER)) {
      if (/<\/body>/i.test(html)) {
        html = html.replace(/<\/body>/i, `  <section class="py-10 px-4 max-w-3xl mx-auto">\n    <h2 class="text-xl font-semibold text-gray-900 mb-4">Đăng ký</h2>\n    ${LANDING_FORM_PLACEHOLDER}\n  </section>\n</body>`);
      } else {
        html = `${html}\n<!-- appended -->\n<section class="py-10 px-4">${LANDING_FORM_PLACEHOLDER}</section>`;
      }
    }

    return { title, html };
  }
}

export default new AiLandingPageService();
