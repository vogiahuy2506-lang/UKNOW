/**
 * Mọi mã hành động / loại đối tượng mà BACKEND ghi vào nhật ký đều phải có nhãn ở cả vi.js lẫn en.js.
 *
 * Vì sao phải ghim: `t()` trả lại chính chuỗi khoá khi thiếu bản dịch, nên thiếu nhãn là khách đọc nguyên
 * "auditLogs.actions.LANDING_PAGE_CREATED" trên trang Nhật ký hoạt động. Đo production 22/09/2026: chỉ 21/86
 * hành động có nhãn, khoảng 40% dòng nhật ký của khách hiện khoá thô (185 dòng landing page, 186 dòng chatbot,
 * 120 dòng "kết nối tài khoản Zalo"…) — vì mỗi tính năng mới thêm mã ở backend mà không ai quay lại file chữ.
 *
 * Nguồn sự thật là `backend/src/services/audit.service.js`; đọc dạng văn bản để test frontend không phải nạp
 * mã backend (kéo theo pg, dotenv…).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import viTranslations from '../vi';
import enTranslations from '../en';
import { WORKSPACE_AUDIT_ACTIONS, WORKSPACE_AUDIT_ENTITIES, auditLabel } from '../../pages/settings/auditLogLabels';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(
  path.resolve(here, '../../../../backend/src/services/audit.service.js'),
  'utf8',
);

/** Lấy các giá trị chuỗi của một object literal `export const NAME = Object.freeze({ … })` / `= { … }`. */
function readConstValues(name) {
  const start = source.indexOf(`export const ${name}`);
  if (start < 0) throw new Error(`Không thấy ${name} trong audit.service.js`);
  const open = source.indexOf('{', start);
  const close = source.indexOf('}', open);
  return [...source.slice(open, close).matchAll(/:\s*'([^']+)'/g)].map((m) => m[1]);
}

const BACKEND_ACTIONS = readConstValues('AUDIT_ACTIONS');
const BACKEND_ENTITIES = readConstValues('AUDIT_ENTITY_TYPES');

describe('nhãn nhật ký hoạt động ↔ mã của backend', () => {
  it('đọc được danh sách mã từ backend (chốt chống phép quét rỗng)', () => {
    expect(BACKEND_ACTIONS.length).toBeGreaterThanOrEqual(86);
    expect(BACKEND_ENTITIES.length).toBeGreaterThanOrEqual(23);
    expect(BACKEND_ACTIONS).toContain('LANDING_PAGE_CREATED');
    expect(BACKEND_ENTITIES).toContain('chatbot_channel');
  });

  it.each([['vi', viTranslations], ['en', enTranslations]])('%s: hành động nào cũng có nhãn', (_, dict) => {
    const missing = BACKEND_ACTIONS.filter((code) => {
      const label = dict.auditLogs?.actions?.[code];
      return typeof label !== 'string' || !label.trim() || label.includes('auditLogs.');
    });
    expect(missing).toEqual([]);
  });

  it.each([['vi', viTranslations], ['en', enTranslations]])('%s: loại đối tượng nào cũng có nhãn', (_, dict) => {
    const missing = BACKEND_ENTITIES.filter((code) => {
      const label = dict.auditLogs?.entities?.[code];
      return typeof label !== 'string' || !label.trim();
    });
    expect(missing).toEqual([]);
  });

  it('nhãn tiếng Việt không trùng nhau — hai hành động khác nhau phải đọc ra khác nhau', () => {
    const labels = BACKEND_ACTIONS.map((code) => viTranslations.auditLogs.actions[code]);
    const duplicated = labels.filter((label, index) => labels.indexOf(label) !== index);
    expect(duplicated).toEqual([]);
  });

  it('ô lọc của trang chỉ chứa mã có thật ở backend', () => {
    expect(WORKSPACE_AUDIT_ACTIONS.filter((code) => !BACKEND_ACTIONS.includes(code))).toEqual([]);
    expect(WORKSPACE_AUDIT_ENTITIES.filter((code) => !BACKEND_ENTITIES.includes(code))).toEqual([]);
    expect(new Set(WORKSPACE_AUDIT_ACTIONS).size).toBe(WORKSPACE_AUDIT_ACTIONS.length);
  });

  it('ô lọc có đủ những hành động khách đang có thật trên production (đo 22/09/2026)', () => {
    const seenOnProduction = [
      'ZALO_ACCOUNT_CONNECTED', 'EMAIL_ACCOUNT_CONNECTED', 'LANDING_PAGE_CREATED', 'LANDING_PAGE_UPDATED',
      'LANDING_PAGE_DELETED', 'LANDING_DOMAIN_UPDATED', 'CHATBOT_CREATED', 'CHATBOT_UPDATED', 'CHATBOT_DELETED',
      'CHATBOT_CHANNEL_UPDATED', 'CHATBOT_CHANNEL_DISCONNECTED', 'KNOWLEDGE_DOCUMENT_CREATED',
      'KNOWLEDGE_DOCUMENT_DELETED', 'INBOX_REPLY_SENT', 'INBOX_AI_PAUSE_UPDATED', 'INBOX_CONVERSATION_DELETED',
    ];
    expect(seenOnProduction.filter((code) => !WORKSPACE_AUDIT_ACTIONS.includes(code))).toEqual([]);
  });
});

describe('auditLabel — không bao giờ để lọt khoá dịch ra màn hình', () => {
  const t = (key) => key.split('.').reduce((acc, part) => acc?.[part], viTranslations) ?? key;

  it('mã có nhãn → trả nhãn', () => {
    expect(auditLabel(t, 'actions', 'LANDING_PAGE_CREATED')).toBe('Tạo landing page');
    expect(auditLabel(t, 'entities', 'zalo_setting')).toBe('Tài khoản Zalo');
  });

  it('mã CHƯA có nhãn (backend vừa thêm) → chữ đọc được, không phải "auditLogs.actions.…"', () => {
    const label = auditLabel(t, 'actions', 'SOMETHING_BRAND_NEW');
    expect(label).toBe('Something brand new');
    expect(label).not.toContain('auditLogs.');
  });

  it('thiếu mã → gạch ngang, không ném lỗi', () => {
    expect(auditLabel(t, 'entities', null)).toBe('—');
    expect(auditLabel(undefined, 'actions', 'CAMPAIGN_CREATED')).toBe('Campaign created');
  });
});
