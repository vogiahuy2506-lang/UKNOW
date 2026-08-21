import { describe, expect, it } from 'vitest';
import { buildInboxSseConnection } from '../useInboxSSE';

describe('buildInboxSseConnection', () => {
  it('does not add ownerContext for a self workspace', () => {
    const connection = buildInboxSseConnection('token-value', { type: 'self', ownerId: 42 });
    const url = new URL(connection.url, 'https://example.test');

    expect(connection.connectionKey).toBe('token-value:self');
    expect(url.searchParams.get('token')).toBe('token-value');
    expect(url.searchParams.has('ownerContext')).toBe(false);
  });

  it('adds the verified employee owner context and changes the connection key', () => {
    const first = buildInboxSseConnection('token-value', { type: 'employee', ownerId: 42 });
    const second = buildInboxSseConnection('token-value', { type: 'employee', ownerId: 99 });
    const url = new URL(first.url, 'https://example.test');

    expect(first.connectionKey).toBe('token-value:42');
    expect(second.connectionKey).toBe('token-value:99');
    expect(url.searchParams.get('ownerContext')).toBe('42');
  });
});
