/**
 * TiktokChannelCard.spec.jsx
 *
 * Test component con (card). Pattern copy từ các spec khác trong
 * features/inbox/__tests__/.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../../../i18n';

const importComponent = () =>
  import('../TiktokChannelCard.jsx').then((m) => m.default);

const renderCard = async (props) => {
  const TiktokChannelCard = await importComponent();
  return render(
    <I18nProvider>
      <TiktokChannelCard {...props} />
    </I18nProvider>
  );
};

const baseAccount = {
  id: 1,
  business_id: 'biz_abc',
  display_name: 'My TikTok Shop',
  region: 'APAC',
  role: 'business_account',
  is_active: true,
  unread: 0,
  aiStatus: 'ai',
};

describe('TiktokChannelCard', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('Hiển thị display_name và business_id', async () => {
    await renderCard({ account: baseAccount });
    expect(screen.getByText('My TikTok Shop')).toBeInTheDocument();
    expect(screen.getByText('biz_abc')).toBeInTheDocument();
  });

  it('Hiển thị region', async () => {
    await renderCard({ account: baseAccount });
    expect(screen.getByText('APAC')).toBeInTheDocument();
  });

  it('Initials từ display_name (chữ đầu + chữ cuối)', async () => {
    await renderCard({ account: baseAccount });
    // "My TikTok Shop" → "MS" (M + S, tức parts[0][0] + parts[last][0])
    expect(within(screen.getByTestId('tiktok-avatar')).getByText('MS')).toBeInTheDocument();
  });

  it('Initials xử lý @username (bỏ @)', async () => {
    await renderCard({ account: { ...baseAccount, display_name: '@shopname' } });
    // "@shopname" → "SH" (1 từ → lấy 2 ký tự đầu)
    expect(within(screen.getByTestId('tiktok-avatar')).getByText('SH')).toBeInTheDocument();
  });

  it('Khi không có display_name → fallback business_id initials', async () => {
    const { display_name, ...rest } = baseAccount;
    await renderCard({ account: rest });
    // "biz_abc" → "BI" (2 ký tự đầu của 1 từ)
    expect(within(screen.getByTestId('tiktok-avatar')).getByText('BI')).toBeInTheDocument();
    // business_id hiển thị ở description; text có thể bị wrap nên dùng queryAllByText
    const matches = screen.queryAllByText((content) => content.includes('biz_abc'));
    expect(matches.length).toBeGreaterThan(0);
  });

  it('Unread badge hiển thị khi unread > 0', async () => {
    await renderCard({ account: { ...baseAccount, unread: 5 } });
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('Unread 99+ hiển thị "99+"', async () => {
    await renderCard({ account: { ...baseAccount, unread: 150 } });
    expect(screen.getByText('99+')).toBeInTheDocument();
  });

  it('Click gọi onSelect với account', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    await renderCard({ account: baseAccount, onSelect });
    const card = screen.getByTestId('tiktok-channel-card-1');
    await user.click(card);
    expect(onSelect).toHaveBeenCalledWith(baseAccount);
  });

  it('Selected → border pink + bg pink', async () => {
    await renderCard({ account: baseAccount, selected: true });
    const card = screen.getByTestId('tiktok-channel-card-1');
    expect(card.className).toMatch(/border-pink-300/);
  });

  it('is_active=false + không có aiStatus → avatar gray gradient', async () => {
    const { aiStatus, ...rest } = baseAccount;
    const account = { ...rest, is_active: false };
    await renderCard({ account });
    // Avatar gradient đổi sang gray
    expect(screen.getByTestId('tiktok-avatar').className).toMatch(/gray-300/);
    // Status dot cũng hiển thị 'off' (gray)
    const dotWrapper = screen.getByTestId('tiktok-status-dot');
    const dot = dotWrapper.querySelector('span');
    expect(dot.className).toMatch(/bg-gray-400/);
  });

  it('aiStatus="rate_limited" → dot màu cam', async () => {
    await renderCard({ account: { ...baseAccount, aiStatus: 'rate_limited' } });
    const dotWrapper = screen.getByTestId('tiktok-status-dot');
    const dot = dotWrapper.querySelector('span');
    expect(dot.className).toMatch(/bg-orange-500/);
  });

  it('aiStatus="paused" → dot màu vàng', async () => {
    await renderCard({ account: { ...baseAccount, aiStatus: 'paused' } });
    const dotWrapper = screen.getByTestId('tiktok-status-dot');
    const dot = dotWrapper.querySelector('span');
    expect(dot.className).toMatch(/bg-amber-500/);
  });
});
