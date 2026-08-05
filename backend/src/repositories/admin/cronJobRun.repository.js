import db from '../../config/database.js';

export async function insertStart(jobCode) {
  const { rows } = await db.query(
    `INSERT INTO cron_job_runs (job_code, status, result)
     VALUES ($1, 'running', '{}'::jsonb)
     RETURNING id, started_at AS "startedAt"`,
    [jobCode]
  );
  return rows[0];
}

export async function finish(runId, { status, result = {}, errorMessage = null }) {
  const { rows } = await db.query(
    `UPDATE cron_job_runs
     SET finished_at = NOW(),
         duration_ms = GREATEST(0, EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000)::int,
         status = $2,
         result = $3::jsonb,
         error_message = $4
     WHERE id = $1
     RETURNING id, job_code AS "jobCode", started_at AS "startedAt",
               finished_at AS "finishedAt", duration_ms AS "durationMs",
               status, result, error_message AS "errorMessage"`,
    [runId, status, JSON.stringify(result || {}), errorMessage]
  );
  return rows[0] || null;
}

export async function recordRun(jobCode, fn) {
  const started = await insertStart(jobCode);
  const t0 = Date.now();
  try {
    const result = await fn();
    const synced = Number(result?.synced ?? result?.totalSynced);
    const status = result?.status
      || (Number.isFinite(synced) && synced === 0 ? 'noop' : 'success');
    await finish(started.id, { status, result: result || {} });
    return result;
  } catch (err) {
    await finish(started.id, {
      status: 'failure',
      result: { durationMsAttempt: Date.now() - t0 },
      errorMessage: err?.message || String(err),
    });
    throw err;
  }
}

export async function listLatestByJob({ limit = 100 } = {}) {
  const { rows } = await db.query(
    `SELECT DISTINCT ON (job_code)
       id, job_code AS "jobCode", started_at AS "startedAt",
       finished_at AS "finishedAt", duration_ms AS "durationMs",
       status, result, error_message AS "errorMessage"
     FROM cron_job_runs
     ORDER BY job_code, started_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

export async function listRecent({ jobCode = null, limit = 50 } = {}) {
  const params = [limit];
  let where = '';
  if (jobCode) {
    params.unshift(jobCode);
    where = 'WHERE job_code = $1';
  }
  const limIdx = params.length;
  const { rows } = await db.query(
    `SELECT id, job_code AS "jobCode", started_at AS "startedAt",
            finished_at AS "finishedAt", duration_ms AS "durationMs",
            status, result, error_message AS "errorMessage"
     FROM cron_job_runs
     ${where}
     ORDER BY started_at DESC
     LIMIT $${limIdx}`,
    params
  );
  return rows;
}
