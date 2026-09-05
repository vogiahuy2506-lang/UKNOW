# Chương trình hoa hồng giới thiệu — quyết định kiến trúc

Tài liệu tham chiếu về cách hệ thống ghi nhận doanh thu giới thiệu, tính hoa hồng và
chi trả. Ghi lại **quyết định và lý do**, không phải hướng dẫn thi công — code là
nguồn sự thật về cách làm, tài liệu này giữ phần *vì sao* mà code không nói được.

Rút từ đợt triển khai 02–05/09/2026 (migration 180–184, 5 PR).

**Đây là module chạm tiền thật trả cho người ngoài.** Phần lớn quyết định dưới đây tồn
tại vì sai ở đây không revert được bằng một commit.

---

## 1. Chính sách là thứ đã hứa công khai — code phải khớp

Bậc hoa hồng lấy nguyên từ trang đã công bố cho khách
(`hanhchinh.ai.vn`, bài "Chính sách Đối tác — thu nhập đột phá đến 30% doanh thu"):

| Cấp | Doanh thu/tháng | Hoa hồng |
|---|---|---|
| 1 | Dưới 10.000.000đ | 10% |
| 2 | 10.000.000 – 20.000.000đ | 15% |
| 3 | 20.000.000 – 50.000.000đ | 20% |
| 4 | 50.000.000 – 100.000.000đ | 25% |
| 5 | Từ 100.000.000đ | 30% |

Kèm: ai đăng ký cũng nghiễm nhiên là Đối tác Cấp 1 (không xét duyệt); ngưỡng rút
1.000.000đ; khấu trừ 10% TNCN; KYC bằng CCCD + tài khoản ngân hàng trùng tên; chi trả
trong 7 ngày làm việc, kế toán chuyển khoản **thủ công**.

Bảng bậc nằm **một chỗ duy nhất**: `backend/src/utils/affiliateTier.util.js`. Frontend
chỉ hiển thị con số backend trả về, **không tự nhân lại tỉ lệ** — hai công thức song
song sẽ lệch nhau đúng vào lúc khách soi.

### Ba điểm trang công bố không nói, người viết plan quyết

1. **Doanh thu nào được tính**: **tổng doanh thu** — mua mới + gia hạn + nạp thêm.
   Số tiền lấy là số khách **thực trả sau voucher**. Trả hoa hồng trên số công ty chưa
   từng thu được là tự bán lỗ; voucher 100% sẽ thành hoa hồng thuần tuý âm tiền.
2. **Vượt bậc giữa tháng** → **một tỉ lệ duy nhất** cho toàn bộ doanh thu tháng đó,
   không lũy tiến từng bậc.
3. **Một cấp, không đa cấp.** A giới thiệu B, B giới thiệu C → A không hưởng gì từ C.

**Số dư và doanh thu tính bậc là hai đại lượng tách rời** (sếp nói rõ): số dư cộng dồn
mãi tới khi rút; doanh thu tính bậc reset về 0 mỗi tháng. Hoa hồng tháng 9 chưa rút
**không** cộng vào doanh thu tháng 10 để đẩy bậc.

> ⚠️ **Hệ quả vận hành cho super admin:** từ nay `payment_method='manual'` nghĩa là
> "khách đã trả tiền thật" và **sinh hoa hồng phải trả bằng tiền mặt**; `'free'` là
> "tặng" và không sinh gì. Gán nhầm `manual` cho tài khoản nội bộ/dùng thử là tự tạo
> ra một khoản nợ thật.

## 2. Không chốt được hoa hồng tại thời điểm mua hàng

Đây là hệ quả kỹ thuật quan trọng nhất, và nó quyết định toàn bộ hình dạng module.

Tỉ lệ phụ thuộc **tổng doanh thu cả tháng**, mà tổng đó chỉ biết khi tháng kết thúc.
Nên lúc thanh toán chỉ ghi được *doanh thu quy gán*; **cuối tháng đóng sổ** mới sinh
hoa hồng. Ba bảng, ba vai trò:

| Bảng | Vai trò | Sửa được không |
|---|---|---|
| `affiliate_revenue_events` | Doanh thu quy gán, 1 dòng/đơn | **Chỉ thêm** |
| `affiliate_periods` | Kết quả đóng sổ 1 tháng của 1 đối tác | Được sửa (đối soát) |
| `affiliate_ledger` | Sổ tiền, bút toán +/− | **Chỉ thêm** |

