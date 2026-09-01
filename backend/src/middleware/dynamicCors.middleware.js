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

const defaultAllowedOrigins = new Set([
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
]);

const envOrigins = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

envOrigins.forEach((o) => defaultAllowedOrigins.add(o));

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
    // Query domains đã verified (active hoặc pending_verification với token đã xác minh)
    const result = await db.query(`
      SELECT DISTINCT LOWER(d.hostname) as hostname
      FROM landing_page_domains d
      INNER JOIN landing_pages lp ON lp.id = d.landing_page_id
      WHERE d.status IN ('active', 'pending_verification')
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
 * Check if a hostname matches any verified domain
 */
async function isDomainVerified(hostname) {
  if (!hostname) return false;

  const normalizedHost = hostname.toLowerCase();
  const verifiedDomains = await fetchVerifiedDomains();

  // Direct match
  if (verifiedDomains.has(normalizedHost)) return true;

  // Check parent domain for wildcard matches
  // Ví dụ: subdomain.astrodemy.vn → kiểm tra astrodemy.vn
  const parts = normalizedHost.split('.');
  if (parts.length > 2) {
    const parentDomain = parts.slice(-2).join('.');
    if (verifiedDomains.has(parentDomain)) return true;

    // Check second-level parent for *.founderai.biz pattern
    if (parts.length > 3) {
      const grandparentDomain = parts.slice(-3).join('.');
      if (verifiedDomains.has(grandparentDomain)) return true;
    }
  }

  return false;
}

/**
 * Create async CORS middleware that properly handles async domain verification
 */
export function createDynamicCorsMiddleware() {
  return async (req, res, next) => {
    const origin = req.headers.origin;

    if (!origin) {
      return next();
    }

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
      }
      return next();
    }

    // Check predefined origins first (fast path)
    if (defaultAllowedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
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
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
      return next();
    }

    // Async check for verified domains
    try {
      const verified = await isDomainVerified(hostname);

      if (verified) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
        return next();
      }

      // Check if it's a known domain pattern (*.founderai.biz)
      // These should be allowed if they resolve correctly
      // Also allow *.founderai.biz subdomains (e.g., senna.founderai.biz, www.founderai.biz)
      if (hostname.endsWith('.founderai.biz') ||
          hostname.endsWith('.uknow.vn') ||
          hostname === 'uknow.vn' ||
          hostname.endsWith('.hanhchinh.ai.vn') ||
          hostname === 'hanhchinh.ai.vn') {
        // Allow founderai.biz/uknow.vn subdomains (they use domainResolver middleware)
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
        console.log(`[DynamicCors] Allowed platform subdomain: ${hostname}`);
        return next();
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
 * Allows all origins but restricts methods
 */
export function publicCorsMiddleware(req, res, next) {
  const origin = req.headers.origin;

  // Allow all origins for public API (CORS preflight handled)
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
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
 * Allow all origins CORS - for widget/iframe embedding on any website
 */
export function allowAllCorsMiddleware(req, res, next) {
  const origin = req.headers.origin;

  // Allow all origins
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  return next();
}
