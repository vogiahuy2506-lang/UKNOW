# Marketplace Feature

Tính năng Marketplace cho phép người dùng chia sẻ, mua/bán chiến dịch (campaign) và chatbot với hệ thống Credit.

## Database

### Migration 108 - Tables

```sql
-- 1. marketplace_listings - Listing chính
-- 2. marketplace_purchases - Lịch sử mua
-- 3. marketplace_reviews - Đánh giá
-- 4. marketplace_favorites - Yêu thích
```

## API Endpoints

### Browse (Public)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/marketplace/browse` | Browse listings (filter, search, sort, paginate) |
| GET | `/api/marketplace/featured` | Featured listings |
| GET | `/api/marketplace/categories` | Category list |

### Listings Management
| Method | Endpoint | Permission | Description |
|--------|----------|-----------|-------------|
| GET | `/api/marketplace/listings` | campaigns_view | My listings |
| POST | `/api/marketplace/listings` | campaigns_create | Create listing |
| GET | `/api/marketplace/listings/:id` | - | Get listing detail |
| PUT | `/api/marketplace/listings/:id` | campaigns_create | Update listing |
| DELETE | `/api/marketplace/listings/:id` | campaigns_create | Delete listing |
| POST | `/api/marketplace/listings/:id/publish` | campaigns_create | Publish |
| POST | `/api/marketplace/listings/:id/pause` | campaigns_create | Pause |

### Purchase
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/marketplace/purchase/:id` | Purchase listing (with credits deduction) |
| GET | `/api/marketplace/purchases` | My purchases |

### Reviews
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/marketplace/listings/:id/reviews` | Create review |
| GET | `/api/marketplace/listings/:id/reviews` | Get reviews |
| GET | `/api/marketplace/listings/:id/my-review` | My review |

### Favorites
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/marketplace/favorites` | My favorites |
| GET | `/api/marketplace/favorites/:id/check` | Check favorited |
| POST | `/api/marketplace/favorites/:id` | Add favorite |
| DELETE | `/api/marketplace/favorites/:id` | Remove favorite |

## Credit System

### Purchase Flow
1. Verify listing published
2. Check buyer hasn't purchased
3. Check buyer != seller
4. Deduct credits from buyer (if price > 0)
5. Add credits to seller (90% after 10% platform fee)
6. Clone resource to buyer's workspace
7. Create purchase record
8. Update listing stats

### deductCredits()
```javascript
// In usageTracking.service.js
await usageTrackingService.deductCredits(userId, amount, metadata, client);

// Result: INSERT INTO usage_logs with delta = -amount
```

## Frontend Pages

- `/app/marketplace` - Browse Marketplace
- `/app/marketplace/:id` - Listing Detail
- `/app/marketplace/my` - My Listings
- `/app/marketplace/my-purchases` - Purchased Templates
- `/app/marketplace/create` - Create Listing

## Security

- Rate limiting: 5 purchases/minute per user
- Input validation & sanitization
- Authorization via permissions
- SQL injection protection (parameterized queries)

## Test

```bash
npm test -- marketplace.test.js
```
