/**
 * Campaign Slot Filler Service (Giai đoạn 4 - Intent Compiler)
 *
 * Nhiệm vụ:
 * 1. Nhận đồ thị thực thi đã compile từ `compileCampaign` (chứa `contentSlots`).
 * 2. Gọi LLM (Gemini) với prompt tinh gọn, tập trung duy nhất vào việc soạn thảo
 *    nội dung văn bản cho các slot được chừa sẵn.
 * 3. Gán nội dung đã sinh vào đúng các bước trong đồ thị (`applySlotsToGraph`).
 * 4. Tự động sinh `templateMappings` chuẩn qua `buildCompilerTemplateMappings`.
 * 5. Chốt chặn an toàn fail-open: bất kỳ lỗi nào xảy ra (API, parse, empty) đều
 *    trả về { success: false, error } để caller rơi về luồng cũ mà không làm crash chiến dịch.
 */

import { generateGeminiContent } from '../../utils/geminiClient.util.js';
import { parseAiJson } from '../../utils/aiJsonParse.util.js';
import { buildCompilerTemplateMappings } from './campaignCompiler.service.js';
import { assertNoEmptyContent } from './campaignScriptMerge.service.js';
import { scoreGeneratedContent } from './contentQuality.util.js';
import { resolveAllowedModel } from './aiModelPolicy.service.js';
import { getNodeSubtype } from '../../utils/nodeSubtype.util.js';

export const SLOTS_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    slots: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          slotId: { type: 'string' },
          message: { type: 'string' },
        },
        required: ['slotId', 'message'],
      },
    },
  },
  required: ['slots'],
};

/**
 * Xây dựng prompt điền slot tinh gọn, tập trung chuyên sâu cho LLM.
 */
export function buildSlotFillingPrompt({ slots = [], campaignIntent = {}, brief = null, history = [] } = {}) {
  const contentBrief = campaignIntent?.contentBrief || brief || {};
  const topic = contentBrief?.topic || 'Thông báo chiến dịch';
  const targetAudience = contentBrief?.targetAudience || 'Thành viên nhóm Zalo';
  const tone = contentBrief?.tone || 'Chuyên nghiệp, thân thiện và gần gũi';
  const locale = contentBrief?.locale || 'vi';

  // Lấy yêu cầu mới nhất của người dùng từ history nếu có
  const lastUserMsg = Array.isArray(history)
    ? [...history].reverse().find((m) => m?.role === 'user')?.content || ''
    : '';

  const systemPrompt = `Bạn là chuyên gia soạn thảo nội dung Marketing Automation cho kênh Zalo Nhóm (Zalo Community/Group).
Nhiệm vụ của bạn là điền nội dung văn bản (message) chất lượng cao cho các slot được chỉ định trong chiến dịch.

QUY TẮC NỘI DUNG CHO ZALO NHÓM:
1. Thông điệp truyền thông tự nhiên, hấp dẫn, phù hợp với không khí thảo luận trong nhóm/cộng đồng Zalo.
2. Tiếng Việt chuẩn có dấu (trừ khi được yêu cầu tiếng Anh), ngữ điệu chuyên nghiệp và gần gũi, sử dụng emoji tinh tế.
3. Bắt buộc có lời kêu gọi hành động (Call To Action - CTA) rõ ràng.
4. TUYỆT ĐỐI KHÔNG để nội dung rỗng hoặc chỉ có khoảng trắng.
5. Biến cá nhân hoá: Chỉ sử dụng các biến chuẩn nếu cần thiết như {{group_name}}, hoặc câu chào chung tự nhiên như "Chào cả nhà!", "Xin chào các anh/chị!". KHÔNG bịa các biến lạ không có nguồn dữ liệu.
6. Mỗi slot trong kết quả trả về PHẢI mang đúng \`slotId\` tương ứng được yêu cầu.`;

  const slotsDescription = slots
    .map((s, idx) => {
      const stepNum = (s.stepIndex ?? idx) + 1;
      const dayNum = s.day ?? 1;
      return `- Slot ID: "${s.slotId}" | Bước ${stepNum} (Ngày ${dayNum}) | Kênh: ${s.channel || 'zalo_group'}`;
    })
    .join('\n');

  const userPrompt = `Hãy soạn thảo nội dung tin nhắn Zalo nhóm cho từng slot dưới đây.

THÔNG TIN CHIẾN DỊCH:
- Chủ đề chính: ${topic}
- Đối tượng nhận tin: ${targetAudience}
- Giọng văn: ${tone}
- Ngôn ngữ: ${locale === 'en' ? 'Tiếng Anh' : 'Tiếng Việt'}
${lastUserMsg ? `- Yêu cầu bổ sung của người dùng: "${lastUserMsg.slice(0, 500)}"` : ''}

DANH SÁCH SLOTS CẦN ĐIỀN:
${slotsDescription}

Yêu cầu trả về đúng định dạng JSON với mảng "slots" chứa slotId và message đầy đủ.`;

  return { systemPrompt, userPrompt };
}

