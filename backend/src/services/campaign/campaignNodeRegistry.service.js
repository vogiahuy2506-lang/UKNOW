/**
 * CampaignNodeRegistry Service
 *
 * Cung cấp thông tin về các node types cho AI một cách động.
 * AI sẽ dùng registry này để:
 * 1. Hiểu các node có sẵn trong hệ thống
 * 2. Tự động điền config cho các node
 * 3. Hỗ trợ multi-step trong 1 node (nhiều email/zalo cách nhau thời gian)
 */

import {
  isTelegramCampaignChannelEnabled,
  isWhatsAppCampaignChannelEnabled,
  isChannelBlockedByPlan,
  buildChannelNotInPlanMessage,
} from './campaignChannelFlags.util.js';
import { MAX_CHANNEL_STEPS, validateChannelSteps } from '../../utils/channelSteps.util.js';

// P12 — node phụ thuộc kênh Zalo (tài khoản Zalo cá nhân): gửi + chọn tài khoản + lấy danh sách bạn/nhóm.
const ZALO_PLAN_NODE_SUBTYPES = new Set([
  'send_zalo_personal',
  'send_zalo_group',
  'send_zalo_friend_request',
  'select_zalo_account',
  'get_all_friends',
  'get_all_groups',
]);

/** Subtype có thuộc kênh Zalo (bị cổng quyền kênh theo gói chặn) không. */
export function isZaloPlanNodeSubtype(subtype) {
  return ZALO_PLAN_NODE_SUBTYPES.has(String(subtype || ''));
}

class CampaignNodeRegistryService {
  constructor() {
    this._baseNodeTypes = this._buildNodeTypeRegistry();
  }

  /**
   * P8a — node kênh adapter (Telegram/WhatsApp) CHỈ có mặt khi cờ kênh bật (đọc LÚC GỌI, không cache lúc
   * import): cờ tắt thì AI không được biết tới node này và `validateNodeConfig` coi nó là subtype lạ,
   * đúng như engine (`campaignChannelRegistry`) không nhận subtype đó. Khối lượng dựng mỗi lần đọc rất nhỏ.
   */
  get nodeTypes() {
    const adapterNodes = this._buildAdapterNodeTypes();
    const merged = Object.keys(adapterNodes).length > 0
      ? { ...this._baseNodeTypes, ...adapterNodes }
      : this._baseNodeTypes;
    // P12 — gói không có kênh Zalo: AI không được biết tới các node Zalo (validateNodeConfig coi là bị chặn theo gói).
    if (!isChannelBlockedByPlan('zalo')) return merged;
    return Object.fromEntries(Object.entries(merged).filter(([subtype]) => !isZaloPlanNodeSubtype(subtype)));
  }

  _buildAdapterNodeTypes() {
    const nodes = {};
    const stepsSchema = {
      type: 'array',
      label: 'Nội dung tin nhắn',
      description: `1 đến ${MAX_CHANNEL_STEPS} bước. Bước 1 gửi ngay; bước 2 trở đi có "delayValue" + "delayUnit" (minutes|hours|days) = chờ bao lâu kể từ khi bước trước gửi xong.`,
      itemSchema: {
        templateId: { type: 'number', label: 'Mẫu tin (tuỳ chọn)' },
        message: { type: 'string', label: 'Nội dung tin nhắn', maxLength: 4000 },
        delayValue: { type: 'number', label: 'Chờ bao lâu trước bước này (bước 2 trở đi)' },
        delayUnit: { type: 'enum', values: ['minutes', 'hours', 'days'], default: 'minutes', label: 'Đơn vị thời gian chờ' },
        attachments: { type: 'array', label: 'Tệp đính kèm (tuỳ chọn)' },
      },
    };
    if (isTelegramCampaignChannelEnabled()) {
      nodes.send_telegram = {
        nodeType: 'action',
        name: 'Gửi tin nhắn Telegram',
        description: 'Gửi tin nhắn Telegram từ tài khoản đã kết nối (1 tin hoặc chuỗi tối đa 5 tin cách nhau thời gian). Người nhận: hội thoại đang mở hoặc chat id nhập tay.',
        color: '#E1F5FE',
        configRequired: true,
        multiStep: false,
        configSchema: {
          telegramAccountId: {
            type: 'number',
            required: true,
            label: 'Tài khoản Telegram',
          },
          recipientSource: {
            type: 'enum',
            values: ['telegram_conversations', 'manual', 'telegram_groups', 'node'],
            default: 'telegram_conversations',
            label: 'Nguồn người nhận',
          },
          recipientKeys: {
            type: 'array',
            label: 'Chat id (khi nguồn = manual / telegram_groups)',
          },
          steps: stepsSchema,
        },
        exampleConfig: {
          telegramAccountId: null,
          recipientSource: 'telegram_conversations',
          steps: [{ message: 'Xin chào {{ten}}! Cảm ơn bạn đã nhắn cho chúng tôi.' }],
        },
      };
    }
    if (isWhatsAppCampaignChannelEnabled()) {
      nodes.send_whatsapp = {
        nodeType: 'action',
        name: 'Gửi tin nhắn WhatsApp',
        description: 'Gửi tin nhắn WhatsApp từ số đã quét QR (1 tin hoặc chuỗi tối đa 5 tin cách nhau thời gian). Người nhận: hội thoại đang mở, node dữ liệu (cột SĐT) hoặc SĐT nhập tay.',
        color: '#E8F5E9',
        configRequired: true,
        multiStep: false,
        configSchema: {
          whatsappSessionKey: {
            type: 'string',
            required: true,
            label: 'Tài khoản WhatsApp (mã phiên, dạng "<idChủ>-<tênPhiên>")',
          },
          recipientSource: {
            type: 'enum',
            values: ['whatsapp_conversations', 'node', 'manual'],
            default: 'whatsapp_conversations',
            label: 'Nguồn người nhận',
          },
          recipientNodeId: {
            type: 'string',
            label: 'Node dữ liệu (khi nguồn = node)',
          },
          recipientColumn: {
            type: 'string',
            label: 'Cột SĐT của node dữ liệu',
          },
          recipientKeys: {
            type: 'array',
            label: 'Danh sách SĐT (khi nguồn = manual)',
          },
          steps: stepsSchema,
        },
        exampleConfig: {
          whatsappSessionKey: null,
          recipientSource: 'whatsapp_conversations',
          steps: [{ message: 'Xin chào {{ten}}! Cảm ơn bạn đã nhắn cho chúng tôi.' }],
        },
      };
    }
    return nodes;
  }

