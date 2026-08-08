# ĐỀ XUẤT TÍNH NĂNG: MARKETPLACE CHO CHIẾN DỊCH & CHATBOT

**Phiên bản:** 1.0  
**Ngày:** 04/08/2026  
**Người đề xuất:** Nguyễn Hoàng Phúc
**Trạng thái:** Đề xuất ban đầu

---

## 1. TỔNG QUAN

### 1.1 Mô tả tính năng

Xây dựng một **Marketplace** cho phép người dùng:
- **Chia sẻ miễn phí** chiến dịch và chatbot với cộng đồng
- **Chia sẻ riêng tư** với thành viên trong team
- **Mua/bán** chiến dịch và chatbot bằng hệ thống **Credit** hiện có
- **Đánh giá 5 sao** để cộng đồng có thể lựa chọn chất lượng

### 1.2 Mục tiêu kinh doanh

| Mục tiêu | Chỉ số |
|----------|--------|
| Tăng engagement người dùng | +30% DAU trong 3 tháng |
| Tạo nguồn thu mới | Revenue từ giao dịch Marketplace |
| Giảm barrier cho user mới | Copy template có sẵn thay vì tạo từ đầu |
| Xây dựng cộng đồng | User có thể đóng góp và kiếm thưởng |

---

## 2. PHÂN TÍCH HIỆN TRẠNG

### 2.1 Hệ thống hiện tại

**Điểm mạnh có thể tận dụng:**
- ✅ Hệ thống **Credit** đã có sẵn (`ai_credits_per_period`, `usage_logs`)
- ✅ Cấu trúc **Campaign** với `flow_json` cho phép serialize
- ✅ Cấu trúc **Chatbot** với settings và knowledge base
- ✅ Hệ thống **User/Team** với `user_members` permissions
- ✅ Repository pattern đã có sẵn

**Cần xây mới:**
- ❌ Không có bảng lưu trữ Marketplace listings
- ❌ Không có hệ thống đánh giá/rating
- ❌ Không có cơ chế giao dịch mua/bán
- ❌ Chưa có trang Marketplace UI

### 2.2 User Cases

```
┌─────────────────────────────────────────────────────────────┐
│                    MARKETPLACE FLOW                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  NGƯỜI BÁN                                                 │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │ Tạo LP   │───▶│ Định giá │───▶│ Publish  │              │
│  │ (LP)     │    │ (Free/    │    │ lên      │              │
│  │          │    │  Credit) │    │ Market   │              │
│  └──────────┘    └──────────┘    └──────────┘              │
│                                          │                  │
│                                          ▼                  │
│  ┌──────────────────────────────────────────────────┐       │
│  │              MARKETPLACE LISTINGS                 │       │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐          │       │
│  │  │Campaign │  │Chatbot  │  │ Template│  ...     │       │
│  │  │   #1    │  │   #2    │  │   #3    │          │       │
│  │  │ ⭐4.5   │  │ ⭐4.8   │  │ ⭐3.9   │          │       │
│  │  │ 50cr    │  │ 100cr   │  │ FREE    │          │       │
│  │  └─────────┘  └─────────┘  └─────────┘          │       │
│  └──────────────────────────────────────────────────┘       │
│                                          ▲                  │
│                                          │                  │
│  NGƯỜI MUA                                                 │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │ Browse    │───▶│ Preview  │───▶│ Purchase │              │
│  │ & Filter  │    │ & Rate   │    │ (Charge  │              │
│  │           │    │          │    │  Credit) │              │
│  └──────────┘    └──────────┘    └──────────┘              │
│                                          │                  │
│                                          ▼                  │
│                                    ┌──────────┐              │
│                                    │ Clone to │              │
│                                    │ my       │              │
│                                    │ workspace│              │
│                                    └──────────┘              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. THIẾT KẾ CHI TIẾT

### 3.1 Database Schema

#### Bảng `marketplace_listings` (Mới)

```sql
CREATE TABLE marketplace_listings (
    id BIGSERIAL PRIMARY KEY,
    id_user BIGINT NOT NULL REFERENCES users(id),
    
    -- Loại listing
    resource_type VARCHAR(20) NOT NULL, -- 'campaign', 'chatbot'
    resource_id BIGINT NOT NULL,         -- ID của campaign hoặc chatbot gốc
    
    -- Thông tin listing
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50),                 -- 'marketing', 'automation', 'support', etc.
    tags TEXT[],                         -- ['email', 'zalo', 'welcome', 'followup']
    
    -- Giá cả
    price_credits INTEGER DEFAULT 0,     -- 0 = miễn phí
    is_free BOOLEAN DEFAULT FALSE,
    
    -- Trạng thái & quản lý
    status VARCHAR(20) DEFAULT 'draft',   -- 'draft', 'published', 'paused', 'rejected'
    visibility VARCHAR(20) DEFAULT 'public', -- 'public', 'team', 'private'
    
    -- Thống kê
    view_count INTEGER DEFAULT 0,
    purchase_count INTEGER DEFAULT 0,
    rating_avg DECIMAL(3,2) DEFAULT 0,
    rating_count INTEGER DEFAULT 0,
    
    -- Snapshot data (lưu bản sao để không phụ thuộc vào resource gốc)
    snapshot_data JSONB NOT NULL,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    published_at TIMESTAMP,
    
    CONSTRAINT valid_resource CHECK (resource_type IN ('campaign', 'chatbot'))
);

