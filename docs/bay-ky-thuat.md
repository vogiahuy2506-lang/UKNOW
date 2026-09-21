# Bẫy kỹ thuật

Những chỗ đã cắn người thật trong repo này. Mỗi mục có **dấu hiệu nhận ra** — vì cái đắt không
phải lúc sửa, mà là quãng thời gian tưởng mình đang nhìn một lỗi khác.

Đọc trước khi tin một phép đo. Phần lớn các mục dưới đây đều có chung một hình dạng: **một phép
kiểm trả lời "ổn" trong lúc mọi thứ đang hỏng.**

---

## Git và cây làm việc

### `git add <file>` rồi `git commit` lấy TOÀN BỘ staging area

Không chỉ file vừa add. Ai đó đã stage sẵn thay đổi của họ thì chúng đi kèm, không một lời cảnh
báo. Repo này thường có nhiều agent làm song song trên cùng một cây, nên chuyện này không hiếm.

```bash
git diff --cached --stat        # bắt buộc, trước MỖI commit
git restore --staged <file>     # gỡ file không phải của mình
git commit --only <file>        # hoặc: chỉ commit đúng file này
```

Đã mắc hai lần trong một phiên ngày 01/09/2026: lần đầu `git add -A` quét cả file chưa đọc; lần sau
liệt kê tường minh 2 file nhưng commit ra 8, vì 6 file kia đã staged sẵn.

**Đọc `git status --short` cho đúng**: cột thứ nhất = đã staged, cột thứ hai = mới sửa ở working
tree. ` M` (cách rồi M) là chưa staged.

### Commit lạ trên `main` local là chuyện bình thường — đừng `reset --hard`

Đó là việc của agent khác đã xong và đang chờ review, thường là chưa đẩy. Muốn tách việc của mình
thì `git branch viec-cua-toi`, đừng xoá việc người khác.

Ngày 13/09/2026 mất trắng một lượt: một agent thấy 3 commit không phải của mình trên `main` local,
`reset --hard origin/main` rồi cherry-pick riêng commit của mình về. **Dấu hiệu duy nhất** là một
test integration đang chạy bỗng báo `ENOENT` cho file vừa tạo xong.

Lỡ reset rồi thì `git reflog -20` tìm hash trước bước reset và cherry-pick về — `reset --hard`
không xoá đối tượng trong kho git.

### Hash trong thông điệp commit có thể là bản TRƯỚC rebase

Commit nhắc tới một hash anh em (`"bổ sung phần bị sót khỏi abc1234"`) thì hash đó có thể không
tồn tại trên `origin/main` — nó là bản trước khi nhánh bị rebase. Viết tài liệu mà chép thẳng vào
là tạo một link chết chỉ phát hiện ra lúc cần tra nhất.

```bash
git merge-base --is-ancestor <hash> origin/main   # im lặng = có thật trên main
```

### 84 file `.js` trong `backend/src` dùng CRLF

Script Python/sed ghi lại ở chế độ text sẽ **nuốt sạch `\r`** và biến một sửa 2 dòng thành diff
2400 dòng. Python phải mở **và ghi** với `newline=''`. Công cụ Edit cũng chuẩn hoá cả file, làm diff
phình vài trăm dòng.

```bash
git diff --stat <file>    # số dòng đổi phải khớp thứ mình định sửa
grep -c $'\r' <file>      # số CR phải không đổi
```

Hệ quả xa hơn: `String.replace` trên nội dung CRLF có thể **không khớp gì cả** và trả về nguyên
văn. Gỡ đột biến để kiểm test mà gặp ca này thì test xanh bị đọc thành "code đúng", trong khi thật
ra đột biến chưa bao giờ được áp. Luôn ném lỗi khi số dòng không đổi.

### Đừng `git checkout --` file người khác đang sửa

Gỡ một đột biến bằng `git checkout` từng xoá luôn 27 dòng chưa commit của phiên khác. Gỡ đột biến
bằng cách sửa ngược đúng đoạn mình đã sửa.

---

## Chạy test

### Integration: mỗi lúc CHỈ MỘT lượt trên máy

`npm run test:integration` dùng chung một Postgres, và `globalSetup` **`DROP SCHEMA` rồi dựng lại**.
Hai lượt chạy chồng nhau thì lượt sau xoá lược đồ khi lượt trước đang chạy giữa chừng.

Ngày 13/09/2026 chuyện này tạo ra **107 test đỏ giả / 9 suite**, tất cả cùng một lỗi
`relation ... does not exist` — trông y như migration hỏng.

**Dấu hiệu là đỏ giả, không phải lỗi code:**

- cùng **một** lỗi `relation ... does not exist` nổ ở **nhiều suite không liên quan** cùng lúc —
  lỗi code thật không bao giờ trải đều như vậy;
- `pgrep -fl jest` cho thấy còn lượt khác đang chạy;
- lỗi timeout ở `beforeEach` → `truncateAll()`, **đổi nạn nhân mỗi lượt chạy**.

