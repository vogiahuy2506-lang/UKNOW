import aiUsageMeter from '../ai/aiUsageMeter.service.js';
import { parseRouteLabel, HELP_ROUTE_LABELS } from '../../utils/helpCenter.util.js';
import { generateGeminiText } from './geminiText.util.js';
import {
  getCapabilityMapText,
  searchHelpChunks,
} from './helpCenter.service.js';
import * as helpRepo from '../../repositories/help/helpArticle.repository.js';

const CONTACT_HINT = 'Bạn có thể liên hệ hỗ trợ qua trang /contact hoặc chat với đội ngũ Founder AI.';

const OUT_OF_SCOPE_REPLY =
  'Câu hỏi này nằm ngoài phạm vi hỗ trợ của trợ lý Founder AI (hướng dẫn dùng hệ thống và hỗ trợ tạo chiến dịch/nội dung). ' +
  'Bạn hỏi về cách dùng một tính năng trên nền tảng nhé.';

const NO_DOC_REPLY =
  'Hiện chưa có hướng dẫn chi tiết cho phần này trong tài liệu hệ thống. ' +
  CONTACT_HINT;

const CLARIFY_REPLY =
  'Bạn đang cần mình **hướng dẫn cách làm** trên hệ thống, hay **làm giúp** (soạn chiến dịch/nội dung)? ' +
  'Cho mình thêm ngữ cảnh một chút nhé.';

function extractLastUserText(history = []) {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const msg = history[i];
    if (msg?.role === 'user' && String(msg.content || '').trim()) {
      return String(msg.content).trim();
    }
  }
  return '';
}

function formatSources(chunks = []) {
  const seen = new Set();
  const sources = [];
  for (const c of chunks) {
    if (!c.slug || seen.has(c.slug)) continue;
    seen.add(c.slug);
    sources.push({
      slug: c.slug,
      title: c.title,
      url: `/huong-dan/${c.slug}`,
    });
  }
  return sources;
}

const THINKING_BUDGET_RETRY_RE = /budget 0 is invalid|thinking mode|thinking_?budget/i;

async function recordRouteUsage(userId, modelName, raw) {
  try {
    await aiUsageMeter.record(userId, {
      promptTokens: Number(raw?.usageMetadata?.promptTokenCount) || 0,
      outputTokens: Number(raw?.usageMetadata?.candidatesTokenCount) || 0,
      totalTokens: Number(raw?.usageMetadata?.totalTokenCount) || 0,
    }, { feature: 'help_route', model: modelName, kind: 'generate' });
  } catch {
    // metering best-effort
  }
}

async function routeQuestion(question, userId) {
  const systemPrompt = `Bạn là bộ định tuyến ý định cho trợ lý Founder AI.
Chỉ trả về ĐÚNG MỘT trong bốn nhãn sau (không giải thích):
hỏi_đáp
làm_giúp
không_rõ
ngoài_phạm_vi

Quy tắc:
- hỏi_đáp: hỏi CÁCH DÙNG hoặc VÌ SAO (how-to, khắc phục lỗi thao tác) — KHÔNG phải yêu cầu hệ thống làm hộ
- làm_giúp: yêu cầu soạn/tạo/viết hộ chiến dịch, email, landing, nội dung marketing, tạo landing page, đọc/phân tích tệp đính kèm, chạy/sửa việc trong hệ thống
- không_rõ: quá ngắn / thiếu ngữ cảnh (vd: "Zalo")
- ngoài_phạm_vi: không liên quan sản phẩm (thời tiết, tin tức, kiến thức chung...)
- Nếu phân vân giữa hỏi_đáp và làm_giúp → chọn làm_giúp`;

  const baseArgs = {
    userId,
    systemPrompt,
    userPrompt: question,
    temperature: 0,
  };

  let text;
  let modelName;
  let raw;

  try {
    ({ text, modelName, raw } = await generateGeminiText({
      ...baseArgs,
      maxOutputTokens: 256,
      thinkingBudget: 0,
    }));
    await recordRouteUsage(userId, modelName, raw);
  } catch (err) {
    const msg = String(err?.message || '');
    if (!THINKING_BUDGET_RETRY_RE.test(msg)) {
      throw err;
    }
    // Thinking-only models (e.g. gemini-2.5-pro) reject budget 0 — retry without thinkingConfig.
    ({ text, modelName, raw } = await generateGeminiText({
      ...baseArgs,
      maxOutputTokens: 1024,
    }));
    await recordRouteUsage(userId, modelName, raw);
  }

  if (!String(text || '').trim()) {
    console.warn('[help_route] empty route label', {
      modelName,
      finishReason: raw?.candidates?.[0]?.finishReason,
    });
  }

  return parseRouteLabel(text);
}

