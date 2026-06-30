import { useState, useEffect } from 'react';
import { FaExclamationTriangle, FaInfoCircle, FaGift, FaExclamationCircle, FaClock, FaShieldAlt } from 'react-icons/fa';

const TYPE_CONFIG = {
  maintenance: {
    icon: FaExclamationTriangle,
    color: '#dc2626',
    bgColor: '#fef2f2',
    borderColor: '#fecaca',
    headerColor: '#dc2626',
    label: 'Bảo trì',
    labelEn: 'Maintenance'
  },
  announcement: {
    icon: FaInfoCircle,
    color: '#f97316',
    bgColor: '#fff7ed',
    borderColor: '#fed7aa',
    headerColor: '#f97316',
    label: 'Thông báo',
    labelEn: 'Announcement'
  },
  promotion: {
    icon: FaGift,
    color: '#f97316',
    bgColor: '#fff7ed',
    borderColor: '#fed7aa',
    headerColor: '#f97316',
    label: 'Khuyến mãi',
    labelEn: 'Promotion'
  },
  warning: {
    icon: FaExclamationCircle,
    color: '#f59e0b',
    bgColor: '#fffbeb',
    borderColor: '#fde68a',
    headerColor: '#f59e0b',
    label: 'Cảnh báo',
    labelEn: 'Warning'
  },
  reminder: {
    icon: FaClock,
    color: '#22c55e',
    bgColor: '#f0fdf4',
    borderColor: '#bbf7d0',
    headerColor: '#22c55e',
    label: 'Nhắc nhở',
    labelEn: 'Reminder'
  },
  security: {
    icon: FaShieldAlt,
    color: '#dc2626',
    bgColor: '#fef2f2',
    borderColor: '#fecaca',
    headerColor: '#dc2626',
    label: 'Bảo mật',
    labelEn: 'Security'
  }
};

const TYPE_TEMPLATES = {
  maintenance: {
    title: 'Thông báo bảo trì hệ thống',
    titleEn: 'System Maintenance Notice',
    message: `Xin chào {{user_name}},

Chúng tôi xin thông báo rằng hệ thống FounderAI sẽ được bảo trì vào thời gian sắp tới.

Thời gian: {{current_date}}
Lý do: Nâng cấp hệ thống để phục vụ tốt hơn

Trong thời gian bảo trì, một số tính năng có thể không khả dụng. Chúng tôi sẽ cố gắng hoàn thành sớm nhất có thể.

Cảm ơn bạn đã thông cảm!

Trân trọng,
Đội ngũ FounderAI`,
    messageEn: `Hello {{user_name}},

We would like to inform you that the FounderAI system will undergo maintenance soon.

Time: {{current_date}}
Reason: System upgrade for better service

During maintenance, some features may not be available. We will try to complete it as soon as possible.

Thank you for your understanding!

Best regards,
FounderAI Team`
  },
  announcement: {
    title: 'Thông báo quan trọng từ FounderAI',
    titleEn: 'Important Announcement from FounderAI',
    message: `Xin chào {{user_name}},

Chúng tôi có thông báo quan trọng dành cho bạn:

[Nội dung thông báo]

Nếu bạn có bất kỳ thắc mắc nào, vui lòng liên hệ với chúng tôi qua email: support@digiso.vn

Trân trọng,
Đội ngũ FounderAI`,
    messageEn: `Hello {{user_name}},

We have an important announcement for you:

[Announcement content]

If you have any questions, please contact us at: support@digiso.vn

Best regards,
FounderAI Team`
  },
  promotion: {
    title: 'Ưu đãi đặc biệt dành cho bạn!',
    titleEn: 'Special Offer Just For You!',
    message: `Xin chào {{user_name}},

Chúng tôi có một ưu đãi hấp dẫn dành riêng cho bạn!

[Tên khuyến mãi]

Thời gian có hiệu lực: {{current_date}}

Điều kiện áp dụng:
- Áp dụng cho gói {{user_plan}}
- Không áp dụng kết hợp với các khuyến mãi khác

Nhanh tay để không bỏ lỡ ưu đãi này!

Trân trọng,
Đội ngũ FounderAI`,
    messageEn: `Hello {{user_name}},

We have an exciting offer just for you!

[Promotion name]

Valid period: {{current_date}}

Terms:
- Applicable for {{user_plan}} plan
- Cannot be combined with other promotions

Hurry up and don't miss out!

Best regards,
FounderAI Team`
  },
  warning: {
    title: 'Cảnh báo: Hành động cần thiết',
    titleEn: 'Warning: Action Required',
    message: `Xin chào {{user_name}},

Chúng tôi phát hiện một vấn đề cần bạn xử lý:

[Nội dung cảnh báo]

Hành động cần thực hiện:
[Chi tiết hành động]

Thời hạn: {{current_date}}

Nếu bạn không thực hiện hành động trên, tài khoản của bạn có thể bị ảnh hưởng.

Liên hệ hỗ trợ: support@digiso.vn

Trân trọng,
Đội ngũ FounderAI`,
    messageEn: `Hello {{user_name}},

We have detected an issue that requires your attention:

[Warning content]

Action required:
[Action details]

Deadline: {{current_date}}

If you don't take action, your account may be affected.

Contact support: support@digiso.vn

Best regards,
FounderAI Team`
  },
  reminder: {
    title: 'Nhắc nhở: [Chủ đề]',
    titleEn: 'Reminder: [Topic]',
    message: `Xin chào {{user_name}},

Đây là lời nhắc từ FounderAI:

Chủ đề: [Nhập chủ đề nhắc nhở]

Thời gian: {{current_date}}
Địa điểm: [Nhập địa điểm]
Ghi chú: [Nhập ghi chú]

Chúc bạn một ngày tốt lành!

Trân trọng,
Đội ngũ FounderAI`,
    messageEn: `Hello {{user_name}},

This is a reminder from FounderAI:

Topic: [Enter reminder topic]

Time: {{current_date}}
Location: [Enter location]
Notes: [Enter notes]

Have a great day!

Best regards,
FounderAI Team`
  },
  security: {
    title: 'Thông báo bảo mật tài khoản',
    titleEn: 'Account Security Notice',
    message: `Xin chào {{user_name}},

Chúng tôi phát hiện hoạt động bất thường trên tài khoản của bạn.

Sự kiện: [Mô tả sự kiện bảo mật]
Địa chỉ IP: [Địa chỉ IP]
Thời gian: {{current_date}}

Nếu đây là bạn: Vui lòng bỏ qua email này.

Nếu đây không phải bạn:
1. Đổi mật khẩu ngay lập tức
2. Liên hệ support@digiso.vn
3. Kiểm tra các thiết bị đã đăng nhập

Để bảo vệ tài khoản, chúng tôi khuyến nghị bạn bật xác thực 2 bước.

Trân trọng,
Đội ngũ FounderAI`,
    messageEn: `Hello {{user_name}},

We detected unusual activity on your account.

Event: [Describe security event]
IP Address: [IP address]
Time: {{current_date}}

If this was you: Please ignore this email.

If this wasn't you:
1. Change your password immediately
2. Contact support@digiso.vn
3. Check logged-in devices

To protect your account, we recommend enabling two-factor authentication.

Best regards,
FounderAI Team`
  }
};

