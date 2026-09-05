import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFounderLandingForm } from '../useFounderLandingForm.js';
import { LANDING_COPY } from '../../constants/landingCopy.js';
import * as leadPublicApi from '../../services/leadPublicApi.js';

vi.mock('../../services/leadPublicApi.js', () => ({
  postPublicLead: vi.fn(),
  fetchPublicLeadFormConfig: vi.fn(),
}));

describe('useFounderLandingForm hook (Nghị định 330/2026 consent test)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    leadPublicApi.postPublicLead.mockResolvedValue({ data: { success: true } });
  });

  it('mở form lần đầu: form.marketingConsent === false (không tick sẵn)', () => {
    const { result } = renderHook(() => useFounderLandingForm('vi'));
    expect(result.current.form.marketingConsent).toBe(false);
  });

  it('tick rồi submit: payload gửi marketingConsent: true', async () => {
    const { result } = renderHook(() => useFounderLandingForm('vi'));

    act(() => {
      result.current.setField('lastName', 'Nguyen');
      result.current.setField('firstName', 'Van A');
      result.current.setField('email', 'vana@example.com');
      result.current.setField('phone', '0901234567');
      result.current.setField('marketingConsent', true);
    });

    expect(result.current.validate()).toBe('');

    await act(async () => {
      await result.current.submit();
    });

    expect(leadPublicApi.postPublicLead).toHaveBeenCalledTimes(1);
    expect(leadPublicApi.postPublicLead).toHaveBeenCalledWith(
      expect.objectContaining({
        lastName: 'Nguyen',
        firstName: 'Van A',
        email: 'vana@example.com',
        phone: '0901234567',
        marketingConsent: true,
      })
    );
    expect(result.current.success).toBe(true);
    expect(result.current.error).toBe('');
  });

  it('không tick, submit: form gửi được (validate() trả \'\'), payload marketingConsent: false', async () => {
    const { result } = renderHook(() => useFounderLandingForm('vi'));

    act(() => {
      result.current.setField('lastName', 'Tran');
      result.current.setField('firstName', 'Thi B');
      result.current.setField('email', 'thib@example.com');
      result.current.setField('phone', '0912345678');
      // marketingConsent remains default false
    });

    expect(result.current.form.marketingConsent).toBe(false);
    expect(result.current.validate()).toBe('');

    await act(async () => {
      await result.current.submit();
    });

    expect(leadPublicApi.postPublicLead).toHaveBeenCalledTimes(1);
    expect(leadPublicApi.postPublicLead).toHaveBeenCalledWith(
      expect.objectContaining({
        lastName: 'Tran',
        firstName: 'Thi B',
        email: 'thib@example.com',
        phone: '0912345678',
        marketingConsent: false,
      })
    );
    expect(result.current.success).toBe(true);
    expect(result.current.error).toBe('');
  });

  it('không tick + thiếu email: vẫn báo lỗi email — bỏ chặn consent không được làm hỏng validate khác', async () => {
    const { result } = renderHook(() => useFounderLandingForm('vi'));

    act(() => {
      result.current.setField('lastName', 'Le');
      result.current.setField('firstName', 'Van C');
      result.current.setField('email', '');
      result.current.setField('phone', '0923456789');
      // marketingConsent remains false
    });

    const emailErrorMsg = LANDING_COPY.vi.form.validation.email;
    expect(result.current.validate()).toBe(emailErrorMsg);

    await act(async () => {
      await result.current.submit();
    });

    expect(leadPublicApi.postPublicLead).not.toHaveBeenCalled();
    expect(result.current.error).toBe(emailErrorMsg);
    expect(result.current.success).toBe(false);
  });
});
