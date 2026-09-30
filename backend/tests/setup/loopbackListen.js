/**
 * Jest setupFiles — ép `server.listen(0)` KHÔNG chỉ host bind vào 127.0.0.1.
 *
 * Vì sao cần: supertest dựng server bằng `app.listen(0)` (không host => Node bind `::`, dual-stack)
 * nhưng lại kết nối tới `http://127.0.0.1:<cổng>`. Trên macOS, kernel có thể cấp cho socket `::` một cổng
 * đang bị tiến trình KHÁC giữ ở `127.0.0.1` (IDE/Electron, language server, dev server, cổng Docker...
 * đều nghe ở dải cổng tạm 49152-65535), và một kết nối tới `127.0.0.1:<cổng>` luôn tới socket cụ thể
 * hơn — tức tiến trình lạ, không phải server của test. Test nhận trả lời của app khác: 400 ("Client sent
 * an HTTP request to an HTTPS server", "WebSockets request was expected"), 403 ("Invalid CSRF token",
 * thân không phải JSON nên `res.body` = `{}`), 404, "socket hang up" hoặc treo tới hết timeout. Chạy riêng
 * một file thì ít request nên hiếm dính; chạy cả bộ lúc nhiều phiên/IDE đang mở (nhiều listener lạ) thì
 * dính ngẫu nhiên, nên trông như "lỗi do máy tải" — thực ra là do số listener lạ, không phải do tải.
 * Đo 30/09/2026: 6 tiến trình x 25.000 request supertest => 43 lượt trả lời sai + 2 lỗi socket hang up,
 * mọi cổng lệch đều trùng đúng một listener 127.0.0.1 của Electron/Antigravity/language_server (lsof).
 *
 * Bind thẳng 127.0.0.1 thì kernel không bao giờ cấp một cổng đang được giữ ở 127.0.0.1 (EADDRINUSE), và
 * supertest kết nối đúng địa chỉ mình bind. Chỉ đổi các dạng KHÔNG chỉ host — `listen()`, `listen(cb)`,
 * `listen(0[, cb])`, `listen({ port: 0 }[, cb])`; cổng khác 0 hoặc có host tường minh giữ nguyên.
 *
 * PHẢI bind ĐỒNG BỘ: `listen(0, '127.0.0.1')` của Node đi qua dns.lookup bất đồng bộ nên `server.address()`
 * còn null ngay sau đó, mà supertest đọc `app.address().port` liền tức thì. Đường bind đồng bộ vào một địa
 * chỉ cụ thể chỉ có ở `_listen2` (bí danh cũ của setupListenHandle, cùng hàm mà `listen()` gọi khi không
 * có host). Nếu bản Node nào đó bỏ `_listen2` thì rơi về `listen` gốc — spec src/__tests__/loopbackListen.spec.js
 * sẽ báo.
 *
 * Mỗi test file chạy lại setup này trong worker dùng chung `net` thật (module lõi không bị jest cô lập),
 * nên hàm gốc được cất ở Symbol để bọc lại MỘT lớp chứ không chồng lớp.
 */
import net from 'node:net';

const LOOPBACK = '127.0.0.1';
const ORIGINAL_LISTEN = Symbol.for('uknow.test.net.Server.listen.original');

const proto = net.Server.prototype;
const originalListen = proto[ORIGINAL_LISTEN] || proto.listen;
proto[ORIGINAL_LISTEN] = originalListen;

const isEphemeralPort = (value) => value === 0 || value === '0';

/** true nếu lời gọi listen chỉ xin "một cổng tạm bất kỳ" mà không nói host. */
function wantsEphemeralPortOnAnyHost(args) {
  const [first, second] = args;
  if (args.length === 0 || typeof first === 'function') return true; // listen(), listen(cb)
  if (isEphemeralPort(first)) return second === undefined || typeof second === 'function'; // listen(0[, cb])
  return first !== null
    && typeof first === 'object'
    && isEphemeralPort(first.port)
    && Object.keys(first).every((key) => key === 'port'); // listen({ port: 0 }[, cb])
}

proto.listen = function listenOnLoopback(...args) {
  if (!this._handle && typeof this._listen2 === 'function' && wantsEphemeralPortOnAnyHost(args)) {
    const last = args[args.length - 1];
    if (typeof last === 'function') this.once('listening', last);
    this._listen2(LOOPBACK, 0, 4, undefined, undefined);
    return this;
  }
  return originalListen.apply(this, args);
};
