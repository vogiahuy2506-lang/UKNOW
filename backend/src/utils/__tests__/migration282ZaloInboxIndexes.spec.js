/**
 * Migration 282 — 2 index Hop thu tren zalo_personal_messages (H-06).
 * Doc thang file migration/bootstrap nen lech la do, khong can CSDL.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, '../../..');
const read = (rel) => readFileSync(path.join(backendDir, rel), 'utf8');

const migration = read('migrations/282_zalo_personal_messages_inbox_indexes.sql');
const bootstrap = read('tests/integration/sql/bootstrap.sql');

const CONV_CREATED =
  /CREATE INDEX IF NOT EXISTS idx_zalo_personal_msg_conv_created\s+ON zalo_personal_messages \(id_conversation, created_at DESC, id DESC\);/;
const CONV_UNREAD =
  /CREATE INDEX IF NOT EXISTS idx_zalo_personal_msg_conv_unread\s+ON zalo_personal_messages \(id_conversation\) WHERE role = 'visitor' AND is_read = false;/;

describe('migration 282', () => {
  it('index (id_conversation, created_at DESC, id DESC) khop khoa sap xep cua "tin cuoi" va phan trang khung doc', () => {
    expect(migration).toMatch(CONV_CREATED);
  });

  it('index mot phan chi cho tin khach chua doc, dung dieu kien giong cac cau dem (role = visitor AND is_read = false)', () => {
    expect(migration).toMatch(CONV_UNREAD);
  });

  it('khong chua CONCURRENTLY (runner boc transaction, CI chan)', () => {
    expect(migration.replace(/^--.*$/gm, '')).not.toMatch(/CONCURRENTLY/i);
  });

  it('bootstrap co cung 2 index', () => {
    expect(bootstrap).toMatch(CONV_CREATED);
    expect(bootstrap).toMatch(CONV_UNREAD);
  });
});
