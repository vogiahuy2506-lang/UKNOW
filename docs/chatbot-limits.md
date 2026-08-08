# Giới hạn & bàn giao của chatbot AI — quyết định kiến trúc

Tài liệu tham chiếu về cách hệ thống giới hạn lượt bot trả lời, xử lý khi chủ tài
khoản tiếp quản hội thoại, và báo tin gửi hỏng. Ghi lại **quyết định và lý do**;
code là nguồn sự thật về cách làm.

Rút từ các plan đã ship tháng 08/2026: giới hạn trả lời chatbot, hiện giới hạn hệ
thống, tự bật lại AI sau handoff, hộp thư báo gửi hỏng.

---

## 1. Giới hạn theo tầng, chạm là dừng ngay

Bốn tầng, xét theo thứ tự và **trả về ngay khi chạm**:

```
phút/người → giờ/người → ngày/người → trần chủ đặt → giờ/chatbot
```

Mặc định: 8 lượt/phút, 20 lượt/giờ, 50 lượt/ngày cho mỗi người gửi; 500 lượt/giờ cho
cả chatbot. Tất cả đọc từ biến môi trường
([`chatbotRateLimit.service.js`](../backend/src/services/chatbot/chatbotRateLimit.service.js)).

**Chạm tầng nào là trả về ngay, không tăng đếm của tầng sau.** Sai chỗ này thì kẻ
spam ăn hết trần ngày của chủ tài khoản chỉ bằng cách gửi dồn trong một phút.

## 2. Chạm mốc ngắn thì im lặng, mốc dài mới báo

| Chạm mốc | Hành vi | Vì sao |
|---|---|---|
| Phút / giờ theo người | **Im lặng**, không gọi AI, không gửi gì | Người dùng thường gõ một ý thành nhiều dòng liên tiếp — chen câu tự động vào giữa gây khó chịu |
| Ngày theo người, trần chủ đặt, giờ theo chatbot | Báo **đúng một câu**, một lần trong cửa sổ | Im lặng cả ngày thì khách tưởng bị bỏ rơi |

Danh sách mốc được báo nằm ở `NOTIFY_REASONS`.

Câu báo nhận về phía hệ thống, **không đổ lỗi cho khách**. Câu cũ *"Bạn gửi hơi
nhanh"* đã bỏ.

**Không nói con số hay cửa sổ thời gian với khách** — vừa lộ cấu hình, vừa mời người
ta lách.

> **Rủi ro đã chấp nhận:** khách Zalo gửi tin thứ 21 đến 50 trong một giờ sẽ không
> nhận được gì và không biết vì sao. Đây là cái giá của việc không làm ồn. Chấp nhận
> được vì mốc ngày vẫn báo, nhưng phải biết mình đang đánh đổi gì.

**Web chat là ngoại lệ** — nó là request/response, không trả gì thì widget treo. Web
luôn phải trả về một cái gì đó.

## 3. Trần theo ngày cho chủ tài khoản

Chủ đặt được trần lượt bot trả lời mỗi ngày (`users.bot_daily_reply_cap`), dùng chung
cho mọi chatbot và mọi kênh. Trước đây muốn cắt chi phí chỉ có cách tắt hẳn bot,
không có mức trung gian.

**Không cho khách chỉnh giới hạn phút/giờ.** Đó là rào an toàn chống spam, không phải
đòn bẩy kinh doanh — nới ra là đưa súng cho khách tự bắn chân, và người bị trách sẽ
là mình. Trần theo ngày thì ngược lại: tiền của họ, họ quyết.

Bù lại, **phải hiện rõ bốn giới hạn hệ thống** trên giao diện, kèm giải thích hai kiểu
hành vi ở mục 2. Bot im lặng mà không nói gì chính là thứ khiến người dùng tưởng hỏng.

> **Đừng viết cứng bốn con số đó vào giao diện.** Chúng đọc từ env lúc chạy, production
> đổi được mà không build lại. Repo đã dính đúng bẫy này một lần với tốc độ gửi Zalo —
> tài liệu ghi 20–50 giây trong khi production chạy 80–150 giây, phải có một commit
> riêng để đính chính. Trả số về từ máy chủ.

## 4. Bộ đếm theo ngày lịch, không phải cửa sổ trượt

Khoá đếm gắn ngày lịch giờ Việt Nam (`vnDayKey`), không dùng TTL 24 giờ.

TTL 24 giờ tạo cửa sổ **trượt**: khách trả lời lượt đầu lúc 15:00 thì "ngày" của họ
kết thúc 15:00 hôm sau — lệch hẳn với chữ "mỗi ngày" trên nhãn.

