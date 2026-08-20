import { describe, it, expect } from '@jest/globals';

describe('app module loading', () => {
  it('nạp app.js và khởi tạo Express app thành công', async () => {
    const { default: createApp } = await import('../app.js');
    expect(typeof createApp).toBe('function');
    const app = createApp();
    expect(app).toBeDefined();
    expect(typeof app.use).toBe('function');
  });
});
