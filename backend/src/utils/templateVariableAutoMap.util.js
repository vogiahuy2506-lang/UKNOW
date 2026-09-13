/**
 * Tiện ích tự động suy ra và render biến template khi templateMappings rỗng.
 *
 * Quy tắc:
 * 1. Không hồi quy khi mappings đã có sẵn (ưu tiên tuyệt đối resolveFromMappings).
 * 2. Tự động suy ra biến từ entry.row / customer theo:
 *    - Khớp chính xác tên key (dataObj[varName])
 *    - Khớp ngữ nghĩa không phân biệt hoa thường và dấu tiếng Việt (foldDiacritics):
 *      'name': full_name, fullname, name, ten, ho_ten, ho_va_ten, customer_name, recipient_name...
 *      'email': email, mail, dia_chi_email...
 *      'phone': phone, sdt, so_dien_thoai, dien_thoai, tel, telephone, mobile...
 * 3. Log warning với context khi có biến unresolved (không ném lỗi chặn gửi).
 */

import { foldDiacritics, normalizeHeaderKey, findBestMatchingKey } from './columnHeaderMatch.util.js';

// Trước đây chỉ nhận [a-zA-Z0-9_.-] — trợ lý AI sinh {{Họ Tên}} (có dấu, có khoảng trắng) thì
// trích ra mảng RỖNG, trạng thái đó trùng khớp "tin không có biến nào" nên mọi lớp phòng thủ
// phía sau (deriveVariablesForText, cổng mappings.length...) không có gì để bắt. Dùng [^{}]+?
// (không liệt kê ký tự cho phép) để MỌI cách đặt tên tương lai đều lọt vào tầm nhìn thay vì trở
// nên vô hình — bù lại bằng chặn cửa sập ở deriveVariablesForText/neutralizeUnresolvedTemplateVariables
// (không throw khi khớp nhầm đoạn không phải biến, xem trong hàm).
export const TEMPLATE_VARIABLE_REGEX = /\{\{\s*([^{}]+?)\s*\}\}/g;

/**
 * Trích xuất danh sách tên biến duy nhất từ một chuỗi template.
 * @param {string} text
 * @returns {string[]}
 */
export function extractTemplateVariableNames(text) {
  if (!text || typeof text !== 'string' || !text.includes('{{')) {
    return [];
  }
  const matches = new Set();
  const re = new RegExp(TEMPLATE_VARIABLE_REGEX.source, 'g');
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match[1]) {
      matches.add(match[1].trim());
    }
  }
  return Array.from(matches);
}

/**
 * Thay thế biến template trong text bằng giá trị tương ứng.
 * Biến không tìm thấy được thay bằng chuỗi rỗng.
 *
 * @param {string} templateText
 * @param {Record<string, any>} [variables]
 * @returns {string}
 */
export function renderTemplateText(templateText, variables = {}) {
  return String(templateText || '').replace(TEMPLATE_VARIABLE_REGEX, (_match, varName) => {
    // trim() để khớp đúng khoá đã lưu trong `variables` — extractTemplateVariableNames() cũng
    // trim() tên biến trích ra, hai bên phải khớp tuyệt đối kể cả khi regex để lọt khoảng trắng.
    const value = variables?.[String(varName || '').trim()];
    return value === undefined || value === null ? '' : String(value);
  });
}

/**
 * Ánh xạ tên biến sang target field của semantic matcher.
 * @param {string} varName
 * @returns {'name'|'email'|'phone'|null}
 */
