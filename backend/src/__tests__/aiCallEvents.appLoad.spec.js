/**
 * PR-10: lõi Gemini/embedding chỉ báo sự kiện cho "người quan sát" mà TẦNG SERVICE gắn vào khi được nạp (`aiCallEvents.service.js`); lõi là util
 * nên không tự gắn. Spec đơn vị của lõi và của service đều tự dựng điều kiện nên không chứng minh được PROCESS THẬT có nạp service trước khi lõi cần.
 * Ca này nạp app thật (đúng chuỗi import của production) rồi hỏi: đã có người quan sát chưa. Ai đó gỡ dòng import ở `app.js` → ca này đỏ,
 * thay vì mọi lần gọi AI âm thầm không còn được ghi sổ (không ai biết cho tới khi cần số liệu lúc sự cố).
 */
import { describe, expect, it } from '@jest/globals';

describe('lõi AI được gắn sổ bền khi nạp app thật', () => {
  it('sau khi nạp app.js, lõi đã có người quan sát lần gọi AI', async () => {
    const { hasAiCallObserver } = await import('../utils/aiCallObserver.util.js');
    expect(hasAiCallObserver()).toBe(false); // phép đo không mù: trước khi nạp app thì chưa có ai gắn

    await import('../app.js');

    expect(hasAiCallObserver()).toBe(true);
  }, 60000);
});
