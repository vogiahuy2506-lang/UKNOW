import { describe, it, expect } from 'vitest';
import {
  formatBytes,
  getStorageAlertLevel,
  MAX_UPLOAD_FILE_BYTES,
  CRITICAL_REMAINING_BYTES,
  WARNING_PERCENT,
  DANGER_PERCENT,
} from '../storageUtils';

describe('storageUtils', () => {
  describe('formatBytes', () => {
    it('handles 0 and negative/invalid inputs gracefully', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(-100)).toBe('0 B');
      expect(formatBytes(null)).toBe('0 B');
      expect(formatBytes(undefined)).toBe('0 B');
      expect(formatBytes('abc')).toBe('0 B');
    });

    it('formats bytes correctly', () => {
      expect(formatBytes(500)).toBe('500 B');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(50 * 1024 * 1024)).toBe('50 MB');
      expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3 GB');
      expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
    });
  });

  describe('getStorageAlertLevel', () => {
    it('returns "none" when usage is null or undefined', () => {
      expect(getStorageAlertLevel(null)).toBe('none');
      expect(getStorageAlertLevel(undefined)).toBe('none');
    });

    it('returns "critical" when overLimit is true', () => {
      expect(getStorageAlertLevel({
        overLimit: true,
        remainingBytes: 0,
        percent: 105,
      })).toBe('critical');
    });

    it('returns "critical" when Trial 100MB has used 95MB (remaining 5MB < min(50MB, 10MB))', () => {
      expect(getStorageAlertLevel({
        overLimit: false,
        usedBytes: 95 * 1024 * 1024,
        limitBytes: 100 * 1024 * 1024,
        remainingBytes: 5 * 1024 * 1024,
        percent: 95,
      })).toBe('critical');
    });

    it('returns "warning" (not critical) when Trial 100MB has used 85MB (remaining 15MB >= 10MB)', () => {
      expect(getStorageAlertLevel({
        overLimit: false,
        usedBytes: 85 * 1024 * 1024,
        limitBytes: 100 * 1024 * 1024,
        remainingBytes: 15 * 1024 * 1024,
        percent: 85,
      })).toBe('warning');
    });

    it('returns "critical" when Enterprise 3GB has remaining 40MB (< 50MB)', () => {
      expect(getStorageAlertLevel({
        overLimit: false,
        usedBytes: 2.96 * 1024 * 1024 * 1024,
        limitBytes: 3 * 1024 * 1024 * 1024,
        remainingBytes: 40 * 1024 * 1024,
        percent: 98,
      })).toBe('critical');
    });

    it('returns "warning" when Enterprise 3GB is 82% full but remaining is 540MB (>= 50MB)', () => {
      expect(getStorageAlertLevel({
        overLimit: false,
        usedBytes: 2.46 * 1024 * 1024 * 1024,
        limitBytes: 3 * 1024 * 1024 * 1024,
        remainingBytes: 540 * 1024 * 1024,
        percent: 82,
      })).toBe('warning');
    });

    it('returns "normal" when Trial 100MB has used 50MB (50% < 80% and remaining 50MB >= 10MB)', () => {
      expect(getStorageAlertLevel({
        overLimit: false,
        usedBytes: 50 * 1024 * 1024,
        limitBytes: 100 * 1024 * 1024,
        remainingBytes: 50 * 1024 * 1024,
        percent: 50,
      })).toBe('normal');
    });

    it('constants match requirements', () => {
      expect(MAX_UPLOAD_FILE_BYTES).toBe(50 * 1024 * 1024);
      expect(CRITICAL_REMAINING_BYTES).toBe(50 * 1024 * 1024);
      expect(WARNING_PERCENT).toBe(80);
      expect(DANGER_PERCENT).toBe(95);
    });
  });
});
