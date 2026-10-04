/**
 * Rà soát C P3-6 — thẻ chọn tài khoản cho Telegram/WhatsApp (≥ 2 tài khoản dùng được). Backend gửi `allowOther: false`: nút "Khác" của thẻ Email/Zalo
 * dẫn tới QR Zalo, vô nghĩa với hai kênh này. Hình dạng `data` đúng như `buildAdapterSenderQuestion` (aiCampaignWizard.service.js) trả.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AskSenderAccountCard } from '../AiChatbotWizardCards';
import viDict from '../../../../i18n/vi';

vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const t = (key, params = {}) => {
  let current = viDict;
  for (const part of key.split('.')) current = current?.[part];
  const text = typeof current === 'string' ? current : key;
  return text.replace(/\{(\w+)\}/g, (_, name) => (params[name] !== undefined ? String(params[name]) : `{${name}}`));
};

const telegramData = {
  channel: 'telegram',
  allowOther: false,
  noUsableAccount: false,
  accounts: [
    { id: 1, name: 'shop_a', email: null, status: 'active', isDefault: false, isActive: true, usable: true },
    { id: 2, name: 'shop_b', email: null, status: 'active', isDefault: false, isActive: true, usable: true },
  ],
};

describe('AskSenderAccountCard — kênh Telegram/WhatsApp', () => {
  it('liệt kê các tài khoản và bấm một tài khoản → onSelect(account) với đúng id (số)', () => {
    const onSelect = vi.fn();
    render(<AskSenderAccountCard data={telegramData} onSelect={onSelect} onOther={vi.fn()} t={t} />);

    fireEvent.click(screen.getByRole('button', { name: /shop_b/ }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toMatchObject({ id: 2, name: 'shop_b' });
  });

  it('allowOther:false → KHÔNG có nút "Khác"/"Kết nối lại bằng QR" (không dẫn tới QR Zalo)', () => {
    render(<AskSenderAccountCard data={telegramData} onSelect={vi.fn()} onOther={vi.fn()} t={t} />);

    expect(screen.queryByRole('button', { name: 'Khác' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /QR/ })).not.toBeInTheDocument();
  });

  it('thẻ Email/Zalo (allowOther:true, như cũ) vẫn có nút "Khác"', () => {
    const onOther = vi.fn();
    render(
      <AskSenderAccountCard
        data={{ channel: 'email', allowOther: true, noUsableAccount: false, accounts: [{ id: 7, name: 'Shop', email: 's@example.vn', status: 'active', usable: true }] }}
        onSelect={vi.fn()}
        onOther={onOther}
        t={t}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Khác' }));
    expect(onOther).toHaveBeenCalled();
  });

  it('tài khoản WhatsApp: id là mã phiên chuỗi, được chuyển nguyên cho onSelect', () => {
    const onSelect = vi.fn();
    render(
      <AskSenderAccountCard
        data={{ channel: 'whatsapp', allowOther: false, noUsableAccount: false, accounts: [{ id: '7-shopwa', name: 'Shop WA', email: null, status: 'active', usable: true }] }}
        onSelect={onSelect}
        t={t}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Shop WA/ }));
    expect(onSelect.mock.calls[0][0].id).toBe('7-shopwa');
  });
});
