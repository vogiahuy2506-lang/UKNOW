/**
 * Thước đo chất lượng nội dung AI - Tất định, không LLM (Kế hoạch 7A)
 *
 * Nhiệm vụ:
 * Chấm điểm chất lượng văn bản được sinh ra trong kịch bản chiến dịch (email, zalo_personal, zalo_group).
 * Hàm thuần túy, tất định, đồng bộ, không I/O, không gọi LLM giám khảo.
 *
 * Các luật chấm:
 * 1. PLACEHOLDER_UNRESOLVED: Biến {{...}} không thể giải được bằng auto-map VÀ không thuộc nhóm tên người.
 * 2. EMPTY_BODY: Thân thư / tin nhắn rỗng hoặc chỉ có thẻ HTML / khoảng trắng.
 * 3. EMPTY_SUBJECT: Tiêu đề email rỗng.
 * 4. WRONG_LOCALE: contentBrief.locale = 'vi' nhưng nội dung không có ký tự tiếng Việt có dấu.
 * 5. STEP_COUNT_MISMATCH: Số bước nội dung khác số bước lịch yêu cầu (drip / once).
 * 6. TOPIC_ABSENT: Không có từ khóa nào của contentBrief.topic xuất hiện trong tiêu đề lẫn thân thư.
 */

import { getNodeSubtype } from '../../utils/nodeSubtype.util.js';
import {
  deriveVariablesForText,
  mapVariableToSemanticTarget,
} from '../../utils/templateVariableAutoMap.util.js';
import { foldDiacritics } from '../../utils/columnHeaderMatch.util.js';

// Regex nhận diện ký tự tiếng Việt có dấu
export const VIETNAMESE_ACCENTED_CHAR_REGEX =
  /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/;

/**
 * Kiểm tra chuỗi văn bản hoặc HTML có bị rỗng (hoặc chỉ toàn thẻ HTML rỗng).
 * @param {string|null|undefined} text
 * @returns {boolean}
 */
export function isHtmlOrTextEmpty(text) {
  if (!text || typeof text !== 'string') return true;
  const stripped = text
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim();
  return stripped.length === 0;
}

/**
 * Kiểm tra chuỗi văn bản có chứa ký tự tiếng Việt có dấu hay không.
 * @param {string|null|undefined} text
 * @returns {boolean}
 */
export function hasVietnameseDiacritics(text) {
  if (!text || typeof text !== 'string') return false;
  return VIETNAMESE_ACCENTED_CHAR_REGEX.test(text);
}

/**
 * Trích xuất danh sách từ khóa hợp lệ (độ dài >= 2 ký tự) từ một chủ đề.
 * @param {string|null|undefined} topic
 * @returns {string[]}
 */
