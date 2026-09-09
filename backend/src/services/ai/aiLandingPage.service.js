import businessProfileService from './businessProfile.service.js';
import aiUsageMeter from './aiUsageMeter.service.js';
import { normalizeAssistantLocale } from '../../utils/assistantLocale.util.js';
import {
  extractHtmlFromModelText,
  validateEditHtmlOutput,
  LANDING_FORM_PLACEHOLDER,
  MAX_EDIT_HTML_INPUT_CHARS,
} from '../../utils/landingEditGuard.util.js';
import { OCCUPATION_VALUES, INTEREST_AREA_VALUES } from '../../utils/landingLeadFormConfig.util.js';

function stripJsonFences(raw) {
  let t = String(raw || '').trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }
  return t.trim();
}

/**
 * Đoạn prompt yêu cầu AI thêm field vào form ĐÚNG theo cấu hình trang
 * (leadFormConfig — PLAN_LEAD_FORM_TRUONG_THEM_2026-09-08.md PR-2d-3, đã áp dụng đầy đủ qua
 * applyLeadFormDraftToConfig ở ai.controller.js, KHÔNG còn là leadFormDraft thô):
 *   - fixedFields.occupation/interestArea.visible=true → <select name="occupation"/"interestArea">
 *     với option value PHẢI khớp tuyệt đối OCCUPATION_VALUES/INTEREST_AREA_VALUES
 *     (landingLeadFormConfig.util.js) — normalizeOccupationValue/normalizeInterestAreaValue chỉ
 *     nhận đúng chuỗi trong danh sách, sai một ký tự thì lead.service.js âm thầm bỏ trống giá
 *     trị (không 422, nhưng mất dữ liệu).
 *   - customFields[] → mỗi field một input/textarea/select/radio/checkbox với name=khoá TẤT
 *     ĐỊNH (cf_sugg_NN_text, sinh bởi applyLeadFormDraftToConfig — PR-2d-1 đã bịt "Bẫy khoá
 *     ngẫu nhiên": khoá phải áp TRƯỚC khi sinh HTML, không phải trình duyệt tự đoán sau). Option
 *     value của select/radio PHẢI copy y nguyên mã đã lưu (field.options[].value) — sai mã thì
 *     buildTrustedCustomFieldsSnapshot không nhận diện được lựa chọn khách chọn.
 * Trước PR-2d-1, customFields không có đường lưu nào sống được sau khi trang qua
 * LandingCanvasEditor.jsx (schema tối giản), nên hàm này CHỦ Ý không nhúng cf_sugg — lý do đó
 * đã hết từ khi schema đầy đủ được khôi phục và LeadFormConfigPanel nối lại đường lưu thật
 * (PR-2d-1, PR-2d-2, nghiệm thu SQL thật trên production 09/09).
 *
 * @param {{ fixedFields?: { occupation?: { visible?: boolean }, interestArea?: { visible?: boolean } }, customFields?: Array<{ key: string, type: string, labelVi?: string, required?: boolean, options?: Array<{ value: string, labelVi?: string }> }> }|null} leadFormConfig
 * @returns {string} rỗng nếu không cần thêm gì
 */
