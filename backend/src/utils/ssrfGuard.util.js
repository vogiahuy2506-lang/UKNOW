/**
 * Chặn SSRF (Server-Side Request Forgery) cho request phía server tới URL/host do người dùng nhập
 * (cào URL cho kho tri thức, webhook Google Sheets, SMTP tự cấu hình...).
 *
 * Quy tắc áp dụng:
 * - URL chỉ http/https, không cho userinfo (`user:pass@host`). URL được parse theo WHATWG nên mọi
 *   cách viết IPv4 (`2130706433`, `0177.0.0.1`, `0x7f.1`, `127.1`) đều quy về dạng chấm chuẩn.
 * - Chặn tên host nội bộ: `localhost`, `*.localhost`, `*.local`, `*.localdomain`, `*.internal`,
 *   `*.home.arpa` và tên một nhãn không có dấu chấm (tên container Docker như `redis`).
 * - Phân giải DNS TẤT CẢ địa chỉ (`dns.lookup` all + verbatim); từ chối nếu BẤT KỲ địa chỉ nào không
 *   công khai: 0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12, 192.0.0/24, 192.0.2/24, 192.168/16,
 *   198.18/15, 198.51.100/24, 203.0.113/24, 224/4, 240/4; IPv6 ngoài 2000::/3, ::1, fc00::/7,
 *   fe80::/10, ff00::/8, 2001:db8::/32...; IPv6 nhúng IPv4 (::ffff:0:0/96, ::/96, 64:ff9b::/96,
 *   2002::/16) được xét theo IPv4 bên trong.
 * - Kết nối được GHIM vào đúng địa chỉ đã kiểm (lookup tùy biến trên Agent/socket), không phân giải
 *   lại lúc connect — đổi DNS giữa lúc kiểm và lúc kết nối không có tác dụng. SNI/Host giữ tên gốc.
 * - Không tự theo redirect: tự theo tối đa N chặng, kiểm lại từng chặng; có timeout tổng và giới hạn
 *   kích thước phản hồi (tính sau giải nén).
 *
 * Ngoại lệ dev/test: CHỈ khi NODE_ENV khác 'production' và có SSRF_ALLOW_LOOPBACK=true (hoặc nơi gọi
 * truyền `allowLoopback: true`) thì cho phép loopback (`localhost`, 127.0.0.0/8, ::1). Các dải nội bộ
 * khác vẫn bị chặn.
 */
import dns from 'node:dns';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';

export const SSRF_BLOCKED_CODE = 'SSRF_BLOCKED';
export const SSRF_BLOCKED_MESSAGE = 'URL không hợp lệ hoặc trỏ tới địa chỉ nội bộ — không được phép truy cập';

const DEFAULT_DNS_TIMEOUT_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_TCP_CONNECT_TIMEOUT_MS = 30_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
// Header hop-by-hop/định tuyến không cho nơi gọi tự đặt (Host luôn là tên host gốc của URL).
const STRIPPED_REQUEST_HEADERS = new Set([
  'host', 'connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'upgrade', 'te', 'trailer',
  'content-length',
]);
const CROSS_ORIGIN_SENSITIVE_HEADERS = ['authorization', 'cookie', 'proxy-authorization'];
const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.localdomain', '.internal', '.home.arpa'];

const BLOCKED_IPV4_SUBNETS = [
  ['0.0.0.0', 8], // "mạng này" — 0.0.0.0 trên Linux chính là máy hiện tại
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local, metadata cloud 169.254.169.254
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // dành riêng + broadcast 255.255.255.255
];

// Chỉ 2000::/3 là unicast toàn cầu; trong đó vẫn chặn các khối đặc biệt dưới đây. Các khối nằm ngoài
// 2000::/3 (fc00::/7, fe80::/10, ff00::/8, ::1...) liệt kê lại cho dễ đọc.
const BLOCKED_IPV6_SUBNETS = [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b:1::', 48], // NAT64 dùng nội bộ
  ['100::', 64], // discard-only
  ['2001::', 32], // Teredo
  ['2001:db8::', 32], // tài liệu
  ['3fff::', 20], // tài liệu
  ['fc00::', 7], // ULA
  ['fe80::', 10], // link-local
  ['fec0::', 10], // site-local (cũ)
  ['ff00::', 8], // multicast
];

