import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Không lời gọi AI nào được ghim cứng tên model: `model: 'gemini-…'`.
 *
 * Model do super admin chọn trong danh mục ai_models (tự đồng bộ với Google mỗi đêm 02:15), lấy ra
 * qua aiModelPolicy.resolveAllowedModel. Một lời gọi ghim tên thì vừa KHÔNG nghe theo admin, vừa gãy
 * riêng một mình ngày Google khai tử model đó — như đã xảy ra với gemini-2.0-flash (ngừng liệt kê từ
 * 10/08/2026) mà tên nó vẫn nằm trong mã.
 *
 * Bắt được thật 24/09/2026: fileExtractor.util.js ghim 'gemini-2.5-flash' ở cả hai lời gọi đọc PDF
 * và ảnh cho kho kiến thức chatbot, trong khi model hệ thống đã là gemini-3.5-flash.
 *
 * Phạm vi có chủ đích: chỉ bắt dạng `model: '<tên>'` truyền thẳng vào lời gọi. Dạng dự phòng
 * `|| 'gemini-…'` (28 chỗ, 16 file) nằm ngoài phép quét này — nhiều chỗ là đối số resolveAllowedModel
 * vốn bỏ qua; gom chúng về một cửa là việc của plan model dự phòng.
 */
const THU_MUC_SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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

const GHIM_TEN = /\bmodel\s*:\s*['"`]gemini-[^'"`]*['"`]/g;

describe('lời gọi AI không ghim cứng tên model', () => {
  it('không file nào truyền thẳng `model: \'gemini-…\'`', () => {
    const dinh = [];
    for (const duong of liet_ke_file(THU_MUC_SRC)) {
      const noiDung = fs.readFileSync(duong, 'utf8');
      for (const khop of noiDung.matchAll(GHIM_TEN)) {
        const dong = noiDung.slice(0, khop.index).split('\n').length;
        dinh.push(`${path.relative(THU_MUC_SRC, duong).split(path.sep).join('/')}:${dong}  ${khop[0]}`);
      }
    }
    expect(dinh).toEqual([]);
  });

  it('phép quét thật sự bắt được dạng ghim tên (tự kiểm trên một mẩu mã giả)', () => {
    const mau = "await generateGeminiContent({ parts, model: 'gemini-2.5-flash', temperature: 0.1 });";
    expect(mau.match(GHIM_TEN)).toHaveLength(1);
  });

  it('phép quét đọc được mã nguồn thật (quét ra hơn 200 file .js)', () => {
    expect(liet_ke_file(THU_MUC_SRC).length).toBeGreaterThan(200);
  });
});
