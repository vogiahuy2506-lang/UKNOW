/**
 * Hero Consultation Service
 *
 * Provides AI consultation chat for the hero/landing page widget.
 * - No auth required (public access)
 * - 5 free chats per visitor (tracked by visitorId)
 * - Daily cap per IP (HERO_IP_DAILY_CAP = 30) with VN day calendar key
 * - Uses Gemini with RAG-style data from database
 * - DIFFERENT from /app chatbot which uses RAG and credit system
 * - ONLY answers with verified data from database, no hallucinations
 */

import IORedis from 'ioredis';
import { ipKeyGenerator } from 'express-rate-limit';
import db from '../config/database.js';
import { vnDayKey } from '../utils/vnTimeFormat.util.js';
import { resolveAllowedModel } from './ai/aiModelPolicy.service.js';
import aiUsageMeter from './ai/aiUsageMeter.service.js';
import { extractGeminiUsage } from '../utils/geminiClient.util.js';
import { DEFAULT_AI_MODEL } from '../utils/aiModelTier.util.js';
import { toPublicPlanAdviceDto } from './help/planAdvisor.service.js';
import { isPlaceholderPlan } from '../utils/placeholderPlan.util.js';

const MAX_FREE_CHATS = 5;
// Tin nhắn vào thẳng prompt, không đăng nhập → trần cứng (D-01). Dài hơn → 400, không tốn lượt/không gọi AI.
export const HERO_MAX_MESSAGE_CHARS = 1000;
export const HERO_BUSY_MESSAGE =
  'Tư vấn viên đang bận, bạn vui lòng để lại số điện thoại hoặc email, đội ngũ Founder AI sẽ liên hệ lại với bạn sớm nhất nhé.';
const VISITOR_QUOTA_TTL_SEC = 24 * 60 * 60; // 24 hours
const DAY_COUNTER_TTL_SEC = 172800; // 48 hours for calendar day cleanup

