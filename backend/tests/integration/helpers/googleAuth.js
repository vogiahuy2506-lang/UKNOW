/**
 * Giả Google cho POST /api/auth/google-login (nhánh access_token).
 *
 * Backend gọi 2 endpoint Google theo thứ tự: tokeninfo (token phải cấp cho GOOGLE_CLIENT_ID và còn
 * hạn) rồi userinfo (email/tên/ảnh). Các test giả `fetch` bằng MỘT object trả cho mọi lượt gọi, nên
 * object đó phải mang cả trường tokeninfo (spread `googleTokenInfoFields()`) lẫn trường userinfo.
 */
export const GOOGLE_TEST_CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';

/**
 * Trường tokeninfo hợp lệ cho access token cấp cho app test.
 * @returns {{ aud: string, azp: string, expires_in: string }}
 */
export function googleTokenInfoFields() {
  return { aud: GOOGLE_TEST_CLIENT_ID, azp: GOOGLE_TEST_CLIENT_ID, expires_in: '3599' };
}

/**
 * Gán GOOGLE_CLIENT_ID cho app test; trả hàm khôi phục giá trị cũ.
 * @returns {() => void}
 */
export function useGoogleTestClientId() {
  const previous = process.env.GOOGLE_CLIENT_ID;
  process.env.GOOGLE_CLIENT_ID = GOOGLE_TEST_CLIENT_ID;
  return () => {
    if (previous === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = previous;
  };
}
