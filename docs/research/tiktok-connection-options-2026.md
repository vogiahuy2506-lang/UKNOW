# Nghiên cứu bổ sung: Liên kết TikTok cho UKNOW — có nhất thiết phải là Business không?

> Ngày: 11/10/2026 · Bổ sung cho `docs/research/tiktok-business-messaging-integration.md` (10/10/2026)
> Câu hỏi gốc: "Nghiên cứu kĩ hơn về liên kết với TikTok, không nhất thiết phải là TikTok Business"
> Trả lời ngắn: **Không có cách chính thức nào khác để nhận/gửi DM tự động**. Business Messaging API là con đường duy nhất. Personal account automation vi phạm TOS TikTok (rủi ro ban). Tuy nhiên, có 3 điểm quan trọng plan cần điều chỉnh.

---

## 1. Tổng quan 4 lựa chọn (đã verify từ nguồn 2026)

| # | Cách | Loại tài khoản | Gửi/nhận DM? | Rủi ro | Phù hợp UKNOW? |
|---|---|---|---|---|---|
| 1 | **TikTok Business Messaging API** (v1.3) | **Business Account** (bắt buộc) | ✅ Nhận + reply (không cold DM, rate 10/48h) | Thấp (chính thức) | ✅ **Khuyến nghị** |
| 2 | **TikTok Login Kit + Display API** | Bất kỳ | ❌ Chỉ authenticate + đọc profile/video, **không gửi DM** | Thấp | ❌ Không dùng được cho chatbot |
| 3 | **TikTok Shop Seller API** | **Business + Shop verified** | ✅ Có (gated, region cụ thể) | Thấp | ⚠️ Hẹp (chỉ user có Shop) |
| 4 | **Third-party reverse-engineer** (Hooka, UnifyPort, ManyChat browser) | Personal/Creator | ✅ Cold DM từ personal | **Cao** — vi phạm TOS, **ban account** | ❌ **KHÔNG** dùng |

