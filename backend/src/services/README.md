## Services Layer

Services chứa business logic thuần nghiệp vụ, không thao tác trực tiếp với `req`/`res`.

Nguyên tắc:
- Controller chỉ điều phối request/response và gọi service.
- Service gọi repository để lấy/lưu dữ liệu.
- Service không phụ thuộc Express.

Gợi ý cấu trúc theo module:
- `services/campaign/*`
- `services/customer/*`
- `services/email/*`
- `services/uknow/*`

---

## Custom Domain - Cloudflare Integration

### Environment Variables

```bash
# Cloudflare API (for custom domain DNS/SSL management)
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token_here

# Landing Page CNAME Target (where custom domains point to)
LP_CNAME_TARGET=lp.yourdomain.com
```

### Setup Instructions

1. **Get Cloudflare API Token:**
   - Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
   - Go to **My Profile** → **API Tokens**
   - Click **Create Token** → **Create Custom Token**
   - Set permissions:
     - Zone Settings: Read
     - Zone: Read
     - DNS: Edit
     - SSL and Certificates: Edit
   - Create token and add to `.env`

2. **Add Domain to Cloudflare:**
   - In Cloudflare Dashboard, add your domain (e.g., `example.com`)
   - Update nameservers at your domain registrar

3. **For Each Custom Domain:**
   - User adds their subdomain (e.g., `landing.example.com`)
   - Click "Cloudflare" button to auto-configure DNS + SSL
   - Cloudflare Universal SSL will provision within 24 hours
