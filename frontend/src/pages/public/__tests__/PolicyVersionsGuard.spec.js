import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { POLICY_VERSIONS } from '../policyVersions.js';
import { ARCHIVED_POLICY_LOADERS } from '../policyArchive/index.js';
import { POLICY_LINKS_VI } from './policyFooterLabels.js';
import { computePolicyHash, PUBLIC_DIR } from './policyHash.js';

const QUY_TRINH = [
  'Guard chốt phiên bản chính sách. Nếu bạn CỐ Ý sửa lời văn (thay đổi thực chất), làm theo quy trình ở đầu file',
  'policyVersions.js: (1) báo người dùng trước >= 15 ngày; (2) chép bản cũ vào policyArchive/<slug>/<ngày cũ>/ + loader',
  'TRƯỚC khi sửa; (3) thêm ngày mới vào ĐẦU versions và cập nhật currentHash; (4) terms/privacy/dpa: tăng version + hash',
  'ở backend/src/config/legalDocuments.config.js. Nếu chỉ sửa không thực chất (chính tả hiển thị, CSS): chỉ cập nhật',
  'currentHash (và hash backend nếu là 3 văn bản đó), KHÔNG tăng version.',
].join('\n');

const slugs = Object.keys(POLICY_VERSIONS);
const toVi = (iso) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

describe('PolicyVersionsGuard', () => {
  it.each(slugs)('%s: hash file thật khớp currentHash', (slug) => {
    const { files, currentHash } = POLICY_VERSIONS[slug];
    expect(
      computePolicyHash(files),
      `Nội dung ${files.join(', ')} đã đổi so với sổ phiên bản (slug "${slug}").\n${QUY_TRINH}`,
    ).toBe(currentHash);
  });

  it('11 khoá đúng bằng 11 route chính sách ở footer', () => {
    const footerPaths = POLICY_LINKS_VI.map(([href]) => href).sort();
    const registryPaths = slugs.map((s) => POLICY_VERSIONS[s].path).sort();
    expect(slugs).toHaveLength(11);
    expect(registryPaths).toEqual(footerPaths);
  });

  it.each(slugs)('%s: versions giảm dần, đúng định dạng, không trùng', (slug) => {
    const { versions } = POLICY_VERSIONS[slug];
    expect(versions.length).toBeGreaterThan(0);
    for (const v of versions) expect(v).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions).toEqual([...versions].sort().reverse());
  });

  it.each(slugs)('%s: versions[0] khớp ngày "Áp dụng từ" trong trang', (slug) => {
    const { files, versions } = POLICY_VERSIONS[slug];
    const text = fs.readFileSync(path.join(PUBLIC_DIR, files[0]), 'utf8');
    expect(text).toContain(`Áp dụng từ <strong>${toVi(versions[0])}</strong>`);
  });

  it('kho lưu trữ khớp 1:1 với các phiên bản cũ (versions.slice(1))', () => {
    const expected = slugs
      .flatMap((slug) => POLICY_VERSIONS[slug].versions.slice(1).map((d) => `${slug}/${d}`))
      .sort();
    expect(Object.keys(ARCHIVED_POLICY_LOADERS).sort()).toEqual(expected);
    for (const key of expected) {
      expect(typeof ARCHIVED_POLICY_LOADERS[key]).toBe('function');
      const dir = path.join(PUBLIC_DIR, 'policyArchive', key);
      expect(fs.existsSync(dir), `thiếu thư mục kho ${key}`).toBe(true);
      expect(fs.readdirSync(dir).length).toBeGreaterThan(0);
    }
  });
});
