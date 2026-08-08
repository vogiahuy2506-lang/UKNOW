# Mua thêm hạn mức — quyết định kiến trúc

Tài liệu tham chiếu về cách hệ thống bán và thu hồi tài nguyên mua lẻ. Ghi lại
**quyết định và lý do**, không phải hướng dẫn thi công — code là nguồn sự thật về
cách làm, tài liệu này giữ phần *vì sao* mà code không nói được.

Rút từ các plan đã ship tháng 08/2026: hai mô hình mua thêm, khoá tài nguyên,
tắt bán nhân viên, mua slot nhiều tháng.

---

## 1. Hai mô hình, không phải một

Tài nguyên mua thêm chia làm hai nhóm có bản chất khác hẳn nhau:

| Nhóm | Gồm | Mô hình | Vì sao |
|---|---|---|---|
| **Tiêu hao** | Tin Zalo, email, credit AI | Ví mua đứt, **không hết hạn** | Đã thu tiền cho 300 tin thì phải giao đủ 300 tin, không phụ thuộc khách dùng nhanh hay chậm |
| **Cấu trúc** | TK Zalo/Email, landing page, chatbot, nhân viên | Slot **thuê theo tháng** | Là năng lực, tốn chi phí vận hành liên tục (phiên zca-js, keep-alive, tên miền, SSL, lưu trữ vector). Bán đứt bằng một lần trả tiền là lỗ dần theo thời gian |

Hai nhóm dùng chung bảng `topup_grants`, phân biệt bằng `cycle_end`:
**`NULL` = ví vĩnh viễn**, có giá trị = slot có hạn. Ràng buộc
`topup_grants_consumable_no_expiry` (migration 110) chặn ghi sai ngay tại chỗ ghi.

> **Đừng gộp hai nhóm làm một.** Ví là *tiêu hao*, slot là *năng lực* — gộp vào là
> dựng một trừu tượng sai rồi phải gỡ.

## 2. Ví phải trừ dần, không được nâng trần

Đây là quyết định dễ làm sai nhất, và làm sai thì **mất tiền âm thầm**.

Cách cũ là cộng phần mua thêm vào trần:

```
trần    = hạn mức gói (2.000) + mua thêm (300) = 2.300
đã dùng = đếm tin trong chu kỳ   ← reset mỗi kỳ
```

Nếu bỏ hạn để grant sống mãi theo cách này, mỗi kỳ **"đã dùng" reset về 0 mà trần
vẫn 2.300** → khách trả tiền một lần, nhận thêm 300 tin **mỗi tháng mãi mãi**.

Nên ví là **số dư riêng, trừ dần**: `SUM(grants) − SUM(debits)`, không đụng vào trần
của gói. Bảng `topup_debits` có `UNIQUE (item_key, source_key)` để mỗi tin chỉ bị
trừ đúng một lần.

Thứ tự tiêu: **hạn mức gói trước, hết mới trừ ví** — để phần khách đã trả tiền được
giữ lâu nhất có thể.

Trừ **cùng transaction với lúc ghi tin đã gửi**, không phải lúc xếp hàng hay lúc
gọi API. Ví được phép âm chút ít; **đừng ràng buộc "tổng tiêu ≤ tổng nạp" ở tầng
DB** — ràng buộc đó sẽ ném lỗi giữa lúc đang gửi.

## 3. Slot có mốc hết hạn độc lập

Grant cấu trúc ghi `cycle_end = NOW() + 30 ngày × số tháng mua`, **không neo theo
`subscription_expires_at`**.

Neo theo ngày hết gói gây hai vấn đề, cả hai đều làm khách thiệt:
- Mua sát cuối kỳ → trả tiền cả tháng, dùng được vài ngày
- Gia hạn gói → mất luôn slot vừa mua

Khách chọn 1 / 3 / 6 / 12 tháng (`TOPUP_ALLOWED_MONTHS`,
[`topupPricing.util.js`](../backend/src/utils/topupPricing.util.js)). Số tháng bị
chặn theo thời gian gói còn lại — không bán slot dài hơn gói.

## 4. Hết hạn thì khoá, không xoá

Trước khi có cơ chế này, hệ thống bán slot "theo tháng" nhưng **không thu hồi được
gì** — trả tiền một tháng là giữ mãi.

Cách xử lý:

| Nguyên tắc | Thực hiện |
|---|---|
| Không xoá dữ liệu khách | Thêm dòng vào `topup_locked_resources` (migration 111). Có dòng = đang khoá, xoá dòng = mở khoá. Nội dung landing page, chatbot, kết nối tài khoản vẫn nguyên |
| Khách tự chọn giữ cái nào | `GET/PUT /api/topup/locks`, tab **Tài nguyên khoá** trong hub Gói & Thanh toán |
| Trả tiền là mở ngay | Gọi đối chiếu ngay trong transaction ở các đường thanh toán, không đợi cron |
| Nhắc trước | Cron 08:00 gửi email trước 7 và 3 ngày, đếm riêng trên `topup_grants.reminder_count` |

**Đừng dùng lại `is_active` / `status` làm cờ khoá** — làm vậy là mất lựa chọn của
khách khi mở khoá. Phải là bảng riêng.

**Hàm đối chiếu phải hai chiều.** Bản plan đầu tiên chỉ làm chiều khoá, nghĩa là
khách trả tiền xong vẫn bị khoá vĩnh viễn. Một hàm tính từ trạng thái hiện tại (nên
chạy lại bao nhiêu lần cũng ra cùng kết quả), gọi ở cả cron lẫn đường thanh toán.