-- Indexes
CREATE INDEX idx_listings_status ON marketplace_listings(status);
CREATE INDEX idx_listings_type ON marketplace_listings(resource_type);
CREATE INDEX idx_listings_category ON marketplace_listings(category);
CREATE INDEX idx_listings_price ON marketplace_listings(price_credits);
CREATE INDEX idx_listings_rating ON marketplace_listings(rating_avg DESC);
```

#### Bảng `marketplace_purchases` (Mới)

```sql
CREATE TABLE marketplace_purchases (
    id BIGSERIAL PRIMARY KEY,
    id_user BIGINT NOT NULL REFERENCES users(id),
    listing_id BIGINT NOT NULL REFERENCES marketplace_listings(id),
    seller_id BIGINT NOT NULL REFERENCES users(id),
    
    -- Giao dịch
    credits_spent INTEGER NOT NULL,
    transaction_type VARCHAR(20) NOT NULL, -- 'purchase', 'refund'
    
    -- Resource được tạo sau khi mua
    cloned_resource_id BIGINT,             -- ID của campaign/chatbot được clone
    cloned_resource_type VARCHAR(20),
    
    -- Timestamps
    purchased_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(id_user, listing_id)            -- Mỗi user chỉ mua 1 lần mỗi listing
);
```

#### Bảng `marketplace_reviews` (Mới)

```sql
CREATE TABLE marketplace_reviews (
    id BIGSERIAL PRIMARY KEY,
    id_user BIGINT NOT NULL REFERENCES users(id),
    listing_id BIGINT NOT NULL REFERENCES marketplace_listings(id),
    
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(id_user, listing_id)
);
```

#### Bảng `marketplace_favorites` (Mới)

```sql
CREATE TABLE marketplace_favorites (
    id_user BIGINT NOT NULL REFERENCES users(id),
    listing_id BIGINT NOT NULL REFERENCES marketplace_listings(id),
    
    created_at TIMESTAMP DEFAULT NOW(),
    
    PRIMARY KEY (id_user, listing_id)
);
```

### 3.2 API Endpoints

```
┌─────────────────────────────────────────────────────────────────┐
│                    MARKETPLACE API STRUCTURE                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  # LISTINGS MANAGEMENT (cho người bán)                         │
│  POST   /api/marketplace/listings           - Tạo listing      │
│  GET    /api/marketplace/listings            - List của tôi    │
│  GET    /api/marketplace/listings/:id         - Chi tiết        │
│  PUT    /api/marketplace/listings/:id         - Cập nhật        │
│  DELETE /api/marketplace/listings/:id         - Xóa listing     │
│  POST   /api/marketplace/listings/:id/publish - Publish         │
│  POST   /api/marketplace/listings/:id/pause   - Tạm dừng       │
│                                                                  │
│  # MARKETPLACE BROWSE (cho người mua)                          │
│  GET    /api/marketplace/browse            - Browse all        │
│  GET    /api/marketplace/browse/campaigns   - Filter campaigns  │
│  GET    /api/marketplace/browse/chatbots    - Filter chatbots   │
│  GET    /api/marketplace/search              - Search           │
│  GET    /api/marketplace/featured            - Featured items  │
│  GET    /api/marketplace/categories          - Danh mục         │
│                                                                  │
│  # PURCHASE FLOW                                                │
│  POST   /api/marketplace/listings/:id/preview  - Preview before  │
│  POST   /api/marketplace/listings/:id/purchase - Mua (trừ cred) │
│  GET    /api/marketplace/purchases           - Purchases của tôi│
│  POST   /api/marketplace/listings/:id/refund  - Yêu cầu hoàn tiền│
│                                                                  │
│  # REVIEWS                                                      │
│  POST   /api/marketplace/listings/:id/reviews  - Đánh giá       │
│  GET    /api/marketplace/listings/:id/reviews  - Xem đánh giá   │
│  PUT    /api/marketplace/reviews/:id             - Sửa đánh giá  │
│                                                                  │
│  # FAVORITES                                                    │
│  POST   /api/marketplace/listings/:id/favorite  - Thêm yêu thích │
│  DELETE /api/marketplace/listings/:id/favorite  - Bỏ yêu thích  │
│  GET    /api/marketplace/favorites              - DS yêu thích   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 Purchase Flow Logic

