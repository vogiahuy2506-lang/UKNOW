import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TestEmailModal } from '../EmailSettings';

describe('TestEmailModal Component Boundary (Idempotency Key Retention & Rotation)', () => {
  const mockT = (key) => key;

  it('retains the same idempotency key when retrying after an async failure without modifying payload', async () => {
    // 1. Simulate async network/SMTP failure on first attempt
    const handleSend = vi.fn().mockRejectedValueOnce(new Error('SMTP timeout'));

    render(
      <TestEmailModal
        isOpen={true}
        onClose={vi.fn()}
        onSend={handleSend}
        isSending={false}
        t={mockT}
      />
    );

    const emailInput = screen.getByPlaceholderText('emailSettings.testEmailPlaceholder');
    fireEvent.change(emailInput, { target: { value: 'target@example.com' } });

    const submitBtn = screen.getByRole('button', { name: /emailSettings\.sendTestEmail/i });
    fireEvent.click(submitBtn);

    // Wait for async execution of handleSubmit and first call
    await waitFor(() => expect(handleSend).toHaveBeenCalledTimes(1));

    const [payload1, options1] = handleSend.mock.calls[0];
    expect(payload1.to).toBe('target@example.com');
    expect(options1.idempotencyKey).toBeTruthy();
    const key1 = options1.idempotencyKey;

    // 2. Simulated retry: user clicks submit again without modifying any fields
    handleSend.mockResolvedValueOnce({ success: true });
    fireEvent.click(submitBtn);

    await waitFor(() => expect(handleSend).toHaveBeenCalledTimes(2));

    const [payload2, options2] = handleSend.mock.calls[1];
    expect(payload2.to).toBe('target@example.com');
    // Must RETAIN the identical idempotency key across retry
    expect(options2.idempotencyKey).toBe(key1);
  });

  it('submits only once when the user double-clicks before async key preparation completes', async () => {
    const handleSend = vi.fn().mockResolvedValue({ success: true });
    render(
      <TestEmailModal
        isOpen={true}
        onClose={vi.fn()}
        onSend={handleSend}
        isSending={false}
        t={mockT}
      />
    );

    const emailInput = screen.getByPlaceholderText('emailSettings.testEmailPlaceholder');
    fireEvent.change(emailInput, { target: { value: 'double-click@example.com' } });
    const submitBtn = screen.getByRole('button', { name: /emailSettings\.sendTestEmail/i });

    fireEvent.click(submitBtn);
    fireEvent.click(submitBtn);

    await waitFor(() => expect(handleSend).toHaveBeenCalledTimes(1));
  });

  it('rotates to a fresh idempotency key when user edits recipient, subject, or content', async () => {
    const handleSend = vi.fn().mockResolvedValue({ success: true });

    render(
      <TestEmailModal
        isOpen={true}
        onClose={vi.fn()}
        onSend={handleSend}
        isSending={false}
        t={mockT}
      />
    );

    const emailInput = screen.getByPlaceholderText('emailSettings.testEmailPlaceholder');
    const inputs = screen.getAllByRole('textbox');
    // inputs[0]: email, inputs[1]: subject, inputs[2]: content (textarea)
    const subjectInput = inputs[1];
    const contentInput = inputs[2];

    fireEvent.change(emailInput, { target: { value: 'initial@example.com' } });
    const submitBtn = screen.getByRole('button', { name: /emailSettings\.sendTestEmail/i });
    fireEvent.click(submitBtn);

    await waitFor(() => expect(handleSend).toHaveBeenCalledTimes(1));
    const key1 = handleSend.mock.calls[0][1].idempotencyKey;

    // Step 1: User edits recipient -> MUST rotate to key2
    fireEvent.change(emailInput, { target: { value: 'changed@example.com' } });
    fireEvent.click(submitBtn);

    await waitFor(() => expect(handleSend).toHaveBeenCalledTimes(2));
    const key2 = handleSend.mock.calls[1][1].idempotencyKey;
    expect(key2).not.toBe(key1);
    expect(handleSend.mock.calls[1][0].to).toBe('changed@example.com');

    // Step 2: User edits subject -> MUST rotate to key3
    fireEvent.change(subjectInput, { target: { value: 'Updated Subject Title' } });
    fireEvent.click(submitBtn);

    await waitFor(() => expect(handleSend).toHaveBeenCalledTimes(3));
    const key3 = handleSend.mock.calls[2][1].idempotencyKey;
    expect(key3).not.toBe(key2);
    expect(handleSend.mock.calls[2][0].subject).toBe('Updated Subject Title');

    // Step 3: User edits content body -> MUST rotate to key4
    fireEvent.change(contentInput, { target: { value: 'Updated Body Text' } });
    fireEvent.click(submitBtn);

    await waitFor(() => expect(handleSend).toHaveBeenCalledTimes(4));
    const key4 = handleSend.mock.calls[3][1].idempotencyKey;
    expect(key4).not.toBe(key3);
    expect(handleSend.mock.calls[3][0].content).toBe('Updated Body Text');
  });

  it('closes modal upon success and resets idempotency state for subsequent actions', async () => {
    const handleSend = vi.fn().mockResolvedValue({ success: true });

    // Component harness mimicking EmailSettings parent controlling modal state
    const TestHarness = () => {
      const [isOpen, setIsOpen] = useState(true);
      const onSend = async (payload, options) => {
        await handleSend(payload, options);
        setIsOpen(false); // Close on success like production handleSendTestEmail
      };
      return (
        <div>
          <button data-testid="open-modal" onClick={() => setIsOpen(true)}>
            Open
          </button>
          <TestEmailModal
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
            onSend={onSend}
            isSending={false}
            t={mockT}
          />
        </div>
      );
    };

    render(<TestHarness />);

    // 1. Initial send in opened modal
    const emailInput = screen.getByPlaceholderText('emailSettings.testEmailPlaceholder');
    fireEvent.change(emailInput, { target: { value: 'first_action@example.com' } });

    const submitBtn = screen.getByRole('button', { name: /emailSettings\.sendTestEmail/i });
    fireEvent.click(submitBtn);

    await waitFor(() => expect(handleSend).toHaveBeenCalledTimes(1));
    const key1 = handleSend.mock.calls[0][1].idempotencyKey;
    expect(key1).toBeTruthy();

    // Modal should now be closed / removed from DOM
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('emailSettings.testEmailPlaceholder')).toBeNull();
    });

    // 2. Reopen modal for a new action session
    fireEvent.click(screen.getByTestId('open-modal'));
    const reloadedEmailInput = await screen.findByPlaceholderText('emailSettings.testEmailPlaceholder');

    // Enter new recipient and submit
    fireEvent.change(reloadedEmailInput, { target: { value: 'second_action@example.com' } });
    const reloadedSubmitBtn = screen.getByRole('button', { name: /emailSettings\.sendTestEmail/i });
    fireEvent.click(reloadedSubmitBtn);

    await waitFor(() => expect(handleSend).toHaveBeenCalledTimes(2));
    const key2 = handleSend.mock.calls[1][1].idempotencyKey;

    // Must be a fresh new action key
    expect(key2).not.toBe(key1);
  });
});
