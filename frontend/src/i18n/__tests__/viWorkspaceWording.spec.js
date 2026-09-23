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

describe('từ điển tiếng Việt', () => {
  it('không câu nào còn chữ "workspace"', () => {
    const dinh = thuThapChuoi(vi)
      .filter(({ chuoi }) => /workspace/i.test(chuoi))
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
