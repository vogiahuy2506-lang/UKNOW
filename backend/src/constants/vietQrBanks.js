/**
 * Danh sách BIN ngân hàng (Napas) cho cấu hình thanh toán giữ chỗ (PR-3a,
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md).
 *
 * BẢN CHÉP của `frontend/src/utils/payosBankBinMap.js` (39 ngân hàng) — không có cách chia sẻ
 * trực tiếp giữa hai gói npm độc lập (frontend Vite, backend Node ESM thuần) mà không thêm hạ
 * tầng workspace/build mới, ngoài phạm vi PR-3a (backend-only). `src/utils/__tests__/vietQrBanks.spec.js`
 * đọc lại chữ file frontend để so khớp tập BIN mỗi lần chạy test — lệch tập BIN thì đỏ ngay,
 * không đợi phát hiện thủ công. Cách tốt hơn về lâu dài: chuyển sang JSON dùng chung (vd
 * `shared/vietQrBanks.json`) hoặc để backend là nguồn DUY NHẤT rồi frontend gọi API — cả hai đều
 * đụng tới cấu hình build/tooling, để ngoài phạm vi PR-3a này (ghi trong báo cáo).
 *
 * Nguồn: Napas / SBV. Mở rộng thì lấy từ https://api.vietqr.vn/vi/danh-sach-ma-ngan-hang và
 * SỬA CẢ HAI FILE cùng lúc.
 */

export const VIETQR_BANKS = Object.freeze({
  '970436': { name: 'Vietcombank', short: 'VCB' },
  '970415': { name: 'VietinBank', short: 'CTG' },
  '970418': { name: 'BIDV', short: 'BIDV' },
  '970405': { name: 'Agribank', short: 'AGB' },
  '970407': { name: 'Techcombank', short: 'TCB' },
  '970422': { name: 'MB Bank', short: 'MB' },
  '970416': { name: 'ACB', short: 'ACB' },
  '970432': { name: 'VPBank', short: 'VPB' },
  '970423': { name: 'TPBank', short: 'TPB' },
  '970403': { name: 'Sacombank', short: 'STB' },
  '970437': { name: 'HDBank', short: 'HDB' },
  '970448': { name: 'OCB', short: 'OCB' },
  '970443': { name: 'SHB', short: 'SHB' },
  '970431': { name: 'Eximbank', short: 'EIB' },
  '970426': { name: 'MSB', short: 'MSB' },
  '970440': { name: 'SeABank', short: 'SEA' },
  '970441': { name: 'VIB', short: 'VIB' },
  '970454': { name: 'BVBank', short: 'BVB' },
  '970449': { name: 'LPBank', short: 'LPB' },
  '970428': { name: 'Nam A Bank', short: 'NAB' },
  '970429': { name: 'SCB', short: 'SCB' },
  '970419': { name: 'NCB', short: 'NCB' },
  '970425': { name: 'ABBank', short: 'ABB' },
  '970406': { name: 'DongA Bank', short: 'DAB' },
  '970452': { name: 'KienLongBank', short: 'KLB' },
  '970438': { name: 'BaoViet Bank', short: 'BVB' },
  '970412': { name: 'PVcomBank', short: 'PVC' },
  '970430': { name: 'PG Bank', short: 'PGB' },
  '970427': { name: 'VietA Bank', short: 'VAB' },
  '970409': { name: 'Bac A Bank', short: 'BAB' },
  '970400': { name: 'SaigonBank', short: 'SGB' },
  '970408': { name: 'GP Bank', short: 'GPB' },
  '970444': { name: 'CB Bank', short: 'CBB' },
  '970414': { name: 'OceanBank', short: 'OCB' },
  '970424': { name: 'Shinhan Vietnam', short: 'SHBVN' },
  '970457': { name: 'Woori Vietnam', short: 'WRB' },
  '970458': { name: 'UOB Vietnam', short: 'UOB' },
  '970410': { name: 'Standard Chartered VN', short: 'SC' },
  '970439': { name: 'Public Bank VN', short: 'PB' },
});
