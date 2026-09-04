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
import db from '../config/database.js';
import { vnDayKey } from '../utils/vnTimeFormat.util.js';

const MAX_FREE_CHATS = 5;
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
  constructor() {
    this.redis = null;
    this.redisFailed = false;
    this.connecting = null;
  }

  get heroIpDailyCap() {
    return envInt('HERO_IP_DAILY_CAP', 30);
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
    return `herochat:ip:${String(ip || '').trim()}:d:${vnDayKey()}`;
  }

  /**
   * Process a consultation message from a hero page visitor
   *
   * @param {Object} params
   * @param {string} params.visitorId - Unique visitor identifier
   * @param {string} params.message - User's message
   * @param {Array} [params.history] - Previous messages [{role, content}]
   * @param {string} [params.ip] - Visitor client IP
   * @returns {Promise<{success: boolean, reply?: string, chatsUsed?: number, code?: string, message?: string}>}
   */
  async processChat({ visitorId, message, history = [], ip = '' }) {
    if (!visitorId || !message?.trim()) {
      return { success: false, code: 'INVALID_INPUT', message: 'visitorId and message are required' };
    }

    const cleanVisitorId = String(visitorId).trim();
    const cleanIp = String(ip || '').trim();

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

    // Fetch real data from database
    const founderaiData = await this.fetchFounderaiData();
    const plansText = formatPlansForContext(founderaiData.plans);
    const coursesText = formatCoursesForContext(founderaiData.courses);

    console.log('[HeroConsultation] Plans text:', plansText.substring(0, 200));

    // Build prompt with verified data ONLY
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
- Founder AI là nền tảng Marketing Automation tổng hợp, giúp doanh nghiệp tự động hóa quy trình marketing và bán hàng.
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
- Email: hotro.digibook@gmail.com
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
   - Email: hotro.digibook@gmail.com
   - Hotline: (+84) 877 909 606 (Thứ 2-6, 8h-17h)
   - Website: digiso.vn"
4. Khách chào hỏi/xã giao: Chào lại thân thiện, giới thiệu là trợ lý ảo của Founder AI, hỏi khách cần hỗ trợ gì.
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
