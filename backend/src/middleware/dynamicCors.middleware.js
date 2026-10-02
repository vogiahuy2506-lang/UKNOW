import db from '../config/database.js';

/**
 * Dynamic CORS middleware - chỉ cho phép origins từ domains đã verified
 *
 * Kịch bản:
 * 1. Custom domain như astrodemy.vn → verify bằng cách thêm CNAME/TXT record
 * 2. Subdomain như senna.founderai.biz → đã có trong landing_page_domains
 * 3. *.founderai.biz → đã resolve qua domainResolver
 */

/**
 * Header được phép gửi kèm. `X-Owner-Context` là bắt buộc — frontend gắn nó khi
 * nhân viên thao tác trong ngữ cảnh của chủ (`services/api.js`), backend đọc ở
 * `auth.middleware.js`. Thiếu ở đây thì preflight chặn và ngữ cảnh nhân viên
 * hỏng im lặng trên mọi request khác origin.
 * Khai một chỗ — trước đây chuỗi này bị chép cứng ra 6 nơi và đã lệch một lần.
 */
const ALLOWED_HEADERS = 'Content-Type, Authorization, X-Requested-With, X-Owner-Context';

/**
 * Origin của app (SPA) — CHỈ các origin này được CORS kèm `Access-Control-Allow-Credentials`.
 *
 * Landing page công bố (JS do khách soạn, chạy ở `<slug>.founderai.biz` hoặc custom domain) không
 * phải app: vẫn được phản chiếu ACAO để gọi API công khai, nhưng không bao giờ kèm credentials.
 * Tương tự cho localhost cổng ngoài danh sách dưới đây.
 */
const DEV_APP_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5175',
  'http://localhost:5176',
  'http://127.0.0.1:5176',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

/**
 * Host production phục vụ SPA: frontend/nginx.conf `server_name founderai.biz www.founderai.biz`
 * (SPA gọi API bằng đường dẫn tương đối `/api`). Các `*.founderai.biz` khác là landing, không phải app.
 * Host app khác (nếu có) khai trong FRONTEND_URLS / FRONTEND_URL.
 */
const PRODUCTION_APP_ORIGINS = ['https://founderai.biz', 'https://www.founderai.biz'];

/**
 * Chuẩn hoá một origin khai trong env về dạng `scheme://host[:port]` (bỏ path, dấu `/` cuối).
 * Chỉ nhận http/https — giá trị khác (`null`, `*`, rác) bị bỏ qua.
 * @param {string} value
 * @returns {string} origin hoặc '' nếu không hợp lệ
 */
function parseAppOrigin(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.origin;
  } catch {
    return '';
  }
}

let trustedAppOriginsCache = { key: null, origins: new Set() };

/**
 * Tập origin app tin cậy. Đọc env mỗi lần nhưng chỉ dựng lại khi FRONTEND_URLS/FRONTEND_URL đổi.
 * @returns {Set<string>}
 */
function getTrustedAppOrigins() {
  const fromUrls = process.env.FRONTEND_URLS || '';
  const fromUrl = process.env.FRONTEND_URL || '';
  const key = `${fromUrls}\n${fromUrl}`;
  if (trustedAppOriginsCache.key !== key) {
    const origins = new Set([...DEV_APP_ORIGINS, ...PRODUCTION_APP_ORIGINS]);
    `${fromUrls},${fromUrl}`
      .split(',')
      .map(parseAppOrigin)
      .filter(Boolean)
      .forEach((o) => origins.add(o));
    trustedAppOriginsCache = { key, origins };
  }
  return trustedAppOriginsCache.origins;
}

/**
 * Origin có phải app (SPA) tin cậy không — so khớp CHÍNH XÁC chuỗi header `Origin` (trình duyệt luôn
 * gửi dạng chuẩn `scheme://host[:port]`), không so theo đuôi tên miền.
 * @param {string|undefined} origin
 * @returns {boolean}
 */
export function isTrustedAppOrigin(origin) {
  if (typeof origin !== 'string' || !origin || origin === 'null') return false;
  return getTrustedAppOrigins().has(origin);
}

