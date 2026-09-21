# Sổ quyết định

Những chốt đã ra, vì sao, và **cái gì đã bị bác bỏ**.

Vế cuối mới là lý do file này tồn tại. Một quyết định bị đảo mà không ghi lại lý do thì bản cũ
trông vẫn hợp lý, và sớm muộn có người khôi phục nó — kèm nguyên vẹn lý do nó từng bị bỏ.

Đây là bản *quyết định*, không phải nhật ký tính năng (`lich-su-tinh-nang-<tháng>.md`) cũng không
phải hướng dẫn vận hành. Số đo production và chẩn đoán sự cố nằm ngoài phạm vi repo này.

---

## Quy trình làm việc

### Một plan chỉ dùng MỘT model cao cấp — 04/09/2026

Hoặc Claude, hoặc Codex, không bao giờ cả hai. Người viết plan cũng là người nghiệm thu, từ đầu
tới cuối. Không có ngoại lệ — kể cả tiền, sổ cái, thanh toán, bảo mật.

> **Bản trước quy định ngược lại**: đòi "mắt thứ hai độc lập" cho mọi việc chạm tiền. Bỏ vì hai
> model cao cấp cho một plan là thừa, và nó mâu thuẫn với chính luật ngay bên dưới nó. **Đừng khôi
> phục.**

Cái làm việc chạm tiền an toàn không phải thêm người, mà là **nghiệm thu bằng sự kiện lấy từ
production**: dòng đọc được trong bảng log, tổng sổ cái trước và sau khớp từng đồng, ảnh chụp tin
nhắn khách thật nhận được — chứ không phải "test xanh".

### Người viết plan review kết quả; người viết code không tự review code mình

Người vẽ bản thiết kế là người đọc bản thiết kế giỏi nhất, và đang giữ sẵn ngữ cảnh. Gọi một model
cao cấp thứ hai vào review lạnh bắt nó dựng lại toàn bộ hiểu biết từ đầu — đó là đường đắt, không
phải đường an toàn hơn.

**Chỗ người viết plan thật sự kém khách quan** không phải "code có đúng plan không" — cái đó họ
kiểm tốt hơn người ngoài. Mà là **con số nghiệm thu có nghĩa đúng như mình tưởng không**. Đã hỏng
ba lần theo đúng kiểu đó, cả ba đều khớp với kỳ vọng của người viết plan: một câu SQL sai tên cột
lọt qua vì test mock trọn DB; một bảng parity 100% đo nhầm trên DB khác; một tỉ lệ đẹp đạt được
nhờ mẫu số co lại.

### Phản biện plan TRƯỚC khi code là việc được kỳ vọng

Bất kỳ ai, kể cả người sắp implement. Thấy plan vô lý, mâu thuẫn với code, hay dựa trên giả định
chưa kiểm thì phải nói ra trước khi làm.

Bằng chứng vì sao bước này không được bỏ: đợt 04/08/2026 ba plan liên tiếp bị bắt **15 lỗi**, cả
15 đều là khẳng định về code chưa kiểm chứng. Đợt 30–31/08 có ít nhất ba plan bị dữ liệu thật bác
bỏ. **Cả hai đợt, lỗi đều do người implement bắt ở bước phản biện** — không phải do một reviewer
riêng bắt ở vòng sau.

---

## AI và hạn mức

### Một model AI duy nhất cho toàn hệ thống — 12/07/2026

Super admin chọn model trong Quản lý model AI; `aiModelPolicy.resolveAllowedModel` luôn trả model
đó. Người dùng không thấy và không chọn model.

> **Thay thế cho "Billing × AI model tiers"** — gate model theo gói. Hạn mức
> `ai_credits_per_period` / `ai_tokens_per_period` theo gói **vẫn giữ**.

⚠️ Cột `plans.ai_model` và `users.preferred_ai_model` **vẫn còn trong DB** nhưng policy bỏ qua
hoàn toàn. Đọc schema rồi kết luận "hệ thống đang chọn model theo gói" là sai. Muốn bán model theo
gói thì phải viết lại policy và thêm lại UI.

