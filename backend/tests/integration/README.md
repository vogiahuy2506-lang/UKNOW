# Backend Integration Tests

Suite test này gọi HTTP thật qua `supertest` lên Express app, chạm DB Postgres thật. Phục vụ kiểm tra các endpoint quan trọng (auth, campaigns, payment) end-to-end ở tầng backend.

## Cấu trúc

```
tests/integration/
├── setup.js                # globalSetup: reset schema + chạy bootstrap.sql
├── teardown.js             # globalTeardown: đóng pg pool
├── helpers/
│   └── db.js               # truncateAll(), createUser(), createVerificationCode()
├── sql/
│   └── bootstrap.sql       # Schema tối thiểu cho test DB
└── *.test.js               # Test suites (gắn .test.js để khác .spec.js của unit)
```

## Chạy local

Integration test **không bao giờ** chạm DB production. `globalSetup` sẽ refuse nếu `DB_NAME` không chứa hậu tố `_test`.

### Cách 1: Docker (khuyến nghị)

```bash
# 1. Spin up Postgres 16 ở port 5432 (xóa container cũ nếu có)
docker rm -f uknow-pg-test 2>/dev/null
docker run -d --name uknow-pg-test \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=uknow_campaign_test \
  -p 5433:5432 \
  postgres:16-alpine

# 2. Chờ vài giây cho Postgres khởi động, rồi chạy test
cd backend
DB_HOST=localhost DB_PORT=5433 DB_NAME=uknow_campaign_test \
  DB_USER=postgres DB_PASSWORD=postgres \
  npm run test:integration
```

Port 5433 để tránh đụng Postgres khác đang chạy local.

### Cách 2: Postgres local có sẵn

```bash
# Tạo DB test (chỉ làm 1 lần)
createdb uknow_campaign_test

cd backend
DB_HOST=localhost DB_PORT=5432 DB_NAME=uknow_campaign_test \
  DB_USER=postgres DB_PASSWORD=yourpassword \
  npm run test:integration
```

## Viết test mới

```javascript
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { truncateAll, createUser } from './helpers/db.js';

let app;
beforeAll(() => { app = createApp(); });
beforeEach(async () => { await truncateAll(); }); // mỗi test bắt đầu sạch

describe('POST /api/your-endpoint', () => {
  it('do something', async () => {
    const user = await createUser({ username: 'foo' });
    const res = await request(app).post('/api/...').send({ ... });
    expect(res.status).toBe(200);
  });
});
```

## Mở rộng schema & Quy trình đồng bộ 2 chiều (PR-3)

`bootstrap.sql` được bảo vệ bằng **chốt chặn 2 chiều** (`tests/integration/schemaInventory.test.js`) đối chiếu với ảnh chụp production (`tests/integration/fixtures/productionSchemaInventory.json`).

Khi có migration mới làm thay đổi schema:

1. **Cập nhật `sql/bootstrap.sql`**: Thêm/sửa/xoá bảng hoặc cột tương ứng theo đúng migration.
2. **Cập nhật `fixtures/productionSchemaInventory.json`**: Thêm/xoá tên cột trong fixture và ghi rõ lý do trong commit message (không dùng cơ chế auto-update snapshot).
3. **Kiểm tra cột thêm bằng ALTER TABLE**: Chạy `npm run check:bootstrap-columns` để đảm bảo không bỏ sót cột do migration thêm.
4. **Cập nhật `helpers/db.js`**: Nếu thêm bảng mới, bổ sung vào danh sách `TRUNCATE` trong `truncateAll()`.
5. **Đối chiếu lại với production thật (khi cần)**:
   Chạy trên VPS:
   ```bash
   docker exec uknow-postgres psql -U postgres -d uknow-campaign -t -A -F'|' \
     -c "SELECT table_name, md5(string_agg(column_name, ',' ORDER BY column_name)) \
         FROM information_schema.columns WHERE table_schema='public' \
         GROUP BY table_name ORDER BY table_name;"
   ```
   So sánh output với cùng truy vấn chạy trên `uknow_campaign_test`. Lệch bảng nào thì đào sâu bảng đó.