Đừng dùng "đếm số bảng trong `public`" làm phép kiểm — nó ra 0 bảng ngay cả lúc nghỉ.

Không giành được máy sạch thì **đừng cố đo cục bộ, để CI chạy**. Báo cáo trung thực là "chưa đo
được cục bộ, chờ CI", **không phải** "integration xanh".

### Kiểm máy trống phải dùng `if`, không dùng `||`

```bash
pgrep -f "[j]est" || echo "trống"; npm run test:unit     # SAI — vẫn chạy khi máy bận
if pgrep -f "[j]est" >/dev/null; then echo bận; else npm run test:unit; fi   # đúng
```

Dấu ngoặc `[j]est` để lệnh `pgrep` không tự khớp chính nó.

### Hook pre-push đỏ trong lúc người khác đang gõ code

Hook chạy unit test trên **working tree**, không phải trên commit. Agent khác lưu file dở giữa
chừng thì hook đỏ vì code của họ, dù commit của mình chỉ đụng tài liệu.

Dấu hiệu: chạy lại vài lần ra vài kết quả khác nhau, và **tổng số test thay đổi giữa các lượt**.
Cách xử lý trung thực: tự chạy đủ bộ unit ở cây chính, xác nhận xanh, rồi `--no-verify` và **nói rõ
trong báo cáo** là đã bypass và vì sao.

Worktree tạm thì luôn đỏ vì không có `node_modules` — "Unit test FAIL" ở đó không nói gì về code.

