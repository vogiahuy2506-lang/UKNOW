import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../../services/leadPublicApi.js', () => ({
  postPublicLead: vi.fn(),
}));

vi.mock('../../../landing-pages/utils/landingVisitorId.js', () => ({
  getOrCreateLandingVisitorId: vi.fn(() => 'VISITOR-X'),
}));

import { postPublicLead } from '../../services/leadPublicApi.js';
import { getOrCreateLandingVisitorId } from '../../../landing-pages/utils/landingVisitorId.js';
import { useFounderLandingForm } from '../useFounderLandingForm';

beforeEach(() => {
  vi.clearAllMocks();
  postPublicLead.mockResolvedValue({ data: { success: true } });
});

const validForm = {
  lastName: 'Nguyen',
  firstName: 'An',
  email: 'an@example.com',
  phone: '0901234567',
  occupation: 'Founder',
  interestArea: 'AI',
};

const fillValid = async (result) => {
  await act(async () => {
    Object.entries(validForm).forEach(([k, v]) => result.current.setField(k, v));
  });
};

describe('useFounderLandingForm — initial state', () => {
  it('form rỗng, marketingConsent=true, submitting=false, error="", success=false', () => {
    const { result } = renderHook(() => useFounderLandingForm());
    expect(result.current.form).toEqual({
      lastName: '',
      firstName: '',
      email: '',
      phone: '',
      occupation: '',
      interestArea: '',
      marketingConsent: true,
    });
    expect(result.current.submitting).toBe(false);
    expect(result.current.error).toBe('');
    expect(result.current.success).toBe(false);
  });

  it('setField update đúng field + clear error trước đó', async () => {
    const { result } = renderHook(() => useFounderLandingForm());
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.error).toBeTruthy();

    await act(async () => {
      result.current.setField('lastName', 'A');
    });
    expect(result.current.form.lastName).toBe('A');
    expect(result.current.error).toBe('');
  });
});

describe('useFounderLandingForm — validate (locale=vi)', () => {
  it('thiếu họ/tên → error fullName VN', async () => {
    const { result } = renderHook(() => useFounderLandingForm('vi'));
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.error).toBe('Vui lòng nhập đầy đủ Họ và Tên');
    expect(postPublicLead).not.toHaveBeenCalled();
  });

  it('email không hợp lệ → error email', async () => {
    const { result } = renderHook(() => useFounderLandingForm('vi'));
    await act(async () => {
      result.current.setField('lastName', 'A');
      result.current.setField('firstName', 'B');
      result.current.setField('email', 'not-an-email');
      result.current.setField('phone', '0901234567');
    });
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.error).toBe('Email không hợp lệ');
  });

  it('phone < 8 chữ số → error phone', async () => {
    const { result } = renderHook(() => useFounderLandingForm('vi'));
    await act(async () => {
      result.current.setField('lastName', 'A');
      result.current.setField('firstName', 'B');
      result.current.setField('email', 'a@b.com');
      result.current.setField('phone', '1234');
    });
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.error).toBe('Số điện thoại không hợp lệ');
  });

  it('marketingConsent=false → error consent', async () => {
    const { result } = renderHook(() => useFounderLandingForm('vi'));
    await fillValid(result);
    await act(async () => {
      result.current.setField('marketingConsent', false);
    });
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.error).toBe('Cần đồng ý nhận thông tin tư vấn');
  });
});

describe('useFounderLandingForm — validate (locale=en)', () => {
  it('thiếu họ tên → error fullName EN', async () => {
    const { result } = renderHook(() => useFounderLandingForm('en'));
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.error).toBe('Please enter your first and last name');
  });

  it('locale lạ → fallback "vi"', async () => {
    const { result } = renderHook(() => useFounderLandingForm('fr'));
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.error).toBe('Vui lòng nhập đầy đủ Họ và Tên');
  });
});

describe('useFounderLandingForm — submit success', () => {
  it('payload chuẩn hoá: email lowercase + trim, không kèm slug khi không có landingPageSlug', async () => {
    const { result } = renderHook(() => useFounderLandingForm('vi'));
    await fillValid(result);
    await act(async () => {
      result.current.setField('email', '  AN@Example.com  ');
      result.current.setField('phone', '  0901 234 567  ');
    });
    await act(async () => {
      await result.current.submit();
    });
    await waitFor(() => expect(result.current.success).toBe(true));
    expect(postPublicLead).toHaveBeenCalledTimes(1);
    const payload = postPublicLead.mock.calls[0][0];
    expect(payload.email).toBe('an@example.com');
    expect(payload.phone).toBe('0901 234 567');
    expect(payload.lastName).toBe('Nguyen');
    expect(payload.firstName).toBe('An');
    expect(payload.marketingConsent).toBe(true);
    expect(payload.landingPageSlug).toBeUndefined();
    expect(payload.visitorId).toBeUndefined();
  });

  it('landingPageSlug có → gắn slug lowercase trim + visitorId vào payload', async () => {
    const { result } = renderHook(() =>
      useFounderLandingForm('vi', { landingPageSlug: '  PROMO/2026  ' })
    );
    await fillValid(result);
    await act(async () => {
      await result.current.submit();
    });
    await waitFor(() => expect(result.current.success).toBe(true));
    const payload = postPublicLead.mock.calls[0][0];
    expect(payload.landingPageSlug).toBe('promo/2026');
    expect(payload.visitorId).toBe('VISITOR-X');
    expect(getOrCreateLandingVisitorId).toHaveBeenCalled();
  });

  it('submitting=true trong khi gọi API rồi tắt sau khi xong', async () => {
    let resolvePromise;
    postPublicLead.mockReturnValueOnce(new Promise((res) => { resolvePromise = res; }));

    const { result } = renderHook(() => useFounderLandingForm('vi'));
    await fillValid(result);

    let submitPromise;
    await act(async () => {
      submitPromise = result.current.submit();
    });
    expect(result.current.submitting).toBe(true);

    await act(async () => {
      resolvePromise({ data: { success: true } });
      await submitPromise;
    });
    expect(result.current.submitting).toBe(false);
    expect(result.current.success).toBe(true);
  });
});

describe('useFounderLandingForm — submit error', () => {
  it('error có response.data.message → dùng message từ server', async () => {
    postPublicLead.mockRejectedValueOnce({
      response: { data: { message: 'Email đã đăng ký' } },
    });
    const { result } = renderHook(() => useFounderLandingForm('vi'));
    await fillValid(result);
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.error).toBe('Email đã đăng ký');
    expect(result.current.success).toBe(false);
    expect(result.current.submitting).toBe(false);
  });

  it('error generic (Error instance) → dùng error.message', async () => {
    postPublicLead.mockRejectedValueOnce(new Error('Connection timeout'));
    const { result } = renderHook(() => useFounderLandingForm('vi'));
    await fillValid(result);
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.error).toBe('Connection timeout');
  });

  it('error không có message → fallback genericError theo locale en', async () => {
    postPublicLead.mockRejectedValueOnce({});
    const { result } = renderHook(() => useFounderLandingForm('en'));
    await fillValid(result);
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.error).toBe('Could not submit. Try again.');
  });
});
