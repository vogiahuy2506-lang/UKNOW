# CORS bucket GCS cho tải tệp biểu mẫu (PR-4b) — việc OPS, KHÔNG tự chạy trong CI

Trường `file` của biểu mẫu cho trình duyệt của khách **PUT thẳng** lên GCS bằng URL ký V4 (không qua backend).
Trình duyệt chỉ làm được nếu bucket cho phép CORS `PUT` từ origin frontend. Biểu mẫu chạy trong iframe
`https://founderai.biz/f/:key?embed=1` (origin frontend), nên **không cần** liệt kê tên miền riêng của landing.

`gcs-cors-form-uploads.json` cho phép `PUT` từ `https://founderai.biz` và `https://www.founderai.biz` với hai header
`Content-Type` và `x-goog-content-length-range` (URL ký ràng buộc cả hai; GCS tự từ chối PUT lệch loại hoặc vượt trần chủ
biểu mẫu đặt).

## Chạy (người có quyền `storage.buckets.update` trên bucket — service account của backend chỉ có `objectAdmin` nên KHÔNG đủ)

Bucket mặc định `founderai-storage` (biến `GCS_BUCKET`).

```bash
# 1. ĐỌC cấu hình CORS hiện có — lệnh set ghi ĐÈ toàn bộ, nếu bucket đã có quy tắc khác (vd GET cho ảnh) thì gộp vào file JSON trước.
gcloud storage buckets describe gs://founderai-storage --format="default(cors_config)"

# 2. Áp dụng
gcloud storage buckets update gs://founderai-storage --cors-file=backend/scripts/gcs-cors-form-uploads.json
#    (hoặc: gsutil cors set backend/scripts/gcs-cors-form-uploads.json gs://founderai-storage)

# 3. Kiểm tra preflight (phải thấy Access-Control-Allow-Origin và Allow-Headers có x-goog-content-length-range)
curl -s -i -X OPTIONS "https://storage.googleapis.com/founderai-storage/uploads/_cors-test" \
  -H "Origin: https://founderai.biz" \
  -H "Access-Control-Request-Method: PUT" \
  -H "Access-Control-Request-Headers: content-type,x-goog-content-length-range"
```

Origin staging/dev cần PUT thật lên GCS thì thêm vào mảng `origin` (máy dev dùng kho cục bộ, không cần).

## Bật tính năng (sau khi CORS đã áp dụng và kiểm preflight xong)

1. Trên VPS thêm đúng một dòng `FORM_FILE_UPLOAD_ENABLED=true` vào `backend/.env` (đọc lúc gọi, không cần dựng lại ảnh).
2. Khởi động lại container backend (CI/CD `workflow_dispatch` hoặc restart container) để nạp `.env`.
3. Kiểm: `GET /api/forms/capabilities` (đăng nhập) trả `fileUploadsEnabled: true`; trong trình soạn xuất hiện loại "Tải tệp".

Tắt lại bằng cách bỏ dòng / đặt `false`: biểu mẫu đã có trường file vẫn hiển thị, khách thấy "tạm chưa nhận tệp" và vẫn gửi được các ô còn lại.

## Dọn dẹp

Tệp tạm khách tải lên mà không nộp bài (`uploads/<chủ>/forms/<form>/tmp/…`) do lượt đối soát kho đêm 02:40 xoá sau 24 giờ
(`cleanupFormFileUploads`). Có thể thêm lifecycle rule GCS "xoá object có tiền tố `uploads/` chứa `/tmp/` sau 2 ngày" làm lưới
dự phòng nếu muốn — không bắt buộc.
