# Lịch sử tính năng — 19/08 → 19/09/2026

Tổng hợp các plan đã triển khai xong từ 19/08 tới 19/09/2026, kèm commit làm bằng chứng. Nối tiếp
`lich-su-tinh-nang-2026-08.md` (dừng ở 18/08).

Plan chi tiết nằm trong `_internal/` (không được git theo dõi). Khi tính năng lên `main`, plan được
tóm tắt vào đây rồi chuyển sang `_internal/archive/`. Cần chi tiết thì tra commit.

---

## Trợ lý AI tạo chiến dịch — từ vá lỗi tới compiler

### Wizard thu thập thông tin (24–25/08)

| Việc | Commit |
|---|---|
| Chọn tệp đính kèm, chọn sản phẩm, dán link Sheet ngay trong thẻ brief | `8b1c1c1f` `344f5324` `d4f30019` `d44b2b64` |
| Giữ nội dung tệp qua nhiều lượt chat trong `wizard_state` | `aabb63b4` |
| Luồng soạn chiến dịch sống sót qua tải lại trang; thẻ cổng đã trả lời không hiện chồng | `e5acb78f` `917fd52c` `e103520d` `83b73c8a` `77629951` |
| Nhận diện ý định qua router, thoát wizard ở mọi cổng, sửa vòng lặp lịch gửi | `0bcc9625` `9063fdff` |
| Lựa chọn wizard xuống đúng node; Zalo cá nhân bắt buộc có node tài khoản | `925d56ff` `c98beabc` |
| Chặn Sheet thiếu cột liên hệ ngay ở cổng; sheetName mặc định tab đầu | `10e95ccf` `ac9844ba` |
| Đợt A: chặn campaign rỗng ở tầng tạo và tầng chạy; sửa 4 chỗ hỏng im lặng | `ad264b35` `107c0727` |

### Intent compiler (30/08 → 06/09)

Code dựng cấu trúc campaign từ `CampaignIntentV1`, LLM chỉ viết nội dung. Di trú từng luồng bằng cờ.

| Giai đoạn | Commit |
|---|---|
| GĐ1 schema + shadow extraction + cảnh báo run fail | `7d49f4f4` |
| GĐ2 email, GĐ3 Zalo cá nhân + nhóm | `46b3e894` `672670f9` `0fb7e441` |
| Backtest trên toàn bộ campaign đã lưu, sửa 3 chỗ lệch | `9df17c4d` `e921bcb5` |
| Bật cờ theo luồng; sửa no-op im lặng ở call site | `f9a01ece` `83685511` |
| GĐ4 LLM slot filling | `de6ff146` `408300da` |
| Compiler chưa từng chạy 7 ngày vì truyền nhầm biến `intent` | `e110e12f` |
| 7A thước đo nội dung tất định | `f938aeb1` |
| Audit `via` phân biệt `ai` / `ai_compiler` / `ai_compiler_slot_filling` / `builder` | `f0ffc60f` `9332d019` |
| GĐ5 PR-1 (08/09): chứng minh 11 nhánh `[AI Patch]` no-op trên graph compiler (36 ca), bỏ qua khi `compilerApplied`; sửa 6 chỗ compiler lệch overlay (`landingLeadsSlugs`, `zaloGroupIds`, `zaloGroupSendMode`, `emailSenderId`, không `get_all_friends` cho zalo_contacts, không nhúng `zaloRecipientPhones`); xoá shadow extraction | `bcde6ccd` `1f972bda` `3f4ce8a4` `6bb3e7c5` |

**Trạng thái production**: `COMPILER_ENABLED_FLOWS=zalo_group,email`, `COMPILER_SLOT_FILLING_FLOWS=zalo_group`.
Nghiệm thu bằng sự kiện thật 06/09: chiến dịch 356 có `audit_logs.details->>'via' = 'ai_compiler_slot_filling'`.
GĐ5 đã scope lại thành 4 PR (`PLAN_COMPILER_GD5_DON_DEP_2026-09-08.md`); PR-2 (bật cờ cho Zalo cá
nhân, gỡ patch) chờ đủ **7 ngày log không có deploy backend** để đo, mốc tính lại sau mỗi lần deploy
vì container mới xoá `docker logs`. *(Sửa 08/09: bản trước ghi "chỉ còn một `[AI Patch]` là chuỗi
log" — sai, viết theo trí nhớ. Đếm thật: `grep -c "\[AI Patch\]" aiCampaignDraft.service.js` = 11,
cả 11 nhánh vá vẫn chạy trên script LLM cũ ở `aiCampaign.service.js:1685` trước khi compiler ghi đè.)*

### Gửi kèm tệp, biến template, gửi nhanh

| Việc | Commit |
|---|---|
| Gửi kèm tệp: wizard hỏi cách dùng, intent mang tệp, compiler đặt vào bước | `1437fc97` `d75a0c9a` |
| Thôi gửi thô `{{full_name}}` tới khách, cả backend lẫn builder chạy trong trình duyệt | `4dddf765` `2f3cbfaf` |
| Nhập tay SĐT ở cổng wizard, chuẩn hoá SĐT Việt Nam, cổng gửi nhanh | `7e313213` `df1e5b82` `149505e7` |
| Gửi nhanh có đính kèm | `11bcb73b` |
| Gửi nhanh cho Zalo UID: chọn từ danh bạ, đối chiếu tên thật, không hiện UID trần | `67a7933a` `402f67f2` `3673bbb6` `f1acf558` `271bffb8` `57399ebb` |
| Sinh landing trong chat đi qua cùng service với nút tạo; đọc `finishReason` | `442f0770` |
| Wizard đóng luồng khi chiến dịch đã tạo: tin ranh giới `campaign_created` do server lưu, ba nơi suy trạng thái đều reset | `88b6ff53` |
| Wizard PR-2 (08/09): huỷ luồng dùng cùng cơ chế ranh giới (`campaign_abandoned`), không giữ mốc chỉ số tin nhắn | `10c83e62` `035ddd8f` |
| Gửi nhanh PR-2 (08/09): kênh Zalo nhóm — `sendGroupMessage`, trang đích, cổng wizard; đọc `items[].status` vì backend trả 200 kèm từng dòng `failed` (Bẫy 7) | `1d7c2b03` `2b4fda48` `cb5f3b60` `c6544e2f` `9545b15d` |

**Quyết định còn hiệu lực**
- Ranh giới vòng đời wizard là **một tin nhắn trong lịch sử**, không phải mốc chỉ số tin nhắn.
  `stripWizardCards` làm chỉ số trượt, và mốc `abandonedAtMessageCount` bị xoá ngay lượt kích hoạt lại.
- Nghiệm thu tính năng AI bằng **sự kiện production** (audit `via`, log), không bằng test xanh.
  Hai lần "chưa đạt" của GĐ4 đều là lỗi đo, không phải lỗi tính năng.

---

## Zalo cá nhân — trạng thái tài khoản

| Việc | Commit |
|---|---|
| Phát hiện websocket chết thay vì tin "có api là còn sống" | `1829785d` |
| Danh bạ Zalo: hai cột không tồn tại, lặp vô hạn, mất con trỏ | `66ed9365` `2a00c2c5` |
| `disconnected` thôi là trạng thái không có đường ra; script cứu hộ | `688cadd2` `e799dc45` `3c2dcbb4` `c11cf681` `1942b9f8` |
| Trang quản lý Zalo của admin hết timeout: bỏ đăng nhập lại khỏi đường đọc | `5cc1981a` |
| Không ghi `connected` khi restore cookie trả `null` | `8dff873f` |

