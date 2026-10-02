import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import dns from 'node:dns';

const launch = jest.fn();
jest.unstable_mockModule('puppeteer', () => ({ default: { launch } }));

const {
  closeBrowser,
  createHostVerdictCache,
  decideScrapeRequest,
  scrapeUrlWithJs,
} = await import('../puppeteerScraper.util.js');
const { SsrfBlockedError, SSRF_BLOCKED_CODE } = await import('../ssrfGuard.util.js');

const DNS_TABLE = {
  'public.example.com': [{ address: '93.184.216.34', family: 4 }],
  'cdn.example.com': [{ address: '151.101.1.1', family: 4 }],
  'rebind.example.com': [{ address: '127.0.0.1', family: 4 }],
};

function mockDns() {
  return jest.spyOn(dns.promises, 'lookup').mockImplementation(async (host) => {
    if (DNS_TABLE[host]) return DNS_TABLE[host];
    throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${host}`), { code: 'ENOTFOUND' });
  });
}

describe('decideScrapeRequest (quyết định cho từng request của Chrome)', () => {
  const allowAll = { getHostVerdict: async () => 'allowed' };

  it.each([
    ['data:text/html,<h1>x</h1>', true, 'abort'],
    ['data:image/png;base64,AAAA', false, 'continue'],
    ['blob:https://public.example.com/0f0e', false, 'continue'],
    ['blob:https://public.example.com/0f0e', true, 'abort'],
    ['file:///etc/passwd', true, 'abort'],
    ['file:///etc/passwd', false, 'abort'],
    ['ftp://public.example.com/x', false, 'abort'],
    ['chrome://settings', true, 'abort'],
    ['ws://public.example.com/socket', false, 'abort'],
    ['not a url', false, 'abort'],
  ])('%s (navigation=%s) → %s', async (url, isNavigation, action) => {
    const decision = await decideScrapeRequest({ url, isNavigation, resourceType: 'other' }, allowAll);
    expect(decision.action).toBe(action);
  });

  it('chặn tài nguyên nặng (font/media/websocket), vẫn cho điều hướng', async () => {
    for (const resourceType of ['font', 'media', 'websocket']) {
      await expect(decideScrapeRequest({ url: 'https://cdn.example.com/a', resourceType }, allowAll))
        .resolves.toEqual({ action: 'abort', reason: 'resource_type' });
    }
    await expect(decideScrapeRequest({ url: 'https://cdn.example.com/a.js', resourceType: 'script' }, allowAll))
      .resolves.toEqual({ action: 'continue' });
  });

  it('host bị chặn / kiểm lỗi → abort với lý do phân biệt', async () => {
    const getHostVerdict = jest.fn(async (host) => (host === '169.254.169.254' ? 'blocked' : 'error'));
    await expect(decideScrapeRequest(
      { url: 'http://169.254.169.254/latest/meta-data/', isNavigation: true },
      { getHostVerdict }
    )).resolves.toEqual({ action: 'abort', reason: 'blocked_host' });
    await expect(decideScrapeRequest({ url: 'https://nxdomain.example.com/' }, { getHostVerdict }))
      .resolves.toEqual({ action: 'abort', reason: 'host_check_failed' });
    expect(getHostVerdict).toHaveBeenCalledWith('169.254.169.254');
  });

  it('createHostVerdictCache: mỗi host chỉ kiểm một lần, phân loại lỗi', async () => {
    const checkHost = jest.fn(async (host) => {
      if (host === 'blocked.example.com') throw new SsrfBlockedError();
      if (host === 'broken.example.com') throw new Error('EAI_AGAIN');
      return { hostname: host, addresses: [] };
    });
    const getVerdict = createHostVerdictCache(checkHost);
    await expect(getVerdict('Public.Example.com')).resolves.toBe('allowed');
    await expect(getVerdict('public.example.com')).resolves.toBe('allowed');
    await expect(getVerdict('blocked.example.com')).resolves.toBe('blocked');
    await expect(getVerdict('broken.example.com')).resolves.toBe('error');
    expect(checkHost).toHaveBeenCalledTimes(3);
  });

  it('mặc định dùng assertPublicHost thật (IP literal nội bộ bị chặn)', async () => {
    const getVerdict = createHostVerdictCache();
    await expect(getVerdict('[::ffff:127.0.0.1]')).resolves.toBe('blocked');
    await expect(getVerdict('10.0.0.1')).resolves.toBe('blocked');
    await expect(getVerdict('8.8.8.8')).resolves.toBe('allowed');
  });
});

function createFakeRequest({ url, navigation = false, resourceType = 'document', mainFrame = true }) {
  const frame = { parentFrame: () => (mainFrame ? null : {}) };
  return {
    url: () => url,
    isNavigationRequest: () => navigation,
    resourceType: () => resourceType,
    frame: () => frame,
    continue: jest.fn(async () => {}),
    abort: jest.fn(async () => {}),
  };
}

async function waitUntilHandled(request) {
  for (let i = 0; i < 200; i += 1) {
    if (request.continue.mock.calls.length || request.abort.mock.calls.length) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(`request chưa được xử lý: ${request.url()}`);
}

function setUpFakeBrowser(onGoto) {
  let requestHandler = null;
  const state = { currentUrl: 'about:blank' };
  const emit = async (spec) => {
    const request = createFakeRequest(spec);
    requestHandler(request);
    await waitUntilHandled(request);
    return request;
  };
  const page = {
    setViewport: jest.fn(async () => {}),
    setUserAgent: jest.fn(async () => {}),
    setBypassServiceWorker: jest.fn(async () => {}),
    setRequestInterception: jest.fn(async () => {}),
    on: jest.fn((event, handler) => {
      if (event === 'request') requestHandler = handler;
    }),
    goto: jest.fn(async (url) => onGoto({ url, emit, state })),
    waitForSelector: jest.fn(async () => {}),
    url: jest.fn(() => state.currentUrl),
    evaluate: jest.fn(async () => ({
      title: 'Trang công khai',
      metaDesc: '',
      content: 'Nội dung trang công khai',
      links: [],
      url: state.currentUrl,
    })),
    close: jest.fn(async () => {}),
  };
  const browser = {
    connected: true,
    newPage: jest.fn(async () => page),
    close: jest.fn(async () => { browser.connected = false; }),
  };
  launch.mockResolvedValue(browser);
  return { page, browser };
}

describe('scrapeUrlWithJs — chống SSRF', () => {
  beforeEach(() => {
    launch.mockReset();
    mockDns();
  });

  afterEach(async () => {
    await closeBrowser();
    jest.restoreAllMocks();
  });

  it('URL nội bộ bị từ chối trước khi mở trình duyệt', async () => {
    await expect(scrapeUrlWithJs('http://169.254.169.254/latest/meta-data/'))
      .rejects.toMatchObject({ code: SSRF_BLOCKED_CODE });
    await expect(scrapeUrlWithJs('http://rebind.example.com/'))
      .rejects.toMatchObject({ code: SSRF_BLOCKED_CODE });
    expect(launch).not.toHaveBeenCalled();
  });

  it('bật interception + bỏ qua service worker + bật lại chặn popup; chặn tài nguyên con/iframe nội bộ', async () => {
    const seen = {};
    const { page } = setUpFakeBrowser(async ({ url, emit, state }) => {
      seen.main = await emit({ url, navigation: true });
      seen.metadataImg = await emit({ url: 'http://169.254.169.254/latest/meta-data/iam', resourceType: 'image' });
      seen.cdnScript = await emit({ url: 'https://cdn.example.com/app.js', resourceType: 'script' });
      seen.privateIframe = await emit({ url: 'http://10.0.0.8/admin', navigation: true, mainFrame: false });
      seen.dataImg = await emit({ url: 'data:image/png;base64,AAAA', resourceType: 'image' });
      state.currentUrl = url;
    });

    const result = await scrapeUrlWithJs('https://public.example.com/bai-viet', { waitForTimeout: 0 });

    expect(result).toMatchObject({ success: true, content: 'Nội dung trang công khai' });
    expect(launch.mock.calls[0][0].ignoreDefaultArgs).toContain('--disable-popup-blocking');
    expect(page.setBypassServiceWorker).toHaveBeenCalledWith(true);
    expect(page.setRequestInterception).toHaveBeenCalledWith(true);
    expect(seen.main.continue).toHaveBeenCalled();
    expect(seen.cdnScript.continue).toHaveBeenCalled();
    expect(seen.dataImg.continue).toHaveBeenCalled();
    expect(seen.metadataImg.abort).toHaveBeenCalledWith('blockedbyclient');
    expect(seen.metadataImg.continue).not.toHaveBeenCalled();
    expect(seen.privateIframe.abort).toHaveBeenCalledWith('blockedbyclient');
  });

  it('redirect của điều hướng chính tới địa chỉ nội bộ → SsrfBlockedError', async () => {
    setUpFakeBrowser(async ({ url, emit }) => {
      await emit({ url, navigation: true });
      const hop = await emit({ url: 'http://127.0.0.1:5001/api/internal', navigation: true });
      expect(hop.abort).toHaveBeenCalledWith('blockedbyclient');
      throw new Error('net::ERR_BLOCKED_BY_CLIENT at https://public.example.com/r');
    });

    await expect(scrapeUrlWithJs('https://public.example.com/r', { waitForTimeout: 0 }))
      .rejects.toMatchObject({ code: SSRF_BLOCKED_CODE });
  });

  it('JS chuyển khung chính sang địa chỉ nội bộ sau khi tải → không trích nội dung', async () => {
    const { page } = setUpFakeBrowser(async ({ url, emit, state }) => {
      await emit({ url, navigation: true });
      await emit({ url: 'http://[::1]:6379/', navigation: true });
      state.currentUrl = 'chrome-error://chromewebdata/';
    });

    await expect(scrapeUrlWithJs('https://public.example.com/js-redirect', { waitForTimeout: 0 }))
      .rejects.toMatchObject({ code: SSRF_BLOCKED_CODE });
    expect(page.evaluate).not.toHaveBeenCalled();
    expect(page.close).toHaveBeenCalled();
  });

  it('lỗi điều hướng thường (không phải do chặn) vẫn ném lỗi gốc', async () => {
    setUpFakeBrowser(async ({ url, emit }) => {
      await emit({ url, navigation: true });
      throw new Error('Navigation timeout of 20000 ms exceeded');
    });

    await expect(scrapeUrlWithJs('https://public.example.com/slow', { waitForTimeout: 0 }))
      .rejects.toThrow('Navigation timeout');
  });
});