> Ai thiết kế theo kiểu "cộng hoa hồng ngay khi có đơn" sẽ phải viết lại từ đầu.

**Số dư = `SUM(affiliate_ledger.amount)`. Không có cột `balance` lưu sẵn ở đâu cả.**
Cột số dư lưu sẵn sẽ lệch với ledger đúng vào lần đầu có bug, và khi đó không ai biết
con số nào mới đúng.

## 3. Quét bảng `orders`, không móc vào code thanh toán

Có **ít nhất hai** đường tạo đơn `success`, không phải một:

- PayOS → `fulfillPaidOrder`
- Super admin gán gói tay → `createOrder({ status:'success' })` thẳng, **không** qua
  `fulfillPaidOrder`

Bản đầu của plan bảo móc vào `fulfillPaidOrder`. Làm vậy là **bỏ sót toàn bộ khách trả
tiền ngoài PayOS** — mất hoa hồng trong im lặng, không ai phát hiện cho tới khi khách
khiếu nại.

Cách đúng: một job `node-cron` chạy mỗi giờ quét bảng `orders`, lọc `status='success'`
+ `payment_method <> 'free'` + `amount > 0` + người mua có `referred_by_user_id`, rồi
`INSERT ... ON CONFLICT (order_id) DO NOTHING`. Ghi doanh thu trễ vài giờ không ảnh
hưởng gì vì hoa hồng dù sao cũng chỉ chốt cuối tháng.

Cách này **miễn nhiễm với đường tạo đơn thứ ba** mà ai đó thêm sau này: hễ đơn nằm
trong `orders` với `status='success'` là được quét.

**`UNIQUE (order_id)` là bắt buộc**, không phải tối ưu: webhook PayOS có retry và bắn
lặp là chuyện bình thường. Thiếu ràng buộc này là trả hoa hồng gấp đôi bằng tiền thật.

**Chỉ dùng `orders.amount`.** Bảng `orders` có 5 cột tiền nhưng `total_amount` /
`final_amount` **không dòng code nào từng ghi** — chúng NULL vĩnh viễn. Đừng bọc
`COALESCE` "cho an toàn": nó chỉ an toàn hôm nay, và ngày nào đó ai điền hai cột đó với
nghĩa khác thì doanh thu affiliate **đổi nghĩa trong im lặng**.

## 4. `month_key` — cái bẫy `AT TIME ZONE` đắt nhất trong repo

Một đơn rơi nhầm tháng có đòn bẩy rất lớn vì bậc là hàm bậc thang: doanh thu thật
9.900.000đ (bậc 1, 10%) mà lọt thêm một đơn 200.000đ của tháng sau thành 10.100.000đ
(bậc 2, 15%) — tỉ lệ mới áp cho **toàn bộ** tháng, hoa hồng nhảy từ 990.000đ lên
1.515.000đ chỉ vì một đơn 200.000đ đặt sai chỗ.

Ba cột thời gian của `orders` trên production **không cùng kiểu** — đã đo bằng
`\d orders`, và `bootstrap.sql` khai sai cả ba:

| Cột | Kiểu thật | Đang lưu gì |
|---|---|---|
| `paid_at` | `timestamptz` | **Mốc tuyệt đối** — muốn ra giờ VN phải đổi múi giờ |
| `created_at`, `updated_at` | `timestamp` (naive) | **Đã là giờ VN sẵn** — không đổi nữa |

`created_at`/`updated_at` là giờ VN vì app đặt `SET TIME ZONE 'Asia/Ho_Chi_Minh'` cho
mọi kết nối (`database.js`). Dòng nào tạo bằng `psql` qua `docker exec` (phiên mặc định
UTC) sẽ lệch 7 tiếng — luôn `SET TIME ZONE` khi thao tác tay trên bảng này.

Công thức đúng, đổi múi giờ **bên trong** `COALESCE`:

```sql
month_key = to_char(
  COALESCE(
    o.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh',  -- timestamptz -> giờ VN
    o.updated_at                                 -- ĐÃ là giờ VN, không đụng
  ), 'YYYY-MM')
```

**Vì sao không được gói cả hai rồi mới đổi múi giờ:** toán tử `AT TIME ZONE` có **ngữ
nghĩa ngược nhau** tuỳ kiểu đầu vào — với `timestamptz` nó *đổi sang* múi giờ đó, với
`timestamp` naive nó *hiểu giá trị vốn đã là* múi giờ đó. Gói chung khiến Postgres ép
`updated_at` theo timezone của **phiên đang chạy**:

