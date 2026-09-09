# WhatsApp cho Chatbot Studio

Tài liệu này hướng dẫn cấu hình kênh **WhatsApp** cho Chatbot Studio. Có 2 đường
kết nối song song — chọn 1 (hoặc dùng cả 2 nếu cần):

| Đường kết nối | Cần gì | Phù hợp với |
|---|---|---|
| **Baileys** (QR scan, đơn giản) | Quét QR bằng WhatsApp Business trên điện thoại | Cá nhân, doanh nghiệp nhỏ, không muốn qua Meta Business verification |
| **Cloud API** (Meta OAuth, chuyên nghiệp) | Meta App verified + Business verification | Doanh nghiệp cần volume cao, template messages |

Sau khi kết nối xong, gán AI reply cho từng chatbot ở **Triển khai → WhatsApp**
trong Studio — modal sẽ tự liệt kê **cả 2 loại account**.

---

## A. Baileys (khuyến nghị — đường nhanh)

### 1. Kết nối số WhatsApp

1. Vào `/app/settings/channels#whatsapp` → tab **WhatsApp**.
2. Bấm **Tạo QR đăng nhập** (nếu chưa có slot nào) hoặc bấm **Kết nối** trên
   một slot còn trống.
3. Quét QR bằng WhatsApp Business trên điện thoại → chờ vài giây.
4. Số WhatsApp xuất hiện trong danh sách với status **Đã kết nối** (xanh).

> Có thể kết nối nhiều số: mỗi số = 1 session độc lập. Slot mặc định tên
> `default`; các slot tiếp theo user tự đặt tên (vd `shop-a`, `support`).

### 2. Gán AI reply cho từng chatbot

1. Mở chatbot bất kỳ → tab **Triển khai** → tile **WhatsApp**.
2. Modal hiện ra liệt kê **mọi số WhatsApp đã kết nối** (cả Baileys lẫn
   Cloud API). Mỗi số có switch **AI** riêng cho chatbot này.
3. Bật switch → chatbot này bắt đầu nhận tin nhắn từ số WhatsApp đó.
4. Một số WhatsApp có thể bật cho nhiều chatbot — mỗi chatbot có toggle riêng.

### 3. Kiểm tra nhanh

- Từ điện thoại khác, nhắn vào số WhatsApp đã kết nối.
- Sau 5–10s (debounce), bạn sẽ thấy:
  - Tin nhắn lưu vào `chatbot_messages` với `role='visitor'`.
  - Bot trả lời và tin nhắn lưu với `role='bot'`.

### 4. Giới hạn Baileys

- Mỗi session = 1 số WhatsApp.
- Volume cao có thể bị Meta throttle/ban nếu gửi quá nhanh.
- Không hỗ trợ template messages (chỉ free-form text trong 24h window).
- Nên dùng với số WhatsApp Business; dùng số cá nhân có thể vi phạm Meta ToS.

---

## B. Cloud API (Meta OAuth — nâng cao)

### 1. Đăng ký Meta App + Business

1. Vào <https://business.facebook.com/> → tạo **Meta Business Account** (verified).
2. Vào <https://developers.facebook.com/apps/> → **Create App** → loại **Business**.
3. Trong App vừa tạo, vào **Add a Product** → thêm **WhatsApp**.
4. Trong **WhatsApp → API Setup**:
   - Copy **WhatsApp Business Account ID** (WABA ID) — cần cho từng số điện thoại.
   - Copy **Phone number ID** cho từng số.
5. **Settings → Basic** → copy **App ID** và **App Secret** (bấm "Show" để hiện secret).

> App phải ở trạng thái **Live** (không phải Development) để gửi/nhận tin nhắn với user ngoài danh sách test.

## 2. Cấu hình Webhook

1. Trong App dashboard, **WhatsApp → Configuration → Webhook** → bấm **Edit**.
2. **Callback URL**: `https://<backend-host>/api/webhooks/chatbot/whatsapp/<token>`
   - `<token>` lấy từ trang quản lý kênh sau khi tài khoản được kết nối (mỗi tài khoản có token riêng).
3. **Verify Token**: trùng với biến `WHATSAPP_WEBHOOK_VERIFY_TOKEN` trong `.env`.
4. **Webhook fields**: tick **messages** (chỉ cần messages cho PR 1).
5. Bấm **Verify and Save** — Meta sẽ GET URL trên với `hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`. Backend sẽ trả lại `challenge`.

## 3. Cấu hình biến môi trường

Trong `backend/.env`:

