import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from '@jest/globals';
import { resolveCampaignVia, CAMPAIGN_VIA } from '../campaignVia.util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AI_CONTROLLER = path.resolve(__dirname, '../../controllers/ai.controller.js');

/**
 * Nhãn `via` trong audit phải phân biệt được slot filling với compiler thường.
 *
 * Bối cảnh (06/09/2026): campaign 355 có log "✅ Đã áp dụng Slot Filling cho luồng zalo_group"
 * nhưng audit_logs ghi via='ai_compiler', vì ternary cũ gộp mọi trường hợp compilerApplied
 * thành 'ai_compiler'. Tiêu chí nghiệm thu GĐ 4 ("audit có ai_compiler_slot_filling") vì thế
 * không bao giờ đạt được dù tính năng đã chạy.
 */
describe('resolveCampaignVia', () => {
  it('script có _via = ai_compiler_slot_filling → giữ nguyên, dù compilerApplied cũng true', () => {
    expect(resolveCampaignVia({ compilerApplied: true, _via: 'ai_compiler_slot_filling' }))
      .toBe(CAMPAIGN_VIA.AI_COMPILER_SLOT_FILLING);
  });

  it('script có _via = ai_compiler → ai_compiler', () => {
    expect(resolveCampaignVia({ compilerApplied: true, _via: 'ai_compiler' })).toBe(CAMPAIGN_VIA.AI_COMPILER);
  });

  it('chỉ có compilerApplied, không có _via → ai_compiler', () => {
    expect(resolveCampaignVia({ compilerApplied: true })).toBe(CAMPAIGN_VIA.AI_COMPILER);
  });

  it('không có dấu compiler nào → ai', () => {
    expect(resolveCampaignVia({ nodes: [] })).toBe(CAMPAIGN_VIA.AI);
    expect(resolveCampaignVia(null)).toBe(CAMPAIGN_VIA.AI);
    expect(resolveCampaignVia()).toBe(CAMPAIGN_VIA.AI);
  });

  it('_via lạ không được lọt vào audit → rơi về compilerApplied rồi ai', () => {
    expect(resolveCampaignVia({ _via: 'builder' })).toBe(CAMPAIGN_VIA.AI);
    expect(resolveCampaignVia({ _via: 'whatever', compilerApplied: true })).toBe(CAMPAIGN_VIA.AI_COMPILER);
  });

  it('nhiều ứng viên: prepareScript làm rơi _via thì vẫn lấy được từ script gốc', () => {
    const prepared = { compilerApplied: true };
    const raw = { compilerApplied: true, _via: 'ai_compiler_slot_filling' };
    expect(resolveCampaignVia(prepared, raw)).toBe(CAMPAIGN_VIA.AI_COMPILER_SLOT_FILLING);
  });
});

describe('ai.controller.js phải dùng resolveCampaignVia ở mọi chỗ gán campaignVia', () => {
  const source = fs.readFileSync(AI_CONTROLLER, 'utf8');

  it('không còn ternary tự suy via', () => {
    expect(source).not.toMatch(/\?\s*'ai_compiler'\s*:\s*'ai'/);
  });

  it('mọi chỗ gán campaignVia đều gọi resolveCampaignVia', () => {
    const assigns = source.match(/campaignVia\s*:/g) || [];
    const calls = source.match(/campaignVia\s*:\s*resolveCampaignVia\(/g) || [];
    expect(assigns.length).toBeGreaterThan(0);
    expect(calls.length).toBe(assigns.length);
  });
});
