/**
 * Hero Consultation Service
 *
 * Provides AI consultation chat for the hero/landing page widget.
 * - No auth required (public access)
 * - 5 free chats per visitor (tracked by visitorId)
 * - Uses Gemini with RAG-style data from database
 * - DIFFERENT from /app chatbot which uses RAG and credit system
 * - ONLY answers with verified data from database, no hallucinations
 */

import db from '../config/database.js';

const MAX_FREE_CHATS = 5;
const QUOTA_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// In-memory quota tracking
// Map<visitorId, { remaining: number, createdAt: number }>
const visitorQuotaMap = new Map();

// Fallback data khi DB chua co du lieu
const DEFAULT_PLANS = [
  { name: 'Starter', billing_period: 'thang', price: 99000, original_price: 199000, features: ['3 Landing Page', '500 Email/thang', 'Auto Zalo', '100 Leads', 'Email Support'] },
  { name: 'Pro', billing_period: 'thang', price: 299000, original_price: 499000, features: ['10 Landing Page', '2000 Email/thang', 'Auto Zalo', '1000 Leads', 'Chatbot AI', 'Priority Support'] },
  { name: 'Business', billing_period: 'thang', price: 699000, original_price: 999000, features: ['Unlimited Landing', '5000 Email/thang', 'Auto Zalo', 'Unlimited Leads', 'Chatbot AI', 'CRM', 'A/B Testing', 'Dedicated Support'] },
];

// In-memory cache for founderAI data (refreshed periodically)
// IMPORTANT: Start with null to force fetch from DB on first request
let founderaiDataCache = null;
const DATA_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes (reduced for fresher data)

// Cleanup expired entries periodically
const QUOTA_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
setInterval(() => {
  const now = Date.now();
  for (const [visitorId, data] of visitorQuotaMap.entries()) {
    if (now - data.createdAt > QUOTA_TTL_MS) {
      visitorQuotaMap.delete(visitorId);
    }
  }
}, QUOTA_CLEANUP_INTERVAL_MS);

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

/**
 * Format plans for AI context (safe public data only)
 */
function formatPlansForContext(plans) {
  // IMPORTANT: Do NOT use DEFAULT_PLANS as fallback - return empty if no data
  if (!plans || plans.length === 0) {
    return 'Chua co thong tin goi dich vu.';
  }

  return plans.map(plan => {
    const features = plan.features 
      ? (Array.isArray(plan.features) 
          ? plan.features 
          : typeof plan.features === 'object' 
            ? Object.keys(plan.features).filter(k => plan.features[k])
            : [])
      : [];
    
    const price = plan.price || 0;
    const priceYearly = plan.price_yearly || null;
    const featuresStr = features.length > 0 
      ? features.slice(0, 5).join(', ') 
      : 'Khong co thong tin tinh nang';
    
    let priceInfo = `${price.toLocaleString('vi-VN')} VND/thang`;
    if (priceYearly && priceYearly > 0) {
      const yearlyPerMonth = Math.round(priceYearly / 12);
      priceInfo += ` (${yearlyPerMonth.toLocaleString('vi-VN')} VND/thang neu thanh toan nam)`;
    }

    return `- ${plan.name}: ${priceInfo}. Tinh nang: ${featuresStr}`;
  }).join('\n\n');
}

/**
 * Format courses for AI context (safe public data only)
 */
function formatCoursesForContext(courses) {
  if (!courses || courses.length === 0) {
    return '';
  }

  return courses.slice(0, 10).map(course => {
    const price = course.price || 0;
    const category = course.category ? ` (${course.category})` : '';
    return `${course.course_name}${category}: ${price.toLocaleString('vi-VN')} VND`;
  }).join('\n');
}

function getOrCreateQuota(visitorId) {
  let quota = visitorQuotaMap.get(visitorId);
  if (!quota) {
    quota = { remaining: MAX_FREE_CHATS, createdAt: Date.now() };
    visitorQuotaMap.set(visitorId, quota);
  }
  return quota;
}

async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

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
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } finally {
    clearTimeout(timeoutId);
  }
}