**Cơ chế còn hiệu lực**: `recordRestoreFailure` chuyển `needs_reauth` khi **≥5 lần fail và mốc fail đầu
≥60 phút**. Trước `8dff873f`, cron 15 phút xoá cửa sổ này mỗi lượt nên 32 tài khoản cookie chết kẹt
`connected` giả, ~1.600 lượt đăng nhập Zalo mỗi giờ từ một IP. Sau sửa, cả 32 chuyển `needs_reauth`
đúng 60 phút và số đăng nhập về 0.

---

## Gói cước, thanh toán, hoá đơn

| Việc | Commit |
|---|---|
| Đổi gói: hẹn đổi cuối kỳ, ma trận nút giá, chu kỳ 30 ngày từ ngày kích hoạt, khoá tài nguyên vượt hạn mức + ân hạn 7 ngày | `21948113` `faaf822c` `dab53025` |
| Hoá đơn PR-A→E: tên người mua, dòng gói, giờ thanh toán thật, bắt buộc mã gói, gán gói số lượng, cổng email hoá đơn | `f05aba73` `6e2f0b15` `bb222c1a` `a9f1f089` `d53c6a17` |
| Không bắt buộc nhập hoá đơn; khách không lấy vẫn xuất "Bán cho người tiêu dùng", không gửi email | `7b90a3b3` |
| Sửa mốc chu kỳ billing, serialize checkout | `a3a2183c` |
| Dùng thử 14 ngày, cấp trong transaction | `fc7b9af0` |
| Gỡ email kèm giải phóng lịch sử dùng thử | `c4aa2c96` |
| Quota atomic PR-Q1→Q4c: quyết định gửi trong transaction, idempotency key cho gửi nhanh/preview/inbox, campaign Email + Zalo dùng reservation | `20ae3fc2` `048ef34b` `ce55f37e` `9311e593` |
| Hoa hồng giới thiệu PR-A1→A5 (xem `hoa-hong-gioi-thieu.md`) | `26cb7c66` `bcc843d1` `705593fe` `e69bb892` `deeba75e` `50c05cd2` |

---

## Nhân viên và quyền

| Việc | Commit |
|---|---|
| Mở rộng quyền nhân viên PR-5→8: chatbot, inbox, thư viện media, hạn mức, luồng duyệt | `f15fb05f` |
| Duyệt campaign + dọn dẹp | `f85e2780` |

Checklist regression cho route nhạy cảm: `employee-route-policy-matrix.md`.

---

## Landing page và lead

| Việc | Commit |
|---|---|
| AI sửa trang tại chỗ thay vì tạo lại; nút hoàn tác, cảnh báo ghi đè | `17664e53` `9e98c22d` `d503f002` |
| CORS cho `/api/public/leads`, tôn trọng `onsubmit` của chủ trang | `f7042790` `a1a5ad66` |
| Tự đồng bộ lead sang Google Sheets qua webhook GAS | `077b1a92` |
| Canvas editor có preview trực tiếp và chat AI | `dc78ef68` |
| Script `founderai-capture.js`: form AI vẽ theo hợp đồng `data-founderai-capture` + `name/email/phone/cf_*` | `77d1673a` `9ad8a94d` `44f90957` |
| Route `/embed/lead-form` khôi phục làm lớp tương thích cho trang cũ (deprecated) | `e92e49e9` |

**Nghị định 330/2026 — đồng ý dữ liệu cá nhân** (PR-N1→N5, 05–07/09)

| Việc | Commit |
|---|---|
| Đồng ý marketing 3 trạng thái true/false/null; form nhúng mặc định bỏ trống, từ chối vẫn gửi được | `b5a8d065` `18d068b0` `4a17d6f4` |
| Lưu bằng chứng đồng ý điều khoản lúc đăng ký; xin đồng ý bổ sung cho user cũ; lịch sử đồng ý | `9de71389` `1f085bf1` |
| Đường rút lại đồng ý cho lead; nguồn đồng ý cho khách hàng | `e6ad563c` |
| Thời hạn lưu và dọn dữ liệu cũ, bảo vệ chứng từ kế toán | `4360c0fc` `4a411ea1` |
| Minh bạch thu thập dữ liệu, mục đích lưu IP | `910296b9` `3933348e` |

**Quyết định còn hiệu lực**
- Ô đồng ý marketing **mặc định bỏ trống** và **không bắt buộc**. `null` nghĩa là "chưa hỏi", không được
  gửi marketing; `false` là "đã hỏi, từ chối".
- Form landing theo hướng **form của AI, dữ liệu của hệ thống**: AI vẽ form đúng hợp đồng, script hệ
  thống bắt submit. Iframe chỉ còn là dự phòng cho trang cũ; gỡ sau khi các trang đó được lưu lại.

**Form landing: bắt lead và trường thêm** (08–09/09, plan `PLAN_FORM_LANDING_AI_GIU_FORM_2026-09-06.md`
và `PLAN_LEAD_FORM_TRUONG_THEM_2026-09-08.md`)

| Việc | Commit |
|---|---|
| PR-2a: `founderai-capture.js` chỉ bắt form có email/SĐT; sửa `inferAutoName` map nhầm SĐT thành tên; thôi tự sinh `cf_<id>`; chỉ strip iframe khi trang đã có form khác; guard AI-edit giữ `data-founderai-capture` | `df078207` `8e23dcee` `8fb28387` `56a0f681` `3f9cfb5f` |
| PR-2b: AI sinh select `occupation`/`interestArea` theo cấu hình; capture gửi hai trường này top-level; khoá `cf_*` lạ bị bỏ qua thay vì mất cả lead | `89d925e3` `9e213b32` `3ed741ba` `b7022fa4` |
| PR-2d-1: khôi phục schema đầy đủ `landingLeadFormConfig.js` (bản tối giản của `3c514bc8` làm "mỗi lần lưu là một lần xoá"); backend áp dụng nháp AI thành khoá tất định `cf_sugg_NN_text`; test vòng tròn GET→normalize→prepare | `b8b9725c` `fdfb56cc` `14204724` `5fe0e260` `36efec39` |
| PR-2d-2: `LeadFormConfigPanel` trở lại trong `SettingsModal` section "Form đăng ký"; lỗi bất biến kiểu/mã option hiện đúng vùng | `67d0e8aa` `e16117bf` `4f9dae2c` `09cc1509` |
| PR-2d-3: prompt sinh trang ra ô cho từng `customFields` (422 nếu thiếu); rule 2b cho phép AI thêm trường vào form có sẵn; panel cảnh báo "trang chưa có ô" + nút "Nhờ AI thêm ô này" | `ff2286b2` `3a2c587e` `44406150` `6fe955b3` `47e60611` |

Nghiệm thu thật trên production 09/09: PR-2d-1 SQL `jsonb_array_length(customFields) = 2` sau hai lần
lưu; PR-2d-2 năm trường với select `opt_a,opt_1,opt_2`, kiểu bị khoá sau khi lưu; PR-2d-3 bước 1–2
đạt, bước 3 bắt được lỗi thật (dòng cuối bảng dưới).

Lỗi có sẵn lộ ra dọc đường nghiệm thu, đều sửa cùng ngày:

