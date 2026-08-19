import businessProfileService from './businessProfile.service.js';
import aiUsageMeter from './aiUsageMeter.service.js';
import { normalizeAssistantLocale } from '../../utils/assistantLocale.util.js';
import {
  validateEditHtmlOutput,
  LANDING_FORM_PLACEHOLDER,
  MAX_EDIT_HTML_INPUT_CHARS,
} from '../../utils/landingEditGuard.util.js';

function stripJsonFences(raw) {
  let t = String(raw || '').trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }
  return t.trim();
}

function contentLanguageInstruction(contentLocale) {
  return contentLocale === 'en'
    ? 'CUSTOMER_CONTENT_LANGUAGE: Write ALL customer-visible landing copy (headlines, body, CTA, form labels, button text) in English. Do not mix Vietnamese.'
    : 'CUSTOMER_CONTENT_LANGUAGE: Viết TOÀN BỘ copy landing hiển thị (headline, body, CTA, nhãn form, nút) bằng tiếng Việt tự nhiên. Không trộn tiếng Anh trừ tên riêng/sản phẩm.';
}

class AiLandingPageService {
  /**
   * Sinh một tài liệu HTML5 đầy đủ (Tailwind CDN), JSON { title, html }.
   *
   * @param {{ userId: number, prompt: string, titleHint?: string, landingBriefContext?: string|null, contentLocale?: string }} opts
   * @returns {Promise<{ title: string, html: string }>}
   */
  async generate({
    userId,
    prompt,
    titleHint = '',
    landingBriefContext = null,
    actorUserId = null,
    contentLocale = 'vi',
  }) {
    const locale = normalizeAssistantLocale(contentLocale, 'vi');
    const htmlLang = locale === 'en' ? 'en' : 'vi';
    const formHeading = locale === 'en' ? 'Sign up' : 'Đăng ký';
    const businessCtx = await businessProfileService.getContextForLandingAi(userId, prompt);
    const hasBusinessCtx = String(businessCtx || '').trim().length > 0;
    const hasBrief = String(landingBriefContext || '').trim().length > 0;
    const hintLine = String(titleHint || '').trim()
      ? `Gợi ý tiêu đề trang (title / <title>): "${String(titleHint).trim()}".`
      : 'Không có gợi ý tiêu đề — bạn tự đặt title phù hợp.';

    const noProfileNote = hasBusinessCtx
      ? ''
      : (hasBrief
        ? `LƯU Ý: Chưa có hồ sơ doanh nghiệp — dùng LANDING_BRIEF DATA + yêu cầu người dùng; không bịa tên sản phẩm/giá/ưu đãi/số liệu ngoài các nguồn đó.\n\n`
        : `LƯU Ý: Chưa có hồ sơ doanh nghiệp — hãy tự suy luận ngành nghề, tên công ty, sản phẩm và khách hàng mục tiêu hợp lý từ yêu cầu của người dùng bên dưới.\n\n`);

    const briefBlock = hasBrief ? `${landingBriefContext}\n\n` : '';
    const precedenceNote = hasBrief
      ? `THỨ TỰ DỮ KIỆN: (1) LANDING_BRIEF DATA / selected product, (2) yêu cầu người dùng bên dưới, (3) hồ sơ doanh nghiệp chỉ bổ sung brand/tone/audience — không thay selected product.\n\n`
      : '';

    const fullPrompt = `Bạn là UI/UX + front-end (HTML) chuyên landing page marketing.

Nhiệm vụ: tạo MỘT trang landing HTML5 hoàn chỉnh, đẹp, responsive, theo đúng yêu cầu người dùng.

${contentLanguageInstruction(locale)}

QUAN TRỌNG: TUYỆT ĐỐI KHÔNG dùng placeholder dạng {{variable}}, [text], hoặc "Lorem ipsum" — hãy viết nội dung thật, cụ thể ngay trong HTML.

${precedenceNote}${briefBlock}${hasBusinessCtx ? `${businessCtx}\n\n` : noProfileNote}YÊU CẦU NỘI DUNG / CHỦ ĐỀ TỪ NGƯỜI DÙNG:
"""${prompt}"""

${hintLine}

QUY TẮC KỸ THUẬT (bắt buộc):
1) Trả về ĐÚNG một đối tượng JSON, không markdown, không giải thích ngoài JSON. Hai khóa: "title" (string) và "html" (string).
2) "html" phải là tài liệu HTML5 đầy đủ: bắt đầu bằng <!DOCTYPE html>, có <html lang="${htmlLang}">, <head>, <body>.
3) Trong <head> luôn có:
   - <meta charset="utf-8"/>
   - <meta name="viewport" content="width=device-width, initial-scale=1"/>
   - <title> khớp hoặc gần với "title" JSON
   - <script src="https://cdn.tailwindcss.com"></script>
4) Styling — NGHIÊM CẤM TUYỆT ĐỐI dùng thuộc tính style="..." inline trên BẤT KỲ thẻ HTML nào. KHÔNG được viết style="color:...", style="background-color:...", style="font-size:...", style="padding:...", style="margin:..." hay bất kỳ thuộc tính style inline nào. CHỈ được dùng class Tailwind utility (ví dụ class="bg-orange-500 text-white px-6 py-3"). Không dùng <style> block lớn; chỉ được vài dòng cho keyframe animation nếu thật sự cần.
5) Không dùng JavaScript ngoài script Tailwind CDN ở trên (không thư viện khác, không inline script logic).
6) Trang phải có vùng đăng ký lead: tại vị trí form (ví dụ sau khối CTA chính), chèn ĐÚNG một dòng comment HTML sau, đứng một mình giữa các thẻ cha phù hợp (ví dụ trong <section>):
   ${LANDING_FORM_PLACEHOLDER}
   Không bọc comment trong <script>. Không thay nội dung comment — giữ nguyên ký tự.
7) Toàn bộ chữ hiển thị phải theo CUSTOMER_CONTENT_LANGUAGE ở trên. Link ngoài dùng https, ngắn gọn.
8) Tránh ảnh placeholder URL giả; nếu cần hình minh họa, dùng gradient/icon Unicode hoặc bỏ ảnh.

Ví dụ cấu trúc JSON (minh họa — không copy nội dung):
{"title":"...","html":"<!DOCTYPE html>..."}`;

    const { text, blockReason, finishReason } = await aiUsageMeter.generateWithBudget(userId, {
      parts: [{ text: fullPrompt }],
      jsonMode: true,
      maxOutputTokens: 16384,
      timeoutMs: 120000,
      temperature: 0.4,
      feature: 'landing_page',
      metadata: {
        actorUserId: actorUserId != null ? Number(actorUserId) : Number(userId),
      },
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
    // Đếm số lần dùng inline style — cho phép tối đa 2 (ví dụ: keyframe fallback)
    const inlineStyleCount = (html.match(/\bstyle\s*=/gi) || []).length;
    if (inlineStyleCount > 2) {
      const err = new Error('AI sinh HTML dùng inline style thay vì Tailwind. Vui lòng thử lại.');
      err.status = 502;
      throw err;
    }

    if (!html.includes(LANDING_FORM_PLACEHOLDER)) {
      if (/<\/body>/i.test(html)) {
        html = html.replace(/<\/body>/i, `  <section class="py-10 px-4 max-w-3xl mx-auto">\n    <h2 class="text-xl font-semibold text-gray-900 mb-4">${formHeading}</h2>\n    ${LANDING_FORM_PLACEHOLDER}\n  </section>\n</body>`);
      } else {
        html = `${html}\n<!-- appended -->\n<section class="py-10 px-4">${LANDING_FORM_PLACEHOLDER}</section>`;
      }
    }

    return { title, html };
  }

  /**
   * Chỉnh sửa landing page HTML5 hiện tại theo yêu cầu, giữ nguyên cấu trúc/nội dung không đổi.
   *
   * @param {{ userId: number, currentHtml: string, instruction: string, contentLocale?: string, actorUserId?: number|null }} opts
   * @returns {Promise<{ title: string, html: string }>}
   */
  async editHtml({
    userId,
    currentHtml,
    instruction,
    contentLocale = 'vi',
    actorUserId = null,
  }) {
    const rawCurrent = String(currentHtml || '').trim();
    if (!rawCurrent) {
      const err = new Error('Không có mã nguồn HTML hiện tại để chỉnh sửa.');
      err.status = 400;
      throw err;
    }

    // Chốt chặn kích thước input:
    // maxOutputTokens = 32768, ~3 ký tự/token tiếng Việt, trừ escape JSON và phần mở rộng thêm -> ~60.000 ký tự.
    if (rawCurrent.length > MAX_EDIT_HTML_INPUT_CHARS) {
      const err = new Error(
        `Landing page hiện tại quá dài (${rawCurrent.length.toLocaleString('vi-VN')} ký tự, giới hạn ${MAX_EDIT_HTML_INPUT_CHARS.toLocaleString('vi-VN')} ký tự) để chỉnh sửa an toàn bằng AI. Vui lòng chỉnh sửa trực tiếp trong trình soạn thảo.`
      );
      err.status = 400;
      throw err;
    }

    const instr = String(instruction || '').trim();
    if (!instr) {
      const err = new Error('Vui lòng nhập mô tả yêu cầu chỉnh sửa cho AI.');
      err.status = 400;
      throw err;
    }

    const locale = normalizeAssistantLocale(contentLocale, 'vi');
    const htmlLang = locale === 'en' ? 'en' : 'vi';

    const fullPrompt = `Bạn là UI/UX + front-end (HTML) chuyên chỉnh sửa landing page marketing.

Nhiệm vụ: Chỉnh sửa trang landing HTML5 hiện tại theo ĐÚNG yêu cầu của người dùng.

${contentLanguageInstruction(locale)}

QUY TẮC CHỈNH SỬA TỐI QUAN TRỌNG:
1) Dưới đây là HTML hiện tại của trang. Nhiệm vụ của bạn là CHỈ thay đổi đúng phần người dùng yêu cầu.
2) Giữ NGUYÊN VĂN mọi phần còn lại: cấu trúc trang, thứ tự các section, nội dung chữ, class Tailwind, và comment "${LANDING_FORM_PLACEHOLDER}" (hoặc thẻ iframe form nhúng "/embed/lead-form/..."). Tuyệt đối KHÔNG tự ý viết lại, xóa bỏ hay tái cấu trúc các section không được yêu cầu.
3) Trả về JSON { "title": "...", "html": "..." } với "html" là TOÀN BỘ tài liệu/đoạn mã HTML sau khi sửa. Giữ đúng dạng tài liệu như bản gốc: nếu bản gốc là đoạn HTML fragment (không có <!DOCTYPE html>) thì trả lại đúng đoạn HTML fragment; nếu bản gốc là tài liệu HTML hoàn chỉnh (có <!DOCTYPE html>) thì trả lại tài liệu HTML hoàn chỉnh bắt đầu bằng <!DOCTYPE html>. KHÔNG trả về code diff hay phần giải thích.

QUY TẮC KỸ THUẬT:
1) Trả về ĐÚNG một đối tượng JSON, không markdown, không giải thích ngoài JSON. Hai khóa: "title" (string) và "html" (string).
2) Nếu bản gốc có thẻ <head> chứa Tailwind CDN, hãy luôn giữ nguyên: <script src="https://cdn.tailwindcss.com"></script>
3) KHÔNG tự ý chèn thêm thuộc tính style="..." inline; chỉ dùng class Tailwind utility.
4) Không dùng JavaScript logic ngoài script Tailwind CDN.

HTML HIỆN TẠI CỦA TRANG:
"""${rawCurrent}"""

YÊU CẦU CHỈNH SỬA TỪ NGƯỜI DÙNG:
"""${instr}"""

Ví dụ định dạng trả về (JSON hợp lệ):
{"title":"...","html":"..."}`;

    const { text, blockReason, finishReason } = await aiUsageMeter.generateWithBudget(userId, {
      parts: [{ text: fullPrompt }],
      jsonMode: true,
      maxOutputTokens: 32768,
      timeoutMs: 120000,
      temperature: 0.2,
      feature: 'landing_page',
      metadata: {
        actorUserId: actorUserId != null ? Number(actorUserId) : Number(userId),
        mode: 'edit',
      },
    });

    if (blockReason) {
      const err = new Error('Nội dung bị chặn bởi chính sách mô hình. Hãy thử yêu cầu khác.');
      err.status = 400;
      throw err;
    }

    let title = 'Landing';
    let html = '';

    try {
      const parsed = JSON.parse(stripJsonFences(text));
      title = String(parsed?.title || '').trim() || 'Landing';
      html = String(parsed?.html || '').trim();
    } catch {
      console.warn(`[LandingAI.editHtml] JSON parse failed (finishReason=${finishReason}), thử fallback extract HTML`);
      const fullDocMatch = text.match(/<!DOCTYPE html[\s\S]*<\/html>/i);
      if (fullDocMatch) {
        html = fullDocMatch[0].trim();
      } else {
        const codeBlockMatch = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
        if (codeBlockMatch && codeBlockMatch[1].trim()) {
          html = codeBlockMatch[1].trim();
        } else if (text.trim().startsWith('<') && text.trim().endsWith('>')) {
          html = text.trim();
        }
      }

      if (!html) {
        const err = new Error(
          finishReason === 'MAX_TOKENS'
            ? 'AI sinh HTML quá dài bị cắt ngắn. Hãy chia nhỏ yêu cầu sửa đổi.'
            : 'AI trả về không phải HTML hợp lệ. Vui lòng thử lại với yêu cầu cụ thể hơn.'
        );
        err.status = 502;
        throw err;
      }
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) title = titleMatch[1].trim();
    }

    // Chốt chặn kiểm tra chất lượng kết quả
    validateEditHtmlOutput({
      currentHtml: rawCurrent,
      newHtml: html,
      finishReason,
    });

    return { title, html };
  }
}

export default new AiLandingPageService();