class HeroConsultationService {
  /**
   * Process a consultation message from a hero page visitor
   *
   * @param {Object} params
   * @param {string} params.visitorId - Unique visitor identifier
   * @param {string} params.message - User's message
   * @param {Array} [params.history] - Previous messages [{role, content}]
   * @returns {Promise<{success: boolean, reply?: string, chatsUsed?: number, code?: string, message?: string}>}
   */
  async processChat({ visitorId, message, history = [] }) {
    if (!visitorId || !message?.trim()) {
      return { success: false, code: 'INVALID_INPUT', message: 'visitorId and message are required' };
    }

    // Check and update quota
    const quota = getOrCreateQuota(visitorId);

    if (quota.remaining <= 0) {
      return {
        success: false,
        code: 'QUOTA_EXCEEDED',
        message: 'Ban da het luot chat mien phi',
      };
    }

    // Fetch real data from database
    const founderaiData = await fetchFounderaiData();
    const plansText = formatPlansForContext(founderaiData.plans);
    const coursesText = formatCoursesForContext(founderaiData.courses);

    console.log('[HeroConsultation] Plans text:', plansText.substring(0, 200));

    // Build prompt with verified data ONLY
    // STRICT: AI MUST only use data from DATABASE section
    // IMPORTANT: Prompt uses Vietnamese with full diacritics to ensure AI replies correctly
    const systemPrompt = `Bạn là "Foundy - Trợ Lý AI" của Founder AI (founderai.biz) - sản phẩm của công ty DIGISO.

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
- Founder AI là nền tảng Marketing Automation tổng h�p, giúp doanh nghiệp tự động hóa quy trình marketing và bán hàng.
- Sản phẩm của công ty DIGISO - đơn vị chuyên về giải pháp công nghệ cho doanh nghiệp.
- Phù hợp với: doanh nghiệp vừa và nhỏ, cá nhân kinh doanh, agency marketing, shop online.

GIẢI PHÁP TỔNG HỢP - 7 TÍNH NĂNG CHÍNH:

1. LANDING PAGE - Trang đích chuyên nghiệp:
   - Kéo thả không cần code, nhiều template đẹp mắt
   - Tự động SEO, A/B testing để tối ưu chuyển đổi
   - Có thể nhúng Google Analytics, Facebook Pixel
   - Tích hợp form thu thập lead tự động

2. EMAIL MARKETING - Email marketing tự động:
   - Soạn nội dung bằng AI hỗ trợ
   - Gửi từ 500-5000 email/tháng tùy gói dịch vụ
   - Lịch gửi tự động, theo dõi tỷ lệ mở/click
   - Template email chuyên nghiệp, responsive

3. ZALO AUTOMATION - Tự động hóa Zalo:
   - Auto reply 24/7 cho Zalo Official Account (OA)
   - Gửi ZNS (Zalo Notification Service) tự động
   - Lưu lịch sử chat, phân loại khách hàng
   - Kết nối với CRM để đồng bộ dữ liệu

4. CRM - Quản lý khách hàng:
   - Lưu thông tin khách hàng từ nhiều nguồn (landing, email, zalo, form)
   - Phân loại lead theo trạng thái: New (mới), Hot (nóng), Cold (lạnh), Warm (ấm)
   - Chấm điểm lead tự động, theo dõi trạng thái chuyển đổi

5. CHIẾN DỊCH ĐỒNG BỘ:
   - Tạo và chạy chiến dịch email, Zalo, ZNS đồng thời
   - Theo dõi kết quả từng chiến dịch realtime
   - A/B test nội dung để tối ưu hiệu quả

6. CHATBOT AI - Trợ lý ảo:
   - Trả lời tự động theo kịch bản có sẵn
   - Hướng dẫn khách hàng theo flow đã thiết kế
   - Kết nối với CRM để lưu thông tin khách
   - Hoạt động 24/7 không cần nghỉ

7. BÁO CÁO THÔNG MINH:
   - Dashboard tổng quan trực quan
   - Thống kê lead theo nguồn (Facebook, Zalo, Landing,...)
   - Tỷ lệ chuyển đổi của từng chiến dịch
   - Xuất báo cáo Excel/PDF

QUY TRÌNH SỬ DỤNG (4 BƯỚC):
- Bước 1: Đăng ký tài khoản miễn phí trên website digiso.vn
- Bước 2: Chọn gói dịch vụ phù hợp với nhu cầu
- Bước 3: Thiết lập landing page, email, zalo OA kết nối
- Bước 4: Chạy chiến dịch và theo dõi kết quả trên dashboard

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
- "Có hỗ trợ thiết kế landing page không?": Có, đội ngũ DIGISO hỗ trợ khách hàng thiết lập ban đầu.
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
4. Khách chào hỏi/xã giao: Chào lại thân thiện, giới thiệu là trợ lý ảo của Founder AI, hỏi khách cần hỗ tr� gì.
5. TUYỆT ĐỐI KHÔNG dùng markdown, không bullet points, không in đậm.
6. LUÔN viết tiếng Việt có dấu đầy đủ.

Người dùng hỏi: ${message}

Trả lời (tiếng Việt có dấu, không markdown):`;

    const historyText = history.length > 0
      ? history.slice(-4).map(m => `${m.role === 'user' ? 'Nguoi dung' : 'Tro ly'}: ${m.content}`).join('\n') + '\n'
      : '';

    const fullPrompt = `${systemPrompt}\n\n${historyText}`;

    try {
      const reply = await callGemini(fullPrompt);

      // Decrement quota
      quota.remaining -= 1;
      visitorQuotaMap.set(visitorId, quota);

      return {
        success: true,
        reply,
        chatsUsed: MAX_FREE_CHATS - quota.remaining,
      };
    } catch (error) {
      console.error('[HeroConsultation] Gemini error:', error);

      // Still consume quota on error to prevent abuse
      quota.remaining -= 1;
      visitorQuotaMap.set(visitorId, quota);

      if (error.message.includes('API key') || error.message.includes('not configured')) {
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
  getRemainingQuota(visitorId) {
    const quota = visitorQuotaMap.get(visitorId);
    if (!quota) {
      return MAX_FREE_CHATS;
    }
    return quota.remaining;
  }
}

export default new HeroConsultationService();
