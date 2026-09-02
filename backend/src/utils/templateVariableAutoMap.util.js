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

import { foldDiacritics, findBestMatchingKey } from './columnHeaderMatch.util.js';

export const TEMPLATE_VARIABLE_REGEX = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

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
    const value = variables?.[varName];
    return value === undefined || value === null ? '' : String(value);
  });
}

/**
 * Ánh xạ tên biến sang target field của semantic matcher.
 * @param {string} varName
 * @returns {'name'|'email'|'phone'|null}
 */
export function mapVariableToSemanticTarget(varName) {
  const norm = foldDiacritics(varName).replace(/[_-]/g, ' ').trim();
  if (
    /^(name|ten|ho ten|ho va ten|fullname|full name|customer name|recipient name)$/i.test(norm) ||
    norm.includes('ho ten') ||
    norm.includes('fullname') ||
    norm.includes('full name') ||
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
    /^(phone|sdt|dien thoai|so dt|so dien thoai|mobile|tel|telephone)$/i.test(norm) ||
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
