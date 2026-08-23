/**
 * Bộ gói dịch vụ dùng cho môi trường test tại máy.
 *
 * Chụp ở đâu cũng phải ra cùng một bảng giá, nên đây là bản sao đúng các gói
 * đang chạy trên production (lấy qua GET /api/plans ngày 23/08/2026), chỉ bỏ id
 * và các cột dấu thời gian. Bịa số ra thì ảnh minh hoạ sẽ ghi giá sai.
 *
 * Cập nhật lại khi bảng giá thật đổi:
 *   curl -s https://founderai.biz/api/plans
 */
export const DEMO_PLANS = [
  {
    "code": "trial",
    "name": "Dùng thử",
    "price": "0.00",
    "price_yearly": null,
    "description": "Trải nghiệm đầy đủ tính năng trong 14 ngày. Không cần thẻ tín dụng.",
    "features": [
      {
        "en": "200 AI Credits",
        "vi": "200 Credit AI"
      },
      {
        "en": "100 Zalo messages",
        "vi": "100 Tin nhắn Zalo"
      },
      {
        "en": "300 Email messages",
        "vi": "300 Email"
      },
      {
        "en": "6 Messaging Campaigns",
        "vi": "06 Chiến dịch gửi tin"
      },
      {
        "en": "01 Email Account",
        "vi": "01 Tài khoản Email"
      },
      {
        "en": "01 Zalo Account",
        "vi": "01 Tài khoản Zalo"
      },
      {
        "en": "4 templates",
        "vi": "05 mẫu template tin nhắn Zalo"
      },
      {
        "en": "05 Email Templates",
        "vi": "05 mẫu template Email"
      },
      {
        "en": "1 Landing Page",
        "vi": "01 Landing page"
      },
      {
        "en": "01 Staff",
        "vi": "01 Nhân viên"
      },
      {
        "en": "200MB Data Storage",
        "vi": "200MB Lưu trữ dữ liệu"
      }
    ],
    "is_active": true,
    "max_employees": 1,
    "daily_email_limit": 30,
    "monthly_email_limit": 300,
    "daily_zalo_limit": 10,
    "monthly_zalo_limit": 100,
    "max_landing_pages": 1,
    "max_campaigns": 6,
    "max_zalo_campaigns": 2,
    "max_zalo_group_campaigns": 2,
    "max_email_campaigns": 2,
    "max_zalo_accounts": 1,
    "max_email_accounts": 1,
    "max_email_templates": 5,
    "max_zalo_templates": 5,
    "max_chatbots": 2,
    "ai_credits_per_period": 200,
    "ai_tokens_per_period": null,
    "grace_period_days": 0,
    "duration_days": 14,
    "messages_per_period": 100,
    "is_fup_enabled": false,
    "storage_limit_bytes": "209715200",
    "max_kb_documents": 3,
    "max_kb_extracted_chars": "100000"
  },
  {
    "code": "custom",
    "name": "Gói Tùy chọn",
    "price": "0.00",
    "price_yearly": null,
    "description": null,
    "features": [],
    "is_active": true,
    "max_employees": -1,
    "daily_email_limit": null,
    "monthly_email_limit": null,
    "daily_zalo_limit": null,
    "monthly_zalo_limit": null,
    "max_landing_pages": null,
    "max_campaigns": null,
    "max_zalo_campaigns": null,
    "max_zalo_group_campaigns": null,
    "max_email_campaigns": null,
    "max_zalo_accounts": null,
    "max_email_accounts": null,
    "max_email_templates": null,
    "max_zalo_templates": null,
    "max_chatbots": null,
    "ai_credits_per_period": null,
    "ai_tokens_per_period": null,
    "grace_period_days": 0,
    "duration_days": 30,
    "messages_per_period": null,
    "is_fup_enabled": false,
    "storage_limit_bytes": "104857600",
    "max_kb_documents": 3,
    "max_kb_extracted_chars": "100000"
  },
  {
    "code": "starter",
    "name": "Starter",
    "price": "299000.00",
    "price_yearly": "2870400",
    "description": "Gói cơ bản dành cho cá nhân và freelancer quản lý khách hàng",
    "features": [
      {
        "en": "800 AI Credits",
        "vi": "800 Credits AI"
      },
      "2,000 tin Zalo/tháng",
      "5,000 email/tháng",
      "9 chiến dịch",
      {
        "en": "01 Email Account",
        "vi": "01 Tài khoản Email"
      },
      {
        "en": "01 Zalo Account",
        "vi": "01 Tài khoản Zalo"
      },
      {
        "en": "10 messaging templates",
        "vi": "05 mẫu template tin nhắn"
      },
      {
        "en": "05 Email templates",
        "vi": "05 mẫu template Email"
      },
      "3 Landing pages",
      {
        "en": "2 users",
        "vi": "2 nhân viên tham gia"
      },
      {
        "en": "2 GB Storage",
        "vi": "02 Gb Lưu trữ"
      },
      {
        "en": "Video tutorials",
        "vi": "Video hướng dẫn sử dụng"
      },
      {
        "en": "Zalo/Email Support",
        "vi": "Hỗ trợ kỹ thuật qua Zalo/Email"
      },
      {
        "en": "VAT Invoice Export",
        "vi": "Xuất hóa đơn VAT"
      }
    ],
    "is_active": true,
    "max_employees": 2,
    "daily_email_limit": 170,
    "monthly_email_limit": 5000,
    "daily_zalo_limit": 70,
    "monthly_zalo_limit": 2000,
    "max_landing_pages": 3,
    "max_campaigns": 9,
    "max_zalo_campaigns": 3,
    "max_zalo_group_campaigns": 3,
    "max_email_campaigns": 3,
    "max_zalo_accounts": 1,
    "max_email_accounts": 1,
    "max_email_templates": 5,
    "max_zalo_templates": 5,
    "max_chatbots": 1,
    "ai_credits_per_period": 800,
    "ai_tokens_per_period": null,
    "grace_period_days": 0,
    "duration_days": 30,
    "messages_per_period": null,
    "is_fup_enabled": false,
    "storage_limit_bytes": "2147483648",
    "max_kb_documents": 10,
    "max_kb_extracted_chars": "500000"
  },
  {
    "code": "basic",
    "name": "Basic",
    "price": "599000.00",
    "price_yearly": "5750400",
    "description": "Gói Basic dành cho shop nhỏ và doanh nghiệp vừa phải mở rộng quy mô tiếp cận khách hàng.",
    "features": [
      {
        "en": "1600 AI Credits",
        "vi": "1600 Credits AI"
      },
      "8,000 tin Zalo/tháng",
      "20,000 email/tháng",
      "16 chiến dịch",
      "2 tài khoản Email",
      {
        "en": "2 Zalo accounts",
        "vi": "2 tài khoản Zalo"
      },
      {
        "en": "16 message templates",
        "vi": "8 mẫu template tin nhắn"
      },
      {
        "en": "8 Email Templates",
        "vi": "8 mẫu template email"
      },
      "10 Landing pages",
      {
        "en": "3 Staff",
        "vi": "03 Nhân viên"
      },
      {
        "en": "5GB Storage",
        "vi": "05Gb Lưu trữ"
      },
      {
        "en": "Video tutorials",
        "vi": "Video hướng dẫn sử dụng"
      },
      {
        "en": "Zalo/Email Technical Support",
        "vi": "Hỗ trợ kỹ thuật qua Zalo/Email"
      },
      "Xuất hóa đơn VAT"
    ],
    "is_active": true,
    "max_employees": 3,
    "daily_email_limit": 700,
    "monthly_email_limit": 20000,
    "daily_zalo_limit": 270,
    "monthly_zalo_limit": 8000,
    "max_landing_pages": 10,
    "max_campaigns": 16,
    "max_zalo_campaigns": 5,
    "max_zalo_group_campaigns": 5,
    "max_email_campaigns": 5,
    "max_zalo_accounts": 2,
    "max_email_accounts": 2,
    "max_email_templates": 8,
    "max_zalo_templates": 8,
    "max_chatbots": 3,
    "ai_credits_per_period": 1600,
    "ai_tokens_per_period": null,
    "grace_period_days": 0,
    "duration_days": 30,
    "messages_per_period": null,
    "is_fup_enabled": false,
    "storage_limit_bytes": "5368709120",
    "max_kb_documents": 25,
    "max_kb_extracted_chars": "1500000"
  },
  {
    "code": "professional",
    "name": "Pro",
    "price": "1299000.00",
    "price_yearly": "12470400",
    "description": "Gói Professional dành cho doanh nghiệp vừa cần quản lý đa kênh chuyên nghiệp.",
    "features": [
      {
        "en": "3,500 AI Credits",
        "vi": "3.500 Credits AI"
      },
      "25,000 tin Zalo/tháng",
      "60,000 email/tháng",
      "Không giới hạn chiến dịch",
      "5 tài khoản Email",
      {
        "en": "5 Zalo accounts",
        "vi": "5 tài khoản Zalo"
      },
      {
        "en": "20 message templates",
        "vi": "10 mẫu template tin nhắn"
      },
      {
        "en": "10 Email Templates",
        "vi": "10 mẫu template email"
      },
      "30 Landing pages",
      {
        "en": "10 Employees",
        "vi": "10 nhân viên"
      },
      {
        "en": "15 GB Storage",
        "vi": "15 Gb  lưu trữ"
      },
      {
        "en": "Video tutorials",
        "vi": "Video hướng dẫn sử dụng"
      },
      {
        "en": "Zalo/Email Technical Support",
        "vi": "Hỗ trợ kỹ thuật qua Zalo/Email"
      },
      {
        "en": "1:1 online consultation for annual plan purchase",
        "vi": "Tư vấn online 1:1 khi mua gói năm"
      },
      "Xuất hóa đơn VAT"
    ],
    "is_active": true,
    "max_employees": 10,
    "daily_email_limit": 2000,
    "monthly_email_limit": 60000,
    "daily_zalo_limit": 850,
    "monthly_zalo_limit": 25000,
    "max_landing_pages": 30,
    "max_campaigns": null,
    "max_zalo_campaigns": null,
    "max_zalo_group_campaigns": null,
    "max_email_campaigns": null,
    "max_zalo_accounts": 5,
    "max_email_accounts": 5,
    "max_email_templates": 10,
    "max_zalo_templates": 10,
    "max_chatbots": 10,
    "ai_credits_per_period": 3500,
    "ai_tokens_per_period": null,
    "grace_period_days": 0,
    "duration_days": 30,
    "messages_per_period": null,
    "is_fup_enabled": false,
    "storage_limit_bytes": "16106127360",
    "max_kb_documents": 75,
    "max_kb_extracted_chars": "5000000"
  },
  {
    "code": "enterprise",
    "name": "Enterprise",
    "price": "9999000.00",
    "price_yearly": "95990400",
    "description": "Gói Enterprise không giới hạn dành cho tổ chức lớn với nhu cầu cao cấp.",
    "features": [
      {
        "en": "Unlimited AI Credits",
        "vi": "Không giới hạn Credits AI"
      },
      "Không giới hạn tin nhắn Zalo/Tháng",
      "Không giới hạn tin nhắn Email/Tháng",
      "Không giới hạn chiến dịch",
      "Không giới hạn tài khoản Email",
      "Không giới hạn tài khoản Zalo",
      {
        "en": "Unlimited Message Templates",
        "vi": "Không giới hạn mẫu template Tin nhắn"
      },
      "Không giới hạn mẫu template Email",
      "Không giới hạn landing pages",
      {
        "en": "Unlimited staff",
        "vi": "Không giới hạn nhân viên"
      },
      {
        "en": "Unlimited Storage",
        "vi": "Không giới hạn lưu trữ"
      },
      {
        "en": "Video tutorials",
        "vi": "Video hướng dẫn sử dụng"
      },
      {
        "en": "Technical support via Zalo/Email",
        "vi": "Hỗ trợ kỹ thuật qua Zalo/Email"
      },
      {
        "en": "1:1 Online Consultation with Annual Plan Purchase",
        "vi": "Tư vấn online 1:1 khi mua gói năm"
      },
      {
        "en": "On-site AI Automation Strategy Consulting for Annual Plans",
        "vi": "Tư vấn chiến lược AI Automation trực tiếp tại doanh nghiệp khi mua gói năm"
      },
      {
        "en": "VAT Invoice Export",
        "vi": "Xuất hóa đơn VAT"
      }
    ],
    "is_active": true,
    "max_employees": 30,
    "daily_email_limit": 6700,
    "monthly_email_limit": 200000,
    "daily_zalo_limit": 2000,
    "monthly_zalo_limit": 60000,
    "max_landing_pages": 100,
    "max_campaigns": null,
    "max_zalo_campaigns": null,
    "max_zalo_group_campaigns": null,
    "max_email_campaigns": null,
    "max_zalo_accounts": 12,
    "max_email_accounts": 12,
    "max_email_templates": 25,
    "max_zalo_templates": 25,
    "max_chatbots": 30,
    "ai_credits_per_period": 800000,
    "ai_tokens_per_period": null,
    "grace_period_days": 0,
    "duration_days": 30,
    "messages_per_period": null,
    "is_fup_enabled": true,
    "storage_limit_bytes": "104857600000",
    "max_kb_documents": 200,
    "max_kb_extracted_chars": "20000000"
  }
];
