import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/api', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
    get: vi.fn().mockResolvedValue({ data: { data: {} } }),
  },
  setAuthStore: vi.fn(),
}));

const { useAuthStore } = await import('../authStore');
const { buildDraftKey, writeDraft, readDraft } = await import(
  '../../features/landing-canvas/utils/landingCanvasDraft.js'
);

describe('authStore.logout — xoá nháp landing (PLAN_LANDING_GIU_NHAP_KHI_F5)', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: { id: 1 }, isAuthenticated: true, activeContext: { type: 'self' } });
  });

  it('đăng xuất xoá mọi nháp landing, giữ khoá khác', async () => {
    const key = buildDraftKey({ userId: 1, ownerId: 1 }, null);
    writeDraft(key, { form: { title: 'x' }, messages: [] });
    localStorage.setItem('founder_ai_landing_canvas_chat_width', '460');
    expect(readDraft(key)).not.toBeNull();

    await useAuthStore.getState().logout({ skipServer: true });

    expect(readDraft(key)).toBeNull();
    expect(localStorage.getItem('founder_ai_landing_canvas_chat_width')).toBe('460');
  });
});