### 1 credit cho mỗi lần AI trả lời, trừ SAU khi thành công

Không trừ credit cho embeddings hay bước tra cứu RAG. Người dùng nhìn thấy credit; token chỉ super
admin thấy.

### Hạn mức thiếu dữ liệu nghĩa là HẾT, không phải đầy

Khi không đọc được số đã dùng, mặc định an toàn là chặn. Mặc định ngược lại biến một lỗi đọc thành
một đợt phát miễn phí.

Kèm theo: **miễn trừ tính tiền đặt ở tầng dùng chung phải khoá phạm vi theo đúng tính năng**, và
phải có ca kiểm "tính năng khác vẫn tính tiền". Một cờ miễn phí thiếu điều kiện tính năng từng làm
11 route AI miễn phí cùng lúc (bắt được ở review, chưa lên production).

---

## Gửi tin và sự đồng ý

### Chặn người ĐÃ TỪ CHỐI; người CHƯA ĐƯỢC HỎI vẫn gửi — 20/09/2026

Áp cho cả email lẫn Zalo. Ba trạng thái, không phải hai:

| `marketing_consent` | Nghĩa | Có gửi? |
|---|---|---|
| `TRUE` | đã đồng ý | có |
| `NULL` | **chưa hỏi bao giờ** | **có** |
| `FALSE` | đã từ chối | không |

> **Bản `IS TRUE` từng sống đúng một ngày** rồi bị đảo: nó gộp `NULL` vào nhóm từ chối và cắt mất
> phần lớn danh sách. Nó lọt qua review vì bộ test không có ca `NULL` nào.

Điều kiện đúng là `IS NOT FALSE`, không phải `IS TRUE`. Ai đọc thấy `IS NOT FALSE` rồi tưởng là lỗi
thì đọc lại bảng trên.

### Lượt chạy từ lịch KHÔNG tự kích hoạt chiến dịch — 16/09/2026

Bấm "Chạy ngay" trên chiến dịch đang Nháp hoặc Tạm dừng thì hệ thống tự kích hoạt (nút "Kích hoạt"
riêng đã bỏ). Nhưng lượt chạy sinh từ **lịch hẹn** thì không — nếu không, chiến dịch vừa bị Tạm
dừng sẽ được lịch tự bật lại và nút Tạm dừng mất nghĩa.

Hệ quả phải biết: đặt lịch cho chiến dịch còn Nháp thì lịch nổ xong không gửi gì. Từ 21/09 hệ thống
chặn ngay lúc đặt và ghi lại lượt nổ hỏng — xem `backend/src/utils/scheduler.js`.

### Zalo: khung giờ yên lặng 23:00–06:00 giờ Việt Nam cố định

Chiến dịch đang chạy tự dừng và tự tiếp tục lúc 6h sáng. Giờ Việt Nam là UTC+7 cố định, không phụ
thuộc TZ của tiến trình hay máy chủ.

### Khung giờ chatbot: ca vắt nửa đêm tính theo ngày BẮT ĐẦU ca

Ca `22:00–02:00` đặt cho Thứ Hai nghĩa là 22:00 thứ Hai tới 02:00 thứ Ba. Tin khách gửi ngoài giờ
**vẫn vào hộp thư**, chỉ là bot không trả lời; câu báo ngoài giờ gửi một lần cho mỗi đợt thật, không
phải mỗi ngày lịch.

---

## Gói cước và hoá đơn

### Đổi gói — 19/08/2026

- **Nâng gói**: ghi đè, mất số ngày còn lại của gói cũ.
- **Hạ gói**: giữ gói hiện tại tới cuối kỳ rồi mới đổi.
- Không quy đổi phần chưa dùng, không hoàn tiền.

### Chu kỳ hạn mức: 30 ngày kể từ ngày kích hoạt

