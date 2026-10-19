/**
 * Tham chiếu mẫu email của node `send_email` — MỘT nơi định nghĩa "node này lúc gửi dùng mẫu nào", dùng chung cho
 * preflight (chặn trước khi chạy) và đường gửi (lưới an toàn khi mẫu biến mất giữa lượt chạy).
 *
 * Luật khớp đúng engine:
 *  - `campaignRun.service.js` (nhánh `send_email`) chỉ giữ các bước `config.emailSteps[]` có `templateId` đọc được thành số
 *    (`parseInt` hữu hạn); còn bước nào hợp lệ thì MỖI bước dùng mẫu của chính nó (`step.templateId`).
 *  - Không có bước hợp lệ nào thì cả node dùng một mẫu: `config.emailTemplateId || config.templateId`
 *    (`campaignEmailSender.service.js`, đầu `sendEmailToCustomerDirect`).
 *  - Cột `campaign_nodes.id_email_template` KHÔNG được đọc lúc gửi (chỉ dùng cho màn "mẫu này đang được chiến dịch nào dùng").
 *  - Không có `templateId` nào (nội dung soạn thẳng trong config) → không có tham chiếu, giữ nguyên hành vi cũ.
 */

const TEMPLATE_ID_RE = /^\d{1,15}$/;

/**
 * Id mẫu hợp lệ (số nguyên dương, chỉ chữ số) hoặc null. Chặt hơn `parseInt` (không đọc `12abc` thành 12, `1e30` thành 1) và
 * không để chuỗi rác xuống truy vấn `bigint` làm Postgres ném lỗi cú pháp.
 *
 * @param {unknown} raw
 * @returns {number|null}
 */
export function parseEmailTemplateId(raw) {
  const text = String(raw ?? '').trim();
  if (!TEMPLATE_ID_RE.test(text)) return null;
  const id = Number(text);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * Các tham chiếu mẫu email mà node gửi email THẬT SỰ dùng lúc chạy.
 *
 * @param {object|null|undefined} config `campaign_nodes.config` của node `send_email`
 * @returns {Array<{ raw: string, id: number|null }>} `id` null = có tham chiếu nhưng không phải id hợp lệ (coi như mẫu không tồn tại)
 */
export function collectEmailTemplateReferences(config) {
  const cfg = config && typeof config === 'object' ? config : {};
  const steps = Array.isArray(cfg.emailSteps)
    ? cfg.emailSteps.filter((step) => Number.isFinite(Number.parseInt(step?.templateId, 10)))
    : [];
  const rawRefs = steps.length > 0
    ? steps.map((step) => step.templateId)
    : [cfg.emailTemplateId || cfg.templateId];
  const refs = [];
  for (const rawRef of rawRefs) {
    const raw = String(rawRef ?? '').trim();
    if (!raw) continue;
    refs.push({ raw, id: parseEmailTemplateId(raw) });
  }
  return refs;
}
