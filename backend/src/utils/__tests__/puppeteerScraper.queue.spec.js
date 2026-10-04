import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import dns from 'node:dns';
import vm from 'node:vm';

/**
 * D-18 — Puppeteer: hàng đợi tab (tối đa 2 cùng lúc), một lượt khởi động Chrome, trần chữ cào về.
 *
 * Bản cũ: mỗi lượt cào `browser.newPage()` không giới hạn (vài chục lượt cùng lúc = vài chục tab Chrome trong tiến trình backend
 * duy nhất), hai lượt đầu cùng lúc mỗi bên mở một Chrome, và nội dung trang không có trần.
 * Chrome giả (mock `puppeteer`) — KHÔNG mở trình duyệt thật, KHÔNG ra mạng.
 */
const launch = jest.fn();
jest.unstable_mockModule('puppeteer', () => ({ default: { launch } }));

const {
  PUPPETEER_MAX_CONCURRENT_PAGES,
  PUPPETEER_MAX_QUEUED,
  PUPPETEER_QUEUE_WAIT_MS,
  ScrapeBusyError,
  closeBrowser,
  createSlotQueue,
  scrapeUrlWithJs,
} = await import('../puppeteerScraper.util.js');
const { MAX_SCRAPED_TEXT_CHARS } = await import('../scrapeLimits.util.js');

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

// Chờ thật ~1 ms (không chỉ setImmediate): Chrome giả có độ trễ khởi động tính bằng ms.
const tick = () => new Promise((resolve) => { setTimeout(resolve, 1); });
async function until(predicate, label = 'điều kiện') {
  for (let i = 0; i < 400; i += 1) {
    if (predicate()) return;
    await tick();
  }
  throw new Error(`hết chờ: ${label}`);
}

describe('createSlotQueue — giới hạn số việc chạy cùng lúc', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('mặc định: 2 tab cùng lúc, hàng chờ 8, chờ tối đa 30 giây', () => {
    expect(PUPPETEER_MAX_CONCURRENT_PAGES).toBe(2);
    expect(PUPPETEER_MAX_QUEUED).toBe(8);
    expect(PUPPETEER_QUEUE_WAIT_MS).toBe(30000);
  });

  it('chỉ chạy tối đa maxConcurrent việc; việc kế chạy đúng khi có chỗ trống, theo thứ tự đến', async () => {
    const queue = createSlotQueue({ maxConcurrent: 2, maxQueued: 5, waitTimeoutMs: 1000 });
    const started = [];
    const gates = [deferred(), deferred(), deferred(), deferred()];
    const runs = gates.map((gate, i) => queue.run(async () => {
      started.push(i);
      await gate.promise;
      return i;
    }));

    await until(() => started.length === 2, 'hai việc đầu chạy');
    await tick();
    expect(started).toEqual([0, 1]);
    expect(queue.stats()).toEqual({ active: 2, waiting: 2 });

    gates[1].resolve();
    await until(() => started.length === 3, 'việc thứ ba nhận chỗ');
    expect(started).toEqual([0, 1, 2]);

    gates[0].resolve();
    await until(() => started.length === 4, 'việc thứ tư nhận chỗ');
    gates[2].resolve();
    gates[3].resolve();
    await expect(Promise.all(runs)).resolves.toEqual([0, 1, 2, 3]);
    expect(queue.stats()).toEqual({ active: 0, waiting: 0 });
  });

  it('việc ném lỗi VẪN trả chỗ (không để hàng đợi tắc vĩnh viễn)', async () => {
    const queue = createSlotQueue({ maxConcurrent: 1, maxQueued: 2, waitTimeoutMs: 1000 });
    const failing = queue.run(async () => { throw new Error('Navigation timeout'); });
    const next = queue.run(async () => 'ổn');

    await expect(failing).rejects.toThrow('Navigation timeout');
    await expect(next).resolves.toBe('ổn');
    expect(queue.stats()).toEqual({ active: 0, waiting: 0 });
  });

  it('hàng chờ đầy → ScrapeBusyError NGAY (không treo), câu tiếng Việt, mã SCRAPE_QUEUE_BUSY', async () => {
    const queue = createSlotQueue({ maxConcurrent: 1, maxQueued: 1, waitTimeoutMs: 1000 });
    const gate = deferred();
    const running = queue.run(() => gate.promise);
    const waiting = queue.run(async () => 'chờ');
    await tick();

    const error = await queue.run(async () => 'thừa').catch((e) => e);

    expect(error).toBeInstanceOf(ScrapeBusyError);
    expect(error.code).toBe('SCRAPE_QUEUE_BUSY');
    expect(error.message).toMatch(/Vui lòng thử lại/);
    gate.resolve();
    await running;
    await expect(waiting).resolves.toBe('chờ');
  });

  it('chờ quá waitTimeoutMs → ScrapeBusyError và bị gỡ khỏi hàng (không chiếm chỗ của lượt sau)', async () => {
    jest.useFakeTimers();
    const queue = createSlotQueue({ maxConcurrent: 1, maxQueued: 3, waitTimeoutMs: 30000 });
    const gate = deferred();
    const running = queue.run(() => gate.promise);
    const timedOut = queue.run(async () => 'không bao giờ chạy').catch((e) => e);
    await jest.advanceTimersByTimeAsync(0);
    expect(queue.stats()).toEqual({ active: 1, waiting: 1 });

    await jest.advanceTimersByTimeAsync(30000);

    expect(await timedOut).toBeInstanceOf(ScrapeBusyError);
    expect(queue.stats()).toEqual({ active: 1, waiting: 0 });
    gate.resolve();
    await running;
    expect(queue.stats()).toEqual({ active: 0, waiting: 0 });
  });
});

