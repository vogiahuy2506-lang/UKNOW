/**
 * GHIM migration 284 (custom_chatbots.allow_public_numeric_id — id số chỉ chat công khai được với chatbot ĐÃ CÓ lúc
 * migrate; A P1-5): 3 chỗ — migration, bootstrap, inventory. Đọc thẳng file nên lệch là đỏ, không cần CSDL. Phép chạy thật
 * (backfill + chạy lại không bật lại cho bot mới) ở tests/integration/chatbotPublicNumericId.test.js.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, '../../..');
const read = (rel) => readFileSync(path.join(backendDir, rel), 'utf8');

const migration = read('migrations/284_custom_chatbots_allow_public_numeric_id.sql');
const bootstrap = read('tests/integration/sql/bootstrap.sql');
const inventory = JSON.parse(read('tests/integration/fixtures/productionSchemaInventory.json'));

const sqlOnly = (sql) => sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

describe('migration 284', () => {
  it('thêm cột BOOLEAN NOT NULL DEFAULT false (chatbot tạo sau migration KHÔNG mở id số)', () => {
    expect(sqlOnly(migration)).toMatch(
      /ALTER TABLE custom_chatbots\s+ADD COLUMN allow_public_numeric_id BOOLEAN NOT NULL DEFAULT false;/
    );
  });

  it('backfill true cho mọi hàng đang có, CHỈ khi cột vừa được thêm (chạy lại không bật id số cho bot mới)', () => {
    const sql = sqlOnly(migration);
    expect(sql).toMatch(/column_name = 'allow_public_numeric_id'/);
    expect(sql).toMatch(
      /IF NOT column_existed THEN[\s\S]*ADD COLUMN allow_public_numeric_id[\s\S]*UPDATE custom_chatbots SET allow_public_numeric_id = true;[\s\S]*END IF;/
    );
    // Không có UPDATE nào nằm ngoài khối IF (nếu nằm ngoài, chạy lại sẽ bật id số cho bot mới).
    const outsideIf = sql.replace(/IF NOT column_existed THEN[\s\S]*END IF;/, '');
    expect(outsideIf).not.toMatch(/\bUPDATE\b/i);
  });

  it('không DROP / SET NOT NULL / đổi kiểu (CI chặn các DDL này)', () => {
    expect(sqlOnly(migration)).not.toMatch(/\bDROP\b|SET NOT NULL|ALTER COLUMN|\bRENAME\b/i);
  });

  it('bootstrap.sql phản chiếu cột (cùng kiểu, cùng mặc định)', () => {
    const body = bootstrap.match(/CREATE TABLE IF NOT EXISTS custom_chatbots \(([\s\S]*?)\n\);/);
    expect(body).not.toBeNull();
    expect(body[1]).toMatch(/allow_public_numeric_id BOOLEAN NOT NULL DEFAULT false/);
  });

  it('inventory production có cột + _meta.columns khớp số cột thật', () => {
    expect(inventory.tables.custom_chatbots).toContain('allow_public_numeric_id');
    const total = Object.values(inventory.tables).reduce((sum, cols) => sum + cols.length, 0);
    expect(inventory._meta.columns).toBe(total);
  });
});