Không phải theo tháng lịch, không phải theo ngày mua.

### Hoá đơn điện tử — 17/08 và 19/08/2026

- Dịch vụ thuộc diện **không chịu thuế**: `TSuat = -1`, **không** cộng thêm 10%. Giá niêm yết là
  giá cuối cùng khách trả.
- Khách **không** lấy hoá đơn thì vẫn **xuất** hoá đơn dạng "Bán cho người tiêu dùng", chỉ là không
  gửi email. Đừng dùng cờ kiểu `wantInvoice: false` để bỏ qua bước xuất.

---

## Kênh chatbot

### Zalo OA và Facebook chỉ nối qua Chatbot Studio — 20/09/2026

Trước đó tồn tại **hai** hệ thống kết nối song song cho cùng hai kênh: một hệ thống webhook gắn
theo tài khoản người dùng, và một hệ thống gắn theo từng chatbot trong Studio. Chỉ hệ thống Studio
có khung giờ hoạt động và gắn được với chatbot cụ thể.

Chốt: **khai tử hệ thống theo tài khoản**, Studio là đường duy nhất.

### WhatsApp không thuộc phạm vi đội này

Do người ngoài đội implement. Đừng lập plan, đừng nhận việc.

---

## Ràng buộc hạ tầng đã chốt chấp nhận

Hai điều dưới đây **không phải lỗi cần sửa** — là đánh đổi đã cân nhắc và chấp nhận.

### Chạy đúng MỘT container backend

Điều phối chiến dịch (`activeRunIds`, worker chạy liên tục, trạng thái rate-limit Zalo, mutex theo
tài khoản) nằm **trong bộ nhớ tiến trình** — xem `backend/src/services/campaign/campaignRun.service.js:85`.

Thêm replica thứ hai, hoặc tách worker ra tiến trình riêng, mà chưa chuyển các chốt đó sang Redis
hay advisory lock của Postgres, sẽ **gửi trùng và nhân đôi hạn mức Zalo theo giờ**. Muốn scale
ngang thì phải làm phần khoá chung trước.

### Hạn mức Zalo theo giờ mất khi restart

Cùng gốc với mục trên. Chấp nhận vì tần suất restart thấp và thiệt hại giới hạn trong một cửa sổ
một giờ.

### Landing của khách: giữ iframe + capture script — 07/09/2026

Chốt sau khi một lần gỡ iframe làm vỡ trang của khách trong ba giờ. Lộ trình gỡ iframe vẫn còn
treo, chưa có plan thay thế đã kiểm chứng.

---

## Pháp lý

### Nghị định 330 — hệ thống là bên XỬ LÝ dữ liệu

Với `customers` và `leads`, chủ tài khoản là bên kiểm soát dữ liệu, hệ thống là bên xử lý. Kéo theo:
mọi luồng thu thập phải ghi lại thời điểm và phạm vi đồng ý, và người đã nộp biểu mẫu phải tự rút
lại đồng ý được.

Modal đồng ý là **cổng bắt buộc**, không có nút "Để sau", và hỏi lại khi văn bản đổi phiên bản.

---

## Lộ trình đã chốt thứ tự, đừng nhảy cóc

### AI Landing Page Builder (prompt → HTML) — 4 bước tuần tự

1. Vector DB cho hồ sơ doanh nghiệp → 2. RAG với Gemini → 3. Module sinh HTML từ prompt →
4. Tự cấp tên miền riêng.

Các bước phụ thuộc nhau; làm bước 3 trước bước 1 là dựng nhà trên nền chưa đổ.

### Tính năng Sản phẩm (song song với Khoá học) — 5 bước

1. Bảng `products` + CRUD API → 2. Giao diện `/app/products` → 3. Thay khối JSON trong Hồ sơ doanh
nghiệp → 4. Node chiến dịch `read_products_db` → 5. Đưa `products` vào ngữ cảnh AI.

Bản mẫu để bắt chước: module `courses`. Đừng phát minh quy ước mới.
