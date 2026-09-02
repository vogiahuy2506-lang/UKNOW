import { findBestMatchingKey, foldDiacritics } from './columnHeaderMatch.js';

/**
 * Trích xuất danh sách tên biến trong template text.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function extractTemplateVariableNames(text) {
  if (!text || typeof text !== 'string') return [];
  const matches = text.match(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g);
  if (!matches) return [];
  const keys = matches.map((m) => m.replace(/[{}]|\s/g, '').trim()).filter(Boolean);
  return Array.from(new Set(keys));
}

/**
 * Ánh xạ tên biến template sang target ngữ nghĩa.
 *
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
 * Phân giải các biến template {{...}} trong text cho frontend runtime.
 *
 * @param {string} text
 * @param {object} [options]
 * @param {Array} [options.mappings]
 * @param {object} [options.entry]
 * @param {object} [options.customer]
 * @param {Function} [options.resolveFromMappings]
 * @param {object} [options.logContext]
 * @returns {{ variables: Record<string, string>, unresolved: string[] }}
 */
export function deriveVariablesForText(text, options = {}) {
  const {
    mappings = [],
    entry = null,
    customer = null,
    resolveFromMappings = null,
    logContext = null,
  } = options;

  const varNames = extractTemplateVariableNames(text);
  if (varNames.length === 0) {
    return { variables: {}, unresolved: [] };
  }

  let explicitVars = {};
  if (Array.isArray(mappings) && mappings.length > 0) {
    if (typeof resolveFromMappings === 'function') {
      explicitVars = resolveFromMappings() || {};
    }
  }

  const dataObj = entry?.row || customer?.row || customer || entry || {};
  const dataKeys = typeof dataObj === 'object' && dataObj !== null ? Object.keys(dataObj) : [];
  const variables = {};
  const unresolved = [];

  for (const varName of varNames) {
    // 1. Ưu tiên giá trị từ explicit mappings nếu có và không rỗng
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
      `[FrontendTemplateAutoMap] Unresolved template variables [${unresolved.join(', ')}] for nodeId=${logContext.nodeId || 'n/a'} stepIndex=${logContext.stepIndex ?? 'n/a'}`
    );
  }

  return { variables, unresolved };
}

/**
 * Render template string với tự động giải biến và thay biến chưa giải bằng chuỗi rỗng.
 *
 * @param {string} text
 * @param {object} [options]
 * @returns {string}
 */
export function renderAutoMappedTemplateText(text, options = {}) {
  const safeText = String(text || '');
  if (!safeText.includes('{{')) {
    return safeText;
  }
  const { variables } = deriveVariablesForText(safeText, options);
  return safeText.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
    const value = variables?.[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

/**
 * Trộn 2 từ điển biến, ưu tiên các giá trị không rỗng từ mergedVars (node mapping).
 * Bắt đầu từ autoVars, mọi khoá trong mergedVars có giá trị khác undefined/null/chuỗi-trắng
 * sẽ ghi đè lên autoVars.
 *
 * @param {Record<string, any>} autoVars
 * @param {Record<string, any>} mergedVars
 * @returns {Record<string, any>}
 */
export function mergeVariablesPreferNonEmpty(autoVars = {}, mergedVars = {}) {
  const finalVars = { ...(autoVars || {}) };
  for (const [k, v] of Object.entries(mergedVars || {})) {
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      finalVars[k] = v;
    }
  }
  return finalVars;
}