function envInt(name, fallback) {
  const parsed = Number.parseInt(String(process.env[name] || '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildRedisConfig() {
  const redisUrl = String(
    process.env.BULLMQ_REDIS_URL || process.env.REDIS_URL || ''
  ).trim();
  if (redisUrl) return redisUrl;

  const host = String(process.env.REDIS_HOST || '127.0.0.1').trim();
  const port = Number.parseInt(process.env.REDIS_PORT || '6379', 10);
  const db = Number.parseInt(process.env.REDIS_DB || '0', 10);
  const password = String(process.env.REDIS_PASSWORD || '').trim();
  return {
    host,
    port: Number.isFinite(port) ? port : 6379,
    db: Number.isFinite(db) ? db : 0,
    ...(password ? { password } : {}),
  };
}

/**
 * In-memory fallback counters when Redis is unavailable.
 * Key -> { count, expiresAt }
 */
const memoryCounters = new Map();

function memoryIncr(key, windowSec) {
  const now = Date.now();
  const existing = memoryCounters.get(key);
  if (!existing || existing.expiresAt <= now) {
    memoryCounters.set(key, { count: 1, expiresAt: now + windowSec * 1000 });
    return 1;
  }
  existing.count += 1;
  return existing.count;
}

function memoryGetCount(key) {
  const existing = memoryCounters.get(key);
  if (!existing || existing.expiresAt <= Date.now()) return 0;
  return Number(existing.count) || 0;
}

// In-memory cache for founderAI data (refreshed periodically)
// IMPORTANT: Start with null to force fetch from DB on first request
let founderaiDataCache = null;
const DATA_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes (reduced for fresher data)

/**
 * Fetch founderAI data from database
 * Only returns public, non-sensitive information
 */
async function fetchFounderaiData() {
  const now = Date.now();
  
  // Return cache if still valid
  if (founderaiDataCache && founderaiDataCache.lastUpdated && (now - founderaiDataCache.lastUpdated) < DATA_CACHE_TTL_MS) {
    return founderaiDataCache;
  }

  try {
    // Fetch active plans (public pricing only) - use SELECT * for safety
    const plansResult = await db.query(
      `SELECT * FROM plans WHERE is_active = true AND is_custom = false ORDER BY price ASC`
    );

    // Fetch published courses
    const coursesResult = await db.query(
      `SELECT course_name, description, price, category, thumbnail_url
       FROM courses 
       WHERE status = 'publish' AND price > 0
       ORDER BY created_at DESC
       LIMIT 20`
    );

    founderaiDataCache = {
      plans: plansResult.rows || [],
      courses: coursesResult.rows || [],
      lastUpdated: now,
    };

    console.log('[HeroConsultation] Fetched plans from DB:', plansResult.rows?.length || 0, 'rows');
    console.log('[HeroConsultation] Fetched courses from DB:', coursesResult.rows?.length || 0, 'rows');
    if (plansResult.rows?.length > 0) {
      console.log('[HeroConsultation] Plans:', plansResult.rows.map(p => `${p.name}: ${p.price}`).join(', '));
    }

    return founderaiDataCache;
  } catch (error) {
    console.error('[HeroConsultation] Error fetching founderAI data:', error);
    // Return cached data if available, even if expired
    if (founderaiDataCache && (founderaiDataCache.plans.length > 0 || founderaiDataCache.courses.length > 0)) {
      console.log('[HeroConsultation] Using stale cache due to DB error');
      return founderaiDataCache;
    }
    // Return empty data if no cache - DO NOT use hardcoded fallback
    console.log('[HeroConsultation] NO CACHE AVAILABLE - returning empty data');
    return {
      plans: [],
      courses: [],
      lastUpdated: now,
    };
  }
}

/** Trang bảng giá thật (route `/pricing` ở frontend/src/App.jsx). */
export const HERO_PRICING_URL = 'founderai.biz/pricing';
/** Trang đăng ký thật (route `/register` ở frontend/src/App.jsx) — KHÔNG phải digiso.vn. */
export const HERO_REGISTER_URL = 'founderai.biz/register';

/**
 * Khi không có dữ liệu gói (DB lỗi, chưa nạp được): TUYỆT ĐỐI không dùng giá ghi cứng — bản cũ có bảng gói dự phòng với
 * giá + "A/B Testing", "CRM" không có thật. Chỉ dẫn khách tới bảng giá thật.
 */
export const HERO_PLANS_UNAVAILABLE_TEXT =
  `Hiện chưa tải được danh sách gói. KHÔNG tự nêu giá hay hạn mức; khi khách hỏi về giá, hãy mời khách xem bảng giá tại ${HERO_PRICING_URL}.`;

const fmtInt = (n) => String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/**
 * Hạn mức của gói, lấy từ ĐÚNG các cột `plans` qua toPublicPlanAdviceDto (cùng ngữ nghĩa trợ lý tư vấn gói: null = không giới
 * hạn, 0 = gói không có). Cột không rõ thì bỏ qua — không đoán.
 */
function formatPlanLimits(plan) {
  const lim = toPublicPlanAdviceDto(plan)?.limits;
  if (!lim) return '';
  // Hạn mức reset theo chu kỳ của gói (billingCycle: duration_days, mặc định 30). Gói NGẮN hơn 30 ngày (vd dùng thử 14 ngày)
  // thì "300 email/tháng" là sai — chỉ được dùng 300 email trong CẢ 14 ngày. Gói ≥ 30 ngày giữ "/tháng".
  const days = planDurationDays(plan);
  const shortPlan = days > 0 && days < 30;
  const per = shortPlan ? ` trong ${days} ngày` : '/tháng';
  const perPeriod = shortPlan ? ` trong ${days} ngày` : ' mỗi kỳ';
  const part = (limit, { limited, unlimited, none }) => {
    if (limit?.kind === 'limited') return limited(fmtInt(limit.value));
    if (limit?.kind === 'unlimited') return unlimited;
    if (limit?.kind === 'unsupported') return none;
    return null;
  };
  const parts = [
    part(lim.emailPerMonth, { limited: (n) => `${n} email${per}`, unlimited: 'email không giới hạn', none: 'không gửi email' }),
    part(lim.zaloPerMonth, { limited: (n) => `${n} tin Zalo${per}`, unlimited: 'tin Zalo không giới hạn', none: 'không gửi Zalo' }),
    part(lim.landingPages, { limited: (n) => `${n} landing page`, unlimited: 'landing page không giới hạn', none: 'không có landing page' }),
    part(lim.aiCreditsPerPeriod, { limited: (n) => `${n} lượt AI${perPeriod}`, unlimited: 'lượt AI không giới hạn', none: 'không có lượt AI' }),
  ].filter(Boolean);
  return parts.length > 0 ? `Hạn mức: ${parts.join('; ')}.` : '';
}

/** Độ dài kỳ của gói theo ngày — NULL/không đọc được = 30 như billing (`COALESCE(duration_days, 30)`). */
function planDurationDays(plan) {
  return Math.trunc(Number(plan?.duration_days)) || 30;
}

/**
 * Hậu tố kỳ tính giá theo `plans.duration_days`: `price` là giá của MỘT kỳ dài `duration_days` ngày (billing đọc
 * `COALESCE(duration_days, 30)` — billingCycle.util.js, payment.repository.js). Bản cũ in "VND/thang" bất kể độ dài kỳ nên gói
 * 365 ngày hay gói dùng thử 10 ngày đều bị bot báo là giá theo tháng (D-16). 30 → /tháng, 365 → /năm, khác → /N ngày.
 */
export function formatPlanPeriodSuffix(durationDays) {
  const days = planDurationDays({ duration_days: durationDays });
  if (days <= 0 || days === 30) return '/tháng';
  if (days === 365) return '/năm';
  return `/${days} ngày`;
}

/**
 * Mã tính năng NỘI BỘ trong `plans.features` (dùng bật/tắt tính năng — usageTracking.canUseFeature, migration 033) → nhãn tiếng
 * Việt. Mã không có nhãn bị BỎ: bản cũ in thẳng "unified_inbox, multi_language" cho khách (D-16). Mỗi nhãn kèm bằng chứng:
 *  - unified_inbox : Hộp thư hợp nhất (services/chatbot/unifiedInbox.service.js, trang /app/settings/inbox)
 *  - multi_language: "Đa ngôn ngữ" — cùng nhãn frontend/src/utils/planTranslation.util.js (multi_language → multiLanguage)
 */
const PLAN_FEATURE_CODE_LABELS = Object.freeze({
  unified_inbox: 'Hộp thư hợp nhất cho các kênh chat',
  multi_language: 'Đa ngôn ngữ',
});
const PLAN_FEATURE_CODE_RE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;
const PLAN_FEATURE_MAX = 8;
const PLAN_FEATURE_MAX_LEN = 120;

/**
 * `plans.features` là JSONB do admin nhập: mảng chuỗi tiếng Việt, mảng `{vi, en}`, chuỗi JSON, hoặc mã nội bộ. Trả về nhãn
 * tiếng Việt đọc được cho khách (tối đa PLAN_FEATURE_MAX).
 */
export function planFeatureLabels(rawFeatures) {
  let raw = rawFeatures;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { raw = [raw]; }
  }
  let list = [];
  if (Array.isArray(raw)) list = raw;
  else if (raw && typeof raw === 'object') list = Object.keys(raw).filter((k) => raw[k]);

  const out = [];
  for (const item of list) {
    let value = item;
    if (typeof value === 'string' && value.trim().startsWith('{')) {
      try { value = JSON.parse(value); } catch { /* chuỗi thường bắt đầu bằng { */ }
    }
    if (value && typeof value === 'object') value = value.vi || value.en || '';
    let text = String(value ?? '').trim();
    if (!text) continue;
    if (PLAN_FEATURE_CODE_RE.test(text)) text = PLAN_FEATURE_CODE_LABELS[text] || '';
    if (!text) continue;
    text = text.slice(0, PLAN_FEATURE_MAX_LEN);
    if (!out.includes(text)) out.push(text);
    if (out.length >= PLAN_FEATURE_MAX) break;
  }
  return out;
}

/**
 * "Gói Tùy chọn" / "Liên hệ" trên bảng giá là gói GIỮ CHỖ: price 0 và mọi hạn mức NULL — NULL nghĩa là "không giới hạn" ở mọi
 * chốt chặn, nên in ra thì bot báo khách có gói 0đ không giới hạn (đã thấy trên production: plans id 18, code 'custom',
 * is_custom=false). Dùng ĐÚNG luật của backend/frontend (placeholderPlan.util.isPlaceholderPlan ↔ planTranslation.util
 * isContactPlan): không in giá, không in hạn mức, không in tính năng — chỉ dẫn khách tới bảng giá / liên hệ.
 */
const PLACEHOLDER_PLAN_TEXT = Object.freeze({
  custom: {
    price: `giá tính theo lựa chọn, xem tại ${HERO_PRICING_URL}`,
    line: (name) => `- ${name}: tự chọn số lượng email, tin Zalo, lượt AI… theo nhu cầu; giá tính theo lựa chọn, xem tại ${HERO_PRICING_URL}.`,
  },
  contact: {
    price: 'liên hệ để được báo giá (xem phần THÔNG TIN LIÊN HỆ HỖ TRỢ)',
    line: (name) => `- ${name}: liên hệ để được báo giá (xem phần THÔNG TIN LIÊN HỆ HỖ TRỢ).`,
  },
});
const placeholderText = (plan) => PLACEHOLDER_PLAN_TEXT[String(plan?.code || '').trim().toLowerCase()];

/** Giá gói in kèm ĐÚNG kỳ tính giá; gói tính theo tháng có giá năm thì nêu thêm giá năm. `plans.price` là NUMERIC/BIGINT → pg trả chuỗi. */
export function formatPlanPriceInfo(plan) {
  if (isPlaceholderPlan(plan)) return placeholderText(plan).price;
  const price = Number(plan?.price) || 0;
  let priceInfo = `${fmtInt(price)} VND${formatPlanPeriodSuffix(plan?.duration_days)}`;
  const priceYearly = Number(plan?.price_yearly) || 0;
  // Giá năm chỉ có nghĩa khi giá gốc là giá THÁNG (kỳ 30 ngày) — gói 365 ngày đã là giá năm rồi.
  if (priceYearly > 0 && formatPlanPeriodSuffix(plan?.duration_days) === '/tháng') {
    priceInfo += `; hoặc ${fmtInt(priceYearly)} VND/năm nếu thanh toán cả năm (khoảng ${fmtInt(priceYearly / 12)} VND/tháng)`;
  }
  return priceInfo;
}

/**
 * Format plans for AI context (safe public data only)
 */
export function formatPlansForContext(plans) {
  if (!plans || plans.length === 0) {
    return HERO_PLANS_UNAVAILABLE_TEXT;
  }

  return plans.map((plan) => {
    if (isPlaceholderPlan(plan)) return placeholderText(plan).line(plan.name);
    const features = planFeatureLabels(plan.features);
    const limitsStr = formatPlanLimits(plan);
    return `- ${plan.name}: ${formatPlanPriceInfo(plan)}. ${limitsStr ? `${limitsStr} ` : ''}${features.length > 0 ? `Tính năng: ${features.join(', ')}.` : ''}`.trimEnd();
  }).join('\n\n');
}

/**
 * Format courses for AI context (safe public data only)
 */
export function formatCoursesForContext(courses) {
  if (!courses || courses.length === 0) {
    return '';
  }

  return courses.slice(0, 10).map(course => {
    const price = course.price || 0;
    const category = course.category ? ` (${course.category})` : '';
    return `${course.course_name}${category}: ${price.toLocaleString('vi-VN')} VND`;
  }).join('\n');
}

async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  // Model do super admin chọn, như mọi tính năng AI khác. Bản cũ đọc thẳng GEMINI_MODEL trong .env
  // (không có thì 'gemini-2.5-flash') nên chat tư vấn trang chủ là đường duy nhất phía khách KHÔNG
  // theo lựa chọn của admin — đổi model ở trang quản trị không tác động tới nó.
  //
  // Khung chat này cố ý sống sót khi CSDL lỗi (getFounderAIData dùng lại dữ liệu cũ). Đọc model
  // cũng phải vậy: bộ đệm danh mục nguội mà CSDL lỗi thì resolveAllowedModel NÉM lỗi, nên rơi về
  // model dự phòng thay vì làm hỏng khung chat bán hàng trên trang công khai.
  const model = await resolveAllowedModel(null).catch((err) => {
    console.warn(`[HeroConsultation] Không đọc được model hệ thống, dùng ${DEFAULT_AI_MODEL}: ${err?.message}`);
    return DEFAULT_AI_MODEL;
  });

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3, // Lower temperature for factual responses
      maxOutputTokens: 2048,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.error?.message || `Gemini API error: ${response.status}`);
    }

    const data = await response.json();

    // Khách vãng lai không có tài khoản → ghi token với id_user NULL (migration 273), feature `hero_consultation`. Google tính
    // tiền các lượt này (≤ 30/ngày/IP) nhưng bản cũ không ghi gì. KHÔNG await: khung chat này cố ý sống sót khi CSDL lỗi
    // (xem chú thích đầu hàm), mà chờ ghi sẽ kéo dài phản hồi tới connectionTimeoutMillis của pool. `record` không bao giờ
    // ném lỗi (tự console.error nếu ghi hụt) nên bỏ mặc promise là an toàn.
    Promise.resolve(
      aiUsageMeter.record(null, extractGeminiUsage(data), { feature: 'hero_consultation', model })
    ).catch(() => {});

    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Prompt tư vấn trang chủ — hàm THUẦN (không DB, không mạng) để spec dựng prompt thật và quét nội dung.
 *
 * Khối "GIẢI PHÁP TỔNG HỢP" CHỈ gồm tính năng đang có thật (đối chiếu từng mục với route ở frontend/src/App.jsx và dịch vụ ở
 * backend/src). Bản cũ (D-03, 03/10/2026) khẳng định A/B testing, ZNS, chấm điểm lead, báo cáo Excel/PDF, "chatbot theo kịch
 * bản", đăng ký ở digiso.vn và "đội ngũ DIGISO hỗ trợ thiết lập" — không có thật / không đúng trang / là cam kết dịch vụ, và
 * vô hiệu luôn quy tắc 1 của chính prompt ("chỉ trả lời theo DỮ LIỆU DATABASE").
 */
