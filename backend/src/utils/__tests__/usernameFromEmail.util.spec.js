import { describe, it, expect } from '@jest/globals';
import { generateUsernameFromEmail } from '../usernameFromEmail.util.js';

describe('generateUsernameFromEmail', () => {
  it('sinh username từ email thông thường', async () => {
    const username = await generateUsernameFromEmail('john.doe@example.com', () => false);
    expect(username).toBe('johndoe');
  });

  it('thêm "user" nếu phần prefix < 3 ký tự', async () => {
    const username = await generateUsernameFromEmail('ab@example.com', () => false);
    expect(username).toBe('abuser');
  });

  it('email toàn ký tự đặc biệt trước @ -> "user"', async () => {
    const username = await generateUsernameFromEmail('..._@example.com', () => false);
    expect(username).toBe('user');
  });

  it('trùng lặp tên đã có -> thêm hậu tố số tăng dần', async () => {
    const taken = new Set(['johndoe', 'johndoe1', 'johndoe2']);
    const username = await generateUsernameFromEmail('john.doe@example.com', (candidate) => taken.has(candidate));
    expect(username).toBe('johndoe3');
  });

  it('hỗ trợ callback async trả Promise<boolean>', async () => {
    const taken = new Set(['alice']);
    const username = await generateUsernameFromEmail('alice@work.vn', async (candidate) => taken.has(candidate));
    expect(username).toBe('alice1');
  });
});