describe('scrapeUrlWithJs — hàng đợi tab + một lượt khởi động Chrome', () => {
  function mockDns() {
    return jest.spyOn(dns.promises, 'lookup').mockImplementation(async () => [{ address: '93.184.216.34', family: 4 }]);
  }

  /** Chrome giả: mỗi tab dừng ở `goto` tới khi test mở cổng (`gates[i]`). */
  function setUpGatedBrowser({ launchDelayMs = 0 } = {}) {
    const gates = [];
    const pages = [];
    const newPage = jest.fn(async () => {
      const page = {
        setViewport: jest.fn(async () => {}),
        setUserAgent: jest.fn(async () => {}),
        setBypassServiceWorker: jest.fn(async () => {}),
        setRequestInterception: jest.fn(async () => {}),
        on: jest.fn(),
        goto: jest.fn(() => {
          const gate = deferred();
          gates.push(gate);
          return gate.promise;
        }),
        waitForSelector: jest.fn(async () => {}),
        url: jest.fn(() => 'https://public.example.com/trang'),
        evaluate: jest.fn(async () => ({ title: 'T', metaDesc: '', content: 'Nội dung', links: [], url: 'https://public.example.com/trang' })),
        close: jest.fn(async () => {}),
      };
      pages.push(page);
      return page;
    });
    const browser = { connected: true, newPage, close: jest.fn(async () => { browser.connected = false; }) };
    launch.mockImplementation(() => new Promise((resolve) => { setTimeout(() => resolve(browser), launchDelayMs); }));
    return { gates, pages, newPage, browser };
  }

  const scrape = (n) => scrapeUrlWithJs(`https://public.example.com/trang-${n}`, { waitForTimeout: 0 });

  beforeEach(() => {
    launch.mockReset();
    mockDns();
  });

  afterEach(async () => {
    await closeBrowser();
    jest.restoreAllMocks();
  });

  it('3 lượt cào cùng lúc → chỉ 2 tab mở; tab thứ ba chờ tới khi một tab xong và đóng', async () => {
    const { gates, newPage, pages } = setUpGatedBrowser();
    const results = [scrape(1), scrape(2), scrape(3)];

    await until(() => newPage.mock.calls.length === 2, 'hai tab đầu mở');
    await until(() => gates.length === 2, 'hai tab đang điều hướng');
    await tick();
    await tick();
    expect(newPage).toHaveBeenCalledTimes(2);

    gates[0].resolve();
    await expect(results[0]).resolves.toMatchObject({ success: true });
    expect(pages[0].close).toHaveBeenCalled();
    await until(() => newPage.mock.calls.length === 3, 'tab thứ ba nhận chỗ sau khi tab đầu xong');

    await until(() => gates.length === 3, 'tab thứ ba điều hướng');
    gates[1].resolve();
    gates[2].resolve();
    await expect(Promise.all(results)).resolves.toHaveLength(3);
  });

  it('lượt cào LỖI vẫn đóng tab và trả chỗ cho lượt sau', async () => {
    const { gates, newPage, pages } = setUpGatedBrowser();
    const results = [scrape(1), scrape(2), scrape(3)].map((p) => p.catch((e) => e));

    await until(() => gates.length === 2, 'hai tab đang điều hướng');
    gates[0].reject(new Error('net::ERR_CONNECTION_REFUSED'));
    await until(() => newPage.mock.calls.length === 3, 'tab thứ ba nhận chỗ sau khi tab đầu lỗi');
    await until(() => gates.length === 3, 'tab thứ ba điều hướng');
    gates[1].resolve();
    gates[2].resolve();

    const [first, second, third] = await Promise.all(results);
    expect(first).toBeInstanceOf(Error);
    expect(first.message).toMatch(/ERR_CONNECTION_REFUSED/);
    expect(pages[0].close).toHaveBeenCalled();
    expect(second.success).toBe(true);
    expect(third.success).toBe(true);
  });

  it('hàng chờ đầy (2 chạy + 8 chờ) → lượt thứ 11 bị từ chối NGAY bằng ScrapeBusyError, không mở thêm tab', async () => {
    const { gates, newPage } = setUpGatedBrowser();
    const active = Array.from({ length: 10 }, (_, i) => scrape(i));
    await until(() => gates.length === 2, 'hai tab đang điều hướng');

    const error = await scrape(99).catch((e) => e);

    expect(error).toBeInstanceOf(ScrapeBusyError);
    expect(newPage).toHaveBeenCalledTimes(2);
    // dọn: mở lần lượt cổng để mọi lượt đang chờ chạy xong
    let opened = 0;
    while (opened < 10) {
      await until(() => gates.length > opened, 'cổng kế');
      gates[opened].resolve();
      opened += 1;
    }
    await expect(Promise.all(active)).resolves.toHaveLength(10);
  });

  it('hai lượt đầu tiên cùng lúc chỉ khởi động MỘT Chrome (không rò một Chrome mồ côi)', async () => {
    const { gates } = setUpGatedBrowser({ launchDelayMs: 20 });
    const results = [scrape(1), scrape(2)];

    await until(() => gates.length === 2, 'hai tab đang điều hướng');
    expect(launch).toHaveBeenCalledTimes(1);
    gates.forEach((gate) => gate.resolve());
    await Promise.all(results);
  });
});