| Đơn `manual` trả tiền 23:30 ngày 30/09 giờ VN | Phiên UTC (`docker exec psql`) | Phiên VN (app) |
|---|---|---|
| Công thức gói chung | **`2026-10`** ❌ | `2026-09` ✓ |
| Công thức hiện tại | `2026-09` ✓ | `2026-09` ✓ |

App luôn đặt VN nên công thức sai vẫn *chạy đúng trong app* — nhưng mọi truy vấn đối
soát tay đều cho sai tháng. Mà nghiệm thu cuối của module này **chính là đối soát tay
bằng psql**. Postgres không báo lỗi; chỉ có đơn cuối tháng lặng lẽ rơi sai chỗ.

**Đừng dùng `paid_at` trần.** Nó **NULL vĩnh viễn với đơn `manual`**: `createOrder`
không có cột đó trong câu INSERT, `paid_at` chỉ được set ở nhánh UPDATE riêng của
PayOS. **Cũng đừng dùng `created_at`** (lúc tạo đơn `pending`, trước lúc trả tiền hàng
phút) hay `updated_at` một mình (đổi theo *bất kỳ* lần sửa đơn về sau).

`month_key` **đóng băng ngay lúc ghi event** để lần sửa đơn sau không kéo nó đi.

> **Bài học rộng hơn:** bảng nào đụng tới tiền thì chạy `\d <bảng>` trên production
> trước, dán kết quả vào plan. Job `schema-sync-check` **không** đỡ được — bài đối chiếu
> ảnh chụp chỉ so **tên cột**, không so kiểu.

## 5. Đóng sổ ngày 2, và phải đối soát chứ không chỉ bỏ qua

Job đóng sổ chạy **03:00 ngày 2 hằng tháng, giờ VN**, đóng tháng liền trước.

Chính cơ chế làm job an toàn khi chạy lại (`ON CONFLICT ... DO NOTHING`) là cơ chế
**nuốt mất tiền** khi có event tới sau lúc đóng sổ: khách trả tiền 23:5x ngày cuối
tháng → webhook PayOS về muộn (nó có retry) → sweep tạo event với `month_key` của tháng
**đã đóng** → `DO NOTHING` → **không hoa hồng, không lỗi, không log**.

Hai lớp phòng, làm cả hai:

- **Dời lịch sang 03:00 ngày 2** — cửa sổ rủi ro co từ 30 phút xuống ~27 tiếng. Chậm
  một ngày không ảnh hưởng gì; hoa hồng chỉ để rút, không có SLA theo giờ.
- **Đối soát:** sau `DO NOTHING`, job **so lại tổng**. Nếu gross mới > gross đã đóng thì
  **tính lại bậc trên tổng mới**, ghi bút toán `adjustment` phần chênh, cập nhật lại
  `affiliate_periods`, log WARN.

**Tính lại bậc trên tổng mới là bắt buộc**, không được chỉ nhân tỉ lệ cũ cho phần chênh:
một đơn về muộn có thể đẩy tháng đó vượt bậc, và tỉ lệ mới áp cho **toàn bộ** tháng.

Nếu delta **âm** thì **dừng và báo**, đừng tự trừ tiền đã ghi cho khách.

Đơn bị huỷ/hoàn sau khi đã đóng sổ: **không sửa tháng đã đóng** — ghi một `adjustment`
âm ở thời điểm hiện tại. Sổ tháng cũ giữ nguyên để đối chiếu được, số dư tự khớp lại.

## 6. Người mua chưa có SĐT — treo lại, không vứt

Bản nháp đầu đề nghị thêm `AND buyer.phone IS NOT NULL` vào câu quét, tức **bỏ hẳn**
doanh thu của người mua chưa có SĐT. Sếp bác, và bác đúng: người mua không hề biết hành
động của mình khiến người giới thiệu mất tiền, còn người giới thiệu mất hoa hồng mà
không hiểu vì sao. Đó lại đúng loại "hỏng trong im lặng" mà cả module này viết ra để
tránh.

Thiết kế thay thế — **ghi nhận đủ, chỉ hoãn tính**:

1. Câu quét **không** lọc theo `phone`. Mọi đơn hợp lệ đều sinh event. Không mất dữ liệu.
2. Điều kiện đủ xét **lúc đóng sổ**: chỉ cộng vào `gross_revenue` những event mà người
   mua **đã có SĐT tại thời điểm đóng sổ**.