/**
 * Chốt cho endpoint xác thực bằng cookie refresh token (`/api/auth/refresh-token`, `/api/auth/logout`):
 * 403 khi request mang `Origin` không phải app tin cậy, hoặc trình duyệt báo `Sec-Fetch-Site` là
 * `cross-site`/`same-site`. Cho qua `same-origin`, `none`, hoặc không có header (curl, server-to-server).
 * SPA gọi API cùng origin (production: `/api` tương đối; dev: proxy Vite) nên luôn là `same-origin`.
 */
export function requireTrustedAppOrigin(req, res, next) {
  const origin = req.headers?.origin;
  const fetchSite = String(req.headers?.['sec-fetch-site'] || '').trim().toLowerCase();
  const untrustedOrigin = origin !== undefined && !isTrustedAppOrigin(origin);
  const crossContext = fetchSite === 'cross-site' || fetchSite === 'same-site';
  if (untrustedOrigin || crossContext) {
    console.warn('[DynamicCors] Từ chối request dùng cookie phiên từ nguồn không tin cậy:', {
      path: req.originalUrl || req.path,
      origin: origin ?? null,
      secFetchSite: fetchSite || null,
    });
    return res.status(403).json({
      success: false,
      message: 'Yêu cầu không hợp lệ',
      code: 'UNTRUSTED_ORIGIN',
    });
  }
  return next();
}

// Cache verified domains để tránh query DB quá nhiều (TTL: 5 phút)
const verifiedDomainsCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getVerifiedDomainsFromCache() {
  const cached = verifiedDomainsCache.get('verified_domains');
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.domains;
  }
  return null;
}

async function fetchVerifiedDomains() {
  // Check cache first
  const cached = getVerifiedDomainsFromCache();
  if (cached) return cached;

  try {
    // Chỉ domain đã xác minh DNS xong (status 'active'). 'pending_verification' là domain khách mới
    // khai, chưa chứng minh sở hữu — không được coi là origin hợp lệ.
    const result = await db.query(`
      SELECT DISTINCT LOWER(d.hostname) as hostname
      FROM landing_page_domains d
      INNER JOIN landing_pages lp ON lp.id = d.landing_page_id
      WHERE d.status = 'active'
        AND lp.is_published = TRUE
    `);

    const domains = new Set(result.rows.map((r) => r.hostname));

    // Cache the result
    verifiedDomainsCache.set('verified_domains', {
      domains,
      timestamp: Date.now(),
    });

    console.log(`[DynamicCors] Loaded ${domains.size} verified domains from DB`);
    return domains;
  } catch (err) {
    console.error('[DynamicCors] Failed to fetch verified domains:', err.message);
    // Return empty set on error - fail closed for security
    return new Set();
  }
}

/**
 * Clear the cache (call when domain status changes)
 */
export function clearVerifiedDomainsCache() {
  verifiedDomainsCache.delete('verified_domains');
  console.log('[DynamicCors] Cache cleared');
}

/**
 * Hostname có đúng là một custom domain đã xác minh không — khớp CHÍNH XÁC hostname đã lưu, cộng bản
 * `www.` của domain lưu không có `www.`. Không mở rộng sang domain cha: xác minh `a.example.com`
 * không có nghĩa sở hữu `example.com` hay các subdomain khác của nó.
 */
async function isDomainVerified(hostname) {
  if (!hostname) return false;

  const normalizedHost = hostname.toLowerCase();
  const verifiedDomains = await fetchVerifiedDomains();

  if (verifiedDomains.has(normalizedHost)) return true;

  // Domain lưu dạng gốc (example.com), trang chạy ở www.example.com
  if (normalizedHost.startsWith('www.') && verifiedDomains.has(normalizedHost.slice(4))) return true;

  return false;
}

/**
 * Subdomain landing của nền tảng (*.founderai.biz, *.uknow.vn, *.hanhchinh.ai.vn) — chạy JS do khách soạn.
 */
function isPlatformLandingHostname(hostname) {
  return hostname.endsWith('.founderai.biz') ||
    hostname.endsWith('.uknow.vn') ||
    hostname === 'uknow.vn' ||
    hostname.endsWith('.hanhchinh.ai.vn') ||
    hostname === 'hanhchinh.ai.vn';
}

/**
 * Create async CORS middleware that properly handles async domain verification
 */
