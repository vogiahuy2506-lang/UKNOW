/**
 * Pure helpers to parse / normalize Gemini JSON responses for the AI campaign assistant.
 * Moved out of aiCampaign.service.js (god-object split PR1).
 */

/**
 * Trích object JSON cân bằng ĐẦU TIÊN trong chuỗi (bỏ nội dung model chèn sau nó).
 * Bám dấu ngoặc, tôn trọng chuỗi + ký tự escape để không nhầm '{' '}' trong text.
 * @param {string} text
 * @returns {string|null}
 */
export function extractFirstJsonObject(text) {
  const s = String(text || '');
  const start = s.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i += 1) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') {
      inStr = true;
    } else if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Validate workflow has DATA nodes. If not, add warning but still return.
 * @param {object} parsed
 * @returns {object}
 */
export function validateWorkflowNodes(parsed) {
  if (!parsed.nodes || !Array.isArray(parsed.nodes)) {
    return parsed;
  }

  const hasDataNode = parsed.nodes.some((n) => n.nodeType === 'data');
  if (!hasDataNode) {
    console.warn('[AI] Warning: Workflow has no DATA nodes. Consider adding condition, filter, or tag_contact nodes.');
  } else {
    console.log(`[AI] Workflow validated: ${parsed.nodes.length} nodes with DATA nodes`);
  }

  return parsed;
}

function normalizeParsedShape(parsed) {
  if (parsed.text && !parsed.content) {
    parsed.content = parsed.text;
    delete parsed.text;
  }
  if (parsed.response && !parsed.content) {
    parsed.content = parsed.response;
    delete parsed.response;
  }
  if (parsed.intent?.type && !parsed.type) {
    parsed.type = parsed.intent.type;
    delete parsed.intent;
  }

  const hasOnlyScriptData = !parsed.type && (parsed.campaignName || parsed.nodes);

  if (hasOnlyScriptData) {
    return {
      type: parsed.type || 'campaign_script',
      content: parsed.content || `Chiến dịch "${parsed.campaignName}" đã được tạo.`,
      data: parsed,
    };
  }

  if (!parsed.type) {
    parsed.type = 'text';
  }
  return validateWorkflowNodes(parsed);
}

/**
 * Robustly parse JSON from AI output.
 * @param {string} text
 * @returns {object}
 */
export function parseAiJson(text) {
  let jsonStr = String(text || '').trim();
  const jsonMatch = jsonStr.match(/```json\s*([\s\S]*?)\s*```/) || jsonStr.match(/```\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  } else {
    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
    }
  }
  jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1');

  try {
    const parsed = JSON.parse(jsonStr);
    return normalizeParsedShape(parsed);
  } catch {
    const escapeCtrl = (s) => s.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/gs, (match, p1) => {
      return `"${p1.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')}"`;
    });
    let parsed = null;
    try {
      parsed = JSON.parse(escapeCtrl(jsonStr));
    } catch {
      // Model chèn nội dung thừa SAU object JSON ("non-whitespace after JSON")
      // → chỉ lấy object JSON đầu tiên rồi thử lại (cứu được câu trả lời tốt).
      const firstObj = extractFirstJsonObject(jsonStr);
      if (firstObj) {
        try { parsed = JSON.parse(escapeCtrl(firstObj)); } catch { parsed = null; }
      }
    }
    if (!parsed || typeof parsed !== 'object') {
      // Cứu không được → trả text thân thiện. TUYỆT ĐỐI không ném ra ngoài:
      // trước đây JSON.parse(sanitized) không bọc → 500 + nuốt luôn tin người dùng.
      console.warn('[AI] parseAiJson: parse thất bại sau mọi cách, fallback text');
      const looksLikeJson = /^\s*(\{|```)/.test(String(text || ''));
      return {
        type: 'text',
        content: looksLikeJson
          ? 'Xin lỗi, tôi gặp lỗi định dạng khi tạo câu trả lời. Bạn gửi lại yêu cầu giúp tôi nhé.'
          : text,
        data: null,
        missing_fields: [],
      };
    }
    return normalizeParsedShape(parsed);
  }
}
