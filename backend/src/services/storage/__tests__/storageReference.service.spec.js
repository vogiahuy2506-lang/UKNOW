import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateFileToken } from '../../../utils/fileDownloadToken.js';

// File token ký bằng JWT_SECRET (không còn chuỗi dự phòng) — đọc lúc ký/kiểm nên gán ở đây là đủ.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-storage-reference-secret';

const query = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query },
}));

const {
  REFERENCE_CONFIGS,
  buildStorageReferenceIndex,
  getIndexedStorageReferences,
  isReferenceAlive,
  isStorageKeyReferencedByMessage,
  resolveWorkspaceOwner,
} = await import('../storageReference.service.js');

describe('storageReference.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    query.mockImplementation(async (sql) => {
      if (/FROM chat_attachments/.test(sql)) {
        return { rows: [{ id: 11, id_user: 88, storage_key: 'uploads/55/chat/inbox.pdf' }] };
      }
      if (/FROM help_articles/.test(sql)) {
        const token = generateFileToken('uploads/1/help/guide.png', null, null, null);
        return {
          rows: [{
            id: 9,
            body_md: '',
            body_html: `<img src="/file/${token}">`,
            media_urls: [],
          }],
        };
      }
      if (/FROM business_profiles/.test(sql)) {
        return {
          rows: [{ id: 5, user_id: 77, logo_url: '/uploads/77/legacy-logo.png' }],
        };
      }
      return { rows: [] };
    });
  });

  it('keeps chat catalog owner canonical and maps help to the system pool', async () => {
    const index = await buildStorageReferenceIndex();

    expect(getIndexedStorageReferences(index, 'uploads/55/chat/inbox.pdf')).toEqual([
      expect.objectContaining({
        ownerUserId: 88,
        ownerIsCanonical: true,
        referenceType: 'chat_attachment',
      }),
    ]);
    expect(getIndexedStorageReferences(index, 'uploads/1/help/guide.png')).toEqual([
      expect.objectContaining({
        poolType: 'system',
        ownerUserId: null,
        referenceType: 'help_article',
      }),
    ]);
    expect(getIndexedStorageReferences(index, 'uploads/77/legacy-logo.png')).toEqual([
      expect.objectContaining({
        ownerUserId: 77,
        referenceType: 'business_profile',
      }),
    ]);
  });

  it('resolves an employee parent id to its active workspace owner', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 55, owner_ids: ['12'] }] });

    await expect(resolveWorkspaceOwner(55)).resolves.toEqual({
      ownerUserId: 12,
      source: 'membership',
      ambiguous: false,
    });
  });

  it('checks isReferenceAlive accurately', async () => {
    // 1. empty input
    await expect(isReferenceAlive(null, null)).resolves.toEqual({ alive: false });

    // 2. alive reference
    query.mockResolvedValueOnce({ rows: [{ id: 10, name: 'Khuyến mãi T8' }] });
    await expect(isReferenceAlive('zalo_template', 10)).resolves.toEqual({
      alive: true,
      label: 'Mẫu tin nhắn',
      name: 'Khuyến mãi T8',
      url: '/app/settings/templates',
    });

    // 3. dead reference
    query.mockResolvedValueOnce({ rows: [] });
    await expect(isReferenceAlive('email_template', 99)).resolves.toEqual({ alive: false });

    // 4. unknown reference (fail-safe alive)
    await expect(isReferenceAlive('unknown_parent_type', 123)).resolves.toEqual({
      alive: true,
      label: 'unknown_parent_type',
      name: 'unknown_parent_type #123',
      url: null,
    });

    // 5. query error (fail-safe alive on 42703, 22P02, etc.)
    query.mockRejectedValueOnce(new Error('column does not exist (42703)'));
    await expect(isReferenceAlive('campaign_node', 5)).resolves.toEqual({
      alive: true,
      label: 'Chiến dịch',
      name: 'Chiến dịch #5',
      url: '/app/campaigns',
    });
  });

  describe('isStorageKeyReferencedByMessage', () => {
    it('detects reference in ai_chat_messages via data column', async () => {
      query.mockImplementation(async (sql) => {
        if (/ai_chat_messages/i.test(sql)) {
          return { rows: [{ 1: 1 }] };
        }
        return { rows: [] };
      });

      const referenced = await isStorageKeyReferencedByMessage('uploads/42/chat/assistant.pdf');
      expect(referenced).toBe(true);
      const aiQueryCall = query.mock.calls.find(([sql]) => sql.includes('ai_chat_messages'));
      expect(aiQueryCall[0]).toMatch(/data::text LIKE \$1/);
    });

    it('detects reference in webchat_messages via attachments column', async () => {
      query.mockImplementation(async (sql) => {
        if (/webchat_messages/i.test(sql)) {
          return { rows: [{ 1: 1 }] };
        }
        return { rows: [] };
      });

      const referenced = await isStorageKeyReferencedByMessage('uploads/42/chat/webchat.pdf');
      expect(referenced).toBe(true);
    });

    it('returns false when no table contains the key', async () => {
      query.mockResolvedValue({ rows: [] });
      const referenced = await isStorageKeyReferencedByMessage('uploads/42/chat/orphan.pdf');
      expect(referenced).toBe(false);
    });
  });
});

// Nút "Đi đến màn hình quản lý" ở Thư viện media dùng nguyên văn `url` làm href. Trước 03/10 hầu hết url thiếu tiền tố /app
// ('/templates', '/studio', '/landing-pages'…) nên rơi vào route `*` của App.jsx và về TRANG CHỦ. Đọc chữ App.jsx
// (không import JSX vào jest backend) và đòi mỗi url là một route thật nằm dưới /app hoặc /admin.
describe('REFERENCE_CONFIGS: url là route thật của frontend', () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const appSource = fs.readFileSync(path.resolve(__dirname, '../../../../../frontend/src/App.jsx'), 'utf8');
  const sectionOf = (marker) => {
    const start = appSource.indexOf(`<Route path="${marker}"`);
    const next = appSource.indexOf('<Route path="/', start + 1);
    return start >= 0 ? appSource.slice(start, next > start ? next : undefined) : '';
  };
  const sections = { app: sectionOf('/app'), admin: sectionOf('/admin') };

  it('đọc được hai nhánh route /app và /admin', () => {
    expect(sections.app).toContain('path="settings/templates"');
    expect(sections.admin).toContain('path="help-articles"');
  });

  Object.entries(REFERENCE_CONFIGS).forEach(([type, config]) => {
    it(`${type}: ${config.url}`, () => {
      const match = /^\/(app|admin)\/(.+)$/.exec(config.url);
      expect(match).not.toBeNull();
      expect(sections[match[1]]).toContain(`path="${match[2]}"`);
    });
  });

  it('mẫu tin nhắn dùng chung 3 kênh: nhãn không còn "Mẫu Zalo"', () => {
    expect(REFERENCE_CONFIGS.zalo_template.label).toBe('Mẫu tin nhắn');
  });
});
