/**
 * Case 6 — mã CRON_JOBS tracked phải khớp chuỗi/hằng truyền vào recordRun trong scheduler.js.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from '@jest/globals';
import { CRON_JOBS } from '../cronJobRegistry.js';
import {
  PAYOS_RECONCILE_JOB_CODE,
  PAYOS_EXPIRE_JOB_CODE,
} from '../../payment/payosReconcile.service.js';
import {
  EINVOICE_RECONCILE_JOB_CODE,
  EINVOICE_EMAIL_JOB_CODE,
  EINVOICE_REPAIR_JOB_CODE,
} from '../../payment/matbaoInvoice.service.js';
import { STORAGE_RECONCILE_JOB_CODE } from '../../storage/storageReconcile.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEDULER_PATH = path.resolve(__dirname, '../../../utils/scheduler.js');

function extractRecordedJobCodes(schedulerSource) {
  const codes = new Set();
  const literalRe = /recordRun\(\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = literalRe.exec(schedulerSource)) !== null) {
    codes.add(m[1]);
  }

  // Jobs dùng hằng — resolve từ export service.
  if (/recordRun\(\s*PAYOS_RECONCILE_JOB_CODE/.test(schedulerSource)) {
    codes.add(PAYOS_RECONCILE_JOB_CODE);
  }
  if (/recordRun\(\s*PAYOS_EXPIRE_JOB_CODE/.test(schedulerSource)) {
    codes.add(PAYOS_EXPIRE_JOB_CODE);
  }
  if (/recordRun\(\s*EINVOICE_RECONCILE_JOB_CODE/.test(schedulerSource)) {
    codes.add(EINVOICE_RECONCILE_JOB_CODE);
  }
  if (/recordRun\(\s*EINVOICE_EMAIL_JOB_CODE/.test(schedulerSource)) {
    codes.add(EINVOICE_EMAIL_JOB_CODE);
  }
  if (/recordRun\(\s*EINVOICE_REPAIR_JOB_CODE/.test(schedulerSource)) {
    codes.add(EINVOICE_REPAIR_JOB_CODE);
  }
  if (/recordRun\(\s*STORAGE_RECONCILE_JOB_CODE/.test(schedulerSource)) {
    codes.add(STORAGE_RECONCILE_JOB_CODE);
  }
  return codes;
}

describe('cronJobRegistry ↔ scheduler recordRun', () => {
  it('mọi job tracked trong CRON_JOBS đều có recordRun tương ứng', () => {
    const source = fs.readFileSync(SCHEDULER_PATH, 'utf8');
    const recorded = extractRecordedJobCodes(source);
    const tracked = CRON_JOBS.filter((j) => j.tracked).map((j) => j.code);

    expect(tracked.length).toBeGreaterThanOrEqual(3);
    for (const code of tracked) {
      expect(recorded.has(code)).toBe(true);
    }
  });

  it('mọi recordRun trong scheduler đều nằm trong CRON_JOBS', () => {
    const source = fs.readFileSync(SCHEDULER_PATH, 'utf8');
    const recorded = extractRecordedJobCodes(source);
    const catalog = new Set(CRON_JOBS.map((j) => j.code));

    for (const code of recorded) {
      expect(catalog.has(code)).toBe(true);
    }
  });

  it('đúng 22 cron cố định, không trùng mã', () => {
    expect(CRON_JOBS).toHaveLength(22);
    const codes = CRON_JOBS.map((j) => j.code);
    expect(new Set(codes).size).toBe(22);
  });
});
