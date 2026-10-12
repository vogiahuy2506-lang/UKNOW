/**
 * PR-7a — ngân sách thời gian của bước soạn nháp biểu mẫu trong một lượt AI landing.
 */
import { describe, it, expect } from '@jest/globals';
import {
  LANDING_FORM_DRAFT_MAX_MS,
  LANDING_FORM_DRAFT_MIN_MS,
  LANDING_FORM_DRAFT_RESERVE_MS,
  LANDING_TURN_TOTAL_MS,
  resolveFormDraftBudgetMs,
} from '../landingTurnBudget.util.js';

describe('resolveFormDraftBudgetMs', () => {
  const NOW = 1_000_000;

  it('hằng số: trần 25 giây, chừa 8 giây, ngưỡng tối thiểu 6 giây', () => {
    expect(LANDING_FORM_DRAFT_MAX_MS).toBe(25000);
    expect(LANDING_FORM_DRAFT_RESERVE_MS).toBe(8000);
    expect(LANDING_FORM_DRAFT_MIN_MS).toBe(6000);
  });

  it('lượt luồng, vừa sinh xong sau 90 giây: còn nhiều ngân sách → bị chặn bởi trần cứng 25 giây', () => {
    expect(resolveFormDraftBudgetMs({
      deadlineAtMs: NOW - 90000 + LANDING_TURN_TOTAL_MS, startedAtMs: NOW - 90000, timeBudgetMs: LANDING_TURN_TOTAL_MS, nowMs: NOW,
    })).toBe(25000);
  });

  it('đường JSON cũ (Cloudflare cắt 100 giây, ngân sách quyết định 85 giây): sinh xong ở giây 60 → còn 85−60−8 = 17 giây', () => {
    expect(resolveFormDraftBudgetMs({ deadlineAtMs: NOW + 180000, startedAtMs: NOW - 60000, timeBudgetMs: 85000, nowMs: NOW })).toBe(17000);
  });

  it('chạm trần tổng của lượt: còn 20 giây tới hạn chót → 20−8 = 12 giây', () => {
    expect(resolveFormDraftBudgetMs({ deadlineAtMs: NOW + 20000, startedAtMs: NOW - 100000, timeBudgetMs: LANDING_TURN_TOTAL_MS, nowMs: NOW })).toBe(12000);
  });

  it('còn dưới ngưỡng tối thiểu → 0 (không bắt đầu): sau chừa còn 5,9 giây', () => {
    expect(resolveFormDraftBudgetMs({ deadlineAtMs: NOW + 13900, startedAtMs: NOW - 1000, timeBudgetMs: LANDING_TURN_TOTAL_MS, nowMs: NOW })).toBe(0);
    expect(resolveFormDraftBudgetMs({ deadlineAtMs: NOW + 14000, startedAtMs: NOW - 1000, timeBudgetMs: LANDING_TURN_TOTAL_MS, nowMs: NOW })).toBe(6000);
  });

  it('đã quá hạn chót / quá ngân sách → 0; không có hạn chót thì chỉ xét ngân sách quyết định', () => {
    expect(resolveFormDraftBudgetMs({ deadlineAtMs: NOW - 1, startedAtMs: NOW - 1000, timeBudgetMs: LANDING_TURN_TOTAL_MS, nowMs: NOW })).toBe(0);
    expect(resolveFormDraftBudgetMs({ deadlineAtMs: null, startedAtMs: NOW - 90000, timeBudgetMs: 85000, nowMs: NOW })).toBe(0);
    expect(resolveFormDraftBudgetMs({ deadlineAtMs: null, startedAtMs: NOW - 1000, timeBudgetMs: 85000, nowMs: NOW })).toBe(25000);
  });
});