```
WHATSAPP_APP_ID=<Meta App ID>
WHATSAPP_APP_SECRET=<Meta App Secret>
WHATSAPP_OAUTH_REDIRECT_URI=https://<backend-host>/api/webhooks/oauth/callback/whatsapp
WHATSAPP_WEBHOOK_VERIFY_TOKEN=<random-32-chars>
WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID=<optional>
```

> **HTTPS bắt buộc.** Meta Cloud API không chấp nhận webhook URL HTTP (trừ localhost khi dev với ngrok).

## 4. Kết nối tài khoản WhatsApp (UI)

1. Vào `/app/settings/channels#whatsapp` → bấm **Kết nối WhatsApp**.
2. Popup Meta sẽ mở → đăng nhập bằng tài khoản có quyền trên WABA.
3. Trong popup Meta:
   - Chọn **Meta Business Account** (WABA).
   - Chọn **Phone Number** muốn kết nối (chỉ những số đã verified mới hiện).
   - Cấp quyền `whatsapp_business_management` + `whatsapp_business_messaging`.
4. Sau khi đồng ý, popup redirect về `/app/settings/channels?whatsapp_oauth=success&state=...`.
5. Chọn **chatbot để gắn tài khoản** → bấm **Kết nối**.
6. Tài khoản mới xuất hiện trong list, **AI mặc định tắt**. Bật toggle **AI đang bật** để kích hoạt.

## 5. Gán AI reply cho từng chatbot

1. Mở chatbot bất kỳ → tab **Triển khai** → tile **WhatsApp**.
2. Modal hiện ra liệt kê tất kỳ tài khoản nào đã kết nối. Mỗi tài khoản có switch **AI** riêng cho chatbot này.
3. Bật switch để **chatbot này** bắt đầu nhận tin nhắn từ số WhatsApp đó.
4. Một tài khoản WhatsApp có thể bật cho nhiều chatbot — mỗi chatbot có toggle riêng, độc lập với nhau.

## 6. Kiểm tra nhanh

- Sau khi cấu hình webhook ở bước 2, mở Meta App dashboard → **WhatsApp → Configuration → Webhook** kiểm tra hiển thị tài khoản + số đã subscribe.
- Từ điện thoại WhatsApp cá nhân, nhắn vào số đã kết nối. Sau 5-10s (debounce) bạn sẽ thấy:
  - Tin nhắn lưu vào `chatbot_messages` với `role='visitor'`.
  - Bot trả lời và tin nhắn lưu với `role='bot'`.
  - Log `[ChatbotDebounce] channel=whatsapp ... result=sent` xuất hiện trong `backend` logs.

## 7. Giới hạn (PR 1)

- **Free-form text chỉ trong 24h session window.** Sau khi user nhắn 24h, bot không gửi được text nữa (Meta chặn). Cần **template messages** để gửi ngoài cửa sổ này — sẽ có trong PR 2.
- **Media chưa hỗ trợ** (ảnh, video, document). Chỉ text.
- **Per-account AI config** (model/temperature/system_instruction riêng cho mỗi WhatsApp account) defer PR 2. Hiện tại mỗi account dùng config của chatbot chính.
- **Single business per user** — multi-business switching defer PR 2.
- **Pending OAuth store in-memory** — production multi-instance cần swap sang Redis. Đã chú thích trong `whatsappOAuth.service.js`.

## 8. Khắc phục sự cố

| Triệu chứng | Nguyên nhân thường gặp |
|-------------|------------------------|
| Meta báo "URL couldn't be validated" | Backend chưa HTTPS hoặc verify_token sai. |
| `Backend log: Signature verification failed` | `WHATSAPP_APP_SECRET` không trùng App trên Meta, hoặc body bị JSON.parse trước khi verify. |
| `Webhook not delivered` | WABA chưa được subscribe (chạy lại OAuth popup hoặc gọi `POST /<waba_id>/subscribed_apps`). |
| `Bad Request: recipient not in allowed list` | User nằm ngoài 24h window. Cần template messages. |
| `Backend log: chatbot_disabled` | Toggle AI trong modal DeployTab chưa bật cho chatbot này. |
| `Backend log: disabled` | Toggle "AI đang bật" ở ChannelSettings chưa bật cho tài khoản. |

## 9. Tham khảo

- [Meta WhatsApp Cloud API docs](https://developers.facebook.com/docs/whatsapp/cloud-api)
- [Meta Embedded Signup](https://developers.facebook.com/docs/whatsapp/embedded-signup)
- [Webhook security](https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests)
