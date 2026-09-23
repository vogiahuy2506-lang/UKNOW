import { describe, expect, it } from 'vitest';
import vi from '../vi.js';

/**
 * Bản tiếng Việt không được nói "workspace".
 *
 * Từ sản phẩm dùng thống nhất là "không gian của {tên công ty}" (workspaceInvite,
 * workspaceNoPermissions, workspaceNoAiAssistant), và gọi bên kia là "công ty". Nhưng chữ
 * "workspace" vẫn lọt vào ba màn hình khác nhau, mỗi lần một người viết, không ai thấy vì chúng
 * nằm rải rác:
 *   - trang "chưa có gói" (NoPlanScreen) — tệ nhất, vì trang này không được import vào đâu suốt
 *     nhiều tháng nên KHÔNG AI ĐỌC, mãi tới 23/09/2026 mới nối vào ứng dụng;
 *   - màn "không có quyền" (UnauthorizedScreen);
 *   - hộp xác nhận duyệt chiến dịch.
 *
 * Vá từng câu thì lần sau lại lọt câu khác. Nên quét cả từ điển một lượt.
 *
 * Chỉ soi GIÁ TRỊ hiển thị, không soi tên khoá: `enterWorkspace`, `workspaceInvite`… là mã, người
 * dùng không đọc, đổi tên khoá là việc khác và không đáng kéo theo.
 */
const thuThapChuoi = (node, duong = '', ra = []) => {
  if (typeof node === 'string') {
    ra.push({ duong, chuoi: node });
    return ra;
  }
  if (node && typeof node === 'object') {
    for (const [khoa, con] of Object.entries(node)) {
      thuThapChuoi(con, duong ? `${duong}.${khoa}` : khoa, ra);
    }
  }
  return ra;
};

/**
 * "team" cũng bị sếp gạt cùng lý do, 23/09. Nhưng chữ này KHÁC "workspace" ở một chỗ: nó còn là TÊN
 * GÓI khách đang mua ("Gói Team", preset Team trong trang quản trị gói). Tên sản phẩm thì không
 * dịch — đổi nó là đổi thứ khách nhìn thấy trên hoá đơn. Nên tha theo ĐƯỜNG DẪN KHOÁ, tường minh
 * từng cái, chứ không tha theo kiểu "bỏ qua nếu viết hoa" (rồi câu thường lọt lại).
 */
const THA_TEAM = [
  'pricing.planNames.team',          // tên gói bán cho khách
  'adminPlans.presetDescription',    // liệt kê tên các gói: Trial, Basic, Pro, Team
];

/**
 * Cả khối `aboutPage` (57 khoá) trong vi.js GIỐNG HỆT bản tiếng Anh — chưa dịch dòng nào. Nhưng nó
 * là KHOÁ CHẾT: không component nào, không route nào, không `useI18n('aboutPage')` nào gọi tới
 * (đo 23/09/2026: 0 nơi tham chiếu ngoài chính hai file từ điển). Không ai đọc nên không phải lỗi
 * hiển thị, và dịch 57 câu quảng cáo cho một trang không tồn tại là công vô ích.
 * Việc đúng là XOÁ cả khối ở vi.js lẫn en.js — để sếp quyết, nên tạm tha ở đây.
 * Khi xoá xong thì bỏ luôn ngoại lệ này; danh sách chỉ được phép ngắn đi.
 */
const THA_NHANH_KHOA_CHET = (duong) => duong.startsWith('aboutPage.');

describe('từ điển tiếng Việt', () => {
  it('không câu nào còn chữ "workspace"', () => {
    const dinh = thuThapChuoi(vi)
      .filter(({ chuoi }) => /workspace/i.test(chuoi))
      .map(({ duong, chuoi }) => `${duong}: ${chuoi}`);

    expect(dinh).toEqual([]);
  });

  it('không câu nào còn chữ "team" (trừ tên gói)', () => {
    const dinh = thuThapChuoi(vi)
      .filter(({ duong, chuoi }) => /\bteam\b/i.test(chuoi)
        && !THA_TEAM.includes(duong)
        && !THA_NHANH_KHOA_CHET(duong))
      .map(({ duong, chuoi }) => `${duong}: ${chuoi}`);

    expect(dinh).toEqual([]);
  });

  it('phép quét này thật sự nhìn vào giá trị (tự kiểm: cắm một câu bẩn thì bắt được)', () => {
    const ban = thuThapChuoi({ a: { b: 'Vào workspace của bạn' } })
      .filter(({ chuoi }) => /workspace/i.test(chuoi));

    expect(ban).toHaveLength(1);
    expect(ban[0].duong).toBe('a.b');
  });
});
