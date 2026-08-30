#!/usr/bin/env node
/**
 * Script kiểm tra an toàn migration (Checkpoint B2 & B3).
 *
 * Kiểm tra 2 lớp bảo vệ:
 * 1. B2: Cấm sửa/xóa/đổi tên migration đã có trong repo (Append-only).
 * 2. B3: Chặn DDL phá vỡ tương thích ngược (DROP, RENAME, SET NOT NULL, CREATE INDEX CONCURRENTLY, ALTER TYPE).
 *
 * Usage:
 *   node scripts/checkMigrationSafety.js
 *   node scripts/checkMigrationSafety.js --base origin/main
 *   node scripts/checkMigrationSafety.js --all
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import {
  parseMigrationDiffEntries,
  checkMigrationSafety,
  lintMigrationSqlContent,
  findChecksumRolloutBoundaryViolation,
} from '../src/utils/migrationSafety.util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const MIGRATIONS_DIR = path.resolve(__dirname, '../migrations');
let comparedRange = null;

function getArgValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && idx < process.argv.length - 1) {
    return process.argv[idx + 1];
  }
  return null;
}

function runGit(cmd, { allowFail = false } = {}) {
  try {
    return execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    if (!allowFail) {
      console.error(`[check:migration-safety] Git command failed: ${cmd}`);
      console.error(err.stderr || err.message);
      throw err;
    }
    return null;
  }
}

function resolveRemoteBaseRef(branchName) {
  const branch = String(branchName || '').replace(/^origin\//, '');
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch)) {
    throw new Error(`Invalid migration safety base branch: ${branchName}`);
  }

  // Không dùng fallback im lặng ở đường CI này: nếu không xác định được base
  // thì guard phải fail đóng, thay vì chỉ so sánh HEAD~1 và bỏ sót migration
  // đã bị sửa ở commit trước của cùng branch.
  // Workflow checkout dùng fetch-depth: 0. Giữ full history của base để toán tử
  // `...` tìm đúng merge-base của branch manual, không bị shallow history làm sai range.
  runGit(`git fetch origin ${branch}`);
  const remoteRef = `origin/${branch}`;
  const baseSha = runGit(`git rev-parse --verify ${remoteRef}`);
  return { remoteRef, baseSha };
}

function getDiffOutput() {
  const customBase = getArgValue('--base');
  if (customBase) {
    console.log(`[check:migration-safety] So sánh với custom base: ${customBase}...HEAD`);
    comparedRange = `${customBase}...HEAD`;
    return runGit(`git diff --name-status ${comparedRange} -- backend/migrations/`);
  }

  // 1. Kiểm tra môi trường GitHub Actions
  const isPr = process.env.GITHUB_EVENT_NAME === 'pull_request';
  const baseRef = process.env.GITHUB_BASE_REF;
  if (isPr && baseRef) {
    const base = resolveRemoteBaseRef(baseRef);
    console.log(`[check:migration-safety] CI Pull Request: So sánh ${base.remoteRef}...HEAD`);
    comparedRange = `${base.baseSha}...HEAD`;
    return runGit(`git diff --name-status ${comparedRange} -- backend/migrations/`);
  }

  // workflow_dispatch có thể deploy một branch bất kỳ. HEAD~1 chỉ nhìn thấy
  // commit cuối và cho phép sửa migration ở commit trước rồi deploy ở commit
  // sau. Luôn so sánh toàn branch với main (hoặc base được workflow cấu hình).
  if (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
    const configuredBase = process.env.MIGRATION_SAFETY_BASE_REF || 'main';
    const dispatchRef = String(process.env.GITHUB_REF_NAME || '').replace(/^refs\/heads\//, '');
    const normalizedBaseRef = String(configuredBase).replace(/^origin\//, '');

    // Production workflow chỉ cho phép dispatch từ main. Với main, migration
    // changes đã đi qua workflow push/PR tại thời điểm được merge; không có
    // diff range đáng tin cậy để kiểm tra lại cả lịch sử ở một redeploy. Bỏ
    // qua diff guard tại đây để cho phép redeploy main, còn runtime checksum
    // vẫn xác minh toàn bộ migration trước khi container mới được khởi động.
    if (dispatchRef === normalizedBaseRef) {
      console.log(
        '[check:migration-safety] workflow_dispatch trên main: bỏ qua diff guard của redeploy; '
        + 'immutability đã được kiểm tra ở workflow push/PR gốc và runtime checksum vẫn bắt buộc.'
      );
      return '';
    }

    const base = resolveRemoteBaseRef(configuredBase);
    console.log(`[check:migration-safety] CI workflow_dispatch: So sánh ${base.remoteRef}...HEAD`);
    comparedRange = `${base.baseSha}...HEAD`;
    return runGit(`git diff --name-status ${comparedRange} -- backend/migrations/`);
  }

  const beforeSha = process.env.GITHUB_EVENT_BEFORE;
  if (beforeSha && beforeSha !== '0000000000000000000000000000000000000000') {
    console.log(`[check:migration-safety] CI Push: So sánh ${beforeSha.slice(0, 8)}...HEAD`);
    comparedRange = `${beforeSha}...HEAD`;
    return runGit(`git diff --name-status ${comparedRange} -- backend/migrations/`);
  }

  // 2. Môi trường local: Kiểm tra staged + unstaged changes
  const statusOut = runGit('git status --porcelain -- backend/migrations/', { allowFail: true });
  if (statusOut && statusOut.trim()) {
    console.log('[check:migration-safety] Local working tree: Phát hiện thay đổi chưa commit trong backend/migrations/');
    return statusOut;
  }

  // 3. Fallback commit gần nhất
  console.log('[check:migration-safety] So sánh commit gần nhất HEAD~1...HEAD');
  comparedRange = 'HEAD~1...HEAD';
  return runGit(`git diff --name-status ${comparedRange} -- backend/migrations/`, { allowFail: true }) || '';
}

function getMigrationRunnerDiff() {
  // Local working trees have no single commit range, but `HEAD` still includes
  // staged and unstaged edits. CI uses the same range as migration diff above.
  const range = comparedRange || 'HEAD';
  return runGit(
    `git diff --unified=0 ${range} -- backend/src/utils/migrationRunner.util.js`,
    { allowFail: true }
  ) || '';
}

console.log('[check:migration-safety] Đang kiểm tra tính an toàn của schema migrations...');

const checkAll = process.argv.includes('--all');

if (checkAll) {
  console.log('[check:migration-safety] Chế độ --all: Quét kiểm tra toàn bộ file trong migrations/ ...');
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  let hasViolation = false;

  for (const file of files) {
    const fullPath = path.join(MIGRATIONS_DIR, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    const lint = lintMigrationSqlContent(content, file);
    if (!lint.ok) {
      console.warn(`[check:migration-safety] File lịch sử ${file} có DDL cần chú ý:`);
      for (const v of lint.violations) {
        console.warn(`  - Dòng ${v.line}: [${v.rule}] ${v.snippet}`);
      }
      hasViolation = true;
    }
  }

  if (!hasViolation) {
    console.log('[check:migration-safety] OK — Toàn bộ migrations hợp lệ.');
  }
  process.exit(hasViolation ? 1 : 0);
}

let rawDiff = '';
try {
  rawDiff = getDiffOutput();
} catch (err) {
  console.error('[check:migration-safety] Lỗi khi lấy git diff:', err.message);
  process.exit(1);
}

const diffEntries = parseMigrationDiffEntries(rawDiff);

if (diffEntries.length === 0) {
  console.log('[check:migration-safety] Không có file migration nào thay đổi trong phạm vi diff. Bỏ qua.');
  process.exit(0);
}

console.log(`[check:migration-safety] Phát hiện ${diffEntries.length} file migration trong diff:`);
for (const e of diffEntries) {
  console.log(`  - [${e.status}] ${e.path}${e.oldPath ? ` (từ ${e.oldPath})` : ''}`);
}

const checksumBoundaryViolation = findChecksumRolloutBoundaryViolation(
  diffEntries,
  getMigrationRunnerDiff()
);
if (checksumBoundaryViolation) {
  console.error(`\n[check:migration-safety] ❌ ${checksumBoundaryViolation}`);
  process.exit(1);
}

const result = checkMigrationSafety({
  diffEntries,
  readFileFn: (relPath) => {
    const fullPath = path.resolve(REPO_ROOT, relPath);
    return fs.readFileSync(fullPath, 'utf8');
  },
});

if (result.annotatedFiles.length > 0) {
  console.log('\n[check:migration-safety] Các migration được gắn annotation cho phép:');
  for (const a of result.annotatedFiles) {
    console.log(`  - ${a.file} (Lý do: "${a.reason}")`);
  }
}

if (!result.ok) {
  console.error('\n===============================================================');
  console.error('❌ PHÁT HIỆN VI PHẠM AN TOÀN MIGRATION TRONG CI:');
  console.error('===============================================================');

  if (result.immutabilityFailures.length > 0) {
    console.error('\n1. VI PHẠM TÍNH BẤT BIẾN (IMMUTABILITY - B2):');
    for (const fail of result.immutabilityFailures) {
      console.error(`  ❌ ${fail}`);
    }
    console.error('  👉 Hướng dẫn: Không được sửa/xóa migration đã phát hành. Hãy tạo file migration mới với số prefix kế tiếp.');
  }

  if (result.ddlViolations.length > 0) {
    console.error('\n2. VI PHẠM DDL PHÁ VỠ TƯƠNG THÍCH NGƯỢC (DESTRUCTIVE DDL - B3):');
    for (const v of result.ddlViolations) {
      console.error(`  ❌ ${v.file}:${v.line} [${v.rule}]`);
      console.error(`     Code: ${v.snippet}`);
      console.error(`     Chi tiết: ${v.message}`);
    }
    console.error('\n  👉 Hướng dẫn khắc phục:');
    console.error('     - Với DROP / RENAME: Áp dụng quy trình 3 bước (expand -> deploy/backfill -> contract).');
    console.error('     - Với CREATE INDEX CONCURRENTLY: Đổi sang CREATE INDEX thông thường vì runner chạy trong transaction block.');
    console.error('     - Nếu migration có chủ ý nghiệp vụ đặc biệt đã được review, thêm annotation ở đầu file:');
    console.error('       -- allow-destructive-ddl: <giải thích lý do an toàn>');
  }

  console.error('===============================================================\n');
  process.exit(1);
}

console.log('[check:migration-safety] ✅ OK — Toàn bộ migration thay đổi đều tuân thủ Immutability và Destructive DDL guard.');
process.exit(0);
