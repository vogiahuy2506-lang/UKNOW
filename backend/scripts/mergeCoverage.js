/**
 * Gộp coverage-final.json từ 2 lần chạy Jest riêng (unit + integration) thành
 * báo cáo coverage/ duy nhất — dùng vì test:coverage chạy 2 tiến trình Node
 * tách biệt (tránh OOM khi dồn ~200 suite vào 1 process --runInBand), nên
 * Jest không tự gộp coverage giữa 2 lần chạy được.
 *
 * Usage: node scripts/mergeCoverage.js
 */
import fs from 'node:fs';
import path from 'node:path';
import libCoverage from 'istanbul-lib-coverage';
import libReport from 'istanbul-lib-report';
import reports from 'istanbul-reports';

const ROOT = process.cwd();
const PARTS = ['coverage/unit/coverage-final.json', 'coverage/integration/coverage-final.json'];
const OUT_DIR = path.join(ROOT, 'coverage');

const map = libCoverage.createCoverageMap({});
let loaded = 0;

for (const rel of PARTS) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    console.warn(`[mergeCoverage] Thiếu ${rel} — bỏ qua (có thể phần đó không có test nào chạy)`);
    continue;
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  map.merge(data);
  loaded += 1;
}

if (loaded === 0) {
  console.error('[mergeCoverage] Không tìm thấy coverage-final.json nào — kiểm tra lại test:coverage:unit / :integration');
  process.exit(1);
}

const context = libReport.createContext({
  dir: OUT_DIR,
  coverageMap: map,
});

for (const reporter of ['text-summary', 'lcov', 'html', 'json-summary']) {
  reports.create(reporter).execute(context);
}

console.log(`[mergeCoverage] Đã gộp ${loaded}/${PARTS.length} phần → ${path.join('coverage', 'coverage-summary.json')}`);