| Lỗi | Commit |
|---|---|
| `productId` do LLM viết không phải id số → 400 khi tạo trang; rơi về `other` | `c7b6511d` |
| Nút "Để sau" của modal bổ sung SĐT bị commit dọn lint `1a992e76` xoá mất; khôi phục cả hai mount | `8fedb8b1` `c17d4596` |
| Chốt "AI sinh không đạt" trả 502 bị Cloudflare thay bằng trang lỗi riêng, message mất; đổi 422 | `a3125f47` |
| Không gõ được dấu cách trong nhãn trường thêm vì normalizer trim mỗi phím; trim lúc lưu | `dc1d956f` |
| Danh sách lead hiện `[object Object]` ở cột Thông tin thêm | `9ef3a89b` |
| Model trả JSON hỏng, fallback vớt HTML còn nguyên `\n` `\"`; giải mã bằng `JSON.parse`, không được thì 422 | `731f63d5` |
| "Nhờ AI thêm ô này" chỉ đưa nhãn lựa chọn, AI ghi `<option value="Lựa chọn 1">` thay mã `opt_a` → mọi lead bị từ chối; câu lệnh kèm markup đúng mã, panel cảnh báo mức 2 "không khớp mã", backend 422 ở đường sinh | `ce7c7e23` `a3eb89d0` |

**Quyết định còn hiệu lực**
- Khoá và mã option của trường thêm là **hợp đồng với AI**: mọi câu lệnh sinh/sửa form phải chứa
  nguyên khối markup có `value="<mã>"`, không bao giờ chỉ đưa nhãn. Kiểm sau sinh phải kiểm cả mã,
  không chỉ `name`.
- Chốt chặn AI ở backend trả **422**, không 502: Cloudflare nuốt 502/504 của origin.
- Nghiệm thu form bằng **lead thật gửi từ trang public**, không bằng "panel hết cảnh báo".

---

## Hạ tầng, CI, kiểm thử

| Việc | Commit |
|---|---|
| `bootstrap.sql` thêm 23 bảng thiếu, đạt 100% parity tên cột với production; chốt chặn schema hai chiều | `0cb74a98` `b591c974` `3a21b66c` |
| Migration runner: lock timeout, checksum, kiểm lúc khởi động | `f83798b6` `4825c75a` |
| Tối ưu pipeline deploy, shard integration, chạy lint + test khi push thẳng `main`, báo động deploy đỏ | `09aa1192` `1082ddce` `81244d09` |
| Caching: vá rò quota hero, cách ly memory cache, key embedding | `d82943b7` |
| Chatbot debounce 6 giây, cửa sổ tối đa 10 giây | `8ec0bee1` `67e1ba87` |
| Hoàn tất di trú GCS cho promote và cron đối soát | `ffd539aa` |
| Hiện trạng thái chờ SMTP rate-limit lên UI, lưu nguyên văn phản hồi | `1d392eb8` |
| Báo cáo AI hằng ngày, lịch sử landing page | `a8de697f` |
| Ảnh chụp tự động cho bài hướng dẫn (hết lô 24/08) | `3b9d40ac` … `9f8ea588` |
| Render link trong chat, vá XSS trang chat công khai, chặn kích hoạt gói không có mã | `a99cc994` |

**Lưu ý vận hành đã rút ra**
- Chỉ chạy **một** bộ integration tại một thời điểm trên Postgres `:5433`. Ba agent chạy chồng nhau
  07/09 sinh 161 lỗi giả.
- Nhiều agent dùng chung một working tree: `git fetch` và xem `origin/main..HEAD` trước mọi lần push.
- `schema.sql` lệch production ở cả **kiểu cột**, không chỉ tên: `zalo_settings.last_connected_at` là
  timestamp naive trên production dù file khai `TIMESTAMPTZ`.
- `docker logs` của backend **mất sau mỗi deploy** vì container tạo mới; đo gì bằng log thì kiểm
  `docker inspect .Created` trước, số bền lấy từ DB.
- Traffic `/api` production đi thẳng Cloudflare → cổng `5001`, không qua nginx của frontend; trần
  timeout thật là 100 giây của Cloudflare. Không tự bind 5001 về localhost.
- Workflow deploy có chốt "stale": commit mới hơn đổi backend là run cũ tự huỷ (09/09 `a3eb89d0` bị
  `401f1bd6` vượt). Đây là cố ý, không phải lỗi code.

---

## Hết hạn mức thì phải DỪNG, không được đốt sạch danh sách (10–11/09)

Hai run của một tài khoản sinh **25.165 lượt thất bại / 0 thành công trong 4 ngày**, có lúc quét
5.908 lượt/giờ và chạy xuyên khung giờ yên lặng 23:00–06:00. Nguyên nhân: gói dịch vụ hết hạn →
`checkSendQuota` trả `resetAt: null` → lỗi ném ra bị các catch theo từng người nhận đếm thành
"thất bại" rồi `continue`, nên vòng lặp **không bao giờ chạm tới cổng nhịp** và quét danh sách ở
tốc độ tối đa. Cùng một lỗi hoá ra nằm ở **ba cơ chế hạn mức khác nhau**, phải vá cả ba.

| Việc | Commit |
|---|---|
| PR-1: lỗi hạn mức không tự reset được phải đóng sổ `failed` rồi ném `RUN_STOPPED` | `273bed44` |
| PR-1b: kênh email đi qua `reserveSendQuota` riêng — cùng lỗi, cơ chế khác | `326e38a2` |
| PR-1c: cổng reservation Zalo — cơ chế thứ ba, `PLAN_SEND_LIMIT_EXCEEDED` không ai đọc | `ba720f35` |
| PR-2: kênh kết bạn tuân cooldown tra số; nghỉ tới **00:00 giờ VN** thay vì 3 giờ cố định | `95a3a6f5` `41ea8b18` |
| PR-2b: cooldown ghi xuống `zalo_settings`, nạp lại lúc khởi động (migration 202) | `93ba1671` |
| PR-3: cột `zalo_messages.status` nói thật; một điểm đóng sổ duy nhất cho placeholder bỏ lại | `936c42b8` |
| Fixture schema thiếu `admin_menu_layouts` làm deploy backend đỏ hai lần liên tiếp | `3ba5c173` |

Nghiệm thu bằng sự kiện production, không nhận "test xanh":

- **PR-1b** — run 403: `failed`, `failed_sends=0`, `error_message` có câu hạn mức. Trước vá, run 401
  cùng chiến dịch kết thúc `completed` với 3 lượt thất bại và `error_message` rỗng.
- **PR-2** — log 11/09 13:36:38: `channel=zalo_friend_request … cooldown đến 00:00 12/09`, tức 10,39
  giờ. Luật cũ sẽ quay lại lúc 16:36 cùng ngày, khi Zalo vẫn đang chặn. Dòng log này trước PR-2
  không thể tồn tại vì nhánh kết bạn chưa bao giờ **đặt** cooldown, chỉ **đọc**.
- **PR-3** — dọn 61.649 dòng lệch cột `status` + 6.926 placeholder mồ côi → còn **0** dòng `queued`.

Hai bài học đắt hơn cả bản vá:

- **Nhãn `invalid_format` không phải phép kiểm định dạng** — nó chỉ bắt chữ "không hợp lệ"/"invalid"
  trong câu Zalo trả về. Chẩn đoán ban đầu "danh sách bẩn 89%" là sai: đo thẳng Google Sheet nguồn
  ra **94,4% số đúng định dạng**, bảng `customers` 99,6%.
- **Hạn mức tra số của Zalo tính theo NGÀY, reset lúc nửa đêm** — đọc được nguyên văn trong
  `campaign_executions.error_message`. Điều này giải thích luôn khoảng bị chặn ~15 giờ đo được
  trước đó: đúng bằng khoảng từ 09:00 tới 00:00 hôm sau.

---

## Chiến dịch: gộp "Quản lý" và "Chạy" về một mục, lọc theo vận hành, sidebar cha/con (12–13/09)

