import { AxiosError } from 'axios';
import api from './api';
import { getStoredLocale } from '../utils/i18n';
import { getLoadedDictionary } from '../i18n/englishDictionary';

/**
 * Gọi MỘT lượt AI dài (sinh / sửa landing) và đọc phản hồi LUỒNG NDJSON của backend (PLAN_SUA_AI_DOT4_PR9_HET_524, B-4).
 *
 * Vì sao: một lượt sinh trang mất 60–150 giây, Cloudflare cắt `/api` ở 100 giây nếu không có byte nào chạy (khách thấy 524 trong khi
 * server vẫn xong, lưu và trừ credit; bấm lại bị trừ lần hai). Backend giờ mở phản hồi ngay và ghi một dòng `ping` mỗi 15 giây,
 * xong ghi đúng một dòng `result` hoặc `error` (xem backend/src/services/ai/aiLandingTurn.service.js).
 *
 * Đi qua CHÍNH `api` (axios) thay vì `fetch` riêng: giữ nguyên Bearer + `X-Owner-Context`, làm mới token khi 401 rồi thử lại, toast nâng
 * gói khi hết hạn mức, câu lỗi của server — không chép lại một dòng nào của interceptor. Axios trình duyệt không có API đọc luồng, nhưng
 * adapter XHR báo `onDownloadProgress` kèm `responseText` đang tích luỹ → đọc được các dòng `stage` khi chúng tới; dòng cuối đọc từ
 * thân phản hồi khi hoàn tất.
 *
 * Chạy được với CẢ HAI loại backend (deploy thứ tự nào cũng không gãy):
 *  - backend mới: Content-Type `application/x-ndjson` → tách dòng, lấy `result` / `error`;
 *  - backend cũ (hoặc bản chưa có luồng): Content-Type JSON → thân `{ success, data }` trả nguyên như trước.
 */

export const NDJSON_CONTENT_TYPE = 'application/x-ndjson';

/** Lớn hơn trần tổng 240 giây của server: client không bao giờ bỏ cuộc trước server. */
export const AI_TURN_CLIENT_TIMEOUT_MS = 300000;

/** Mã lỗi khi luồng kết thúc mà không có dòng `result` / `error` (mất mạng, server khởi động lại giữa lượt…). */
export const AI_STREAM_INTERRUPTED_CODE = 'AI_STREAM_INTERRUPTED';

const STREAM_INTERRUPTED_FALLBACK = 'Mất kết nối khi đang xử lý nên chưa nhận được kết quả. Bạn bấm thử lại giúp mình nhé.';

/** Mã định danh của MỘT lần bấm (backend dùng làm khoá chống trừ credit hai lần). */
export function newAiRequestId() {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  } catch {
    // dùng dự phòng bên dưới
  }
  const rand = () => Math.random().toString(36).slice(2, 12).padEnd(10, '0');
  return `${Date.now().toString(36)}-${rand()}-${rand()}`;
}

function parseLine(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    // Dòng hỏng (không nên xảy ra) bị bỏ qua, không làm sập cả lượt.
    return null;
  }
}

/**
 * Tách các dòng ĐÃ ĐỦ (kết thúc bằng '\n') từ `text`, bắt đầu từ vị trí `from`. Dòng cuối chưa có '\n' (đứt giữa hai mảnh) KHÔNG được
 * đọc — nó sẽ đủ ở lần gọi sau.
 * @returns {{ lines: object[], next: number }}
 */
export function readCompleteLines(text, from = 0) {
  const source = String(text || '');
  const start = from > source.length ? 0 : from; // text ngắn lại = request được thử lại từ đầu (sau 401)
  const lastNewline = source.lastIndexOf('\n');
  if (lastNewline < start) return { lines: [], next: start };
  const lines = source.slice(start, lastNewline).split('\n').map(parseLine).filter(Boolean);
  return { lines, next: lastNewline + 1 };
}

