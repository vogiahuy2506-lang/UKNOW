import axios from 'axios';

/**
 * Nhà cung cấp gửi OTP qua SMS/ZNS theo SĐT (PR-1, xác thực SĐT).
 * Xem _internal/PLAN_XAC_THUC_SDT_OTP_2026-09-11.md mục 4.2.
 *
 * Chọn nhà cung cấp bằng PHONE_OTP_PROVIDER ('esms' | 'mock'). BỎ TRỐNG → tính năng OTP
 * SĐT tắt im lặng (khuôn giống MEMBER_SHEET_WEBHOOK_URL ở memberSheetSync.util.js:11) —
 * mọi nhánh gọi sendOtp() phải được gác bởi isPhoneOtpEnabled() ở tầng gọi, KHÔNG dựa vào
 * hàm này tự nuốt lỗi im lặng khi được gọi nhầm lúc tắt.
 *
 * TUYỆT ĐỐI không log mã OTP hay nội dung tin nhắn đầy đủ — docker logs ai cũng đọc được
 * (Bẫy #4 trong plan). Chỉ log SĐT đã che số + mã lỗi/mã tin nhắn của provider.
 */

const PRODUCT_NAME = process.env.MAIL_FROM_NAME || 'Founder AI';

/** Che 4 số cuối — không log SĐT đầy đủ ra console. */
function maskPhone(phone) {
  const s = String(phone || '');
  if (s.length <= 4) return '*'.repeat(s.length);
  return `${'*'.repeat(s.length - 4)}${s.slice(-4)}`;
}

/**
 * eSMS.vn — SendMultipleMessage_V4 (POST JSON).
 * Tài liệu: https://esms.vn/SMSApi/ApiDetail (mục SendMultipleMessage_V4_post_json).
 * Endpoint POST JSON dùng thay vì biến thể GET (SendMultipleMessage_V4_get) để không lộ
 * ApiKey/SecretKey/SĐT qua query string (log truy cập, proxy trung gian).
 *
 * SmsType=2: tin nhắn chăm sóc khách hàng có Brandname (đúng loại cần cho OTP thương hiệu,
 * khác SmsType=8 dành cho đầu số cố định 10 chữ số).
 * CodeResult="100" = thành công; các mã khác (101 sai xác thực, 103 hết tiền, 104 brandname
 * chưa duyệt/hết hạn, ...) coi là lỗi.
 *
 * @param {{ phone: string, code: string }} input
 * @returns {Promise<{ providerMessageId: string|null }>}
 */
async function sendOtpViaEsms({ phone, code }) {
  const apiKey = process.env.ESMS_API_KEY;
  const secretKey = process.env.ESMS_SECRET_KEY;
  const brandname = process.env.ESMS_BRANDNAME;
  if (!apiKey || !secretKey || !brandname) {
    throw new Error('Thiếu cấu hình ESMS_API_KEY/ESMS_SECRET_KEY/ESMS_BRANDNAME');
  }

  // Không dấu tiếng Việt — tránh SMS bị tách nhiều đoạn (unicode giảm còn ~70 ký tự/đoạn
  // thay vì ~160), vừa tốn tiền vừa tăng rủi ro thiếu đoạn khi tới máy khách.
  const content = `Ma xac thuc ${PRODUCT_NAME}: ${code}. Het han sau 5 phut. Khong chia se ma nay cho ai.`;

  let response;
  try {
    response = await axios.post(
      'https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json/',
      {
        ApiKey: apiKey,
        SecretKey: secretKey,
        Phone: phone,
        Content: content,
        SmsType: '2',
        Brandname: brandname,
        IsUnicode: '0',
      },
      { timeout: 10000 }
    );
  } catch (err) {
    console.error(`[OtpProvider:esms] gọi API lỗi cho ${maskPhone(phone)}:`, err.message);
    throw new Error('Không gửi được OTP qua eSMS (lỗi kết nối)');
  }

  const result = response.data || {};
  const codeResult = String(result.CodeResult ?? '');
  if (codeResult !== '100') {
    console.error(`[OtpProvider:esms] CodeResult=${codeResult} cho ${maskPhone(phone)}`);
    throw new Error(`eSMS từ chối gửi (CodeResult=${codeResult})`);
  }

  return { providerMessageId: result.SMSID || null };
}

/**
 * Provider giả lập — KHÔNG gọi mạng, KHÔNG log mã OTP. Dùng cho dev/test/demo khi chưa có
 * nhà cung cấp thật hoặc brandname chưa được duyệt (Bẫy #3: bật provider thật khi brandname
 * chưa duyệt thì tin không tới, không ai vào được app).
 *
 * CẤM bật trên production khi đã có provider thật hoạt động — xem cảnh báo ở .env.example.
 *
 * @param {{ phone: string, code: string }} input
 * @returns {Promise<{ providerMessageId: string|null }>}
 */
async function sendOtpViaMock({ phone }) {
  console.log(`[OtpProvider:mock] "đã gửi" OTP tới ${maskPhone(phone)} (provider giả lập, không gọi mạng)`);
  return { providerMessageId: 'mock' };
}

const PROVIDERS = {
  esms: sendOtpViaEsms,
  mock: sendOtpViaMock,
};

/**
 * @returns {boolean} true nếu đã chọn một provider hợp lệ qua PHONE_OTP_PROVIDER.
 */
export function isPhoneOtpEnabled() {
  const provider = String(process.env.PHONE_OTP_PROVIDER || '').trim().toLowerCase();
  return Boolean(provider) && Object.prototype.hasOwnProperty.call(PROVIDERS, provider);
}

/**
 * Gửi OTP tới `phone`. KHÔNG tự kiểm tra isPhoneOtpEnabled() — tầng gọi (verification.service.js)
 * phải gác bằng if (otpEnabled) trước, đúng Bẫy #6 trong plan (đổi luồng khi provider tắt).
 * Gọi hàm này khi tắt sẽ throw rõ ràng thay vì âm thầm coi như đã gửi.
 *
 * @param {{ phone: string, code: string }} input
 * @returns {Promise<{ provider: string, providerMessageId: string|null }>}
 */
export async function sendOtp({ phone, code }) {
  const provider = String(process.env.PHONE_OTP_PROVIDER || '').trim().toLowerCase();
  const handler = PROVIDERS[provider];
  if (!handler) {
    throw new Error(
      `PHONE_OTP_PROVIDER không hợp lệ hoặc chưa cấu hình: "${provider}". `
      + `Tầng gọi phải kiểm isPhoneOtpEnabled() trước khi gọi sendOtp().`
    );
  }
  const result = await handler({ phone, code });
  return { provider, ...result };
}
