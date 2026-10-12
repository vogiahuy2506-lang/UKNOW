import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || '/api';

/**
 * Client axios độc lập dành riêng cho người dùng vãng lai nộp biểu mẫu công khai.
 * Tuyệt đối không gắn auth header hay token refresh interceptor.
 */
export const publicClient = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 20000,
});

/**
 * Lấy định nghĩa biểu mẫu công khai theo publicKey.
 *
 * @param {string} publicKey
 * @returns {Promise<object>}
 */
export async function fetchPublicForm(publicKey) {
  const res = await publicClient.get(`/public/forms/${encodeURIComponent(publicKey)}`);
  return res.data?.data;
}

/**
 * Nộp câu trả lời biểu mẫu công khai.
 *
 * @param {string} publicKey
 * @param {{ answers: Record<string, any>, marketingConsent?: boolean, _hp_website?: string }} payload
 * @returns {Promise<{ accessToken: string }>}
 */
export async function submitPublicForm(publicKey, payload) {
  const res = await publicClient.post(`/public/forms/${encodeURIComponent(publicKey)}/submissions`, payload);
  return res.data?.data;
}

export async function fetchPublicSlots(publicKey, { from, days } = {}) {
  const res = await publicClient.get(`/public/forms/${encodeURIComponent(publicKey)}/slots`, {
    params: { from, days },
  });
  return res.data?.data || { slots: [] };
}

/**
 * Trạng thái công khai của một bài nộp — trang dùng chung cho "vừa nộp xong" lẫn "mở lại từ
 * thư" (PR-3b). Không gắn auth, không lưu accessToken vào localStorage (chỉ nằm trên URL).
 *
 * @param {string} publicKey
 * @param {string} accessToken
 * @returns {Promise<{ status: string, formTitle: string, appointmentAt: string|null, holdExpiresAt: string|null, holdExpired: boolean, payment: object|null }>}
 */
export async function fetchPublicSubmissionStatus(publicKey, accessToken) {
  const res = await publicClient.get(
    `/public/forms/${encodeURIComponent(publicKey)}/submissions/${encodeURIComponent(accessToken)}`
  );
  return res.data?.data;
}

/**
 * Báo đã chuyển khoản cho một bài nộp pending_payment (PR-2).
 *
 * @param {string} publicKey
 * @param {string} accessToken
 * @returns {Promise<object>}
 */
export async function reportSubmissionPaid(publicKey, accessToken) {
  const res = await publicClient.post(
    `/public/forms/${encodeURIComponent(publicKey)}/submissions/${encodeURIComponent(accessToken)}/report-paid`
  );
  return res.data?.data;
}

/**
 * Tải ảnh biên lai chuyển khoản (PR-5).
 *
 * @param {string} publicKey
 * @param {string} accessToken
 * @param {File|Blob} file
 * @returns {Promise<{ receiptStored: boolean, reason?: string }>}
 */
export async function uploadSubmissionReceipt(publicKey, accessToken, file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await publicClient.post(
    `/public/forms/${encodeURIComponent(publicKey)}/submissions/${encodeURIComponent(accessToken)}/receipt`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );
  return res.data?.data;
}

// ─── Trường `file` (PR-4b): tải tệp THẲNG lên kho bằng URL ký ───────────────────────────────────────────────────

/**
 * Bước 1: xin URL tải lên cho MỘT tệp. Chủ biểu mẫu hết dung lượng → server trả 200 `{ quotaExceeded: true, skipToken }`
 * (KHÔNG lỗi) để khách vẫn nộp được bài.
 *
 * @param {string} publicKey
 * @param {{ fieldKey: string, fileName: string, size: number, contentType?: string }} payload
 * @returns {Promise<{ uploadId: string, uploadUrl: string, method: string, headers: Record<string,string>, expiresAt: string, fileName: string } | { quotaExceeded: true, skipToken: string }>}
 */
export async function requestPublicFileUpload(publicKey, payload) {
  const res = await publicClient.post(`/public/forms/${encodeURIComponent(publicKey)}/uploads`, payload);
  return res.data?.data;
}

/**
 * `uploadUrl` tuyệt đối (URL ký của GCS) dùng nguyên; đường dẫn bắt đầu bằng "/" (kho cục bộ ở máy dev: endpoint backend) ghép với
 * origin của base API.
 *
 * @param {string} uploadUrl
 * @returns {string}
 */
export function resolveUploadUrl(uploadUrl) {
  const url = String(uploadUrl || '');
  if (/^https?:\/\//i.test(url)) return url;
  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    return `${new URL(baseURL, origin).origin}${url}`;
  } catch {
    return url;
  }
}

/**
 * Bước 2: PUT tệp lên URL đã ký, kèm ĐÚNG các header server trả về (Content-Type, x-goog-content-length-range). Có tiến độ + huỷ.
 * Dùng axios trần (không interceptor đăng nhập — URL ký không được kèm Authorization), không timeout (tệp có thể tới 1 GB).
 *
 * @param {{ uploadUrl: string, headers?: Record<string,string>, file: File, onProgress?: (percent: number) => void, signal?: AbortSignal }} params
 * @returns {Promise<void>}
 */
export async function putFileToUploadUrl({ uploadUrl, headers = {}, file, onProgress, signal }) {
  await axios.put(resolveUploadUrl(uploadUrl), file, {
    headers,
    signal,
    timeout: 0,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    withCredentials: false,
    onUploadProgress: (event) => {
      if (onProgress && event.total) onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    },
  });
}

/**
 * Xin URL + PUT tệp. Trả `{ uploadId }` hoặc `{ quotaExceeded: true, skipToken }`.
 *
 * @param {string} publicKey
 * @param {{ key: string }} field
 * @param {File} file
 * @param {{ onProgress?: (percent: number) => void, signal?: AbortSignal }} [options]
 */
export async function uploadPublicFormFile(publicKey, field, file, { onProgress, signal } = {}) {
  const session = await requestPublicFileUpload(publicKey, {
    fieldKey: field.key,
    fileName: file.name,
    size: file.size,
    contentType: file.type || '',
  });
  if (session?.quotaExceeded) return { quotaExceeded: true, skipToken: session.skipToken };
  await putFileToUploadUrl({ uploadUrl: session.uploadUrl, headers: session.headers, file, onProgress, signal });
  return { uploadId: session.uploadId };
}
