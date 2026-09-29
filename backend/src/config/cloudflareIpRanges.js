/**
 * Dải IP của Cloudflare — dùng cho `app.set('trust proxy', ...)` để `req.ip` là IP THẬT của
 * người dùng thay vì IP máy chủ Cloudflare.
 *
 * Nguồn: https://www.cloudflare.com/ips-v4 và https://www.cloudflare.com/ips-v6
 * Lấy ngày 2026-09-29. Cloudflare hiếm khi đổi; khi đổi thì tải lại 2 trang trên và cập nhật đây.
 */
export const CLOUDFLARE_IPV4_RANGES = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
];

export const CLOUDFLARE_IPV6_RANGES = [
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
];

export const CLOUDFLARE_IP_RANGES = [...CLOUDFLARE_IPV4_RANGES, ...CLOUDFLARE_IPV6_RANGES];

/**
 * Chặng được tin trong chuỗi X-Forwarded-For: loopback/mạng nội bộ (nginx, docker bridge) và
 * Cloudflare. Chặng đầu tiên (từ phải sang) KHÔNG thuộc danh sách = IP người dùng. Không dùng
 * `true` (tin mọi chặng — kẻ gọi thẳng :5001 tự đặt được IP).
 */
export const TRUSTED_PROXIES = ['loopback', 'linklocal', 'uniquelocal', ...CLOUDFLARE_IP_RANGES];
