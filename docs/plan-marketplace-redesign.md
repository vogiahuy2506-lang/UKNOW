# Plan: Triển khai lại Marketplace — 2 Tabs (đơn giản)

## Bối cảnh
- Yêu cầu mới: chỉ 2 tabs — **Khám phá** và **Bài đăng của tôi**
- Không phân loại theo category (automation/marketing/support)
- Logic mua: tự động add campaign vào quản lý chiến dịch, kiểm tra giới hạn user

---

## Việc 1 — Frontend: Sửa MarketplaceContent.jsx — giảm tabs, bỏ category

**File**: `frontend/src/pages/marketplace/MarketplaceContent.jsx`

**Làm gì**: 
1. Sửa `TABS` array từ 4 tabs xuống 2 tabs (dòng 32-37)
2. Xóa `CATEGORIES` array và category filter chips (dòng 40-43 và 351-371)
3. Trong `fetchListings()`, bỏ case `purchases` và `favorites`, chỉ giữ `browse` và `my`

```javascript
// TABS mới
const TABS = [
  { id: 'browse', label: t('browse.tabBrowse') },       // Khám phá
  { id: 'my', label: t('browse.tabMine') },             // Bài đăng của tôi
];

// fetchListings switch mới
switch (tab) {
  case 'my':
    response = await marketplaceService.getMyListings(params);
    break;
  default:
    response = await marketplaceService.browse(params);
}
```

**Lý do**: API backend đã hỗ trợ `getMyListings`. Không cần category filter.

---

## Việc 2 — Backend: Thêm kiểm tra giới hạn campaign khi mua

**File**: `backend/src/services/marketplace/marketplacePurchase.service.js`

**Làm gì**: Trong method `purchase()`, sau khi verify listing & buyer, thêm check giới hạn **trước khi** clone resource:

```javascript
// Sau dòng 39 (check buyer != seller)
// 5. Check campaign limit trước khi clone
const limitCheck = await checkUserResourceLimit({
  userId: buyerId,
  resourceKey: 'campaigns',
});
if (!limitCheck.allowed) {
  const error = new Error(limitCheck.message);
  error.status = 400;
  error.code = 'CAMPAIGN_LIMIT_EXCEEDED';
  throw error;
}
```

**Import** cần thêm (ở đầu file):
```javascript
import { checkUserResourceLimit } from '../../utils/userResourceLimit.util.js';
```

**Lý do**: `checkUserResourceLimit` tồn tại tại `backend/src/utils/userResourceLimit.util.js:200-249`. Check phải đặt TRƯỚC clone để không tạo campaign khi user đã đạt giới hạn.

---

## Việc 3 — Frontend: Xử lý lỗi vượt giới hạn khi mua

**File**: `frontend/src/pages/marketplace/ListingDetail.jsx`

**Làm gì**: Trong `handlePurchase`, bắt lỗi `CAMPAIGN_LIMIT_EXCEEDED`:

```javascript
} catch (error) {
  if (error.code === 'CAMPAIGN_LIMIT_EXCEEDED' || error.response?.data?.code === 'CAMPAIGN_LIMIT_EXCEEDED') {
    toast.error(t('detail.campaignLimitExceeded'));
  } else {
    toast.error(error.response?.data?.message || t('detail.purchaseError'));
  }
}
```

**Thêm i18n key** trong `frontend/src/i18n/vi.js` và `en.js`:
```javascript
detail: {
  ...
  campaignLimitExceeded: 'Bạn đã đạt giới hạn số chiến dịch. Vui lòng nâng cấp gói để tiếp tục.',
}
```

---

## Việc 4 — Backend: Đảm bảo API mua trả về `limitReached` flag

**File**: `backend/src/controllers/marketplace.controller.js`

**Làm gì**: Sửa error handling trong `purchase()` controller:

```javascript
} catch (error) {
  if (error.code === 'CAMPAIGN_LIMIT_EXCEEDED') {
    return res.status(400).json({
      success: false,
      code: 'CAMPAIGN_LIMIT_EXCEEDED',
      message: error.message,
      limitReached: true,
    });
  }
  next(error);
}
```

---

## Nghiệm thu

| Tình huống | Kỳ vọng |
|------------|----------|
| User vào Marketplace | Thấy 2 tabs: Khám phá, Bài đăng của tôi |
| Tab Khám phá | Hiển thị tất cả listing, không có category filter |
| Click "Đăng bài" | Mở form tạo listing |
| Tab Bài đăng của tôi | Hiển thị listing của user |
| User mua listing khi còn quota | Campaign được clone, hiển thị trong quản lý chiến dịch |
| User mua listing khi đã đạt giới hạn campaign | Toast: "Bạn đã đạt giới hạn số chiến dịch..." |
| User đánh giá listing chưa mua | Backend đã check `hasPurchased` — không cho phép |

---

## Bẫy cần tránh

1. **Đừng xóa API endpoints** — `/purchases`, `/favorites` vẫn cần cho mobile app
2. **Check limit phải đặt TRƯỚC clone** — nếu đặt sau, campaign đã được tạo ra dù user không có quota
3. **GIẢ ĐỊNH — Cursor kiểm giúp**: `campaigns` resource key trong `userResourceLimit.util.js` đã đúng, không cần thêm config mới