export function buildHeroSystemPrompt({ plansText, coursesText, message }) {
  return `Bạn là "Foundy - Trợ Lý AI" của Founder AI (founderai.biz) - sản phẩm của công ty DIGISO.

═══════════════════════════════════════════════════════════════════
QUY TẮC BẮT BUỘC (TUÂN THỦ NGHIÊM NGẶT)
═══════════════════════════════════════════════════════════════════
1. CHỈ trả lời với thông tin có trong phần "DỮ LIỆU DATABASE" bên dưới.
2. TUYỆT ĐỐI KHÔNG được tưởng tượng, bịa đặt, hay làm tròn thông tin.
3. Nếu khách hỏi về giá/tính năng KHÔNG có trong DATABASE → Trả lời kèm link liên hệ hỗ trợ bên dưới.
4. LUÔN trả lời bằng tiếng Việt CÓ DẤU đầy đủ, chuẩn chính tả. Không được viết tắt không dấu.
5. Trả lời ngắn gọn 2-3 câu, không dùng markdown (không dùng dấu *, #, - đầu dòng).
6. Xưng hô thân thiện: "bạn" với khách, gọi mình là "mình" hoặc "tôi".

═══════════════════════════════════════════════════════════════════
DỮ LIỆU DATABASE (CHÍNH XÁC TỪ HỆ THỐNG)
═══════════════════════════════════════════════════════════════════

GIỚI THIỆU FOUNDER AI:
- Founder AI là nền tảng Marketing Automation tổng hợp, giúp doanh nghiệp tự động hóa quy trình marketing và bán hàng.
- Sản phẩm của công ty DIGISO - đơn vị chuyên về giải pháp công nghệ cho doanh nghiệp.
- Phù hợp với: doanh nghiệp vừa và nhỏ, cá nhân kinh doanh, agency marketing, shop online.

GIẢI PHÁP TỔNG HỢP - 7 TÍNH NĂNG CHÍNH (chỉ gồm tính năng đang có thật; tính năng KHÔNG nằm trong danh sách này thì KHÔNG được khẳng định là có, hãy trả lời theo quy tắc 3):

1. LANDING PAGE - Trang đích:
   - Tạo trang bằng cách mô tả với trợ lý AI, rồi chỉnh sửa trực quan hoặc sửa mã HTML; có thư viện mẫu (template) sẵn
   - Form thu thập thông tin khách (lead) gắn ngay trong trang; thông tin khách điền về danh sách lead để xem và lọc
   - Số landing page tối đa tùy gói (xem phần CÁC GÓI DỊCH VỤ)

2. EMAIL MARKETING - Gửi email theo chiến dịch:
   - Dựng chiến dịch email bằng trình tạo chiến dịch dạng sơ đồ các bước; có mẫu email và trợ lý AI hỗ trợ soạn nội dung
   - Đặt lịch gửi; theo dõi lượt mở và lượt bấm liên kết
   - Gửi qua hạ tầng email của Founder AI hoặc dùng máy chủ email (SMTP) riêng của doanh nghiệp
   - Số email gửi mỗi tháng tùy gói (xem phần CÁC GÓI DỊCH VỤ)

3. ZALO - Gửi tin và trả lời khách trên Zalo:
   - Chiến dịch Zalo: gửi tin qua Zalo cá nhân, gửi vào nhóm Zalo và gửi lời mời kết bạn
   - Chatbot AI tự trả lời tin nhắn của khách trên Zalo (Zalo OA và Zalo cá nhân)
   - Hộp thư gom hội thoại các kênh để chủ theo dõi, tạm dừng AI và tự trả lời khi cần
   - Số tin Zalo gửi mỗi tháng tùy gói (xem phần CÁC GÓI DỊCH VỤ)

4. QUẢN LÝ KHÁCH HÀNG VÀ LEAD:
   - Lưu danh sách khách hàng và theo dõi hành trình tương tác với chiến dịch (mở email, bấm liên kết, tin Zalo...)
   - Lead thu từ landing page và form được gom về trang Lead
   - Dùng danh sách khách, lead hoặc Google Sheet làm đối tượng nhận của chiến dịch

5. CHIẾN DỊCH ĐA KÊNH:
   - Một chiến dịch gồm nhiều bước nối nhau: đọc danh sách đối tượng, chờ, gửi Email, gửi Zalo...
   - Theo dõi kết quả gửi từng chiến dịch ở trang Giám sát gửi tin và trang Báo cáo

6. CHATBOT AI - Trợ lý ảo trả lời khách:
   - Tạo chatbot AI trả lời dựa trên kho kiến thức do doanh nghiệp nạp (tài liệu, đường dẫn website)
   - Gắn chatbot lên website (khung chat nhúng) và Zalo
   - Khi khách để lại số điện thoại hoặc email trong chat, hệ thống ghi nhận và báo cho chủ doanh nghiệp
   - Cài được khung giờ hoạt động và tạm dừng chatbot khi cần
   - Số lượt trả lời AI mỗi kỳ tùy gói (xem phần CÁC GÓI DỊCH VỤ)

7. BÁO CÁO:
   - Trang Báo cáo tổng quan: kết quả gửi tin, tương tác và đơn hàng theo thời gian, lọc theo chiến dịch và kênh
   - Có phân tích gợi ý bằng AI từ số liệu gần đây

QUY TRÌNH SỬ DỤNG (4 BƯỚC):
- Bước 1: Đăng ký tài khoản tại ${HERO_REGISTER_URL}
- Bước 2: Chọn gói dịch vụ phù hợp với nhu cầu
- Bước 3: Thiết lập landing page và kết nối kênh gửi tin (email, Zalo)
- Bước 4: Chạy chiến dịch và theo dõi kết quả trên trang Báo cáo

CÁC GÓI DỊCH VỤ:
${plansText}

CÁC KHÓA HỌC:
${coursesText || 'Chưa có khóa học nào'}

THÔNG TIN LIÊN HỆ HỖ TRỢ:
- Email: info@digiso.vn
- Hotline: (+84) 877 909 606 (Thứ 2-6, 8h-17h)
- Địa chỉ văn phòng: Phòng I101B, Khu Công nghệ phần mềm ĐHQG HCM, TP.HCM
- Website: digiso.vn
- Fanpage Facebook: facebook.com/digiso.vn

CÂU HỎI THƯỜNG GẶP:
- "Có dùng thử miễn phí không?": Có, Founder AI cho phép đăng ký tài khoản miễn phí để trải nghiệm.
- "Có hỗ trợ thiết kế landing page không?": Founder AI có trợ lý AI giúp tạo landing page ngay trong ứng dụng. Nếu bạn cần được hướng dẫn thiết lập, vui lòng liên hệ email hoặc hotline ở phần THÔNG TIN LIÊN HỆ HỖ TRỢ để được hướng dẫn.
- "Thanh toán như thế nào?": Hỗ trợ thanh toán theo tháng hoặc theo năm (tiết kiệm hơn). Liên hệ bộ phận kinh doanh để được hướng dẫn.

═══════════════════════════════════════════════════════════════════
HƯỚNG DẪN TRẢ LỜI
═══════════════════════════════════════════════════════════════════

1. Khách hỏi về giá/tính năng/dịch vụ: Trả lời CHÍNH XÁC theo DỮ LIỆU DATABASE bên trên.
2. Khách hỏi về liên hệ/hỗ trợ: Trả lời theo phần THÔNG TIN LIÊN HỆ.
3. Khách hỏi thông tin NGOÀI phạm vi (hướng dẫn kỹ thuật chi tiết, tích hợp API, báo giá riêng cho doanh nghiệp lớn, hợp đồng dài hạn,...):
   → Trả lời: "Mình chưa có thông tin chính xác về vấn đề này. Bạn vui lòng liên hệ đội hỗ trợ để được tư vấn chi tiết:
   - Email: info@digiso.vn
   - Hotline: (+84) 877 909 606 (Thứ 2-6, 8h-17h)
   - Website: digiso.vn"
4. Khách chào hỏi/xã giao: Chào lại thân thiện, giới thiệu là trợ lý ảo của Founder AI, hỏi khách cần hỗ trợ gì.
5. TUYỆT ĐỐI KHÔNG dùng markdown, không bullet points, không in đậm.
6. LUÔN viết tiếng Việt có dấu đầy đủ.
7. TUYỆT ĐỐI KHÔNG tự ý cung cấp thông tin thanh toán, mã QR, số tài khoản, hay bất kỳ thông tin tài chính nào. Hệ thống sẽ tự động hiển thị mã QR thanh toán khi khách nhập số tiền — bạn KHÔNG cần và KHÔNG ĐƯỢC tự tạo hoặc mô tả mã QR.

Người dùng hỏi: ${message}

Trả lời (tiếng Việt có dấu, không markdown):`;
}