### Phạm vi khoá: chặn gửi ra, không chặn nhận vào

Đây là câu hỏi sản phẩm, phải trả lời trước khi viết dòng code nào — nó quyết định
phải vá mấy chỗ.

| Vẫn chạy khi bị khoá | Bị chặn khi bị khoá |
|---|---|
| Nhận tin đến, lưu vào hộp thư | Gửi tin ra (chiến dịch + trả lời tay từ inbox) |
| Giữ session sống (keep-alive, khôi phục cookie) | Chọn làm tài khoản gửi khi tạo chiến dịch |
| Xem lịch sử hội thoại | Bot AI tự trả lời |

**Chặn nhận là làm mất dữ liệu khách hàng của họ** — tin gửi tới trong lúc bị khoá
sẽ biến mất vĩnh viễn, gia hạn cũng không lấy lại được. Đòi 50.000đ bằng cách xoá
liên hệ khách hàng của người ta là không tương xứng.

### Cổng gác nằm ở đường dùng, không phải đường tạo

Lỗ hổng ban đầu là chỉ gác lúc tạo mới. Cổng phải nằm ở đường **dùng**: gửi chiến
dịch, trả lời tay, landing công khai, widget chatbot, Zalo OA, Facebook.

Dùng **một helper tập trung**
([`topupLock.service.js`](../backend/src/services/payment/topupLock.service.js)),
đừng rải `NOT EXISTS` vào từng câu SQL — riêng `zalo_settings` đã bị đọc ở ít nhất
năm nơi độc lập, rải ra là công thức để sót.

Kiểm tra khoá **fail-open khi DB lỗi**: đây là chốt doanh thu, không phải rào bảo
mật. Chặn nhầm khách đang trả tiền tệ hơn nhiều so với lọt một lượt gửi.

## 5. Luật bán hàng

| Luật | Vì sao |
|---|---|
| Chỉ chủ tài khoản mua được (`OWNER_ONLY`) | Nhân viên không được tự tiêu tiền của chủ |
| Đơn tối thiểu 50.000đ | Dưới mức này phí thanh toán ăn gần hết |
| Ân hạn chỉ mua được món tiêu hao | Không bán thêm chỗ chứa cho tài khoản quá hạn |
| Phải nối TK Zalo trước khi mua tin | Mua tin không có tài khoản gửi thì tiền nằm chết |
| Không mua tin vượt năng lực gửi thật | Mỗi TK Zalo gửi được ~16.000 tin/tháng — bán quá là bán thứ không giao được |
| Đơn giá mua lẻ **cao hơn** trong gói | Nếu ngược lại, khách tự lắp gói rẻ hơn và cả bảng giá sụp |

## 6. Nhân viên — tạm dừng bán

Migration 112 đặt `is_active = FALSE` cho `employees` trong `topup_pricing`.

Lý do: các món khác hết hạn thì khoá rồi mở lại được, nhưng tài khoản nhân viên gắn
với người thật đang làm việc — khoá đột ngột giữa chừng ảnh hưởng trực tiếp vận hành
của khách. Chờ quyết định: bán đứt theo suất, hay giữ theo tháng với ân hạn dài.

> **Chỉ tắt bảng giá, đừng bỏ `'employees'` khỏi `TOPUP_STRUCTURAL_KEYS`.** Bỏ key là
> đổi nhánh xử lý của grant đã bán cho khách trước đó.

---

## Bẫy đã dính — đọc trước khi sửa phần này

- **Đừng để sót một bộ lọc `cycle_end` nào.** Nó bị chép tay ra 4 chỗ, không nằm gọn
  trong một hàm. Sót một chỗ là hiển thị một đằng, tiêu một nẻo.
- **Đừng test ví trong một chu kỳ rồi kết luận là xong.** Lỗi nặng nhất chỉ lộ ra khi
  **gia hạn gói** — đó là lúc trần reset.
- **Đừng giả định trần gói nào cũng nằm ở `users`.** `max_chatbots` nằm ở `plans`.
  Đọc nhầm ra `undefined` → khoá sạch chatbot của mọi khách.
- **Đừng chuẩn hoá cách đếm cho đẹp.** `chatbots` lọc `is_active`, ba món kia không.
  Giữ đúng ngữ nghĩa của cổng gác lúc tạo.
- **Đừng tin tên hàm — mở SQL ra đọc.** `findWidgetByKey` truy vấn
  `web_widget_configs`, không phải `custom_chatbots`.
- **Đừng gác ở hàm có caller trộn loại.** `findChatbotById` phục vụ cả đường công khai
  lẫn Studio của chủ shop — gác ở đó là khoá chính chủ ra khỏi sản phẩm họ đã trả
  tiền. Mặc định gác ở caller.
- **Đừng tin mỗi `grep` SQL để tìm callsite.** Có chỗ gọi hàm mà không chứa câu SQL
  nào — grep không thấy, phải lần theo caller.
- **Đừng bỏ qua dòng khoá mồ côi.** Khách xoá tài nguyên đang bị khoá thì dòng khoá
  còn lại trỏ vào hư không; đối chiếu phải dọn trước khi tính.
- **Đừng dựng cron nhắc mới** — cron 08:00 đã có, thêm nhánh vào đó.
- **Đừng dùng nguồn "user hết hạn gói" cho việc đối chiếu khoá.** Ca chính là **còn
  gói mà hết hạn grant**. Dùng nhầm nguồn thì code viết đúng hết mà tính năng không
  chạy cho ai cả.
