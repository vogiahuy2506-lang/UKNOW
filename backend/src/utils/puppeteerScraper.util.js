/* eslint-env browser, node */
import puppeteer from 'puppeteer';
import { assertPublicHost, assertPublicUrl, isSsrfBlockedError, SsrfBlockedError } from './ssrfGuard.util.js';

/**
 * Singleton browser instance
 */
let browserInstance = null;

const PUPPETEER_TIMEOUT = 20000; // 20 seconds

/** Loại tài nguyên nặng không cần cho việc trích văn bản. */
const HEAVY_RESOURCE_TYPES = new Set(['font', 'media', 'websocket']);
/** Scheme không ra mạng — chỉ cho làm tài nguyên con, không cho điều hướng khung. */
const LOCAL_SUBRESOURCE_PROTOCOLS = new Set(['data:', 'blob:']);

/**
 * Get or create browser instance
 */
async function getBrowser() {
  if (!browserInstance || !browserInstance.connected) {
    browserInstance = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920x1080',
      ],
      // Puppeteer mặc định tắt chặn popup; bật lại để trang lạ không tự mở tab mới (tab mới không đi qua
      // request interception của trang đang cào).
      ignoreDefaultArgs: ['--disable-popup-blocking'],
      ignoreHTTPSErrors: true,
    });
  }
  return browserInstance;
}

/**
 * Bộ nhớ đệm kết quả kiểm host cho MỘT trang (mỗi host chỉ phân giải/kiểm một lần trong lượt cào).
 *
 * @param {(hostname: string) => Promise<unknown>} [checkHost] ném lỗi nếu host không được phép
 * @returns {(hostname: string) => Promise<'allowed'|'blocked'|'error'>}
 */
export function createHostVerdictCache(checkHost = (hostname) => assertPublicHost(hostname)) {
  const cache = new Map();
  return (hostname) => {
    const key = String(hostname || '').toLowerCase();
    let verdict = cache.get(key);
    if (!verdict) {
      verdict = Promise.resolve()
        .then(() => checkHost(key))
        .then(() => 'allowed', (error) => (isSsrfBlockedError(error) ? 'blocked' : 'error'));
      cache.set(key, verdict);
    }
    return verdict;
  };
}

/**
 * Quyết định cho một request của Chrome khi bật interception (hàm thuần, không đụng Puppeteer).
 *
 * - Điều hướng khung (khung chính, iframe, mọi chặng redirect): chỉ http/https.
 * - Tài nguyên con: http/https, hoặc data:/blob: (không ra mạng).
 * - Mọi request http/https: host phải qua kiểm tra SSRF (IP công khai), không thì abort.
 *
 * @param {{ url: string, isNavigation?: boolean, resourceType?: string }} request
 * @param {{ getHostVerdict: (hostname: string) => Promise<'allowed'|'blocked'|'error'> }} deps
 * @returns {Promise<{ action: 'continue'|'abort', reason?: string }>}
 */