class HeroConsultationService {
  constructor() {
    this.redis = null;
    this.redisFailed = false;
    this.connecting = null;
  }

  get heroIpDailyCap() {
    return envInt('HERO_IP_DAILY_CAP', 30);
  }

  /**
   * Trần ngân sách TOÀN tính năng mỗi ngày VN (mọi IP/visitor cộng lại). Tất cả lượt tư vấn dùng chung GEMINI_API_KEY
   * với chatbot của khách — nếu bị đốt tới hết hạn mức Google thì chatbot của mọi khách trả 429 (D-01).
   */
  get heroDailyCap() {
    return envInt('HERO_CONSULTATION_DAILY_CAP', 2000);
  }

  async fetchFounderaiData() {
    if (this._skipDb) {
      return { plans: [], courses: [], lastUpdated: Date.now() };
    }
    return fetchFounderaiData();
  }

  async getRedis() {
    if (this.redisFailed) return null;
    if (this.redis) return this.redis;
    if (this.connecting) return this.connecting;

    const hasExplicitRedis =
      String(process.env.BULLMQ_REDIS_URL || '').trim() ||
      String(process.env.REDIS_URL || '').trim() ||
      String(process.env.REDIS_HOST || '').trim();
    if (!hasExplicitRedis) {
      this.redisFailed = true;
      return null;
    }

    this.connecting = (async () => {
      try {
        const connectTimeout = envInt('REDIS_CONNECT_TIMEOUT_MS', 5000);
        const client = new IORedis(buildRedisConfig(), {
          maxRetriesPerRequest: 1,
          enableReadyCheck: true,
          connectTimeout,
          lazyConnect: true,
        });
        let lastErrorLogAt = 0;
        client.on('error', (err) => {
          const now = Date.now();
          if (now - lastErrorLogAt < 60_000) return;
          lastErrorLogAt = now;
          console.warn('[HeroConsultation] Redis error:', err.message);
        });
        await client.connect();
        this.redis = client;
        return client;
      } catch (err) {
        console.warn('[HeroConsultation] Redis unavailable, using memory fallback:', err.message);
        this.redisFailed = true;
        return null;
      } finally {
        this.connecting = null;
      }
    })();

    return this.connecting;
  }

