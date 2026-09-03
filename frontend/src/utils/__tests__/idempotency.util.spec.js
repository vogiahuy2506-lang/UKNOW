import { describe, it, expect, vi } from 'vitest';
import {
  generateIdempotencyKey,
  canonicalSerializePayload,
  canonicalSerializePayloadSync,
  computePayloadSignature,
  readBinaryBlobBuffer,
  resolveActionIdempotencyKey,
  resolveActionIdempotencyKeySync,
} from '../idempotency.util';

describe('idempotency.util', () => {
  it('sinh UUID v4 hợp lệ khi có crypto.randomUUID', () => {
    const key = generateIdempotencyKey();
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('fallback sinh UUID v4 khi crypto.randomUUID không tồn tại', () => {
    const spy = vi.spyOn(crypto, 'randomUUID').mockImplementation(undefined);
    try {
      const key = generateIdempotencyKey();
      expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    } finally {
      spy.mockRestore();
    }
  });

  it('sinh các key độc lập nhau', () => {
    const key1 = generateIdempotencyKey();
    const key2 = generateIdempotencyKey();
    expect(key1).not.toBe(key2);
  });

  describe('canonicalSerializePayload and computePayloadSignature', () => {
    it('serializes primitives, arrays, and objects correctly without delimiter collision', async () => {
      expect(await canonicalSerializePayload(null)).toBe('null');
      expect(await canonicalSerializePayload('abc')).toBe('"abc"');
      expect(await canonicalSerializePayload([1, 2])).toBe('[1,2]');
      expect(await canonicalSerializePayload({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    });

    it('prevents delimiter injection collision between key and value (Golden Vector from Review)', async () => {
      const payload1 = { content: 'x,subject:y', subject: 'z', to: 'w' };
      const payload2 = { content: 'x', subject: 'y,subject:z', to: 'w' };

      const sig1 = await computePayloadSignature(payload1);
      const sig2 = await computePayloadSignature(payload2);

      expect(sig1).not.toBe(sig2);
      expect(sig1).toBe('{"content":"x,subject:y","subject":"z","to":"w"}');
      expect(sig2).toBe('{"content":"x","subject":"y,subject:z","to":"w"}');
    });

    it('strictly preserves data types (number vs string, boolean vs string)', async () => {
      const numPayload = { count: 1 };
      const strPayload = { count: '1' };
      expect(await computePayloadSignature(numPayload)).not.toBe(await computePayloadSignature(strPayload));

      const boolPayload = { enabled: true };
      const boolStrPayload = { enabled: 'true' };
      expect(await computePayloadSignature(boolPayload)).not.toBe(await computePayloadSignature(boolStrPayload));
    });

    it('hashes raw binary byte contents of TypedArray and ArrayBuffer (different bytes = different signature)', async () => {
      const u8A = new Uint8Array([1, 2]);
      const u8B = new Uint8Array([9, 8]);
      const sigU8A = await computePayloadSignature({ data: u8A });
      const sigU8B = await computePayloadSignature({ data: u8B });
      expect(sigU8A).not.toBe(sigU8B);

      const bufA = new Uint8Array([1, 2]).buffer;
      const bufB = new Uint8Array([9, 8]).buffer;
      const sigBufA = await computePayloadSignature({ buf: bufA });
      const sigBufB = await computePayloadSignature({ buf: bufB });
      expect(sigBufA).not.toBe(sigBufB);
    });

    it('hashes File and Blob byte contents even when metadata is identical', async () => {
      // Two files with identical name, size, type, and lastModified but different contents ("ab" vs "cd")
      const fileA = new File(['ab'], 'doc.txt', { type: 'text/plain', lastModified: 1000 });
      const fileB = new File(['cd'], 'doc.txt', { type: 'text/plain', lastModified: 1000 });

      const sigFileA = await computePayloadSignature({ file: fileA });
      const sigFileB = await computePayloadSignature({ file: fileB });
      expect(sigFileA).not.toBe(sigFileB);

      // Two blobs with identical size and type but different contents
      const blobA = new Blob(['ab'], { type: 'text/plain' });
      const blobB = new Blob(['cd'], { type: 'text/plain' });
      const sigBlobA = await computePayloadSignature({ blob: blobA });
      const sigBlobB = await computePayloadSignature({ blob: blobB });
      expect(sigBlobA).not.toBe(sigBlobB);
    });

    it('fails closed instead of hashing an unreadable binary value as empty bytes', async () => {
      await expect(readBinaryBlobBuffer({})).rejects.toThrow(
        'Unable to read binary data for idempotency signature'
      );
    });

    it('rejects File and Blob from sync signatures instead of falling back to metadata only', () => {
      const blob = new Blob(['binary payload'], { type: 'application/octet-stream' });
      expect(() => canonicalSerializePayloadSync({ blob })).toThrow(
        'Binary File/Blob payload requires async idempotency signature'
      );
      expect(() => resolveActionIdempotencyKeySync(null, { blob })).toThrow(
        'Binary File/Blob payload requires async idempotency signature'
      );
    });

    it('produces identical signature regardless of key insertion order', async () => {
      const payloadA = { to: 'user@example.com', subject: 'Hello', content: 'World' };
      const payloadB = { content: 'World', to: 'user@example.com', subject: 'Hello' };
      expect(await computePayloadSignature(payloadA)).toBe(await computePayloadSignature(payloadB));
    });

    it('changes signature when any field value changes', async () => {
      const base = { to: 'user@example.com', subject: 'Hello', content: 'World' };
      const modifiedTo = { ...base, to: 'other@example.com' };
      const modifiedSubject = { ...base, subject: 'Different' };
      const modifiedContent = { ...base, content: 'Updated' };

      const baseSig = await computePayloadSignature(base);
      expect(await computePayloadSignature(modifiedTo)).not.toBe(baseSig);
      expect(await computePayloadSignature(modifiedSubject)).not.toBe(baseSig);
      expect(await computePayloadSignature(modifiedContent)).not.toBe(baseSig);
    });

    it('handles arrays and nested objects deterministically', async () => {
      const payload1 = {
        channel: 'email',
        attachments: [{ filename: 'a.pdf', size: 100 }],
      };
      const payload2 = {
        attachments: [{ size: 100, filename: 'a.pdf' }],
        channel: 'email',
      };
      expect(await computePayloadSignature(payload1)).toBe(await computePayloadSignature(payload2));
    });
  });

  describe('resolveActionIdempotencyKey (Retention & Rotation)', () => {
    it('generates a fresh key on initial invocation', async () => {
      const payload = { to: 'test@example.com', subject: 'Title' };
      const res = await resolveActionIdempotencyKey(null, payload);

      expect(res.key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(res.signature).toBeTruthy();
      expect(res.isRotated).toBe(true);
    });

    it('retains the identical key when retried with identical payload (retry after failure)', async () => {
      const payload = { to: 'test@example.com', subject: 'Title', content: 'Body' };
      const first = await resolveActionIdempotencyKey(null, payload);

      // Retry 1: same payload
      const retry1 = await resolveActionIdempotencyKey(first, payload);
      expect(retry1.key).toBe(first.key);
      expect(retry1.signature).toBe(first.signature);
      expect(retry1.isRotated).toBe(false);

      // Retry 2: same payload with keys in different order
      const retry2 = await resolveActionIdempotencyKey(retry1, {
        content: 'Body',
        to: 'test@example.com',
        subject: 'Title',
      });
      expect(retry2.key).toBe(first.key);
      expect(retry2.isRotated).toBe(false);
    });

    it('rotates to a new key when user edits any field in payload', async () => {
      const initialPayload = { to: 'test@example.com', subject: 'Original', content: 'Body' };
      const first = await resolveActionIdempotencyKey(null, initialPayload);

      // User changes subject
      const editedSubject = { ...initialPayload, subject: 'Corrected Subject' };
      const rotated1 = await resolveActionIdempotencyKey(first, editedSubject);
      expect(rotated1.key).not.toBe(first.key);
      expect(rotated1.signature).not.toBe(first.signature);
      expect(rotated1.isRotated).toBe(true);

      // User changes recipient
      const editedRecipient = { ...editedSubject, to: 'new_recipient@example.com' };
      const rotated2 = await resolveActionIdempotencyKey(rotated1, editedRecipient);
      expect(rotated2.key).not.toBe(rotated1.key);
      expect(rotated2.isRotated).toBe(true);
    });

    it('rotates to a new key when attachment binary content changes with same metadata', async () => {
      const file1 = new File(['content_v1'], 'report.pdf', { type: 'application/pdf', lastModified: 5000 });
      const initialPayload = { to: 'test@example.com', attachments: [file1] };
      const first = await resolveActionIdempotencyKey(null, initialPayload);

      // Same metadata, modified bytes
      const file2 = new File(['content_v2'], 'report.pdf', { type: 'application/pdf', lastModified: 5000 });
      const modifiedPayload = { to: 'test@example.com', attachments: [file2] };
      const rotated = await resolveActionIdempotencyKey(first, modifiedPayload);

      expect(rotated.key).not.toBe(first.key);
      expect(rotated.isRotated).toBe(true);
    });
  });
});
