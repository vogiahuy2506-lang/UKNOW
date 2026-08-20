/**
 * Kiểm tra sức khoẻ THẬT của websocket listener zca-js.
 *
 * Vì sao cần: toàn bộ cơ chế tự phục hồi (keep-alive 5 phút, restore cron 15 phút)
 * trước đây chỉ hỏi "có object api trong memory không?". Khi websocket chết mà
 * KHÔNG phát sự kiện `closed` (mạng đứt nửa chừng, Zalo ngừng đẩy tin), object api
 * vẫn nằm nguyên trong memory → mọi vòng kiểm tra đều báo "alive" → hộp thư điếc
 * hoàn toàn cho tới khi restart backend. Gửi tin ra vẫn chạy (HTTP), nên triệu chứng
 * là "tối qua bot trả lời, sáng nay im ru".
 *
 * zca-js `Listener.reset()` gán `this.ws = null` mỗi khi socket đóng, và `start()`
 * gán `this.ws` ngay lập tức, nên `listener.ws.readyState` là nguồn sự thật rẻ nhất
 * (thuần local, không gọi mạng) để biết listener còn nhận tin được hay không.
 */

/** WebSocket readyState (WHATWG) */
export const WS_CONNECTING = 0;
export const WS_OPEN = 1;
export const WS_CLOSING = 2;
export const WS_CLOSED = 3;

/**
 * @typedef {object} ListenerHealth
 * @property {boolean} healthy  true = còn khả năng nhận tin đến
 * @property {string} reason    open | connecting | no_api | no_listener | socket_closed | socket_closing
 * @property {number|null} readyState
 */

/**
 * Trạng thái socket của một zca-js api instance.
 *
 * @param {any} api
 * @returns {ListenerHealth}
 */
export function getListenerSocketState(api) {
  if (!api) {
    return { healthy: false, reason: 'no_api', readyState: null };
  }

  const listener = api.listener;
  if (!listener || typeof listener.start !== 'function') {
    return { healthy: false, reason: 'no_listener', readyState: null };
  }

  // reset() gán null khi socket đóng → chưa start hoặc đã chết.
  const ws = listener.ws;
  if (!ws) {
    return { healthy: false, reason: 'socket_closed', readyState: null };
  }

  const readyState = Number(ws.readyState);
  if (readyState === WS_OPEN) {
    return { healthy: true, reason: 'open', readyState };
  }
  // Đang bắt tay (vừa restore xong) — coi như sống để không giết socket mới.
  if (readyState === WS_CONNECTING) {
    return { healthy: true, reason: 'connecting', readyState };
  }

  return {
    healthy: false,
    reason: readyState === WS_CLOSING ? 'socket_closing' : 'socket_closed',
    readyState: Number.isFinite(readyState) ? readyState : null,
  };
}

/**
 * @param {any} api
 * @returns {boolean}
 */
export function isListenerSocketHealthy(api) {
  return getListenerSocketState(api).healthy;
}
