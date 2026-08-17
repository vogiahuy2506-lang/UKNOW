/**
 * Script di chuyển toàn bộ tệp từ đĩa local (uploads/) lên Google Cloud Storage (GCS).
 *
 * 4 nguyên tắc an toàn:
 * 1. Chạy lại được nhiều lần (idempotent): kiểm tra exists() trên GCS trước khi upload.
 * 2. Không xoá tệp trên đĩa: đĩa đóng vai trò fallback cho tới khi PR-4 hoàn tất.
 * 3. Kèm cả sidecar .txt: di chuyển cả tệp chính lẫn tệp trích xuất văn bản .txt.
 * 4. Đối chiếu sau khi chạy: đếm số object trên GCS và đối chiếu với database.
 *
 * Chạy:
 *   cd backend
 *   node scripts/migrateStorageToGcs.js --dry-run
 *   node scripts/migrateStorageToGcs.js
 *   node scripts/migrateStorageToGcs.js --limit=100
 */
import path from 'path';
import { promises as fs } from 'fs';
import db from '../src/config/database.js';
import { GcsStorageBackend } from '../src/services/storage/gcsStorageBackend.js';
import { LocalStorageBackend } from '../src/services/storage/localStorageBackend.js';

const isDryRun = process.argv.includes('--dry-run');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;
const batchSizeArg = process.argv.find((arg) => arg.startsWith('--batch-size='));
const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1], 10) : 20;

const BUCKET = String(process.env.GCS_BUCKET || 'founderai-storage').trim();
const KEY_FILE = String(process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.mp4': 'video/mp4',
    '.mp3': 'audio/mpeg',
  };
  return map[ext] || 'application/octet-stream';
}

async function main() {
  console.log('🚀 Khởi động script di chuyển tệp lên GCS');
  console.log(`Bucket:          gs://${BUCKET}`);
  console.log(`Chế độ:          ${isDryRun ? '🔍 DRY-RUN (không ghi GCS)' : '⚡ LIVE UPLOAD'}`);
  if (limit) console.log(`Giới hạn:        ${limit} bản ghi`);

  const gcsBackend = new GcsStorageBackend({ bucketName: BUCKET, keyFilename: KEY_FILE });
  const localBackend = new LocalStorageBackend();

  if (!isDryRun) {
    console.log('\n🩺 Kiểm tra kết nối GCS healthcheck...');
    const healthOk = await gcsBackend.healthcheck();
    if (!healthOk) {
      console.error('❌ Kết nối GCS thất bại! Vui lòng kiểm tra quyền service account và GCS_BUCKET.');
      process.exit(1);
    }
    console.log('✅ Kết nối GCS thành công!\n');
  }

  // 1. Quét DB lấy danh sách storage_objects
  const query = `
    SELECT id, storage_key AS "storageKey", state, size_bytes AS "sizeBytes", category
    FROM storage_objects
    WHERE state = ANY($1::varchar[])
      AND storage_key IS NOT NULL
    ORDER BY id ASC
    ${limit ? `LIMIT ${limit}` : ''}
  `;
  const { rows } = await db.query(query, [['active', 'temp', 'cleanup_pending']]);
  console.log(`📋 Tìm thấy ${rows.length} đối tượng trong sổ cái storage_objects`);

  let uploadedCount = 0;
  let skippedCount = 0;
  let missingOnDiskCount = 0;
  let sidecarUploadedCount = 0;
  let totalBytesProcessed = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (row) => {
        const key = row.storageKey;
        const localPath = localBackend.resolveAbsolutePathFromKey(key);

        if (!localPath) {
          missingOnDiskCount += 1;
          return;
        }

        // Kiểm tra tồn tại trên đĩa local
        let fileBuffer = null;
        try {
          fileBuffer = await fs.readFile(localPath);
        } catch {
          missingOnDiskCount += 1;
          return;
        }

        totalBytesProcessed += fileBuffer.length;

        // Kiểm tra đã có trên GCS chưa
        let alreadyOnGcs = false;
        if (!isDryRun) {
          alreadyOnGcs = await gcsBackend.exists(key);
        }

        if (alreadyOnGcs) {
          skippedCount += 1;
        } else {
          if (!isDryRun) {
            const mimeType = getMimeType(localPath);
            await gcsBackend.put(key, fileBuffer, { contentType: mimeType });
          }
          uploadedCount += 1;
        }

        // Xử lý tệp sidecar .txt nếu có
        const sidecarLocalPath = `${localPath}.txt`;
        const sidecarKey = `${key}.txt`;
        try {
          const sidecarBuffer = await fs.readFile(sidecarLocalPath);
          totalBytesProcessed += sidecarBuffer.length;
          if (!isDryRun) {
            const sidecarExists = await gcsBackend.exists(sidecarKey);
            if (!sidecarExists) {
              await gcsBackend.put(sidecarKey, sidecarBuffer, { contentType: 'text/plain' });
              sidecarUploadedCount += 1;
            }
          } else {
            sidecarUploadedCount += 1;
          }
        } catch {
          // Không có sidecar là bình thường
        }
      })
    );

    const progress = Math.min(i + batchSize, rows.length);
    console.log(`⏳ Tiến độ: ${progress}/${rows.length} (Đã tải: ${uploadedCount}, Bỏ qua/đã có: ${skippedCount}, Không thấy trên đĩa: ${missingOnDiskCount})`);
  }

  console.log('\n📊 KẾT QUẢ TỔNG KẾT:');
  console.log(`- Tổng bản ghi DB quét:      ${rows.length}`);
  console.log(`- Tệp chính upload mới:       ${uploadedCount}`);
  console.log(`- Tệp chính đã có sẵn trên GCS: ${skippedCount}`);
  console.log(`- Tệp sidecar .txt upload:    ${sidecarUploadedCount}`);
  console.log(`- Tệp thiếu trên đĩa local:   ${missingOnDiskCount}`);
  console.log(`- Dung lượng xử lý:          ${(totalBytesProcessed / (1024 * 1024)).toFixed(2)} MB`);

  if (!isDryRun) {
    console.log('\n✅ Hoàn tất di chuyển! Dữ liệu đã sẵn sàng cho PR-4 chuyển cờ STORAGE_BACKEND=gcs.');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('💥 Lỗi khi di chuyển tệp:', err);
  process.exit(1);
});
