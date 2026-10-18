/**
 * Tạo mẫu tin từ chữ TỰ SOẠN của mục Nội dung (PLAN_THIET_LAP_BIEU_MAU_RIENG PR-E2) — chỉ email và Zalo (cá nhân + nhóm): bộ chạy của hai
 * kênh này chỉ gửi bước có `templateId`. Telegram / WhatsApp ghi chữ thẳng vào `step.message`, không qua đây.
 *
 * Trình từng bước làm việc này ở backend (`buildSimpleCreateDraft` → `autoCreateEmailTemplates` / `autoCreateZaloTemplates`, INSERT thẳng);
 * ở đây dùng API mẫu công khai (`POST /email-templates`, `POST /zalo-templates`) — cùng quyền, cùng hạn mức gói theo workspace
 * (`checkUserResourceLimit` + `enforceResourceLimitTx`) như trang Mẫu tin, nên vượt hạn mức hiện đúng câu thông báo sẵn có.
 *
 * Tạo mẫu LÚC LƯU, trước khi sơ đồ được ghi: lỗi → các mẫu vừa tạo bị xoá (cố hết sức) và ném lỗi; sơ đồ KHÔNG bị ghi gì.
 */
import emailTemplateApiService from '../../../templates/services/emailTemplateApi.service';
import zaloTemplateApiService from '../../../templates/services/zaloTemplateApi.service';
import { CUSTOM_SUBJECT_MAX, contentSignature } from './contentSection';

const TEMPLATE_NAME_MAX = 200;

/** Tiêu đề email: một dòng, bỏ ký tự điều khiển, tối đa 150 ký tự (như `normalizeEmailSubject` của backend). */
export const normalizeEmailSubject = (value) => String(value ?? '')
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u001F\u007F]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, CUSTOM_SUBJECT_MAX);

/**
 * Thân email: HTML đơn giản. Bỏ thẻ chủ động / nhúng (script, style, iframe, object, embed, form, link, meta) và thuộc tính `on*=`;
 * chữ thuần (không có thẻ nào) thì bọc theo đoạn <p> (như `normalizeEmailBodyHtml` của backend, để mẫu tạo ở đây giống mẫu của trình từng bước).
 */
export const plainTextToEmailHtml = (value) => {
  let html = String(value ?? '').trim();
  html = html
    .replace(/<\s*(script|style|iframe|object|embed|form)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*\/?\s*(script|style|iframe|object|embed|form|link|meta)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .trim();
  if (html && !/<[a-z][\s\S]*>/i.test(html)) {
    html = html
      .split(/\n{2,}/)
      .map((para) => para.trim())
      .filter(Boolean)
      .map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`)
      .join('\n');
  }
  return html;
};

const defaultServices = { email: emailTemplateApiService, zalo: zaloTemplateApiService };

const errorMessageOf = (error, fallback) => String(error?.response?.data?.message || error?.message || '').trim() || fallback;

let codeSeq = 0;
const nextTemplateCode = () => {
  codeSeq += 1;
  return `cp_${Date.now()}_${codeSeq}`;
};

/**
 * Đổi mọi tin tự soạn CẦN mẫu (email / Zalo: tin mới hoặc đã đổi chữ) thành mẫu thật rồi trả giá trị biểu mẫu mà `writeContent` ghi được.
 * Tin tự soạn không đổi gì (đã có mẫu) và tin dùng mẫu có sẵn đi qua nguyên vẹn. Telegram / WhatsApp: trả lại nguyên giá trị.
 *
 * @param {object} args
 * @param {object} args.value giá trị biểu mẫu của MỘT khối gửi
 * @param {string} args.campaignName đặt tên mẫu: "<tên chiến dịch> – Tin N"
 * @param {string} [args.fallbackName] tên khi chiến dịch chưa có tên
 * @param {string} [args.messageLabel] chữ "Tin" (theo ngôn ngữ)
 * @param {{ email: object, zalo: object }} [args.services] dịch vụ API mẫu (test truyền bản giả)
 * @returns {Promise<{ value: object, created: Array<{ kind: 'email'|'zalo', id: number, name: string }> }>}
 * @throws {Error} `message` là câu báo lỗi để hiện cho người dùng (kể cả câu hạn mức); `error.createdCleanup` luôn đã chạy
 */
export async function resolveCustomSteps({ value, campaignName = '', fallbackName = '', messageLabel = 'Tin', services = defaultServices }) {
  const channel = value.channel;
  if (channel !== 'email' && channel !== 'zalo') return { value, created: [] };

  const base = String(campaignName || '').trim() || fallbackName;
  const created = [];
  const steps = [];
  try {
    for (let index = 0; index < value.steps.length; index += 1) {
      const step = value.steps[index];
      const needs = step.content.mode === 'custom'
        && (step.needsTemplate || contentSignature(step.content) !== step.origSignature);
      if (!needs) {
        steps.push(step);
        continue;
      }
      const name = `${base ? `${base} – ` : ''}${messageLabel} ${index + 1}`.slice(0, TEMPLATE_NAME_MAX);
      const body = String(step.content.body || '').trim();
      const response = channel === 'email'
        ? await services.email.createTemplate({
          templateName: name,
          templateCode: nextTemplateCode(),
          subject: normalizeEmailSubject(step.content.subject) || name,
          bodyHtml: plainTextToEmailHtml(body),
          category: 'marketing',
        })
        : await services.zalo.createTemplate({ templateName: name, subject: name, bodyText: body, category: 'marketing' });
      const id = Number(response?.data?.data?.id);
      if (!(id > 0)) throw new Error('create_template_no_id');
      created.push({ kind: channel === 'email' ? 'email' : 'zalo', id, name });
      steps.push({
        ...step,
        content: { ...step.content, mode: 'template', templateId: id, templateName: name, customBody: channel === 'zalo' ? body : '' },
      });
    }
  } catch (error) {
    // Dọn các mẫu vừa tạo (không để mẫu mồ côi chiếm hạn mức); lỗi khi dọn không che lỗi gốc.
    await Promise.all(created.map((item) => Promise.resolve(services[item.kind].deleteTemplate(item.id)).catch(() => {})));
    const failure = new Error(errorMessageOf(error, ''));
    failure.limitReached = Boolean(error?.response?.data?.limitReached);
    throw failure;
  }
  return { value: { ...value, steps }, created };
}
