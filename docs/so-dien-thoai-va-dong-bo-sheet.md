# Số điện thoại người dùng & đồng bộ danh sách thành viên — quyết định kiến trúc

Tài liệu tham chiếu về cách hệ thống thu thập, ràng buộc và đồng bộ số điện thoại
người dùng. Ghi lại **quyết định và lý do**, không phải hướng dẫn thi công — code là
nguồn sự thật về cách làm, tài liệu này giữ phần *vì sao* mà code không nói được.

Rút từ đợt triển khai 02–04/09/2026, gồm cả một sự cố production mà phần lớn các
quyết định dưới đây sinh ra để tránh lặp lại.

---

## 1. SĐT là LỜI NHẮC, không phải cổng chặn

Đây là quyết định quan trọng nhất, và nó **đảo ngược thiết kế ban đầu**.

| | Bản đầu (đã bỏ) | Bản hiện tại |
|---|---|---|
| Modal | Không đóng được, không có nút X | Có nút **"Để sau"**, bấm ra ngoài cũng đóng |
| Backend | `requirePhone` trả 403 ở 13+ nhóm route | Tắt bằng `PHONE_GATE_ENABLED=false` |
| Nhắc lại | Không cần — chặn cho tới khi nhập | Mỗi lần vào `/app`; state giữ trong bộ nhớ, **cố ý không lưu `localStorage`** |

**Vì sao đổi:** cổng chặn nằm ở backend, nhưng lối thoát duy nhất — modal nhập SĐT —
nằm ở frontend. Người dùng nào còn giữ bundle JS cũ trong cache trình duyệt sẽ **bị
403 ở mọi tính năng mà không thấy modal nào để tự gỡ**. Ngày 04/09/2026 việc này xảy
ra thật trên production.

> **Luật rút ra, áp cho mọi tính năng sau này:** cổng chặn ở tầng server mà lối thoát
> chỉ có ở tầng client là thiết kế hỏng. Người dùng không điều khiển được phiên bản
> client họ đang chạy.

**Hệ quả phải chấp nhận:** không ép được nữa thì sẽ có người không bao giờ nhập SĐT.
Nếu một nghiệp vụ *bắt buộc* phải có SĐT thì **chặn ngay tại nghiệp vụ đó** (ví dụ
lúc mua gói), đừng bật lại cổng chặn toàn hệ thống.

`PHONE_GATE_ENABLED` giữ mặc định **bật** trong code để test và môi trường dev không
đổi hành vi; production tắt bằng biến môi trường. Bật lại cổng mà vẫn cho đóng modal
sẽ tệ hơn cả bản đầu: người dùng bấm "Để sau" rồi ăn 403 ở mọi nơi.

## 2. Một số điện thoại chỉ gắn một tài khoản

`idx_users_phone_unique` là **partial unique index** — `WHERE phone IS NOT NULL`.
NULL vẫn được phép trùng nhau, vì phần lớn tài khoản cũ chưa có số và không thể ép
họ nhập ngược về quá khứ.

Ràng buộc này không chỉ để dữ liệu sạch. Nó là **hàng rào cấu trúc chính chống việc
một người mở nhiều tài khoản** — quan trọng khi có chương trình hoa hồng giới thiệu,
vì mở tài khoản phụ giờ tốn một số điện thoại thật chứ không chỉ một địa chỉ email.
Đừng nới ràng buộc này mà không cân nhắc chỗ đó.

**Trước khi bật ràng buộc trên dữ liệu có sẵn phải dọn số trùng.** Chạy
`backend/scripts/normalizeUserPhones.js --dry-run` để liệt kê mọi nhóm trùng; script
**cố ý từ chối** `--apply` khi còn nhóm trùng, vì chọn tài khoản nào giữ số là quyết
định của con người, không phải của script.

**Nguyên tắc chọn khi có nhóm trùng:** giữ số ở tài khoản **có người đăng nhập thật**
(đó là tài khoản sẽ gặp modal); tài khoản chưa ai đăng nhập thì gỡ số không phiền ai.
Nếu **cả hai** đều là tài khoản chết thì gỡ cả hai — giữ số trên tài khoản chết là
khoá số lại vô ích, trong khi người thật đang dùng một tài khoản khác cần nó.
`users.last_login_at` đáng tin cho việc này: nó được ghi ở **cả** đường đăng nhập
thường lẫn Google.

## 3. Chuẩn hoá SĐT chỉ có một nguồn sự thật

Mọi nơi nhận SĐT đều phải đi qua `normalizePhoneForZaloCampaign()` rồi
`isValidNormalizedPhoneLength()` — cùng cặp hàm mà module Zalo dùng.

**Tầng route KHÔNG được có regex định dạng riêng.** Đây là lỗi đã mắc hai lần: route
kiểm `^[0-9]{10,11}$` nên chặn `+84 912 345 678` bằng lỗi 400 *"không hợp lệ"*, trong
khi controller phía sau thừa sức chuẩn hoá số đó và lẽ ra phải trả 409 *"đã được dùng
cho tài khoản khác"*. Cùng một số, hai màn hình, hai câu trả lời khác nhau.