const blockedIpv4 = new net.BlockList();
for (const [address, prefix] of BLOCKED_IPV4_SUBNETS) blockedIpv4.addSubnet(address, prefix, 'ipv4');
const blockedIpv6 = new net.BlockList();
for (const [address, prefix] of BLOCKED_IPV6_SUBNETS) blockedIpv6.addSubnet(address, prefix, 'ipv6');
const loopbackIpv4 = new net.BlockList();
loopbackIpv4.addSubnet('127.0.0.0', 8, 'ipv4');

export class SsrfBlockedError extends Error {
  /**
   * @param {string} [message]
   * @param {{ reason?: string }} [details] reason chỉ dùng để log nội bộ, không trả cho client
   */
  constructor(message = SSRF_BLOCKED_MESSAGE, { reason } = {}) {
    super(message);
    this.name = 'SsrfBlockedError';
    this.code = SSRF_BLOCKED_CODE;
    this.status = 400;
    this.statusCode = 400;
    if (reason) this.reason = reason;
  }
}

export function isSsrfBlockedError(error) {
  return Boolean(error) && error.code === SSRF_BLOCKED_CODE;
}

/**
 * Cho phép loopback? Không bao giờ ở production; ngoài production cần cờ env hoặc nơi gọi yêu cầu.
 *
 * @param {{ allowLoopback?: boolean }} [opts]
 */
export function isLoopbackAllowed(opts = {}) {
  if (process.env.NODE_ENV === 'production') return false;
  if (opts?.allowLoopback === true) return true;
  return String(process.env.SSRF_ALLOW_LOOPBACK || '').trim().toLowerCase() === 'true';
}

/** Chữ thường, bỏ ngoặc vuông IPv6 và dấu chấm cuối (`LOCALHOST.` → `localhost`). */
export function normalizeHostname(host) {
  let value = String(host ?? '').trim().toLowerCase();
  if (value.startsWith('[') && value.endsWith(']')) value = value.slice(1, -1);
  while (value.endsWith('.')) value = value.slice(0, -1);
  return value;
}

/** Bỏ zone id của IPv6 link-local (`fe80::1%eth0` → `fe80::1`); giữ nguyên chuỗi khác. */
function stripZoneId(address) {
  const value = String(address ?? '');
  const percent = value.indexOf('%');
  return percent !== -1 && value.includes(':') ? value.slice(0, percent) : value;
}

/**
 * IPv6 (đã hợp lệ) → mảng 8 nhóm 16 bit; null nếu không parse được.
 *
 * @param {string} address
 * @returns {number[]|null}
 */