export function mapVariableToSemanticTarget(varName) {
  const norm = normalizeHeaderKey(varName);
  if (
    /^(name|ten|ho ten|ho va ten|fullname|full name|customer name|recipient name|ten khach hang)$/i.test(norm) ||
    norm.includes('ho ten') ||
    norm.includes('ho va ten') ||
    norm.includes('fullname') ||
    norm.includes('full name') ||
    norm.includes('customer name') ||
    norm.includes('recipient name') ||
    norm.includes('ten khach')
  ) {
    return 'name';
  }
  if (
    /^(email|mail|dia chi email|email address|thu dien tu)$/i.test(norm) ||
    norm.includes('email') ||
    norm.includes('mail')
  ) {
    return 'email';
  }
  if (
    /^(phone|sdt|dien thoai|so dt|so dien thoai|mobile|tel|telephone|phone number)$/i.test(norm) ||
    norm.includes('sdt') ||
    norm.includes('dien thoai') ||
    norm.includes('so dt') ||
    norm.includes('phone')
  ) {
    return 'phone';
  }
  return null;
}

/**
 * Phân giải các biến template {{...}} trong text.
 *
 * @param {string} text
 * @param {object} [options]
 * @param {Array} [options.mappings]
 * @param {object} [options.entry]
 * @param {object} [options.customer]
 * @param {string|number} [options.fallbackNodeId]
 * @param {Function} [options.resolveFromMappings]
 * @param {object} [options.logContext]
 * @returns {{ variables: Record<string, string>, unresolved: string[] }}
 */
export function deriveVariablesForText(text, options = {}) {
  const {
    mappings = [],
    entry = null,
    customer = null,
    fallbackNodeId = '',
    resolveFromMappings = null,
    logContext = null,
  } = options;

  const varNames = extractTemplateVariableNames(text);
  if (varNames.length === 0) {
    return { variables: {}, unresolved: [] };
  }

  let explicitVars = {};
  if (Array.isArray(mappings) && mappings.length > 0) {
    if (typeof resolveFromMappings !== 'function') {
      throw new Error(
        'deriveVariablesForText: resolveFromMappings function is required when mappings array is non-empty'
      );
    }
    explicitVars = resolveFromMappings({ mappings, entry, customer, fallbackNodeId }) || {};
  }

  const dataObj = entry?.row || customer?.row || customer || entry || {};
  const dataKeys = typeof dataObj === 'object' && dataObj !== null ? Object.keys(dataObj) : [];
  const variables = {};
  const unresolved = [];

  for (const varName of varNames) {
    // 1. Ưu tiên giá trị từ resolveFromMappings nếu có và không rỗng
    if (
      explicitVars[varName] !== undefined &&
      explicitVars[varName] !== null &&
      String(explicitVars[varName]).trim() !== ''
    ) {
      variables[varName] = String(explicitVars[varName]);
      continue;
    }

    // 2a. Khớp chính xác tên key trong dataObj (case-sensitive và case-insensitive)
    if (
      dataObj[varName] !== undefined &&
      dataObj[varName] !== null &&
      String(dataObj[varName]).trim() !== ''
    ) {
      variables[varName] = String(dataObj[varName]);
      continue;
    }

    const exactInsensitiveKey = dataKeys.find((k) => k.toLowerCase() === varName.toLowerCase());
    if (
      exactInsensitiveKey &&
      dataObj[exactInsensitiveKey] !== undefined &&
      dataObj[exactInsensitiveKey] !== null &&
      String(dataObj[exactInsensitiveKey]).trim() !== ''
    ) {
      variables[varName] = String(dataObj[exactInsensitiveKey]);
      continue;
    }

    // 2b. Khớp ngữ nghĩa (Semantic Match) có hỗ trợ dấu tiếng Việt
    const semanticTarget = mapVariableToSemanticTarget(varName);
    let matchedKey = null;
    if (semanticTarget) {
      matchedKey = findBestMatchingKey(dataKeys, semanticTarget);
    }

    // Nếu chưa tìm được qua semantic target, thử khớp theo foldDiacritics
    if (!matchedKey) {
      const foldedVar = foldDiacritics(varName).replace(/[ _-]/g, '');
      matchedKey =
        dataKeys.find((k) => {
          const foldedK = foldDiacritics(k).replace(/[ _-]/g, '');
          return foldedK === foldedVar;
        }) || null;
    }

    if (
      matchedKey &&
      dataObj[matchedKey] !== undefined &&
      dataObj[matchedKey] !== null &&
      String(dataObj[matchedKey]).trim() !== ''
    ) {
      variables[varName] = String(dataObj[matchedKey]);
    } else {
      // Lưới an toàn: khi biến nhóm "tên người" không giải được (ví dụ SĐT nhập tay), thay bằng "bạn" thay vì chuỗi rỗng
      // CHỈ áp dụng cho biến tên người (semanticTarget === 'name'), TUYỆT ĐỐI không áp dụng cho các biến khác.
      if (semanticTarget === 'name') {
        variables[varName] = 'bạn';
      } else {
        variables[varName] = '';
      }
      unresolved.push(varName);
    }
  }

  // Log warning nếu có unresolved variables
  if (unresolved.length > 0 && logContext) {
    console.warn(
      `[TemplateAutoMap] Unresolved template variables [${unresolved.join(', ')}] for campaignRunId=${logContext.runId || 'n/a'} nodeId=${logContext.nodeId || 'n/a'} stepIndex=${logContext.stepIndex ?? 'n/a'}`
    );
  }

  return { variables, unresolved };
}

