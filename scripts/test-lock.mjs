#!/usr/bin/env node
// Khoa test toan may: moi luot test nang tren cung may xep hang qua mot khoa.
// Cach dung: node scripts/test-lock.mjs <lenh> [tham so...]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const SIGNALS = { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 };
const RETRY_MS = 2000;
const REPORT_MS = 30000;
const STALE_AGE_MS = 3 * 60 * 60 * 1000;
const NO_OWNER_GRACE_MS = 30 * 1000;

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error('Cach dung: node scripts/test-lock.mjs <lenh> [tham so...]');
  process.exit(2);
}

// Khong dung os.tmpdir(): duong dan phai co dinh de moi phien dung chung khoa.
const lockDir = process.env.UKNOW_TEST_LOCK_DIR || '/tmp/uknow-test-lock';
const ownerFile = path.join(lockDir, 'owner.json');
const commandLine = [cmd, ...args].join(' ').slice(0, 200);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

function readOwner() {
  try {
    return JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
  } catch {
    return null;
  }
}

function removeLockDir() {
  fs.rmSync(lockDir, { recursive: true, force: true });
}

// Tra ve true neu khoa la mo coi (da xoa), false neu dang co nguoi giu.
function reclaimIfStale() {
  const owner = readOwner();
  if (owner && typeof owner === 'object') {
    const started = Date.parse(owner.startedAt);
    const tooOld = Number.isFinite(started) && Date.now() - started > STALE_AGE_MS;
    if (!pidAlive(owner.pid) || tooOld) {
      // Doc lai ngay truoc khi xoa: neu mot luot khac vua lay lai khoa mo coi va gianh khoa moi
      // trong luc minh dang xet, owner da doi — dung xoa khoa moi cua ho (review 29/09).
      const current = readOwner();
      if (!current || current.pid !== owner.pid || current.startedAt !== owner.startedAt) return false;
      removeLockDir();
      return true;
    }
    return false;
  }
  try {
    const age = Date.now() - fs.statSync(lockDir).mtimeMs;
    if (age > NO_OWNER_GRACE_MS) {
      removeLockDir();
      return true;
    }
  } catch {
    return true; // thu muc vua bi nguoi khac xoa
  }
  return false;
}

function tryAcquire() {
  try {
    fs.mkdirSync(path.dirname(lockDir), { recursive: true });
    fs.mkdirSync(lockDir);
  } catch (err) {
    if (err.code === 'EEXIST') return false;
    throw err;
  }
  fs.writeFileSync(
    ownerFile,
    JSON.stringify({
      pid: process.pid,
      command: commandLine,
      cwd: process.cwd(),
      startedAt: new Date().toISOString(),
      host: os.hostname(),
    })
  );
  return true;
}

function release() {
  const owner = readOwner();
  if (owner && owner.pid === process.pid) removeLockDir();
}

function describeOwner() {
  const owner = readOwner();
  if (!owner) return '(chưa rõ người giữ)';
  const since = new Date(owner.startedAt);
  const hhmmss = Number.isNaN(since.getTime()) ? '?' : since.toTimeString().slice(0, 8);
  return `${owner.command} (pid ${owner.pid}, từ ${hhmmss}, ${owner.cwd})`;
}

async function acquire() {
  const timeoutMs = Number(process.env.UKNOW_TEST_LOCK_TIMEOUT_MS) || 0;
  const waitStart = Date.now();
  let lastReport = 0;
  for (;;) {
    if (tryAcquire()) return true;
    if (reclaimIfStale()) continue;
    const waited = Date.now() - waitStart;
    if (timeoutMs > 0 && waited >= timeoutMs) {
      console.error(
        `[test-lock] Hết thời gian chờ khoá test (${Math.round(waited / 1000)}s): ${describeOwner()}`
      );
      return false;
    }
    if (lastReport === 0 || Date.now() - lastReport >= REPORT_MS) {
      lastReport = Date.now();
      console.error(
        `[test-lock] Đang chờ khoá test: ${describeOwner()} — đã chờ ${Math.round(waited / 1000)}s`
      );
    }
    await sleep(RETRY_MS);
  }
}

function run() {
  return new Promise((resolve) => {
    // Khong shell:true de giu nguyen tham so co khoang trang.
    const child = spawn(cmd, args, { stdio: 'inherit', env: process.env });
    const forwarders = Object.keys(SIGNALS).map((sig) => {
      const handler = () => {
        try {
          child.kill(sig);
        } catch {
          /* con da thoat */
        }
      };
      process.on(sig, handler);
      return [sig, handler];
    });
    const finish = (code) => {
      for (const [sig, handler] of forwarders) process.off(sig, handler);
      resolve(code);
    };
    child.on('error', (err) => {
      console.error(`[test-lock] Không chạy được lệnh "${cmd}": ${err.message}`);
      finish(127);
    });
    child.on('exit', (code, signal) => {
      if (signal) finish(128 + (SIGNALS[signal] || os.constants.signals[signal] || 0));
      else finish(code ?? 1);
    });
  });
}

const bypass = process.env.CI === 'true' || process.env.UKNOW_TEST_LOCK === 'off';

if (bypass) {
  process.exit(await run());
}

if (!(await acquire())) process.exit(75);
let code = 1;
try {
  code = await run();
} finally {
  release();
}
process.exit(code);
