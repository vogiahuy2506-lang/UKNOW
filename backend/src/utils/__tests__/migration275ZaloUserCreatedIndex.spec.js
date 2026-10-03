/**
 * Migration 275 — index (id_user, created_at) cho zalo_personal_messages (ban tin tuan chatbot).
 * Doc thang file migration/bootstrap nen lech la do, khong can CSDL.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, '../../..');
const read = (rel) => readFileSync(path.join(backendDir, rel), 'utf8');

const migration = read('migrations/275_zalo_personal_messages_user_created_index.sql');
const bootstrap = read('tests/integration/sql/bootstrap.sql');

const CREATE_INDEX =
  /CREATE INDEX IF NOT EXISTS idx_zalo_personal_msg_user_created\s+ON zalo_personal_messages \(id_user, created_at\);/;

describe('migration 275', () => {
  it('co dung cau CREATE INDEX thuong tren (id_user, created_at), khong partial', () => {
    expect(migration).toMatch(CREATE_INDEX);
    expect(migration).not.toMatch(/idx_zalo_personal_msg_user_created[^;]*WHERE/i);
  });

  it('khong chua CONCURRENTLY (runner boc transaction, CI chan)', () => {
    expect(migration).not.toMatch(/CONCURRENTLY/i);
  });

  it('bootstrap co cung index', () => {
    expect(bootstrap).toMatch(CREATE_INDEX);
  });
});
