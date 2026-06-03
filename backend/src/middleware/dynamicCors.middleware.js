import db from '../config/database.js';

/**
 * Dynamic CORS middleware - chỉ cho phép origins từ domains đã verified
 *
 * Kịch bản:
 * 1. Custom domain như astrodemy.vn → verify bằng cách thêm CNAME/TXT record
 * 2. Subdomain như senna.founderai.biz → đã có trong landing_page_domains
 * 3. *.lp.founderai.biz → đã resolve qua domainResolver
 */

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

    // Check second-level parent for *.lp.founderai.biz pattern
    if (parts.length > 3) {
      const grandparentDomain = parts.slice(-3).join('.');
      if (verifiedDomains.has(grandparentDomain)) return true;
    }
  }

  return false;
}

/**
 * Dynamic CORS origin validator
 */
export function dynamicCorsValidator(origin, callback) {
  // Allow non-browser requests (Postman, curl, server-to-server)
  if (!origin) {
    return callback(null, true);
  }

  // Allow iframe sandbox (srcDoc) requests
  if (origin === 'null') {
    return callback(null, true);
  }

  // Check predefined allowed origins first (localhost, dev environments)
  if (defaultAllowedOrigins.has(origin)) {
    return callback(null, true);
  }

  // Parse hostname from origin
  let hostname;
  try {
    const url = new URL(origin);
    hostname = url.hostname;
  } catch (e) {
    console.warn('[DynamicCors] Invalid origin format:', origin);
    return callback(new Error('Invalid origin format'));
  }

  // Sync check for known domains (quick path)
  if (defaultAllowedOrigins.has(hostname)) {
    return callback(null, true);
  }

  // For unknown origins, we need async check
  // Since cors middleware doesn't support async directly, we'll handle this in a wrapper
  // The actual async check will be done in the middleware wrapper
  return callback(null, true); // Allow temporarily, actual check in middleware
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

    // Check predefined origins first (fast path)
    if (defaultAllowedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
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

    // For localhost in hostname (e.g., localhost:5173 in Referer)
    if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      return next();
    }

    // Async check for verified domains
    try {
      const verified = await isDomainVerified(hostname);

      if (verified) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
        return next();
      }

      // Check if it's a known domain pattern (*.lp.founderai.biz)
      // These should be allowed if they resolve correctly
      // Also allow *.founderai.biz subdomains (e.g., senna.founderai.biz, www.founderai.biz)
      if (hostname.endsWith('.lp.founderai.biz') ||
          hostname.endsWith('.founderai.biz') ||
          hostname === 'founderai.biz' ||
          hostname.endsWith('.uknow.vn') ||
          hostname === 'uknow.vn') {
        // Allow founderai.biz/uknow.vn subdomains (they use domainResolver middleware)
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
        console.log(`[DynamicCors] Allowed platform subdomain: ${hostname}`);
        return next();
      }

      console.warn('[DynamicCors] Blocked unverified origin:', origin);
      return next();
    } catch (err) {
      console.error('[DynamicCors] Error checking domain:', err);
      // On error, allow but log - better than blocking legitimate requests
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
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
