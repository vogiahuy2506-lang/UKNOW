import { describe, it, expect } from 'vitest';
import { normalizeLandingLpTrackApiBase } from '../normalizeLandingLpTrackApiBase';

describe('normalizeLandingLpTrackApiBase', () => {
  it('null/undefined/empty → ""', () => {
    expect(normalizeLandingLpTrackApiBase(null)).toBe('');
    expect(normalizeLandingLpTrackApiBase(undefined)).toBe('');
    expect(normalizeLandingLpTrackApiBase('')).toBe('');
    expect(normalizeLandingLpTrackApiBase('   ')).toBe('');
  });

  it('/api → /api (idempotent)', () => {
    expect(normalizeLandingLpTrackApiBase('/api')).toBe('/api');
  });

  it('/api/ → /api (strip trailing slash)', () => {
    expect(normalizeLandingLpTrackApiBase('/api/')).toBe('/api');
    expect(normalizeLandingLpTrackApiBase('/api//')).toBe('/api');
  });

  it('/api/api → /api (gộp duplicate)', () => {
    expect(normalizeLandingLpTrackApiBase('/api/api')).toBe('/api');
  });

  it('/api/api/api → /api (gộp nhiều lần)', () => {
    expect(normalizeLandingLpTrackApiBase('/api/api/api')).toBe('/api');
    expect(normalizeLandingLpTrackApiBase('/api/api/api/api')).toBe('/api');
  });

  it('URL tuyệt đối: https://example.com/api/api → https://example.com/api', () => {
    expect(normalizeLandingLpTrackApiBase('https://example.com/api/api')).toBe('https://example.com/api');
    expect(normalizeLandingLpTrackApiBase('https://example.com/api/api/')).toBe('https://example.com/api');
  });

  it('case-insensitive khi detect /api/api (output luôn lowercase phần "/api" thay thế)', () => {
    // Implementation: replace(/\/api\/api$/i, '/api') → match insensitive
    // nhưng replacement luôn là chuỗi lowercase "/api".
    expect(normalizeLandingLpTrackApiBase('/API/API')).toBe('/api');
    expect(normalizeLandingLpTrackApiBase('https://x.com/Api/API')).toBe('https://x.com/api');
  });

  it('whitespace ngoài cùng → trim', () => {
    expect(normalizeLandingLpTrackApiBase('  /api/  ')).toBe('/api');
  });
});
