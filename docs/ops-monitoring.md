# Giám sát vận hành — quyết định kiến trúc

Tài liệu tham chiếu về tác vụ tự động, cảnh báo, KPI và cách giữ schema khỏi lệch.
Ghi lại **quyết định và lý do**; code là nguồn sự thật về cách làm.

Rút từ các plan đã ship tháng 08/2026: đo lường KPI, danh mục cron, chống lệch schema.

---

## 1. Danh sách cron phải khai báo tay

Trang trạng thái cron ban đầu suy danh sách job từ **dữ liệu đã chạy**
(`DISTINCT ON (job_code)` trên `cron_job_runs`). Hệ quả: job chưa bao giờ chạy thì
**không tồn tại trên màn hình** — 12 trong 15 cron vô hình, gồm cả cron đánh giá cảnh
báo và cron nhắc gia hạn.

Nên danh mục là **hằng khai báo tay**
([`cronJobRegistry.js`](../backend/src/services/admin/cronJobRegistry.js)), giao diện
duyệt theo danh mục rồi ghép với lần chạy gần nhất. Job chưa bọc hiện *"Chưa ghi
nhận"*, job tắt bằng cấu hình hiện *"Đang tắt theo cấu hình"*.

Mỗi job có trường **`impact` — hỏng thì mất gì**. Đó là thứ người trực cần lúc 2 giờ
sáng: biết nên dậy xử lý ngay hay để mai. Chỉ hiện khi trạng thái lỗi hoặc chưa ghi
nhận — 15 dòng mà dòng nào cũng kèm cảnh báo thì đọc vài lần là quen mắt và bỏ qua.

**Một `cron.schedule` = một mã**, kể cả khi nó gọi ba hàm. Tách logic thành nhiều mã
trong khi chỉ có một chỗ ghi thì các mã kia không bao giờ có dòng nào.

Hệ thống có **15 cron cố định**. Cron sinh động cho từng lịch chiến dịch của khách
không nằm trong danh mục, và **giữ phiên Zalo** chạy bằng `setInterval` trong service
chứ không qua `cron.schedule` — cũng cố ý không liệt kê, để con số "n/15" khớp đúng.

### `noop` không phải lỗi

`noop` nghĩa là **đã chạy xong và không có việc để làm** — không có đơn quá hạn thì
cron huỷ đơn báo `noop` là đúng. Nhãn cũ ghi *"Không chạy"* (sai nghĩa hẳn) cộng với
badge vàng khiến cả trang trông như đang hỏng trong khi mọi thứ bình thường.

Nay: nhãn *"Không có việc để làm"*, badge xám trung tính.

### Hàm được bọc phải trả về số đếm

`recordRun` suy trạng thái từ giá trị trả về. Trả `undefined` thì luôn ra `success`,
kể cả lúc chạy rỗng — mất khả năng phân biệt "chạy mà không làm gì" với "làm việc
thật".

### Bảng chạy phải có hạn dọn

Ba cron chạy **mỗi phút**. Ghi nhận đủ 15 job là khoảng 4.300 dòng/ngày, 1,6 triệu
dòng/năm. Xoá dòng quá 14 ngày, gắn vào cron 00:00 đã có — **đừng tạo cron thứ 16 chỉ
để dọn**.

## 2. Cảnh báo tự động

Tám quy tắc, quét mỗi 5 phút, gửi email cho quản trị
([`alertEvaluator.service.js`](../backend/src/services/admin/alertEvaluator.service.js)):
tỉ lệ gửi lỗi cao, không có tin Zalo vào, cron đồng bộ chạy không, chi phí AI vọt,
tài khoản Zalo mất kết nối, thanh toán treo, đăng nhập sai dồn dập, đối soát thanh
toán phải cứu đơn đã trả.

Chống làm phiền: mỗi quy tắc có thời gian chờ riêng; ban đêm chỉ báo mức nghiêm
trọng; có trang bật/tắt, chỉnh ngưỡng, đánh dấu đã xử lý.

**Cảnh báo giả đắt hơn nó tưởng.** Vài lần báo nhầm là người ta bắt đầu lướt qua email
cảnh báo, và lần thật cũng bị lướt qua — hỏng luôn cả bảy quy tắc đang chạy tốt. Nên
ngưỡng phải **đo từ dữ liệu thật**, đừng nhân hệ số cho có.

### Giới hạn không che được

Quy tắc "cron ngừng chạy" **không tự phát hiện được khi chính cron đánh giá cảnh báo
chết** — nó chạy trong cùng tiến trình. Muốn bắt ca đó phải giám sát từ ngoài (uptime
ping vào `/api/health`), thứ này cũng bắt luôn container chết, hết RAM, máy chủ sập.

Ghi nhận giới hạn này, đừng để nó trông như đã che kín.

## 3. Đo lường KPI

Phễu 5 bước dựng từ `audit_logs`: đăng ký → nối kênh → tạo chiến dịch → chạy → trả
tiền, xem được theo nhóm khách đăng ký cùng đợt.

Chỉ số quan trọng nhất về trải nghiệm khách mới là **thời gian từ đăng ký tới tin nhắn
đầu tiên** (trung vị + tỉ lệ đạt dưới 10 phút).

