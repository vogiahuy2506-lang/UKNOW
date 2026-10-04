/**
 * Công cụ test cho phản hồi LUỒNG NDJSON (PR-9): client HTTP thật đọc từng dòng khi byte đến, đợi điều kiện, promise mở khoá tay.
 * Không phải spec (testMatch chỉ nhận *.spec.js) — hai spec dùng chung: aiLandingTurn.service.spec.js và ai.controller.spec.js.
 */
import http from 'node:http';

export const NDJSON = 'application/x-ndjson';

export const until = async (predicate, { timeoutMs = 3000, label = 'điều kiện' } = {}) => {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (predicate()) return;
    if (Date.now() - start > timeoutMs) throw new Error(`Quá ${timeoutMs}ms chờ ${label}`);
    await new Promise((resolve) => { setTimeout(resolve, 5); });
  }
};

export const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

/**
 * @param {number} port
 * @param {{ path?: string, body?: object, accept?: string|null, headers?: object }} [opts]
 * @returns client có: lines (đã parse), raw, status, headers, done (Promise khi đóng), destroy(), types()
 */
export function openNdjsonClient(port, { path = '/t', body = { requestId: 'req-00000001-aaaa' }, accept = NDJSON, headers = {} } = {}) {
  const c = { lines: [], raw: '', headers: null, status: null, ended: false, req: null };
  const payload = JSON.stringify(body);
  c.done = new Promise((resolve) => {
    c.req = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
          ...(accept ? { accept } : {}),
          ...headers,
        },
      },
      (res) => {
        c.status = res.statusCode;
        c.headers = res.headers;
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          c.raw += chunk;
          const parts = c.raw.split('\n');
          // Dòng cuối có thể mới nhận một nửa (chưa có '\n') — chỉ parse những dòng đã đủ.
          c.lines = parts.slice(0, -1).filter(Boolean).map((l) => JSON.parse(l));
        });
        res.on('end', () => { c.ended = true; resolve(); });
        res.on('error', () => resolve());
      },
    );
    c.req.on('error', () => resolve());
    c.req.write(payload);
    c.req.end();
  });
  c.destroy = () => c.req.destroy();
  c.types = () => c.lines.map((l) => l.type);
  return c;
}