```javascript
// POST /api/marketplace/listings/:id/purchase
async function purchaseListing(req, res) {
    const { id: listingId } = req.params;
    const buyerId = req.user.id;
    
    // 1. Get listing
    const listing = await getListing(listingId);
    if (!listing || listing.status !== 'published') {
        throw new Error('Listing không tồn tại hoặc chưa publish');
    }
    
    // 2. Check đã mua chưa
    const existingPurchase = await getPurchase(buyerId, listingId);
    if (existingPurchase) {
        throw new Error('Bạn đã mua listing này rồi');
    }
    
    // 3. Check không phải chính mình
    if (listing.id_user === buyerId) {
        throw new Error('Bạn không thể mua listing của chính mình');
    }
    
    // 4. Nếu có phí, kiểm tra và trừ credit
    if (!listing.is_free && listing.price_credits > 0) {
        const hasEnough = await checkUserCredits(buyerId, listing.price_credits);
        if (!hasEnough) {
            throw new Error('Không đủ credit để mua');
        }
        
        // Trừ credit của người mua
        await deductUserCredits(buyerId, listing.price_credits, {
            reason: `Purchase marketplace listing: ${listing.title}`,
            listing_id: listingId,
            type: 'marketplace_purchase'
        });
        
        // Cộng credit cho người bán (hoặc có thể giữ lại làm phí platform)
        const sellerFee = Math.floor(listing.price_credits * 0.9); // 90% cho seller
        await addUserCredits(listing.id_user, sellerFee, {
            reason: `Sale: ${listing.title}`,
            listing_id: listingId,
            type: 'marketplace_sale'
        });
    }
    
    // 5. Clone resource cho người mua
    const clonedResource = await cloneResource(
        listing.resource_type,
        listing.resource_id,
        buyerId
    );
    
    // 6. Tạo purchase record
    await createPurchase({
        id_user: buyerId,
        listing_id: listingId,
        seller_id: listing.id_user,
        credits_spent: listing.price_credits,
        transaction_type: 'purchase',
        cloned_resource_id: clonedResource.id,
        cloned_resource_type: listing.resource_type
    });
    
    // 7. Update listing stats
    await incrementListingStats(listingId, 'purchase_count');
    
    return {
        success: true,
        data: {
            clonedResource,
            credits_spent: listing.price_credits,
            message: listing.is_free 
                ? 'Đã clone thành công!' 
                : `Đã mua thành công! Đã trừ ${listing.price_credits} credits.`
        }
    };
}
```

### 3.4 Clone Resource Logic