function parseIpv6Groups(address) {
  let text = String(address).toLowerCase();
  const lastColon = text.lastIndexOf(':');
  const tail = text.slice(lastColon + 1);
  if (tail.includes('.')) {
    if (!net.isIPv4(tail)) return null;
    const octets = tail.split('.').map(Number);
    text = `${text.slice(0, lastColon + 1)}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  let groups = head;
  if (halves.length === 2) {
    const missing = 8 - head.length - rest.length;
    if (missing < 1) return null;
    groups = [...head, ...new Array(missing).fill('0'), ...rest];
  }
  if (groups.length !== 8) return null;
  const result = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    result.push(Number.parseInt(group, 16));
  }
  return result;
}

function groupsToIpv4(high, low) {
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

/**
 * IPv4 nhúng trong IPv6 (mapped/translated/compat/NAT64/6to4) hoặc null.
 *
 * @param {number[]} groups
 */
function embeddedIpv4(groups) {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;
  const upperZero = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0;
  if (upperZero && g4 === 0 && g5 === 0xffff) return groupsToIpv4(g6, g7); // ::ffff:a.b.c.d
  if (upperZero && g4 === 0xffff && g5 === 0) return groupsToIpv4(g6, g7); // ::ffff:0:a.b.c.d
  if (upperZero && g4 === 0 && g5 === 0) return groupsToIpv4(g6, g7); // ::a.b.c.d (gồm :: và ::1)
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return groupsToIpv4(g6, g7); // NAT64 64:ff9b::/96
  }
  if (g0 === 0x2002) return groupsToIpv4(g1, g2); // 6to4 2002:AABB:CCDD::/48
  return null;
}

function isPublicIpv4(address, allowLoopback) {
  if (allowLoopback && loopbackIpv4.check(address, 'ipv4')) return true;
  return !blockedIpv4.check(address, 'ipv4');
}

function isPublicIpv6(address, allowLoopback) {
  const groups = parseIpv6Groups(address);
  if (!groups) return false;
  const isLoopbackV6 = groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1;
  if (allowLoopback && isLoopbackV6) return true;
  const v4 = embeddedIpv4(groups);
  if (v4 !== null) return isPublicIpv4(v4, allowLoopback);
  if (groups[0] < 0x2000 || groups[0] > 0x3fff) return false; // ngoài 2000::/3
  return !blockedIpv6.check(address, 'ipv6');
}

/**
 * Địa chỉ IP có được phép kết nối không (công khai; loopback chỉ khi được mở ngoài production).
 * Chuỗi không phải IP → false.
 *
 * @param {string} address
 * @param {{ allowLoopback?: boolean }} [opts] đã qua isLoopbackAllowed ở nơi gọi nội bộ
 */
export function isPublicIpAddress(address, { allowLoopback = false } = {}) {
  const ip = stripZoneId(normalizeHostname(address));
  const family = net.isIP(ip);
  if (family === 4) return isPublicIpv4(ip, allowLoopback);
  if (family === 6) return isPublicIpv6(ip, allowLoopback);
  return false;
}

/**
 * Tên host thuộc nhóm nội bộ (không cần DNS)? IP literal trả false — xét bằng isPublicIpAddress.
 *
 * @param {string} hostname
 * @param {{ allowLoopback?: boolean }} [opts]
 */
export function isBlockedHostname(hostname, { allowLoopback = false } = {}) {
  const host = normalizeHostname(hostname);
  if (!host) return true;
  if (net.isIP(stripZoneId(host))) return false;
  if (host === 'localhost' || host.endsWith('.localhost')) return !allowLoopback;
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  // Tên một nhãn (không có dấu chấm) phân giải qua DNS nội bộ của Docker/LAN.
  if (!host.includes('.')) return true;
  return false;
}

/**
 * Kiểm tra nhanh KHÔNG dùng DNS: host rỗng, tên nội bộ hoặc IP literal không công khai → true.
 * Dùng khi cần báo lỗi sớm ở luồng đồng bộ; luồng kết nối thật vẫn phải qua assertPublicHost.
 */
export function isObviouslyNonPublicHost(host, opts = {}) {
  const allowLoopback = isLoopbackAllowed(opts);
  const hostname = normalizeHostname(host);
  if (!hostname) return true;
  const literal = stripZoneId(hostname);
  if (net.isIP(literal)) return !isPublicIpAddress(literal, { allowLoopback });
  return isBlockedHostname(hostname, { allowLoopback });
}

function createTimeoutError(timeoutMs, what = 'Yêu cầu') {
  const error = new Error(`${what} hết thời gian (${timeoutMs}ms)`);
  error.name = 'TimeoutError';
  error.code = 'ETIMEDOUT';
  return error;
}

function withTimeout(promise, timeoutMs, makeError) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(makeError()), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Kiểm tra host rồi trả về danh sách địa chỉ ĐÃ KIỂM (dùng để ghim kết nối).
 * Lỗi DNS (ENOTFOUND...) được ném nguyên vẹn; host/địa chỉ bị chặn → SsrfBlockedError.
 *
 * @param {string} host tên host hoặc IP (có thể có ngoặc vuông)
 * @param {{ allowLoopback?: boolean, timeoutMs?: number }} [opts]
 * @returns {Promise<{ hostname: string, addresses: Array<{ address: string, family: 4|6 }> }>}
 */
export async function assertPublicHost(host, opts = {}) {
  const allowLoopback = isLoopbackAllowed(opts);
  const hostname = normalizeHostname(host);
  if (!hostname) throw new SsrfBlockedError(undefined, { reason: 'empty_host' });

  const literal = stripZoneId(hostname);
  const literalFamily = net.isIP(literal);
  if (literalFamily) {
    if (!isPublicIpAddress(literal, { allowLoopback })) {
      throw new SsrfBlockedError(undefined, { reason: 'non_public_address' });
    }
    return { hostname, addresses: [{ address: literal, family: literalFamily }] };
  }

  if (isBlockedHostname(hostname, { allowLoopback })) {
    throw new SsrfBlockedError(undefined, { reason: 'blocked_hostname' });
  }

  const timeoutMs = Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0 ? opts.timeoutMs : DEFAULT_DNS_TIMEOUT_MS;
  const records = await withTimeout(
    dns.promises.lookup(hostname, { all: true, verbatim: true }),
    timeoutMs,
    () => createTimeoutError(timeoutMs, `Phân giải DNS ${hostname}`)
  );
  const addresses = (Array.isArray(records) ? records : [records])
    .filter((record) => record && typeof record.address === 'string')
    .map((record) => {
      const address = stripZoneId(record.address);
      return { address, family: net.isIP(address) === 6 ? 6 : 4 };
    });
  if (!addresses.length) {
    const error = new Error(`getaddrinfo ENOTFOUND ${hostname}`);
    error.code = 'ENOTFOUND';
    error.hostname = hostname;
    throw error;
  }
  if (addresses.some(({ address }) => !isPublicIpAddress(address, { allowLoopback }))) {
    throw new SsrfBlockedError(undefined, { reason: 'non_public_address' });
  }
  return { hostname, addresses };
}

/**
 * Kiểm tra URL (http/https, không userinfo, host công khai).
 *
 * @param {string|URL} input
 * @param {{ allowLoopback?: boolean, timeoutMs?: number }} [opts]
 * @returns {Promise<{ url: URL, hostname: string, addresses: Array<{ address: string, family: 4|6 }> }>}
 */
export async function assertPublicUrl(input, opts = {}) {
  let url;
  try {
    url = new URL(input instanceof URL ? input.href : String(input ?? '').trim());
  } catch {
    throw new SsrfBlockedError('URL không hợp lệ', { reason: 'invalid_url' });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SsrfBlockedError(undefined, { reason: 'protocol' });
  }
  if (url.username || url.password) {
    throw new SsrfBlockedError(undefined, { reason: 'userinfo' });
  }
  const { hostname, addresses } = await assertPublicHost(url.hostname, opts);
  return { url, hostname, addresses };
}

/**
 * Hàm `lookup` cho net/http/https chỉ trả về các địa chỉ đã kiểm của đúng một host — không hỏi DNS.
 *
 * @param {string} hostname
 * @param {Array<{ address: string, family: number }>} addresses
 */
export function createPinnedLookup(hostname, addresses) {
  const expected = normalizeHostname(hostname);
  const pinned = (addresses || []).map(({ address, family }) => ({ address, family: family === 6 ? 6 : 4 }));
  return function pinnedLookup(host, options, callback) {
    let cb = callback;
    let opts = options;
    if (typeof opts === 'function') {
      cb = opts;
      opts = {};
    }
    if (typeof opts === 'number') opts = { family: opts };
    opts = opts || {};

    if (normalizeHostname(host) !== expected) {
      process.nextTick(cb, new SsrfBlockedError(undefined, { reason: 'unexpected_lookup' }));
      return;
    }
    let wanted = 0;
    if (opts.family === 4 || opts.family === 'IPv4') wanted = 4;
    else if (opts.family === 6 || opts.family === 'IPv6') wanted = 6;
    const list = wanted ? pinned.filter((entry) => entry.family === wanted) : pinned;
    if (!list.length) {
      const error = new Error(`getaddrinfo ENOTFOUND ${host}`);
      error.code = 'ENOTFOUND';
      error.hostname = host;
      process.nextTick(cb, error);
      return;
    }
    if (opts.all) {
      process.nextTick(cb, null, list.map((entry) => ({ ...entry })));
      return;
    }
    process.nextTick(cb, null, list[0].address, list[0].family);
  };
}

function normalizeRequestHeaders(headers) {
  const result = {};
  if (!headers) return result;
  const entries = typeof headers.entries === 'function' && !Array.isArray(headers)
    ? Array.from(headers.entries())
    : Object.entries(headers);
  for (const [name, value] of entries) {
    const key = String(name).toLowerCase();
    if (value === undefined || value === null || STRIPPED_REQUEST_HEADERS.has(key)) continue;
    result[key] = Array.isArray(value) ? value.map(String) : String(value);
  }
  return result;
}

function toBodyBuffer(body) {
  if (body === undefined || body === null) return null;
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (typeof body === 'string') return Buffer.from(body, 'utf8');
  throw new TypeError('safeHttpRequest: body phải là string hoặc Buffer');
}

function createTooLargeError(maxBytes) {
  const error = new Error(`Phản hồi vượt quá giới hạn ${maxBytes} byte`);
  error.code = 'RESPONSE_TOO_LARGE';
  return error;
}

function sendOnce(target, { method, headers, body, rejectUnauthorized }, state) {
  return new Promise((resolve, reject) => {
    const { url, hostname, addresses } = target;
    const secure = url.protocol === 'https:';
    const lookup = createPinnedLookup(hostname, addresses);
    const agent = secure
      ? new https.Agent({ keepAlive: false, lookup, rejectUnauthorized })
      : new http.Agent({ keepAlive: false, lookup });
    const requestHeaders = { ...headers };
    if (body) requestHeaders['content-length'] = String(body.length);

    let settled = false;
    let request;
    try {
      request = (secure ? https : http).request({
        protocol: url.protocol,
        // IPv6 literal: URL giữ ngoặc vuông, http.request cần địa chỉ trần. Tên host giữ nguyên (SNI/Host).
        hostname: url.hostname.replace(/^\[|\]$/g, ''),
        port: url.port || undefined,
        path: `${url.pathname || '/'}${url.search || ''}`,
        method,
        headers: requestHeaders,
        agent,
      });
    } catch (error) {
      agent.destroy();
      reject(error);
      return;
    }
    state.request = request;
    request.on('response', (response) => {
      if (settled) {
        response.resume();
        return;
      }
      settled = true;
      resolve({ response, agent });
    });
    // Listener 'error' giữ suốt vòng đời request để lỗi muộn (timeout, reset) không làm sập tiến trình.
    request.on('error', (error) => {
      if (settled) return;
      settled = true;
      agent.destroy();
      reject(state.timedOut ? createTimeoutError(state.timeoutMs) : error);
    });
    request.end(body || undefined);
  });
}

function readBody(response, { maxBytes, decompress, method }, state) {
  return new Promise((resolve, reject) => {
    const status = response.statusCode || 0;
    response.on('error', () => {});
    if (method === 'HEAD' || status === 204 || status === 304) {
      response.resume();
      resolve(Buffer.alloc(0));
      return;
    }
    const declaredLength = Number(response.headers['content-length']);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      response.destroy();
      reject(createTooLargeError(maxBytes));
      return;
    }

    let decoder = null;
    if (decompress) {
      const encoding = String(response.headers['content-encoding'] || '').trim().toLowerCase();
      if (encoding === 'gzip' || encoding === 'x-gzip') decoder = zlib.createGunzip();
      else if (encoding === 'deflate') decoder = zlib.createInflate();
      else if (encoding === 'br') decoder = zlib.createBrotliDecompress();
    }

    const chunks = [];
    let total = 0;
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (error) {
        response.destroy();
        decoder?.destroy();
        reject(state.timedOut ? createTimeoutError(state.timeoutMs) : error);
        return;
      }
      resolve(value);
    };

    const source = decoder || response;
    if (decoder) {
      response.on('error', (error) => finish(error));
      response.pipe(decoder);
    }
    source.on('data', (chunk) => {
      if (settled) return;
      total += chunk.length;
      if (total > maxBytes) {
        finish(createTooLargeError(maxBytes));
        return;
      }
      chunks.push(chunk);
    });
    source.on('end', () => finish(null, Buffer.concat(chunks, total)));
    source.on('error', (error) => finish(error));
    response.on('close', () => {
      if (!response.complete) finish(new Error('Kết nối bị đóng trước khi nhận đủ phản hồi'));
    });
  });
}

/**
 * Gửi request HTTP(S) an toàn tới URL do người dùng nhập.
 *
 * - Mỗi chặng (kể cả redirect) đều qua assertPublicUrl; kết nối ghim vào địa chỉ đã kiểm.
 * - Redirect tự theo tối đa `maxRedirects` (0 = trả nguyên phản hồi 3xx); 303 và 301/302 của POST
 *   đổi sang GET (bỏ body) giống trình duyệt; sang origin khác thì bỏ Authorization/Cookie.
 * - `timeoutMs` tính cho TOÀN BỘ (DNS + mọi chặng + đọc body); `maxBytes` tính sau giải nén.
 *
 * @param {string|URL} input
 * @param {object} [options]
 * @param {string} [options.method='GET']
 * @param {object} [options.headers]
 * @param {string|Buffer} [options.body]
 * @param {number} [options.timeoutMs=15000]
 * @param {number} [options.maxBytes=10485760]
 * @param {number} [options.maxRedirects=5]
 * @param {boolean} [options.decompress=true]
 * @param {boolean} [options.allowLoopback=false] chỉ có tác dụng khi NODE_ENV khác production
 * @param {boolean} [options.rejectUnauthorized=true]
 * @returns {Promise<{ status: number, statusText: string, headers: object, url: string, redirected: boolean, body: Buffer }>}
 */
export async function safeHttpRequest(input, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  const maxBytes = Number.isFinite(options.maxBytes) && options.maxBytes > 0 ? options.maxBytes : DEFAULT_MAX_BYTES;
  const maxRedirects = Number.isInteger(options.maxRedirects) && options.maxRedirects >= 0
    ? options.maxRedirects
    : DEFAULT_MAX_REDIRECTS;
  const decompress = options.decompress !== false;
  const rejectUnauthorized = options.rejectUnauthorized !== false;
  const guardOptions = { allowLoopback: options.allowLoopback === true };

  let method = String(options.method || 'GET').toUpperCase();
  let body = toBodyBuffer(options.body);
  const headers = normalizeRequestHeaders(options.headers);
  if (decompress && !headers['accept-encoding']) headers['accept-encoding'] = 'gzip, br';

  const deadline = Date.now() + timeoutMs;
  const state = { request: null, timedOut: false, timeoutMs };
  const timer = setTimeout(() => {
    state.timedOut = true;
    state.request?.destroy(createTimeoutError(timeoutMs));
  }, timeoutMs);

  let currentUrl = input;
  let redirectCount = 0;
  try {
    for (;;) {
      const remaining = deadline - Date.now();
      if (state.timedOut || remaining <= 0) throw createTimeoutError(timeoutMs);
      const target = await withTimeout(
        assertPublicUrl(currentUrl, { ...guardOptions, timeoutMs: remaining }),
        remaining,
        () => createTimeoutError(timeoutMs)
      );
      if (state.timedOut) throw createTimeoutError(timeoutMs);

      const { response, agent } = await sendOnce(target, { method, headers, body, rejectUnauthorized }, state);
      try {
        const status = response.statusCode || 0;
        const location = response.headers.location;
        if (maxRedirects > 0 && REDIRECT_STATUSES.has(status) && location) {
          response.on('error', () => {});
          response.resume();
          if (redirectCount >= maxRedirects) {
            const error = new Error(`Quá số lần chuyển hướng cho phép (${maxRedirects})`);
            error.code = 'TOO_MANY_REDIRECTS';
            throw error;
          }
          redirectCount += 1;
          let nextUrl;
          try {
            nextUrl = new URL(location, target.url);
          } catch {
            throw new SsrfBlockedError('URL chuyển hướng không hợp lệ', { reason: 'invalid_redirect' });
          }
          if ((status === 303 && method !== 'HEAD') || ((status === 301 || status === 302) && method === 'POST')) {
            method = 'GET';
            body = null;
            delete headers['content-type'];
          }
          if (nextUrl.origin !== target.url.origin) {
            for (const name of CROSS_ORIGIN_SENSITIVE_HEADERS) delete headers[name];
          }
          currentUrl = nextUrl;
          continue;
        }

        const data = await readBody(response, { maxBytes, decompress, method }, state);
        return {
          status,
          statusText: response.statusMessage || '',
          headers: response.headers,
          url: target.url.href,
          redirected: redirectCount > 0,
          body: data,
        };
      } finally {
        agent.destroy();
      }
    }
  } finally {
    clearTimeout(timer);
    state.request = null;
  }
}

/**
 * Bản giống `fetch` (tập con: ok/status/statusText/url/redirected/headers.get/text/json/arrayBuffer)
 * chạy trên safeHttpRequest — thay cho `fetch(urlNguoiDungNhap)`. Không hỗ trợ `signal`; dùng
 * `timeoutMs`/`maxBytes`/`maxRedirects`/`allowLoopback` trong init.
 *
 * @param {string|URL} input
 * @param {object} [init]
 */
export async function safeFetch(input, init = {}) {
  const result = await safeHttpRequest(input, {
    method: init.method,
    headers: init.headers,
    body: init.body,
    timeoutMs: init.timeoutMs,
    maxBytes: init.maxBytes,
    maxRedirects: init.maxRedirects,
    allowLoopback: init.allowLoopback,
  });
  const { body } = result;
  return {
    ok: result.status >= 200 && result.status < 300,
    status: result.status,
    statusText: result.statusText,
    url: result.url,
    redirected: result.redirected,
    headers: {
      get(name) {
        const value = result.headers[String(name).toLowerCase()];
        if (value === undefined || value === null) return null;
        return Array.isArray(value) ? value.join(', ') : String(value);
      },
    },
    text: async () => body.toString('utf8'),
    json: async () => JSON.parse(body.toString('utf8')),
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  };
}

function openTcpSocket(address, port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: address, port });
    const cleanup = () => {
      socket.removeListener('connect', onConnect);
      socket.removeListener('error', onError);
      socket.removeListener('timeout', onTimeout);
    };
    function onConnect() {
      cleanup();
      socket.setTimeout(0);
      resolve(socket);
    }
    function onError(error) {
      cleanup();
      socket.destroy();
      reject(error);
    }
    function onTimeout() {
      const error = new Error('Connection timeout');
      error.code = 'ETIMEDOUT';
      onError(error);
    }
    socket.setTimeout(timeoutMs);
    socket.once('connect', onConnect);
    socket.once('error', onError);
    socket.once('timeout', onTimeout);
  });
}

/**
 * Mở kết nối TCP tới một trong các địa chỉ ĐÃ KIỂM (kết quả assertPublicHost) — IPv4 trước, lần lượt
 * từng địa chỉ, mỗi lần thử có timeout riêng. Dùng cho giao thức không phải HTTP (SMTP...).
 *
 * @param {Array<{ address: string, family: number }>} addresses
 * @param {number} port
 * @param {{ connectTimeoutMs?: number }} [opts]
 * @returns {Promise<import('node:net').Socket>}
 */
export async function connectToVettedAddresses(addresses, port, opts = {}) {
  const connectTimeoutMs = Number.isFinite(opts.connectTimeoutMs) && opts.connectTimeoutMs > 0
    ? opts.connectTimeoutMs
    : DEFAULT_TCP_CONNECT_TIMEOUT_MS;
  const list = Array.isArray(addresses) ? addresses : [];
  const ordered = [
    ...list.filter((entry) => entry.family === 4),
    ...list.filter((entry) => entry.family !== 4),
  ];
  let lastError = null;
  for (const { address } of ordered) {
    try {
      return await openTcpSocket(address, port, connectTimeoutMs);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`Không có địa chỉ để kết nối cổng ${port}`);
}

/**
 * Kiểm host (DNS, chặn địa chỉ không công khai) rồi mở TCP ghim vào địa chỉ đã kiểm.
 *
 * @param {string} host
 * @param {number} port
 * @param {{ connectTimeoutMs?: number, dnsTimeoutMs?: number, allowLoopback?: boolean }} [opts]
 * @returns {Promise<import('node:net').Socket>}
 */
export async function connectToPublicHost(host, port, opts = {}) {
  const { addresses } = await assertPublicHost(host, {
    allowLoopback: opts.allowLoopback === true,
    timeoutMs: opts.dnsTimeoutMs,
  });
  return connectToVettedAddresses(addresses, port, opts);
}
