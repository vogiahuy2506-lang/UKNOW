# Multi-Domain SSL Setup Guide

## Overview

Server nhận request từ nhiều custom domains và tự động cấp SSL cho từng domain.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Client Browser                                             │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS (SSL tự động)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Nginx (port 80, 443)                                       │
│  ─────────────────────────────────────────────────────────  │
│  • Catch-all server block cho mọi domain                  │
│  • Redirect HTTP → HTTPS                                   │
│  • SSL via Let's Encrypt (certbot)                        │
└──────────────────────────┬──────────────────────────────────┘
                           │ Proxy pass
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Backend (Node.js)                                          │
│  ─────────────────────────────────────────────────────────  │
│  • Xử lý request, route đến landing page đúng            │
│  • Kiểm tra hostname từ request headers                  │
└─────────────────────────────────────────────────────────────┘
```

## Nginx Configuration

### 1. Main Nginx Config (`/etc/nginx/nginx.conf`)

```nginx
http {
    # ... existing config ...

    # SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;

    # Logging
    log_format custom_domain '$remote_addr - $host - $time_local - "$request" - $status';
}
```

### 2. Default Server Block (`/etc/nginx/sites-available/default`)

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    # Redirect all HTTP to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2 default_server;
    listen [::]:443 ssl http2 default_server;
    server_name _;

    # SSL certificates will be auto-provisioned by certbot
    ssl_certificate /etc/letsencrypt/live/_.pem;
    ssl_certificate_key /etc/letsencrypt/live/_.key;

    # If no SSL cert yet, use self-signed temporarily
    # Remove these lines after certbot runs
    # ssl_certificate /etc/ssl/certs/ssl-cert-snakeoil.pem;
    # ssl_certificate_key /etc/ssl/private/ssl-cert-snakeoil.key;

    access_log /var/log/nginx/custom_domain_access.log custom_domain;
    error_log /var/log/nginx/custom_domain_error.log;

    # SSL configuration
    include /etc/nginx/snippets/ssl-params.conf;

    # Pass to backend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

### 3. SSL Parameters (`/etc/nginx/snippets/ssl-params.conf`)

```nginx
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers on;
ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;
```

## Let's Encrypt / Certbot Setup

### 1. Install Certbot

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install certbot python3-certbot-nginx

# CentOS/RHEL
sudo yum install certbot python3-certbot-nginx
```

### 2. One-time setup - Initial certificate

```bash
# Get initial certificate for first domain
sudo certbot --nginx -d digibook.com.vn

# Or for wildcard (if DNS provider supports ACME DNS challenge)
sudo certbot --manual --preferred-challenges dns -d *.founderai.biz
```

### 3. Auto-renewal Setup

```bash
# Test renewal
sudo certbot renew --dry-run

# Enable auto-renewal (should be automatic after installation)
sudo systemctl status certbot.timer
```

### 4. For Multi-Domain (Automatic)

Certbot tự động detect domains từ Nginx config. Sau khi customer thêm domain:

```bash
# Run certbot to get certificate for new domain
sudo certbot --nginx -d digibook.com.vn -d abc.com

# Or use certonly mode if you want to handle nginx config manually
sudo certbot certonly --nginx -d digibook.com.vn
```

## Automated Certificate Provisioning (Recommended)

### Option A: Certbot Webroot (Recommended for dynamic domains)

```bash
# Create webroot for ACME challenge
sudo mkdir -p /var/www/.well-known/acme-challenge
sudo chown www-data:www-data /var/www/.well-known
```

### Option B: DNS Challenge (Best for wildcards)

Sử dụng Cloudflare API cho DNS challenge:

```bash
# Install Cloudflare DNS plugin
sudo certbot plugins --dimains Cloudflare
sudo apt install python3-certbot-dns-cloudflare

# Create API token at Cloudflare dashboard
# Settings > API Tokens > Create Token

# Configure credentials
sudo mkdir -p /etc/letsencrypt/.secrets
sudo tee /etc/letsencrypt/.secrets/cloudflare.ini << EOF
dns_cloudflare_api_token = YOUR_CLOUDFLARE_API_TOKEN
EOF
sudo chmod 600 /etc/letsencrypt/.secrets/cloudflare.ini

# Request wildcard certificate
sudo certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /etc/letsencrypt/.secrets/cloudflare.ini \
  -d *.founderai.biz
```

## Backend: Handle Custom Domains

Backend cần check Host header để route đúng landing page:

```javascript
// Express middleware example
app.use((req, res, next) => {
  const hostname = req.get('host');
  
  // Skip for main domains
  if (hostname === 'founderai.biz' || hostname === 'www.founderai.biz') {
    return next();
  }

  // Custom domain - lookup landing page
  const landingPage = await LandingPageDomainService.findByHostname(hostname);
  
  if (!landingPage) {
    return res.status(404).send('Landing page not found');
  }

  req.landingPage = landingPage;
  next();
});
```

## Deployment Checklist

- [ ] Install Nginx
- [ ] Configure catch-all server block
- [ ] Install Certbot
- [ ] Get initial SSL certificate
- [ ] Configure auto-renewal
- [ ] Test HTTPS for custom domains
- [ ] Monitor SSL expiry

## Troubleshooting

### Check SSL status
```bash
sudo certbot certificates
```

### Manual renewal
```bash
sudo certbot renew
```

### Check Nginx config
```bash
sudo nginx -t
```

### Reload Nginx
```bash
sudo systemctl reload nginx
```

### View SSL cert details
```bash
echo | openssl s_client -connect digibook.com.vn:443 2>/dev/null | openssl x509 -noout -dates -issuer
```