3. Nhờ đó nó **tự trở thành hợp lệ**: mua ngày 05/09 khi chưa có SĐT → modal nhắc hiện
   lại mỗi lần vào `/app` → nhập ngày 20/09 → đóng sổ 02/10 tính bình thường. Không ai
   phải làm gì thủ công.
4. Event chưa đủ điều kiện **không bị xoá**, và hiện ra ở giao diện: mục "Đang chờ đủ
   điều kiện" trên cả trang đối tác lẫn trang admin.

**Nguyên tắc rút ra:** SĐT là thứ **có thể bổ sung sau**, còn `month_key` thì đóng băng
ngay lúc quét. Xét sớm một điều kiện còn có khả năng thay đổi là tự vứt dữ liệu.

## 7. Chống gian lận — hàng rào thật và hàng rào tưởng tượng

Chặn `referred_by <> chính mình` chỉ chặn được trường hợp ngây thơ nhất. A mở tài khoản
B bằng email khác, nhập mã của A, mua gói bằng B → A hưởng 10% (bậc 5 là 30%). Thực chất
là tự giảm giá. **Mọi chương trình affiliate đều có lỗ này; không bịt kín được bằng code.**

Trạng thái thật, đừng nói quá:

| | Có chặn không |
|---|---|
| Đăng ký bằng email/mật khẩu | **Có tốn một SĐT thật** — form bắt buộc nhập, và `idx_users_phone_unique` áp một SĐT một tài khoản |
| Đăng ký bằng **Google** | **Không chặn gì.** `googleLogin` tạo user không có cột `phone`; route thanh toán chưa bao giờ bị cổng SĐT chặn |

Nghĩa là một người có vài Gmail vẫn mở được nhiều tài khoản và tự ăn hoa hồng của mình.
Điều kiện "phải có SĐT mới được tính" ở mục 6 nâng chi phí gian lận lên đúng mức mà một
dòng SQL làm được — mỗi tài khoản rác tốn một số thật — nhưng không hơn.

Phần còn lại giao cho **cảnh báo mềm ở màn hình duyệt rút**: trùng SĐT, trùng tên chủ
tài khoản ngân hàng, hoặc trùng số tài khoản giữa người rút và người mua dưới họ.
**Không tự động chặn** — kế toán nhìn rồi quyết. Chặn tự động sẽ chặn nhầm người nhà
thật sự giới thiệu nhau.

## 8. Luồng rút tiền — thứ tự các bước là phần quan trọng nhất

Tất cả trong **một transaction**:

1. **Khoá bằng `pg_advisory_xact_lock(hashtext(ns), hashtext(userId))`.**
2. Tính số dư `SELECT SUM(amount) FROM affiliate_ledger WHERE user_id = $1`.
3. Chặn nếu: số xin rút < 1.000.000đ, hoặc > số dư, hoặc đang có yêu cầu `pending`.
4. Tính thuế, `INSERT affiliate_withdrawals` (`pending`).
5. **`INSERT affiliate_ledger (withdrawal, −amount_gross)` NGAY LẬP TỨC.**
6. COMMIT, **rồi mới** gửi email báo nội bộ.

**Vì sao không dùng `SELECT SUM(...) FOR UPDATE`:** Postgres không cho `FOR UPDATE` đi
kèm hàm gộp — lỗi cú pháp ngay khi chạy (đã thử thật, không phải suy luận). Nhưng vấn đề
sâu hơn cú pháp: `affiliate_ledger` là bảng **chỉ-thêm**, không có dòng nào đại diện cho
"tài khoản" của user để khoá. Khoá các dòng *đang có* không chặn được transaction song
song **INSERT dòng mới** — nên kể cả sửa đúng cú pháp, khoá theo dòng vẫn để lọt hai
yêu cầu rút song song cùng đọc số dư cũ.

**Vì sao trừ ngay ở bước 5 chứ không đợi kế toán chuyển tiền:** đợi thì user bấm rút
mười lần trước khi kế toán kịp xử lý cái đầu tiên, và số dư vẫn đủ cả mười lần. Admin
bấm "Đã chuyển khoản" → chỉ đổi `status='paid'`, **không** ghi thêm ledger. Admin "Từ
chối" → `adjustment` cộng lại, bắt buộc nhập lý do.

**`idx_affiliate_withdrawals_one_pending`** (partial unique `WHERE status='pending'`) là
chốt chặn ở tầng DB cho ca "bấm rút hai lần thật nhanh", kể cả khi ai đó gọi thẳng
service bỏ qua tầng kiểm. Controller đổi lỗi `23505` thành đúng câu thông báo của tầng
service, không trả 500 thô.

