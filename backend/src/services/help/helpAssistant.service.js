import aiUsageMeter from '../ai/aiUsageMeter.service.js';
import { parseRouteLabel, HELP_ROUTE_LABELS } from '../../utils/helpCenter.util.js';
import { isThinkingBudgetRejection } from '../../utils/geminiClient.util.js';
import { generateGeminiText } from './geminiText.util.js';
import {
  getCapabilityMapText,
  searchHelpChunks,
} from './helpCenter.service.js';
import * as helpRepo from '../../repositories/help/helpArticle.repository.js';

const FIXED_REPLIES = {
  vi: {
    contactHint: 'Bạn có thể liên hệ hỗ trợ qua trang /contact hoặc chat với đội ngũ Founder AI.',
    outOfScope:
      'Câu hỏi này nằm ngoài phạm vi hỗ trợ của trợ lý Founder AI (hướng dẫn dùng hệ thống và hỗ trợ tạo chiến dịch/nội dung). ' +
      'Bạn hỏi về cách dùng một tính năng trên nền tảng nhé.',
    clarify:
      'Bạn đang cần mình **hướng dẫn cách làm** trên hệ thống, hay **làm giúp** (soạn chiến dịch/nội dung)? ' +
      'Cho mình thêm ngữ cảnh một chút nhé.',
    relatedDocs: 'Tài liệu liên quan',
    noChunkNote: '(không có đoạn khớp — dùng bản đồ năng lực)',
  },
  en: {
    contactHint: 'You can reach support via /contact or chat with the Founder AI team.',
    outOfScope:
      'This question is outside the Founder AI assistant scope (product how-tos and help creating campaigns/content). ' +
      'Please ask about using a feature on the platform.',
    clarify:
      'Do you need **how-to guidance** on the product, or help **doing it for you** (draft a campaign/content)? ' +
      'Add a bit more context, please.',
    relatedDocs: 'Related docs',
    noChunkNote: '(no matching passages — use the capability map)',
  },
};

function normalizeLocale(locale) {
  return String(locale || 'vi').trim().toLowerCase() === 'en' ? 'en' : 'vi';
}

function fixedReplies(locale) {
  const lang = normalizeLocale(locale);
  const base = FIXED_REPLIES[lang];
  return {
    ...base,
    noDocReply: lang === 'en'
      ? `There is no detailed guide for this yet in the system docs. ${base.contactHint}`
      : `Hiện chưa có hướng dẫn chi tiết cho phần này trong tài liệu hệ thống. ${base.contactHint}`,
  };
}

function linkRulesForLocale(locale) {
  if (normalizeLocale(locale) === 'en') {
    return `Answer in English, keep it concise, use steps for how-tos.

LINK RULES (required):
- Do NOT paste raw paths as visible text. WRONG: [/app/campaigns/new](/app/campaigns/new).
  RIGHT: use the English UI label in the sentence — e.g. "open **Create Campaign**", "go to **Business Profile** (Settings)", "use **Quick Send**".
- If you must link, add AT MOST ONE "See details" link at the END, with an English label. URL MUST be a relative path /huong-dan/<slug> — NEVER add a domain, "https://", or "founder.ai".
- Do NOT scatter extra links between steps. Do NOT add a "Original source" line.
- Write arrows as "→", never LaTeX/math arrow symbols.`;
  }
  return `Trả lời tiếng Việt, ngắn gọn, có bước nếu là hướng dẫn.

QUY TẮC LIÊN KẾT (bắt buộc):
- KHÔNG dán đường dẫn thô làm chữ hiển thị. SAI: [/app/campaigns/new](/app/campaigns/new).
  ĐÚNG: gọi tên trang bằng tiếng Việt trong câu — vd "vào **Tạo chiến dịch**", "mở **Hồ sơ doanh nghiệp** (Cài đặt)", "dùng **Gửi nhanh**".
- Nếu cần dẫn link, chỉ kèm TỐI ĐA MỘT link "Xem chi tiết" ở CUỐI, đặt nhãn tiếng Việt. URL PHẢI là đường dẫn tương đối /huong-dan/<slug> — TUYỆT ĐỐI không kèm tên miền, không "https://", không "founder.ai".
- KHÔNG rải nhiều link phụ giữa các bước. KHÔNG thêm dòng "Nguồn bài viết gốc".
- Mũi tên viết bằng ký tự "→", KHÔNG dùng ký hiệu LaTeX/toán cho mũi tên.`;
}