async function answerWithDocs(question, userId) {
  const capabilityMap = await getCapabilityMapText();
  const { chunks, topSimilarity } = await searchHelpChunks(question, { userId });

  // Overview questions → capability map even without strong chunk hits.
  // "bạn có thể làm những gì" là câu khách mới vào hỏi nhiều nhất mà mẫu cũ không bắt.
  const isOverview = /làm được gì|làm những gì|làm gì|giúp (được )?gì|hỗ trợ (được )?gì|dùng để làm gì|tính năng|chức năng|hệ thống .+ (gì|nào)|overview|capabilit/i
    .test(question);

  if (!chunks.length && !isOverview) {
    await helpRepo.insertUnanswered({
      question,
      userId,
      topSimilarity: topSimilarity || null,
    });
    return {
      type: 'text',
      content: NO_DOC_REPLY,
      data: { helpRoute: HELP_ROUTE_LABELS.hỏi_đáp, sources: [], unanswered: true },
    };
  }

  const sources = formatSources(chunks);
  const chunkBlock = chunks.length
    ? chunks.map((c, i) => `[${i + 1}] (${c.slug}) ${c.content_text}`).join('\n\n')
    : '(không có đoạn khớp — dùng bản đồ năng lực)';

  const systemPrompt = `Bạn là trợ lý hướng dẫn dùng Founder AI (UKNOW).
Chỉ trả lời dựa trên BẢN ĐỒ NĂNG LỰC và CÁC ĐOẠN TÀI LIỆU bên dưới.
Nếu thiếu thông tin: nói chưa có hướng dẫn, KHÔNG bịa.
Luôn kèm link bài gốc dạng /huong-dan/<slug> khi trả lời từ tài liệu.
Trả lời tiếng Việt, ngắn gọn, có bước nếu là hướng dẫn.

${capabilityMap}

=== ĐOẠN TÀI LIỆU ===
${chunkBlock}`;

  const answerArgs = {
    userId,
    systemPrompt,
    userPrompt: question,
    temperature: 0.3,
  };

  let text;
  let modelName;
  let raw;
  try {
    // thinkingBudget: 0 → toàn bộ maxOutputTokens dành cho câu trả lời, tránh bị
    // cắt cụt vì gemini-2.5-flash tiêu token vào "thinking" mặc định.
    ({ text, modelName, raw } = await generateGeminiText({
      ...answerArgs,
      maxOutputTokens: 1536,
      thinkingBudget: 0,
    }));
  } catch (err) {
    if (!THINKING_BUDGET_RETRY_RE.test(String(err?.message || ''))) {
      throw err;
    }
    // Model chỉ-thinking (vd gemini-2.5-pro) từ chối budget 0 — bỏ thinkingConfig,
    // nới maxOutputTokens để chừa chỗ cho cả thinking lẫn câu trả lời.
    ({ text, modelName, raw } = await generateGeminiText({
      ...answerArgs,
      maxOutputTokens: 3072,
    }));
  }

  try {
    await aiUsageMeter.record(userId, {
      promptTokens: Number(raw?.usageMetadata?.promptTokenCount) || 0,
      outputTokens: Number(raw?.usageMetadata?.candidatesTokenCount) || 0,
      totalTokens: Number(raw?.usageMetadata?.totalTokenCount) || 0,
    }, { feature: 'help_answer', model: modelName, kind: 'generate' });
  } catch {
    // ignore
  }

  let content = text || NO_DOC_REPLY;
  if (sources.length) {
    const linkLines = sources.map((s) => `- [${s.title}](${s.url})`).join('\n');
    if (!content.includes('/huong-dan/')) {
      content = `${content}\n\n**Tài liệu liên quan:**\n${linkLines}`;
    }
  }

  return {
    type: 'text',
    content,
    data: {
      helpRoute: HELP_ROUTE_LABELS.hỏi_đáp,
      sources,
      topSimilarity,
    },
  };
}

/**
 * Entry for assistant chat: route then handle help branches.
 * Returns null when branch is làm_giúp or không_rõ (caller continues to aiCampaign).
 */
export async function tryHandleHelpChat({ history, userId }) {
  const question = extractLastUserText(history);
  if (!question) {
    return {
      type: 'text',
      content: CLARIFY_REPLY,
      data: { helpRoute: HELP_ROUTE_LABELS.không_rõ },
    };
  }

  const route = await routeQuestion(question, userId);

  if (route === HELP_ROUTE_LABELS.làm_giúp) {
    return null; // fall through to aiCampaign
  }

  if (route === HELP_ROUTE_LABELS.ngoài_phạm_vi) {
    return {
      type: 'text',
      content: OUT_OF_SCOPE_REPLY,
      data: { helpRoute: route },
    };
  }

  // không_rõ → fall through to AI assistant (clarifies better than a canned reply)
  if (route === HELP_ROUTE_LABELS.không_rõ) {
    return null;
  }

  return answerWithDocs(question, userId);
}

export { HELP_ROUTE_LABELS, extractLastUserText, routeQuestion };
