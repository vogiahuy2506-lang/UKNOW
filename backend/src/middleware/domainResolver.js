import landingPageDomainService from '../services/landingPage/landingPageDomain.service.js';
import landingPagePublicService from '../services/landingPage/landingPagePublic.service.js';

/**
 * Middleware: resolve custom hostname → landing page slug → attach to req.
 * Dùng bảng landing_page_domains (CF-managed auto-provisioned subdomains).
 */
export const domainResolver = async (req, res, next) => {
  try {
    const host = (req.headers.host || '').split(':')[0].toLowerCase();
    if (!host) return next();

    const slug = await landingPageDomainService.getPublishedSlugForHost(host);
    if (slug) {
      const payload = await landingPagePublicService.getPublishedPayload(slug);
      if (payload) {
        req.isCustomDomain = true;
        req.customDomainSlug = slug;
        req.landingPage = payload;
        console.log(`[DomainResolver] ${host} → slug="${slug}" (id=${payload.id})`);
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
