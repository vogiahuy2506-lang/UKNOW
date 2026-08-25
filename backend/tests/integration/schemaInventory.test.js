/**
 * Schema inventory 2-way parity test (PR-3 của PLAN_SCHEMA_DRIFT).
 *
 * So sánh 1-1 danh sách bảng và cột giữa DB test (dựng từ bootstrap.sql)
 * và ảnh chụp production (fixtures/productionSchemaInventory.json).
 *
 * Kiểm tra 4 chiều:
 * 1. Bảng thiếu trong DB test
 * 2. Bảng thừa trong bootstrap.sql
 * 3. Cột thiếu trong DB test
 * 4. Cột thừa trong bootstrap.sql (bắt các cột ma như refresh_tokens.user_agent)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll } from '@jest/globals';
import db from '../../src/config/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(__dirname, 'fixtures', 'productionSchemaInventory.json');

describe('schema inventory — 2-way production parity (PR-3)', () => {
  let dbTables = new Map();
  let fixtureTables = new Map();

  beforeAll(async () => {
    // 1. Đọc fixture ảnh chụp production
    const fixtureRaw = fs.readFileSync(FIXTURE_PATH, 'utf8');
    const fixtureData = JSON.parse(fixtureRaw);
    fixtureTables = new Map(
      Object.entries(fixtureData.tables || {}).map(([table, cols]) => [
        table,
        new Set(cols),
      ])
    );

    // 2. Truy vấn information_schema.columns của DB test
    const { rows } = await db.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, column_name
    `);

    dbTables = new Map();
    for (const { table_name, column_name } of rows) {
      if (!dbTables.has(table_name)) {
        dbTables.set(table_name, new Set());
      }
      dbTables.get(table_name).add(column_name);
    }
  });

  it('Chiều 1: không có bảng nào trong production fixture bị thiếu trong DB test', () => {
    const missingTables = [];
    for (const table of fixtureTables.keys()) {
      if (!dbTables.has(table)) {
        missingTables.push(table);
      }
    }

    const message = missingTables.length
      ? `DB test thiếu ${missingTables.length} bảng so với ảnh chụp production:\n` +
        missingTables.map((t) => `  - ${t}`).join('\n') +
        '\nNếu bảng đã bị xoá trên production: cập nhật fixture + ghi lý do trong commit.' +
        '\nNếu không: thêm CREATE TABLE vào bootstrap.sql.'
      : '';

    expect(message).toBe('');
    expect(missingTables).toEqual([]);
  });

  it('Chiều 2: không có bảng nào trong bootstrap.sql thừa so với production fixture', () => {
    const extraTables = [];
    for (const table of dbTables.keys()) {
      if (!fixtureTables.has(table)) {
        extraTables.push(table);
      }
    }

    const message = extraTables.length
      ? `bootstrap.sql có ${extraTables.length} bảng mà ảnh chụp production không có:\n` +
        extraTables.map((t) => `  - ${t}`).join('\n') +
        '\nNếu production thật sự có bảng này: cập nhật fixture + ghi lý do trong commit.' +
        '\nNếu không: bảng này là hư cấu, bỏ khỏi bootstrap.sql.'
      : '';

    expect(message).toBe('');
    expect(extraTables).toEqual([]);
  });

  it('Chiều 3: không có cột nào trong production fixture bị thiếu trong DB test', () => {
    const missingColumns = [];
    for (const [table, fixtureCols] of fixtureTables.entries()) {
      const dbCols = dbTables.get(table);
      if (!dbCols) continue; // Đã bắt ở chiều 1
      for (const col of fixtureCols) {
        if (!dbCols.has(col)) {
          missingColumns.push(`${table}.${col}`);
        }
      }
    }

    const message = missingColumns.length
      ? `DB test thiếu ${missingColumns.length} cột so với ảnh chụp production:\n` +
        missingColumns.map((c) => `  - ${c}`).join('\n') +
        '\nNếu cột đã bị DROP trên production: cập nhật fixture + ghi lý do trong commit.' +
        '\nNếu không: thêm cột vào bootstrap.sql.'
      : '';

    expect(message).toBe('');
    expect(missingColumns).toEqual([]);
  });

  it('Chiều 4: không có cột nào trong bootstrap.sql thừa so với production fixture', () => {
    const extraColumns = [];
    for (const [table, dbCols] of dbTables.entries()) {
      const fixtureCols = fixtureTables.get(table);
      if (!fixtureCols) continue; // Đã bắt ở chiều 2
      for (const col of dbCols) {
        if (!fixtureCols.has(col)) {
          extraColumns.push(`${table}.${col}`);
        }
      }
    }

    const message = extraColumns.length
      ? `bootstrap.sql có ${extraColumns.length} cột mà ảnh chụp production không có:\n` +
        extraColumns.map((c) => `  - ${c}`).join('\n') +
        '\nNếu production thật sự có cột này: cập nhật fixture + ghi lý do trong commit.' +
        '\nNếu không: cột này là hư cấu, bỏ khỏi bootstrap.sql.'
      : '';

    expect(message).toBe('');
    expect(extraColumns).toEqual([]);
  });
});