Sếp: hai trang `/app/campaigns` và `/app/campaign-run` "nằm ở 2 tag, khó quản lý, không cần thiết";
muốn phân loại theo **đang chạy / đã lên lịch / tạm ngưng**; và "phân biệt tag cha tag con". Đọc
code thấy hai trang phân loại theo hai trục khác nhau ("đang hoạt động" = status active, không phải
đang chạy; nháp không có ở trang chạy), và sidebar tự đóng nhóm ngay sau khi bấm mục con nên
người dùng không thấy mình ở đâu. Trục vận hành lọc ở server bằng `EXISTS campaign_runs running`
/ `EXISTS campaign_schedules enabled`; **không** dùng cột `next_run_at` vì cột đó không có chỗ ghi
(production 12/09: 29 lịch bật, 0 có giờ). Số thật production để chốt tách "Nháp": draft 158,
active 101, paused 44.

| Việc | Commit |
|---|---|
| Lịch chạy: bật/tắt là công tắc có nhãn, cột lần chạy gần nhất / tiếp theo, badge chỉ là nhãn | `d297a4a5` `293ac208` `975c3b0f` `96bf18e0` |
| "Lần chạy tiếp" tính lúc đọc từ cron (cùng luật nổ với scheduler, kể cả lịch mỗi N ngày) — cột DB chưa bao giờ được ghi | `14404396` |
| PR-1 backend: `state=running\|scheduled\|inactive`, `enabledScheduleCount`, helper lọc dùng chung list/đếm; tab "Được chia sẻ" nhận `search/status` (trước đây bỏ qua) | `a1e474c4` |
| PR-2a: tách 800 dòng logic chạy/lịch/nhật ký ra hook `useCampaignRunController`, trang cũ không đổi pixel | `f1acc758` |
| PR-2b: một trang `/app/campaigns` — thanh vận hành, nút Chạy/Dừng/Lịch/Nhật ký trên dòng, tab Lịch chạy, `/app/campaign-run` chuyển hướng, bỏ mục sidebar | `0759230c` |
| PR-2c: tách "Nháp" thành nút riêng (`state=draft`, `inactive` loại nháp) | `e6865b2e` |
| PR-3: sidebar — nhóm là tiêu đề chữ nhỏ in hoa có vạch cam, trang có rail, nhóm chứa trang đang mở luôn mở | `c3d84131` |

Bốn lỗi review bắt được mà test/ảnh của người implement không bắt: (1) PR lịch chạy nhận bằng ảnh
dev có seed, còn production toàn "—"; (2) PR-2b ảnh tab "Đang chạy" là trang trống — `getCampaignKey`
nhận cả object nên nút Dừng luôn báo "không tìm thấy lượt chạy", badge đọc trường bịa; (3) đột biến
bỏ `state` khỏi hàm đếm để chứng minh assert `pagination.total` bắt được lệch list/đếm; (4) alias `cs`
bị che trong truy vấn shared phải có ca chạy thật. Nợ ngoài phạm vi đã dọn 13/09: `MainLayout.jsx`
so `startsWith('/campaigns')` thiếu `/app` từ commit đầu nên trình dựng chưa bao giờ được coi là
full-screen editor.

## Checkout: voucher không còn đua với nút thanh toán, gói tự đồng bộ sau khi trả (10/09)

Hai lỗi frontend từ plan 09/09: bấm thanh toán khi mã voucher đang được kiểm có thể gửi
`explicitVoucherCode: null` (mất giảm giá), và sau thanh toán xong trang chủ vẫn hiện gói cũ cho
tới khi tải lại.

| Việc | Commit |
|---|---|
| Khoá nút thanh toán khi voucher đang validate; sau validate phải xác nhận lại mới gửi đúng mã; `PaymentSuccess` gọi `refreshCurrentUser` + `fetchAiCredits` | `5d2d363f` |
| Chặn lệch giữa mã voucher đang hiển thị và mã thực gửi (đổi mã giữa chừng) | `6b6b7e9e` |
| Sửa đua trong spec `PaymentSuccess.regression` làm CI đỏ ở máy chậm | `26afb80c` |

Plan không được cập nhật lúc ship nên bị liệt kê nhầm là nợ tới 13/09.

## Giám sát Zalo: Delivery Monitor nói dối, cảnh báo tỉ lệ lỗi mù hoàn toàn (10/09)

Đo trên production: chỉ số "tài khoản Zalo mất kết nối" chưa từng hoạt động, chỉ số "máy không tới
được" gộp mọi lý do thành một số; cảnh báo `campaign_fail_rate_high` lọc theo `started_at` và chia
sai mẫu số nên không bao giờ nổ dù dữ liệu thật ra 93,9%. Ledger không ghi lý do hỏng Zalo.

| Việc | Commit |
|---|---|
| PR-1: sửa chỉ số Zalo mất kết nối, tách lý do không liên hệ được; vá bản user | `1a2f557a` `81286b2b` |
| PR-2: cảnh báo tỉ lệ lỗi đổi cả cửa sổ lọc lẫn mẫu số | `5d118059` |
| PR-3: ghi `lastFailureReason` vào ledger mỗi lần gửi Zalo hỏng, kể cả kết bạn và nhóm | `00e6634e` `fc9a6cf1` |
| 13/09: `campaign_fail_rate_high` đếm lượt gửi **trong cửa sổ** từ `zalo_messages` + `email_messages`, tách kênh trong thông điệp ("Zalo x/y hỏng, Email a/b hỏng") | `dddee31e` |

Ngưỡng giữ 0,30 / 60 phút / 20 người nhận. Bản PR-2 cộng **bộ đếm cả đời** của run đang `running`,
nên 5 run continuous của tài khoản công ty (12.299 và 12.866 lượt hỏng cũ từ sự cố 06/09) làm cảnh
báo nổ 50 lần từ 10/09 với cùng con số 88,1% dù chúng đang gửi tốt. Sau `dddee31e`: 0 sự kiện mới
trong 6 giờ, `alerts_evaluator` vẫn chạy mỗi 5 phút (`noop`). Cảnh báo nay phủ cả email, trả lời câu
hỏi từ sự cố 07–08/09. Còn treo cùng bệnh: `zalo_disconnected` nổ mỗi giờ vì nhìn cửa sổ 7 ngày.

## Khoá dịch: từ 130 khoá bị xoá nhầm tới 0 khoá vỡ (10/09)

| Việc | Commit |
|---|---|
| Khôi phục 130 khoá dịch bị commit "fix lint" xoá nhầm | `3973069b` |
| Phép quét khoá dịch hiểu `useI18n(namespace)`; 33 "thiếu" hoá ra dương tính giả | `5452485e` `aa4cc7e6` |
| Bổ sung 26 khoá còn lại: vi 0 khoá vỡ, en 0 khoá vỡ; sửa `{running}` in nguyên ở bản EN | `69381189` `b753fdb1` |

## Trợ lý AI: giữ link Google Sheet, thẻ cổng tắt ngay sau huỷ, gửi nhanh Zalo nhóm (09–13/09)

| Việc | Commit |
|---|---|
| Giữ link Google Sheet thay vì đóng băng danh sách người nhận (node `read_sheet` giữ `sheetUrl`) | `2e0510a8` |
| Dòng nhắc "tệp tải lên chốt danh sách" chuyển sang khoá i18n vi/en | `305c8c38` |
| Thẻ cổng đứng trước ranh giới huỷ/tạo xong phải tắt ngay, không đợi F5 (`findLatestInteractiveIndex`) | `6c8786c4` |
| Gửi nhanh: Zalo nhóm đã chọn nhóm thì thẻ xác nhận coi là danh sách cố định, mở được nút | `6cab9c84` |
| Prompt không thêm cảnh báo "chọn đúng nhóm" khi wizard đã đưa `zaloGroupIds` | `86cfc9b9` |

