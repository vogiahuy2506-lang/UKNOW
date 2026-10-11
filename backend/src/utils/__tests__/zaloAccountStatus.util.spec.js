/**
 * PLAN_DANG_XUAT_ZALO_AN_HOI_THOAI 11/10/2026 — mảnh SQL dùng chung để ẩn hội thoại của tài khoản Zalo đã đăng xuất.
 */
import { describe, expect, it } from '@jest/globals';
import {
  ZALO_ACCOUNT_LOGGED_OUT_CODE,
  ZALO_STATUS_LOGGED_OUT,
  zaloAccountVisibleSql,
  zaloConversationVisibleSql,
} from '../zaloAccountStatus.util.js';

describe('zaloAccountStatus.util', () => {
  it('hằng số: trạng thái và mã lỗi đúng như hợp đồng với FE / API', () => {
    expect(ZALO_STATUS_LOGGED_OUT).toBe('logged_out');
    expect(ZALO_ACCOUNT_LOGGED_OUT_CODE).toBe('ZALO_ACCOUNT_LOGGED_OUT');
  });

  it('zaloAccountVisibleSql: NULL-an toàn (hàng LEFT JOIN không có tài khoản vẫn hiện) và theo alias truyền vào', () => {
    expect(zaloAccountVisibleSql('zs')).toBe("COALESCE(zs.status, '') <> 'logged_out'");
    expect(zaloAccountVisibleSql('zalo_settings')).toBe("COALESCE(zalo_settings.status, '') <> 'logged_out'");
  });

  it('zaloConversationVisibleSql: NOT EXISTS trên zalo_settings theo cột id_zalo_setting của alias hội thoại', () => {
    const sql = zaloConversationVisibleSql('zp').replace(/\s+/g, ' ');
    expect(sql).toBe("NOT EXISTS ( SELECT 1 FROM zalo_settings zs_lo WHERE zs_lo.id = zp.id_zalo_setting AND zs_lo.status = 'logged_out' )");
    expect(zaloConversationVisibleSql('m', 'id_zalo_setting')).toContain('zs_lo.id = m.id_zalo_setting');
  });

  it('alias lạ bị từ chối (không bao giờ nội suy chuỗi tuỳ ý vào SQL)', () => {
    expect(() => zaloAccountVisibleSql("zs; DROP TABLE users")).toThrow();
    expect(() => zaloConversationVisibleSql('zp', "id) OR (1=1")).toThrow();
    expect(() => zaloConversationVisibleSql('')).toThrow();
  });
});
