// Đọc STDIN (bản pg_dump) đẩy lên GCS `db-backups/<tênFile>`, kiểm size, dọn bản quá hạn.
// Chạy trong container:
//   docker exec -i uknow-campaign-backend node -r dotenv/config scripts/uploadDbBackupToGcs.mjs <tênFile> < dump
import { GcsStorageBackend } from '../src/services/storage/gcsStorageBackend.js';
import { runDbBackupUploadCli } from '../src/services/storage/dbBackupGcs.service.js';

const backend = new GcsStorageBackend();
const code = await runDbBackupUploadCli({
  argv: process.argv.slice(2),
  stdin: process.stdin,
  bucket: backend.bucket,
});
process.exit(code);