  async incrWithTtl(key, windowSec) {
    const redis = await this.getRedis();
    if (!redis) return memoryIncr(key, windowSec);

    try {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, windowSec);
      }
      return count;
    } catch (err) {
      console.warn('[HeroConsultation] incr failed, memory fallback:', err.message);
      return memoryIncr(key, windowSec);
    }
  }

  async getCounter(key) {
    const redis = await this.getRedis();
    if (!redis) return memoryGetCount(key);

    try {
      const raw = await redis.get(key);
      if (raw == null) return 0;
      const n = Number.parseInt(String(raw), 10);
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch (err) {
      console.warn('[HeroConsultation] get failed, memory fallback:', err.message);
      return memoryGetCount(key);
    }
  }

  visitorKey(visitorId) {
    return `herochat:visitor:${String(visitorId || '').trim()}`;
  }

  ipDayKey(ip) {
    // Gom IPv6 theo khối /56 (cùng cách limiter express-rate-limit gom) — một người có cả khối /56 thì mỗi địa chỉ
    // trong đó từng được 30 lượt/ngày riêng. IPv4 và IPv4-mapped (::ffff:a.b.c.d) giữ nguyên dạng IPv4.
    const raw = String(ip || '').trim();
    return `herochat:ip:${raw ? ipKeyGenerator(raw) : raw}:d:${vnDayKey()}`;
  }

  globalDayKey() {
    return `herochat:global:d:${vnDayKey()}`;
  }

  /**
   * Process a consultation message from a hero page visitor
   *
   * @param {Object} params
   * @param {string} params.visitorId - Unique visitor identifier
   * @param {string} params.message - User's message (<= HERO_MAX_MESSAGE_CHARS)
   * @param {string} [params.ip] - Visitor client IP
   *
   * Không nhận `history` từ client (D-01/D-14): giao diện không gửi, và nhận vào chỉ mở đường nhồi prompt để đốt
   * tiền Gemini hoặc chèn lượt "Trợ lý" giả để bot "xác nhận" khuyến mãi.
   * @returns {Promise<{success: boolean, reply?: string, chatsUsed?: number, code?: string, message?: string}>}
   */
  async processChat({ visitorId, message, ip = '' }) {
    if (!visitorId || typeof message !== 'string' || !message.trim()) {
      return { success: false, code: 'INVALID_INPUT', message: 'visitorId and message are required' };
    }

    // Trước mọi bộ đếm: tin quá dài không được tiêu lượt của khách, và tuyệt đối không tới được Gemini.
    if (message.trim().length > HERO_MAX_MESSAGE_CHARS) {
      return {
        success: false,
        code: 'MESSAGE_TOO_LONG',
        message: `Tin nhắn quá dài (tối đa ${HERO_MAX_MESSAGE_CHARS.toLocaleString('vi-VN')} ký tự). Bạn vui lòng rút gọn rồi gửi lại nhé.`,
      };
    }

    const cleanVisitorId = String(visitorId).trim();
    const cleanIp = String(ip || '').trim();

    // 0. Trần ngân sách toàn tính năng/ngày: kiểm bằng ĐỌC trước để lượt bị từ chối vì "bận" không tiêu hạn mức
    //    của khách (visitor 5 lượt / IP 30 lượt). Bước 2b bên dưới mới là phép tăng nguyên tử.
    const globalKey = this.globalDayKey();
    if ((await this.getCounter(globalKey)) >= this.heroDailyCap) {
      return { success: false, code: 'BUSY', message: HERO_BUSY_MESSAGE };
    }

    // 1. INCR Visitor Quota (5 chats) — atomic check
    const visitorKey = this.visitorKey(cleanVisitorId);
    const visitorCount = await this.incrWithTtl(visitorKey, VISITOR_QUOTA_TTL_SEC);

    if (visitorCount > MAX_FREE_CHATS) {
      return {
        success: false,
        code: 'QUOTA_EXCEEDED',
        message: 'Ban da het luot chat mien phi',
      };
    }

    // 2. INCR IP Daily Cap (nếu có IP) — chỉ tiêu slot IP khi visitor quota hợp lệ
    if (cleanIp) {
      const ipKey = this.ipDayKey(cleanIp);
      const ipCount = await this.incrWithTtl(ipKey, DAY_COUNTER_TTL_SEC);
      if (ipCount > this.heroIpDailyCap) {
        return {
          success: false,
          code: 'QUOTA_EXCEEDED',
          message: 'Ban da het luot chat mien phi trong ngay',
        };
      }
    }

    // 2b. Tăng bộ đếm ngân sách toàn tính năng — chỉ các lượt SẮP gọi Gemini mới được đếm. Phép tăng nguyên tử
    //     chặn cả đợt đồng thời cùng vượt qua bước 0 (nếu vượt trần thì lượt này không gọi AI).
    const globalCount = await this.incrWithTtl(globalKey, DAY_COUNTER_TTL_SEC);
    if (globalCount > this.heroDailyCap) {
      if (globalCount === this.heroDailyCap + 1) {
        console.warn(`[HeroConsultation] Chạm trần ngân sách ngày (${this.heroDailyCap} lượt) — từ chối tới hết ngày VN, không gọi AI.`);
      }
      return { success: false, code: 'BUSY', message: HERO_BUSY_MESSAGE };
    }

    // Fetch real data from database
    const founderaiData = await this.fetchFounderaiData();
    const plansText = formatPlansForContext(founderaiData.plans);
    const coursesText = formatCoursesForContext(founderaiData.courses);

    console.log('[HeroConsultation] Plans text:', plansText.substring(0, 200));

    // Build prompt with verified data ONLY
    const systemPrompt = buildHeroSystemPrompt({ plansText, coursesText, message });

    try {
      const reply = await callGemini(systemPrompt);

      return {
        success: true,
        reply,
        chatsUsed: Math.min(visitorCount, MAX_FREE_CHATS),
      };
    } catch (error) {
      console.error('[HeroConsultation] Gemini error:', error);

      if (error.message?.includes('API key') || error.message?.includes('not configured')) {
        return {
          success: false,
          code: 'SERVICE_UNAVAILABLE',
          message: 'Dich vu AI tam thoi khong kha dung',
        };
      }

      return {
        success: false,
        code: 'AI_ERROR',
        message: 'Xin loi, da xay ra loi. Vui long thu lai.',
      };
    }
  }

  /**
   * Get chatbot info for hero page
   */
  getChatbotInfo() {
    return {
      chatbotId: 'founderai-hero-consultation',
      chatbotName: 'Foundy - Tro Ly Founder AI',
      welcomeMessage: `Chao ban! Toi la Foundy - Tro Ly Founder AI.
Hay hoi toi bat cu dieu gi ban quan tam!`,
    };
  }

  /**
   * Get remaining quota for a visitor
   */
  async getRemainingQuota(visitorId) {
    const visitorKey = this.visitorKey(visitorId);
    const count = await this.getCounter(visitorKey);
    return Math.max(0, MAX_FREE_CHATS - count);
  }

  /**
   * Test helper — clear memory counters + force memory path
   */
  _resetForTests() {
    memoryCounters.clear();
    this.redisFailed = true;
    this.redis = null;
    this._skipDb = true;
  }
}

export default new HeroConsultationService();