/**
 * Gán nội dung các slots đã điền vào đồ thị compiledGraph.
 *
 * @param {object} compiledGraph - Đồ thị từ compileCampaign ({ nodes, connections, contentSlots })
 * @param {Array<{slotId: string, message: string}>} filledSlots - Mảng slots đã điền nội dung
 * @returns {{ script: object, appliedCount: number }}
 */
export function applySlotsToGraph(compiledGraph, filledSlots = []) {
  if (!compiledGraph || !Array.isArray(compiledGraph.nodes)) {
    throw new Error('Invalid compiledGraph: nodes array required');
  }

  const nodes = JSON.parse(JSON.stringify(compiledGraph.nodes));
  const connections = JSON.parse(JSON.stringify(compiledGraph.connections || []));
  const contentSlots = compiledGraph.contentSlots || [];

  const filledMap = new Map();
  for (const item of filledSlots) {
    if (item && item.slotId && typeof item.message === 'string') {
      filledMap.set(item.slotId, item.message.trim());
    }
  }

  let appliedCount = 0;

  for (let i = 0; i < contentSlots.length; i++) {
    const slot = contentSlots[i];
    // Tìm message theo slotId hoặc fallback theo index
    let message = filledMap.get(slot.slotId);
    if (!message && filledSlots[i]?.message) {
      message = filledSlots[i].message.trim();
    }

    if (!message) {
      throw new Error(`Slot ${slot.slotId || i} rỗng hoặc không có nội dung`);
    }

    const node = nodes.find((n) => n.id === slot.nodeId);
    if (!node) {
      throw new Error(`Không tìm thấy node ${slot.nodeId} trong đồ thị compiledGraph`);
    }

    const subtype = getNodeSubtype(node);

    if (subtype === 'send_zalo_group') {
      const steps = Array.isArray(node.config?.zaloGroupTemplateSteps)
        ? node.config.zaloGroupTemplateSteps
        : [];
      const stepIdx = slot.stepIndex ?? 0;

      if (!steps[stepIdx]) {
        steps[stepIdx] = {
          templateId: null,
          message: '',
          delayValue: 0,
          delayUnit: 'days',
        };
      }

      steps[stepIdx].message = message;
      steps[stepIdx].templateMappings = buildCompilerTemplateMappings(
        message,
        node.config?.zaloGroupNodeId
      );
      node.config.zaloGroupTemplateSteps = steps;
      appliedCount++;
    } else if (subtype === 'send_zalo_personal') {
      const steps = Array.isArray(node.config?.zaloPersonalTemplateSteps)
        ? node.config.zaloPersonalTemplateSteps
        : [];
      const stepIdx = slot.stepIndex ?? 0;

      if (!steps[stepIdx]) {
        steps[stepIdx] = {
          templateId: null,
          message: '',
          delayValue: 0,
          delayUnit: 'days',
        };
      }

      steps[stepIdx].message = message;
      steps[stepIdx].templateMappings = buildCompilerTemplateMappings(
        message,
        node.config?.zaloRecipientNodeId
      );
      node.config.zaloPersonalTemplateSteps = steps;
      appliedCount++;
    } else if (subtype === 'send_email') {
      const steps = Array.isArray(node.config?.emailSteps) ? node.config.emailSteps : [];
      const stepIdx = slot.stepIndex ?? 0;

      if (steps.length > 0 && steps[stepIdx]) {
        steps[stepIdx].emailBody = message;
      } else {
        node.config.emailBody = message;
      }
      appliedCount++;
    }
  }

  const script = {
    nodes,
    connections,
    contentSlots,
  };

  // Kiểm tra tính toàn vẹn: không có bước gửi nào rỗng nội dung
  assertNoEmptyContent(script);

  return { script, appliedCount };
}