"Tự gửi cho số mới thêm vào sheet" **không cần code**: là chế độ "Chạy liên tục" lúc bấm chạy, đã
có sẵn; lịch hẹn thì mỗi lần là một run mới. Câu hỏi lịch hẹn có gửi lại người cũ không trả lời
bằng SQL, xem "Việc còn treo".

## Đồng ý văn bản pháp lý: bắt buộc, không "Để sau", hỏi lại khi đổi phiên bản (12/09)

Nối tiếp NĐ 330 (05–07/09). Sếp chốt 12/09: bắt buộc đồng ý mới dùng tiếp. Đồng thời phát hiện
`hasConsented` không so phiên bản: văn bản đổi ngày 10/09 mà không ai bị hỏi lại.

| Việc | Commit |
|---|---|
| Backend: `hasConsentedCurrent` so `document_version` với `legalDocuments.config.js`; `consentVersionOutdated` | `4ad979d1` |
| Modal không có "Để sau", bấm ngoài không tắt; tiêu đề "văn bản đã cập nhật" khi lệch phiên bản | `aa3eb7d2` `145d36d4` |
| Lối ra thứ hai trỏ về `/contact` — app **không có** chức năng tự xoá tài khoản | `b7b9f33e` |
| `PUT /users/profile` trả đúng `hasConsented` — lưu hồ sơ xong không bị hỏi đồng ý lại (E2E bắt được, integration không) | `34e440ef` |

Nợ mở ra: **đường tự xoá tài khoản** (NĐ 330 đòi rút đồng ý dễ như cho), chưa có plan.

## Menu chuyên mục: super admin sắp xếp menu quản trị và menu khách (11–13/09)

| Việc | Commit |
|---|---|
| Trang quản trị chuyên mục cho menu super admin (migration 201) | `d0b56f08` |
| PR-1: làm phẳng 24 mục menu khách thành catalog có `key` + `defaultCategory`, dựng lại qua `groupAppMenuItems`, giao diện không đổi; RTL ghim 26 cổng quyền không rơi | `1fc04583` `8af6c303` `3670049c` |
| PR-2: migration 205 nới scope `app_user`; `GET/PUT /admin/menu-layout/app`; `GET /users/app-menu-layout` chỉ cần đăng nhập; Sidebar đọc cấu hình lúc mount và tính lại nhóm đang mở; tab scope trong trang chuyên mục | `db0950cb` |

Sếp chốt: **một cấu hình chung cho mọi khách, khách không tự sắp**. Bài học CI: migration có
`DROP CONSTRAINT` phải có dòng `-- allow-destructive-ddl: <lý do>` từ đầu; 205 thiếu nên đỏ một
đợt, và không được sửa migration đã push vì runner so checksum.

## Landing page: đính kèm ảnh/tài liệu, dán HTML có sẵn, lưu & xuất bản ngay trong chat (13–14/09)

Task sếp: người dùng tải ảnh (logo/banner) và tài liệu (PDF/DOCX) khi tạo/sửa landing bằng AI,
hệ thống đưa ảnh lên kho, tạo link và thay vào code; sau đó "tích hợp các chức năng vào Chatbot AI
chính" (sếp chốt hướng: trợ lý ở `/app` làm được hết, không cần mở trang soạn); và "vẫn giữ chỗ
nhập mã HTML có sẵn" (chức năng còn nhưng bị giấu sau nút "Mã HTML", trang mới là khung trắng câm).

Ba phát hiện khi đọc code: đính kèm file trong trợ lý đang rẽ sang API template cũ (fragment, form
hợp đồng cũ); URL file `/file/<token>` ghi `file_access_events` mỗi lượt tải và 302 sang signed URL
15 phút nên không dùng được cho ảnh trang công khai; prompt sinh landing đang dặn AI "bỏ ảnh".

| Việc | Commit |
|---|---|
| PR-1 backend: kho `landing_asset` (`uploads/<owner>/landing/`, ledger `temp` 7 ngày → `active` khi lưu trang), route công khai `/lp-assets/<khoá>` ngoài `/api` có `Cache-Control` + signed URL 24 giờ, nginx thêm `lp-assets`; `generate`/`editHtml` nhận `assets` (inlineData ≤ 4 MB) + `documents` (8k/12k ký tự), chốt 422 "ảnh đính kèm phải được dùng" và "không bịa URL ảnh"; gom file từ phiên chat theo `sessionId` | `e0289988` `bbc05565` |
| PR-2 trợ lý AI: bỏ rẽ API cũ, gửi `files` vào bộ sinh mới; nhánh sửa landing nhận file | `7d6aaa04` |
| PR-3 trang soạn: nút kẹp giấy trong chat canvas, `files` + `landingPageId` | `462b09b2` `24e2e243` |
| PR-4 section "Ảnh của trang": tải ảnh, sao chép URL, chèn `<img>` không qua AI | `6a128a82` |
| Trợ lý chính PR-1: `POST /ai/landing-from-html` (không AI, không credit; tin user chỉ lưu marker, HTML nằm trong thẻ), `PATCH /ai/sessions/:id/landing-message` whitelist 3 khoá | `08410578` |
| Trợ lý chính PR-2: dán nguyên trang HTML vào ô chat → thẻ landing ngay; form "Lưu & xuất bản" (tiêu đề, slug tự sinh, xuất bản ngay) gọi đúng API tạo trang; "Mở trang soạn", "Xuất bản/Ẩn", "Cập nhật trang đã lưu" | `f438766b` |
| Sửa review: mọi đường cập nhật từ chat đọc lại trang trên server, không gửi tên miền (kẻo trang có tên miền riêng tụt về subdomain và mất bản sửa ở trang soạn); nhận diện dán HTML đòi `</html>`/`<body`/≥300 ký tự | `980175a2` |
| Trang soạn: nút "Nhập HTML" (dán hoặc chọn tệp `.html`, đọc trên trình duyệt, xác nhận thay, Hoàn tác, chặn 500k, cảnh báo thiếu form); trang mới hiện 3 lựa chọn; xoá editor cũ 1.837 dòng | `70092b3b` |

Quyết định: không dùng Cloudinary (ép 512px, ngoài quota); ảnh landing là bản sao riêng, không trỏ
vào file chat (file chat bị dọn sau 90 ngày); không migration, mọi thứ nằm trong `storage_objects`;
ảnh của bản nháp còn trong lịch sử chat được job đối soát giữ 90 ngày. Bài học review: một bản sửa
của Gemini suýt ghi đè trang bằng dữ liệu cũ của thẻ chat, và một commit kéo theo 88 dòng i18n của
phiên khác đang sửa dở (phải tách bằng amend trước khi push). Deploy xanh đêm 13/09 và sáng 14/09;
còn sếp nghiệm thu (xem "Việc còn treo").

## Giám sát gửi: lý do hỏng cho mọi lượt, sổ người nhận bị lọc, "hỏng ở ai" ngay trên trang (13/09)

Sếp thấy run "Zalo Auto Plan" báo "2 / 2 lỗi · 6 người" dù tin tới phúc vẫn đến. Truy DB: 2 lượt
hỏng là số `0388180856` với lỗi Zalo "Tham số không hợp lệ" cả hai ngày; "6 người" thật ra là 6 lượt
dự kiến (2 người × 3 bước). Ba lỗ hổng: lý do hỏng chỉ được ghi sổ cái ở chế độ chạy liên tục;
"Tham số không hợp lệ" bị coi là lỗi tạm nên thử lại mỗi ngày; người bị lọc trước khi gửi không đi
vào cột nào.

