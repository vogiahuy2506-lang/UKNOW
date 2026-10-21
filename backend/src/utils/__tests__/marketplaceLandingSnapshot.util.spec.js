import { describe, expect, it } from '@jest/globals';
import {
  isSellerPrivateLandingConfigKey,
  sanitizeLandingSnapshotForSharing,
  stripSellerPrivateLandingConfig,
} from '../marketplaceLandingSnapshot.util.js';

const SELLER_CONFIG = {
  googleSheetsSync: { enabled: true, webhookUrl: 'https://script.google.com/macros/s/AKfy/exec', secret: 'BI_MAT' },
  googleSheetsWebhookUrl: 'https://script.google.com/macros/s/AKfy/exec',
  googleSheetsLastSyncAt: '2026-10-01T00:00:00Z',
  googleSheetsLastError: 'HTTP 500',
  sheetsSync: { enabled: true, webhookUrl: 'https://script.google.com/macros/s/OLD/exec' },
  chosenFormId: 77,
  category: 'khoa-hoc',
  leadForm: { customFields: [{ key: 'ngan_sach', type: 'text' }] },
  theme: { color: '#fff' },
};

describe('stripSellerPrivateLandingConfig', () => {
  it('bỏ mọi khoá googleSheets*, sheetsSync, chosenFormId; giữ phần còn lại', () => {
    const result = stripSellerPrivateLandingConfig(SELLER_CONFIG);
    expect(Object.keys(result).sort()).toEqual(['category', 'leadForm', 'theme']);
    expect(result.leadForm).toEqual(SELLER_CONFIG.leadForm);
  });

  it('không phân biệt hoa/thường và bắt khoá googleSheets* lạ ghi sau này', () => {
    const result = stripSellerPrivateLandingConfig({ GoogleSheetsFoo: 1, googlesheetsbar: 2, CHOSENFORMID: 3, keep: 4 });
    expect(result).toEqual({ keep: 4 });
  });

  it('không sửa đối tượng đầu vào', () => {
    const input = { ...SELLER_CONFIG };
    stripSellerPrivateLandingConfig(input);
    expect(input).toEqual(SELLER_CONFIG);
  });

  it('giá trị không phải đối tượng thường trả nguyên (null/undefined/chuỗi/mảng)', () => {
    expect(stripSellerPrivateLandingConfig(null)).toBeNull();
    expect(stripSellerPrivateLandingConfig(undefined)).toBeUndefined();
    expect(stripSellerPrivateLandingConfig('x')).toBe('x');
    const arr = [1];
    expect(stripSellerPrivateLandingConfig(arr)).toBe(arr);
  });

  it('isSellerPrivateLandingConfigKey', () => {
    expect(isSellerPrivateLandingConfigKey('googleSheetsSync')).toBe(true);
    expect(isSellerPrivateLandingConfigKey('chosenFormId')).toBe(true);
    expect(isSellerPrivateLandingConfigKey('sheetsSync')).toBe(true);
    expect(isSellerPrivateLandingConfigKey('category')).toBe(false);
    expect(isSellerPrivateLandingConfigKey('sheets')).toBe(false);
  });
});

describe('sanitizeLandingSnapshotForSharing', () => {
  it('lọc customConfig và custom_config (dữ liệu cũ), giữ htmlContent/title/slug', () => {
    const snapshot = { title: 'T', slug: 's', htmlContent: '<p>x</p>', customConfig: SELLER_CONFIG, custom_config: SELLER_CONFIG };
    const result = sanitizeLandingSnapshotForSharing(snapshot);
    expect(result.title).toBe('T');
    expect(result.htmlContent).toBe('<p>x</p>');
    expect(Object.keys(result.customConfig).sort()).toEqual(['category', 'leadForm', 'theme']);
    expect(Object.keys(result.custom_config).sort()).toEqual(['category', 'leadForm', 'theme']);
    // đầu vào không bị sửa
    expect(snapshot.customConfig.googleSheetsSync).toBeDefined();
  });

  it('snapshot không có customConfig -> không thêm khoá', () => {
    expect(sanitizeLandingSnapshotForSharing({ title: 'T' })).toEqual({ title: 'T' });
  });

  it('không phải đối tượng thường trả nguyên', () => {
    expect(sanitizeLandingSnapshotForSharing(null)).toBeNull();
    expect(sanitizeLandingSnapshotForSharing('x')).toBe('x');
  });
});