```javascript
async function cloneCampaign(sourceId, targetUserId) {
    // 1. Get source campaign
    const source = await getCampaign(sourceId);
    
    // 2. Create new campaign cho user mới
    const newCampaign = await createCampaign({
        id_user: targetUserId,
        campaign_name: `${source.campaign_name} (Copy)`,
        description: source.description,
        campaign_type: source.campaign_type,
        status: 'draft', // Luôn tạo ở draft
        flow_json: source.flow_json,
        // ... các fields khác
    });
    
    // 3. Clone nodes
    const nodes = await getCampaignNodes(sourceId);
    for (const node of nodes) {
        await createCampaignNode({
            id_campaign: newCampaign.id,
            ...node
        });
    }
    
    // 4. Clone connections
    const connections = await getCampaignConnections(sourceId);
    for (const conn of connections) {
        await createCampaignConnection({
            id_campaign: newCampaign.id,
            ...conn
        });
    }
    
    return newCampaign;
}

async function cloneChatbot(sourceId, targetUserId) {
    // Tương tự với chatbot
    const source = await getChatbot(sourceId);
    
    const newChatbot = await createChatbot({
        id_user: targetUserId,
        name: `${source.name} (Copy)`,
        description: source.description,
        system_instruction: source.system_instruction,
        greeting_msg: source.greeting_msg,
        theme_color: source.theme_color,
        // ... các fields khác
    });
    
    // Clone knowledge base chunks
    const chunks = await getChatbotChunks(sourceId);
    for (const chunk of chunks) {
        await createChatbotChunk({
            id_chatbot: newChatbot.id,
            ...chunk
        });
    }
    
    return newChatbot;
}
```

---

## 4. FRONTEND UI DESIGN

### 4.1 Marketplace Page Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  🏪 MARKETPLACE                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  [Search...                              ] [🔍] [Categories ▼] [Sort ▼]  │
│                                                                          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐        │
│  │   📧        │ │   💬        │ │   📧        │ │   💬        │        │
│  │  Campaign   │ │  Chatbot    │ │  Campaign   │ │  Chatbot    │        │
│  │             │ │             │ │             │ │             │        │
│  │ Welcome     │ │ Support Bot  │ │ Flash Sale  │ │ FAQ Bot     │        │
│  │ Email Seq   │ │             │ │             │ │             │        │
│  │             │ │             │ │             │ │             │        │
│  │ ⭐4.8 (124) │ │ ⭐4.5 (89)  │ │ ⭐4.2 (56)  │ │ ⭐4.9 (201) │        │
│  │             │ │             │ │             │ │             │        │
│  │ 🆓 FREE     │ │ 💎 50 cr    │ │ 💎 100 cr   │ │ 💎 75 cr    │        │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘        │
│                                                                          │
│  [📅 Recently Added] [⭐ Top Rated] [🔥 Hot] [💎 Premium]                │
│                                                                          │
│  ─── Featured This Week ───                                              │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  📧 "Complete Email Marketing Funnel"           by @marketing_pro  │  │
│  │  10-step email sequence for product launch      ⭐4.9 (342)       │  │
│  │  Tags: email, funnel, launch, automation          💎 150 credits   │  │
│  │  [Preview] [💎 Buy Now]                                               │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ─── Categories ───                                                     │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  📧 Marketing    💬 Customer Support    🤖 Automation             │  │
│  │  📅 Follow-up    🎉 Promotions          💰 Sales                   │  │
│  │  👋 Welcome      🔄 Re-engagement       📚 Education               │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Listing Detail Page

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ← Back to Marketplace                                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────┐  ┌─────────────────────────────┐  │
│  │                                  │  │  📧 Campaign               │  │
│  │     📊 Campaign Preview         │  │  Complete Email Funnel     │  │
│  │                                  │  │                             │  │
│  │  ┌─────┐    ┌─────┐              │  │  by @seller_pro             │  │
│  │  │Start│───▶│Email│──┐           │  │  📅 Published 2 weeks ago   │  │
│  │  └─────┘    └─────┘  │           │  │                             │  │
│  │                   ┌──▼──┐        │  │  ⭐⭐⭐⭐⭐ 4.8 (124 reviews)│  │
│  │                   │Wait │        │  │                             │  │
│  │                   └──┬──┘        │  │  Tags:                       │  │
│  │                 ┌────┴────┐     │  │  [email] [funnel] [launch]   │  │
│  │                 ▼         ▼     │  │                             │  │
│  │              ┌─────┐   ┌─────┐  │  │  ─────────────────────────  │  │
│  │              │Email│   │Email│  │  │                             │  │
│  │              └─────┘   └─────┘  │  │  💎 150 credits             │  │
│  │                                  │  │  or FREE with subscription  │  │
│  │  [Interactive Flow Preview]      │  │                             │  │
│  └──────────────────────────────────┘  │  [💎 Buy & Clone]           │  │
│                                       │  [👁 Preview Full Details]  │  │
│  ─── Reviews ───                      │                             │  │
│  ┌──────────────────────────────────┐  │  ─── Seller Info ───        │  │
│  │ ⭐⭐⭐⭐⭐ "Tuyệt vời!"        │  │  │  🧑 @seller_pro            │  │
│  │ by @user1 • 3 days ago          │  │  │  45 items sold             │  │
│  ├──────────────────────────────────┤  │  │  ⭐4.9 avg rating          │  │
│  │ ⭐⭐⭐⭐⭐ "Đã dùng và hiệu   │  │  │  [View Profile]            │  │
│  │ quả rất tốt"                    │  │  └─────────────────────────┘  │
│  │ by @user2 • 1 week ago          │  └─────────────────────────────┘  │
│  └──────────────────────────────────┘                                   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.3 My Listings Management

