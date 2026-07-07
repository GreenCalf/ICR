import { pool } from './config/db';
import { workerEnv } from './config/env';
import { runStubForField } from './services/stub-recognizer';

async function fetchJob() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const jobRes = await client.query(
      `SELECT j.id, j.document_id, d.form_id, d.filename
         FROM recognition_jobs j
         JOIN documents d ON d.id = j.document_id
        WHERE j.status='NEW'
          AND d.status IN ('PROCESSING')
        ORDER BY j.created_at
        LIMIT 1
        FOR UPDATE SKIP LOCKED`
    );
    if (!jobRes.rows.length) {
      await client.query('ROLLBACK');
      return null;
    }

    const job = jobRes.rows[0];
    await client.query(`UPDATE recognition_jobs SET status='IN_PROGRESS', worker_id=$2 WHERE id=$1`, [
      job.id,
      workerEnv.workerId
    ]);
    await client.query('UPDATE documents SET status=$1 WHERE id=$2', ['CHECKING', job.document_id]);
    await client.query('COMMIT');
    return job;
  } finally {
    client.release();
  }
}

async function getCellsByForm(formId: number) {
  const { rows } = await pool.query(
    `SELECT c.id, f.code
     FROM cells c
     JOIN fields f ON f.id = c.field_id
     WHERE c.form_id=$1
     ORDER BY c.id ASC`,
    [formId]
  );
  return rows;
}

async function markJobDone(jobId: number, hasError = false) {
  await pool.query(
    `UPDATE recognition_jobs
     SET status=$1, completed_at=NOW()
     WHERE id=$2`,
    [hasError ? 'ERROR' : 'COMPLETED', jobId]
  );
}

async function runRecognition(jobId: number, documentId: number, formId: number) {
  const cells = await getCellsByForm(formId);

  for (const cell of cells) {
    const stub = runStubForField(cell.code || '');
    await pool.query(
      `INSERT INTO recognition_cells
        (recognition_job_id, form_cell_id, recognized_value, candidate_values, confidence, status)
       VALUES ($1, $2, $3, $4, $5, 'RECOGNIZED')`,
      [jobId, cell.id, stub.value, JSON.stringify(stub.alternatives), stub.confidence]
    );
  }
  await pool.query('UPDATE documents SET status=$1 WHERE id=$2', ['RECOGNIZED', documentId]);
}

async function processOne() {
  const job = await fetchJob();
  if (!job) {
    return;
  }

  try {
    await runRecognition(job.id, job.document_id, job.form_id);
    await markJobDone(job.id, false);
  } catch (err) {
    await markJobDone(job.id, true);
    // eslint-disable-next-line no-console
    console.error('job failed', job.id, err);
    await pool.query('UPDATE documents SET status=$1 WHERE id=$2', ['ERROR', job.document_id]);
  }
}

async function main() {
  // eslint-disable-next-line no-console
  console.log(`Recognition worker started, interval=${workerEnv.pollIntervalMs}ms`);
  setInterval(() => {
    processOne().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('worker loop error', err);
    });
  }, workerEnv.pollIntervalMs);
  processOne().catch((err) => console.error('initial worker error', err));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
