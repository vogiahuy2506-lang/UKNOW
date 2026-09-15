import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  ALLOWED_FORM_FONTS,
  ALLOWED_FORM_LAYOUTS,
  ALLOWED_FORM_BANNER_HEIGHTS,
} from '../formDefinition.util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_FORM_THEME_PATH = path.resolve(__dirname, '../../../../frontend/src/features/forms/constants/formTheme.js');

/**
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-4b "Bổ sung khi soạn lệnh PR-4b" — kiểm danh
 * sách font/layout/bannerHeight của backend khớp với frontend, mẫu
 * `vietQrBanks.spec.js:8` (test backend đọc CHỮ file frontend bằng regex, không import trực
 * tiếp module frontend vào backend). Lệch danh sách (thêm/bớt/gõ sai một font) thì trình soạn
 * cho chọn font backend từ chối (400 INVALID_FORM_THEME lúc lưu), hoặc ngược lại backend nhận
 * font trình soạn không cho chọn — đỏ ngay lần chạy test tiếp theo.
 */
describe('formTheme — so khớp ALLOWED_FORM_FONTS/LAYOUTS/BANNER_HEIGHTS với frontend/src/features/forms/constants/formTheme.js', () => {
  it('đọc được file frontend (đường dẫn monorepo đúng)', () => {
    expect(fs.existsSync(FRONTEND_FORM_THEME_PATH)).toBe(true);
  });

  it('danh sách font TRÙNG KHỚP HOÀN TOÀN (không thiếu, không thừa)', () => {
    const frontendSource = fs.readFileSync(FRONTEND_FORM_THEME_PATH, 'utf8');
    const arrayMatch = frontendSource.match(/ALLOWED_FORM_FONTS = Object\.freeze\(\[([\s\S]*?)\]\)/);
    expect(arrayMatch).toBeTruthy();
    const frontendFonts = [...arrayMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

    expect(frontendFonts.length).toBeGreaterThan(0);
    expect(ALLOWED_FORM_FONTS.length).toBeGreaterThan(0);

    const missingFromBackend = frontendFonts.filter((f) => !ALLOWED_FORM_FONTS.includes(f));
    const extraInBackend = ALLOWED_FORM_FONTS.filter((f) => !frontendFonts.includes(f));

    expect(missingFromBackend).toEqual([]);
    expect(extraInBackend).toEqual([]);
    expect(ALLOWED_FORM_FONTS.length).toBe(frontendFonts.length);
  });

  it('đúng 8 font (đo 15/09)', () => {
    expect(ALLOWED_FORM_FONTS.length).toBe(8);
  });

  it('layout ("card"/"wide") khớp frontend', () => {
    const frontendSource = fs.readFileSync(FRONTEND_FORM_THEME_PATH, 'utf8');
    const arrayMatch = frontendSource.match(/ALLOWED_FORM_LAYOUTS = Object\.freeze\(\[([\s\S]*?)\]\)/);
    expect(arrayMatch).toBeTruthy();
    const frontendLayouts = [...arrayMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(frontendLayouts.sort()).toEqual([...ALLOWED_FORM_LAYOUTS].sort());
  });

  it('bannerHeight (sm/md/lg) khớp frontend (đọc khoá của FORM_BANNER_HEIGHTS)', () => {
    const frontendSource = fs.readFileSync(FRONTEND_FORM_THEME_PATH, 'utf8');
    const objMatch = frontendSource.match(/FORM_BANNER_HEIGHTS = Object\.freeze\(\{([\s\S]*?)\}\)/);
    expect(objMatch).toBeTruthy();
    const frontendHeights = [...objMatch[1].matchAll(/^\s*(sm|md|lg):/gm)].map((m) => m[1]);
    expect(frontendHeights.sort()).toEqual([...ALLOWED_FORM_BANNER_HEIGHTS].sort());
  });
});