Route chỉ kiểm **có mặt hay không** (`notEmpty`); chuẩn hoá và kiểm độ dài là việc của
controller. Frontend dùng chung `isPlausiblePhone()` cho **mọi** ô nhập SĐT — hiện có
ba chỗ (đăng ký, modal nhắc, sửa hồ sơ), thêm chỗ thứ tư thì dùng lại hàm đó.

## 4. Thêm trường định danh UNIQUE thì phải sửa đường giải phóng định danh

Xoá mềm tài khoản (`detachMemberEmail`) đổi `email` và `username` sang dạng
`freed+<id>@deleted.local` để hai trường UNIQUE đó dùng lại được. Khi thêm `phone`
làm trường UNIQUE thứ ba, bước này **bị quên** — hậu quả là mỗi tài khoản xoá mềm
giam vĩnh viễn một số điện thoại, và chính chủ không lấy lại được vì tài khoản
`deleted` không đăng nhập nổi (`resolveUserContext` chỉ nhận `active` /
`pending_activation`).

> Thêm bất kỳ cột UNIQUE nào vào `users` thì phải quay lại `detachMemberEmail` giải
> phóng cột đó.

## 5. Thêm field vào danh tính thì phải luồn qua đủ bốn chốt

`req.user` được dựng lại **từ DB mỗi request** bởi `resolveUserContext`. Thêm cột vào
`users` mà quên đưa vào các câu SELECT dựng danh tính thì frontend không bao giờ thấy
field đó — và một cổng đọc field ấy sẽ chặn 100% người dùng.

Bốn chốt bắt buộc:

1. `resolveUserContext` — **cả hai** câu SELECT, kể cả nhánh trong `catch`
2. `formatUser` (dùng chung cho `login` / `register` / `googleLogin`)
3. `GET /api/auth/me`
4. `GET /api/users/profile`

**Ca nghiệm thu bắt được lỗi này: đăng nhập rồi F5.** Kiểm ngay sau khi đăng nhập
không ăn thua vì state frontend còn giữ giá trị cũ, che mất lỗi.

Lớp lỗi này đã dính hai lần: với `must_change_password`, rồi với `phone`. Đường Google
đăng nhập cũng phải đi trọn hai đầu — nó là **đường đăng ký thật**, không phải chỉ
đăng nhập.

## 6. Đồng bộ danh sách thành viên sang Google Sheet

Webhook Apps Script, cấu hình bằng `MEMBER_SHEET_WEBHOOK_URL` +
`MEMBER_SHEET_WEBHOOK_SECRET`. Thiếu biến thì hàm đồng bộ **im lặng không làm gì** —
có chủ đích, để môi trường dev không bắn dữ liệu ra ngoài.

Ba quyết định đáng nhớ:

- **Fire-and-forget.** Đồng bộ Sheet không được làm hỏng việc đăng ký. Sheet lỗi thì
  ghi log, không chặn người dùng tạo tài khoản.
- **Upsert theo email, không `appendRow` trần.** Người dùng sửa SĐT là ghi đè dòng cũ;
  append trần sẽ đẻ dòng trùng mỗi lần sửa.
- **Cột SĐT phải đặt định dạng văn bản** (`setNumberFormat('@')`) trước khi ghi. Để
  mặc định thì Google Sheets hiểu `0912345678` là **số** và nuốt số 0 đầu thành
  `912345678` — số đó không gọi được, không nhắn Zalo được, tức cả việc đồng bộ mất ý
  nghĩa. Đặt định dạng **không** khôi phục được số 0 đã mất: phải xoá dòng cũ rồi chạy
  lại `backend/scripts/backfillMemberSheet.js`.

Sửa code Apps Script xong **bắt buộc tạo Phiên bản mới** trong bản triển khai đang có
(đừng tạo bản triển khai mới — URL sẽ đổi). Apps Script không tự áp code mới vào URL
đã deploy, và không có gì báo cho biết.

## 7. Thứ tự phát hành: backend trước frontend

Khi frontend có một cổng/điều kiện phụ thuộc field hoặc route **mới** của backend,
**backend phải lên trước**.

Ngày 04/09/2026 deploy backend đỏ 6 lần liên tiếp trong ~10 tiếng mà không ai biết,
trong khi deploy frontend dùng workflow riêng nên vẫn lên đều. Frontend mới mở modal
dựa vào `user.phone`; backend cũ không trả field đó và cũng chưa có route để nhận SĐT
— kết quả là mọi người dùng không phải admin bị nhốt trong một modal báo
*"Route not found"*.

Kiểm backend production đang chạy bản nào bằng một điểm chỉ có ở bản mới, ví dụ gọi
`POST /api/auth/register` với body rỗng và xem danh sách lỗi validator có `phone` hay
chưa. **Đừng** thử gọi một route để đoán nó có tồn tại không — auth middleware chạy
trước routing nên route không tồn tại cũng trả 401 y hệt route thật.