**Nguồn đã verify (2026):**
- [Hooka — "TikTok has no official API for sending cold DMs" (06/2026)](https://hooka.to/api/)
- [UnifyPort — "There is no such endpoint. As of 2026, TikTok's official developer API does not let you send or receive direct messages"](https://www.unifyport.ai/blog/tiktok-no-dm-api-receive-messages/)
- [ManyChat Blog — "you must have a TikTok Business Account to use automations"](https://manychat.com/blog/manychat-x-tiktok-the-future-of-creator-conversations/)
- [TikTok Display API — chỉ đọc profile/video](https://developers.tiktok.com/docs/en/display-api-get-started)
- [TikTok Login Kit — chỉ OAuth 2.0 cho user info](https://developers.tiktok.com/docs/en/login-kit-overview)
- [MonoChat — "Personal accounts aren't eligible" cho Business Messaging](https://monochat.ai/blog/tiktok-business-messaging)
- [Wati — "Business Messaging features and API aren't available on Personal Accounts"](https://www.wati.io/en/blog/tiktok-business-account-vs-personal-account/)

---

## 2. Vì sao Business Messaging API là lựa chọn duy nhất

### 2.1. TikTok cố tình giới hạn DM cho personal

Theo [TikTok Terms of Service (15/07/2026)](https://www.tiktok.com/legal/page/global/terms-of-service-july-eea/en):
> "extract any data or content from the Platform using any automated system or software that is not provided by TikTok or approved in writing by TikTok; or use or attempt to use another user's account without authorisation"

Và:
> "We, subsequently, might determine to temporarily suspend or permanently terminate your account... if we determine, acting reasonably and objectively, that you are in material or repeated breach of these Terms"

**Hệ quả**:
- Không có API chính thức nào cho personal account gửi DM.
- Mọi tool "tự động hoá DM từ personal" đều dùng browser automation / reverse-engineer → vi phạm 2 điều khoản trên.
- TikTok ghi nhận số lần vi phạm, vi phạm nhiều lần hoặc 1 lần nghiêm trọng = ban vĩnh viễn.
- Hooka (top tool 2026) thừa nhận: "**no API parameter removes ban risk. Hooka minimizes it... but we never promise zero bans**".

### 2.2. UKNOW user persona — đã verify từ chính uknow.edu.vn

Search "UKNOW customer persona creator personal TikTok" cho thấy `uknow.edu.vn` (tên miền khác với `uknow.app` mà repo này đang code) là **nền tảng dạy AI cho Sales/Marketing** tại Việt Nam, target user:
- Chủ shop / SME cần hiểu khách
- Marketer / Freelancer
- Team content
- Nhân viên Sales/Marketing

Còn `uknow.app` (repo này) target user tương tự: **chủ shop/SME Việt Nam** dùng làm landing page, chatbot bán hàng, CRM. **Không phải creator/influencer/TikToker chuyên nghiệp**.

**Hệ quả**:
- User UKNOW đã có (hoặc sẽ tạo) **tài khoản TikTok Business** vì cần:
  - TikTok Shop bán hàng
  - Ads Manager chạy quảng cáo
  - Analytics nâng cao
- User KHÔNG cần giữ personal account với trending sounds, Creator Rewards, full music library (mất khi switch).
- **Nghịch lý "không nhất thiết phải là Business" là không có cơ sở** trong bối cảnh UKNOW.

---

## 3. Những điều cần điều chỉnh trong plan gốc (10/10/2026)

### 3.1. Thêm ràng buộc region — đã verify

| Region | Business Messaging API? |
|---|---|
| **APAC** (gồm Việt Nam) | ✅ Có |
| **LATAM** | ✅ Có |
| **METAP** (Middle East, Turkey, Africa, Pakistan) | ✅ Có |
| **Bắc Mỹ** (Mỹ, Canada) | ✅ Có (mở rộng 2025) |
| **EEA** (EU) | ❌ KHÔNG |
| **Thụy Sĩ** | ❌ KHÔNG |
| **Anh (UK)** | ❌ KHÔNG |

**Nguồn**: [TikTok Business Messaging API docs](https://business-api.tiktok.com/portal/docs/business-messaging-api/v1.3), [Whautomate](https://whautomate.com/integrations/tiktok), [ManyChat community](https://community.manychat.com/product-updates/tiktok-automations-are-now-available-in-the-u-s-7729).

**Ảnh hưởng plan**: User UKNOW ở VN → APAC → OK. Cần thêm UI notice ở trang Settings: "TikTok Business Messaging hiện không hỗ trợ tài khoản đăng ký ở EEA/Thụy Sĩ/UK. Có thể đăng ký lại ở region khác."

### 3.2. Bổ sung "Advanced Access" tier

Theo [TikTok Business Help — Account entitlements](https://ads.tiktok.com/help/article/about-tiktok-account-entitlements), có 3 cấp:

| Tier | Cách đạt được | Có Business Messaging? |
|---|---|---|
| **General Account** | Mặc định | ❌ |
| **Advanced Access** | Link với TikTok for Business account HOẶC unverified Business Center | ⚠️ Có, nhưng hạn chế (welcome message cần Verified) |
| **Verified Business Account** | Verify business qua Business Suite | ✅ Đầy đủ |

**Ảnh hưởng plan**:
- User có Business Account mới đăng ký có thể ở tier "Advanced Access" → cần thông báo "cần verify business để dùng auto-message, keyword reply".
- Welcome message + keyword reply + suggested question + chat prompt **chỉ khả dụng với Advanced Access + Verified Business Account** (theo [MonoChat](https://monochat.ai/blog/tiktok-business-messaging)).
- Plan cũ chỉ nói "open beta" + rate limit — bổ sung tier này để owner biết phải làm gì nếu thấy nút bị disable.

### 3.3. Bổ sung ràng buộc "Direct Messages = Everyone"

Theo [Whautomate](https://whautomate.com/integrations/tiktok):
> "Who can message you: Set TikTok direct messages to 'Everyone' first, otherwise new messages arrive as message requests."

**Ảnh hưởng plan**: Thêm 1 bước onboarding cho user:
1. Mở TikTok app
2. Vào Settings → Privacy → Direct Messages → "Everyone" (mặc định có thể là "Friends")
3. Nếu không set, tin nhắn đến sẽ rơi vào "Message requests" (chỉ thấy khi owner mở TikTok app) — **API không nhận được** các request này.

### 3.4. Khuyến nghị: KHÔNG xét phương án personal automation

Lý do:
- **Vi phạm TOS TikTok** → risk ban account → user mất kênh bán hàng đã xây.
- **Không bền vững**: TikTok liên tục thay đổi chữ ký request, captcha, rate limit → tool hay break.
- **Không thể scale**: 1 tool chỉ chạy được trên 1 account → UKNOW làm SaaS đa-tenant sẽ rất khó.
- **Pháp lý**: nếu UKNOW đứng giữa tool này → UKNOW chịu trách nhiệm pháp lý với khách hàng của họ (TikTok có thể kiện).

**Quyết định**: Plan vẫn đi hướng Business Messaging API. **Không** xây UKNOW trên nền reverse-engineer.

### 3.5. Switch personal → business — checklist cho user

Theo [Hootsuite (2026)](https://blog.hootsuite.com/tiktok-business-vs-personal/) + [SocialzAI](https://socialz.ai/blog/tiktok-business-account), user muốn dùng UKNOW chatbot TikTok mà đang ở personal/creator cần:

| Bước | Hành động | Có mất gì không? |
|---|---|---|
| 1 | Settings → Account → Switch to Business Account | Miễn phí, mất vài phút |
| 2 | (Tuỳ chọn) Verify business trong Business Suite | Mất 1-5 ngày, cần giấy tờ |
| 3 | Settings → Privacy → Direct Messages → Everyone | Không mất gì |
| 4 | (Tuỳ chọn) Link tài khoản với TikTok for Business Center | Không mất gì |
| 5 | Kết nối UKNOW qua OAuth | Token có 24h, refresh 365d |

**Cái KHÔNG mất** khi switch: followers, videos, engagement history, username, profile.
**Cái MẤT**: full trending music library, Creator Rewards, Duet/Stitch với chart music, có thể mất analytics cũ.

**Ảnh hưởng plan**: Thêm 1 bước onboarding trong FE: nếu `role` trong token response là `personal_account` (UKNOW sẽ check sau OAuth) → hiển thị hướng dẫn "Cần chuyển sang Business Account trước khi dùng chatbot".

---

## 4. Cập nhật cụ thể cho plan `docs/plan/tiktok-business-messaging-integration.md`

| Mục plan cũ | Sửa thành |
|---|---|
| Việc 7.5 (ChannelNotInPlanNotice) | Thêm notice "TikTok chỉ khả dụng cho Business Account tại APAC/LATAM/METAP/Bắc Mỹ. Nếu bạn đang ở EEA/Thụy Sĩ/UK, hãy đăng ký tài khoản ở region khác." |
| Việc 3 (Settings controller) | Thêm step onboarding check `role === 'personal_account'` → trả lỗi có hướng dẫn switch |
| Việc 2.2 (OAuth service) | Lưu `scope` + `role` (từ `/v2/user/info/` nếu cần) để phân biệt tier |
| Bẫy mới | **Bẫy 14**: User có personal account → OAuth trả về nhưng Business Messaging API từ chối 401/403 → UKNOW phải check sớm |
| Bẫy mới | **Bẫy 15**: Direct Messages = "Friends" → tin nhắn đến rơi vào message requests, API không nhận → bot không reply → user tưởng UKNOW lỗi |
| Nghiệm thu | Thêm 3 tình huống: (1) User ở region EU → 403 với hướng dẫn; (2) User ở personal account → 403 với hướng dẫn switch; (3) DM = Friends → 1 message gửi đi không nhận |

---

## 5. Mục chưa nghiên cứu hết (ghi nhận để PR sau)

| Mục | Lý do |
|---|---|
| TikTok Shop Seller API | Cần user có Shop + region cụ thể → xét sau khi Business Messaging ổn định |
| Comment-to-Message API (direct_reply/update) | Cần scope riêng, open beta có thể chưa public |
| Welcome message / keyword reply (auto_message API) | Cần Advanced Access + Verified Business |
| Live Shopping integration | TikTok Shop riêng, xa phạm vi chatbot |

---

## 6. Tóm tắt một dòng

> **Không có cách chính thức nào khác để chatbot UKNOW nhận/gửi TikTok DM từ tài khoản personal**. Business Messaging API (chỉ dành cho Business Account) là con đường duy nhất bền vững, hợp pháp, và đúng với persona user UKNOW (SME/shop owner Việt Nam). Plan cũ vẫn đi đúng hướng; cần bổ sung 3 ràng buộc thực tế: region (EEA/UK/CH blocked), tier (Advanced Access / Verified Business), và DM privacy setting (Everyone).

---

## 7. Tài liệu tham chiếu

| Nguồn | URL | Đã dùng cho mục |
|---|---|---|
| Hooka — "No official API for sending cold DMs" (06/2026) | https://hooka.to/api/ | §1, §2.1 |
| UnifyPort — "There is no such endpoint" (2026) | https://www.unifyport.ai/blog/tiktok-no-dm-api-receive-messages/ | §1, §2.1 |
| ManyChat Blog — "Business Account required" | https://manychat.com/blog/manychat-x-tiktok-the-future-of-creator-conversations/ | §1, §2.2 |
| ManyChat community — US rollout 2026 | https://community.manychat.com/product-updates/tiktok-automations-are-now-available-in-the-u-s-7729 | §3.1, §3.2 |
| MonoChat — Business Messaging | https://monochat.ai/blog/tiktok-business-messaging | §1, §3.2 |
| Wati — Business vs Personal | https://www.wati.io/en/blog/tiktok-business-account-vs-personal-account/ | §1 |
| Whautomate — Region + DM = Everyone | https://whautomate.com/integrations/tiktok | §3.1, §3.3 |
| TikTok Display API | https://developers.tiktok.com/docs/en/display-api-get-started | §1 |
| TikTok Login Kit | https://developers.tiktok.com/docs/en/login-kit-overview | §1 |
| TikTok Business Messaging API docs | https://business-api.tiktok.com/portal/docs/business-messaging-api/v1.3 | §3.1 |
| TikTok Business entitlement tiers | https://ads.tiktok.com/help/article/about-tiktok-account-entitlements | §3.2 |
| TikTok Terms of Service (15/07/2026) | https://www.tiktok.com/legal/page/global/terms-of-service-july-eea/en | §2.1 |
| Hootsuite — Switch guide 2026 | https://blog.hootsuite.com/tiktok-business-vs-personal/ | §3.5 |
| SocialzAI — Setup Business Account | https://socialz.ai/blog/tiktok-business-account | §3.5 |
| Creator Lane — DM Automation state 2026 | https://creatorlanehq.com/blog/tiktok-dm-automation-state-2026 | §2.1, §2.2 |
| Noobclaw — TikTok Auto Uploader risks | https://noobclaw.com/blog/tiktok-auto-uploader-github-risks-2026/ | §2.1 |
| UKNOW customer persona (chính uknow.edu.vn) | https://uknow.edu.vn/courses/ky-nang-ung-dung-tri-tue-nhan-tao-ai-trong-sales-marketing-lop-nang-cao/ | §2.2 |
