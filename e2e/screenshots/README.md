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

# 1. Điền tài khoản — chỉ làm một lần, file này đã gitignore
cp screenshots/.env.shots.example screenshots/.env.shots
$EDITOR screenshots/.env.shots

# 2. Chụp
npx playwright test --config=screenshots/playwright.config.js

# Ảnh ra ở screenshots/out/<slug>/ kèm manifest.json
open screenshots/out/doi-goi/

# 3. Chèn vào bài — chạy thử trước, không ghi gì
cd ..
export HELP_API_TOKEN='...'   # xem cách lấy ở đầu backend/scripts/insertHelpScreenshots.js
node backend/scripts/insertHelpScreenshots.js e2e/screenshots/out/doi-goi

# 4. Ưng thì mới ghi
node backend/scripts/insertHelpScreenshots.js e2e/screenshots/out/doi-goi --apply
```

Mặc định trỏ vào `https://founderai.biz`. Đổi bằng `HELP_SHOT_BASE_URL` trong
`.env.shots`.

Nên dùng **tài khoản chủ workspace** — nhiều màn hình trong bài chỉ chủ tài khoản
mới thấy (nhóm Gói & Thanh toán, Hồ sơ doanh nghiệp, Nhân viên).

## Hai môi trường

| | Production | Máy mình |
|---|---|---|
| Dựng | không cần gì | phải chạy backend + DB test |
| Dữ liệu | thật, trông có sức sống | seed sẵn, cố định giữa các lượt |
| Bấm nút thay đổi dữ liệu | **cấm tuyệt đối** | thoải mái |
| Bảng giá | đủ 6 gói | đủ 6 gói (bản sao production) |
| Danh sách chiến dịch, mẫu, hộp thư | có dữ liệu | rỗng |
| Trạng thái đặc biệt (hẹn hạ gói, vượt hạn mức, bị khoá) | không dựng được | **chỉ ở đây mới làm được** |

Trên **production**, script chạy bằng tài khoản thật: chỉ được điều hướng, mở
menu, mở hộp thoại xem. Một cú bấm nhầm là một đơn hàng thật.

Trên **máy mình** thì ngược lại — cứ bấm. Tạo đơn, xác nhận nâng gói, hẹn hạ gói,
để vượt hạn mức. Đó là cách duy nhất chụp được những màn hình mà bài hướng dẫn
cần nhưng tài khoản thật không dựng nổi.

Phần chụp và phần chèn vốn tách rời, nên **chụp ở máy mình rồi chèn thẳng vào bài
trên production** là chạy được, không phải sửa gì.

### Dựng môi trường ở máy

```bash
cp e2e/.env.test.example e2e/.env.test        # một lần

# cửa sổ 1 — backend đọc e2e/.env.test, nối DB test cổng 5433
cd backend && npm run dev:e2e

# cửa sổ 2 — nạp lại DB test kèm dữ liệu mẫu (6 gói giống production)
cd e2e && E2E_SEED_DEMO=1 node scripts/seed-test-db.js
```

Rồi đặt trong `.env.shots`:

```
HELP_SHOT_USERNAME=e2etest
HELP_SHOT_PASSWORD=Test@1234
HELP_SHOT_BASE_URL=http://localhost:5174
```

Frontend không cần mở tay — trỏ vào localhost thì Playwright tự dựng.

> `seed-test-db.js` chạy `DROP SCHEMA` trên `uknow_campaign_test`, **cùng DB mà
> `npm run test:integration` dùng**. Bộ integration tự dựng lại schema mỗi lượt
> nên không mất gì lâu dài, nhưng đừng chạy song song hai thứ.

Cờ `E2E_SEED_DEMO` là tuỳ chọn vì bộ test e2e dựa vào trạng thái rỗng — bật mặc
định sẽ làm đỏ hàng loạt test không liên quan.

### Hai trạng thái loại trừ nhau

Lệnh hẹn hạ gói **khoá** luồng nâng gói (nút đổi thành "Đã có lệnh hẹn"), mà ảnh
`canh-bao-mat-ngay` lại cần luồng đó mở. Không có API huỷ lệnh hẹn, nên phải chụp
hai lượt:

```bash
E2E_SEED_DEMO=1 node scripts/seed-test-db.js
npx playwright test --config=screenshots/playwright.config.js

E2E_SEED_DEMO=1 E2E_SEED_PENDING_CHANGE=1 node scripts/seed-test-db.js
npx playwright test --config=screenshots/playwright.config.js
```

Lượt đầu ra `canh-bao-mat-ngay`, lượt sau ra `lenh-hen-doi-goi`. Ảnh của lượt
trước vẫn nằm nguyên trong `out/`, ảnh nào hỏng thì báo rõ lý do và không đè lên.

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
