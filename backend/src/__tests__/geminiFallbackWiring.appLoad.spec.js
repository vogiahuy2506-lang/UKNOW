/**
 * D-05 (04/10/2026): lõi Gemini tự tra model dự phòng HỆ THỐNG khi nơi gọi không truyền `fallbackModel` — nhưng lõi là util nên
 * không import service; `aiModelPolicy.service.js` tự gắn hàm tra vào lõi KHI ĐƯỢC NẠP. Spec đơn vị của lõi và của policy đều tự dựng
 * điều kiện nên không chứng minh được rằng PROCESS THẬT có nạp policy trước khi lõi cần tới nó. Ca này nạp app thật (đúng chuỗi import
 * của production) rồi hỏi lõi: đã có hàm tra chưa. Ai đó gỡ mọi import tới policy khỏi chuỗi app → ca này đỏ, thay vì 6 đường (Dashboard,
 * Hộp thư, dịch gói, OCR, slot filler, tư vấn trang chủ) âm thầm mất dự phòng.
 */
import { describe, expect, it } from '@jest/globals';

describe('lõi Gemini được gắn dự phòng hệ thống khi nạp app thật', () => {
  it('sau khi nạp app.js, lõi đã có hàm tra model dự phòng hệ thống', async () => {
    const { hasGeminiFallbackModelResolver } = await import('../utils/geminiClient.util.js');
    expect(hasGeminiFallbackModelResolver()).toBe(false); // phép đo không mù: trước khi nạp app thì chưa có ai gắn

    await import('../app.js');

    expect(hasGeminiFallbackModelResolver()).toBe(true);
  }, 60000);
});