/**
 * Render text với biến được suy ra tự động hoặc từ mappings.
 *
 * @param {string} text
 * @param {object} [options]
 * @returns {string}
 */
export function renderAutoMappedTemplateText(text, options = {}) {
  if (!text || typeof text !== 'string' || !text.includes('{{')) {
    return String(text || '');
  }
  const { variables } = deriveVariablesForText(text, options);
  return renderTemplateText(text, variables);
}

/**
 * Chặn cửa sập cuối cùng, gọi NGAY TRƯỚC provider (Zalo/email) — không phải chữa hình dạng biến
 * (đó là TEMPLATE_VARIABLE_REGEX ở trên), mà là chốt chặn tái diễn: bất kể vì lý do gì (mapping
 * trỏ nhầm cột, sinh biến ngoài mọi hình dạng regex nhận được, resolveFromMappings bỏ sót...)
 * mà text cuối cùng còn "{{", đây là lần cuối để không gửi "{{...}}" nguyên văn tới khách.
 *
 * KHÔNG BAO GIỜ throw. [^{}]+? ở TEMPLATE_VARIABLE_REGEX có thể khớp nhầm đoạn không phải biến
 * (văn bản thường chứa dấu ngoặc nhọn) — khớp nhầm thì cũng chỉ rơi về giá trị trung tính, ném
 * lỗi ở đây sẽ làm chết cả lượt gửi vì một câu chữ vô hại.
 *
 * @param {string} text văn bản đã render, ngay trước khi gọi provider gửi thật
 * @param {{campaignId?: string|number, nodeId?: string|number}} [logContext]
 * @returns {string}
 */
export function neutralizeUnresolvedTemplateVariables(text, logContext = null) {
  const str = String(text || '');
  if (!str.includes('{{')) return str;

  const leftoverNames = [];
  const re = new RegExp(TEMPLATE_VARIABLE_REGEX.source, 'g');
  let cleaned = str.replace(re, (_match, rawVarName) => {
    const varName = String(rawVarName || '').trim();
    leftoverNames.push(varName);
    return mapVariableToSemanticTarget(varName) === 'name' ? 'bạn' : '';
  });

  if (leftoverNames.length === 0) return cleaned;

  // Dọn khoảng trắng thừa và dấu câu lạc lại do thay biến bằng chuỗi rỗng
  // (vd "Chào , !" -> "Chào, !" -> "Chào!"; "  " -> " ").
  cleaned = cleaned
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/([,.!?;:])\s*\1+/g, '$1')
    .trim();

  console.warn(
    `[TemplateAutoMap] Chặn cửa sập trước khi gửi — còn biến chưa giải [${leftoverNames.join(', ')}] `
    + `campaignId=${logContext?.campaignId ?? 'n/a'} nodeId=${logContext?.nodeId ?? 'n/a'}`
  );

  return cleaned;
}