/** `onDownloadProgress` của axios (XHR): đọc `responseText` đang tích luỹ, báo từng dòng `stage` mới. */
function createProgressReader(onStage) {
  let consumed = 0;
  return (progressEvent) => {
    if (typeof onStage !== 'function') return;
    const text = progressEvent?.event?.target?.responseText;
    if (typeof text !== 'string') return;
    const { lines, next } = readCompleteLines(text, consumed);
    consumed = next;
    for (const line of lines) {
      if (line.type === 'stage' && line.stage) onStage(String(line.stage));
    }
  };
}

/** Giữ nguyên chữ của luồng NDJSON (helper tự tách dòng); các loại khác thử parse JSON như axios mặc định. */
function ndjsonAwareTransform(data, headers) {
  if (typeof data !== 'string') return data;
  const contentType = String(headers?.get?.('content-type') ?? headers?.['content-type'] ?? '');
  if (contentType.includes(NDJSON_CONTENT_TYPE)) return data;
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

/** Dòng `error` của luồng → lỗi cùng hình dạng axios (`error.response.status/data`) mà mọi nơi gọi đã đọc từ trước. */
function buildStreamError(line) {
  const { type: _type, status, ...body } = line;
  const httpStatus = Number(status) || 500;
  return new AxiosError(
    typeof body.message === 'string' && body.message ? body.message : `Request failed with status code ${httpStatus}`,
    AxiosError.ERR_BAD_RESPONSE,
    undefined,
    undefined,
    { status: httpStatus, statusText: '', data: body, headers: {}, config: {} },
  );
}

function buildInterruptedError() {
  const tr = getLoadedDictionary(getStoredLocale());
  const message = tr?.aiChatbot?.landingStreamInterrupted || STREAM_INTERRUPTED_FALLBACK;
  const error = new AxiosError(message, AI_STREAM_INTERRUPTED_CODE);
  error.code = AI_STREAM_INTERRUPTED_CODE;
  return error;
}

/**
 * @param {string} path  ví dụ '/ai/generate-landing-html'
 * @param {object} payload  thân JSON gửi lên (KHÔNG cần tự thêm requestId)
 * @param {{ onStage?: (stage: string) => void, signal?: AbortSignal, requestId?: string, axiosConfig?: object }} [options]
 *   `requestId`: truyền khi muốn bấm lại cùng một lượt (mặc định sinh mới cho mỗi lần gọi). `axiosConfig`: ghi đè/bổ sung cấu hình axios (test).
 * @returns {Promise<object>} thân phản hồi `{ success: true, data }` — cùng hình dạng route JSON cũ
 * @throws lỗi axios (`error.response.status/data.message`); luồng đứt giữa chừng → mã AI_STREAM_INTERRUPTED
 */
export async function postAiTurn(path, payload, { onStage, signal, requestId, axiosConfig } = {}) {
  const response = await api.post(
    path,
    { ...payload, requestId: requestId || newAiRequestId() },
    {
      timeout: AI_TURN_CLIENT_TIMEOUT_MS,
      // Xin luồng; JSON vẫn được chấp nhận (backend cũ không biết tới tiêu đề này).
      headers: { Accept: `${NDJSON_CONTENT_TYPE}, application/json;q=0.5` },
      responseType: 'text',
      transformResponse: [ndjsonAwareTransform],
      onDownloadProgress: createProgressReader(onStage),
      ...(signal ? { signal } : {}),
      ...(axiosConfig || {}),
    },
  );

  const body = response?.data;
  // Backend cũ / bản chưa có luồng: thân JSON đã được parse sẵn → trả nguyên như trước.
  if (typeof body !== 'string') return body;

  const { lines } = readCompleteLines(body.endsWith('\n') ? body : `${body}\n`, 0);
  const terminal = [...lines].reverse().find((line) => line.type === 'result' || line.type === 'error');
  if (!terminal) throw buildInterruptedError();
  if (terminal.type === 'error') throw buildStreamError(terminal);
  const { type: _type, ...result } = terminal;
  return result;
}

export default postAiTurn;