describe('scrapeUrlWithJs — trần chữ cào về (D-18)', () => {
  beforeEach(() => {
    launch.mockReset();
    jest.spyOn(dns.promises, 'lookup').mockImplementation(async () => [{ address: '93.184.216.34', family: 4 }]);
  });

  afterEach(async () => {
    await closeBrowser();
    jest.restoreAllMocks();
  });

  function setUpEvaluatingBrowser(evaluate) {
    const page = {
      setViewport: jest.fn(async () => {}),
      setUserAgent: jest.fn(async () => {}),
      setBypassServiceWorker: jest.fn(async () => {}),
      setRequestInterception: jest.fn(async () => {}),
      on: jest.fn(),
      goto: jest.fn(async () => {}),
      waitForSelector: jest.fn(async () => {}),
      url: jest.fn(() => 'https://public.example.com/dai'),
      evaluate,
      close: jest.fn(async () => {}),
    };
    launch.mockResolvedValue({ connected: true, newPage: jest.fn(async () => page), close: jest.fn(async () => {}) });
    return page;
  }

  it('hàm chạy TRONG trang nhận trần chữ + cờ lấy link qua ĐỐI SỐ (không đọc biến của Node)', async () => {
    const evaluate = jest.fn(async () => ({ title: 'T', metaDesc: '', content: 'x', links: [], url: 'u' }));
    setUpEvaluatingBrowser(evaluate);

    await scrapeUrlWithJs('https://public.example.com/dai', { waitForTimeout: 0, extractLinks: true });

    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(evaluate.mock.calls[0].slice(1)).toEqual([MAX_SCRAPED_TEXT_CHARS, true]);
  });

  it('hàm đó chạy được trong một ngữ cảnh KHÔNG có biến của Node (như trong trình duyệt) và cắt chữ ở trần', async () => {
    let pageFunction;
    const evaluate = jest.fn(async (fn, ...args) => {
      pageFunction = { fn, args };
      return { title: 'T', metaDesc: '', content: 'x', links: [], url: 'u' };
    });
    setUpEvaluatingBrowser(evaluate);
    await scrapeUrlWithJs('https://public.example.com/dai', { waitForTimeout: 0 });

    // Giả lập trình duyệt: chỉ có `document` + `window`. Bản cũ đọc `extractLinks` của Node → ReferenceError ở đây.
    const huge = 'Chữ rất dài. '.repeat(40000);
    const sandbox = {
      document: {
        title: 'Bảng giá',
        querySelector: (selector) => (selector === 'meta[name="description"]' ? null : null),
        querySelectorAll: () => [],
        body: { innerText: huge },
      },
      window: { location: { href: 'https://public.example.com/dai' } },
    };
    vm.createContext(sandbox);
    const run = vm.runInContext(`(${pageFunction.fn.toString()})`, sandbox);
    const out = run(...pageFunction.args);

    expect(huge.length).toBeGreaterThan(MAX_SCRAPED_TEXT_CHARS);
    expect(out.content.length).toBe(MAX_SCRAPED_TEXT_CHARS);
    expect(out.title).toBe('Bảng giá');
  });

  it('kết quả trả về cho nơi gọi cũng ≤ trần (lưới phía Node), không bỏ lại nửa cặp surrogate', async () => {
    const emoji = '😀';
    // 199.999 ký tự thường rồi emoji (2 đơn vị UTF-16) bị trần 200.000 cắt đôi.
    const content = `${'a'.repeat(MAX_SCRAPED_TEXT_CHARS - 1)}${emoji}${'b'.repeat(50)}`;
    setUpEvaluatingBrowser(jest.fn(async () => ({ title: 'T', metaDesc: '', content, links: [], url: 'u' })));

    const result = await scrapeUrlWithJs('https://public.example.com/dai', { waitForTimeout: 0 });

    expect(result.content.length).toBeLessThanOrEqual(MAX_SCRAPED_TEXT_CHARS);
    const last = result.content.charCodeAt(result.content.length - 1);
    expect(last >= 0xd800 && last <= 0xdbff).toBe(false);
  });
});