  /**
   * Build comprehensive node type registry
   */
  _buildNodeTypeRegistry() {
    return {
      // ===== TRIGGER =====
      manual: {
        nodeType: 'trigger',
        name: 'Bắt đầu (Manual Trigger)',
        description: 'Khởi chạy chiến dịch thủ công',
        color: '#E8EAF6',
        configRequired: false,
        configSchema: {},
        exampleConfig: {},
      },

      // ===== DATA NODES =====
      interested_customers: {
        nodeType: 'data',
        name: 'Lấy dữ liệu khách hàng',
        description: 'Lấy danh sách khách hàng từ database hệ thống',
        color: '#FFF8E1',
        configRequired: false,
        configSchema: {
          interestedCustomerType: {
            type: 'enum',
            values: ['interested', 'purchased', 'both'],
            default: 'both',
            label: 'Loại khách hàng',
          },
          interestedLimit: {
            type: 'number',
            default: 1000,
            label: 'Số lượng tối đa',
          },
          interestedCourseIds: {
            type: 'array',
            label: 'Lọc theo khóa học',
          },
        },
        exampleConfig: {
          interestedCustomerType: 'both',
          interestedLimit: 1000,
        },
      },

      read_sheet: {
        nodeType: 'data',
        name: 'Đọc dữ liệu Google Sheet',
        description: 'Đọc danh sách khách từ Google Sheet hoặc Excel',
        color: '#E8F5E9',
        configRequired: true,
        configSchema: {
          sheetUrl: {
            type: 'string',
            required: true,
            label: 'Đường dẫn Google Sheet',
            placeholder: 'https://docs.google.com/spreadsheets/d/...',
          },
          sheetName: {
            type: 'string',
            label: 'Tên Sheet',
            description: 'Để trống = dùng tab đầu tiên. Chỉ điền khi file có nhiều tab và bạn muốn đọc tab khác.',
          },
          headerRow: {
            type: 'number',
            default: 1,
            label: 'Dòng tiêu đề',
          },
          dataStartRow: {
            type: 'number',
            default: 2,
            label: 'Dòng bắt đầu dữ liệu',
          },
          dataSelectedColumns: {
            type: 'array',
            label: 'Cột dữ liệu cần lấy',
          },
        },
        exampleConfig: {
          sheetUrl: '',
          sheetName: '',
          headerRow: 1,
          dataStartRow: 2,
          dataSelectedColumns: [],
        },
      },

      read_landing_leads: {
        nodeType: 'data',
        name: 'Dữ liệu Landing Page',
        description: 'Lấy leads từ form đăng ký landing page',
        color: '#E0F2F1',
        configRequired: false,
        configSchema: {},
        exampleConfig: {},
      },

      read_form_submissions: {
        nodeType: 'data',
        name: 'Dữ liệu Biểu mẫu',
        description: 'Lấy người đã điền và đồng ý nhận tin từ một biểu mẫu (form) đã tạo',
        color: '#FCE4EC',
        configRequired: true,
        configSchema: {
          formId: {
            type: 'number',
            required: true,
            label: 'Biểu mẫu',
          },
          fieldMap: {
            type: 'object',
            label: 'Ánh xạ trường (họ tên/email/SĐT)',
            description: 'Để trống = lấy theo vai trò (role) của trường trong form',
          },
          dataSelectedColumns: {
            type: 'array',
            label: 'Cột dữ liệu cần lấy',
          },
          formSubmissionsLimit: {
            type: 'number',
            default: 1000,
            label: 'Số lượng tối đa',
          },
        },
        exampleConfig: {
          formId: null,
          fieldMap: {},
          dataSelectedColumns: [],
          formSubmissionsLimit: 1000,
        },
      },

      select_zalo_account: {
        nodeType: 'data',
        name: 'Chọn tài khoản Zalo',
        description: 'Chọn tài khoản Zalo để gửi tin nhắn (BẮT BUỘC trước get_all_friends/get_all_groups)',
        color: '#E3F2FD',
        configRequired: true,
        configSchema: {
          zaloAccountId: {
            type: 'number',
            required: true,
            label: 'ID Tài khoản Zalo',
          },
          zaloPoolMultiAccountEnabled: {
            type: 'boolean',
            default: false,
            label: 'Sử dụng nhiều tài khoản',
          },
          zaloPoolAccountIds: {
            type: 'array',
            label: 'Danh sách tài khoản Zalo (pool)',
          },
        },
        exampleConfig: {
          zaloAccountId: null,
        },
      },

      get_all_friends: {
        nodeType: 'data',
        name: 'Lấy danh sách bạn bè Zalo',
        description: 'Lấy danh sách bạn bè từ tài khoản Zalo đã chọn',
        color: '#E3F2FD',
        configRequired: true,
        configSchema: {
          // Tên field phải khớp runtime (campaignRun đọc zaloFriendAccountNodeId) và builder thủ công.
          zaloFriendAccountNodeId: {
            type: 'string',
            required: true,
            label: 'Node chọn tài khoản Zalo',
            description: 'ID của node select_zalo_account phía trước',
          },
        },
        exampleConfig: {
          zaloFriendAccountNodeId: '',
        },
      },

      get_all_groups: {
        nodeType: 'data',
        name: 'Lấy thông tin nhóm Zalo',
        description: 'Lấy danh sách nhóm từ tài khoản Zalo đã chọn',
        color: '#E3F2FD',
        configRequired: true,
        configSchema: {
          // Tên field phải khớp runtime (campaignRun đọc zaloGroupAccountNodeId) và builder thủ công.
          zaloGroupAccountNodeId: {
            type: 'string',
            required: true,
            label: 'Node chọn tài khoản Zalo',
          },
        },
        exampleConfig: {
          zaloGroupAccountNodeId: '',
        },
      },

      save_customer: {
        nodeType: 'data',
        name: 'Lưu khách hàng',
        description: 'Lưu dữ liệu khách hàng vào database',
        color: '#E0F7FA',
        configRequired: true,
        configSchema: {
          saveCustomerNodeId: {
            type: 'string',
            required: true,
            label: 'Node dữ liệu nguồn',
          },
          saveCustomerFieldMap: {
            type: 'object',
            label: 'Ánh xạ trường dữ liệu',
            fields: ['email', 'phone', 'fullName', 'gender', 'customerSource', 'notes'],
          },
        },
        exampleConfig: {
          saveCustomerNodeId: '',
          saveCustomerFieldMap: {
            email: { mode: 'node', field: 'email', nodeId: '' },
            phone: { mode: 'node', field: 'phone', nodeId: '' },
          },
        },
      },

      // ===== ACTION NODES =====
      send_email: {
        nodeType: 'action',
        name: 'Gửi Email',
        description: 'Gửi email theo template (HỖ TRỢ NHIỀU EMAIL TRONG 1 NODE)',
        color: '#FFF3E0',
        configRequired: true,
        multiStep: true,
        multiStepField: 'emailSteps',
        configSchema: {
          fromEmailId: {
            type: 'number',
            required: true,
            label: 'Email gửi (SMTP)',
            description: 'ID tài khoản SMTP đã cấu hình',
          },
          recipientSource: {
            type: 'enum',
            values: ['manual', 'node'],
            default: 'node',
            label: 'Nguồn người nhận',
          },
          recipientNodeId: {
            type: 'string',
            label: 'Node dữ liệu',
            description: 'ID của node chứa danh sách email',
          },
          recipientField: {
            type: 'string',
            default: 'email',
            label: 'Cột chứa email',
          },
          ccEnabled: {
            type: 'boolean',
            default: false,
            label: 'Bật CC',
          },
          saveMessageLog: {
            type: 'boolean',
            default: true,
            label: 'Lưu lịch sử tin nhắn',
          },
          emailSteps: {
            type: 'array',
            label: 'Danh sách email gửi',
            description: 'THÊM NHIỀU EMAIL - mỗi email cách nhau thời gian',
            itemSchema: {
              templateId: {
                type: 'number',
                label: 'Template ID',
              },
              emailSubject: {
                type: 'string',
                label: 'Tiêu đề email',
              },
              emailBody: {
                type: 'string',
                label: 'Nội dung HTML',
              },
              delayValue: {
                type: 'number',
                default: 0,
                label: 'Sau bao lâu gửi',
              },
              delayUnit: {
                type: 'enum',
                values: ['minutes', 'hours', 'days'],
                default: 'days',
                label: 'Đơn vị thời gian',
              },
              delayFrom: {
                type: 'enum',
                values: ['start', 'prev'],
                default: 'start',
                label: 'Tính từ',
              },
              enableLinkTracking: {
                type: 'boolean',
                default: true,
                label: 'Bật tracking link',
              },
              templateMappings: {
                type: 'array',
                label: 'Mapping biến template',
              },
            },
          },
        },
        exampleConfig: {
          fromEmailId: null,
          recipientSource: 'node',
          recipientNodeId: '',
          recipientField: 'email',
          saveMessageLog: true,
          emailSteps: [
            {
              templateId: null,
              emailSubject: 'Chào bạn {{full_name}}! Ưu đãi đặc biệt hôm nay',
              emailBody: '<h2>Xin chào {{full_name}},</h2><p>Cảm ơn bạn đã quan tâm đến sản phẩm của chúng tôi!</p>',
              delayValue: 0,
              delayUnit: 'days',
              enableLinkTracking: true,
              templateMappings: [],
            },
          ],
        },
      },

      send_zalo_personal: {
        nodeType: 'action',
        name: 'Gửi tin nhắn Zalo cá nhân',
        description: 'Gửi tin nhắn Zalo đến số điện thoại (HỖ TRỢ NHIỀU TIN TRONG 1 NODE)',
        color: '#E3F2FD',
        configRequired: true,
        multiStep: true,
        multiStepField: 'zaloPersonalTemplateSteps',
        configSchema: {
          zaloAccountId: {
            type: 'number',
            required: true,
            label: 'Tài khoản Zalo',
          },
          zaloRecipientSource: {
            type: 'enum',
            values: ['manual', 'node'],
            default: 'node',
            label: 'Nguồn người nhận',
          },
          zaloRecipientNodeId: {
            type: 'string',
            label: 'Node dữ liệu',
          },
          zaloRecipientField: {
            type: 'string',
            default: 'phone',
            label: 'Cột phone/uid',
          },
          zaloRecipientType: {
            type: 'enum',
            values: ['phone', 'uid'],
            default: 'phone',
            label: 'Loại định danh',
          },
          zaloPersonalSendMode: {
            type: 'enum',
            values: ['all', 'schedule'],
            default: 'all',
            label: 'Chế độ gửi',
          },
          saveMessageLog: {
            type: 'boolean',
            default: true,
            label: 'Lưu lịch sử tin nhắn',
          },
          zaloPersonalTemplateSteps: {
            type: 'array',
            label: 'Danh sách tin nhắn gửi',
            description: 'THÊM NHIỀU TIN - mỗi tin cách nhau thời gian',
            itemSchema: {
              templateId: {
                type: 'number',
                label: 'Template ID',
              },
              message: {
                type: 'string',
                label: 'Nội dung tin nhắn',
                maxLength: 4000,
              },
              delayValue: {
                type: 'number',
                default: 0,
                label: 'Sau bao lâu gửi',
              },
              delayUnit: {
                type: 'enum',
                values: ['minutes', 'hours', 'days'],
                default: 'days',
                label: 'Đơn vị thời gian',
              },
              enableLinkTracking: {
                type: 'boolean',
                default: true,
                label: 'Bật tracking link',
              },
              templateMappings: {
                type: 'array',
                label: 'Mapping biến template',
              },
            },
          },
        },
        exampleConfig: {
          zaloAccountId: null,
          zaloRecipientSource: 'node',
          zaloRecipientNodeId: '',
          zaloRecipientField: 'phone',
          zaloRecipientType: 'phone',
          saveMessageLog: true,
          zaloPersonalTemplateSteps: [
            {
              message: 'Xin chào {{full_name}}! Cảm ơn bạn đã quan tâm. Chúng tôi sẽ liên hệ sớm nhất!',
              delayValue: 0,
              delayUnit: 'days',
              enableLinkTracking: true,
              templateMappings: [],
            },
          ],
        },
      },

      send_zalo_group: {
        nodeType: 'action',
        name: 'Gửi tin nhắn nhóm Zalo',
        description: 'Gửi tin nhắn Zalo đến danh sách nhóm',
        color: '#E3F2FD',
        configRequired: true,
        multiStep: true,
        multiStepField: 'zaloGroupTemplateSteps',
        configSchema: {
          zaloAccountId: {
            type: 'number',
            required: true,
            label: 'Tài khoản Zalo',
          },
          zaloGroupSource: {
            type: 'enum',
            values: ['manual', 'node'],
            default: 'node',
            label: 'Nguồn nhóm',
          },
          zaloGroupNodeId: {
            type: 'string',
            label: 'Node danh sách nhóm',
          },
          zaloGroupField: {
            type: 'string',
            default: 'groupId',
            label: 'Cột Group ID',
          },
          saveMessageLog: {
            type: 'boolean',
            default: true,
            label: 'Lưu lịch sử tin nhắn',
          },
          zaloGroupTemplateSteps: {
            type: 'array',
            label: 'Danh sách tin nhắn gửi',
            itemSchema: {
              templateId: { type: 'number' },
              message: { type: 'string', label: 'Nội dung' },
              delayValue: { type: 'number', default: 0 },
              delayUnit: { type: 'enum', values: ['minutes', 'hours', 'days'], default: 'days' },
              templateMappings: { type: 'array' },
            },
          },
        },
        exampleConfig: {
          zaloAccountId: null,
          zaloGroupSource: 'node',
          zaloGroupNodeId: '',
          zaloGroupField: 'groupId',
          saveMessageLog: true,
          zaloGroupTemplateSteps: [
            {
              message: '📢 Thông báo quan trọng từ chúng tôi...',
              delayValue: 0,
              delayUnit: 'days',
              templateMappings: [],
            },
          ],
        },
      },

      send_zalo_friend_request: {
        nodeType: 'action',
        name: 'Gửi lời mời kết bạn Zalo',
        description: 'Gửi lời mời kết bạn theo số điện thoại',
        color: '#E3F2FD',
        configRequired: true,
        multiStep: false,
        configSchema: {
          zaloAccountId: {
            type: 'number',
            required: true,
            label: 'Tài khoản Zalo',
          },
          zaloFriendSource: {
            type: 'enum',
            values: ['manual', 'node'],
            default: 'node',
            label: 'Nguồn số điện thoại',
          },
          zaloFriendNodeId: {
            type: 'string',
            label: 'Node dữ liệu',
          },
          zaloFriendField: {
            type: 'string',
            default: 'phone',
            label: 'Cột số điện thoại',
          },
          zaloFriendContentMode: {
            type: 'enum',
            values: ['manual', 'template'],
            default: 'manual',
            label: 'Nguồn nội dung',
          },
          zaloFriendRequestMessage: {
            type: 'string',
            label: 'Lời mời kết bạn',
          },
          zaloFriendTemplateId: {
            type: 'number',
            label: 'Template ID',
          },
        },
        exampleConfig: {
          zaloAccountId: null,
          zaloFriendSource: 'node',
          zaloFriendNodeId: '',
          zaloFriendField: 'phone',
          zaloFriendContentMode: 'manual',
          zaloFriendRequestMessage: 'Xin chào! Hãy kết bạn với tôi nhé.',
        },
      },

      // ===== END =====
      end: {
        nodeType: 'end',
        name: 'Kết thúc',
        description: 'Điểm cuối quy trình chiến dịch',
        color: '#FFEBEE',
        configRequired: false,
        configSchema: {},
        exampleConfig: {},
      },
    };
  }

