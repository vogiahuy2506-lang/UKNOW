import customDomainService from '../services/customDomain.service.js';

/**
 * Middleware to resolve custom domain to landing page.
 * Extracts the Host header and checks if it matches a custom domain.
 * If so, attaches the landing page data to the request.
 */
export const domainResolver = async (req, res, next) => {
  try {
    // Get host from headers (remove port if present)
    const host = (req.headers.host || '').split(':')[0].toLowerCase();

    if (!host) {
      return next();
    }

    // Try to resolve domain to landing page
    const resolved = await customDomainService.resolveDomainToLandingPage(host);

    if (resolved) {
      // Attach resolved data to request for downstream handlers
      req.customDomain = resolved.domain;
      req.landingPage = resolved.landingPage;
      req.isCustomDomain = true;
      console.log(`[DomainResolver] Resolved ${host} -> Landing Page ID ${resolved.landingPage.id}`);
    }

    next();
  } catch (error) {
    console.error('[DomainResolver] Error:', error.message);
    // Don't block the request on resolution errors
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
