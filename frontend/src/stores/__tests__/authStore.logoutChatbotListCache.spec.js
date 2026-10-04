import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/api', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
    get: vi.fn().mockResolvedValue({ data: { data: {} } }),
  },
  setAuthStore: vi.fn(),
}));

const { useAuthStore } = await import('../authStore');
const {
  chatbotListCacheKey,
  saveCachedChatbots,
  loadCachedChatbots,
  clearChatbotListCache,
} = await import('../../features/chatbot/chatbotListCache.js');

/**
 * S-14 (04/10/2026): bộ nhớ đệm danh sách chatbot của Studio có hướng dẫn nội bộ của bot (system_instruction) và
 * không bao giờ bị xoá khi đăng xuất → máy dùng chung: người sau đọc được. Nay đăng xuất xoá mọi khoá đệm.
 */
describe('authStore.logout — xoá bộ nhớ đệm danh sách chatbot Studio', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: { id: 1 }, isAuthenticated: true, activeContext: { type: 'self' } });
  });

  it('đăng xuất xoá mọi khoá uknow_chatbots* (mọi user/không gian + khoá cũ chung), giữ khoá khác', async () => {
    localStorage.setItem('uknow_chatbots', JSON.stringify([{ id: 1, name: 'khoá cũ' }]));
    saveCachedChatbots(chatbotListCacheKey({ userId: 1, ownerId: 1 }), [{ id: 2, name: 'của user 1' }]);
    saveCachedChatbots(chatbotListCacheKey({ userId: 1, ownerId: 9 }), [{ id: 3, name: 'không gian công ty' }]);
    localStorage.setItem('founder_ai_landing_canvas_chat_width', '460');

    await useAuthStore.getState().logout({ skipServer: true });

    // storage giả trong test/setup.js không liệt kê được bằng Object.keys → duyệt qua length/key().
    const remaining = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key.startsWith('uknow_chatbots')) remaining.push(key);
    }
    expect(remaining).toEqual([]);
    expect(localStorage.getItem('founder_ai_landing_canvas_chat_width')).toBe('460');
  });
});

describe('chatbotListCache', () => {
  beforeEach(() => localStorage.clear());

  it('khoá gắn user + chủ không gian; thiếu user → không đệm', () => {
    expect(chatbotListCacheKey({ userId: 5, ownerId: 42 })).toBe('uknow_chatbots:u5:o42');
    expect(chatbotListCacheKey({ userId: 5 })).toBe('uknow_chatbots:u5:o5');
    expect(chatbotListCacheKey({})).toBeNull();
    saveCachedChatbots(null, [{ id: 1 }]);
    expect(localStorage.length).toBe(0);
    expect(loadCachedChatbots(null)).toEqual([]);
  });

  it('không ghi system_instruction và cờ _offlineCache; đọc lại gắn _offlineCache', () => {
    const key = chatbotListCacheKey({ userId: 5 });
    saveCachedChatbots(key, [{ id: 1, name: 'A', system_instruction: 'BÍ MẬT', _offlineCache: true }]);

    const raw = localStorage.getItem(key);
    expect(raw).not.toContain('BÍ MẬT');
    expect(raw).not.toContain('system_instruction');
    expect(raw).not.toContain('_offlineCache');
    expect(loadCachedChatbots(key)).toEqual([{ id: 1, name: 'A', _offlineCache: true }]);
  });

  it('JSON hỏng → mảng rỗng, không ném lỗi', () => {
    const key = chatbotListCacheKey({ userId: 5 });
    localStorage.setItem(key, '{hỏng');
    expect(loadCachedChatbots(key)).toEqual([]);
  });

  it('clearChatbotListCache chỉ xoá khoá có tiền tố uknow_chatbots', () => {
    localStorage.setItem('uknow_chatbots', '[]');
    localStorage.setItem('uknow_chatbots:u1:o1', '[]');
    localStorage.setItem('other_key', 'x');
    clearChatbotListCache();
    expect(localStorage.getItem('uknow_chatbots')).toBeNull();
    expect(localStorage.getItem('uknow_chatbots:u1:o1')).toBeNull();
    expect(localStorage.getItem('other_key')).toBe('x');
  });
});