export async function decideScrapeRequest({ url, isNavigation = false, resourceType = '' }, { getHostVerdict }) {
  let parsed;
  try {
    parsed = new URL(String(url || ''));
  } catch {
    return { action: 'abort', reason: 'invalid_url' };
  }
  if (LOCAL_SUBRESOURCE_PROTOCOLS.has(parsed.protocol)) {
    return isNavigation ? { action: 'abort', reason: 'scheme' } : { action: 'continue' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { action: 'abort', reason: 'scheme' };
  }
  if (!isNavigation && HEAVY_RESOURCE_TYPES.has(resourceType)) {
    return { action: 'abort', reason: 'resource_type' };
  }
  const verdict = await getHostVerdict(parsed.hostname);
  if (verdict === 'allowed') return { action: 'continue' };
  return { action: 'abort', reason: verdict === 'blocked' ? 'blocked_host' : 'host_check_failed' };
}

async function handleInterceptedRequest(request, getHostVerdict, onAbort) {
  let decision;
  try {
    decision = await decideScrapeRequest({
      url: request.url(),
      isNavigation: request.isNavigationRequest(),
      resourceType: request.resourceType(),
    }, { getHostVerdict });
  } catch {
    decision = { action: 'abort', reason: 'host_check_failed' };
  }
  try {
    if (decision.action === 'continue') {
      await request.continue();
    } else {
      onAbort(request, decision);
      await request.abort('blockedbyclient');
    }
  } catch {
    // Request đã được xử lý hoặc trang đã đóng — bỏ qua.
  }
}

function isMainFrameRequest(request) {
  const frame = request.frame();
  return !frame || !frame.parentFrame();
}

/**
 * Scrape URL with JavaScript rendering using Puppeteer
 *
 * Chống SSRF: URL phải qua assertPublicUrl trước khi mở trang; sau đó MỌI request của trang (điều
 * hướng, từng chặng redirect, tài nguyên con, iframe) đi qua request interception và bị abort nếu
 * không phải http/https hoặc host không công khai (kết quả kiểm cache theo host trong một trang).
 * Rủi ro còn lại: Chrome tự phân giải DNS khi kết nối nên vẫn có khe DNS rebinding giữa lúc ta kiểm và
 * lúc Chrome kết nối (giảm bằng kiểm trước + kiểm từng request), và các kết nối không đi qua
 * interception (WebSocket, WebRTC, request từ worker) không kiểm được ở tầng này.
 */
export async function scrapeUrlWithJs(url, options = {}) {
  const {
    waitForSelector = null,
    waitForTimeout = 3000,
    extractLinks = false,
  } = options;

  // Kiểm trước khi mở trình duyệt — URL nội bộ bị từ chối ngay.
  await assertPublicUrl(url);

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // Set viewport and user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Không để service worker phục vụ request của trang (request qua SW không đi qua interception).
    await page.setBypassServiceWorker(true);

    // Chặn tài nguyên nặng + chặn SSRF cho từng request.
    const getHostVerdict = createHostVerdictCache();
    let blockedMainNavigation = null;
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      handleInterceptedRequest(request, getHostVerdict, (abortedRequest, decision) => {
        const isSecurityBlock = decision.reason === 'blocked_host' || decision.reason === 'scheme';
        if (isSecurityBlock && abortedRequest.isNavigationRequest() && isMainFrameRequest(abortedRequest)) {
          blockedMainNavigation = decision;
        }
      });
    });

    // Navigate with timeout
    try {
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: PUPPETEER_TIMEOUT,
      });
    } catch (navigationError) {
      if (blockedMainNavigation) throw new SsrfBlockedError(undefined, { reason: 'browser_navigation' });
      throw navigationError;
    }

    // Wait for specific selector if provided
    if (waitForSelector) {
      try {
        await page.waitForSelector(waitForSelector, { timeout: 5000 });
      } catch {
        // Selector not found, continue anyway
      }
    }

    // Additional wait for JS to render
    await new Promise((resolve) => setTimeout(resolve, waitForTimeout));

    // Khung chính bị chặn điều hướng (kể cả do JS chuyển trang sau khi tải) hoặc không còn ở trang
    // http/https (trang lỗi chrome-error://, data:...) → không trích nội dung.
    if (blockedMainNavigation) throw new SsrfBlockedError(undefined, { reason: 'browser_navigation' });
    let finalProtocol = '';
    try {
      finalProtocol = new URL(page.url()).protocol;
    } catch {
      finalProtocol = '';
    }
    if (finalProtocol !== 'http:' && finalProtocol !== 'https:') {
      throw new Error('Trang không dừng ở URL http/https sau khi tải');
    }

    // Extract content
    const result = await page.evaluate(() => {
      // Get document title
      const title = document.title || '';

      // Get meta description
      const metaDesc = document.querySelector('meta[name="description"]')?.content || '';

      // Get main content using common selectors
      let content = '';
      const contentSelectors = [
        'article',
        'main',
        '[role="main"]',
        '.content',
        '.post-content',
        '.article-content',
        '.entry-content',
        '.story-body',
        '#content',
        '.main-content',
      ];

      for (const selector of contentSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          content = el.innerText || el.textContent || '';
          if (content.trim().length > 100) break;
        }
      }

      // Fallback to body if no content selector found
      if (!content || content.trim().length < 100) {
        content = document.body?.innerText || document.body?.textContent || '';
      }

      // Extract links if requested
      let links = [];
      if (extractLinks) {
        const allLinks = Array.from(document.querySelectorAll('a[href]'));
        const baseUrl = new URL(window.location.href).origin;
        links = allLinks
          .map((a) => a.href)
          .filter((href) => {
            try {
              const url = new URL(href);
              // Same domain links
              return url.origin === baseUrl || href.startsWith('/');
            } catch {
              return false;
            }
          })
          .slice(0, 50); // Limit to 50 links
      }

      return {
        title,
        metaDesc,
        content: content.trim(),
        links,
        url: window.location.href,
      };
    });

    // Close page
    await page.close();

    return {
      ...result,
      url,
      success: true,
    };
  } catch (error) {
    await page.close().catch(() => {});
    throw error;
  }
}

/**
 * Close browser instance
 */
export async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close().catch(() => {});
    browserInstance = null;
  }
}

/**
 * Health check for Puppeteer
 */
export async function checkPuppeteerHealth() {
  try {
    const browser = await getBrowser();
    return {
      healthy: browser.connected,
      browserVersion: browser.version?.() || 'unknown',
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message,
    };
  }
}
