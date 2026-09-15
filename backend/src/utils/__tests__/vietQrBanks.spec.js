import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { VIETQR_BANKS } from '../../constants/vietQrBanks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_BIN_MAP_PATH = path.resolve(__dirname, '../../../../frontend/src/utils/payosBankBinMap.js');

/**
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-3a phản biện mục "Danh sách BIN".
 *
 * `constants/vietQrBanks.js` là bản CHÉP thủ công của `frontend/src/utils/payosBankBinMap.js` —
 * không có cách chia sẻ trực tiếp giữa hai gói (xem ghi chú trong file backend). Test này đọc
 * CHỮ file frontend bằng regex (không import trực tiếp file .js của gói khác vào assertion logic
 * phức tạp — chỉ cần tập hợp mã BIN 6 số) để so khớp — lệch tập BIN (thêm/bớt/gõ sai một mã) thì
 * đỏ ngay lần chạy test tiếp theo, không đợi phát hiện thủ công khi khách chọn nhầm ngân hàng.
 */
describe('vietQrBanks — so khớp BIN với frontend/src/utils/payosBankBinMap.js', () => {
  it('đọc được file frontend (đường dẫn monorepo đúng)', () => {
    expect(fs.existsSync(FRONTEND_BIN_MAP_PATH)).toBe(true);
  });

  it('tập hợp mã BIN 6 số của backend TRÙNG KHỚP HOÀN TOÀN với frontend (không thiếu, không thừa)', () => {
    const frontendSource = fs.readFileSync(FRONTEND_BIN_MAP_PATH, 'utf8');
    const frontendBins = new Set(
      [...frontendSource.matchAll(/'(\d{6})':\s*\{/g)].map((m) => m[1])
    );
    const backendBins = new Set(Object.keys(VIETQR_BANKS));

    expect(frontendBins.size).toBeGreaterThan(0);
    expect(backendBins.size).toBeGreaterThan(0);

    const missingFromBackend = [...frontendBins].filter((bin) => !backendBins.has(bin));
    const extraInBackend = [...backendBins].filter((bin) => !frontendBins.has(bin));

    expect(missingFromBackend).toEqual([]);
    expect(extraInBackend).toEqual([]);
    expect(backendBins.size).toBe(frontendBins.size);
  });

  it('39 ngân hàng (đo 15/09 — chú thích đầu file frontend "top 25" đã cũ, thật ra là 39)', () => {
    expect(Object.keys(VIETQR_BANKS).length).toBe(39);
  });

  it('mỗi entry có name và short không rỗng', () => {
    for (const [bin, info] of Object.entries(VIETQR_BANKS)) {
      expect(bin).toMatch(/^\d{6}$/);
      expect(String(info.name || '').trim().length).toBeGreaterThan(0);
      expect(String(info.short || '').trim().length).toBeGreaterThan(0);
    }
  });
});