function buildLeadFormExtraFieldsPromptBlock(leadFormConfig) {
  const needOccupation = Boolean(leadFormConfig?.fixedFields?.occupation?.visible);
  const needInterestArea = Boolean(leadFormConfig?.fixedFields?.interestArea?.visible);
  const customFields = Array.isArray(leadFormConfig?.customFields) ? leadFormConfig.customFields : [];
  if (!needOccupation && !needInterestArea && customFields.length === 0) return '';

  // `options` là mảng {value, label} — value/label GIỐNG NHAU cho occupation/interestArea
  // (OCCUPATION_VALUES/INTEREST_AREA_VALUES vừa là mã lưu DB vừa là chữ hiển thị), nhưng
  // KHÁC NHAU cho customFields (option.value là mã ngắn, option.labelVi là chữ hiển thị) —
  // dùng chung 1 hàm build option list, không rút gọn thành mảng string phẳng kẻo option
  // custom field hiện value thay vì nhãn (bắt được nhờ test, không phải đọc mắt).
  const selectBlock = (name, placeholder, options, requiredAttr = ' required') =>
    [
      `   <select name="${name}"${requiredAttr}>`,
      `     <option value="">${placeholder}</option>`,
      ...options.map((o) => `     <option value="${o.value}">${o.label}</option>`),
      `   </select>`,
    ].join('\n');

  const customFieldBlock = (field) => {
    const key = field.key;
    const label = field.labelVi || key;
    const requiredAttr = field.required ? ' required' : '';
    const options = Array.isArray(field.options) ? field.options : [];
    switch (field.type) {
      case 'textarea':
        return `   <textarea name="${key}" placeholder="${label}"${requiredAttr}></textarea>`;
      case 'select':
        return selectBlock(key, label, options.map((o) => ({ value: o.value, label: o.labelVi || o.value })), requiredAttr);
      case 'radio':
        return [
          `   <!-- ${label}${field.required ? ' (bắt buộc chọn 1)' : ''} -->`,
          ...options.map(
            (o) =>
              `   <label><input type="radio" name="${key}" value="${o.value}"${requiredAttr} /> ${o.labelVi || o.value}</label>`
          ),
        ].join('\n');
      case 'checkbox':
        return `   <label><input type="checkbox" name="${key}"${requiredAttr} /> ${label}</label>`;
      case 'text':
      default:
        return `   <input type="text" name="${key}" placeholder="${label}"${requiredAttr} />`;
    }
  };

  const blocks = [];
  const toValueLabelPairs = (values) => values.map((v) => ({ value: v, label: v }));
  if (needOccupation) blocks.push(selectBlock('occupation', 'Chọn nghề nghiệp', toValueLabelPairs(OCCUPATION_VALUES)));
  if (needInterestArea) blocks.push(selectBlock('interestArea', 'Chọn chủ đề quan tâm', toValueLabelPairs(INTEREST_AREA_VALUES)));
  for (const field of customFields) blocks.push(customFieldBlock(field));

  return `9) Cấu hình trang này YÊU CẦU thêm ${blocks.length > 1 ? 'các trường' : 'trường'} sau vào TRONG CÙNG form (không tạo form thứ 2), đặt sau ô phone và trước checkbox marketingConsent. Mỗi field PHẢI đúng name và value <option>/<input value> COPY Y NGUYÊN chuỗi bên dưới — không dịch, không viết lại, không đổi mã, không thêm/bớt lựa chọn (backend chỉ nhận đúng các khoá/mã này):\n${blocks.join('\n')}\n`;
}

function contentLanguageInstruction(contentLocale) {
  return contentLocale === 'en'
    ? 'CUSTOMER_CONTENT_LANGUAGE: Write ALL customer-visible landing copy (headlines, body, CTA, form labels, button text) in English. Do not mix Vietnamese.'
    : 'CUSTOMER_CONTENT_LANGUAGE: Viết TOÀN BỘ copy landing hiển thị (headline, body, CTA, nhãn form, nút) bằng tiếng Việt tự nhiên. Không trộn tiếng Anh trừ tên riêng/sản phẩm.';
}

const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapeHtmlAttr = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * HTML có `value="<mã>"` cho một lựa chọn chưa — chấp nhận cả dạng AI thoát thực thể
 * (`ChatGPT &amp; Prompt Engineering`) vì trình duyệt giải mã lại khi đọc select.value nên
 * giá trị gửi lên vẫn khớp OCCUPATION_VALUES/field.options[].value. Kiểm lỏng (bất kỳ đâu
 * trong trang), đủ để bắt ca AI ghi nhãn thay mã; bản chặt theo từng khối select nằm ở
 * frontend leadFormHtmlChecks.js (cảnh báo trong Cài đặt trang).
 */
function htmlHasOptionValue(html, value) {
  const v = String(value ?? '').trim();
  if (!v) return true;
  return new RegExp(`\\bvalue\\s*=\\s*["'](?:${escapeRegExp(v)}|${escapeRegExp(escapeHtmlAttr(v))})["']`, 'i').test(html);
}

