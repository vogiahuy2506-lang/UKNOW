# Facebook Messenger cho Chatbot Studio

Tài liệu này hướng dẫn kết nối **Fanpage Facebook** với chatbot để tự động trả lời tin nhắn Messenger.

> **Lịch sử:** Facebook bị gỡ khỏi Studio ngày 21/09/2026 vì Meta App chưa có `FACEBOOK_APP_ID`/`FACEBOOK_APP_SECRET`
> nên nút OAuth luôn báo *"Facebook App chưa được cấu hình"*. Đã **khôi phục 05/10/2026** sau khi app được cấu hình.

## Mục lục

1. [Tổng quan](#tổng-quan)
2. [Yêu cầu](#yêu-cầu)
3. [Các bước thực hiện](#các-bước-thực-hiện)
   - [Bước 0: Cấu hình biến môi trường](#bước-0-cấu-hình-biến-môi-trường)
   - [Bước 1: Tạo Meta App](#bước-1-tạo-meta-app)
   - [Bước 2: Cấu hình Messenger Product](#bước-2-cấu-hình-messenger-product)
   - [Bước 3: Cấu hình Redirect URI](#bước-3-cấu-hình-redirect-uri)
   - [Bước 4: Ủy quyền Fanpage trong Founder AI](#bước-4-ủy-quyền-fanpage-trong-founder-ai)
   - [Bước 5: Gắn Fanpage cho chatbot + lấy webhook](#bước-5-gắn-fanpage-cho-chatbot--lấy-webhook)
   - [Bước 6: Dán webhook vào Meta App Dashboard](#bước-6-dán-webhook-vào-meta-app-dashboard)
   - [Bước 7: Test](#bước-7-test)
4. [Xử lý sự cố](#xử-lý-sự-cố)
5. [Ghi chú App Review](#ghi-chú-app-review)

---

## Tổng quan

Luồng gồm **2 bước tách biệt**, dùng 2 bảng khác nhau trong database:

| Bước | Làm ở đâu | Lưu vào bảng | Ý nghĩa |
|---|---|---|---|
| 1. Ủy quyền Fanpage | Cài đặt → Kênh → Facebook | `channel_connections` | "Tài khoản này có Fanpage nào" (per-user) |
| 2. Gắn cho chatbot | Studio → Triển khai → Facebook | `chatbot_channel_connections` | "Chatbot này trả lời Fanpage nào" + sinh webhook |

Bước 2 phải làm **sau** bước 1, vì token Page chỉ tồn tại ở bước 1. Backend tự lấy token từ `channel_connections` —
**không bao giỜ gửi `page_access_token` xuống trình duyệt**.

Khi bật xong, chatbot sẽ:
- Nhận tin nhắn từ khách hàng gửi vào Fanpage
- Trả lời dựa trên tài liệu (knowledge base) đã nạp
- Xử lý tin nhắn có hình ảnh/video/tệp đính kèm
- Nhận quick reply và postback (nút "Bắt đầu")

---

## Yêu cầu

- Tài khoản Facebook có quyền **admin** Fanpage muốn kết nối
- Tài khoản Meta for Developers tại [developers.facebook.com](https://developers.facebook.com)
- Fanpage đã tạo; bạn là admin hoặc có quyền truy cập Task Manager
- Backend chạy trên **HTTPS** (Meta chỉ chấp nhận webhook HTTPS — trừ `localhost` khi dev)

---

## Các bước thực hiện

### Bước 0: Cấu hình biến môi trường

Trong `backend/.env`:

```bash
# Meta App credentials — lấy ở Meta App Dashboard → App Settings → Basic
FACEBOOK_APP_ID=1234567890123456
FACEBOOK_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
FACEBOOK_CLIENT_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Verify token dùng cho bước dán webhook ở Bước 6.
# Bỏ trống = mỗi kênh tự sinh verify_token riêng và giao kèm trong hộp thoại ở Bước 5.
FACEBOOK_WEBHOOK_VERIFY_TOKEN=founderai

# URL public của backend — dùng để ghép webhook_url ở Bước 5
BACKEND_PUBLIC_URL=https://api.founderai.biz

# Base cho OAuth callback của WhatsApp/Zalo; Facebook dùng BACKEND_PUBLIC_URL (xem oauth.controller.js)
OAUTH_CALLBACK_URL=https://api.founderai.biz/api/webhooks/oauth/callback

# URL frontend để redirect sau khi ủy quyền xong
FRONTEND_URL=https://founderai.biz
```

> ⚠️ `BACKEND_PUBLIC_URL` phải là **domain public có HTTPS**, không phải `localhost` — nếu không, webhook URL sinh ra
> sẽ không truy cập được từ internet và Meta sẽ không verify được.

Graph API version đang dùng: **v18.0** (khai báo tại `oauth.controller.js` và `facebook.adapter.js`).

### Bước 1: Tạo Meta App

1. Vào [Meta for Developers](https://developers.facebook.com/apps) → **Create App**
2. Chọn use case **Business** → Next
3. Điền: App Name, Contact Email, Business Portfolio (nếu có)
4. **Create App**

### Bước 2: Cấu hình Messenger Product

1. Trong **Add Products to Your App** → **Set Up** ở **Messenger**
2. Mở **Messenger → Settings**:
   - **Access Tokens** → *Add or Remove Pages* → chọn Fanpage → **Generate Token**
     (giữ token này để dán vào `.env` ở Bước 0)
   - **Webhook Settings** → chưa điền gì, sẽ làm ở **Bước 6**

### Bước 3: Cấu hình Redirect URI

Trong **App Settings → Basic → Valid OAuth Redirect URIs**, thêm:

```
https://api.founderai.biz/api/webhooks/oauth/callback/facebook
```

Khớp đúng với `redirect_uri` mà backend gửi lên Meta:

```70:74:/Users/senna/Code Project/UKNOW/backend/src/controllers/oauth.controller.js
      const appId = process.env.FACEBOOK_APP_ID;
      // OAUTH_CALLBACK_URL is the base for /whatsapp and /zalo-oa callbacks.
      // Facebook uses its own callback path (see webhook.routes.js), so use
      // BACKEND_PUBLIC_URL to avoid double-prefixing /oauth/callback.
      const backendBase = (process.env.BACKEND_PUBLIC_URL || '').replace(/\/+$/, '');
```

### Bước 4: Ủy quyền Fanpage trong Founder AI

1. Vào `/app/settings/channels` → tab **Facebook**
2. Bấm **"Kết nối tài khoản Facebook"**
3. Cửa sổ Meta popup mở ra → chọn **"Tiếp tục với Facebook"** → chọn Fanpage muốn kết nối
4. Sau khi đồng ý, popup đóng lại, trang tự refresh, Fanpage xuất hiện trong danh sách

Trình duyệt có thể chặn popup → cho phép popup cho domain `founderai.biz` rồi bấm lại.

Fanpage sẽ được subscribe vào app tự động (`/{pageId}/subscribed_apps`) — không cần làm tay.

### Bước 5: Gắn Fanpage cho chatbot + lấy webhook

1. Mở chatbot → tab **Triển khai** → ô **Facebook**
2. Modal liệt kê mọi Fanpage đã ủy quyền ở Bước 4
3. Bấm **"Bật"** ở Fanpage muốn dùng
4. Hộp xanh lá hiện ra với 2 giá trị:
   - **Callback URL** — ví dụ `https://api.founderai.biz/api/webhooks/chatbot/facebook/<64-hex>`
   - **Verify Token** — chuỗi hex 32 ký tự
5. Bấm biểu tượng copy cạnh mỗi giá trị

> ⚠️ **Mỗi lần bấm "Bật" là sinh webhook token MỚI.** Nếu đổi Fanpage hoặc bấm lại, token trong Meta Dashboard
> cũ sẽ không khớp nữa → phải dán lại Callback URL + Verify Token mới.

### Bước 6: Dán webhook vào Meta App Dashboard

Vào **Meta App → Messenger → Webhooks → Edit Callback URL**:

| Ô | Điền gì |
|---|---|
| **Callback URL** | Giá trị copy ở Bước 5 |
| **Verify Token** | Giá trị copy ở Bước 5 |

Bấm **Verify and Save**. Meta sẽ GET vào Callback URL với `hub.mode`, `hub.verify_token`, `hub.challenge`.
Backend trả lại `hub.challenge` nếu token khớp:

```394:400:/Users/senna/Code Project/UKNOW/backend/src/controllers/chatbotChannelWebhook.controller.js
      const verifyToken = resolveWebhookVerifyToken({
        channelToken: channel.credentials?.verify_token,
        envNames: FACEBOOK_VERIFY_TOKEN_ENV_NAMES,
      });
      if (verifyToken && hubMode === 'subscribe' && timingSafeStringEqual(hubVerifyToken, verifyToken)) {
        return res.send(hubChallenge);
      }
```

Sau khi verify xong, tick 2 trường trong **Subscribe Fields**:

- [x] `messages`
- [x] `messaging_postbacks`

Rồi bấm **Save**.

> **Lưu ý:** webhook URL có `:token` trong path, nên nó **riêng theo từng chatbot**. Mỗi chatbot cần 1 dòng
> riêng trong Meta Dashboard. Nếu app nhiều chatbot, nhiều dòng là bình thường.

### Bước 7: Test

1. Từ tài khoản Facebook khác (không phải admin app), mở Fanpage → **Messenger** → nhắn thử
2. Kiểm tra log backend có nhận webhook:

   ```bash
   # Trong thư mục backend, nếu chạy local
   tail -f logs/*.log | grep -i facebook
   ```

3. Trong Founder AI: mở chatbot → **Lịch sử trò chuyện** để xem tin nhắn đã vào chưa
4. Nhắn lần 2 để chatbot trả lời (lần đầu Meta chỉ gửi postback khởi tạo)

**Nếu không có phản hồi, kiểm tra theo thứ tự:**

| Kiểm tra | Cách |
|---|---|
| Chatbot đang bật trả lời | Cấu hình chatbot: trạng thái = *Đang bật*, còn AI credits |
| Khung giờ hoạt động | Không có khung giờ bao phủ giờ nhắn → tin bị bỏ qua |
| Chữ ký webhook | Log có `Signature verification failed` → `FACEBOOK_APP_SECRET` sai |
| Webhook verify | Meta báo lỗi verify → Callback URL sai domain hoặc Verify Token cũ |
| Subscribe fields | Thiếu `messages` trong Subscribe Fields |
| Token hết hạn | Bấm nút làm mới ở Cài đặt → Kênh → Facebook |

---

## Xử lý sự cố

### "Facebook App chưa được cấu hình"

Backend không đọc được `FACEBOOK_APP_ID`. Kiểm tra `.env` có đúng tên biến và backend đã restart.

### "Invalid verify token"

Verify Token trong Meta Dashboard ≠ giá trị ở Bước 5. Thường do đã bấm "Bật" lại lần thứ hai (token mới sinh).
Lấy lại từ hộp thoại và dán lại.

### "Channel not found" trong log

Callback URL chứa token không tồn tại trong DB — thường là webhook cũ của chatbot đã bị xoá/gỡ.
Bấm "Bật" lại ở Bước 5.

### Tin nhắn vào nhưng không có phản hồi

1. Chatbot có `is_active = true` không
2. AI credits còn không
3. Khung giờ hoạt động có khớp không
4. `replies_enabled` có bật không

### Webhook không nhận tin

1. Meta **Development mode**: chỉ app-role user mới nhận được — thử bằng tài khoản admin app trước
2. `BACKEND_PUBLIC_URL` phải public HTTPS
3. Subscribe fields đã tick `messages` chưa
4. Fanpage đã được subscribe app chưa (bấm lại "Bật" ở Bước 5 để subscribe lại)

---

## Ghi chú App Review

Ở chế độ **Development**, chỉ admin của app hoạt động. Để mọi người dùng Fanpage của họ dùng được, cần submit
App Review cho các quyền sau:

| Quyền | Bắt buộc? | Ghi chú |
|---|---|---|
| `pages_messaging` | ✅ Có | Cho phép app gửi tin nhắn Messenger. **Không có quyền này thì không submit được** |
| `pages_manage_metadata` | ✅ Có | Giữ Page Access Token không hết hạn (hiện đang dùng) |
| `business_management` | ❌ Không | Chỉ cần nếu sau này làm Ads / Business Manager |

Quyền đang yêu cầu trong OAuth:

```87:88:/Users/senna/Code Project/UKNOW/backend/src/controllers/oauth.controller.js
      const scopes = 'pages_manage_metadata,pages_messaging';
      const facebookAuthUrl = `${FB_OAUTH_BASE}?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&scope=${scopes}`;
```

### Về Page Access Token

- Token do backend đổi qua `fb_exchange_token` nên là **long-lived**, nhưng vẫn có thời hạn (thường ~60 ngày)
- Có nút **làm mới** ở Cài đặt → Kênh → Facebook; cũng có `refresh-all` để làm mới toàn bộ
- Token refresh được cascade sang cả `chatbot_channel_connections` nên không cần kết nối lại

### Về Data Policy

Tuân thủ [Meta Platform Terms](https://www.facebook.com/policies_center/) và
[Data Use Policy](https://www.facebook.com/about/privacy/). Có nút thông báo "chatbot tự động" trong cấu hình
chatbot để tuân thủ quy định PDPD.