**Ngưỡng 1.000.000đ áp cho số tiền xin rút, không phải chỉ cho số dư.** Trang công bố
viết *"chỉ từ 1.000.000đ số dư"*; nếu chỉ kiểm số dư thì người có 5tr vẫn xin rút được
20.000đ và kế toán phải chuyển khoản tay từng món lặt vặt — đúng thứ ngưỡng tối thiểu
sinh ra để tránh. Hệ quả chấp nhận: phần dư dưới 1tr kẹt lại tới khi tích đủ.

## 9. Hai loại đối tác — mượn khuôn hoá đơn, đừng chế cái mới

Phân đôi `personal` / `company` **giống hệt** module hoá đơn (`invoiceVat.util.js`), và
**dùng lại đúng hai regex của nó** (`TAX_CODE_REGEX`, `ID_NUMBER_REGEX`). Hai chỗ kiểm
cùng một loại giấy tờ mà lệch nhau là lớp lỗi repo đã dính với SĐT — cùng một số, hai
màn hình, hai câu trả lời khác nhau.

| | `personal` | `company` |
|---|---|---|
| Khấu trừ | **10% TNCN** | **0** |
| Digiso cấp | Chứng từ khấu trừ TNCN | Không |
| Đối tác cấp | Không | Hoá đơn dịch vụ → `invoice_reference` |

Form rút **điền sẵn từ `users.invoice_profile`** nếu người đó từng mua gói có lấy hoá
đơn. Ít gõ hơn là phụ; cái chính là **tránh cùng một người khai hai bộ giấy tờ lệch
nhau**, rồi kế toán phải đoán bộ nào đúng lúc lập chứng từ.

**Nhánh `company` chưa mở** — chặn ở tầng ứng dụng bằng một câu rõ ràng cho tới khi kế
toán trả lời quy trình. Các cột theo-nhánh (kể cả `id_card_number_enc`, `tax_code`) đều
**nullable có chủ đích**: một bảng phục vụ hai loại hồ sơ thì không cột nào bắt buộc cho
cả hai; ràng buộc đặt ở tầng ứng dụng. Nhờ vậy câu trả lời nào của kế toán cũng **không
phải sửa migration**.

## 10. Dữ liệu nhạy cảm và bảo vệ khỏi xoá

- **CCCD mã hoá tại chỗ lưu**, khoá riêng `AFFILIATE_PII_SECRET_KEY` — **không** dùng lại
  `SMTP_SECRET_KEY`. Khoá này **không bao giờ được đổi**: đổi là mọi CCCD đã lưu không
  giải mã lại được, không có đường khôi phục.
- **CCCD không bao giờ vào email.** Kế toán mở trang admin để xem. Email đi qua nhiều
  chặng và nằm lại trong hộp thư mãi mãi.
- **Mọi khoá ngoại tới `users` là `ON DELETE RESTRICT`, không phải `CASCADE`.** Đây là sổ
  tiền. Repo **có** đường xoá cứng thật (`DELETE /api/admin/members/:id/purge`), và chốt
  chặn trước đó (`findPurgeBlockers`) vốn chỉ kiểm `orders` + marketplace — một người
  giới thiệu có hoa hồng mà **chưa từng tự mua gì** sẽ lọt qua như "tài khoản sạch".
  `RESTRICT` là thứ thật sự chặn; mở rộng `findPurgeBlockers` chỉ để admin đọc được đúng
  lý do thay vì câu 409 chung chung.
- **`referral_code` là ngoại lệ của luật "cột UNIQUE phải giải phóng khi xoá mềm"**
  (xem [số điện thoại & đồng bộ Sheet](so-dien-thoai-va-dong-bo-sheet.md) mục 4). Mã đã
  phát tán trong các link giới thiệu ngoài đời; giải phóng rồi cấp lại cho người khác
  nghĩa là link cũ bỗng quy công cho người mới — **đổi dòng tiền trong im lặng**. Không
  gian mã 32⁸ ≈ 1,1 nghìn tỷ nên giữ lại mã chết chẳng tốn gì.
- **Gán một lần, không bao giờ đổi.** `referred_by_user_id` gán lúc đăng ký và không có
  API nào sửa được, kể cả admin. Đổi người giới thiệu là đổi dòng tiền.
- **Mã giới thiệu sai không được chặn đường đăng ký.** Gõ nhầm thì bỏ qua phần gán, vẫn
  cho tạo tài khoản. Mất một lượt quy gán còn hơn mất một khách.

