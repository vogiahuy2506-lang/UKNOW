import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ZaloSettings from '../ZaloSettings';

vi.mock('../../../stores/authStore', () => ({
  useAuthStore: () => ({
    user: { id: 1, name: 'Admin', role: 'owner' },
  }),
}));

vi.mock('../../../i18n', () => ({
  useI18n: () => ({
    t: (key) => key,
  }),
}));

vi.mock('../../../features/settings/services/zaloSettingsApi.service', () => ({
  default: {
    listAccounts: vi.fn().mockResolvedValue({
      data: {
        data: {
          items: [
            {
              id: 1,
              displayName: 'Acc Disconnected',
              status: 'disconnected',
              isActive: true,
              zaloPhone: '0901111111',
            },
            {
              id: 2,
              displayName: 'Acc Needs Reauth',
              status: 'needs_reauth',
              isActive: true,
              zaloPhone: '0902222222',
            },
          ],
        },
      },
    }),
    retryRestore: vi.fn().mockResolvedValue({}),
    restoreSession: vi.fn().mockResolvedValue({}),
    deleteAccount: vi.fn().mockResolvedValue({}),
    toggleActive: vi.fn().mockResolvedValue({}),
  },
}));

describe('PR-3: ZaloSettings Retry Button Visibility Spec', () => {
  it('renders retry button for both disconnected and needs_reauth accounts', async () => {
    render(<ZaloSettings />);

    // Wait for accounts to render
    const retryButtons = await screen.findAllByText('zaloSettings.retryRestore');
    expect(retryButtons.length).toBe(2);
  });
});
