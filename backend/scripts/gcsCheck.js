/**
 * Kiểm tra service account có đủ quyền trên bucket GCS hay không.
 *
 * Thử đúng 4 thao tác mà app cần (xem PLAN_GCS_STORAGE_2026-08-17.md):
 *   ghi → đọc → tạo signed URL → xoá
 *
 * Đọc chính sách IAM không đủ tin cậy (quyền có thể thừa kế từ project, có
 * điều kiện, hoặc bị chặn bởi ràng buộc tổ chức). Thử thật mới chắc.
 *
 * Chạy:
 *   cd backend
 *   GCS_BUCKET=founderai-storage \
 *   GOOGLE_APPLICATION_CREDENTIALS=/root/uknow/secrets/gcs.json \
 *   node scripts/gcsCheck.js
 *
 * Script CHỈ ghi/xoá đúng một object tạm có tiền tố `_healthcheck/`,
 * không đụng dữ liệu thật.
 */
import 'dotenv/config';
import { Storage } from '@google-cloud/storage';

const BUCKET = String(process.env.GCS_BUCKET || '').trim();
const KEY_FILE = String(process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();

const ok = (msg) => console.log(`  ✅ ${msg}`);
const bad = (msg, err) => console.log(`  ❌ ${msg}\n     → ${err?.message || err}`);

async function main() {
  if (!BUCKET) {
    console.error('Thiếu GCS_BUCKET');
    process.exit(1);
  }
  if (!KEY_FILE) {
    console.error('Thiếu GOOGLE_APPLICATION_CREDENTIALS (đường dẫn tới file khoá)');
    process.exit(1);
  }

  const storage = new Storage({ keyFilename: KEY_FILE });
  const bucket = storage.bucket(BUCKET);
  const testKey = `_healthcheck/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`;
  const file = bucket.file(testKey);
  const payload = Buffer.from('uknow gcs healthcheck', 'utf8');

  // In danh tính đang dùng — không in private key.
  try {
    const email = await storage.authClient.getCredentials();
    console.log(`Service account: ${email?.client_email || '(không đọc được)'}`);
  } catch {
    console.log('Service account: (không đọc được danh tính)');
  }
  console.log(`Bucket:          gs://${BUCKET}`);
  console.log(`Object thử:      ${testKey}\n`);

  let failed = 0;

  // 0. Cấu hình bucket — CHỈ để tham khảo, KHÔNG chặn.
  //
  // Service account đúng chuẩn đặc quyền tối thiểu (chỉ roles/storage.objectAdmin)
  // sẽ KHÔNG có `storage.buckets.get`, nên bucket.exists()/getMetadata() ném 403.
  // Đó là cấu hình MONG MUỐN — app chỉ thao tác object, không đọc cấu hình bucket.
  // Đừng cấp thêm quyền chỉ để script này chạy đẹp.
  try {
    const [meta] = await bucket.getMetadata();
    const location = String(meta.location || '').toUpperCase();
    const uniform = meta.iamConfiguration?.uniformBucketLevelAccess?.enabled === true;

    if (location === 'ASIA-SOUTHEAST1') {
      ok(`Region ${location}`);
    } else {
      console.log(`  ⚠️  Region ${location} — kỳ vọng ASIA-SOUTHEAST1 (độ trễ về VN)`);
    }

    if (uniform) {
      ok('Uniform bucket-level access đang BẬT');
    } else {
      console.log('  ⚠️  Uniform bucket-level access đang TẮT — nên bật để tránh ACL lẻ làm lộ file');
    }
    console.log(`     (storage class: ${meta.storageClass || 'không rõ'})`);
  } catch {
    console.log('  ℹ️  Không đọc được cấu hình bucket (thiếu storage.buckets.get).');
    console.log('     ĐÂY LÀ BÌNH THƯỜNG với service account chỉ có roles/storage.objectAdmin.');
    console.log('     Kiểm region + uniform access trong Cloud Console thay vì cấp thêm quyền.');
  }

  // 1. GHI — storage.objects.create
  try {
    await file.save(payload, { contentType: 'text/plain', resumable: false });
    ok('Ghi object (storage.objects.create)');
  } catch (err) {
    bad('KHÔNG ghi được — thiếu storage.objects.create', err);
    failed += 1;
  }

  // 2. ĐỌC — storage.objects.get
  try {
    const [buf] = await file.download();
    if (buf.toString('utf8') !== payload.toString('utf8')) {
      throw new Error('nội dung đọc ra không khớp nội dung đã ghi');
    }
    ok('Đọc object (storage.objects.get)');
  } catch (err) {
    bad('KHÔNG đọc được — thiếu storage.objects.get', err);
    failed += 1;
  }

  // 3. SIGNED URL — ký cục bộ bằng private key trong file khoá,
  //    KHÔNG cần thêm quyền IAM nào. Hỏng ở đây thường là file khoá lỗi.
  try {
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 10 * 60 * 1000,
    });
    if (!url.startsWith('https://')) throw new Error('URL trả về không hợp lệ');
    ok('Tạo signed URL (ký cục bộ, không cần quyền IAM)');
  } catch (err) {
    bad('KHÔNG tạo được signed URL — kiểm lại file khoá', err);
    failed += 1;
  }

  // 4. XOÁ — storage.objects.delete
  try {
    await file.delete();
    ok('Xoá object (storage.objects.delete)');
  } catch (err) {
    bad('KHÔNG xoá được — thiếu storage.objects.delete', err);
    failed += 1;
  }

  console.log('');
  if (failed === 0) {
    console.log('✅ ĐỦ QUYỀN — service account dùng được cho PR-2.');
    process.exit(0);
  }
  console.log(`❌ THIẾU QUYỀN (${failed}/4 thao tác hỏng).`);
  console.log('   Cấp roles/storage.objectAdmin trên chính bucket này rồi chạy lại:');
  console.log(`   gcloud storage buckets add-iam-policy-binding gs://${BUCKET} \\`);
  console.log('     --member=serviceAccount:<CLIENT_EMAIL> --role=roles/storage.objectAdmin');
  process.exit(1);
}

main().catch((err) => {
  console.error('Lỗi không lường trước:', err?.message || err);
  process.exit(1);
});
