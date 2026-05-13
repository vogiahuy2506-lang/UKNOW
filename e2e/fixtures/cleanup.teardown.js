/**
 * Cleanup teardown — chạy sau khi toàn bộ test xong.
 * Hiện chỉ xoá file storageState để lần chạy sau bắt buộc login lại.
 */
import { test as teardown } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.join(__dirname, '..', '.auth', 'user.json');

teardown('cleanup auth state', async () => {
  if (fs.existsSync(AUTH_FILE)) {
    fs.unlinkSync(AUTH_FILE);
  }
});
