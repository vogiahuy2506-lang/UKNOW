import { describe, it, expect } from '@jest/globals';
import {
  buildEmailUnsubscribeUrl,
  buildListUnsubscribeHeaders,
  resolveUnsubscribeMailto,
} from '../emailListUnsubscribe.util.js';

describe('emailListUnsubscribe.util (PR-Q2 việc g, RFC 2369 + 8058)', () => {
  const token = '3f2c9d52-7a41-4b6e-9c10-0a1b2c3d4e5f';

  it('URL huỷ đăng ký theo token, bỏ dấu / thừa ở gốc', () => {
    expect(buildEmailUnsubscribeUrl('https://founderai.biz/', token))
      .toBe(`https://founderai.biz/api/customers/email-tracking/unsubscribe/${token}`);
  });

  it('HTTPS: có List-Unsubscribe và List-Unsubscribe-Post=One-Click', () => {
    const headers = buildListUnsubscribeHeaders({ unsubscribeUrl: buildEmailUnsubscribeUrl('https://founderai.biz', token), mailto: null });
    expect(headers).toEqual({
      'List-Unsubscribe': `<https://founderai.biz/api/customers/email-tracking/unsubscribe/${token}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });

  it('mailto (nếu có) đứng trước URL', () => {
    const headers = buildListUnsubscribeHeaders({ unsubscribeUrl: 'https://founderai.biz/u/1', mailto: 'stop@founderai.biz' });
    expect(headers['List-Unsubscribe']).toBe('<mailto:stop@founderai.biz?subject=unsubscribe>, <https://founderai.biz/u/1>');
  });

  it('HTTP (dev): chỉ List-Unsubscribe, không có -Post', () => {
    const headers = buildListUnsubscribeHeaders({ unsubscribeUrl: 'http://localhost:5001/u/1', mailto: null });
    expect(Object.keys(headers)).toEqual(['List-Unsubscribe']);
  });

  it('URL rỗng / có ký tự nguy hiểm → không header nào (không chèn header hỏng vào thư)', () => {
    expect(buildListUnsubscribeHeaders({ unsubscribeUrl: '', mailto: null })).toEqual({});
    expect(buildListUnsubscribeHeaders({ unsubscribeUrl: 'https://x/u\r\nBcc: a@b.c', mailto: null })).toEqual({});
    expect(buildListUnsubscribeHeaders({ unsubscribeUrl: 'javascript:alert(1)', mailto: null })).toEqual({});
  });

  it('resolveUnsubscribeMailto: chỉ nhận địa chỉ email hợp lệ không chứa ký tự phá header', () => {
    expect(resolveUnsubscribeMailto('stop@founderai.biz')).toBe('stop@founderai.biz');
    expect(resolveUnsubscribeMailto('')).toBeNull();
    expect(resolveUnsubscribeMailto(undefined)).toBeNull();
    expect(resolveUnsubscribeMailto('khong-phai-email')).toBeNull();
    expect(resolveUnsubscribeMailto('a@b.c>, <https://evil')).toBeNull();
  });
});