## 11. Vận hành

| Biến | Ý nghĩa |
|---|---|
| `AFFILIATE_CLOSING_ENABLED` | Job đóng sổ. Trên `NODE_ENV=production` **mặc định tắt**, phải đặt `true` mới chạy; ngoài production thì mặc định **bật** (đặt `false` để tắt) |
| `AFFILIATE_PII_SECRET_KEY` | Khoá mã hoá CCCD. **Không bao giờ đổi** |
| `AFFILIATE_NOTIFY_EMAIL` | Nơi nhận email báo có yêu cầu rút. Mặc định `hotro.digibook@gmail.com` |

Cờ đóng sổ **mặc định tắt trên production nhưng bật ở dev/test** là có chủ đích: test
phải chạy được job mà không cần dựng env, còn production thì không được tự đóng sổ trước
khi có người quyết định.

**Bật `AFFILIATE_CLOSING_ENABLED` sớm, kể cả khi chưa có doanh thu.** Đã đo: chạy đóng
sổ trên DB rỗng trả `noop` và ghi **0 dòng** — không có rủi ro để phòng. Bật sớm thì
03:00 ngày 2 hằng tháng có một dòng `noop` trong `cron_job_runs` **chứng minh cron còn
sống**; để tắt thì lần đầu job chạy trong đời cũng chính là lần đầu nó đụng tiền thật.

Kiểm cron:

```sql
SELECT job_code, status, started_at FROM cron_job_runs
 WHERE job_code IN ('affiliate_revenue_sweep','affiliate_month_closing')
 ORDER BY started_at DESC LIMIT 6;
```

`noop` = chạy tốt, không có gì để làm. `success` của **month_closing** nghĩa là **tiền
đã vào ví ai đó**.

Đóng bù khi cron lỡ (VPS restart, mất điện):
`node backend/scripts/closeAffiliateMonth.js 2026-09`.

**Chốt chặn thật không phải cái cờ, mà là phép cộng tay.** Tháng đầu tiên có doanh thu
thật phải lấy toàn bộ đơn `success` của tháng, cộng bằng máy tính, so với
`affiliate_periods.commission_amount` — **trước khi duyệt bất kỳ yêu cầu rút nào**.
Bảng test xanh không thay được phép cộng đó. Tiền vào sổ chưa phải tiền ra khỏi túi:
còn ngưỡng 1 triệu, đối tác phải tự yêu cầu, admin phải bấm duyệt.

## 12. Mốc biên là chỗ khách sẽ khiếu nại

Bảng này là ca test bắt buộc, và cũng là bảng để đối chiếu tay:

| Doanh thu tháng | Bậc | Tỉ lệ | Hoa hồng |
|---|---|---|---|
| 9.999.999đ | 1 | 10% | 1.000.000đ |
| 10.000.000đ | 2 | 15% | 1.500.000đ |
| 19.999.999đ | 2 | 15% | 3.000.000đ |
| 20.000.000đ | 3 | 20% | 4.000.000đ |
| 50.000.000đ | 4 | 25% | 12.500.000đ |
| 99.999.999đ | 4 | 25% | 25.000.000đ |
| 100.000.000đ | 5 | 30% | 30.000.000đ |

`ROUND` về đồng (VND không có xu), **một lần, một chỗ** trong `affiliateTier.util.js`.

Giao diện hiển thị tiền **luôn kèm cả ba số**: gộp, thuế 10%, thực nhận. User thấy
1.000.000đ rồi nhận về 900.000đ mà không được báo trước là một khiếu nại chắc chắn
xảy ra.

## 13. Còn chờ người, không chờ code

1. **Kế toán**: chứng từ khấu trừ có cần MST cá nhân không? Quy trình đối tác doanh
   nghiệp (chờ hoá đơn rồi mới chuyển tiền, hay ngược lại)? Và câu ít ai nhớ hỏi nhất —
   để khoản chi hoa hồng được tính là **chi phí được trừ** khi quyết toán, có cần **hợp
   đồng cộng tác viên ký trước** không? Nếu có thì phải thêm bước ký **ngay trong hệ
   thống**, chứ không thể tới lúc chi tiền mới phát hiện thiếu giấy.
2. **Sếp**: công bố chương trình khi nào. Trang `hanhchinh.ai.vn` vẫn thiếu điều khoản
   chống gian lận và quyền thay đổi/dừng chương trình — mục 15 Điều khoản Sử dụng trong
   sản phẩm thì đã có.
