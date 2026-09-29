/**
 * PLAN_WHATSAPP_DAY_DU_2026-09-29 PR-W4b — loại chiến dịch 'whatsapp': khối gửi chỉ là send_whatsapp
 * (khi cờ bật), khối dữ liệu = COMMON (như email, khác Telegram rỗng). Ghim telegram/mixed không đổi.
 */
import { describe, expect, it } from 'vitest';
import {
  getAllowedActionNodeTypesByCampaignType,
  getAllowedDataNodeTypesByCampaignType,
} from '../campaignBuilderFlow';

const COMMON_DATA = [
  'read_sheet', 'read_courses_db', 'read_products_db', 'read_interested_customers',
  'read_landing_leads', 'read_form_submissions', 'save_customer',
];

describe("loại chiến dịch 'whatsapp'", () => {
  it("cờ bật -> action đúng {send_whatsapp}, KHÔNG email/zalo/telegram", () => {
    const allowed = getAllowedActionNodeTypesByCampaignType('whatsapp', { whatsappEnabled: true });
    expect([...allowed]).toEqual(['send_whatsapp']);
  });

  it('cờ tắt (mặc định hoặc tường minh) -> action rỗng', () => {
    expect(getAllowedActionNodeTypesByCampaignType('whatsapp').size).toBe(0);
    expect(getAllowedActionNodeTypesByCampaignType('whatsapp', { whatsappEnabled: false }).size).toBe(0);
    // cờ Telegram không mở khối WhatsApp
    expect(getAllowedActionNodeTypesByCampaignType('whatsapp', { telegramEnabled: true }).size).toBe(0);
  });

  it("khối dữ liệu = COMMON_DATA_NODE_TYPES (KHÔNG rỗng như Telegram, KHÔNG null) — nguồn 'node' dùng được", () => {
    const data = getAllowedDataNodeTypesByCampaignType('whatsapp');
    expect(data).toBeInstanceOf(Set);
    expect(data.size).toBeGreaterThan(0);
    expect([...data].sort()).toEqual([...COMMON_DATA].sort());
    expect(getAllowedDataNodeTypesByCampaignType(' WhatsApp ')?.size).toBe(COMMON_DATA.length);
    expect(data.has('select_zalo_account')).toBe(false);
  });

  it("'whatsapp' không rơi về nhánh telegram (data rỗng) hay nhánh mixed (data null)", () => {
    expect(getAllowedDataNodeTypesByCampaignType('whatsapp')).not.toBeNull();
    expect(getAllowedDataNodeTypesByCampaignType('whatsapp').size).not.toBe(0);
    expect(getAllowedActionNodeTypesByCampaignType('whatsapp', { telegramEnabled: true, whatsappEnabled: true }).has('send_telegram')).toBe(false);
  });
});

describe("'mixed' + cờ WhatsApp", () => {
  it('cờ tắt -> không có send_whatsapp (ghim không đổi so với trước)', () => {
    expect([...getAllowedActionNodeTypesByCampaignType('mixed')].sort()).toEqual(
      ['send_email', 'send_zalo_friend_request', 'send_zalo_group', 'send_zalo_personal']
    );
    expect(getAllowedActionNodeTypesByCampaignType('mixed', { telegramEnabled: true }).has('send_whatsapp')).toBe(false);
  });

  it('cờ bật -> có send_whatsapp, vẫn giữ email/zalo (+telegram khi bật)', () => {
    expect([...getAllowedActionNodeTypesByCampaignType('mixed', { whatsappEnabled: true })].sort()).toEqual(
      ['send_email', 'send_whatsapp', 'send_zalo_friend_request', 'send_zalo_group', 'send_zalo_personal']
    );
    expect([...getAllowedActionNodeTypesByCampaignType('mixed', { telegramEnabled: true, whatsappEnabled: true })].sort()).toEqual(
      ['send_email', 'send_telegram', 'send_whatsapp', 'send_zalo_friend_request', 'send_zalo_group', 'send_zalo_personal']
    );
  });

  it("'mixed' data vẫn null (không lọc)", () => {
    expect(getAllowedDataNodeTypesByCampaignType('mixed')).toBeNull();
  });
});

describe('loại khác + cờ WhatsApp — không đổi (ghim)', () => {
  it.each(['email', 'zalo', 'zalo_group', 'telegram', 'telegram_group'])(
    "'%s' + whatsappEnabled:true -> VẪN KHÔNG có send_whatsapp",
    (type) => {
      const allowed = getAllowedActionNodeTypesByCampaignType(type, { telegramEnabled: true, whatsappEnabled: true });
      expect(allowed.has('send_whatsapp')).toBe(false);
    }
  );

  it("'telegram' và 'telegram_group' giữ nguyên: action {send_telegram}, data rỗng", () => {
    expect([...getAllowedActionNodeTypesByCampaignType('telegram', { telegramEnabled: true })]).toEqual(['send_telegram']);
    expect([...getAllowedActionNodeTypesByCampaignType('telegram_group', { telegramEnabled: true })]).toEqual(['send_telegram']);
    expect(getAllowedDataNodeTypesByCampaignType('telegram').size).toBe(0);
    expect(getAllowedDataNodeTypesByCampaignType('telegram_group').size).toBe(0);
  });

  it("'email' data = COMMON không đổi", () => {
    expect([...getAllowedDataNodeTypesByCampaignType('email')].sort()).toEqual([...COMMON_DATA].sort());
  });
});
