import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmCreateCard } from '../AiChatbotCards';
import viDict from '../../../../i18n/vi';
import enDict from '../../../../i18n/en';

/** Helper translate dùng trực tiếp dictionary để kiểm tra bản dịch thật */
const makeI18n = (dict) => (key) => {
  const parts = key.split('.');
  let current = dict;
  for (const part of parts) {
    current = current?.[part];
  }
  return current !== undefined ? current : key;
};

const createMockConfirmationView = ({
  mode = 'manual',
  channel = 'email',
  recipientType = 'phone',
  stepCount = 1,
  timing = { anchor: 'start', value: 0 },
} = {}) => {
  const steps = [];
  for (let i = 0; i < stepCount; i++) {
    steps.push({
      key: `node-${i + 1}:0`,
      nodeId: `node-${i + 1}`,
      stepIndex: 0,
      channel,
      title: channel === 'email' ? 'Gửi Email' : 'Gửi Zalo',
      timing,
      sender: { id: 1, label: channel === 'email' ? 'sender@uknow.vn' : 'Tài khoản Zalo' },
      recipients: mode ? { mode, type: recipientType, count: 1, sourceLabel: mode === 'manual' ? null : 'Lead từ Landing Page' } : undefined,
      content: {
        subject: 'Tiêu đề thư',
        bodyText: 'Nội dung thư',
        attachments: [],
      },
    });
  }

  return {
    campaign: { name: 'Chiến dịch gửi 1 lần', description: 'Mô tả' },
    readyToCreate: true,
    totals: { sendSteps: stepCount },
    blockingIssues: [],
    steps,
  };
};

describe('ConfirmCreateCard - Quick Send Gate & Rendering', () => {
  it('recipients.mode === "source" (DB / Google Sheet / Landing) -> KHÔNG hiện nút Gửi nhanh', () => {
    const confirmationView = createMockConfirmationView({ mode: 'source' });
    const onQuickSend = vi.fn();

    render(
      <ConfirmCreateCard
        confirmationView={confirmationView}
        onConfirm={vi.fn()}
        onQuickSend={onQuickSend}
        onEdit={vi.fn()}
        onCancel={vi.fn()}
        t={makeI18n(viDict)}
        locale="vi"
      />
    );

    // Nút Gửi nhanh không được hiển thị
    const quickSendBtn = screen.queryByRole('button', { name: /gửi nhanh/i });
    expect(quickSendBtn).toBeNull();
  });

  it('recipients không có mode (dữ liệu thiếu) -> KHÔNG hiện nút Gửi nhanh (fail-closed)', () => {
    const confirmationView = createMockConfirmationView({ mode: null });
    const onQuickSend = vi.fn();

    render(
      <ConfirmCreateCard
        confirmationView={confirmationView}
        onConfirm={vi.fn()}
        onQuickSend={onQuickSend}
        onEdit={vi.fn()}
        onCancel={vi.fn()}
        t={makeI18n(viDict)}
        locale="vi"
      />
    );

    // Nút Gửi nhanh không được hiển thị
    const quickSendBtn = screen.queryByRole('button', { name: /gửi nhanh/i });
    expect(quickSendBtn).toBeNull();
  });

  it('recipients.mode === "manual" -> Hiện nút Gửi nhanh và text không chứa dấu . của raw key', () => {
    const confirmationView = createMockConfirmationView({ mode: 'manual' });
    const onQuickSend = vi.fn();

    const { rerender } = render(
      <ConfirmCreateCard
        confirmationView={confirmationView}
        onConfirm={vi.fn()}
        onQuickSend={onQuickSend}
        onEdit={vi.fn()}
        onCancel={vi.fn()}
        t={makeI18n(viDict)}
        locale="vi"
      />
    );

    // Bản dịch tiếng Việt
    const viBtn = screen.getByRole('button', { name: /gửi nhanh/i });
    expect(viBtn).toBeInTheDocument();
    expect(viBtn.textContent).toBe('Gửi nhanh (1 lần)');
    expect(viBtn.textContent).not.toContain('.');

    // Click kích hoạt onQuickSend
    fireEvent.click(viBtn);
    expect(onQuickSend).toHaveBeenCalledTimes(1);

    // Bản dịch tiếng Anh
    rerender(
      <ConfirmCreateCard
        confirmationView={confirmationView}
        onConfirm={vi.fn()}
        onQuickSend={onQuickSend}
        onEdit={vi.fn()}
        onCancel={vi.fn()}
        t={makeI18n(enDict)}
        locale="en"
      />
    );

    const enBtn = screen.getByRole('button', { name: /quick send/i });
    expect(enBtn).toBeInTheDocument();
    expect(enBtn.textContent).toBe('Quick Send (1-time)');
    expect(enBtn.textContent).not.toContain('.');
  });

  it('channel === "zalo_personal" + recipients.mode === "manual" + type === "phone" -> Hiện nút Gửi nhanh', () => {
    const confirmationView = createMockConfirmationView({ channel: 'zalo_personal', mode: 'manual', recipientType: 'phone' });
    const onQuickSend = vi.fn();

    render(
      <ConfirmCreateCard
        confirmationView={confirmationView}
        onConfirm={vi.fn()}
        onQuickSend={onQuickSend}
        onEdit={vi.fn()}
        onCancel={vi.fn()}
        t={makeI18n(viDict)}
        locale="vi"
      />
    );

    const viBtn = screen.getByRole('button', { name: /gửi nhanh/i });
    expect(viBtn).toBeInTheDocument();
    fireEvent.click(viBtn);
    expect(onQuickSend).toHaveBeenCalledTimes(1);
  });

  it('channel === "zalo_personal" + recipients.mode === "manual" + type === "uid" -> KHÔNG hiện nút Gửi nhanh (fail-closed cho UID)', () => {
    const confirmationView = createMockConfirmationView({ channel: 'zalo_personal', mode: 'manual', recipientType: 'uid' });
    const onQuickSend = vi.fn();

    render(
      <ConfirmCreateCard
        confirmationView={confirmationView}
        onConfirm={vi.fn()}
        onQuickSend={onQuickSend}
        onEdit={vi.fn()}
        onCancel={vi.fn()}
        t={makeI18n(viDict)}
        locale="vi"
      />
    );

    const quickSendBtn = screen.queryByRole('button', { name: /gửi nhanh/i });
    expect(quickSendBtn).toBeNull();
  });

  it('channel === "zalo_personal" + recipients.mode === "source" -> KHÔNG hiện nút Gửi nhanh (fail-closed)', () => {
    const confirmationView = createMockConfirmationView({ channel: 'zalo_personal', mode: 'source' });
    const onQuickSend = vi.fn();

    render(
      <ConfirmCreateCard
        confirmationView={confirmationView}
        onConfirm={vi.fn()}
        onQuickSend={onQuickSend}
        onEdit={vi.fn()}
        onCancel={vi.fn()}
        t={makeI18n(viDict)}
        locale="vi"
      />
    );

    const quickSendBtn = screen.queryByRole('button', { name: /gửi nhanh/i });
    expect(quickSendBtn).toBeNull();
  });
});
