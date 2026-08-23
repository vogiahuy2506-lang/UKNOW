# Chụp ảnh minh hoạ cho bài hướng dẫn

Playwright mở trình duyệt thật, điều hướng tới đúng màn hình mà từng ô chú thích
`[ẢNH: …]` mô tả, khoanh đỏ phần cần chú ý rồi chụp. Sau đó một script tải ảnh
lên và chèn vào đúng ô đó.

Làm bằng máy thay vì chụp tay vì ba lý do: mọi ảnh cùng khung cùng tỉ lệ, viền
khoanh thẳng đều, và **chạy lại được** — giao diện đổi thì chụp lại toàn bộ bằng
một lệnh thay vì ngồi chụp lại từng tấm.

## Chạy

```bash
cd e2e

# 1. Chụp — tài khoản do bạn tự đặt, không lưu vào file nào
HELP_SHOT_USERNAME='...' HELP_SHOT_PASSWORD='...' \
  npx playwright test --config=screenshots/playwright.config.js

# Ảnh ra ở screenshots/out/<slug>/ kèm manifest.json
open screenshots/out/doi-goi/

# 2. Chèn vào bài — chạy thử trước, không ghi gì
cd ..
export HELP_API_TOKEN='...'   # xem cách lấy ở đầu backend/scripts/insertHelpScreenshots.js
node backend/scripts/insertHelpScreenshots.js e2e/screenshots/out/doi-goi

# 3. Ưng thì mới ghi
node backend/scripts/insertHelpScreenshots.js e2e/screenshots/out/doi-goi --apply
```

Mặc định trỏ vào `https://founderai.biz`. Đổi bằng `HELP_SHOT_BASE_URL`.

## Quy tắc: chỉ đọc

Script chạy trên **tài khoản thật ở production**. Chỉ được điều hướng, mở menu,
mở hộp thoại xem. Tuyệt đối không bấm nút tạo đơn, xác nhận thanh toán hay lưu
dữ liệu — một cú bấm nhầm là một đơn hàng thật.

Vì vậy những ô chú thích mô tả trạng thái đặc biệt (hộp cảnh báo trước khi xác
nhận nâng gói, tài khoản đang trong ân hạn, mục đã bị khoá) **cố ý không tự động
hoá**. Chúng cần môi trường test có seed sẵn các trạng thái đó, hoặc chụp tay.

## Thêm một bài mới

1. Xem bài đó có những ô chú thích nào:

   ```bash
   cd backend && node -e "
   import('./src/services/help/helpSeed.data.js').then(({HELP_SEED_ARTICLES:A})=>{
     const a=A.find(x=>x.slug===process.argv[1]);
     [...a.body_html.matchAll(/<p>\[ẢNH:([^<]*)\]<\/p>/g)]
       .forEach((m,i)=>console.log((i+1)+'. '+m[1].trim()));
   });" doi-goi
   ```

2. Tạo `shots/<slug>.js` theo mẫu `shots/doi-goi.js`. Mỗi ô cần:
   - `caption` — đoạn chữ đủ riêng để nhận ra đúng MỘT ô chú thích. Khớp 0 hoặc
     nhiều hơn 1 thì script chèn từ chối, không đoán.
   - `take(page)` — trả về locator của vùng cần chụp.

3. Khai báo slug vào mảng `SHEETS` trong `capture.spec.js`.

Các thao tác lặp nhiều đã gói sẵn trong `lib/shotHelpers.js`:

| Hàm | Dùng cho |
|---|---|
| `sidebarShot` | "menu bên trái đang mở nhóm X, khoanh đỏ mục Y" — mẫu lặp hơn 20 lần |
| `regionShot` | mở một trang, khoanh một phần tử, chụp một vùng |
| `highlight` | khoanh đỏ thủ công |
| `hideVolatileChrome` | ẩn bảng trợ lý AI, toast, tắt animation |

`forceSidebarExpanded` đặt `localStorage.founder_ai_sidebar_open = true` trước khi
tải trang — mặc định app thu gọn menu còn biểu tượng, trong khi chú thích luôn mô
tả menu đang mở kèm chữ.

## Khi một ảnh chụp hỏng

Playwright in ra đúng bộ chọn nào không khớp. Thường là do nhãn trong giao diện
đã đổi — sửa một dòng trong `shots/<slug>.js`. Một ảnh hỏng không chặn các ảnh
còn lại; cuối lượt chạy sẽ liệt kê những ô chưa chụp được.

Cũng có khi bộ chọn không khớp vì **bài viết mô tả một thứ không tồn tại trong
giao diện**. Gặp trường hợp đó thì sửa bài viết, đừng sửa bộ chọn.