```
┌─────────────────────────────────────────────────────────────────────────┐
│  📦 My Marketplace Listings                                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  [+ Create New Listing]                                                 │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ FILTER: [All ▼] [Published] [Draft] [Paused]    SORT: [Newest ▼]   ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ 📧 Welcome Email Sequence                      🟢 Published       │  │
│  │ ID: #1234 | Created: 01/08/2026 | Views: 1,234                   │  │
│  │ Rating: ⭐4.8 (45) | Purchases: 12 | Earned: 1,800 credits         │  │
│  │                                                                     │  │
│  │ [📊 Stats] [✏️ Edit] [⏸ Pause] [🗑 Delete]                         │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ 💬 Support FAQ Bot                            🟡 Draft            │  │
│  │ ID: #1235 | Created: 02/08/2026 | Views: 0                        │  │
│  │ Rating: - | Purchases: 0 | Earned: 0 credits                      │  │
│  │                                                                     │  │
│  │ [📊 Stats] [✏️ Edit] [🚀 Publish] [🗑 Delete]                       │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ─── Earnings Summary ───                                               │
│  ┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐    │
│  │ This Month        │ │ Total Earnings    │ │ Pending Payouts   │    │
│  │ 💎 2,450          │ │ 💎 15,230         │ │ 💎 1,200          │    │
│  │ (+15% vs last)    │ │ (since joining)   │ │ (uncleared)       │    │
│  └───────────────────┘ └───────────────────┘ └───────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. KẾ HOẠCH TRIỂN KHAI

### Phase 1: Core Infrastructure (2 tuần)

| Task | Description | Effort |
|------|-------------|--------|
| T1.1 | Database migrations | 2h |
| T1.2 | Backend: Marketplace Listing CRUD | 1 day |
| T1.3 | Backend: Browse & Search APIs | 1 day |
| T1.4 | Backend: Purchase flow với credit | 1 day |
| T1.5 | Backend: Clone resource logic | 1 day |
| T1.6 | Backend: Review/Rating system | 0.5 day |
| T1.7 | Unit tests | 1 day |

### Phase 2: Frontend Core (2 tuần)

| Task | Description | Effort |
|------|-------------|--------|
| T2.1 | Marketplace browse page | 2 days |
| T2.2 | Listing detail page | 1 day |
| T2.3 | Create/Edit listing flow | 1 day |
| T2.4 | My Listings management page | 1 day |
| T2.5 | Purchase flow UI | 1 day |
| T2.6 | Review modal | 0.5 day |
| T2.7 | Responsive styling | 1 day |

### Phase 3: Advanced Features (2 tuần)

| Task | Description | Effort |
|------|-------------|--------|
| T3.1 | Categories & Tags system | 1 day |
| T3.2 | Search with filters | 1 day |
| T3.3 | Favorites functionality | 0.5 day |
| T3.4 | Seller dashboard & stats | 1 day |
| T3.5 | Admin moderation tools | 1.5 days |
| T3.6 | Notifications (new purchase, review) | 1 day |

### Phase 4: Polish & Launch (1 tuần)

| Task | Description | Effort |
|------|-------------|--------|
| T4.1 | Performance optimization | 1 day |
| T4.2 | Mobile responsive | 1 day |
| T4.3 | Onboarding tooltips | 0.5 day |
| T4.4 | Launch marketing | 0.5 day |
| T4.5 | Bug fixes & QA | 2 days |

### Tổng thời gian: **~7 tuần**

---

## 6. ƯỚC TÍNH NHÂN LỰC & COST

### 6.1 Development Cost

| Role | Hours | Rate | Total |
|------|-------|------|-------|
| Backend Developer | 80h | $30/h | $2,400 |
| Frontend Developer | 80h | $30/h | $2,400 |
| Designer (UI/UX) | 20h | $40/h | $800 |
| QA | 20h | $20/h | $400 |
| **Total** | **200h** | | **$6,000** |

### 6.2 Ongoing Maintenance

- Server cost: Minimal (tận dụng infra hiện tại)
- Estimated: ~$50-100/tháng

---

## 7. REVENUE MODEL

### 7.1 Nguồn thu dự kiến

| Nguồn | Mô tả | Ước tính |
|-------|-------|----------|
| Transaction fee | 10% trên mỗi giao dịch | $100-500/tháng |
| Featured listings | $10-50/item/ngày | $200-1000/tháng |
| Premium seller accounts | $19-49/tháng | $500-2000/tháng |

### 7.2 Credit Economy

```
Mô hình giá tham khảo:
├── Miễn phí (Free):     0 credits    - Template cơ bản
├── Rẻ:                  10-50 cr     - Template đơn giản
├── Trung bình:          50-150 cr    - Template phức tạp
├── Cao cấp:             150-300 cr   - Full solution
└── Premium:             300-500 cr   - Enterprise grade
```

---

## 8. RỦI RO & MITIGATION

| Rủi ro | Mức độ | Mitigation |
|--------|--------|------------|
| Low quality listings spam | Cao | Admin review trước publish, rating system |
| Credit farming/botting | Cao | Rate limiting, purchase limits per day |
| IP/Copyright issues | Trung bình | Terms of service, reporting system |
| User trust issues | Trung bình | Verified seller badges, escrow system |
| Competition from free alternatives | Thấp | Unique value proposition, community |

---

## 9. SUCCESS METRICS

| Metric | Target (3 tháng) |
|--------|------------------|
| Active listings | 500+ |
| Total purchases | 2,000+ |
| Active sellers | 100+ |
| GMV (Gross Merchandise Value) | 50,000+ credits |
| Platform revenue (10% fee) | 5,000+ credits |
| User satisfaction (NPS) | 40+ |

---

## 10. APPENDIX

### A. Wireframes (chi tiết hơn trong file riêng)

### B. Mock Data Examples

```json
// Sample Listing
{
  "id": 1,
  "resource_type": "campaign",
  "title": "Complete Email Marketing Funnel",
  "description": "10-step email sequence từ Awareness đến Purchase, bao gồm Welcome series, Nurture sequence, và Launch campaign.",
  "category": "marketing",
  "tags": ["email", "funnel", "automation", "lead-nurture"],
  "price_credits": 150,
  "is_free": false,
  "rating_avg": 4.8,
  "rating_count": 124,
  "purchase_count": 45,
  "view_count": 1234,
  "seller": {
    "id": 10,
    "username": "marketing_pro",
    "total_sales": 150,
    "avg_rating": 4.9
  },
  "preview": {
    "flow_steps": 10,
    "estimated_setup_time": "2-3 hours",
    "includes": ["Email templates", "Automation rules", "Landing page"]
  }
}
```

### C. Technical Dependencies

- React 18+
- Node.js 18+
- PostgreSQL 14+
- Existing credit system (aiCreditMeter)
- Existing auth middleware

---

## PHÊ DUYỆT

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Người đề xuất | | | |
| Tech Lead | | | |
| Product Manager | | | |
| CTO/CFO | | | |

---

*Tài liệu này là đề xuất ban đầu và có thể được điều chỉnh sau khi thảo luận.*
