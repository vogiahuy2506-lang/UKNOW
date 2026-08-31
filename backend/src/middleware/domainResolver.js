import landingPageDomainService from '../services/landingPage/landingPageDomain.service.js';
import landingPagePublicService from '../services/landingPage/landingPagePublic.service.js';
import { LRUCache } from '../utils/lruCache.util.js';

// L1 In-Memory Caches for Domain Resolution
// hostMappingCache: hostname -> { id, slug } | null (TTL 60s, Negative TTL 30s)
export const hostMappingCache = new LRUCache(1000, 60 * 1000, { negativeTtlMs: 30 * 1000 });

// payloadCache: key (slug:xxx hoặc id:xxx) -> published payload (TTL 30s)
export const payloadCache = new LRUCache(500, 30 * 1000);

export const isDomainResolverCacheEnabled = () => {
  return process.env.DOMAIN_RESOLVER_CACHE_ENABLED !== 'false';
};

/**
 * Invalidate host mapping cache for a specific hostname.
 */
export const invalidateDomainResolverHost = (hostname) => {
  if (!hostname) return;
  const h = String(hostname).trim().toLowerCase();
  hostMappingCache.delete(h);
};

/**
 * Invalidate published payload cache by ID and/or slug.
 */
export const invalidateDomainResolverPayload = (id, slug) => {
  if (id) payloadCache.delete(`id:${id}`);
  if (slug) payloadCache.delete(`slug:${String(slug).trim().toLowerCase()}`);
};

/**
 * Clear all domain resolver caches.
 */
export const clearDomainResolverCache = () => {
  hostMappingCache.clear();
  payloadCache.clear();
};

/**
 * Get aggregate cache statistics for monitoring.
 */
export const getDomainResolverCacheStats = () => {
  return {
    hostMapping: hostMappingCache.stats,
    payload: payloadCache.stats,
    enabled: isDomainResolverCacheEnabled(),
  };
};

/**
 * Middleware: resolve custom hostname → landing page slug → attach to req.
 * Dùng bảng landing_page_domains (CF-managed auto-provisioned subdomains).
 */
export const domainResolver = async (req, res, next) => {
  try {
    const host = (req.headers.host || '').split(':')[0].toLowerCase();
    if (!host) return next();

    let resolved = null;
    try {
      if (!isDomainResolverCacheEnabled()) {
        resolved = await landingPageDomainService.getPublishedLandingIdForHost(host);
      } else {
        resolved = await hostMappingCache.remember(host, () =>
          landingPageDomainService.getPublishedLandingIdForHost(host)
        );
      }
    } catch (err) {
      if (err?.message?.includes('is_apex_domain') || err?.message?.includes('does not exist')) {
        console.warn(`[DomainResolver] Migration missing for is_apex_domain column, skipping: ${err.message}`);
        return next();
      }
      throw err;
    }


    if (resolved) {
      let payload = null;
      if (!isDomainResolverCacheEnabled()) {
        if (resolved.slug) {
          payload = await landingPagePublicService.getPublishedPayload(resolved.slug);
        } else {
          payload = await landingPagePublicService.getPublishedPayloadById(resolved.id);
        }
      } else {
        const payloadKey = resolved.slug ? `slug:${resolved.slug.toLowerCase()}` : `id:${resolved.id}`;
        payload = await payloadCache.remember(payloadKey, 30 * 1000, async () => {
          if (resolved.slug) {
            return landingPagePublicService.getPublishedPayload(resolved.slug);
          }
          return landingPagePublicService.getPublishedPayloadById(resolved.id);
        });
      }

      if (payload) {
        req.isCustomDomain = true;
        req.customDomainSlug = resolved.slug || null;
        req.customDomainLandingId = resolved.id;
        req.landingPage = payload;
      }
    }

    next();
  } catch (error) {
    console.error('[DomainResolver] Error:', error.message);
    next();
  }
};


/**
 * Middleware to inject Tailwind CDN into HTML for proper rendering.
 * Wraps the response to inject head content.
 */
export const htmlEnhancer = (req, res, next) => {
  // Store original json/send methods
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  // Override json to inject HTML wrapper
  res.json = function (data) {
    // If this is a landing page HTML response, wrap it
    if (req.landingPage && data?.htmlContent) {
      const enhancedHtml = injectHtmlWrapper(data.htmlContent, {
        title: data.title || 'Landing Page',
        description: data.metaDescription,
        trackingCode: process.env.LP_TRACKING_SCRIPT,
      });

      return originalJson.call(this, {
        ...data,
        htmlContent: enhancedHtml,
      });
    }

    return originalJson.call(this, data);
  };

  next();
};

/**
 * Inject HTML wrapper with head tags.
 */
function injectHtmlWrapper(html, options = {}) {
  const {
    title = 'Landing Page',
    description = '',
    trackingCode = '',
  } = options;

  // Check if HTML already has head tags
  if (html.includes('<head>') || html.includes('<!DOCTYPE')) {
    // Already has full HTML structure, just inject meta tags
    return html.replace(
      '<head>',
      `<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  ${description ? `<meta name="description" content="${escapeHtml(description)}">` : ''}
  <script src="https://cdn.tailwindcss.com"></script>
  ${trackingCode ? trackingCode : ''}`
    );
  }

  // Fragment HTML - wrap with head
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  ${description ? `<meta name="description" content="${escapeHtml(description)}">` : ''}
  <script src="https://cdn.tailwindcss.com"></script>
  ${trackingCode ? trackingCode : ''}
</head>
<body>
  ${html}
</body>
</html>`;
}

/**
 * Escape HTML special characters.
 */
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
