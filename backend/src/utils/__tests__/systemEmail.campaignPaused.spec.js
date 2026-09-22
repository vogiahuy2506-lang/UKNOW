/**
 * PLAN_GIOI_HAN_GUI_THEO_NGAY_2026-09-22, Việc 3 — buildCampaignPausedEmail() phải nói đúng cái gì
 * bị chạm: hạn mức GÓI hay giới hạn NGƯỜI DÙNG TỰ ĐẶT cho tài khoản gửi. Trước PR này mọi lý do đều
 * dùng chung một câu "hết lượt … của gói hiện tại" + nút "Mua thêm hạn mức" — sai với giới hạn tự
 * đặt, đẩy khách đi mua thêm gói một cách vô ích cho thứ họ tự đặt ra.
 */
import { describe, expect, it } from '@jest/globals';
import { buildCampaignPausedEmail } from '../systemEmail.util.js';

const BASE = {
  fullName: 'Chủ Shop',
  campaignName: 'Chiến dịch tháng 9',
  channelLabel: 'Zalo',
  resetAt: new Date('2026-09-23T17:00:00.000Z'),
  topupUrl: 'https://founderai.vn/app/topup',
};

describe('buildCampaignPausedEmail — hạn mức GÓI (mặc định, isAccountLimit không truyền)', () => {
  it('nói "của gói hiện tại", nút trỏ tới trang mua thêm hạn mức', () => {
    const { html, subject } = buildCampaignPausedEmail(BASE);

    expect(html).toContain('của gói hiện tại');
    expect(html).toContain('Mua thêm hạn mức →');
    expect(html).toContain(BASE.topupUrl);
    expect(html).not.toContain('bạn tự đặt');
    expect(html).not.toContain('Cài đặt kênh');
    expect(subject).toContain('Chiến dịch tháng 9');
  });
});

describe('buildCampaignPausedEmail — giới hạn NGƯỜI DÙNG TỰ ĐẶT (isAccountLimit: true)', () => {
  const settingsUrl = 'https://founderai.vn/app/settings/channels';

  it('KHÔNG nói "của gói hiện tại"; nói rõ đây là giới hạn tự đặt', () => {
    const { html } = buildCampaignPausedEmail({ ...BASE, isAccountLimit: true, settingsUrl });

    expect(html).not.toContain('hết lượt <strong>Zalo</strong> của gói hiện tại');
    expect(html).toContain('mà bạn tự đặt');
    expect(html).toContain('không phải hạn mức của gói');
  });

  it('nút hành động trỏ sang Cài đặt kênh, KHÔNG phải trang mua thêm hạn mức', () => {
    const { html } = buildCampaignPausedEmail({ ...BASE, isAccountLimit: true, settingsUrl });

    expect(html).toContain('Mở Cài đặt kênh →');
    expect(html).toContain(settingsUrl);
    expect(html).not.toContain('Mua thêm hạn mức →');
  });

  it('hộp cảnh báo nói rõ mua thêm hạn mức gói KHÔNG giúp gửi tiếp ngay', () => {
    const { html } = buildCampaignPausedEmail({ ...BASE, isAccountLimit: true, settingsUrl });

    expect(html).toContain('KHÔNG giúp gửi tiếp ngay');
  });

  it('thiếu settingsUrl (gọi thiếu tham số) → không throw, rơi về topupUrl để không vỡ trang', () => {
    expect(() => buildCampaignPausedEmail({ ...BASE, isAccountLimit: true, settingsUrl: null })).not.toThrow();
    const { html } = buildCampaignPausedEmail({ ...BASE, isAccountLimit: true, settingsUrl: null });
    expect(html).toContain(BASE.topupUrl);
  });

  it('vẫn hiện đúng mốc tự chạy lại (resetAt) và tên chiến dịch như nhánh gói', () => {
    const { html, subject } = buildCampaignPausedEmail({ ...BASE, isAccountLimit: true, settingsUrl });
    expect(html).toContain('Chiến dịch tháng 9');
    expect(subject).toContain('Chiến dịch tháng 9');
  });
});
