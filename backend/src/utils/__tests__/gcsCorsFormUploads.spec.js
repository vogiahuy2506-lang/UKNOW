/**
 * PR-4b — tệp cấu hình CORS bucket cho PUT thẳng từ trình duyệt (việc OPS, chạy tay): phải khớp hợp đồng URL ký của
 * GcsStorageBackend.createUploadTarget (hai header Content-Type + x-goog-content-length-range) và chỉ mở đúng origin production.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';

const here = path.dirname(fileURLToPath(import.meta.url));
const cors = JSON.parse(readFileSync(path.resolve(here, '../../../scripts/gcs-cors-form-uploads.json'), 'utf8'));

describe('scripts/gcs-cors-form-uploads.json', () => {
  it('đúng một quy tắc: PUT từ founderai.biz và www.founderai.biz, không wildcard', () => {
    expect(cors).toHaveLength(1);
    expect(cors[0].origin.sort()).toEqual(['https://founderai.biz', 'https://www.founderai.biz']);
    expect(cors[0].method).toEqual(['PUT']);
    expect(JSON.stringify(cors)).not.toContain('*');
  });

  it('cho phép đúng hai header mà URL ký ràng buộc', () => {
    expect(cors[0].responseHeader.map((h) => h.toLowerCase()).sort()).toEqual(['content-type', 'x-goog-content-length-range']);
    expect(cors[0].maxAgeSeconds).toBeGreaterThan(0);
  });
});
