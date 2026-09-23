import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Câu tiếng Việt trả về cho người dùng không được lẫn chữ "workspace".
 *
 * Sếp chốt 23/09/2026: "workspace với nhiều người không biết tiếng Anh sẽ mơ hồ". Lúc rà thì có 34
 * câu như vậy nằm rải rác 19 file — và KHÔNG MỘT CA KIỂM NÀO ghim bất kỳ câu nào trong số đó, nên
 * chúng cứ thế trôi ra production suốt nhiều tháng.
 *
 * Vá từng câu là cách thua: chính tôi đã sót 4 câu ở lượt trước chỉ vì `grep` chữ thường nên không
 * thấy "Workspace" viết HOA. Nên thay bằng một phép quét mã nguồn, cùng khuôn với
 * `attachmentOwnerFilterCallSites.spec.js`: thêm câu mới có chữ đó là đỏ ngay, không phải chờ ai
 * rà tay lần sau.
 *
 * Từ thay thế đã dùng: "workspace" → "không gian làm việc"; "chủ workspace" → "chủ tài khoản".
 *
 * Phạm vi quét có chủ đích:
 * - CHỈ chuỗi có dấu tiếng Việt. Định danh trong mã (`workspace_owner_id`, `getWorkspaceContext`,
 *   `COALESCE(workspace_owner_id, id_user)`…) là mã, người dùng không đọc, đổi chúng là việc khác
 *   và sẽ kéo theo cả nghìn dòng vô nghĩa.
 * - Bỏ qua dòng chú thích: tài liệu cho lập trình viên, không phải chữ hiển thị.
 * - Bỏ qua lời gọi `console.*` nằm GỌN trong một dòng: log máy chủ.
 *
 * NGOẠI LỆ được tha, và CHỈ được phép ngắn đi:
 * - `services/help/planAdvisor.service.js` — chuỗi này nằm trong PROMPT gửi cho mô hình AI, không
 *   phải câu trả về cho người dùng. Mô hình đọc nó, người dùng không thấy.
 * - `utils/scheduler.js` — log `console.warn` nhưng chuỗi nằm ở dòng nối tiếp nên phép lọc theo
 *   dòng không bắt được. Vẫn là log máy chủ.
 */
const THU_MUC_SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const NGOAI_LE = [
  'services/help/planAdvisor.service.js',
  'utils/scheduler.js',
];

const CO_DAU_TIENG_VIET = /[À-ɏẠ-ỹ]/;

const liet_ke_file = (thuMuc, ra = []) => {
  for (const muc of fs.readdirSync(thuMuc, { withFileTypes: true })) {
    const duong = path.join(thuMuc, muc.name);
    if (muc.isDirectory()) {
      if (muc.name !== '__tests__') liet_ke_file(duong, ra);
    } else if (muc.name.endsWith('.js')) {
      ra.push(duong);
    }
  }
  return ra;
};

const tim_cau_lan_tieng_anh = () => {
  const dinh = [];
  for (const duong of liet_ke_file(THU_MUC_SRC)) {
    const tuongDoi = path.relative(THU_MUC_SRC, duong).split(path.sep).join('/');
    if (NGOAI_LE.includes(tuongDoi)) continue;

    fs.readFileSync(duong, 'utf8').split(/\r?\n/).forEach((dong, i) => {
      if (!/workspace/i.test(dong)) return;
      if (/^\s*(\/\/|\*|\/\*)/.test(dong)) return;
      if (/console\.(log|warn|error|info|debug)/.test(dong)) return;

      for (const khop of dong.matchAll(/(['"`])((?:(?!\1).)*)\1/g)) {
        const chuoi = khop[2];
        if (/workspace/i.test(chuoi) && CO_DAU_TIENG_VIET.test(chuoi)) {
          dinh.push(`${tuongDoi}:${i + 1}  ${chuoi}`);
        }
      }
    });
  }
  return dinh;
};

describe('câu tiếng Việt trả cho người dùng', () => {
  it('không câu nào còn chữ "workspace"', () => {
    expect(tim_cau_lan_tieng_anh()).toEqual([]);
  });

  it('phép quét thật sự đọc được mã nguồn (tự kiểm: quét ra ít nhất vài trăm file .js)', () => {
    // Không có ca này thì một lỗi đường dẫn làm hàm quét trả [] và ca trên xanh rỗng — đúng kiểu
    // "test xanh vì không đo gì" mà repo này đã dính vài lần.
    expect(liet_ke_file(THU_MUC_SRC).length).toBeGreaterThan(200);
  });
});