| Việc | Commit |
|---|---|
| Ghi `lastFailureReason` cho mọi lượt hỏng Zalo cá nhân (mọi chế độ); "Tham số không hợp lệ" lặp lại cùng số trong 30 ngày mới đánh dấu không liên hệ được (bảng đó không có hạn, đánh nhầm là bỏ khách vĩnh viễn); `run_metadata.recipientAudit` đếm hàng nguồn / có số / bị lọc / đã gửi lượt trước; endpoint `GET /delivery-monitor/runs/:id/failures` | `3edfe25e` `c7155362` |
| Trang Giám sát: nhãn "lượt dự kiến" thay "người"; bấm "N lỗi" mở hàng con `người nhận · lý do · số lần · lần cuối` + dòng giải thích từ `recipientAudit` | `c2427628` `4f208a7c` |

## Zalo: khoá tra số khoá nhầm kênh nhóm, tiết kiệm lượt tra, banner lý do hoãn, trần thử lại (16–19/09)

Sếp báo lịch nhóm 09:00 ngày 15/09 không gửi. Truy trên production: lịch khởi động đúng giờ nhưng bị
hoãn ngay tại node gửi vì tài khoản Zalo đang bị khoá tra số điện thoại tới 00:00 hôm sau; ngày 14/09
y hệt. Khoá đó do PR-2 ngày 11/09 (`95a3a6f5`) áp cho mọi kênh, trong khi gửi nhóm theo groupId không
tra số. Khách không thấy lý do nên bấm chạy tay rồi nhân bản chiến dịch, 11 nhóm nhận cùng tin hai lần.
Cùng lúc phát hiện 13 số từ chối nhận tin bị tra lại mỗi sáng suốt 5 ngày vì bộ phân loại không biết
chuỗi "không muốn nhận tin nhắn", và đường gửi cá nhân tra số cho mọi bước dù uid đã biết (30 ngày:
1.426/4.231 lượt tra thừa, tài khoản 34 là 48%).

| Việc | Commit |
|---|---|
| Khoá tra số chỉ chặn kênh có tra số (cá nhân, kết bạn); kênh nhóm đi thẳng | `ce089d1f` |
| "Xin lỗi! Hiện tại tôi không muốn nhận tin nhắn." → danh sách chặn bền `stranger_blocked` ngay lần đầu | `891913cc` |
| Đã biết uid (dòng dữ liệu hoặc `customers.zalo_id`) thì gửi thẳng, không tra số, không bị khoá tra số chặn, pool không nhả slot oan | `99253edc` |
| Banner nêu tài khoản nào, vì sao, tới mấy giờ; hiện cả ở trang builder (poll 60s); badge "bị giới hạn tra số" ở Quản lý kênh gửi; hộp xác nhận trước khi Chạy/lưu lịch cá nhân trên tài khoản đang khoá | `0b3e48d9` `a27dc029` |
| Chế độ một lần: trần 3 lần gửi hỏng cho cùng người (`ZALO_ONESHOT_MAX_SEND_FAILURES`), giãn 6 giờ giữa hai lần thử (`ZALO_ONESHOT_RETRY_DELAY_MS`); trước đó một số bị thử tới 9 lần/ngày | `59a9a2f0` |

Nghiệm thu bằng production (19/09): 13 số run 381 vào bảng chặn 06:00–06:23 ngày 17/09, mỗi số một
lần; log `lookup_skipped` có; run 374/381/408 mang tên tài khoản trong mốc hoãn; run 381 có 179 người
đang đếm lỗi với hẹn +6 giờ, run 408 một người bị bỏ sau 3 lần. Tài khoản 34 gửi cá nhân từ 15 số/ngày
lên 181 rồi 501 số/ngày. **Đính chính**: giả thuyết "Zalo chỉ cho ~30 lượt tra/ngày" ghi ngày 16/09 là
sai; nghẽn là do thử lại cùng 13 số cộng khoá tra số lúc ~06:30 do run kết bạn gây ra. Run kết bạn 374
vẫn làm tài khoản bị khoá mỗi sáng, nên vẫn nên tạm dừng hoặc đổi tài khoản cho campaign 348.