  /**
   * Lấy danh sách tất cả node types cho AI
   */
  getAllNodeTypes() {
    return this.nodeTypes;
  }

  /**
   * Lấy thông tin chi tiết của một node subtype
   */
  getNodeType(subtype) {
    return this.nodeTypes[subtype] || null;
  }

  /**
   * Lấy các node types hỗ trợ multi-step
   */
  getMultiStepNodeTypes() {
    return Object.entries(this.nodeTypes)
      .filter(([_, info]) => info.multiStep === true)
      .map(([subtype, info]) => ({
        subtype,
        name: info.name,
        nodeType: info.nodeType,
        multiStepField: info.multiStepField,
        description: info.description,
      }));
  }

  /**
   * Build prompt context cho AI - thông tin đầy đủ về các node
   */
  buildNodeContextForAI() {
    const lines = [];
    lines.push('════════════════════════════════════════');
    lines.push('  DANH SÁCH NODE TYPES THỰC SỰ TỒN TẠI');
    lines.push('════════════════════════════════════════');
    lines.push('');
    lines.push('QUY TẮC QUAN TRỌNG:');
    lines.push('- KHÔNG tạo node "wait", "delay", "condition" riêng - KHÔNG TỒN TẠI');
    lines.push('- Delay được đặt TRỰC TIẾP trong config của action node');
    lines.push('- ★ MỘT NODE CÓ THỂ GỬI NHIỀU TIN: dùng emailSteps[] hoặc zaloTemplateSteps[]');
    lines.push('');

    // Triggers
    lines.push('── TRIGGER ──');
    lines.push('• nodeType: "trigger", nodeSubtype: "manual"');
    lines.push('  config: {} (không cần config)');
    lines.push('');

    // Data nodes
    lines.push('── DATA NODES (lấy dữ liệu) ──');
    lines.push('• nodeType: "data", nodeSubtype: "interested_customers"');
    lines.push('  config: { "interestedCustomerType": "both", "interestedLimit": 1000 }');
    lines.push('');
    lines.push('• nodeType: "data", nodeSubtype: "read_sheet"');
    lines.push('  config: { "sheetUrl": "url", "headerRow": 1, "dataStartRow": 2 }');
    lines.push('');
    lines.push('• nodeType: "data", nodeSubtype: "read_landing_leads"');
    lines.push('  config: {}');
    lines.push('');
    lines.push('• nodeType: "data", nodeSubtype: "read_form_submissions"    ← người đã nộp Biểu mẫu và ĐỒNG Ý nhận tin');
    lines.push('  config: { "formId": <ID_form> } (formId lấy từ danh sách Biểu mẫu trong TÀI NGUYÊN CÓ SẴN — BẮT BUỘC)');
    lines.push('');
    lines.push('• nodeType: "data", nodeSubtype: "select_zalo_account"');
    lines.push('  config: { "zaloAccountId": <ID> } (BẮT BUỘC trước get_all_friends/get_all_groups)');
    lines.push('');
    lines.push('• nodeType: "data", nodeSubtype: "get_all_friends"');
    lines.push('  config: { "zaloFriendAccountNodeId": "<tempId_select_zalo_account>" }');
    lines.push('');
    lines.push('• nodeType: "data", nodeSubtype: "get_all_groups"');
    lines.push('  config: { "zaloGroupAccountNodeId": "<tempId_select_zalo_account>" }');
    lines.push('');
    lines.push('• nodeType: "data", nodeSubtype: "save_customer"');
    lines.push('  config: { "saveCustomerNodeId": "<tempId>", "saveCustomerFieldMap": {...} }');
    lines.push('');

    // Action nodes - QUAN TRỌNG
    lines.push('── ACTION NODES (gửi tin) ──');
    lines.push('');
    lines.push('★ NODE GỬI EMAIL - HỖ TRỢ NHIỀU EMAIL TRONG 1 NODE:');
    lines.push('• nodeType: "action", nodeSubtype: "send_email"');
    lines.push('  config bắt buộc:');
    lines.push('    "recipientSource": "node" | "manual"');
    lines.push('    "recipientNodeId": "<tempId_node_dữ_liệu>" (khi recipientSource = "node")');
    lines.push('    "recipientField": "email"');
    lines.push('    "emailSteps": [                           ← ★ MẢNG - NHIỀU EMAIL TRONG 1 NODE');
    lines.push('      {');
    lines.push('        "templateId": <ID|null>,');
    lines.push('        "emailSubject": "Tiêu đề email 1",');
    lines.push('        "emailBody": "<html>...</html>",');
    lines.push('        "delayValue": 0,                     ← ★ Gửi ngay lập tức');
    lines.push('        "delayUnit": "days",');
    lines.push('        "templateMappings": []');
    lines.push('      },');
    lines.push('      {');
    lines.push('        "emailSubject": "Tiêu đề email 2",');
    lines.push('        "emailBody": "<html>...</html>",');
    lines.push('        "delayValue": 3,                     ← ★ Gửi sau 3 ngày');
    lines.push('        "delayUnit": "days",');
    lines.push('        "templateMappings": []');
    lines.push('      }');
    lines.push('    ]');
    lines.push('');
    // P12 — gói của người đang chat không có kênh Zalo: KHÔNG liệt kê node Zalo, nói rõ để LLM không dựng.
    if (isChannelBlockedByPlan('zalo')) {
      lines.push('⛔ KÊNH ZALO KHÔNG KHẢ DỤNG (gói của người dùng chưa có Zalo): TUYỆT ĐỐI KHÔNG tạo node send_zalo_personal, send_zalo_group, send_zalo_friend_request, select_zalo_account, get_all_friends, get_all_groups. Chỉ dùng các kênh còn lại.');
      lines.push('');
    } else {
      lines.push('★ NODE GỬI ZALO CÁ NHÂN - HỖ TRỢ NHIỀU TIN TRONG 1 NODE:');
      lines.push('• nodeType: "action", nodeSubtype: "send_zalo_personal"');
      lines.push('  config bắt buộc:');
      lines.push('    "zaloAccountId": <ID|null>');
      lines.push('    "zaloRecipientSource": "node"');
      lines.push('    "zaloRecipientNodeId": "<tempId>"');
      lines.push('    "zaloRecipientField": "phone"');
      lines.push('    "zaloPersonalTemplateSteps": [          ← ★ MẢNG - NHIỀU TIN TRONG 1 NODE');
      lines.push('      {');
      lines.push('        "message": "Nội dung tin nhắn 1...",');
      lines.push('        "delayValue": 0,                     ← ★ Gửi ngay');
      lines.push('        "delayUnit": "days",');
      lines.push('        "enableLinkTracking": true');
      lines.push('      },');
      lines.push('      {');
      lines.push('        "message": "Nội dung tin nhắn 2...",');
      lines.push('        "delayValue": 2,                     ← ★ Gửi sau 2 ngày');
      lines.push('        "delayUnit": "days"');
      lines.push('      }');
      lines.push('    ]');
      lines.push('');
      lines.push('★ NODE GỬI ZALO NHÓM:');
      lines.push('• nodeType: "action", nodeSubtype: "send_zalo_group"');
      lines.push('  config: { "zaloGroupSource": "node", "zaloGroupNodeId": "<tempId>", "zaloGroupField": "groupId", "zaloGroupTemplateSteps": [...] }');
      lines.push('');
      lines.push('• nodeType: "action", nodeSubtype: "send_zalo_friend_request"');
      lines.push('  config: { "zaloAccountId": <ID>, "zaloFriendSource": "node", ... }');
      lines.push('');
    }

    // P8a — kênh adapter: chỉ liệt kê khi cờ kênh bật (đọc lúc gọi).
    if (isTelegramCampaignChannelEnabled()) {
      lines.push('★ NODE GỬI TELEGRAM (1 tin gửi ngay, hoặc CHUỖI tối đa 5 tin — bước 2+ có "delayValue"+"delayUnit" (minutes|hours|days) = chờ bao lâu kể từ bước trước):');
      lines.push('• nodeType: "action", nodeSubtype: "send_telegram"   ← KHÔNG cần node select_zalo_account, KHÔNG dùng zaloAccountId');
      lines.push('  config: { "telegramAccountId": <ID|null>, "recipientSource": "telegram_conversations", "steps": [ { "message": "Nội dung tin..." } ] }');
      lines.push('  recipientSource: "telegram_conversations" (những người đã nhắn tới tài khoản này — mặc định) | "manual" (kèm "recipientKeys": ["123456789", ...] là chat id SỐ)');
      lines.push('  Telegram KHÔNG gửi được cho người lạ theo SĐT/username — chỉ chat id hoặc hội thoại đã có.');
      lines.push('  Luồng ĐÚNG: trigger → send_telegram (không cần node dữ liệu khi nguồn là hội thoại).');
      lines.push('');
    }
    if (isWhatsAppCampaignChannelEnabled()) {
      lines.push('★ NODE GỬI WHATSAPP (1 tin gửi ngay, hoặc CHUỖI tối đa 5 tin — bước 2+ có "delayValue"+"delayUnit" (minutes|hours|days) = chờ bao lâu kể từ bước trước):');
      lines.push('• nodeType: "action", nodeSubtype: "send_whatsapp"   ← KHÔNG cần node select_zalo_account, KHÔNG dùng zaloAccountId');
      lines.push('  config: { "whatsappSessionKey": "<mã phiên|null>", "recipientSource": "whatsapp_conversations", "steps": [ { "message": "Nội dung tin..." } ] }');
      lines.push('  recipientSource: "whatsapp_conversations" (người đã nhắn tới số này — mặc định) | "node" (kèm "recipientNodeId": "<tempId node dữ liệu>", "recipientColumn": "<cột SĐT>") | "manual" (kèm "recipientKeys": ["84912345678", ...])');
      lines.push('  Luồng ĐÚNG: trigger → send_whatsapp (nguồn hội thoại) hoặc trigger → <node dữ liệu> → send_whatsapp (nguồn node).');
      lines.push('');
    }

    // End
    lines.push('── END ──');
    lines.push('• nodeType: "end", nodeSubtype: "end"');
    lines.push('  config: {}');

    return lines.join('\n');
  }

