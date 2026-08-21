/**
 * Map BIN 6 số (Napas) → tên ngân hàng + shortCode + monogram.
 *
 * Dùng cho CheckoutPage để hiển thị "VCB - Vietcombank" thay vì chỉ "970436"
 * sau khi parse từ VietQR. Không cần gọi API — hardcode top 25 ngân hàng thường
 * gặp đủ cho 99% giao dịch PayOS tại VN.
 *
 * Nguồn: Napas / SBV (cập nhật 2024). BIN hiếm ngân hàng nhỏ sẽ fall back về
 * "Ngân hàng {BIN}" trong UI.
 *
 * Nếu cần mở rộng, lấy từ https://api.vietqr.vn/vi/danh-sach-ma-ngan-hang
 * (Napas cập nhật định kỳ).
 */

export const PAYOS_BANK_BIN_MAP = {
  '970436': { name: 'Vietcombank', short: 'VCB', color: '#0066B3' },
  '970415': { name: 'VietinBank', short: 'CTG', color: '#E2231A' },
  '970418': { name: 'BIDV', short: 'BIDV', color: '#003A82' },
  '970405': { name: 'Agribank', short: 'AGB', color: '#9F2241' },
  '970407': { name: 'Techcombank', short: 'TCB', color: '#DC1F26' },
  '970422': { name: 'MB Bank', short: 'MB', color: '#1A1A1A' },
  '970416': { name: 'ACB', short: 'ACB', color: '#0072BC' },
  '970432': { name: 'VPBank', short: 'VPB', color: '#0066B3' },
  '970423': { name: 'TPBank', short: 'TPB', color: '#7B1FA2' },
  '970403': { name: 'Sacombank', short: 'STB', color: '#003D7A' },
  '970437': { name: 'HDBank', short: 'HDB', color: '#E2231A' },
  '970448': { name: 'OCB', short: 'OCB', color: '#F37021' },
  '970443': { name: 'SHB', short: 'SHB', color: '#003D7A' },
  '970431': { name: 'Eximbank', short: 'EIB', color: '#003D7A' },
  '970426': { name: 'MSB', short: 'MSB', color: '#003D7A' },
  '970440': { name: 'SeABank', short: 'SEA', color: '#003D7A' },
  '970441': { name: 'VIB', short: 'VIB', color: '#0066B3' },
  '970454': { name: 'BVBank', short: 'BVB', color: '#003D7A' },
  '970449': { name: 'LPBank', short: 'LPB', color: '#003D7A' },
  '970428': { name: 'Nam A Bank', short: 'NAB', color: '#003D7A' },
  '970429': { name: 'SCB', short: 'SCB', color: '#E2231A' },
  '970419': { name: 'NCB', short: 'NCB', color: '#003D7A' },
  '970425': { name: 'ABBank', short: 'ABB', color: '#003D7A' },
  '970406': { name: 'DongA Bank', short: 'DAB', color: '#003D7A' },
  '970452': { name: 'KienLongBank', short: 'KLB', color: '#003D7A' },
  '970438': { name: 'BaoViet Bank', short: 'BVB', color: '#003D7A' },
  '970412': { name: 'PVcomBank', short: 'PVC', color: '#003D7A' },
  '970430': { name: 'PG Bank', short: 'PGB', color: '#003D7A' },
  '970427': { name: 'VietA Bank', short: 'VAB', color: '#003D7A' },
  '970409': { name: 'Bac A Bank', short: 'BAB', color: '#003D7A' },
  '970400': { name: 'SaigonBank', short: 'SGB', color: '#003D7A' },
  '970408': { name: 'GP Bank', short: 'GPB', color: '#003D7A' },
  '970444': { name: 'CB Bank', short: 'CBB', color: '#003D7A' },
  '970414': { name: 'OceanBank', short: 'OCB', color: '#003D7A' },
  '970424': { name: 'Shinhan Vietnam', short: 'SHBVN', color: '#0046AD' },
  '970457': { name: 'Woori Vietnam', short: 'WRB', color: '#003D7A' },
  '970458': { name: 'UOB Vietnam', short: 'UOB', color: '#003D7A' },
  '970410': { name: 'Standard Chartered VN', short: 'SC', color: '#003D7A' },
  '970439': { name: 'Public Bank VN', short: 'PB', color: '#003D7A' },
};

/** Lookup an toàn — trả mock với BIN làm monogram nếu không match. */
export function lookupBankByBin(bin) {
  const key = String(bin || '').trim();
  if (!key) return null;
  const found = PAYOS_BANK_BIN_MAP[key];
  if (found) return { bin: key, ...found };
  // Fallback — vẫn hiển thị được BIN, không cần spam "ngân hàng không xác định"
  return {
    bin: key,
    name: `Ngân hàng ${key}`,
    short: key.slice(-3),
    color: '#475569',
  };
}

/** Format số tài khoản đẹp hơn: 1234 5678 9012 (nhóm 4-4-4) cho dễ đọc khi copy. */
export function formatAccountNumber(account) {
  const s = String(account || '').replace(/\s+/g, '');
  if (!s) return '';
  return s.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}