export function extractTopicKeywords(topic) {
  if (!topic || typeof topic !== 'string') return [];
  return topic
    .split(/[\s,.;:!?()_"/\\-]+/)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length >= 2);
}

/**
 * Kiểm tra xem văn bản có chứa ít nhất một từ khóa của topic không.
 * @param {string} text
 * @param {string} topic
 * @returns {boolean}
 */
export function containsAnyTopicKeyword(text, topic) {
  const keywords = extractTopicKeywords(topic);
  if (keywords.length === 0) return true;

  const lowerText = String(text || '').toLowerCase();
  const foldedText = foldDiacritics(lowerText);

  return keywords.some((kw) => {
    if (lowerText.includes(kw)) return true;
    const foldedKw = foldDiacritics(kw);
    return foldedKw.length >= 2 && foldedText.includes(foldedKw);
  });
}

/**
 * Tìm các biến placeholder {{...}} trong văn bản không thể giải quyết được.
 *
 * Định nghĩa chuẩn theo đính chính 01-02/09:
 * - Chỉ báo lỗi khi biến KHÔNG thể giải được bằng auto-map VÀ không thuộc nhóm tên người.
 * - Tái sử dụng deriveVariablesForText và mapVariableToSemanticTarget, không viết bộ khớp thứ hai.
 *
 * @param {string} text
 * @param {Array} [mappings]
 * @returns {string[]} Danh sách biến chưa giải quyết được
 */
export function findUnresolvedPlaceholders(text, mappings = []) {
  if (!text || typeof text !== 'string' || !text.includes('{{')) {
    return [];
  }

  const resolveMock = ({ mappings: mList }) => {
    const res = {};
    for (const m of mList || []) {
      const k = m?.key || m?.variable || m?.name;
      if (k) res[k] = 'mapped_value';
    }
    return res;
  };

  // Đối tượng khách hàng chuẩn hỗ trợ các trường auto-map thông dụng (name, email, phone)
  const standardCustomer = {
    name: 'Khách hàng',
    email: 'email@example.com',
    phone: '0900000000',
  };

  const { unresolved } = deriveVariablesForText(text, {
    mappings: Array.isArray(mappings) ? mappings : [],
    resolveFromMappings: resolveMock,
    customer: standardCustomer,
  });

  // Lọc bỏ các biến thuộc nhóm tên người (runtime đã có lưới an toàn thay bằng "bạn" thay vì rỗng)
  return unresolved.filter((varName) => mapVariableToSemanticTarget(varName) !== 'name');
}

/**
 * Xác định số bước yêu cầu từ schedule cấu hình.
 * @param {object|null|undefined} schedule
 * @returns {number|null}
 */
export function resolveExpectedSteps(schedule) {
  if (!schedule || typeof schedule !== 'object') return null;
  const mode = schedule.mode || schedule.type;
  if (mode === 'drip') {
    const days = Math.max(1, Number(schedule.days) || 1);
    const slots = Math.max(1, Number(schedule.slotsPerDay) || 1);
    return days * slots;
  }
  if (mode === 'once') {
    return 1;
  }
  return null;
}

/**
 * Chấm điểm chất lượng nội dung AI đã sinh trong script kịch bản chiến dịch.
 *
 * @param {object|Array} script - Đồ thị chiến dịch ({ nodes, connections }) hoặc mảng nodes
 * @param {object} [context] - Ngữ cảnh kèm theo (gateState, brief, schedule, locale, topic...)
 * @returns {{ ok: boolean, issues: Array<{ code: string, nodeSubtype: string, stepIndex?: number, details?: any }> }}
 */
export function scoreGeneratedContent(script, context = {}) {
  const issues = [];

  const rawNodes = Array.isArray(script?.nodes)
    ? script.nodes
    : Array.isArray(script)
      ? script
      : [];

  const contentBrief =
    context?.contentBrief || context?.brief || script?.contentBrief || script?.brief || {};
  const schedule = context?.schedule || context?.gateState?.schedule || script?.schedule || null;

  const expectedSteps =
    context?.expectedSteps !== undefined
      ? context.expectedSteps
      : resolveExpectedSteps(schedule);

  const locale = context?.locale || contentBrief?.locale || null;
  const topic = context?.topic || contentBrief?.topic || null;

  for (const node of rawNodes) {
    const subtype = getNodeSubtype(node);
    const cfg = node?.config || node?.settings || {};

    // 1. Kênh Email
    if (subtype === 'send_email' || subtype === 'email') {
      const nodeSubtype = 'send_email';
      let steps = null;

      if (Array.isArray(cfg.emailSteps) && cfg.emailSteps.length > 0) {
        steps = cfg.emailSteps;
      } else if (cfg.emailSubject !== undefined || cfg.emailBody !== undefined || cfg.subject !== undefined || cfg.body !== undefined) {
        steps = [
          {
            emailSubject: cfg.emailSubject ?? cfg.subject ?? '',
            emailBody: cfg.emailBody ?? cfg.body ?? cfg.htmlBody ?? '',
            templateMappings: cfg.templateMappings || [],
          },
        ];
      } else {
        steps = [];
      }

      if (expectedSteps !== null && steps.length !== expectedSteps) {
        issues.push({
          code: 'STEP_COUNT_MISMATCH',
          nodeSubtype,
          details: { expected: expectedSteps, actual: steps.length },
        });
      }

      if (steps.length === 0) {
        issues.push({ code: 'EMPTY_SUBJECT', nodeSubtype, stepIndex: 0 });
        issues.push({ code: 'EMPTY_BODY', nodeSubtype, stepIndex: 0 });
      } else {
        steps.forEach((step, stepIndex) => {
          const subject = String(step?.emailSubject ?? step?.subject ?? '');
          const body = String(step?.emailBody ?? step?.body ?? step?.htmlBody ?? '');
          const mappings = Array.isArray(step?.templateMappings)
            ? step.templateMappings
            : Array.isArray(cfg.templateMappings)
              ? cfg.templateMappings
              : [];

          if (subject.trim().length === 0) {
            issues.push({ code: 'EMPTY_SUBJECT', nodeSubtype, stepIndex });
          }

          if (isHtmlOrTextEmpty(body)) {
            issues.push({ code: 'EMPTY_BODY', nodeSubtype, stepIndex });
          } else if (locale && String(locale).toLowerCase() === 'vi' && !hasVietnameseDiacritics(body)) {
            issues.push({ code: 'WRONG_LOCALE', nodeSubtype, stepIndex });
          }

          if (topic && typeof topic === 'string' && topic.trim()) {
            const combined = `${subject} ${body}`;
            if (!containsAnyTopicKeyword(combined, topic)) {
              issues.push({ code: 'TOPIC_ABSENT', nodeSubtype, stepIndex });
            }
          }

          const unresolved = findUnresolvedPlaceholders(`${subject} ${body}`, mappings);
          if (unresolved.length > 0) {
            issues.push({
              code: 'PLACEHOLDER_UNRESOLVED',
              nodeSubtype,
              stepIndex,
              details: { unresolved },
            });
          }
        });
      }
    }

    // 2. Kênh Zalo cá nhân
    else if (subtype === 'send_zalo_personal' || subtype === 'zalo_personal') {
      const nodeSubtype = 'send_zalo_personal';
      let steps = null;

      if (Array.isArray(cfg.zaloPersonalTemplateSteps) && cfg.zaloPersonalTemplateSteps.length > 0) {
        steps = cfg.zaloPersonalTemplateSteps;
      } else if (cfg.messageText !== undefined || cfg.message !== undefined) {
        steps = [
          {
            message: cfg.messageText ?? cfg.message ?? '',
            templateMappings: cfg.templateMappings || [],
          },
        ];
      } else {
        steps = [];
      }

      if (expectedSteps !== null && steps.length !== expectedSteps) {
        issues.push({
          code: 'STEP_COUNT_MISMATCH',
          nodeSubtype,
          details: { expected: expectedSteps, actual: steps.length },
        });
      }

      if (steps.length === 0) {
        issues.push({ code: 'EMPTY_BODY', nodeSubtype, stepIndex: 0 });
      } else {
        steps.forEach((step, stepIndex) => {
          const message = String(step?.message ?? step?.messageText ?? '');
          const mappings = Array.isArray(step?.templateMappings)
            ? step.templateMappings
            : Array.isArray(cfg.templateMappings)
              ? cfg.templateMappings
              : [];

          if (isHtmlOrTextEmpty(message)) {
            issues.push({ code: 'EMPTY_BODY', nodeSubtype, stepIndex });
          } else if (locale && String(locale).toLowerCase() === 'vi' && !hasVietnameseDiacritics(message)) {
            issues.push({ code: 'WRONG_LOCALE', nodeSubtype, stepIndex });
          }

          if (topic && typeof topic === 'string' && topic.trim()) {
            if (!containsAnyTopicKeyword(message, topic)) {
              issues.push({ code: 'TOPIC_ABSENT', nodeSubtype, stepIndex });
            }
          }

          const unresolved = findUnresolvedPlaceholders(message, mappings);
          if (unresolved.length > 0) {
            issues.push({
              code: 'PLACEHOLDER_UNRESOLVED',
              nodeSubtype,
              stepIndex,
              details: { unresolved },
            });
          }
        });
      }
    }

    // 3. Kênh Zalo nhóm
    else if (subtype === 'send_zalo_group' || subtype === 'zalo_group') {
      const nodeSubtype = 'send_zalo_group';
      let steps = null;

      if (Array.isArray(cfg.zaloGroupTemplateSteps) && cfg.zaloGroupTemplateSteps.length > 0) {
        steps = cfg.zaloGroupTemplateSteps;
      } else if (cfg.messageText !== undefined || cfg.message !== undefined) {
        steps = [
          {
            message: cfg.messageText ?? cfg.message ?? '',
            templateMappings: cfg.templateMappings || [],
          },
        ];
      } else {
        steps = [];
      }

      if (expectedSteps !== null && steps.length !== expectedSteps) {
        issues.push({
          code: 'STEP_COUNT_MISMATCH',
          nodeSubtype,
          details: { expected: expectedSteps, actual: steps.length },
        });
      }

      if (steps.length === 0) {
        issues.push({ code: 'EMPTY_BODY', nodeSubtype, stepIndex: 0 });
      } else {
        steps.forEach((step, stepIndex) => {
          const message = String(step?.message ?? step?.messageText ?? '');
          const mappings = Array.isArray(step?.templateMappings)
            ? step.templateMappings
            : Array.isArray(cfg.templateMappings)
              ? cfg.templateMappings
              : [];

          if (isHtmlOrTextEmpty(message)) {
            issues.push({ code: 'EMPTY_BODY', nodeSubtype, stepIndex });
          } else if (locale && String(locale).toLowerCase() === 'vi' && !hasVietnameseDiacritics(message)) {
            issues.push({ code: 'WRONG_LOCALE', nodeSubtype, stepIndex });
          }

          if (topic && typeof topic === 'string' && topic.trim()) {
            if (!containsAnyTopicKeyword(message, topic)) {
              issues.push({ code: 'TOPIC_ABSENT', nodeSubtype, stepIndex });
            }
          }

          const unresolved = findUnresolvedPlaceholders(message, mappings);
          if (unresolved.length > 0) {
            issues.push({
              code: 'PLACEHOLDER_UNRESOLVED',
              nodeSubtype,
              stepIndex,
              details: { unresolved },
            });
          }
        });
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

export default {
  isHtmlOrTextEmpty,
  hasVietnameseDiacritics,
  extractTopicKeywords,
  containsAnyTopicKeyword,
  findUnresolvedPlaceholders,
  resolveExpectedSteps,
  scoreGeneratedContent,
};