  /**
   * Validate config của một node - kiểm tra các trường bắt buộc
   */
  validateNodeConfig(subtype, config) {
    const nodeType = this.nodeTypes[subtype];
    if (!nodeType) {
      // P9 — node kênh mà gói của người dùng không có: nói đúng lý do thay vì "subtype lạ".
      const planChannel = subtype === 'send_telegram' ? 'telegram'
        : subtype === 'send_whatsapp' ? 'whatsapp'
          : isZaloPlanNodeSubtype(subtype) ? 'zalo' : null;
      if (planChannel && isChannelBlockedByPlan(planChannel)) {
        return { valid: false, errors: [buildChannelNotInPlanMessage(planChannel)] };
      }
      return { valid: false, errors: [`Unknown node subtype: ${subtype}`] };
    }

    const errors = [];
    const schema = nodeType.configSchema;
    if (!schema) return { valid: true, errors: [] };

    // Check required fields
    for (const [field, fieldSchema] of Object.entries(schema)) {
      if (fieldSchema.required && (config[field] === undefined || config[field] === null)) {
        errors.push(`Trường "${field}" là bắt buộc (${fieldSchema.label || field})`);
      }
    }

    // P8a + P7 — node kênh adapter: 1 đến MAX_CHANNEL_STEPS bước, mỗi bước có nội dung (hoặc mẫu tin); bước 2+ có thể có
    // độ trễ (delayValue/delayUnit) kể từ bước trước.
    if (subtype === 'send_telegram' || subtype === 'send_whatsapp') {
      const steps = Array.isArray(config.steps) ? config.steps : [];
      if (steps.length === 0) {
        errors.push(`steps phải là mảng có từ 1 đến ${MAX_CHANNEL_STEPS} phần tử (nội dung tin nhắn)`);
      } else {
        const stepsProblem = validateChannelSteps(steps);
        if (stepsProblem) errors.push(stepsProblem.message);
        steps.forEach((rawStep, index) => {
          const step = rawStep || {};
          const hasMessage = String(step.message ?? '').trim() !== '';
          const hasTemplate = step.templateId !== undefined && step.templateId !== null && String(step.templateId).trim() !== '';
          if (!hasMessage && !hasTemplate) errors.push(`steps[${index}] cần nội dung message hoặc templateId`);
        });
      }
    }

    // Validate multi-step arrays
    if (nodeType.multiStep && nodeType.multiStepField) {
      const steps = config[nodeType.multiStepField];
      if (!Array.isArray(steps) || steps.length === 0) {
        const hasTopLevelPayload = nodeType.multiStepField === 'emailSteps'
          ? Boolean(config.emailTemplateId || config.emailBody)
          : nodeType.multiStepField === 'zaloPersonalTemplateSteps'
            ? Boolean(config.message)
            : Boolean(config.zaloGroupMessage);
        if (!hasTopLevelPayload) errors.push(`${nodeType.multiStepField} phải là mảng có ít nhất 1 phần tử hoặc có nội dung top-level hợp lệ`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Build system prompt cho AI smart chat - hỏi thông tin khi thiếu
   */
  buildAskMorePrompt(requiredInfo) {
    const questions = [];

    if (requiredInfo.missingChannel) {
      questions.push({
        id: 'channel',
        label: 'Bạn muốn gửi qua kênh nào?',
        options: [
          { value: 'email', label: '📧 Email' },
          { value: 'zalo', label: '💬 Tin nhắn Zalo cá nhân' },
          { value: 'zalo_group', label: '👥 Nhóm Zalo' },
        ],
      });
    }
    
    if (requiredInfo.missingProductInfo) {
      questions.push({
        id: 'product_info',
        label: 'Bạn muốn giới thiệu sản phẩm/dịch vụ nào?',
        type: 'text',
        placeholder: 'VD: Khóa học lập trình Python, Dịch vụ tư vấn...',
      });
    }
      
    if (requiredInfo.missingContent) {
      questions.push({
        id: 'content',
        label: 'Bạn muốn nói gì trong tin nhắn?',
        type: 'textarea',
        placeholder: 'Mô tả nội dung hoặc mục tiêu chiến dịch...',
      });
    }

    if (requiredInfo.missingAudience) {
      questions.push({
        id: 'audience',
        label: 'Gửi đến đối tượng nào?',
        options: [
          { value: 'all', label: '👥 Tất cả khách hàng' },
          { value: 'interested', label: '✨ Khách hàng quan tâm' },
          { value: 'purchased', label: '💰 Khách hàng đã mua' },
        ],
      });
    }

    if (requiredInfo.missingSendingStyle) {
      questions.push({
        id: 'sending_style',
        label: 'Bạn muốn gửi như thế nào?',
        options: [
          { value: 'single', label: '📤 Gửi 1 lần là xong' },
          { value: 'drip', label: '📅 Gửi nhiều lần, cách nhau vài ngày (drip campaign)' },
        ],
      });
    }

    return questions;
  }
}

export default new CampaignNodeRegistryService();