Tính ngày bằng `Intl.DateTimeFormat(...).formatToParts`, **không dùng**
`new Date(d.toLocaleString(...))` — cách sau parse lại chuỗi đã định dạng và lệch khi
tiến trình chạy `TZ=UTC`.

**Bộ đếm của chủ luôn tăng**, kể cả khi chưa đặt trần. Không thế thì tài khoản chưa
đặt trần luôn thấy "đã dùng 0 lượt" — mà đó lại đúng là nhóm cần con số này nhất để
biết nên đặt bao nhiêu.

## 5. Bàn giao — chủ nhắn thì AI tạm dừng

Khi chủ tài khoản trả lời một hội thoại (từ hộp thư web hoặc từ app Zalo), AI **tự
tạm dừng cho riêng hội thoại đó** để không cướp lời.

Chủ đặt được thời gian **tự bật lại**: 5 / 15 / 30 / 60 phút, hoặc Tắt.
**Mặc định là Tắt** — không tự ý đổi hành vi của khách đang dùng.

Mốc tính từ **lần chủ nhắn gần nhất**, không phải lúc khách im lặng. Mỗi lần chủ nhắn
thêm là đồng hồ tính lại, nên đang trao đổi dở thì AI không chen ngang.

Bật lại theo kiểu **lười** — kiểm lúc có tin đến, không dựng cron.

Trạng thái tạm dừng nằm ở hai nơi (`zaloPersonal` và `unifiedInbox`); **sửa một chỗ
là sót**. Và `ai_paused_at` không hợp lệ phải **giữ nguyên tạm dừng**, không được coi
là hết hạn — `NaN < x` trả `false` sẽ âm thầm bật AI lại.

## 6. Tin gửi hỏng phải hiện ra

Trước đây hệ thống **không có cách nào biết một tin đã gửi được hay chưa** — mọi tin
đều hiện dấu đã gửi. Hết phiên Zalo, bị chặn, mất mạng đều im lặng như nhau.

Nay tin hỏng hiện chấm than đỏ kèm lý do và nút **Gửi lại**.

| Quyết định | Vì sao |
|---|---|
| Gửi lại **không** tính lại hạn mức | Tin đã tính hạn mức và trừ ví lúc lưu — gọi lại là phạt khách hai lần cho cùng một tin |
| Gửi lại **không** tạo tin mới | Mất khoá chống trừ ví hai lần, và luồng hội thoại đầy tin trùng |
| API gửi vẫn trả `success: true` khi gửi hỏng | Tin đã lưu thành công; giao diện cần hiện nó ra để còn bấm gửi lại được |
| Nhân viên cũng gửi lại được | Trả lời khách là việc hàng ngày của họ, không phải việc của riêng chủ |
| Giành chỗ bằng một câu `UPDATE` | Khoá nút ở giao diện không chống được hai tab |

---

## Bẫy đã dính — đọc trước khi sửa phần này

- **Cả ba adapter đều `return { success: false }`, không `throw`.** Vá mỗi nhánh
  `catch` là không sửa được gì — `catch` gần như không bao giờ chạy.
- **Đừng ghi đè cả `metadata`** — mất khoá `source` là vỡ chỉ mục đếm hạn mức tháng.
  Dùng `jsonb_set`.
- **Đừng chỉ nhận `status = 'failed'` khi giành chỗ gửi lại** — sập giữa chừng là tin
  kẹt ở `retrying` và nút gửi lại chết vĩnh viễn. Phải nhận cả `retrying` đã quá 2 phút.
- **Đừng bỏ `type` khỏi API gửi lại** — hai bảng có id độc lập, thiếu là gửi nhầm tin.
- **Đừng ghi trạng thái gửi trong transaction lưu tin** — transaction đó đã commit
  trước khi gửi, và nó còn chứa việc trừ ví.
- **Đừng đánh dấu "đã báo" trước khi gửi thành công** — khách sẽ không nhận được gì
  suốt cả cửa sổ.
- **Đừng đọc DB mỗi tin** trong đường kiểm giới hạn — đó là đường nóng, phải cache TTL
  ngắn.
- **Đừng đặt cấu hình mới lên `chatbot_settings`** — bảng đó không có trong
  `bootstrap.sql`, integration test sẽ đỏ hoặc xanh giả.
- **Đừng quên nhánh không có `senderKey`.** `checkBeforeAi` có hai nhánh; sửa một
  nhánh là bộ đếm sai với kênh không có định danh ổn định.
- **Đừng đọc bộ đếm bằng hàm tăng.** Dùng nhầm `incrWithTtl` để đọc thì mỗi lần mở
  trang tự cộng thêm một lượt.