/**
 * Thực hiện điền nội dung vào contentSlots bằng LLM với cơ chế fail-open an toàn.
 *
 * @param {object} params
 * @param {object} params.compiledGraph - Đồ thị từ compileCampaign ({ nodes, connections, contentSlots })
 * @param {object} params.campaignIntent - CampaignIntentV1
 * @param {object} [params.brief] - CampaignBrief nếu có
 * @param {Array}  [params.history] - Lịch sử hội thoại
 * @param {number} [params.userId]
 * @param {string} [params.requestedModel]
 * @returns {Promise<{ success: boolean, script?: object, error?: string }>}
 */
export async function fillContentSlots({
  compiledGraph,
  campaignIntent,
  brief = null,
  history = [],
  userId = null,
  requestedModel = null,
} = {}) {
  const slots = compiledGraph?.contentSlots || [];
  if (!Array.isArray(slots) || slots.length === 0) {
    return { success: false, error: 'no_slots_to_fill' };
  }

  try {
    const { systemPrompt, userPrompt } = buildSlotFillingPrompt({
      slots,
      campaignIntent,
      brief,
      history,
    });

    const modelName = await resolveAllowedModel(userId, requestedModel);

    const res = await generateGeminiContent({
      parts: [{ text: userPrompt }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      responseSchema: SLOTS_RESPONSE_SCHEMA,
      temperature: 0.7,
      timeoutMs: 30000,
      model: modelName,
    });

    const raw = res?.text || '';
    if (!raw.trim()) {
      return { success: false, error: 'empty_llm_response' };
    }

    let parsed;
    try {
      parsed = parseAiJson(raw);
    } catch (parseErr) {
      return { success: false, error: `json_parse_error: ${parseErr.message}` };
    }

    const filledSlots = Array.isArray(parsed?.slots) ? parsed.slots : [];
    if (filledSlots.length === 0) {
      return { success: false, error: 'no_slots_in_llm_response' };
    }

    // Áp nội dung vào đồ thị compiledGraph
    const { script } = applySlotsToGraph(compiledGraph, filledSlots);

    // Kiểm tra chất lượng nội dung bằng thước đo tất định 7A
    const qualityScore = scoreGeneratedContent(script, {
      locale: campaignIntent?.contentBrief?.locale || brief?.locale || 'vi',
    });

    // Nếu phát hiện lỗi nghiêm trọng (PLACEHOLDER_UNRESOLVED hoặc EMPTY_BODY)
    const fatalIssues = qualityScore.issues.filter(
      (i) => i.code === 'PLACEHOLDER_UNRESOLVED' || i.code === 'EMPTY_BODY'
    );
    if (fatalIssues.length > 0) {
      return {
        success: false,
        error: `quality_check_failed: ${fatalIssues.map((i) => i.code).join(', ')}`,
      };
    }

    return {
      success: true,
      script,
      appliedCount: filledSlots.length,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || String(err),
    };
  }
}

export default {
  SLOTS_RESPONSE_SCHEMA,
  buildSlotFillingPrompt,
  applySlotsToGraph,
  fillContentSlots,
};
