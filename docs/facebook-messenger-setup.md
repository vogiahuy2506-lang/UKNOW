# Hướng dẫn kết nối Facebook Messenger Chatbot

Tài liệu này hướng dẫn bạn kết nối Fanpage Facebook với UKNOW chatbot để tự động trả lời tin nhắn từ khách hàng.

## Mục lục

1. [Tổng quan](#tổng-quan)
2. [Yêu cầu](#yêu-cầu)
3. [Các bước thực hiện](#các-bước-thực-hiện)
   - [Bước 1: Tạo Meta App](#bước-1-tạo-meta-app)
   - [Bước 2: Cấu hình Messenger Product](#bước-2-cấu-hình-messenger-product)
   - [Bước 3: Cấu hình Webhook](#bước-3-cấu-hình-webhook)
   - [Bước 4: Lấy Page Access Token](#bước-4-lấy-page-access-token)
   - [Bước 5: Kết nối trên UKNOW](#bước-5-kết-nối-trên-uknow)
4. [Xử lý sự cố](#xử-lý-sự-cố)

---

## Tổng quan

Khi kết nối thành công, chatbot AI sẽ:
- Tự động trả lời tin nhắn từ khách hàng gửi đến Fanpage
- Trả lời dựa trên Knowledge Base đã được cấu hình
- Hỗ trợ xử lý hình ảnh, sticker, và các loại tin nhắn đặc biệt
- Tự động phát hiện và ghi nhận thông tin liên hệ (số điện thoại, email)

---

## Yêu cầu

- Tài khoản Facebook có quyền quản trị Fanpage
- Tài khoản Meta for Developers (đăng ký tại [developers.facebook.com](https://developers.facebook.com))
- Fanpage đã được tạo và bạn có quyền admin

---

## Các bước thực hiện

### Bước 1: Tạo Meta App

1. Truy cập [Meta for Developers](https://developers.facebook.com/apps)

2. Bấm **"Create App"**

3. Chọn loại app là **"Business"** và bấm **Next**

4. Điền thông tin:
   - **App Name**: Tên app (VD: "UKNOW Chatbot")
   - **App Contact Email**: Email liên hệ
   - **Business Portfolio**: Chọn business account của bạn (nếu có)

5. Bấm **Create App**

### Bước 2: Cấu hình Messenger Product

1. Trong App Dashboard, tìm mục **"Add Products to Your App"**

2. Tìm và bấm **"Set Up"** trên **Messenger**

3. Sau khi Messenger được thêm, cuộn xuống phần **"Access Tokens"**

### Bước 3: Cấu hình Webhook

1. Trong phần **Webhook Settings** của Messenger, bấm **"Edit Callback URL"**

2. Điền thông tin:
   - **Callback URL**: Copy từ UKNOW (sẽ hiển thị sau khi bạn nhập Page Access Token)
   - **Verify Token**: Copy chuỗi Verify Token từ UKNOW

3. Bấm **"Verify and Save"**

4. Sau khi verify thành công, trong phần **"Webhook Fields"**, tick chọn:
   - `messages`
   - `messaging_postbacks`

5. Bấm **"Save"**

### Bước 4: Lấy Page Access Token

1. Trong phần **"Access Tokens"**, bấm **"Add or Remove Pages"**

2. Chọn Fanpage bạn muốn kết nối

3. Bấm **"Generate Token"**

4. **QUAN TRỌNG**: Copy và lưu trữ Page Access Token ngay lập tức
   - Token chỉ hiển thị **MỘT LẦN DUY NHẤT**
   - Token có thời hạn (thường 90 ngày), cần renew định kỳ

### Bước 5: Kết nối trên UKNOW

1. Truy cập **AI Chatbot** → **Tạo AI Chatbot** (hoặc chọn chatbot hiện có)

2. Chọn tab **"Triển khai"**

3. Trong phần **Facebook Messenger**, điền:
   - **Page ID**: ID của Fanpage (lấy từ Meta Business Suite hoặc Graph API)
   - **Page Access Token**: Token đã copy ở Bước 4
   - **Tên Page**: Tên hiển thị (tùy chọn)

4. Bấm **"Lưu cấu hình"**

5. Sau khi lưu thành công, hệ thống sẽ hiển thị:
   - **Webhook URL**: URL để cấu hình trên Meta App Dashboard
   - **Verify Token**: Token để xác minh webhook

6. Quay lại Meta App Dashboard và hoàn tất cấu hình Webhook (Bước 3)

7. Bấm **"Test webhook"** để xác nhận kết nối hoạt động

---

## Xử lý sự cố

### Lỗi "Verify token mismatch"

- Đảm bảo Verify Token trên UKNOW và Meta App Dashboard hoàn toàn giống nhau
- Copy lại Verify Token nếu cần

### Lỗi "Page Access Token invalid"

- Token có thể đã hết hạn
- Kiểm tra lại trên Meta App Dashboard → Messenger → Access Tokens
- Generate token mới nếu cần

### Lỗi "Webhook not receiving messages"

- Đảm bảo đã subscribe đúng events: `messages`, `messaging_postbacks`
- Kiểm tra SSL certificate của server (Meta yêu cầu HTTPS)
- Test webhook bằng công cụ "Send to webhook" trong Meta App Dashboard

### Tin nhắn không được reply

1. Kiểm tra chatbot có đang **Active** không
2. Kiểm tra AI credits còn không
3. Kiểm tra khung giờ hoạt động (Active Hours) đã được cấu hình
4. Xem log trong phần **Lịch sử trò chuyện**

---

## Lưu ý quan trọng

### Về Page Access Token

- Token có thời hạn, thường là 90 ngày
- Để token không bị hết hạn, Meta khuyến nghị:
  - Sử dụng app có quyền `pages_manage_metadata`
  - Token sẽ không hết hạn nếu user là admin của app và page

### Về Meta Review

- Nếu app ở chế độ **Development**, chỉ admin của app mới nhận được reply
- Để tất cả người dùng đều nhận được reply, app cần submit review:
  - Permissions cần review: `pages_messaging`
  - Tham khảo [Meta App Review Guide](https://developers.facebook.com/docs/app-review)

### Về Data Policy

- Đảm bảo tuân thủ [Meta Platform Terms](https://www.facebook.com/policies_center/) và [Data Use Policy](https://www.facebook.com/about/privacy/)
- Thông báo cho người dùng về việc tin nhắn được xử lý tự động (nếu cần theo quy định GDPR/PDPD)

---

## Liên hệ hỗ trợ

Nếu gặp khó khăn trong quá trình kết nối, vui lòng:
- Kiểm tra [UKNOW Help Center](https://uknow.vn/help)
- Liên hệ support qua email: support@uknow.vn
