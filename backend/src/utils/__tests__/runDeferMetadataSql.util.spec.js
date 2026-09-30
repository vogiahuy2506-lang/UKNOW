/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-4b — biểu thức "lượt chạy đang chờ" được tách thành hàm DÙNG CHUNG cho
 * bảng lượt chạy của admin (deliveryMonitorTopRuns.query.js) và trang Giám sát gửi tin của người dùng. Ghim nguyên văn để
 * việc tách không làm đổi kết quả phía admin, và để thứ tự ưu tiên bốn họ khoá defer không bị đổi ngầm.
 */
import { describe, expect, it } from '@jest/globals';
import { runDeferredReasonSql, runDeferredUntilSql } from '../runDeferMetadataSql.util.js';
import { buildTopRunsQuery } from '../../services/shared/deliveryMonitorTopRuns.query.js';

describe('runDeferMetadataSql', () => {
  it('mốc chờ: thứ tự quota → bước kế (one-shot) → Zalo → kênh adapter, NGUYÊN VĂN như bản admin cũ', () => {
    expect(runDeferredUntilSql('rm')).toBe(
      "COALESCE(rm.run_metadata->>'quotaDeferredUntil', rm.run_metadata->>'nonContinuousDeferredUntil', rm.run_metadata->>'zaloOutboundDeferredUntil', rm.run_metadata->>'channelDeferredUntil')"
    );
  });

  it('lý do chờ: cùng thứ tự, cùng bốn họ khoá', () => {
    expect(runDeferredReasonSql('rm')).toBe(
      "COALESCE(rm.run_metadata->>'quotaDeferredReason', rm.run_metadata->>'nonContinuousDeferredReason', rm.run_metadata->>'zaloDeferredReason', rm.run_metadata->>'channelDeferredReason')"
    );
  });

  it('bí danh bảng được thay vào mọi khoá', () => {
    const sql = runDeferredUntilSql('cr');
    expect(sql.match(/cr\.run_metadata/g)).toHaveLength(4);
    expect(sql).not.toContain('rm.');
  });

  it('bảng lượt chạy của ADMIN dùng đúng hai biểu thức này (không còn bản chép riêng)', () => {
    const sql = buildTopRunsQuery({ limit: 10 });
    expect(sql).toContain(`${runDeferredUntilSql('rm')} AS deferred_until,`);
    expect(sql).toContain(`${runDeferredReasonSql('rm')} AS deferred_reason,`);
    expect(sql).toContain('LIMIT 10');
  });

  it('bảng admin không còn nhánh lọc theo chủ (userScoped đã bỏ cùng bản Giám sát cũ của người dùng)', () => {
    expect(buildTopRunsQuery({ limit: 10 })).not.toContain('c.id_user');
  });
});
