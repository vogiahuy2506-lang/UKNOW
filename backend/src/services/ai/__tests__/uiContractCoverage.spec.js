/**
 * Test GIAO KÈO giữa hai nửa của một tính năng.
 *
 * Mỗi cổng wizard có hai nửa:
 *   - Nửa TRƯỚC: thêm một lựa chọn cho người dùng. Bấm là thấy ngay.
 *   - Nửa SAU:  bộ sinh chiến dịch / bộ đọc file phải biết làm gì với giá trị đó.
 *               Chỉ lộ ra khi chạy hết một chiến dịch thật.
 *
 * Không dòng code nào buộc hai nửa đi cùng nhau. Nên nửa trước xong là trông như "đã xong",
 * còn nửa sau nằm im chờ người dùng vấp phải. Đã xảy ra HAI lần liên tiếp:
 *
 *   - 24/08/2026 — ô chọn tệp nhận `.xls` (`accept=".xls"`), nhưng fileParser không có nhánh
 *     nào cho `.xls`; tệp rơi xuống `buffer.toString('utf-8')` thành rác nhị phân, AI không
 *     đọc được cột tên/email nào.
 *   - 25/08/2026 — wizard mời chọn "Danh bạ Zalo" (`dataSource='zalo_contacts'`), nhưng prompt
 *     sinh chiến dịch không có luật nào cho giá trị đó (`grep -c` → 0). LLM rơi về
 *     `interested_customers`, chiến dịch lấy nhầm khách trong database và thiếu luôn node
 *     "Chọn tài khoản Zalo" nên không chạy được.
 *
 * Test này kiểm TĨNH: mọi giá trị UI có thể phát ra đều phải được nhắc tới ở nửa sau. Nó không
 * chứng minh nửa sau xử lý ĐÚNG — nhưng bắt được đúng cái đã hỏng hai lần: nửa sau **không hề
 * biết** giá trị đó tồn tại. Thêm lựa chọn mới mà quên → đỏ lúc commit, không đợi tới lúc demo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from '@jest/globals';
import {
  buildDataSourceQuestion,
  buildChannelQuestion,
  buildCampaignBriefQuestion,
} from '../aiCampaignWizard.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_SRC = path.resolve(__dirname, '..', '..', '..');
const REPO_ROOT = path.resolve(BACKEND_SRC, '..', '..');

const readSource = (relativeToRepoRoot) => {
  const full = path.resolve(REPO_ROOT, relativeToRepoRoot);
  if (!fs.existsSync(full)) {
    throw new Error(
      `Không tìm thấy ${relativeToRepoRoot}. File đã đổi chỗ? Cập nhật đường dẫn trong test giao kèo này.`
    );
  }
  return fs.readFileSync(full, 'utf8');
};

/** Gom mọi value của một câu hỏi wizard (đã tính các nhánh tuỳ ngữ cảnh). */
const optionValues = (question) => (question?.data?.questions || [])
  .flatMap((q) => (q.options || []).map((opt) => opt.value))
  .filter(Boolean);

describe('giao kèo UI ↔ nửa sau — mọi lựa chọn phải có nơi xử lý', () => {
  /**
   * `zalo_contacts` chỉ hiện khi kênh là Zalo cá nhân, nên phải hỏi cả hai ngữ cảnh mới gom đủ.
   */
  const allDataSourceValues = [...new Set([
    ...optionValues(buildDataSourceQuestion('vi', { channel: 'email' })),
    ...optionValues(buildDataSourceQuestion('vi', { channel: 'zalo' })),
    ...optionValues(buildDataSourceQuestion('vi', { channel: 'zalo_group' })),
    ...optionValues(buildDataSourceQuestion('en', { channel: 'zalo' })),
  ])];

  it('mọi nguồn người nhận đều được bộ sinh chiến dịch nhắc tới', () => {
    const generator = readSource('backend/src/services/ai/aiCampaign.service.js');
    const missing = allDataSourceValues.filter((value) => !generator.includes(value));

    expect({
      missing,
      hint: missing.length
        ? `Wizard mời người dùng chọn [${missing.join(', ')}] nhưng aiCampaign.service.js không nhắc `
          + 'tới giá trị đó. LLM sẽ không có luật nào khớp và rơi về nhánh gần nhất — chiến dịch sinh ra '
          + 'sẽ lấy sai nguồn người nhận. Thêm luật cho giá trị này, hoặc bỏ lựa chọn khỏi wizard.'
        : '',
    }).toEqual({ missing: [], hint: '' });
  });

  it('đã gom đủ nguồn, kể cả nhánh chỉ hiện với kênh Zalo', () => {
    // Chốt lại để nếu ai xoá nhánh gom ngữ cảnh ở trên thì test kia không xanh giả.
    expect(allDataSourceValues).toEqual(
      expect.arrayContaining(['db', 'sheet', 'landing', 'manual', 'zalo_contacts'])
    );
  });

  it('mọi kênh gửi đều được bộ sinh chiến dịch nhắc tới', () => {
    const generator = readSource('backend/src/services/ai/aiCampaign.service.js');
    const missing = optionValues(buildChannelQuestion('vi')).filter((v) => !generator.includes(v));

    expect({ missing }).toEqual({ missing: [] });
  });

  it('mọi kiểu nội dung đều được bộ dựng ngữ cảnh brief xử lý', () => {
    const brief = readSource('backend/src/services/ai/campaignBrief.service.js');
    const courses = [{ id: 1, name: 'Khoá A' }, { id: 2, name: 'Khoá B' }];
    const missing = optionValues(buildCampaignBriefQuestion(courses, 'vi'))
      .filter((v) => !brief.includes(v));

    expect({
      missing,
      hint: missing.length
        ? `Wizard mời chọn [${missing.join(', ')}] nhưng campaignBrief.service.js không xử lý — `
          + 'nội dung chiến dịch sẽ không có grounding đúng.'
        : '',
    }).toEqual({ missing: [], hint: '' });
  });

  /**
   * Nửa trước ở frontend, nửa sau ở backend. Đọc chéo repo là cố ý: đó chính là chỗ giao kèo bị
   * đứt hôm 24/08, và không có nơi nào khác kiểm được.
   */
  it('mọi đuôi tệp ô chọn tệp nhận đều có nhánh trong bộ đọc tệp', () => {
    const chatUi = readSource('frontend/src/features/ai/AiChatbot.jsx');
    const acceptMatch = chatUi.match(/accept="([^"]+)"/);
    // Không tìm thấy accept="..." nghĩa là ô chọn tệp đã đổi hình dạng — test này mù từ đó,
    // nên phải đỏ chứ không được im lặng bỏ qua.
    expect({ timThayAccept: Boolean(acceptMatch) }).toEqual({ timThayAccept: true });

    const accepted = acceptMatch[1]
      .split(',')
      .map((ext) => ext.trim().toLowerCase())
      .filter((ext) => ext.startsWith('.'));

    const parser = readSource('backend/src/utils/fileParser.util.js');
    const missing = accepted.filter((ext) => !parser.includes(`'${ext}'`));

    expect({
      accepted,
      missing,
      hint: missing.length
        ? `Ô chọn tệp nhận [${missing.join(', ')}] nhưng fileParser.util.js không có nhánh nào. `
          + 'Tệp sẽ rơi xuống nhánh mặc định và biến thành rác nhị phân đi vào prompt AI — đúng lỗi '
          + '.xls ngày 24/08. Thêm nhánh đọc, hoặc bỏ đuôi này khỏi accept.'
        : '',
    }).toEqual({ accepted, missing: [], hint: '' });
  });
});
