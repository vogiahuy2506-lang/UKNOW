import { describe, it, expect } from 'vitest';
import {
  nextSseBackoffMs,
  SSE_BASE_DELAY_MS,
  SSE_MAX_DELAY_MS,
} from '../sseBackoff.util';

describe('nextSseBackoffMs', () => {
  it('scales 3s → 6s → 12s … with ±20% jitter and caps at 60s', () => {
    const d1 = nextSseBackoffMs(1);
    expect(d1).toBeGreaterThanOrEqual(SSE_BASE_DELAY_MS * 0.8);
    expect(d1).toBeLessThanOrEqual(SSE_BASE_DELAY_MS * 1.2);

    const d2 = nextSseBackoffMs(2);
    expect(d2).toBeGreaterThanOrEqual(SSE_BASE_DELAY_MS * 2 * 0.8);
    expect(d2).toBeLessThanOrEqual(SSE_BASE_DELAY_MS * 2 * 1.2);

    const d3 = nextSseBackoffMs(3);
    expect(d3).toBeGreaterThanOrEqual(SSE_BASE_DELAY_MS * 4 * 0.8);
    expect(d3).toBeLessThanOrEqual(SSE_BASE_DELAY_MS * 4 * 1.2);

    const dHigh = nextSseBackoffMs(20);
    expect(dHigh).toBeLessThanOrEqual(SSE_MAX_DELAY_MS * 1.2);
    expect(dHigh).toBeGreaterThanOrEqual(SSE_MAX_DELAY_MS * 0.8);
  });
});