const PRIORITY_CONFIG = {
  low: { color: '#6b7280', label: 'Thấp', labelEn: 'Low' },
  normal: { color: '#2563eb', label: 'Bình thường', labelEn: 'Normal' },
  high: { color: '#f97316', label: 'Cao', labelEn: 'High' },
  urgent: { color: '#dc2626', label: 'Khẩn cấp', labelEn: 'Urgent' }
};

export default function NotificationTypeSelector({ value, onChange, priority, onPriorityChange, onTemplateSelect }) {
  const [showPriority, setShowPriority] = useState(false);

  useEffect(() => {
    if (onPriorityChange) {
      setShowPriority(true);
    }
  }, [onPriorityChange]);

  const handleTypeChange = (type) => {
    onChange(type);
    if (onTemplateSelect && TYPE_TEMPLATES[type]) {
      onTemplateSelect(TYPE_TEMPLATES[type]);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Object.entries(TYPE_CONFIG).map(([type, config]) => {
            const Icon = config.icon;
            const isSelected = value === type;

            return (
              <button
                key={type}
                type="button"
                onClick={() => handleTypeChange(type)}
                className={`
                  flex items-center gap-3 p-4 rounded-xl border-2 transition-all duration-200
                  ${isSelected
                    ? 'shadow-md transform scale-[1.02]'
                    : 'hover:shadow-sm hover:scale-[1.01]'
                  }
                `}
                style={{
                  borderColor: isSelected ? config.color : '#e5e7eb',
                  backgroundColor: isSelected ? config.bgColor : '#fff'
                }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: isSelected ? config.color + '20' : '#f3f4f6' }}
                >
                  <Icon style={{ color: config.color }} className="w-5 h-5" />
                </div>
                <span
                  className="text-sm font-semibold"
                  style={{ color: isSelected ? config.color : '#374151' }}
                >
                  {config.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {showPriority && (
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-3">
            Mức độ ưu tiên
          </label>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(PRIORITY_CONFIG).map(([p, config]) => (
              <button
                key={p}
                type="button"
                onClick={() => onPriorityChange?.(p)}
                className={`
                  px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200
                  ${priority === p
                    ? 'text-white shadow-sm'
                    : 'bg-white border border-gray-200 text-gray-600 hover:border-orange-300 hover:text-orange-600'
                  }
                `}
                style={{
                  backgroundColor: priority === p ? config.color : undefined
                }}
              >
                {config.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export { TYPE_CONFIG, PRIORITY_CONFIG };
