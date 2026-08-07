# Plan: Thiết kế lại Landing Pages (HeroPage, ContactPage, PricingPage)

## Bối cảnh

Yêu cầu: thiết kế lại 3 trang landing dựa trên:
- [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) (43k stars) — CRO, copywriting, growth
- [pbakaus/impeccable](https://github.com/pbakaus/impeccable) (55k stars) — tránh AI-slop design

### Vấn đề hiện tại (kiểm chứng từ code)

| File | Vấn đề |
|------|---------|
| `HeroPage.jsx:113-127` | Stats hardcoded: `1,500+`, `5M+`, `500+` — không có bằng chứng |
| `TestimonialSlider.jsx:4-29` | Testimonials hardcoded với content nghe như fake: "tăng 300% hiệu quả", "tiết kiệm 20 giờ mỗi tuần" |
| `HeroPage.jsx:134` | Background gradient + backdrop-blur — pattern của AI-slop theo Impeccable |
| `HeroPage.jsx:215` | Card trong card (`rounded-[3rem]` + gradient) — vi phạm Impeccable anti-pattern |

---

## Việc 1: Cài đặt Impeccable skill vào Cursor

**File:** `.cursor/skills/impeccable/` (tạo mới)

**Lý do:** Impeccable cung cấp 23 commands (`/impeccable audit`, `/impeccable critique`, `/impeccable polish`) và 59 deterministic detector rules để tránh AI-slop patterns.

**Cách làm:**
1. Chạy `npx impeccable install --providers=cursor --scope=project`
2. Hoặc clone repo và copy `.cursor/` folder

**File cần tạo:**
```
.cursor/skills/impeccable/SKILL.md
.cursor/hooks.json
```

---

## Việc 2: Cài đặt Marketingskills (CRO skill)

**File:** `.agents/skills/marketingskills/skills/` (tạo mới)

**Lý do:** Marketingskills cung cấp `cro` (conversion rate optimization) và `copywriting` skills để viết copy landing page hiệu quả hơn.

**Cách làm:**
1. Clone `https://github.com/coreyhaines31/marketingskills`
2. Copy `skills/` vào `.agents/skills/marketingskills/skills/`
3. Giữ lại skills cần thiết: `cro`, `copywriting`, `signup`, `onboarding`

---

## Việc 3: Viết lại HeroPage theo Impeccable principles

**File:** `frontend/src/pages/public/HeroPage.jsx`

### Thay đổi cụ thể (theo Impeccable anti-patterns):

| Hiện tại | Thành | Lý do |
|-----------|-------|-------|
| `from-orange-500 to-red-500` gradient icons | Màu đặc hoặc tint nhẹ | Impeccable: không gradient trên icons nhỏ |
| `bg-white/80 backdrop-blur-sm rounded-[2rem]` cards | Nền đặc, border-subtle, radius nhỏ hơn | Impeccable: không cards nested trong cards |
| Stats section hardcoded numbers | Ẩn stats hoặc lấy từ API thực | Không có bằng chứng |
| Video background với overlay | Ảnh tĩnh hoặc gradient đơn giản | Performance + Impeccable preference |

### Giữ lại (theo Marketingskills CRO):
- Headline structure (benefit-first)
- CTA placement (sau features)
- Social proof section (nhưng cần real testimonials)

---

## Việc 4: Viết lại TestimonialSlider

**File:** `frontend/src/pages/public/components/TestimonialSlider.jsx`

### Vấn đề:
- Testimonials hiện tại nghe như fake copy
- Không có ảnh thật, không có company verification

### Giải pháp:
1. **Thêm props `testimonials` truyền từ parent** — để admin quản lý real testimonials
2. **Thêm verified badge** cho testimonials đã xác minh
3. **Fallback UI** khi không có testimonials (không hardcode)

**GIẢ ĐỊNH — Cursor kiểm giúp:** Testimonials nên load từ API `/api/testimonials` hay hardcoded trong CMS? (Hiện tại hardcoded)

---

## Việc 5: Viết lại ContactPage — tối ưu form theo CRO

**File:** `frontend/src/pages/public/ContactPage.jsx`

### Áp dụng Marketingskills CRO:
- Form chỉ yêu cầu fields cần thiết (name, email, message) — bỏ optional fields
- Thêm micro-copy hướng dẫn từng field
- Progress indicator cho form
- Success state rõ ràng

### Áp dụng Impeccable:
- Loại bỏ gradient backgrounds
- Typography hierarchy rõ ràng
- Touch targets đủ lớn (44px min)

---

## Việc 6: PricingPage — giữ nhưng polish

**File:** `frontend/src/pages/public/PricingPage.jsx`

Pricing page hiện tại là wrapper cho `PricingSection` — **không cần rewrite lớn**.

### Chỉ cần polish:
- Loại bỏ visual noise (nếu có)
- Đảm bảo typography hierarchy theo Impeccable
- Review lại pricing copy (Marketingskills `pricing` skill)

---

## Việc 7: Tạo DESIGN.md cho project

**File:** `DESIGN.md` (root)

**Lý do:** Impeccable init tạo design context để các commands sau hiểu brand.

**Nội dung cơ bản:**
```markdown
# UKNOW Landing Pages Design Spec

## Surface
Brand (marketing, landing page)

## Audience
Vietnamese SMB owners, marketers

## Brand/Product Lane
SaaS marketing automation (email + Zalo)

## Anti-References (Impeccable)
- Inter font → dùng system fonts hoặc specify font
- Purple-to-blue gradients → dùng orange/brand colors
- Cards nested in cards → flatten hierarchy
- Bounce/elastic easing → smooth easing only
```

---

## Nghiệm thu

| Tình huống | Kỳ vọng |
|------------|----------|
| Mở HeroPage | Không có gradient icon, không video background, stats ẩn hoặc từ API |
| Mở ContactPage | Form clean, 3 fields chính, micro-copy rõ |
| Mở PricingPage | Typography hierarchy rõ, không visual noise |
| Chạy `npx impeccable detect` | Không có critical violations |
| Testimonials | Load từ props/API, có fallback |

---

## Bẫy cần tránh

1. **Không thêm Inter font** — dùng font stack hiện tại hoặc specify Google Font cụ thể
2. **Không hardcode testimonials fake** — nếu chưa có real data, dùng placeholder với note "Thay bằng testimonials thật"
3. **Không thêm animations phức tạp** — Impeccable: motion có mục đích, không decorative
4. **Stats phải có nguồn** — nếu không có analytics thật, ẩn section thay vì hardcode số ảo
