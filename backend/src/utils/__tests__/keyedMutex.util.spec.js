import { describe, expect, it } from '@jest/globals';
import { __activeLockCountForTest, withKeyedLock, wizardSessionLockKey } from '../keyedMutex.util.js';

const tick = () => new Promise((resolve) => { setImmediate(resolve); });

describe('withKeyedLock', () => {
  it('cùng khoá chạy tuần tự theo thứ tự đến', async () => {
    const order = [];
    let release1;
    const first = withKeyedLock('k', async () => {
      order.push('a:start');
      await new Promise((resolve) => { release1 = resolve; });
      order.push('a:end');
    });
    const second = withKeyedLock('k', async () => { order.push('b'); });
    await tick();
    expect(order).toEqual(['a:start']);
    release1();
    await Promise.all([first, second]);
    expect(order).toEqual(['a:start', 'a:end', 'b']);
  });

  it('khác khoá chạy song song', async () => {
    const order = [];
    let release1;
    const first = withKeyedLock('k1', async () => {
      await new Promise((resolve) => { release1 = resolve; });
      order.push('k1');
    });
    await withKeyedLock('k2', async () => { order.push('k2'); });
    expect(order).toEqual(['k2']);
    release1();
    await first;
  });

  it('lỗi của người trước không chặn người sau; khoá được dọn khi hết người chờ', async () => {
    await expect(withKeyedLock('e', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    await expect(withKeyedLock('e', async () => 'ok')).resolves.toBe('ok');
    expect(__activeLockCountForTest()).toBe(0);
  });

  it('khoá theo phiên wizard', () => {
    expect(wizardSessionLockKey('77')).toBe('ai-wizard-session:77');
  });
});