class AiLandingPageService {
  /**
   * Sinh một tài liệu HTML5 đầy đủ (Tailwind CDN), JSON { title, html }.
   *
   * @param {{ userId: number, prompt: string, titleHint?: string, landingBriefContext?: string|null, contentLocale?: string, leadFormConfig?: object|null }} opts
   * @returns {Promise<{ title: string, html: string }>}
   */
  async generate({
    userId,
    prompt,
    titleHint = '',
    landingBriefContext = null,
    actorUserId = null,
    contentLocale = 'vi',
    leadFormConfig = null,
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
6) Trang phải có ĐÚNG MỘT form đăng ký lead thật (không phải placeholder), đặt tại vị trí form (ví dụ sau khối CTA chính, trong <section>), theo ĐÚNG cấu trúc sau (giữ nguyên tên thuộc tính, được đổi class/label/nội dung chữ theo văn phong trang):
   <form data-founderai-capture>
     <input type="text" name="name" placeholder="..." required />
     <input type="email" name="email" placeholder="..." required />
     <input type="tel" name="phone" placeholder="..." />
     <label><input type="checkbox" name="marketingConsent" /> ...câu đồng ý nhận thông tin/khuyến mãi...</label>
     <button type="submit">${formHeading}</button>
   </form>
   <div class="founderai-capture-success" style="display:none">...thông báo thành công...</div>
   <div class="founderai-capture-error" style="display:none"></div>
   Bắt buộc: đúng 3 trường name="name"/"email"/"phone" như trên (không đổi tên, không thêm form thứ 2 nào khác trong trang). Checkbox "marketingConsent" mặc định KHÔNG được tick sẵn (không thêm thuộc tính checked). KHÔNG dùng tên "cf_agree_checkbox" hay bất kỳ tên nào khác cho ô đồng ý này — phải đúng "marketingConsent". KHÔNG thêm thuộc tính action hoặc onsubmit trên thẻ <form> — script capture ngoài trang tự bắt sự kiện submit.
7) Toàn bộ chữ hiển thị phải theo CUSTOMER_CONTENT_LANGUAGE ở trên. Link ngoài dùng https, ngắn gọn.
8) Tránh ảnh placeholder URL giả; nếu cần hình minh họa, dùng gradient/icon Unicode hoặc bỏ ảnh.
${buildLeadFormExtraFieldsPromptBlock(leadFormConfig)}
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
        err.status = 422;
        throw err;
      }
      // Dẫn qua extractHtmlFromModelText (landingEditGuard.util.js) thay vì lấy thẳng
      // htmlMatch[0]: đoạn khớp có thể nằm BÊN TRONG chuỗi JSON hỏng và còn mang `\n`/`\"`
      // thoát — hàm đó giải mã, giải mã không được thì trả '' → 422 ở dưới (cùng lỗi đường
      // editHtml sếp gặp 09/09 13:10).
      html = extractHtmlFromModelText(text);
      if (!html) {
        const err = new Error('AI trả về HTML bị mã hoá sai định dạng. Vui lòng thử lại.');
        err.status = 422;
        throw err;
      }
      // Lấy title từ thẻ <title> trong HTML
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) title = titleMatch[1].trim();
    }
    if (!html.toLowerCase().includes('<!doctype')) {
      // Mọi chốt "AI sinh không đạt, thử lại" dưới đây dùng 422, KHÔNG dùng 502: production
      // đứng sau Cloudflare, và Cloudflare thay mọi 502/504 của origin bằng trang lỗi của nó —
      // câu "Vui lòng thử lại" không bao giờ tới trình duyệt, người dùng chỉ thấy "Bad gateway"
      // và tưởng hạ tầng hỏng (sếp gặp 09/09 10:08, xem PLAN_LANDING_SINH_BAT_DONG_BO). 422
      // đi thẳng, frontend hiện đúng message.
      const err = new Error('Thiếu <!DOCTYPE html> trong phản hồi AI.');
      err.status = 422;
      throw err;
    }
    if (!html.includes('cdn.tailwindcss.com')) {
      const err = new Error('Thiếu Tailwind CDN trong HTML do AI sinh.');
      err.status = 422;
      throw err;
    }
    if (/\{\{[^}]+\}\}/.test(html)) {
      const err = new Error('AI trả về template chưa điền nội dung ({{...}}). Vui lòng thử lại hoặc bổ sung hồ sơ doanh nghiệp để AI có đủ context.');
      err.status = 422;
      throw err;
    }
    // Đếm số lần dùng inline style — cho phép tối đa 2 (ví dụ: keyframe fallback)
    const inlineStyleCount = (html.match(/\bstyle\s*=/gi) || []).length;
    if (inlineStyleCount > 2) {
      const err = new Error('AI sinh HTML dùng inline style thay vì Tailwind. Vui lòng thử lại.');
      err.status = 422;
      throw err;
    }

    // Chốt chặn form bắt lead: AI phải tự sinh <form data-founderai-capture> với
    // trường email thật (quy tắc 6 ở trên) — không còn fallback tự chèn placeholder,
    // vì placeholder không được founderai-capture.js bắt được submit.
    if (!/<form[^>]*\bdata-founderai-capture\b[^>]*>/i.test(html)) {
      const err = new Error('AI không tạo form đăng ký lead (thiếu data-founderai-capture). Vui lòng thử lại.');
      err.status = 422;
      throw err;
    }
    if (!/\bname\s*=\s*["']email["']/i.test(html)) {
      const err = new Error('AI tạo form đăng ký lead nhưng thiếu trường email (name="email"). Vui lòng thử lại.');
      err.status = 422;
      throw err;
    }
    // PLAN_FORM_LANDING_AI_GIU_FORM_2026-09-06.md PR-2b: leadFormConfig yêu cầu occupation/
    // interestArea visible thì HTML phải có field tương ứng — không fallback, vì thiếu field
    // không gây lỗi cho khách (lead.service.js chỉ để trống) nhưng khiến trang mất dữ liệu mà
    // cấu hình vốn đòi hỏi, âm thầm và mãi mãi (trang đã publish, không sinh lại).
    if (leadFormConfig?.fixedFields?.occupation?.visible && !/\bname\s*=\s*["']occupation["']/i.test(html)) {
      const err = new Error('AI tạo form đăng ký lead nhưng thiếu trường occupation (name="occupation") dù cấu hình yêu cầu. Vui lòng thử lại.');
      err.status = 422;
      throw err;
    }
    if (leadFormConfig?.fixedFields?.interestArea?.visible && !/\bname\s*=\s*["']interestArea["']/i.test(html)) {
      const err = new Error('AI tạo form đăng ký lead nhưng thiếu trường interestArea (name="interestArea") dù cấu hình yêu cầu. Vui lòng thử lại.');
      err.status = 422;
      throw err;
    }
    // PLAN_LEAD_FORM_TRUONG_THEM_2026-09-08.md PR-2d-3 việc 1: mỗi customFields[] đã áp dụng
    // (khoá cf_sugg_NN_text tất định) đòi đúng 1 field name="<khoá>" trong HTML — thiếu thì
    // publish trang không có ô đó, khách không bao giờ điền được, mãi mãi (trang đã publish).
    const customFields = Array.isArray(leadFormConfig?.customFields) ? leadFormConfig.customFields : [];
    const missingCustomFieldKey = customFields
      .find((field) => !new RegExp(`\\bname\\s*=\\s*["']${field.key}["']`, 'i').test(html));
    if (missingCustomFieldKey) {
      const err = new Error(`AI tạo form đăng ký lead nhưng thiếu trường "${missingCustomFieldKey.labelVi || missingCustomFieldKey.key}" (name="${missingCustomFieldKey.key}") dù cấu hình yêu cầu. Vui lòng thử lại.`);
      err.status = 422;
      throw err;
    }
    // 09/09 (sự cố slug-test ở đường sửa AI): ô select/radio có mặt nhưng AI ghi value là NHÃN
    // ("Lựa chọn 1") thay vì mã ("opt_a") → normalizeCustomSubmitValue từ chối MỌI lead với
    // "<nhãn> không hợp lệ"; occupation/interestArea thì normalizeOptionalSelectValue đổi thành ''
    // trong im lặng. Đường sinh đã đưa sẵn markup đúng mã (rule 9) nên hiếm gặp, nhưng lọt qua
    // kiểm name ở trên là trang publish với form không bao giờ gửi được — chặn 422 cho cùng luật.
    const wrongOptionField = customFields
      .filter((field) => field.type === 'select' || field.type === 'radio')
      .find((field) => (Array.isArray(field.options) ? field.options : []).some((o) => !htmlHasOptionValue(html, o?.value)));
    if (wrongOptionField) {
      const err = new Error(`AI tạo form đăng ký lead nhưng lựa chọn của trường "${wrongOptionField.labelVi || wrongOptionField.key}" (name="${wrongOptionField.key}") không đúng mã đã cấu hình. Vui lòng thử lại.`);
      err.status = 422;
      throw err;
    }
    const wrongFixedField = [
      leadFormConfig?.fixedFields?.occupation?.visible ? ['occupation', OCCUPATION_VALUES] : null,
      leadFormConfig?.fixedFields?.interestArea?.visible ? ['interestArea', INTEREST_AREA_VALUES] : null,
    ].find((entry) => entry && entry[1].some((v) => !htmlHasOptionValue(html, v)));
    if (wrongFixedField) {
      const err = new Error(`AI tạo form đăng ký lead nhưng lựa chọn của trường ${wrongFixedField[0]} (name="${wrongFixedField[0]}") không đúng danh sách hệ thống. Vui lòng thử lại.`);
      err.status = 422;
      throw err;
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
2) Giữ NGUYÊN VĂN mọi phần còn lại: cấu trúc trang, thứ tự các section, nội dung chữ, class Tailwind, và form đăng ký lead hiện có của trang — comment "${LANDING_FORM_PLACEHOLDER}" (trang cũ), hoặc thẻ iframe form nhúng "/embed/lead-form/..." (trang cũ), hoặc form có thuộc tính "data-founderai-capture" cùng đủ 3 trường name="name"/"email"/"phone" và checkbox name="marketingConsent" (trang mới) — GIỮ NGUYÊN VĂN toàn bộ form đó, không đổi tên thuộc tính, không xóa trường nào. Tuyệt đối KHÔNG tự ý viết lại, xóa bỏ hay tái cấu trúc các section không được yêu cầu.
2b) NGOẠI LỆ CỦA QUY TẮC 2 — khi yêu cầu là THÊM một trường mới vào form đăng ký (ví dụ: "thêm ô Tên công ty vào form", "thêm trường Quy mô kiểu chọn với 3 lựa chọn..."): đây là thay đổi ĐƯỢC PHÉP trên chính form đó. Thêm ĐÚNG các thẻ input/textarea/select/radio/checkbox được yêu cầu vào BÊN TRONG form "data-founderai-capture" hiện có (đặt sau các trường đang có, trước nút submit) — KHÔNG tạo form thứ 2, KHÔNG đổi thuộc tính "data-founderai-capture", và bắt buộc GIỮ NGUYÊN mọi trường đang có (name/email/phone/marketingConsent và mọi trường cf_* khác) — chỉ THÊM, không xoá, không đổi tên trường nào khác ngoài trường mới được yêu cầu.
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
      html = extractHtmlFromModelText(text);

      if (!html) {
        const err = new Error(
          finishReason === 'MAX_TOKENS'
            ? 'AI sinh HTML quá dài bị cắt ngắn. Hãy chia nhỏ yêu cầu sửa đổi.'
            : 'AI trả về không phải HTML hợp lệ. Vui lòng thử lại với yêu cầu cụ thể hơn.'
        );
        err.status = 422;
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
