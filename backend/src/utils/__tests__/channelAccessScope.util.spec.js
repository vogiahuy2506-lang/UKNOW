/**
 * PLAN_GIAO_TK_TG_WA PR-H3 — hàm thuần dựng điều kiện SQL lọc hội thoại / tin Telegram + WhatsApp theo tài khoản được giao.
 */
import { describe, expect, it } from '@jest/globals';
import {
  isChannelScopeUnrestricted,
  normalizeChannelAccessScope,
  pushChannelAccessCondition,
  pushChannelAccessFilter,
  SCOPED_CHANNELS,
} from '../channelAccessScope.util.js';

describe('normalizeChannelAccessScope', () => {
  it('giữ null (chủ), làm sạch mảng thành chuỗi không trùng, mọi thứ khác → []', () => {
    expect(normalizeChannelAccessScope({ telegram: null, whatsapp_baileys: null })).toEqual({ telegram: null, whatsapp_baileys: null });
    expect(normalizeChannelAccessScope({ telegram: [7, '7', '', 8], whatsapp_baileys: ['1-a'] })).toEqual({ telegram: ['7', '8'], whatsapp_baileys: ['1-a'] });
  });

  it('HỎNG THÌ CHẶN: thiếu / sai kiểu / thiếu khoá kênh → [] (không bao giờ null)', () => {
    const blocked = { telegram: [], whatsapp_baileys: [] };
    for (const bad of [undefined, 'all', 5, [], true]) expect(normalizeChannelAccessScope(bad)).toEqual(blocked);
    expect(normalizeChannelAccessScope({ telegram: 'x' })).toEqual(blocked);
    expect(normalizeChannelAccessScope({ telegram: ['7'] })).toEqual({ telegram: ['7'], whatsapp_baileys: [] });
  });
});

describe('isChannelScopeUnrestricted', () => {
  it('chỉ khi CẢ HAI kênh null', () => {
    expect(isChannelScopeUnrestricted({ telegram: null, whatsapp_baileys: null })).toBe(true);
    expect(isChannelScopeUnrestricted({ telegram: null, whatsapp_baileys: [] })).toBe(false);
    expect(isChannelScopeUnrestricted(undefined)).toBe(false);
  });
});

describe('pushChannelAccessFilter', () => {
  it('chủ (cả hai null) → chuỗi rỗng, KHÔNG đẩy tham số', () => {
    const params = [1];
    expect(pushChannelAccessFilter({ telegram: null, whatsapp_baileys: null }, 'ch', params)).toBe('');
    expect(params).toEqual([1]);
  });

  it('nhân viên: mỗi kênh một mảng text[] đánh số tiếp theo params; kênh ngoài phạm vi giao (zalo_oa...) luôn qua', () => {
    const params = [1, 20];
    const sql = pushChannelAccessFilter({ telegram: ['7'], whatsapp_baileys: ['1-a', '1-b'] }, 'ch', params);
    expect(params).toEqual([1, 20, ['7'], ['1-a', '1-b']]);
    expect(sql).toBe(
      "AND (ch.channel NOT IN ('telegram', 'whatsapp_baileys') "
      + "OR (ch.channel = 'telegram' AND ch.external_channel_id = ANY($3::text[])) "
      + "OR (ch.channel = 'whatsapp_baileys' AND ch.external_channel_id = ANY($4::text[])))"
    );
  });

  it('một kênh null (thấy hết kênh đó) + kênh kia có mảng → không tham số cho kênh null', () => {
    const params = [1];
    const sql = pushChannelAccessFilter({ telegram: null, whatsapp_baileys: [] }, 'cc', params);
    expect(params).toEqual([1, []]);
    expect(sql).toContain("OR cc.channel = 'telegram' OR");
    expect(sql).toContain("(cc.channel = 'whatsapp_baileys' AND cc.external_channel_id = ANY($2::text[]))");
  });

  it('thiếu phạm vi → cả hai kênh bị chặn (mảng rỗng)', () => {
    const params = [];
    const sql = pushChannelAccessFilter(undefined, 'ch', params);
    expect(params).toEqual([[], []]);
    expect(sql).toMatch(/ANY\(\$1::text\[\]\).*ANY\(\$2::text\[\]\)/);
  });

  it('pushChannelAccessCondition trả cùng biểu thức nhưng không có "AND" đứng đầu; chủ → ""', () => {
    const params = [];
    expect(pushChannelAccessCondition({ telegram: null, whatsapp_baileys: null }, 'conn', params)).toBe('');
    const cond = pushChannelAccessCondition({ telegram: [], whatsapp_baileys: [] }, 'conn', params);
    expect(cond.startsWith('(conn.channel NOT IN')).toBe(true);
  });

  it('SCOPED_CHANNELS đúng hai kênh trong bảng giao', () => {
    expect([...SCOPED_CHANNELS]).toEqual(['telegram', 'whatsapp_baileys']);
  });
});
