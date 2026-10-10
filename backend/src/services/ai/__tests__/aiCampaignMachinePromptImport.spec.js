/**
 * Chặn tái phát "tiếng Việt làm giao thức" (C-NO-GOC2): dò chữ "Tạo chi tiết template cho ngày…" chỉ được sống ở
 * bộ lọc LỊCH SỬ. Lượt hiện tại quyết định theo `planSlotKey` do client gửi tường minh.
 */
import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const listJs = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return entry.name === '__tests__' ? [] : listJs(full);
  return entry.name.endsWith('.js') ? [full] : [];
});

describe('isPlanTemplateDraftRequest — chỉ còn ở bộ lọc lịch sử', () => {
  it('chỉ một module ngoài file định nghĩa dùng nó, và đúng một chỗ gọi (isMachinePlanTemplateMessage)', () => {
    const users = listJs(srcRoot)
      .filter((file) => !file.endsWith('aiCampaignWizard.service.js'))
      .filter((file) => fs.readFileSync(file, 'utf8').includes('isPlanTemplateDraftRequest'));
    expect(users.map((f) => path.relative(srcRoot, f))).toEqual(['services/ai/aiCampaign.service.js']);

    const source = fs.readFileSync(users[0], 'utf8');
    const calls = source.split('\n').filter((line) => line.includes('isPlanTemplateDraftRequest('));
    expect(calls).toHaveLength(1);
    const idx = source.indexOf('isPlanTemplateDraftRequest(');
    const fnStart = source.lastIndexOf('export function', idx);
    expect(source.slice(fnStart, fnStart + 60)).toContain('isMachinePlanTemplateMessage');
  });
});
