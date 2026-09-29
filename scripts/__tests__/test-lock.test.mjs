import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'test-lock.mjs');

function makeLockDir() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'uknow-lock-test-'));
  return { base, lockDir: path.join(base, 'lock') };
}

// Moi ca dung UKNOW_TEST_LOCK_DIR rieng; CI bi xoa tru khi ca tu dat.
function runWrapper(lockDir, cmdArgs, extraEnv = {}) {
  const env = { ...process.env, UKNOW_TEST_LOCK_DIR: lockDir };
  delete env.CI;
  delete env.UKNOW_TEST_LOCK;
  delete env.UKNOW_TEST_LOCK_TIMEOUT_MS;
  Object.assign(env, extraEnv);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, ...cmdArgs], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

const nodeCmd = (script, ...rest) => [process.execPath, '-e', script, ...rest];

function writeOwner(lockDir, pid) {
  fs.mkdirSync(lockDir);
  const ownerPath = path.join(lockDir, 'owner.json');
  fs.writeFileSync(
    ownerPath,
    JSON.stringify({ pid, command: 'x', cwd: '/', startedAt: new Date().toISOString(), host: 'h' })
  );
  return ownerPath;
}

test('a) hai wrapper cung luc: hai khoang chay khong giao nhau', async () => {
  const { base, lockDir } = makeLockDir();
  const log = path.join(base, 'log.txt');
  const script = `
    const fs = require('fs');
    fs.appendFileSync(${JSON.stringify(log)}, 'start ' + Date.now() + '\\n');
    setTimeout(() => { fs.appendFileSync(${JSON.stringify(log)}, 'end ' + Date.now() + '\\n'); }, 1500);
  `;
  const [r1, r2] = await Promise.all([
    runWrapper(lockDir, nodeCmd(script)),
    runWrapper(lockDir, nodeCmd(script)),
  ]);
  assert.equal(r1.code, 0);
  assert.equal(r2.code, 0);
  const lines = fs
    .readFileSync(log, 'utf8')
    .trim()
    .split('\n')
    .map((l) => l.split(' '));
  assert.equal(lines.length, 4);
  assert.equal(lines.map((l) => l[0]).join(','), 'start,end,start,end', 'hai khoang phai noi duoi nhau');
  assert.ok(Number(lines[1][1]) <= Number(lines[2][1]));
});

test('b) lenh thoat ma 3: wrapper thoat 3 va khoa duoc nha', async () => {
  const { lockDir } = makeLockDir();
  const r = await runWrapper(lockDir, nodeCmd('process.exit(3)'));
  assert.equal(r.code, 3);
  assert.equal(fs.existsSync(lockDir), false);
});

test('c) khoa mo coi (pid 999999): gianh duoc ngay, lenh chay', async () => {
  const { base, lockDir } = makeLockDir();
  writeOwner(lockDir, 999999);
  const marker = path.join(base, 'ran.txt');
  const r = await runWrapper(lockDir, nodeCmd(`require('fs').writeFileSync(${JSON.stringify(marker)}, '1')`), {
    UKNOW_TEST_LOCK_TIMEOUT_MS: '5000',
  });
  assert.equal(r.code, 0);
  assert.equal(fs.existsSync(marker), true);
});

test('d) CI=true: bo qua khoa dang bi giu boi pid con song', async () => {
  const { base, lockDir } = makeLockDir();
  writeOwner(lockDir, process.pid);
  const marker = path.join(base, 'ran.txt');
  const r = await runWrapper(lockDir, nodeCmd(`require('fs').writeFileSync(${JSON.stringify(marker)}, '1')`), {
    CI: 'true',
    UKNOW_TEST_LOCK_TIMEOUT_MS: '3000',
  });
  assert.equal(r.code, 0);
  assert.equal(fs.existsSync(marker), true);
});

test('e) khoa bi giu boi pid con song + timeout: thoat 75, lenh khong chay, khoa con nguyen', async () => {
  const { base, lockDir } = makeLockDir();
  const ownerPath = writeOwner(lockDir, process.pid);
  const marker = path.join(base, 'ran.txt');
  const r = await runWrapper(lockDir, nodeCmd(`require('fs').writeFileSync(${JSON.stringify(marker)}, '1')`), {
    UKNOW_TEST_LOCK_TIMEOUT_MS: '3000',
  });
  assert.equal(r.code, 75);
  assert.equal(fs.existsSync(marker), false);
  assert.equal(fs.existsSync(ownerPath), true, 'khoa cua nguoi kia phai con nguyen');
  assert.equal(JSON.parse(fs.readFileSync(ownerPath, 'utf8')).pid, process.pid);
});

test('f) tham so co khoang trang duoc giu nguyen la mot tham so', async () => {
  const { base, lockDir } = makeLockDir();
  const out = path.join(base, 'argv.json');
  const script = `require('fs').writeFileSync(${JSON.stringify(out)}, JSON.stringify(process.argv.slice(1)))`;
  const r = await runWrapper(lockDir, nodeCmd(script, 'a b'));
  assert.equal(r.code, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(out, 'utf8')), ['a b']);
});

test('g) nha khoa chi khi owner.pid la chinh minh: khoa bi nguoi khac thay thi giu nguyen', async () => {
  const { lockDir } = makeLockDir();
  const ownerPath = path.join(lockDir, 'owner.json');
  // Lenh con gia lap "khoa bi thay boi tien trinh khac" truoc khi wrapper ket thuc.
  const script = `require('fs').writeFileSync(${JSON.stringify(ownerPath)}, JSON.stringify({ pid: ${process.pid}, command: 'other', cwd: '/', startedAt: new Date().toISOString(), host: 'h' }))`;
  const r = await runWrapper(lockDir, nodeCmd(script));
  assert.equal(r.code, 0);
  assert.equal(fs.existsSync(ownerPath), true, 'khong duoc xoa khoa cua nguoi khac');
  assert.equal(JSON.parse(fs.readFileSync(ownerPath, 'utf8')).command, 'other');
});
