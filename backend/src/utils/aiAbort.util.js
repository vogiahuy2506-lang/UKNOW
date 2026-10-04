/**
 * Huỷ lời gọi AI vì NGƯỜI DÙNG đã đóng kết nối (đóng tab / mất mạng giữa lượt sinh landing).
 *
 * Tách khỏi `geminiClient.util.js` để nơi nào cũng nhận ra lỗi này mà KHÔNG phải import lõi Gemini — nhiều spec mock
 * trọn module lõi, thêm một export mới vào đó làm các spec ấy hỏng ("does not provide an export named …").
 */
export const AI_CLIENT_ABORTED_CODE = 'AI_CLIENT_ABORTED';

/** Lỗi ném khi `signal` do nơi gọi truyền vào bị huỷ. `name='AbortError'` để mọi chỗ bắt AbortError vẫn nhận ra. */
export function createClientAbortError() {
  const err = new Error('Người dùng đã đóng kết nối, lời gọi AI bị huỷ.');
  err.name = 'AbortError';
  err.code = AI_CLIENT_ABORTED_CODE;
  err.status = 499;
  return err;
}

export function isClientAbortError(err) {
  return err?.code === AI_CLIENT_ABORTED_CODE;
}