const OVERVIEW_RE =
  /làm được gì|làm những gì|làm gì|giúp (được )?gì|hỗ trợ (được )?gì|dùng để làm gì|tính năng|chức năng|hệ thống .+ (gì|nào)|overview|capabilit|what can (you|it|i) do|what can i do|features?|how does .+ work/i;

/** Chủ đề nhạy — không best-effort khi thiếu chunk (tránh bịa tiền/pháp lý). */
export const SENSITIVE_HELP_TOPIC_RE =
  /giá gói|bảng giá|pricing|hoá đơn|hóa đơn|thanh toán|hoàn tiền|hoan tien|refund|invoice|billing|mật khẩu|mat khau|đăng nhập|dang nhap|mã số thuế|ma so thue/i;

export function isSensitiveHelpTopic(question = '') {
  return SENSITIVE_HELP_TOPIC_RE.test(String(question || ''));
}

function softFallbackIntro(locale) {
  return normalizeLocale(locale) === 'en'
    ? 'I do not have an official help article for this yet, but typically…'
    : 'Mình chưa có tài liệu chính thức phần này, nhưng thường thì…';
}

function sensitiveNoDocReply(locale) {
  const copy = fixedReplies(locale);
  return normalizeLocale(locale) === 'en'
    ? `I should not guess on billing, login, or legal details without an official guide. ${copy.contactHint}`
    : `Mình không nên đoán thông tin về thanh toán, đăng nhập hoặc pháp lý khi chưa có hướng dẫn chính thức. ${copy.contactHint}`;
}

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
- hỏi_đáp: hỏi CÁCH DÙNG hoặc VÌ SAO (how-to, khắc phục lỗi thao tác), HOẶC hỏi thông tin đã/có thể có trong tài liệu hướng dẫn sản phẩm (FAQ, chính sách công khai, thông tin giới thiệu trên /huong-dan) — KHÔNG phải yêu cầu hệ thống làm hộ
- làm_giúp: yêu cầu soạn/tạo/viết hộ chiến dịch, email, landing, nội dung marketing, tạo landing page, đọc/phân tích tệp đính kèm, chạy/sửa việc trong hệ thống
- không_rõ: quá ngắn / thiếu ngữ cảnh (vd: "Zalo")
- ngoài_phạm_vi: không liên quan sản phẩm Founder AI (thời tiết, tin tức thế giới, kiến thức chung không gắn nền tảng...)
- Nếu phân vân giữa hỏi_đáp và làm_giúp → chọn làm_giúp
- Nếu phân vân giữa hỏi_đáp và ngoài_phạm_vi mà câu hỏi có thể là FAQ sản phẩm → chọn hỏi_đáp`;

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
    if (!isThinkingBudgetRejection(err)) {
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

async function answerWithDocs(question, userId, locale = 'vi', { allowSoftFallback = true } = {}) {
  const lang = normalizeLocale(locale);
  const copy = fixedReplies(lang);
  const capabilityMap = await getCapabilityMapText(lang);
  const { chunks, topSimilarity } = await searchHelpChunks(question, { userId, locale: lang });

  // Overview questions → capability map even without strong chunk hits.
  const isOverview = OVERVIEW_RE.test(question);

  if (!chunks.length && !isOverview) {
    await helpRepo.insertUnanswered({
      question,
      userId,
      topSimilarity: topSimilarity || null,
    });

    if (isSensitiveHelpTopic(question)) {
      return {
        type: 'text',
        content: sensitiveNoDocReply(lang),
        data: { helpRoute: HELP_ROUTE_LABELS.hỏi_đáp, sources: [], unanswered: true, softFallback: false },
      };
    }

    if (!allowSoftFallback) {
      return {
        type: 'text',
        content: copy.noDocReply,
        data: {
          helpRoute: HELP_ROUTE_LABELS.hỏi_đáp,
          sources: [],
          unanswered: true,
          softFallback: false,
          topSimilarity,
        },
      };
    }

    // Best-effort how-to với rào — vẫn backlog unanswered ở trên.
    const softSystemPrompt = `Bạn là trợ lý hướng dẫn dùng Founder AI (UKNOW).
Không có đoạn tài liệu khớp câu hỏi. Hãy trả lời best-effort dựa trên BẢN ĐỒ NĂNG LỰC bên dưới.
Bắt đầu bằng đúng câu: "${softFallbackIntro(lang)}"
QUY TẮC CỨNG:
- KHÔNG bịa số liệu, giá gói, hạn mức, điều khoản, hoá đơn, hoàn tiền, hay chính sách pháp lý.
- Chỉ hướng dẫn thao tác chung trên sản phẩm; nếu không chắc → bảo người dùng liên hệ hỗ trợ.
${linkRulesForLocale(lang)}

