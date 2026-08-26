import { describe, it, expect } from 'vitest';
import {
  validateFilesBeforeUpload,
  getUploadValidationErrorMessage,
} from '../validateUpload';

describe('validateUpload', () => {
  const MB = 1024 * 1024;

  describe('validateFilesBeforeUpload', () => {
    it('returns ok: true when no files are selected', () => {
      expect(validateFilesBeforeUpload([], { remainingBytes: 10 * MB, enforcementEnabled: true })).toEqual({ ok: true });
      expect(validateFilesBeforeUpload(null, { remainingBytes: 10 * MB, enforcementEnabled: true })).toEqual({ ok: true });
    });

    it('blocks a file exceeding 100MB regardless of remaining quota or enforcement flag', () => {
      const file110MB = { name: 'big_video.mp4', size: 110 * MB };
      const usageFlagOff = { remainingBytes: 500 * MB, enforcementEnabled: false };
      const result = validateFilesBeforeUpload([file110MB], usageFlagOff);

      expect(result.ok).toBe(false);
      expect(result.reason).toBe('file_too_large');
      expect(result.detail.fileName).toBe('big_video.mp4');
      expect(result.detail.fileSize).toBe(110 * MB);
    });

    it('blocks when enforcementEnabled is true and total size exceeds remaining quota', () => {
      const files = [
        { name: 'doc1.pdf', size: 8 * MB },
        { name: 'doc2.pdf', size: 8 * MB },
      ];
      const usage = { remainingBytes: 10 * MB, enforcementEnabled: true };
      const result = validateFilesBeforeUpload(files, usage);

      expect(result.ok).toBe(false);
      expect(result.reason).toBe('quota_exceeded');
      expect(result.detail.totalBytes).toBe(16 * MB);
      expect(result.detail.remainingBytes).toBe(10 * MB);
    });

    it('allows upload when enforcementEnabled is false even if files exceed remaining quota', () => {
      const files = [
        { name: 'doc1.pdf', size: 20 * MB },
        { name: 'doc2.pdf', size: 20 * MB },
      ];
      // Remaining is 10MB, but enforcement is OFF
      const usage = { remainingBytes: 10 * MB, enforcementEnabled: false };
      const result = validateFilesBeforeUpload(files, usage);

      expect(result.ok).toBe(true);
    });

    it('allows upload when selected files are within remaining quota and <= 100MB each', () => {
      const files = [
        { name: 'photo1.jpg', size: 5 * MB },
        { name: 'photo2.jpg', size: 4 * MB },
      ];
      const usage = { remainingBytes: 100 * MB, enforcementEnabled: true };
      const result = validateFilesBeforeUpload(files, usage);

      expect(result.ok).toBe(true);
    });

    it('fails open when usage is null (network error), but still validates 50MB single-file limit', () => {
      const normalFile = { name: 'doc.pdf', size: 20 * MB };
      expect(validateFilesBeforeUpload([normalFile], null)).toEqual({ ok: true });

      const tooLargeFile = { name: 'huge.iso', size: 110 * MB };
      const result = validateFilesBeforeUpload([tooLargeFile], null);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('file_too_large');
    });
  });

  describe('getUploadValidationErrorMessage', () => {
    it('returns Vietnamese message for file_too_large', () => {
      const validation = {
        ok: false,
        reason: 'file_too_large',
        detail: { fileName: 'data.zip', fileSize: 110 * MB },
      };
      const msg = getUploadValidationErrorMessage(validation, null, 'vi');
      expect(msg).toContain('data.zip');
      expect(msg).toContain('100MB');
    });

    it('returns Vietnamese message for quota_exceeded', () => {
      const validation = {
        ok: false,
        reason: 'quota_exceeded',
        detail: { totalBytes: 30 * MB, remainingBytes: 10 * MB },
      };
      const msg = getUploadValidationErrorMessage(validation, null, 'vi');
      expect(msg).toContain('Workspace chỉ còn 10 MB');
      expect(msg).toContain('30 MB');
    });

    it('returns English message when locale is en', () => {
      const validation = {
        ok: false,
        reason: 'quota_exceeded',
        detail: { totalBytes: 30 * MB, remainingBytes: 10 * MB },
      };
      const msg = getUploadValidationErrorMessage(validation, null, 'en');
      expect(msg).toContain('Workspace only has 10 MB remaining');
      expect(msg).toContain('30 MB');
    });
  });
});