### Chạy một file test riêng lẻ cần cờ ESM

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js path/to/test.spec.js --selectProjects=unit
```

`npx jest ...` thiếu cờ này sẽ fail với `Cannot use import statement outside a module` — trông như
lỗi cấu hình, thật ra chỉ là thiếu cờ.

### Bảng hằng số phải ghim TỪNG phần tử

Test viết theo ca mẫu ("một số hợp lệ, một số không") không bảo vệ được một bảng tra cứu. Bảng đầu
số di động thiếu một đầu số **lọt qua 56 test**, và đột biến kiểu "bỏ một đầu số" hay "nới rộng một
khoảng" đều xanh.

Dùng `it.each` với **hai danh sách tường minh**: mọi phần tử phải nhận, mọi phần tử phải loại.

---

## Đọc số và chẩn đoán

### `psql` lệch 7 tiếng

`NOW()` chạy theo UTC trong khi nhiều cột lưu giờ Việt Nam. Luôn mở phiên bằng:

```sql
SET TIME ZONE 'Asia/Ho_Chi_Minh';
```

Pool của ứng dụng đã đặt sẵn (`backend/src/config/database.js:65`), nhưng phiên `psql` tay thì
không.

### `docker exec <container> env` luôn trả rỗng cho cấu hình ứng dụng

App nạp cấu hình qua `dotenv` vào tiến trình Node, nên biến không xuất hiện trong môi trường
container. Lệnh đó trả rỗng và dễ bị đọc thành "chưa cấu hình". Muốn biết giá trị đang chạy thì
đọc file cấu hình.

Cũng lưu ý thứ tự ưu tiên: biến của shell thắng file, và một giá trị **rỗng** trong file đã sourced
vẫn ghi đè.

### `restarts=0` không có nghĩa là container không quay vòng chết

Postgres hết chỗ đĩa có thể redo xong sạch rồi `PANIC` ngay ở bước ghi checkpoint, checkpointer bị
hạ, `reinitializing`, lặp lại mỗi nửa giây — tất cả **bên trong** container. `docker inspect` vẫn
báo `restarts=0` vì container chưa hề restart lần nào.

Đừng dùng số lần restart làm phép kiểm sức khoẻ.

### `amcheck` không bật `heapallindexed` sẽ nói "sạch" cả khi đang hỏng

Sau mọi sự cố hạ tầng (đầy đĩa, mất điện, kill -9 Postgres) phải soát index bằng:

```sql
SELECT bt_index_check(index => c.oid, heapallindexed => true) ...
```

Chỉ phép kiểm này bắt được **dòng thiếu im lặng trong index**. Sự cố 10/08/2026 để lại 12 index
hỏng trả thiếu dòng mà không báo lỗi gì.

### `docker logs` bị xoá mỗi lần deploy

Container được tạo mới mỗi lần deploy, log của container cũ đi theo nó. Trước khi kết luận "hệ
thống im lặng, không có log", kiểm `docker inspect -f '{{.Created}}'` — nếu container trẻ hơn mốc
đang điều tra thì log đó **không bao giờ tồn tại để mà đọc**.

Số liệu bền phải lấy từ DB, không lấy từ log.

### `gh run list --commit` cần SHA ĐẦY ĐỦ

SHA ngắn trả về rỗng với exit code 0 — trông y như "chưa có lượt chạy nào". Đã làm một vòng giám
sát im lặng 30 phút.

Deploy đỏ ở bước "Reject newer revision" nghĩa là bị một lượt mới hơn đè, **không phải lỗi thật**.

### `grep` ở đây là `ugrep`

Regex lỗi cho stdout rỗng, trông hệt như "không khớp gì". Kiểm stderr trước khi kết luận. Trong zsh,
`--include=*.js` không nháy sẽ bị shell nuốt.

---

## Mã nguồn

### Con trỏ quét: đừng lọc ở SQL

`backend/src/services/chatbot/chatbotContactAlert.service.js:288` đẩy con trỏ bằng
`lastId = messages[messages.length - 1].id` — **id của tin cuối cùng ĐỌC ĐƯỢC**, không phải tin
cuối cùng *giữ lại*.

Thêm một điều kiện lọc vào câu SQL nghĩa là những tin bị lọc không bao giờ vào mảng, nên con trỏ
không bao giờ vượt qua chúng. Máy quét đứng yên vĩnh viễn ngay sau một chuỗi tin bị loại.

**Lọc trong vòng lặp, sau khi đã đẩy con trỏ.** Áp cho mọi máy quét dùng con trỏ tăng dần.

### Hai file kiểm số điện thoại, đừng nhầm

| File | Dùng cho | Luật |
|---|---|---|
| `backend/src/utils/accountPhone.util.js` | SĐT **tài khoản** | di động VN + số bàn `02x` + số nước ngoài (bắt buộc có `+`) |
| `backend/src/utils/vietnamesePhone.util.js:10` | nhập khách hàng, chiến dịch, hạn mức | `/^0[35789]\d{8}$/` — chỉ kiểm một chữ số đầu |

⚠️ **Đừng siết `vietnamesePhone.util.js`.** Nó dùng chung cho nhập khách hàng, chiến dịch và hạn
mức; siết nó là cắt dữ liệu ở ba chỗ không liên quan tới việc mình đang làm. Cần bảng đầu số chặt
hơn thì khai báo cục bộ tại nơi cần.

### Khử trùng request trong `frontend/src/services/api.js` HUỶ lượt đang bay

Khoá là `method:url:params`, **không có body**. Lượt thứ hai cùng khoá sẽ `abort()` lượt thứ nhất.

Hệ quả đã xảy ra thật: `Promise.all` nhiều POST cùng URL thì chỉ lượt cuối tới server. Upload
(`FormData`) đã được miễn trừ, JSON thì chưa.

Trước khi bắt người dùng đo lại phía server, soát xem có hai nơi trên cùng trang gọi cùng một URL
không. Và **đừng biến lỗi request thành mảng rỗng** — nó in ra màn hình thành "chưa có dữ liệu",
một câu nói sai sự thật mà không ai debug được.

### Route chết đánh lừa phép kiểm

`backend/src` còn nhiều route không còn ai gọi. Đọc một route rồi kết luận về hành vi hệ thống là
rủi ro — phải truy tới nơi thật sự ghi DB.

### Thêm cron phải sửa `cronJobRegistry.js`

`backend/src/services/admin/cronJobRegistry.js` là nơi khai báo các tác vụ định kỳ cho phần giám
sát. Thêm cron mà quên khai báo thì nó chạy nhưng không ai theo dõi được, và trang giám sát báo
thiếu.

### Thêm cột: ba nơi phải cập nhật cùng lúc

1. File migration trong `backend/migrations/`
2. `backend/tests/integration/sql/bootstrap.sql` — CI có job `schema-sync-check` chặn nếu quên
3. `backend/tests/integration/fixtures/productionSchemaInventory.json` — cột vào đúng bảng dưới
   khoá `tables`, và `_meta.columns` cộng thêm N (đếm từ `tables`, **không** đếm khoá cấp cao)

Quên bước 3 làm shard `schemaInventory` đỏ và deploy backend bị bỏ qua.

### Migration đã đẩy thì KHÔNG sửa nữa

Bộ chạy migration so checksum, kể cả comment. `DROP` và `RENAME` cần chú thích
`-- allow-destructive-ddl` — xem `backend/scripts/checkMigrationSafety.js`.

### Điều phối chiến dịch nằm trong bộ nhớ tiến trình

`backend/src/services/campaign/campaignRun.service.js:85`. Xem mục "Chạy đúng MỘT container backend"
trong [sổ quyết định](./quyet-dinh-san-pham.md) trước khi nghĩ tới scale ngang.

### Trạng thái `connected` trong DB có thể nói dối

Một đường khôi phục phiên từng ghi `connected` ngay cả khi lần đăng nhập trả về rỗng. **Dấu hiệu
nhận ra**: `last_connected_at` sớm hơn `first_restore_fail_at` đúng vài mili giây — tức hai lần ghi
đến từ cùng một lượt xử lý, không phải hai sự kiện thật.

Đừng tin cột trạng thái; kiểm phiên sống.

---

## Liên quan

- [Sổ quyết định](./quyet-dinh-san-pham.md) — cái gì đã chốt, và cái gì đã bị bác bỏ
- [Lịch sử tính năng](./lich-su-tinh-nang-2026-09.md) — đã ship gì, commit nào