Hệ thống ghi nhận **ai thực hiện từng hành động**: `campaign_runs.triggered_by` và
`usage_logs.actor_user_id` (migration 103). Trước đó dữ liệu này bị mất, không quy
được trách nhiệm hay đóng góp.

**Phễu bắt đầu từ lúc đăng ký.** Giai đoạn trước đó do Google Analytics đo, và **không
cài trên landing page riêng của khách** — lưu lượng đó thuộc về khách, gộp vào là sai
cả số liệu lẫn quyền riêng tư.

## 4. Lịch chiến dịch & tài khoản Zalo chết

### `after_delay` và `once` đến backend là một

Giao diện chuyển `after_delay` thành `scheduleType: 'once'` **trước khi gửi**. Backend
**không có cách nào phân biệt** lịch "chạy sau 1 phút" với lịch `once` tường minh.

Nên **đừng áp biên thời gian tối thiểu ở backend** cho `once` — sẽ chặn nhầm luồng
"chạy sau 1 phút" mà người dùng vừa bấm.

Kiểm lịch trong quá khứ **chỉ áp cho `once`**, không áp cho `daily` / `weekly` /
`monthly` / `custom` — chúng lặp lại nên "quá khứ" không có nghĩa.

Giao diện chặn được người dùng thường nhưng không chặn được gọi API trực tiếp, nên vẫn
phải có kiểm ở backend — chỉ là kiểm đúng loại.

So thời gian phải theo **giờ Việt Nam**, không dùng `Date.now()` thô ở giao diện.

### Tài khoản Zalo chết thì ngừng đập

Kẻ đập chính là **keep-alive 5 phút**, không phải vòng khôi phục 15 phút. Sửa mỗi vòng
15 phút là không đổi gì.

Bộ đếm thất bại phải **nhích từ cả hai đường**, không thì đếm mãi không tới ngưỡng.

Dùng **ngưỡng theo thời gian im lặng**, đừng dùng ngưỡng thuần số lần — hai đường có
hai nhịp khác nhau, cùng một con số sẽ cho hai hành vi khác hẳn.

Trạng thái "cần quét QR lại" phải là **trạng thái riêng**, không dùng lại
`disconnected` — hai thứ khác nhau về hành động cần làm.

## 5. Chống lệch schema

Migration thêm bảng hoặc cột **bắt buộc mirror sang**
`backend/tests/integration/sql/bootstrap.sql`. Không mirror thì integration test đỏ,
hoặc tệ hơn là **xanh giả**. CI có job `schema-sync-check` chặn việc này.

Bài học đã trả giá: một lần merge dựng lại `bootstrap.sql` và làm rơi 5 dòng seed
`topup_pricing` cùng một ràng buộc — code bán hàng không sai dòng nào, nhưng test đỏ
và deploy đứng, vì món `chatbots` không còn trong bảng giá.

**Cổng gác luôn đỏ thì không ai đọc.** Đó chính là cách ba vụ lệch schema sống sót
được lâu như vậy. Vá DB mà không sửa kỳ vọng là để cổng đỏ vĩnh viễn.

---

## Bẫy đã dính — đọc trước khi sửa phần này

- **Đừng suy danh sách cron từ dữ liệu đã chạy** — đó chính là lỗi gốc của trang trạng
  thái. Job chưa chạy lần nào sẽ vô hình.
- **Đừng để `recordRun` ném lỗi ra ngoài làm chết cron.** Nó ghi `failure` rồi `throw`
  lại — chỗ gọi phải giữ `try/catch` sẵn có.
- **Đừng bọc cron chạy mỗi phút mà quên hạn dọn bảng.** Truy vấn lịch sử không lọc
  `job_code` sẽ quét toàn bảng.
- **Đừng viết `ADD CONSTRAINT` trần trong migration** — môi trường thật có thể đã có
  sẵn ràng buộc cùng vai, migration vỡ ngay. Kiểm `pg_constraint` trước.
- **Đừng đặt tên ràng buộc khác** với tên môi trường thật đang dùng — thành hai ràng
  buộc trùng vai.
- **Đừng tưởng gọi bộ chạy migration hai lần là kiểm được tính idempotent** — nó bỏ
  qua theo tên file, phải thực thi lại chính nội dung SQL.
- **Đừng thêm ràng buộc trước khi dọn dữ liệu** — migration fail giữa chừng.
- **Đừng backfill `payment_method` bằng giá trị mặc định** — sai nghĩa, làm lệch báo
  cáo doanh thu.
- **Đừng đổi FK sang `SET NULL`** trên bảng tài chính trước khi chốt — nó phá lịch sử.
- **Đừng quên sao lưu `orders`, `users`, `plans`** trước khi chạy migration sửa schema.
- **Đừng nhét logic kiểm lịch vào component giao diện** — tách ra helper mới unit test
  được.
- **Đừng sửa nhầm màn hình giám sát gửi tin** khi động tới trạng thái Zalo — chúng đếm
  bảng `zalo_accounts`, khác bảng với phần kết nối cá nhân.