Bài học vận hành ghi kèm: cùng một agent sau compaction báo cáo về việc cũ trong khi tool call vẫn làm
việc mới (đừng tin báo cáo, nhìn `git diff`); thợ báo "unit 3/3 suite" là chạy chọn lọc; đẩy từ
worktree xong thì cây chính còn bản cũ chưa commit; CI từ chối deploy khi có push mới hơn ("Stale
backend deploy refused") là bình thường, kiểm lượt sau có chứa commit mình.

## Chiến dịch tôn trọng đồng ý nhận tin, cả email và Zalo (19–20/09)

Node "Đọc lead landing" không hề lọc `marketing_consent`, nên 7 khách đã bấm từ chối ở form landing
vẫn nhận email chiến dịch; đường huỷ nhận tin cũng vô hiệu vì nó chỉ đặt `marketing_consent = FALSE`
— đúng cột mà node không đọc. Đo production 19/09: 51 lead = 38 đồng ý, 7 từ chối, 6 chưa hỏi.
Sếp chốt: **chỉ loại người đã nói KHÔNG hoặc đã bấm huỷ; người "chưa hỏi" vẫn gửi**.

| Việc | Commit |
|---|---|
| Node chỉ lấy lead chưa từ chối (`excludeConsentFalse` → `marketing_consent IS NOT FALSE`), bảng quản lý và xuất Excel KHÔNG bị lọc | `a6db951e` `fd9f6129` |
| Chặn lúc GỬI email: đọc lại DB theo lead mới nhất của email đó, không dùng ảnh chụp lúc đọc node | `a6db951e` `fd9f6129` |
| Kênh Zalo cá nhân + kết bạn kiểm đồng ý theo SĐT, chặn **trước** khi tra số để không đốt hạn mức tra | `fd9f6129` |
| Nhãn khách đọc: "Khách đã rút lại đồng ý" → "Khách từ chối hoặc đã rút lại đồng ý nhận tin" | `fd9f6129` |
| Cổng đồng ý Zalo hỏng-ĐÓNG (gỡ `typeof ... === 'function'`), dò cột SĐT theo đủ 12 tên cột | `902f0e46` |

Bản đầu (`a6db951e`) ship `marketing_consent IS TRUE` — **loại luôn nhóm "chưa hỏi"**, tức đúng
phương án đã bị loại, và sống một ngày trên production với 6 lead thật bị loại oan. Nó sống được vì
**không có ca test nào cho `NULL`**, cộng một tiêu đề test ghi ngược thân test ("lead FALSE và lead
NULL đều bị bỏ qua" trong khi assert là NULL được gửi). Nay cả ba hàm đều có ca `NULL`.

Hai bẫy khác bắt được ở vòng review: chốt đồng ý bị bọc `typeof ... === 'function'` nên method mất là
lặng lẽ bỏ kiểm — thợ làm vậy vì 10 spec mock service thiếu method mới (bỏ bọc thì 7 spec/19 test
vỡ), cách đúng là vá mock chứ không làm yếu code chạy thật; và chốt dò cột SĐT chỉ `phone || sdt`
trong khi repo có sẵn bộ 12 tên, nên bảng dữ liệu đặt cột `so_dien_thoai` làm chốt tự tắt im lặng.

**Còn nợ**: 3 khoá dịch vẫn ghi "bỏ qua người **chưa đồng ý**" trong khi hệ thống chỉ bỏ qua người
**đã từ chối**; lead "chưa hỏi" vẫn được ghi sang `customers` với `consent_source='landing_lead'`.

## Báo liên hệ khách để lại: lọc rác rao sim, bỏ hội thoại nhóm, nhận danh thiếp Zalo (19–20/09)

Máy quét báo "khách để lại liên hệ" đẻ **7.437 dòng trong 6 ngày cho một chủ shop, 99,3% từ đúng một
hội thoại** — một tài khoản bán sim spam danh sách số vào Zalo; đã gửi 52 thư sai. Đo tiếp thì thấy
gốc nằm sâu hơn chuyện rao sim: trong 100 cảnh báo sinh từ tin dạng JSON, **85 là hội thoại nhóm** —
mà nhóm chưa bao giờ thuộc phạm vi tính năng, vì AI không trả lời hội thoại nhóm.

| Việc | Commit |
|---|---|
| Một tin sinh ≥3 liên hệ thì bỏ cả tin (`CHATBOT_CONTACT_ALERT_MAX_PER_MSG`, mặc định 3); tin `content` là JSON hợp lệ thì bỏ, parse lỗi vẫn quét | `a026eddc` |
| Máy quét bỏ hội thoại nhóm (lọc trong vòng lặp, KHÔNG ở SQL để con trỏ quét không tụt lại sau đuôi tin nhóm) | `022e9dac` |
| Danh thiếp Zalo được nhận lại: `description` parse ra object có khoá `phone` thì lấy đúng số đó | `022e9dac` |
| Bảng đầu số di động thật, cục bộ cho bộ nhận diện (chặn mã số thuế `031…` và khúc hash ảnh `080…` bị đọc thành SĐT) | `022e9dac` `2dd54a47` |

Bảng đầu số bản đầu **thiếu 055 (Wintel/Reddi)** — 84 khách thật, và lưới đó chi phối cả câu bot trả
lời khách "Đã ghi nhận số…", nên khách Wintel bị im lặng hai lần. Nó lọt qua 56 test vì mọi ca đều là
ca mẫu; đột biến "bỏ 099" và "nhận thêm 071-075" đều xanh. Nay có ca ghim **từng** đầu số: 36 đầu số
phải nhận, 12 phải loại.

Dọn tay production: sao lưu rồi xoá 7.382 dòng rác của đúng một hội thoại, còn 55.

## Sự cố: ổ đĩa VPS đầy 100%, Postgres quay vòng chết ở checkpoint (19/09)

Lần thứ hai cùng nguyên nhân (lần đầu 10/08). Triệu chứng khác lần trước: Postgres không chỉ từ chối
kết nối mà **quay vòng chết** — redo xong sạch trong 0,03 giây rồi `PANIC: could not write to file
"pg_logical/replorigin_checkpoint.tmp": No space left on device`, checkpointer bị hạ, `reinitializing`,
lặp lại mỗi ~0,5 giây. `docker inspect` cho `restarts=0` vì container không hề restart — postmaster
bên trong tự quay vòng, nên đừng dùng số lần restart để kết luận.

Phòng đã áp từ 10/08 **không đỡ được**: hai workflow deploy prune với `--filter "until=24h"`, mà ngày
19/09 có ~8 image mới đều dưới 24 giờ nên không xoá được cái nào; cron tuần thì chờ Chủ nhật. Dọn tay
thu hồi 20,38GB.

| Việc | Commit |
|---|---|
| `until=24h` → `until=2h` (vẫn chống đua deploy song song vì một lượt deploy chưa tới 30 phút), thêm lưới cuối: quá 80% thì `docker image prune -af` | `04357e5f` |

Hậu kiểm sau khi DB lên: `amcheck` với `bt_index_check(heapallindexed => true)` — **637 index btree,
hỏng 0**, khác 10/08 (12 index hỏng trả thiếu dòng im lặng). Kiểm nhẹ không bật `heapallindexed` sẽ
nói "sạch" cả khi đang hỏng. Đóng sổ hai lượt chạy vô ích của tài khoản nội bộ: 0 thành công trên
25.165 lượt, mỗi ngày vào lại làm khoá tra số của chính tài khoản đó.

## Việc còn treo (tính tới 19/09/2026)

- **Biểu mẫu + đặt lịch + thanh toán**: code đã lên production đủ yêu cầu gốc, kể cả MoMo hiện thông
  tin ví không QR (`c5ef85b1`, 19/09). **Chưa nghiệm thu thật** mục nào: production chỉ có 1 form thử
  và 2 bài nộp từ 14/09. Kịch bản 7 bước ở `_internal/NGHIEM_THU_FORM_DAT_LICH_2026-09-19.md`, cần
  sếp hoặc Phúc làm với điện thoại và app ngân hàng thật. PR-8 Google Trang tính chưa làm.
- **Chiến dịch "chuyển giao công nghệ" (384)**: sếp đã xoá bản sao (hết gửi đôi) nhưng cũng dừng run
  gốc lúc 10:36 ngày 16/09, nên tin số 2, 3, 4 chưa bao giờ gửi; muốn tiếp phải tạo lượt chạy mới chỉ
  giữ bước 2–4.
- **Nghiệm thu PR-3** sau 2–3 ngày: đếm dòng `zalo_messages` còn `tracking_metadata->>'status' =
  'queued'` theo ngày, phải về 0 (trước vá là 200–350 dòng/tuần). Dấu hiệu sớm tốt: 0 dòng mới
  trong giờ đầu sau deploy.
- **Nghiệm thu PR-2b**: chờ lần cooldown đầu tiên được ghi vào `zalo_settings.phone_lookup_cooldown_until`,
  rồi restart container và xem log có `Đã nạp N cooldown tra số Zalo còn hiệu lực`.
- **39 tài khoản Zalo ở trạng thái `needs_reauth`** (33 không thuộc tài khoản nội bộ), gồm cụm 31 cái
  hỏng cùng ngày 06/09. Quy tắc cảnh báo `zalo_disconnected` **cố ý loại** trạng thái này và không có
  quy tắc nào khác phủ, nên không ai được báo. Chưa gây hỏng vì không chiến dịch nào đang dùng chúng.
  Cần: báo chủ tài khoản đăng nhập lại, và quyết định có đưa `needs_reauth` vào quy tắc hay không.
- **Hai run Zalo của tài khoản nội bộ (374, 381) vẫn `running`**, 0 thành công sau 5 ngày. Chỉ chủ
  tài khoản dừng được.
- **WhatsApp (hoangphuc1capri)**: ba nút thắt deploy đã gỡ 10/09; còn việc của người: chủ tài khoản gỡ
  thiết bị liên kết trong WhatsApp vì khoá phiên đã lộ trên repo public, xoá khỏi git không thu hồi được.
- **Nghiệm thu PR-2d-3 bước 3–4** chờ deploy: trang `slug-test` phải hiện "không khớp mã" → nhờ AI sửa
  → lead thật có `lươngthưởng: <nhãn>`; trang mới qua chat có sẵn `cf_sugg_01_text`/`cf_sugg_02_text`.
  Xong thì gỡ publish `slug-test` (đang public với lead giả).
- **Báo hoangphuc1capri** ba quyết định đã đổi trong `founderai-capture.js` (auto mode, bỏ `cf_<id>`,
  strip iframe có điều kiện), section "Form đăng ký" mới trong `SettingsModal`, việc commit dọn lint
  `1a992e76` đã xoá nút "Để sau" của modal SĐT, và **migration đánh số từ 207** (205, 206 đã dùng).
- **Gửi nhanh PR-3 (kết bạn)**: đo 13/09, 30 ngày chỉ tài khoản công ty (39) chạy kết bạn, 3 run,
  7.410 lời mời. Là tiện ích cho đội của sếp, không phải cho khách — sếp quyết có cần không.
- **Landing**: lộ trình gỡ iframe dựa trên số trang còn `/embed/lead-form` (7 trang, user 1/39/76/143/156);
  các service AI khác (`customChat`, `aiActivity`, `geminiClient`, `aiModelCatalog`) vẫn trả 502 bị
  Cloudflare nuốt. Sinh landing đo được 15,7 giây (13/09) — xa trần 100 giây, plan sinh bất đồng bộ
  tạm gác; hai việc hạ tầng còn lại: `/api` đi thẳng cổng 5001 bỏ qua nginx, và cổng 5001 hở ra Internet.
- **Compiler GĐ5 PR-2→4**: tiêu chí "7 ngày log liên tục" bất khả thi vì deploy mỗi ngày xoá log;
  13/09 đặt cron trên host gom dòng compiler vào `/root/uknow/logs/`, **đọc ngày 20/09** rồi bật cờ.
- **Bắt bounce email**: phép thử envelope ĐẠT 09/09; **code PR-1/PR-2 hoá ra đã có từ 25/08**
  (`80280020`, commit mang tên sai) — util VERP, bộ đọc IMAP, migration 173, cron 10 phút. Production
  chưa bật (0 biến `BOUNCE_*`). Còn ba việc vận hành: xoá TXT ký tự đại diện `digiso.vn` ở iNET (đang
  làm DKIM `permerror`), tạo hộp `bounce@digiso.vn` ở onemail có plus-addressing, điền env rồi deploy.
  Đáng làm: tài khoản công ty gửi ~11.000 thư/30 ngày tới >5.000 địa chỉ mà chỉ 7 bounce được ghi.
- Backend unit đỏ lẻ tẻ khi chạy cả bộ, chạy riêng xanh: đã bắt được tên 13/09 —
  `src/utils/__tests__/migrationRunner.util.spec.js` (nhạy thời gian khi máy bận). Chưa sửa.
- Token Cloudflare thiếu quyền Cache Purge (đã xác minh lỗi `10000`), sửa trên dashboard.
- Báo động deploy đỏ chưa tới người vận hành; 07/09 có 3 lần deploy đỏ không ai biết.
- Lỗi cron restore đếm kết quả bị lock thành "đã khôi phục" trong `cron_job_runs`.
- Ops ngoài hệ thống: GA4 measurement id, UptimeRobot (`_internal/Todo.md`).
- Còn lại từ danh sách 21/08 và master todo tháng 8, đều là quyết định hoặc vận hành, không phải
  code: modal gói dùng thử khi đăng ký bằng Google (P2-1, cần test trình duyệt); `mv uploads` trên
  VPS rồi bật bán lẻ dung lượng; nhập bảng giá theo kênh vào `/admin/plans`; chốt cột `stackable`
  của voucher (bỏ hay làm cho chạy); bài trợ giúp "Liên hệ hỗ trợ"; ETA và nút gửi thử ở Gửi nhanh.
- Nợ bảo mật P2-5 (chỉ hiển thị): `usageTracking.service.js` tính phần trăm 0 khi `limit = 0`,
  màn hạn mức hiện 0% thay vì "đã hết". Đường chặn gửi đã đúng, không ảnh hưởng thu tiền.
- **Sự cố email 07–08/09 (phát hiện 13/09)**: tài khoản SMTP công ty đăng nhập thất bại (535) hai
  ngày, run không dừng mà đánh hỏng 2.464 lượt; **1.579 địa chỉ của đợt "Khảo sát tặng quà cơ hội AI"
  (363/364) chưa bao giờ nhận thư**, tệp đã xuất để sếp quyết gửi lại. Lỗi "535 không dừng run" đã sửa
  `a8c75d27`; cảnh báo tỉ lệ hỏng nay đếm cả email theo cửa sổ (`dddee31e`, 13/09).
- **Sếp nghiệm thu production**: trang Chiến dịch gộp (5 nút vận hành, Chạy ngay → Dừng, tab Lịch chạy,
  sidebar cha/con, trình dựng full-screen); super admin đổi tên nhóm menu khách; thẻ cổng wizard mờ ngay
  sau "huỷ" không cần F5.
- **OTP số điện thoại**: code PR-1→3 trên production sau cờ; bật `PHONE_OTP_PROVIDER=mock` để thử, sếp
  quyết luồng hai bước 15/09; cần tài khoản eSMS/SpeedSMS hoặc Zalo OA để bật thật.
- **PayOS thông báo khi có tiền**: sếp chọn **SMS** (như ảnh) hay **Zalo** (có sẵn); kế toán gửi ảnh SMS
  ngân hàng một giao dịch PayOS đã có. Việc 1 (nội dung chuyển khoản) làm được không cần chờ kênh.
- **Đường tự xoá tài khoản** (NĐ 330): chưa có plan, lộ ra khi modal đồng ý cần lối ra thứ hai.
- **Lịch hẹn có gửi lại người cũ không**: SQL ghi trong `PLAN_AI_GIU_LINK_SHEET` (archive), chạy khi tiện.
- **Bảng câu hỏi của sếp chưa làm**: digest hội thoại chatbot, tự lưu contact từ chatbot, giờ hoạt động
  chatbot (Huy).
- **Sếp nghiệm thu các phần lên 13–14/09** (tất cả đã deploy xanh): (1) trợ lý `/app` đính kèm logo +
  PDF → logo lên header, số liệu PDF vào trang; `storage_objects` dòng `landing_asset` `temp` → `active`
  khi lưu trang; `curl -sI <URL ảnh>` trả 302 kèm `Cache-Control: public, max-age=3600`;
  `file_access_events` không tăng vì ảnh. (2) Dán nguyên trang HTML vào ô chat → thẻ hiện, credit không
  đổi; "Lưu & xuất bản" slug thử → link `slug.founderai.biz` mở được, F5 vẫn thấy "Đã lưu"; sửa ở trang
  soạn rồi về chat bấm "Ẩn trang" → bản sửa còn nguyên. (3) Trang Giám sát bấm "2 lỗi" của "Zalo Auto
  Plan" → `0388180856 · Tham số không hợp lệ · 2 lần`, nhãn "6 lượt dự kiến". (4) "Tạo landing page"
  thấy 3 lựa chọn, dán HTML → Áp dụng → Lưu → mở link public.
- **Ba việc phát sinh từ commit tối 13/09 trên `main`**: (1) một migration xoá toàn bộ 9 bảng `zalo_*`
  từng lên `main` rồi được rút lại sau 36 phút, chưa chạy trên production (đã kiểm: 11 bảng còn nguyên);
  nhiều khả năng nhầm, nhưng cần nhắn thẳng người viết "Zalo vẫn là kênh chính"; (2) image backend đổi
  Node 20 → 22 để có binary dựng sẵn cho `better-sqlite3` (kéo theo từ thư viện Telegram), CI vẫn
  test trên Node 20; (3) `.gitattributes` ép `*.js/*.jsx/*.sql` về LF trong khi repo còn nhiều file CRLF —
  kiểm `git status` sau mỗi lần pull. Migration 212–215 (Telegram/WhatsApp, xoá Viber) áp ở deploy
  xanh `5edf9ddf` 22:55 13/09 (chưa kiểm lại `schema_migrations` bằng SQL).
- ~~Lead tích "không đồng ý" vẫn đi vào chiến dịch qua node `read_landing_leads`~~ — **đã sửa 19/09**:
  PR-1 `4d8a073a` bỏ người đã từ chối hoặc đã huỷ nhận tin, PR-2 `a6db951e` chuyển hẳn sang chỉ lấy
  lead đã tích đồng ý.
- **`zalo_disconnected` nổ mỗi giờ nhiều ngày** vì nhìn cửa sổ 7 ngày rồi báo mỗi giờ — cùng bệnh với
  cảnh báo tỉ lệ hỏng đã sửa 13/09, chưa có plan.
