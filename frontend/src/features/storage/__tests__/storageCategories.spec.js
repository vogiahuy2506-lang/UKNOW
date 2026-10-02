import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vi from '../../../i18n/vi';
import en from '../../../i18n/en';
import { STORAGE_CATEGORIES, resolveStorageCategory } from '../storageCategories';

/**
 * Bảng category của Thư viện media là bảng hằng số → phải ghim TỪNG PHẦN TỬ (một bảng "đủ" mà thiếu một dòng vẫn xanh
 * nếu chỉ đếm). Bản cũ hai bảng trùng trong MediaLibraryPage thiếu `landing_asset` (55 tệp / 33 MB trên production),
 * `form_asset`, `form_receipt` và `other` nên màn hiện mã thô.
 */
const EXPECTED = [
  ['zalo_template', 'Mẫu tin nhắn', 'Message Template'],
  ['email_template', 'Mẫu Email', 'Email Template'],
  ['chat', 'Tin nhắn chat', 'Chat Message'],
  ['landing', 'Landing page', 'Landing Page'],
  ['landing_version', 'Phiên bản Landing', 'Landing version'],
  ['landing_asset', 'Ảnh landing page', 'Landing page images'],
  ['form_asset', 'Tệp biểu mẫu', 'Form files'],
  ['form_receipt', 'Biên lai biểu mẫu', 'Form payment receipts'],
  ['logo', 'Logo & Thương hiệu', 'Logo & Brand'],
  ['campaign', 'Chiến dịch', 'Campaign'],
  ['quick_send', 'Gửi nhanh', 'Quick send'],
  ['help', 'Trợ giúp', 'Help'],
  ['temp', 'Tệp tạm', 'Temp File'],
  ['other', 'Khác', 'Other'],
];

const labelOf = (dict, labelKey) => labelKey.split('.').reduce((node, part) => node?.[part], dict);

describe('STORAGE_CATEGORIES — ghim từng phần tử', () => {
  it('đúng thứ tự và đúng bộ mã (không thừa, không thiếu)', () => {
    expect(STORAGE_CATEGORIES.map((item) => item.value)).toEqual(EXPECTED.map(([value]) => value));
  });

  it.each(EXPECTED)('%s: nhãn vi = "%s", nhãn en = "%s"', (value, viLabel, enLabel) => {
    const item = STORAGE_CATEGORIES.find((entry) => entry.value === value);
    expect(item, `thiếu category ${value}`).toBeDefined();
    expect(labelOf(vi, item.labelKey)).toBe(viLabel);
    expect(labelOf(en, item.labelKey)).toBe(enLabel);
    expect(item.color).toMatch(/^bg-\S+ text-\S+ border-\S+$/);
  });

  it('mã chưa biết giữ nguyên mã thô (lộ ra thiếu nhãn) thay vì bị nuốt thành "Khác"', () => {
    const t = (key) => labelOf(vi, key) || key;
    expect(resolveStorageCategory('mot_loai_moi', t).label).toBe('mot_loai_moi');
    expect(resolveStorageCategory('', t).label).toBe('Khác');
    expect(resolveStorageCategory('landing_asset', t).label).toBe('Ảnh landing page');
  });
});

describe('STORAGE_CATEGORIES ↔ mã nguồn backend', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const backendSrc = path.resolve(here, '../../../../../backend/src');

  // Các file ghi `storage_objects.category` (đăng ký tệp / khai báo tham chiếu cha). 'workspace' là category của
  // NHẬT KÝ HOẠT ĐỘNG (audit) xuất hiện cùng file ở vài controller, không phải category tệp.
  const BACKEND_FILES = [
    'services/storage/storageReference.service.js',
    'services/chatbot/chatAttachment.service.js',
    'services/landing/landingAsset.service.js',
    'services/landing/landingImageAsset.helper.js',
    'services/landingPage/landingPageVersion.service.js',
    'services/formAsset.service.js',
    'services/form.service.js',
    'services/campaign/quickSendAttachment.service.js',
    'controllers/zaloTemplate.controller.js',
    'controllers/emailTemplate.controller.js',
    'controllers/upload.controller.js',
    'repositories/storage.repository.js',
  ];
  const AUDIT_CATEGORIES = new Set(['workspace']);

  const scan = () => {
    const found = new Map();
    for (const rel of BACKEND_FILES) {
      const source = fs.readFileSync(path.join(backendSrc, rel), 'utf8');
      for (const match of source.matchAll(/category\s*[:=]\s*'([a-z_]+)'/g)) {
        if (AUDIT_CATEGORIES.has(match[1])) continue;
        if (!found.has(match[1])) found.set(match[1], new Set());
        found.get(match[1]).add(rel);
      }
    }
    return found;
  };

  it('đọc được mã nguồn backend (chốt chống phép quét rỗng)', () => {
    const found = scan();
    expect(found.size).toBeGreaterThanOrEqual(12);
    expect(found.has('landing_asset')).toBe(true);
    expect(found.has('form_asset')).toBe(true);
    expect(found.has('zalo_template')).toBe(true);
  });

  it('mọi category backend ghi đều có dòng trong bảng nhãn', () => {
    const known = new Set(STORAGE_CATEGORIES.map((item) => item.value));
    const missing = [...scan().entries()]
      .filter(([value]) => !known.has(value))
      .map(([value, files]) => `${value} (${[...files].join(', ')})`);
    expect(missing).toEqual([]);
  });

  it('`other` là category mặc định của upload.controller.promoteTempToStorage', () => {
    const source = fs.readFileSync(path.join(backendSrc, 'controllers/upload.controller.js'), 'utf8');
    expect(source).toMatch(/category\s*=\s*'other'/);
    expect(STORAGE_CATEGORIES.some((item) => item.value === 'other')).toBe(true);
  });
});
