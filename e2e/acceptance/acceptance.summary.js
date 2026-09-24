/**
 * globalTeardown — in bảng tổng kết report.json sau mỗi lượt chạy nghiệm thu.
 *
 * Vì sao cần: một số bước ghi `khong_dat` vào report.json mà KHÔNG làm test đỏ (chạy nối tiếp,
 * một test đỏ sẽ bỏ luôn các bước sau — ví dụ N7 hỏng vì lỗ sản phẩm thì N3/N5 vẫn phải chạy).
 * Nên dòng "13 passed" của Playwright không có nghĩa là 13 bước đạt — người vận hành phải
 * nhìn bảng này.
 */
import fs from 'node:fs';
import path from 'node:path';

export default async function acceptanceSummary() {
  const runDir = process.env.ACCEPTANCE_RUN_DIR;
  const reportPath = runDir ? path.join(runDir, 'report.json') : null;
  if (!reportPath || !fs.existsSync(reportPath)) {
    console.log('\n[Tổng kết nghiệm thu] Không có report.json — lượt chạy chưa ghi được bước nào.');
    return;
  }

  let entries = [];
  try {
    entries = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  } catch (err) {
    console.log(`\n[Tổng kết nghiệm thu] Không đọc được report.json: ${err.message}`);
    return;
  }

  const counts = {};
  for (const e of entries) counts[e.ketQua] = (counts[e.ketQua] || 0) + 1;

  console.log('\n══════════ TỔNG KẾT NGHIỆM THU (đọc cái này, không phải "passed") ══════════');
  console.log(`Kết quả: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' · ')}`);
  for (const e of entries.filter((x) => x.ketQua !== 'dat')) {
    console.log(`  [${e.ketQua}] ${e.kichBan} ${e.buoc}${e.lyDo ? ` — ${e.lyDo}` : ''}`);
  }
  console.log(`Chi tiết + ảnh: ${runDir}`);
  console.log('═══════════════════════════════════════════════════════════════════════════\n');
}
