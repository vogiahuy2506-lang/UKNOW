/**
 * CampaignNodeRegistry Service
 *
 * Cung cấp thông tin về các node types cho AI một cách động.
 * AI sẽ dùng registry này để:
 * 1. Hiểu các node có sẵn trong hệ thống
 * 2. Tự động điền config cho các node
 * 3. Hỗ trợ multi-step trong 1 node (nhiều email/zalo cách nhau thời gian)
 */

class CampaignNodeRegistryService {
  constructor() {
    this.nodeTypes = this._buildNodeTypeRegistry();
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
            default: 'Sheet1',
            label: 'Tên Sheet',
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
          sheetName: 'Sheet1',
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
          zaloAccountNodeId: {
            type: 'string',
            required: true,
            label: 'Node chọn tài khoản Zalo',
            description: 'ID của node select_zalo_account phía trước',
          },
        },
        exampleConfig: {
          zaloAccountNodeId: '',
        },
      },

      get_all_groups: {
        nodeType: 'data',
        name: 'Lấy thông tin nhóm Zalo',
        description: 'Lấy danh sách nhóm từ tài khoản Zalo đã chọn',
        color: '#E3F2FD',
        configRequired: true,
        configSchema: {
          zaloAccountNodeId: {
            type: 'string',
            required: true,
            label: 'Node chọn tài khoản Zalo',
          },
        },
        exampleConfig: {
          zaloAccountNodeId: '',
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
            required: true,
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
            required: true,
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
              templateId: null,
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
            required: true,
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
              templateId: null,
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
    lines.push('  config: { "sheetUrl": "url", "sheetName": "Sheet1", "headerRow": 1, "dataStartRow": 2 }');
    lines.push('');
    lines.push('• nodeType: "data", nodeSubtype: "read_landing_leads"');
    lines.push('  config: {}');
    lines.push('');
    lines.push('• nodeType: "data", nodeSubtype: "select_zalo_account"');
    lines.push('  config: { "zaloAccountId": <ID> } (BẮT BUỘC trước get_all_friends/get_all_groups)');
    lines.push('');
    lines.push('• nodeType: "data", nodeSubtype: "get_all_friends"');
    lines.push('  config: { "zaloAccountNodeId": "<tempId_select_zalo_account>" }');
    lines.push('');
    lines.push('• nodeType: "data", nodeSubtype: "get_all_groups"');
    lines.push('  config: { "zaloAccountNodeId": "<tempId_select_zalo_account>" }');
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
    lines.push('★ NODE GỬI ZALO CÁ NHÂN - HỖ TRỢ NHIỀU TIN TRONG 1 NODE:');
    lines.push('• nodeType: "action", nodeSubtype: "send_zalo_personal"');
    lines.push('  config bắt buộc:');
    lines.push('    "zaloAccountId": <ID|null>');
    lines.push('    "zaloRecipientSource": "node"');
    lines.push('    "zaloRecipientNodeId": "<tempId>"');
    lines.push('    "zaloRecipientField": "phone"');
    lines.push('    "zaloPersonalTemplateSteps": [          ← ★ MẢNG - NHIỀU TIN TRONG 1 NODE');
    lines.push('      {');
    lines.push('        "templateId": <ID|null>,');
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

    // End
    lines.push('── END ──');
    lines.push('• nodeType: "end", nodeSubtype: "end"');
    lines.push('  config: {}');

    return lines.join('\n');
  }

  /**
   * Build ví dụ campaign với multi-step trong 1 node
   */
  buildMultiStepExample() {
    return `
════════════════════════════════════════
  VÍ DỤ: CAMPAIGN VỚI NHIỀU EMAIL TRONG 1 NODE
════════════════════════════════════════

Yêu cầu: Gửi 2 email - email chào hỏi ngay, email nhắc nhở sau 3 ngày

=== EMAIL (2 lần gửi TRONG 1 NODE) ===
{
  "campaignName": "Chiến dịch chào mừng khách hàng mới",
  "description": "Email chào hỏi + nhắc nhở sau 3 ngày",
  "campaignType": "email",
  "isAiDraft": true,
  "nodes": [
    { "tempId": "n1", "nodeType": "trigger", "nodeSubtype": "manual", "nodeName": "Bắt đầu", "positionX": 100, "positionY": 200, "config": {} },
    { "tempId": "n2", "nodeType": "data", "nodeSubtype": "interested_customers", "nodeName": "Danh sách khách", "positionX": 350, "positionY": 200, "config": { "interestedCustomerType": "both", "interestedLimit": 1000 } },
    { "tempId": "n3", "nodeType": "action", "nodeSubtype": "send_email", "nodeName": "Gửi email chào mừng", "positionX": 600, "positionY": 200,
      "config": {
        "recipientSource": "node",
        "recipientNodeId": "n2",
        "recipientField": "email",
        "fromEmailId": 1,
        "saveMessageLog": true,
        "emailSteps": [
          {
            "templateId": null,
            "emailSubject": "Chào bạn {{full_name}}! Ưu đãi đặc biệt dành cho bạn",
            "emailBody": "<h2>Xin chào {{full_name}},</h2><p>Cảm ơn bạn đã quan tâm đến sản phẩm của chúng tôi...</p>",
            "delayValue": 0,
            "delayUnit": "days",
            "enableLinkTracking": true,
            "templateMappings": [
              { "key": "full_name", "sourceType": "node", "nodeId": "n2", "field": "fullName" }
            ]
          },
          {
            "templateId": null,
            "emailSubject": "Nhắc nhở: Ưu đãi của bạn sắp hết hạn!",
            "emailBody": "<h2>Xin chào {{full_name}},</h2><p>Ưu đãi đặc biệt sắp hết hạn. Liên hệ ngay...</p>",
            "delayValue": 3,
            "delayUnit": "days",
            "enableLinkTracking": true,
            "templateMappings": [
              { "key": "full_name", "sourceType": "node", "nodeId": "n2", "field": "fullName" }
            ]
          }
        ]
      }
    },
    { "tempId": "n4", "nodeType": "end", "nodeSubtype": "end", "nodeName": "Kết thúc", "positionX": 850, "positionY": 200, "config": {} }
  ],
  "connections": [
    { "sourceNodeId": "n1", "targetNodeId": "n2" },
    { "sourceNodeId": "n2", "targetNodeId": "n3" },
    { "sourceNodeId": "n3", "targetNodeId": "n4" }
  ]
}

════════════════════════════════════════
  VÍ DỤ: CAMPAIGN VỚI NHIỀU TIN ZALO TRONG 1 NODE
════════════════════════════════════════

=== ZALO CÁ NHÂN (2 tin TRONG 1 NODE) ===
{
  "campaignName": "Chiến dịch Zalo chăm sóc khách",
  "campaignType": "zalo",
  "isAiDraft": true,
  "nodes": [
    { "tempId": "n1", "nodeType": "trigger", "nodeSubtype": "manual", "nodeName": "Bắt đầu", "positionX": 100, "positionY": 200, "config": {} },
    { "tempId": "n2", "nodeType": "data", "nodeSubtype": "interested_customers", "nodeName": "Danh sách khách", "positionX": 350, "positionY": 200, "config": { "interestedCustomerType": "both" } },
    { "tempId": "n3", "nodeType": "action", "nodeSubtype": "send_zalo_personal", "nodeName": "Gửi tin Zalo chăm sóc", "positionX": 600, "positionY": 200,
      "config": {
        "zaloAccountId": 1,
        "zaloRecipientSource": "node",
        "zaloRecipientNodeId": "n2",
        "zaloRecipientField": "phone",
        "zaloRecipientType": "phone",
        "saveMessageLog": true,
        "zaloPersonalTemplateSteps": [
          {
            "templateId": null,
            "message": "Xin chào {{full_name}}! Cảm ơn bạn đã quan tâm. Chúng tôi sẽ liên hệ sớm nhất!",
            "delayValue": 0,
            "delayUnit": "days",
            "enableLinkTracking": true,
            "templateMappings": [
              { "key": "full_name", "sourceType": "node", "nodeId": "n2", "field": "fullName" }
            ]
          },
          {
            "templateId": null,
            "message": "Nhắc nhở: Ưu đãi dành cho {{full_name}} sắp hết hạn. Liên hệ ngay!",
            "delayValue": 2,
            "delayUnit": "days",
            "enableLinkTracking": true,
            "templateMappings": [
              { "key": "full_name", "sourceType": "node", "nodeId": "n2", "field": "fullName" }
            ]
          }
        ]
      }
    },
    { "tempId": "n4", "nodeType": "end", "nodeSubtype": "end", "nodeName": "Kết thúc", "positionX": 850, "positionY": 200, "config": {} }
  ],
  "connections": [
    { "sourceNodeId": "n1", "targetNodeId": "n2" },
    { "sourceNodeId": "n2", "targetNodeId": "n3" },
    { "sourceNodeId": "n3", "targetNodeId": "n4" }
  ]
}
`;
  }

  /**
   * Validate config của một node - kiểm tra các trường bắt buộc
   */
  validateNodeConfig(subtype, config) {
    const nodeType = this.nodeTypes[subtype];
    if (!nodeType) {
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

    // Validate multi-step arrays
    if (nodeType.multiStep && nodeType.multiStepField) {
      const steps = config[nodeType.multiStepField];
      if (!Array.isArray(steps) || steps.length === 0) {
        errors.push(`${nodeType.multiStepField} phải là mảng và có ít nhất 1 phần tử`);
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

  /**
   * Build template selection logic prompt
   * Hướng dẫn AI cách ưu tiên template có sẵn hoặc tạo mới
   */
  buildTemplateSelectionPrompt(existingTemplates) {
    const { emailTemplates = [], zaloTemplates = [] } = existingTemplates;

    // Format email templates
    let emailTemplatesSection = '📧 Email templates: chưa có';
    if (emailTemplates.length > 0) {
      const emailList = emailTemplates.map(t => `  - ID: ${t.id} | "${t.name}" | Subject: ${t.subject}`).join('\n');
      emailTemplatesSection = `📧 EMAIL TEMPLATES:\n${emailList}`;
    }

    // Format Zalo templates
    let zaloTemplatesSection = '💬 Zalo templates: chưa có';
    if (zaloTemplates.length > 0) {
      const zaloList = zaloTemplates.map(t => `  - ID: ${t.id} | "${t.name}" | Preview: ${(t.bodyText || '').slice(0, 60)}...`).join('\n');
      zaloTemplatesSection = `💬 ZALO TEMPLATES:\n${zaloList}`;
    }

    return `
════════════════════════════════════════
  LUẬT CHỌN/GỬI TEMPLATE (QUAN TRỌNG)
════════════════════════════════════════

## BƯỚC 1: KIỂM TRA TEMPLATE CÓ SẴN

Nếu có template phù hợp trong danh sách bên dưới → DÙNG TEMPLATE ĐÓ:

${emailTemplatesSection}

${zaloTemplatesSection}

## BƯỚC 2: CÁCH GẮN TEMPLATE VÀO NODE

### KHI DÙNG TEMPLATE (templateId != null):
{
  "templateId": 123,           // ← ID template có sẵn
  "emailSubject": "",          // ← ĐỂ TRỐNG (lấy từ template)
  "emailBody": "",             // ← ĐỂ TRỐNG (lấy từ template)
  "templateMappings": [
    { "key": "full_name", "sourceType": "node", "nodeId": "n2", "field": "fullName" },
    { "key": "product_name", "sourceType": "manual", "value": "Khóa học Python" }
  ]
}

### KHI TỰ TẠO NỘI DUNG (templateId = null):
{
  "templateId": null,          // ← KHÔNG dùng template
  "emailSubject": "Chào bạn {{full_name}}! Ưu đãi đặc biệt hôm nay",
  "emailBody": "<h2>Xin chào {{full_name}},</h2><p>Cảm ơn bạn đã quan tâm đến sản phẩm...</p>",
  "templateMappings": [
    { "key": "full_name", "sourceType": "node", "nodeId": "n2", "field": "fullName" }
  ]
}

## BƯỚC 3: QUY TẮC QUAN TRỌNG

1. Luôn ưu tiên template có sẵn nếu phù hợp với mục tiêu chiến dịch
2. Nếu KHÔNG có template phù hợp → tự soạn nội dung inline
3. Nội dung inline PHẢI có:
   - Email: emailSubject + emailBody (HTML đẹp, có CTA)
   - Zalo: message (dưới 4000 ký tự, có biến {{variable}})
4. Luôn thêm templateMappings cho các biến động như {{full_name}}, {{product_name}}
5. KHÔNG dùng placeholder như "[TÊN_SẢN_PHẨM]" - phải điền thực

## VÍ DỤ ĐẦY ĐỦ:

{
  "emailSteps": [
    {
      "templateId": 1,  // ← Dùng template có sẵn
      "emailSubject": "",
      "emailBody": "",
      "templateMappings": [
        { "key": "full_name", "sourceType": "node", "nodeId": "n2", "field": "fullName" }
      ],
      "delayValue": 0,
      "delayUnit": "days"
    },
    {
      "templateId": null,  // ← Tự tạo vì không có template phù hợp
      "emailSubject": "Nhắc nhở: Ưu đãi của bạn sắp hết hạn!",
      "emailBody": "<h2>Xin chào {{full_name}},</h2><p>Ưu đãi đặc biệt dành cho bạn sắp hết hạn. Liên hệ ngay!</p>",
      "templateMappings": [
        { "key": "full_name", "sourceType": "node", "nodeId": "n2", "field": "fullName" }
      ],
      "delayValue": 3,
      "delayUnit": "days"
    }
  ]
}
`;
  }
}

export default new CampaignNodeRegistryService();
