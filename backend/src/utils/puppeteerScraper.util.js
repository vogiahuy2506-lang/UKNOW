/* eslint-env browser, node */
import puppeteer from 'puppeteer';

/**
 * Singleton browser instance
 */
let browserInstance = null;

const PUPPETEER_TIMEOUT = 20000; // 20 seconds

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
      ignoreHTTPSErrors: true,
    });
  }
  return browserInstance;
}

/**
 * Scrape URL with JavaScript rendering using Puppeteer
 */
export async function scrapeUrlWithJs(url, options = {}) {
  const {
    waitForSelector = null,
    waitForTimeout = 3000,
    extractLinks = false,
  } = options;

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // Set viewport and user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Block unnecessary resources for faster loading
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      // Allow main content but block heavy resources
      if (['font', 'media', 'websocket'].includes(resourceType)) {
        request.abort();
      } else {
        request.continue();
      }
    });

    // Navigate with timeout
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: PUPPETEER_TIMEOUT,
    });

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