export function createDynamicCorsMiddleware() {
  return async (req, res, next) => {
    const origin = req.headers.origin;

    if (!origin) {
      // Trình duyệt gửi OPTIONS preflight luôn có `Origin`. Request không có Origin
      // (curl, server-to-server) không qua preflight, bỏ qua.
      return next();
    }

    /**
     * Quan trọng: trả lời preflight (OPTIONS) ngay tại đây để KHÔNG rơi xuống
     * authMiddleware (sẽ fail 401 vì OPTIONS không mang Bearer token). Nếu để
     * authMiddleware xử lý OPTIONS, browser nhận 401 thay vì 204 → axios báo
     * "Route not found" / "Network Error" → nhầm thành 404. Đây là bug đã làm
     * frontend mất các cổng admin/landing-pages/shared/* trên production ngày
     * 18/09/2026.
     */
    const setAllowHeaders = ({ credentials }) => {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      if (credentials) {
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
      res.setHeader('Access-Control-Max-Age', '86400');
    };

    // Origin được gọi API nhưng không phải app: phản chiếu ACAO, KHÔNG kèm credentials.
    const allowWithoutCredentials = () => {
      setAllowHeaders({ credentials: false });
      if (req.method === 'OPTIONS') return res.status(204).end();
      return next();
    };

    /**
     * Landing page công bố chạy trong iframe sandbox không có `allow-same-origin`
     * (LpRendererByHost.jsx:71) → mọi request mang `Origin: null`. `new URL('null')`
     * ném lỗi nên nhánh dưới bỏ qua, không gắn ACAO → form đăng ký chết im lặng.
     * Chỉ mở cho `/api/public/*` và KHÔNG kèm credentials: origin `null` là ẩn danh,
     * bất kỳ trang web nào cũng tạo được bằng một iframe sandbox.
     */
    if (origin === 'null') {
      if (String(req.path || '').startsWith('/api/public/')) {
        res.setHeader('Access-Control-Allow-Origin', 'null');
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
        if (req.method === 'OPTIONS') return res.status(204).end();
      }
      return next();
    }

    // App (SPA) tin cậy — origin DUY NHẤT được CORS kèm credentials (fast path, không đụng DB)
    if (isTrustedAppOrigin(origin)) {
      setAllowHeaders({ credentials: true });
      if (req.method === 'OPTIONS') return res.status(204).end();
      return next();
    }

    // Parse hostname
    let hostname;
    try {
      const url = new URL(origin);
      hostname = url.hostname;
    } catch (e) {
      console.warn('[DynamicCors] Invalid origin:', origin);
      return next();
    }

    // Exact match only — substring "localhost" would allow localhost.attacker.com
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return allowWithoutCredentials();
    }

    // Async check for verified domains
    try {
      const verified = await isDomainVerified(hostname);

      if (verified) {
        return allowWithoutCredentials();
      }

      // Subdomain landing của nền tảng (senna.founderai.biz...) — domainResolver phục vụ landing
      if (isPlatformLandingHostname(hostname)) {
        console.log(`[DynamicCors] Allowed platform subdomain: ${hostname}`);
        return allowWithoutCredentials();
      }

      console.warn('[DynamicCors] Blocked unverified origin:', origin);
      return next();
    } catch (err) {
      console.error('[DynamicCors] Error checking domain:', err);
      // Fail-closed: do not grant ACAO when verification lookup fails
      return next();
    }
  };
}

/**
 * Simplified CORS for public API routes
 * Allows all origins but restricts methods.
 * KHÔNG bao giờ gắn `Access-Control-Allow-Credentials` — mọi origin đều qua được đây, nên cho kèm
 * credentials là cho bất kỳ trang nào đọc response có cookie của người dùng. (App tin cậy đã được
 * createDynamicCorsMiddleware gắn credentials từ trước; hàm này không gỡ.)
 */
export function publicCorsMiddleware(req, res, next) {
  const origin = req.headers.origin;

  // Allow all origins for public API (CORS preflight handled)
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
  } else {
    // Allow requests without origin (curl, Postman, etc.)
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  return next();
}

/**
 * Allow all origins CORS - for widget/iframe embedding on any website.
 * KHÔNG gắn `Access-Control-Allow-Credentials` (cùng lý do publicCorsMiddleware).
 */
export function allowAllCorsMiddleware(req, res, next) {
  const origin = req.headers.origin;

  // Allow all origins
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  return next();
}