${capabilityMap}

=== ĐOẠN TÀI LIỆU ===
(không có đoạn khớp)`;

    const softArgs = {
      userId,
      systemPrompt: softSystemPrompt,
      userPrompt: question,
      temperature: 0.3,
    };
    let softText;
    let softModel;
    let softRaw;
    try {
      ({ text: softText, modelName: softModel, raw: softRaw } = await generateGeminiText({
        ...softArgs,
        maxOutputTokens: 1024,
        thinkingBudget: 0,
      }));
    } catch (err) {
      if (!isThinkingBudgetRejection(err)) throw err;
      ({ text: softText, modelName: softModel, raw: softRaw } = await generateGeminiText({
        ...softArgs,
        maxOutputTokens: 2048,
      }));
    }
    try {
      await aiUsageMeter.record(userId, {
        promptTokens: Number(softRaw?.usageMetadata?.promptTokenCount) || 0,
        outputTokens: Number(softRaw?.usageMetadata?.candidatesTokenCount) || 0,
        totalTokens: Number(softRaw?.usageMetadata?.totalTokenCount) || 0,
      }, { feature: 'help_answer_soft', model: softModel, kind: 'generate' });
    } catch {
      // ignore
    }

    return {
      type: 'text',
      content: softText || copy.noDocReply,
      data: { helpRoute: HELP_ROUTE_LABELS.hỏi_đáp, sources: [], unanswered: true, softFallback: true },
    };
  }

  const sources = formatSources(chunks);
  const chunkBlock = chunks.length
    ? chunks.map((c, i) => `[${i + 1}] (${c.slug}) ${c.content_text}`).join('\n\n')
    : copy.noChunkNote;

  const systemPrompt = `Bạn là trợ lý hướng dẫn dùng Founder AI (UKNOW).
Chỉ trả lời dựa trên BẢN ĐỒ NĂNG LỰC và CÁC ĐOẠN TÀI LIỆU bên dưới.
Nếu thiếu thông tin: nói chưa có hướng dẫn, KHÔNG bịa.
${linkRulesForLocale(lang)}

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
    if (!isThinkingBudgetRejection(err)) {
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

  let content = text || copy.noDocReply;
  if (sources.length) {
    const linkLines = sources.map((s) => `- [${s.title}](${s.url})`).join('\n');
    if (!content.includes('/huong-dan/')) {
      content = `${content}\n\n**${copy.relatedDocs}:**\n${linkLines}`;
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
export async function tryHandleHelpChat({ history, userId, locale = 'vi' } = {}) {
  const lang = normalizeLocale(locale);
  const copy = fixedReplies(lang);
  const question = extractLastUserText(history);
  if (!question) {
    return {
      type: 'text',
      content: copy.clarify,
      data: { helpRoute: HELP_ROUTE_LABELS.không_rõ },
    };
  }

  const route = await routeQuestion(question, userId);

  if (route === HELP_ROUTE_LABELS.làm_giúp) {
    return null; // fall through to aiCampaign
  }

  if (route === HELP_ROUTE_LABELS.ngoài_phạm_vi) {
    // Vẫn thử RAG trước: bài hướng dẫn mới (FAQ, giới thiệu…) có thể khớp dù
    // router nghĩ "kiến thức chung". Chỉ reject khi không có đoạn tài liệu.
    // Tắt soft-fallback ở nhánh này — tránh trả lời thời tiết bằng capability map.
    const docsAnswer = await answerWithDocs(question, userId, lang, { allowSoftFallback: false });
    if (Array.isArray(docsAnswer?.data?.sources) && docsAnswer.data.sources.length > 0) {
      return {
        ...docsAnswer,
        data: {
          ...docsAnswer.data,
          helpRoute: HELP_ROUTE_LABELS.hỏi_đáp,
          recoveredFromOutOfScope: true,
        },
      };
    }
    return {
      type: 'text',
      content: copy.outOfScope,
      data: { helpRoute: route },
    };
  }

  // không_rõ → fall through to AI assistant (clarifies better than a canned reply)
  if (route === HELP_ROUTE_LABELS.không_rõ) {
    return null;
  }

  return answerWithDocs(question, userId, lang);
}

export { HELP_ROUTE_LABELS, extractLastUserText, routeQuestion, normalizeLocale, OVERVIEW_RE };
