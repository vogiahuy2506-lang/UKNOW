/**
 * Giá (credits) trên modal đăng chợ: ô NumberInput hiện dấu chấm hàng nghìn, payload priceCredits vẫn là SỐ;
 * xoá trắng -> 0 (miễn phí) như cũ; nút +/- giữ nguyên.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MarketplaceListingModal from '../MarketplaceListingModal';

const { createChatbotListing } = vi.hoisted(() => ({ createChatbotListing: vi.fn() }));

vi.mock('../../../services/marketplace.service', () => ({ default: { createChatbotListing } }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../../i18n', () => {
  const t = (key) => key;
  return { useI18n: () => ({ t }) };
});

const chatbot = { id: 9, name: 'Bot ban hang', description: 'mo ta', chunkCount: 0 };

const renderModal = async () => {
  const user = userEvent.setup();
  render(<MarketplaceListingModal open chatbot={chatbot} onClose={() => {}} onSuccess={() => {}} />);
  const price = (await screen.findAllByRole('textbox')).find((el) => el.inputMode === 'numeric');
  return { user, price };
};

describe('MarketplaceListingModal — ô giá', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createChatbotListing.mockResolvedValue({});
  });

  it('gõ 1500 -> hiện 1.500, payload priceCredits = 1500 (số)', async () => {
    const { user, price } = await renderModal();
    expect(price).toHaveValue('0');
    await user.type(price, '1500', { initialSelectionStart: 0, initialSelectionEnd: 1 });
    expect(price).toHaveValue('1.500');
    await user.click(screen.getByRole('button', { name: /Đăng ngay/ }));
    await waitFor(() => expect(createChatbotListing).toHaveBeenCalledTimes(1));
    expect(createChatbotListing.mock.calls[0][0].priceCredits).toBe(1500);
  });

  it('xoá trắng -> về 0 (miễn phí); nút + cộng 10 từ giá hiện tại', async () => {
    const { user, price } = await renderModal();
    await user.type(price, '2000', { initialSelectionStart: 0, initialSelectionEnd: 1 });
    await user.clear(price);
    expect(price).toHaveValue('0');
    await user.click(screen.getByRole('button', { name: '+' }));
    expect(price).toHaveValue('10');
    await user.click(screen.getByRole('button', { name: /Đăng ngay/ }));
    await waitFor(() => expect(createChatbotListing).toHaveBeenCalledTimes(1));
    expect(createChatbotListing.mock.calls[0][0].priceCredits).toBe(10);
  });
});
