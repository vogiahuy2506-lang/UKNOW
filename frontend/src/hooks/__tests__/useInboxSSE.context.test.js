import { describe, expect, it } from 'vitest';
import { buildInboxSseConnectionKey, buildInboxSseUrl } from '../useInboxSSE';

describe('buildInboxSseConnectionKey', () => {
  it('self workspace: khoá theo token, không có chủ nhân viên', () => {
    expect(buildInboxSseConnectionKey('token-value', { type: 'self', ownerId: 42 })).toBe('token-value:self');
  });

  it('nhân viên: đổi chủ không gian làm việc thì khoá đổi (phải nối lại luồng)', () => {
    const first = buildInboxSseConnectionKey('token-value', { type: 'employee', ownerId: 42 });
    const second = buildInboxSseConnectionKey('token-value', { type: 'employee', ownerId: 99 });

    expect(first).toBe('token-value:42');
    expect(second).toBe('token-value:99');
  });
});

describe('buildInboxSseUrl (H-04)', () => {
  it('URL chỉ mang vé, không mang JWT và không mang ownerContext', () => {
    const url = new URL(buildInboxSseUrl('ticket-abc_123'), 'https://example.test');

    expect(url.pathname).toBe('/api/ai/chatbot/inbox/stream');
    expect(url.searchParams.get('ticket')).toBe('ticket-abc_123');
    expect(url.searchParams.has('token')).toBe(false);
    expect(url.searchParams.has('ownerContext')).toBe(false);
  });
});
