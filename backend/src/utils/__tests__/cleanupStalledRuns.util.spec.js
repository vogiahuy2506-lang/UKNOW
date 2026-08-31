import { describe, expect, it } from '@jest/globals';
import {
  buildSafeStalledRunPredicate,
  parseCleanupStalledRunArgs,
  splitCleanupStalledRunIds,
  STALLED_RUN_CLEANUP_HOURS,
} from '../cleanupStalledRuns.util.js';

describe('cleanupStalledRuns safety guards', () => {
  it('mặc định là dry-run, không có ID ghi DB', () => {
    expect(parseCleanupStalledRunArgs([])).toEqual({ apply: false, requestedRunIds: [] });
  });

  it('nhận --apply và chuẩn hoá ID đã xác nhận', () => {
    expect(parseCleanupStalledRunArgs(['--apply', '--ids=227, 314,227'])).toEqual({
      apply: true,
      requestedRunIds: [227, 314],
    });
  });

  it('từ chối ID rỗng, âm hoặc không phải số nguyên', () => {
    expect(() => parseCleanupStalledRunArgs(['--apply'])).toThrow('Từ chối ghi DB');
    expect(() => parseCleanupStalledRunArgs(['--ids='])).toThrow('--ids phải là danh sách ID dương');
    expect(() => parseCleanupStalledRunArgs(['--ids=0,314'])).toThrow('--ids phải là danh sách ID dương');
    expect(() => parseCleanupStalledRunArgs(['--ids=227,abc'])).toThrow('--ids phải là danh sách ID dương');
  });

  it('không báo nhầm run đã đóng là bị bỏ qua khi PostgreSQL trả BIGINT dạng string', () => {
    expect(splitCleanupStalledRunIds([227, 314], [{ id: '227' }])).toEqual({
      closedIds: ['227'],
      skippedIds: [314],
    });
  });

  it('predicate loại mọi run còn được runtime hẹn chạy lại và re-check hoạt động mới', () => {
    expect(STALLED_RUN_CLEANUP_HOURS).toBe(48);
    const sql = buildSafeStalledRunPredicate('$1');

    expect(sql).toContain("ce_recent.id_run = cr.id");
    expect(sql).toContain("ce_recent.updated_at");
    expect(sql).toContain("crs_parked.meta->>'nextDueAt'");
    expect(sql).toContain("cr.run_metadata->>'quotaDeferredUntil'");
    expect(sql).toContain("cr.run_metadata->>'zaloOutboundDeferredUntil'");
    expect(sql).toContain("cr.run_metadata->>'nonContinuousDeferredUntil'");
    expect(sql).toContain("NOW() - ($1 || ' hours')::interval");
  });
});
