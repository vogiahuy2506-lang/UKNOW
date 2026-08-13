# PLAN: AI Demo Widget cho Landing Page + Trang Demo AI Chat

## Bối Cảnh

Sếp yêu cầu cho phép user không đăng nhập truy cập `/app` để hỏi AI miễn phí 1 lần (theo IP/máy). Cách này có vấn đề: IP spoofable, tốn chi phí AI, không capture leads, UX confusing.

**Giải pháp thay thế:**
1. Thêm **AI Chat Widget nhỏ** vào trang landing (`/`) và pricing (`/pricing`) - giới hạn 3-5 câu hỏi
2. Tạo **trang `/demo`** riêng biệt cho AI chat demo nâng cao hơn

---

## Việc 1: Tạo Backend API cho Demo Chat (Không cần auth)

### File cần tạo:
- `backend/src/routes/aiPublic.routes.js`
- `backend/src/controllers/aiPublic.controller.js`
- `backend/src/services/ai/aiPublic.service.js`
- Đăng ký route trong `backend/src/routes/index.js`

### Logic:
- **Endpoint:** `POST /api/ai-public/chat`
- **Không yêu cầu JWT token**
- **Rate limit:** 5 requests/IP/ngày (in-memory hoặc Redis)
- **Model:** `gemini-2.5-flash-lite` (tiết kiệm chi phí)
- **System prompt:** Chỉ trả lời về sản phẩm UKNOW, không tạo campaign thật

### Nghiệm thu:
- `curl -X POST http://localhost:3000/api/ai-public/chat -d '{"message":"UKNOW là gì?"}'` → trả về response hợp lệ
- Request thứ 6 từ cùng IP → trả về lỗi 429 với message "Bạn đã hết lượt demo hôm nay"

---

## Việc 2: Tạo Component DemoChatWidget

### File cần tạo:
- `frontend/src/components/demo/DemoChatWidget.jsx`

### Props/Config:
```jsx
<DemoChatWidget 
  maxMessages={5}           // Giới hạn 5 tin nhắn
  placeholder="Hỏi tôi về UKNOW..."
  theme="light" | "dark"
  position="bottom-right"   // Vị trí trên landing page
/>
```

### UI:
- Floating button ở góc phải màn hình (giống Intercom widget)
- Khi click → expand thành chat box nhỏ (max 400px height)
- Hiển thị số câu hỏi còn lại: "Bạn còn 5 câu hỏi"
- Khi hết lượt → hiện CTA: "Đăng nhập để dùng không giới hạn"
- Quick replies: 3-4 câu hỏi mẫu

### Nghiệm thu:
- Widget hiển thị ở góc phải `/` và `/pricing`
- Click expand → mở chat box
- Sau 5 tin nhắn → hiện CTA đăng nhập

---

## Việc 3: Thêm Widget vào HeroPage

### File:
- `frontend/src/pages/public/HeroPage.jsx`

### Thay đổi:
- Import `DemoChatWidget`
- Thêm vào cuối component (trước `PublicFooter`)

### Nghiệm thu:
- Widget xuất hiện ở góc phải trang `/`
- Không ảnh hưởng layout hiện tại

---

## Việc 4: Thêm Widget vào PricingPage

### File:
- `frontend/src/pages/public/PricingPage.jsx`

### Thay đổi:
- Import `DemoChatWidget`
- Thêm vào cuối component (trước `PublicFooter`)

### Nghiệm thu:
- Widget xuất hiện ở góc phải trang `/pricing`

---

## Việc 5: Tạo trang Demo AI Chat (route `/demo`)

### File cần tạo:
- `frontend/src/pages/demo/DemoPage.jsx`
- `frontend/src/components/demo/DemoChatFull.jsx`

### Thiết kế:
- Full-page chat interface (không phải widget)
- **Giới hạn:** 10 tin nhắn
- Hiển thị rõ: "Đây là bản demo. Đăng nhập để dùng đầy đủ."
- Quick prompts có sẵn về tính năng, pricing, so sánh
- Header với logo + nút "Đăng nhập / Đăng ký"

### Route (App.jsx):
```jsx
<Route path="/demo" element={<DemoPage />} />
```
- Route public, không cần `ProtectedRoute`

### Nghiệm thu:
- Truy cập `/demo` → hiện full chat page
- Sau 10 tin nhắn → disable input + hiện CTA

---

## Việc 6: Migration cho Rate Limiting (nếu cần lưu permanent)

### File:
- `backend/migrations/122_ai_demo_rate_limits.sql`

### Bảng:
```sql
CREATE TABLE ai_demo_rate_limits (
  id SERIAL PRIMARY KEY,
  ip_address INET NOT NULL,
  request_count INT DEFAULT 0,
  first_request_at TIMESTAMPTZ DEFAULT NOW(),
  date DATE DEFAULT CURRENT_DATE,
  UNIQUE(ip_address, date)
);
```

### Nghiệm thu:
- Migration chạy thành công
- Bảng `ai_demo_rate_limits` tồn tại

---

## Nghiệm Thu Tổng Hợp

| Tình huống | Kỳ vọng |
|------------|----------|
| User vào `/` lần đầu | Widget chat nhỏ góc phải |
| User hỏi 3 câu | Trả lời bình thường, hiện "còn 2 câu" |
| User hỏi câu thứ 6 | Hiện CTA đăng nhập |
| User truy cập `/demo` | Full chat page với 10 tin nhắn giới hạn |
| User click "Đăng nhập" từ widget | Redirect về `/login?redirect=/app` |

---

## Bẫy Cần Tránh

1. **Không dùng localStorage cho rate limit**: User clear cookies/storage → bypass. Nên dùng IP hoặc Redis.

2. **Không gọi Gemini trực tiếp từ frontend**: Phải qua backend để protect API key.

3. **Không để demo chat vào `/app`**: Sẽ conflict với protected route và confuse user.

4. **System prompt phải nghiêm ngặt**: Demo chỉ trả lời về sản phẩm UKNOW, không tạo campaign thật.

---

## Phạm Vi PR

### PR #1 (Đầu tiên - chạy được đầu-cuối):
- Backend: Việc 1 (API endpoint cơ bản)
- Frontend: Việc 2 + 3 (Widget + HeroPage)
- Không cần migration, dùng in-memory rate limit trước

### PR #2:
- Việc 4 (Pricing page)
- Việc 5 (Demo page `/demo`)

### PR #3:
- Việc 6 (Migration + persistent rate limit)

---

## So Sánh Với Yêu Cầu Gốc Của Sếp

| Tiêu chí | Sếp đề xuất (IP-based) | Plan này |
|----------|-------------------------|----------|
| Bảo mật | Yếu (VPN/incognito bypass) | Khá hơn (vẫn imperfect nhưng UX tốt hơn) |
| Chi phí | Tốn nhiều (user hỏi thoải mái) | Tiết kiệm (giới hạn rõ ràng) |
| Lead capture | Không | Có (CTA đăng nhập rõ ràng) |
| UX | Confusing (2 loại AI chat ở `/app`) | Rõ ràng (widget nhẹ + trang demo riêng) |
| Đo lường | Khó | Dễ (count requests/IP) |

---

*Plan được viết ngày 2026-08-13*
