/**
 * Campaign Compiler (Giai đoạn 2 & 3 - Intent Compiler)
 *
 * Nhiệm vụ: Chuyển đổi CampaignIntentV1 thành đồ thị thực thi hoàn chỉnh (nodes, connections, contentSlots).
 * Đặc điểm cốt lõi:
 * 1. Hàm thuần túy (pure function), đồng bộ, không I/O.
 * 2. Tất định 100%: Cùng một intent luôn sinh ra chính xác cùng một graph.
 * 3. Xuất camelCase (nodeType, nodeSubtype, nodeName, nodeDescription, positionX, positionY, config)
 *    khớp đúng contract của insertNodeTx, updateCampaign và aiCampaignDraft.service.js.
 * 4. Hỗ trợ đầy đủ các kênh: Email, Zalo cá nhân, Zalo nhóm (Once & Drip).
 * 5. Graph gọn, không sinh node End thừa (khớp đa số campaign và chuẩn runtime).
 */

import { isCompilableIntent } from './campaignIntent.schema.js';

/**
 * Biên dịch CampaignIntentV1 thành đồ thị chiến dịch.
 *
 * @param {object} intent - Đối tượng CampaignIntentV1
 * @param {object} [options] - Tuỳ chọn biên dịch (deterministic IDs, etc.)
 * @returns {{ nodes: Array<object>, connections: Array<object>, contentSlots: Array<object> }}
 */
export function compileCampaign(intent, options = {}) {
  const check = isCompilableIntent(intent);
  if (!check.ok) {
    const error = new Error(`Cannot compile incomplete intent: missing ${check.missing.join(', ')}`);
    error.code = 'INTENT_INCOMPLETE';
    error.missing = check.missing;
    throw error;
  }

  const { channel, schedule, sender, audience, contentBrief = {} } = intent;

  // Luồng 1 & 2: Email (Once & Drip)
  if (channel === 'email') {
    if (schedule.type === 'once') {
      return compileEmailOnceCampaign({ sender, audience, contentBrief, options });
    }
    if (schedule.type === 'drip') {
      return compileEmailDripCampaign({ sender, audience, schedule, contentBrief, options });
    }
  }

  // Luồng 3: Zalo cá nhân (Once & Drip)
  if (channel === 'zalo') {
    if (schedule.type === 'once') {
      return compileZaloPersonalOnceCampaign({ sender, audience, contentBrief, options });
    }
    if (schedule.type === 'drip') {
      return compileZaloPersonalDripCampaign({ sender, audience, schedule, contentBrief, options });
    }
  }

  // Luồng 4: Zalo nhóm (Once & Drip)
  if (channel === 'zalo_group') {
    if (schedule.type === 'once') {
      return compileZaloGroupOnceCampaign({ sender, audience, contentBrief, options });
    }
    if (schedule.type === 'drip') {
      return compileZaloGroupDripCampaign({ sender, audience, schedule, contentBrief, options });
    }
  }

  throw new Error(`Unsupported compiler channel/schedule combination: channel="${channel}", schedule="${schedule?.type}"`);
}

/**
 * Biên dịch luồng Email gửi một lần (Email Once).
 * Graph: Trigger -> Audience -> Send Email
 */
function compileEmailOnceCampaign({ sender, audience, contentBrief, options = {} }) {
  const prefix = options.idPrefix || 'node';
  const triggerId = `${prefix}_trigger_1`;
  const sendEmailId = `${prefix}_send_email_1`;

  const nodes = [];
  const connections = [];
  const contentSlots = [];

  // 1. Trigger Node
  nodes.push({
    id: triggerId,
    tempId: triggerId,
    nodeType: 'trigger',
    nodeSubtype: 'manual',
    nodeName: 'Bắt đầu (Manual Trigger)',
    nodeDescription: 'Khởi chạy chiến dịch thủ công',
    positionX: 100,
    positionY: 200,
    config: {},
  });

  // 2. Audience Node
  let audienceNodeId = null;
  if (audience.type === 'sheet') {
    audienceNodeId = `${prefix}_read_sheet_1`;
    nodes.push({
      id: audienceNodeId,
      tempId: audienceNodeId,
      nodeType: 'data',
      nodeSubtype: 'read_sheet',
      nodeName: 'Đọc dữ liệu Google Sheet',
      nodeDescription: 'Đọc danh sách khách từ Google Sheet hoặc Excel',
      positionX: 350,
      positionY: 200,
      config: {
        sheetUrl: audience.url || '',
        sheetName: '',
        headerRow: 1,
        dataStartRow: 2,
        dataSelectedColumns: [],
      },
    });
  } else if (audience.type === 'db') {
    audienceNodeId = `${prefix}_interested_customers_1`;
    nodes.push({
      id: audienceNodeId,
      tempId: audienceNodeId,
      nodeType: 'data',
      nodeSubtype: 'interested_customers',
      nodeName: 'Lấy dữ liệu khách hàng',
      nodeDescription: 'Lấy danh sách khách hàng từ database hệ thống',
      positionX: 350,
      positionY: 200,
      config: {
        interestedCustomerType: 'both',
        interestedLimit: 1000,
      },
    });
  } else if (audience.type === 'landing') {
    audienceNodeId = `${prefix}_read_landing_leads_1`;
    nodes.push({
      id: audienceNodeId,
      tempId: audienceNodeId,
      nodeType: 'data',
      nodeSubtype: 'read_landing_leads',
      nodeName: 'Dữ liệu Landing Page',
      nodeDescription: 'Lấy leads từ form đăng ký landing page',
      positionX: 350,
      positionY: 200,
      config: {
        landingPageSlugs: Array.isArray(audience.slugs) ? audience.slugs : [],
      },
    });
  }

  // 3. Send Email Node
  const recipientSource = audienceNodeId ? 'node' : 'manual';
  const sendEmailPosX = audienceNodeId ? 600 : 350;
  nodes.push({
    id: sendEmailId,
    tempId: sendEmailId,
    nodeType: 'action',
    nodeSubtype: 'send_email',
    nodeName: 'Gửi Email',
    nodeDescription: 'Gửi email theo template',
    positionX: sendEmailPosX,
    positionY: 200,
    config: {
      fromEmailId: Number(sender.id),
      recipientSource,
      recipientNodeId: audienceNodeId || '',
      recipientField: 'email',
      ccEnabled: false,
      saveMessageLog: true,
      emailSteps: [
        {
          templateId: null,
          emailSubject: '',
          emailBody: '',
          delayValue: 0,
          delayUnit: 'days',
          delayFrom: 'start',
          enableLinkTracking: true,
          templateMappings: [],
        },
      ],
    },
  });

  // 4. Connections
  if (audienceNodeId) {
    connections.push({
      sourceNodeId: triggerId,
      targetNodeId: audienceNodeId,
      connectionType: 'default',
      connectionLabel: '',
      sourceHandle: 'default_out',
      targetHandle: 'default_in',
    });
    connections.push({
      sourceNodeId: audienceNodeId,
      targetNodeId: sendEmailId,
      connectionType: 'default',
      connectionLabel: '',
      sourceHandle: 'default_out',
      targetHandle: 'default_in',
    });
  } else {
    connections.push({
      sourceNodeId: triggerId,
      targetNodeId: sendEmailId,
      connectionType: 'default',
      connectionLabel: '',
      sourceHandle: 'default_out',
      targetHandle: 'default_in',
    });
  }

  // 5. Content Slot
  contentSlots.push({
    slotId: `${sendEmailId}_step_0`,
    nodeId: sendEmailId,
    channel: 'email',
    stepIndex: 0,
    day: 1,
    type: 'email',
    brief: contentBrief,
  });

  return {
    nodes,
    connections,
    contentSlots,
  };
}

/**
 * Biên dịch luồng Email Drip nhiều ngày.
 * Graph: Trigger -> Audience -> Send Email Drip
 */
function compileEmailDripCampaign({ sender, audience, schedule, contentBrief, options = {} }) {
  const prefix = options.idPrefix || 'node';
  const triggerId = `${prefix}_trigger_1`;
  const sendEmailId = `${prefix}_send_email_1`;

  const nodes = [];
  const connections = [];
  const contentSlots = [];

  // Trigger
  nodes.push({
    id: triggerId,
    tempId: triggerId,
    nodeType: 'trigger',
    nodeSubtype: 'manual',
    nodeName: 'Bắt đầu (Manual Trigger)',
    nodeDescription: 'Khởi chạy chiến dịch thủ công',
    positionX: 100,
    positionY: 200,
    config: {},
  });

  // Audience
  let audienceNodeId = null;
  if (audience.type === 'sheet') {
    audienceNodeId = `${prefix}_read_sheet_1`;
    nodes.push({
      id: audienceNodeId,
      tempId: audienceNodeId,
      nodeType: 'data',
      nodeSubtype: 'read_sheet',
      nodeName: 'Đọc dữ liệu Google Sheet',
      nodeDescription: 'Đọc danh sách khách từ Google Sheet hoặc Excel',
      positionX: 350,
      positionY: 200,
      config: {
        sheetUrl: audience.url || '',
        sheetName: '',
        headerRow: 1,
        dataStartRow: 2,
        dataSelectedColumns: [],
      },
    });
  } else if (audience.type === 'db') {
    audienceNodeId = `${prefix}_interested_customers_1`;
    nodes.push({
      id: audienceNodeId,
      tempId: audienceNodeId,
      nodeType: 'data',
      nodeSubtype: 'interested_customers',
      nodeName: 'Lấy dữ liệu khách hàng',
      nodeDescription: 'Lấy danh sách khách hàng từ database hệ thống',
      positionX: 350,
      positionY: 200,
      config: {
        interestedCustomerType: 'both',
        interestedLimit: 1000,
      },
    });
  } else if (audience.type === 'landing') {
    audienceNodeId = `${prefix}_read_landing_leads_1`;
    nodes.push({
      id: audienceNodeId,
      tempId: audienceNodeId,
      nodeType: 'data',
      nodeSubtype: 'read_landing_leads',
      nodeName: 'Dữ liệu Landing Page',
      nodeDescription: 'Lấy leads từ form đăng ký landing page',
      positionX: 350,
      positionY: 200,
      config: {
        landingPageSlugs: Array.isArray(audience.slugs) ? audience.slugs : [],
      },
    });
  }

  // Drip Steps
  const totalDays = Math.max(1, Number(schedule.days) || 1);
  const slotsPerDay = Math.max(1, Number(schedule.slotsPerDay) || 1);
  const emailSteps = [];

  let stepIdx = 0;
  for (let day = 1; day <= totalDays; day++) {
    for (let slot = 1; slot <= slotsPerDay; slot++) {
      const delayValue = day === 1 && slot === 1 ? 0 : 1;
      const delayUnit = 'days';
      emailSteps.push({
        templateId: null,
        emailSubject: '',
        emailBody: '',
        delayValue,
        delayUnit,
        delayFrom: 'prev',
        enableLinkTracking: true,
        templateMappings: [],
      });

      contentSlots.push({
        slotId: `${sendEmailId}_step_${stepIdx}`,
        nodeId: sendEmailId,
        channel: 'email',
        stepIndex: stepIdx,
        day,
        slot,
        type: 'email',
        brief: contentBrief,
      });

      stepIdx++;
    }
  }

  const recipientSource = audienceNodeId ? 'node' : 'manual';
  const sendEmailPosX = audienceNodeId ? 600 : 350;
  nodes.push({
    id: sendEmailId,
    tempId: sendEmailId,
    nodeType: 'action',
    nodeSubtype: 'send_email',
    nodeName: 'Gửi Email Drip',
    nodeDescription: 'Chuỗi email tự động theo thời gian',
    positionX: sendEmailPosX,
    positionY: 200,
    config: {
      fromEmailId: Number(sender.id),
      recipientSource,
      recipientNodeId: audienceNodeId || '',
      recipientField: 'email',
      ccEnabled: false,
      saveMessageLog: true,
      emailSteps,
    },
  });

  if (audienceNodeId) {
    connections.push({
      sourceNodeId: triggerId,
      targetNodeId: audienceNodeId,
      connectionType: 'default',
      connectionLabel: '',
      sourceHandle: 'default_out',
      targetHandle: 'default_in',
    });
    connections.push({
      sourceNodeId: audienceNodeId,
      targetNodeId: sendEmailId,
      connectionType: 'default',
      connectionLabel: '',
      sourceHandle: 'default_out',
      targetHandle: 'default_in',
    });
  } else {
    connections.push({
      sourceNodeId: triggerId,
      targetNodeId: sendEmailId,
      connectionType: 'default',
      connectionLabel: '',
      sourceHandle: 'default_out',
      targetHandle: 'default_in',
    });
  }

  return {
    nodes,
    connections,
    contentSlots,
  };
}

/**
 * Biên dịch luồng Zalo cá nhân gửi một lần (Zalo Personal Once).
 * Graph: Trigger -> select_zalo_account -> Audience -> send_zalo_personal
 */
function compileZaloPersonalOnceCampaign({ sender, audience, contentBrief, options = {} }) {
  const prefix = options.idPrefix || 'node';
  const triggerId = `${prefix}_trigger_1`;
  const selectAccountId = `${prefix}_select_zalo_1`;
  const sendZaloId = `${prefix}_send_zalo_personal_1`;

  const nodes = [];
  const connections = [];
  const contentSlots = [];

  // 1. Trigger Node
  nodes.push({
    id: triggerId,
    tempId: triggerId,
    nodeType: 'trigger',
    nodeSubtype: 'manual',
    nodeName: 'Bắt đầu (Manual Trigger)',
    nodeDescription: 'Khởi chạy chiến dịch thủ công',
    positionX: 100,
    positionY: 200,
    config: {},
  });

  // 2. Select Zalo Account Node
  nodes.push({
    id: selectAccountId,
    tempId: selectAccountId,
    nodeType: 'data',
    nodeSubtype: 'select_zalo_account',
    nodeName: 'Chọn tài khoản Zalo',
    nodeDescription: 'Chọn tài khoản Zalo để gửi tin nhắn',
    positionX: 300,
    positionY: 200,
    config: {
      zaloAccountId: Number(sender.id),
      zaloPoolMultiAccountEnabled: false,
    },
  });

  // 3. Audience Node
  let audienceNodeId = null;
  let recipientField = 'phone';
  let recipientType = 'phone';

  if (audience.type === 'zalo_contacts') {
    audienceNodeId = `${prefix}_get_all_friends_1`;
    recipientField = 'uid';
    recipientType = 'uid';
    nodes.push({
      id: audienceNodeId,
      tempId: audienceNodeId,
      nodeType: 'data',
      nodeSubtype: 'get_all_friends',
      nodeName: 'Lấy danh sách bạn bè Zalo',
      nodeDescription: 'Lấy danh sách bạn bè từ tài khoản Zalo đã chọn',
      positionX: 500,
      positionY: 200,
      config: {
        zaloFriendAccountNodeId: selectAccountId,
      },
    });
  } else if (audience.type === 'sheet') {
    audienceNodeId = `${prefix}_read_sheet_1`;
    nodes.push({
      id: audienceNodeId,
      tempId: audienceNodeId,
      nodeType: 'data',
      nodeSubtype: 'read_sheet',
      nodeName: 'Đọc dữ liệu Google Sheet',
      nodeDescription: 'Đọc danh sách khách từ Google Sheet hoặc Excel',
      positionX: 500,
      positionY: 200,
      config: {
        sheetUrl: audience.url || '',
        sheetName: '',
        headerRow: 1,
        dataStartRow: 2,
        dataSelectedColumns: [],
      },
    });
  } else if (audience.type === 'db') {
    audienceNodeId = `${prefix}_interested_customers_1`;
    nodes.push({
      id: audienceNodeId,
      tempId: audienceNodeId,
      nodeType: 'data',
      nodeSubtype: 'interested_customers',
      nodeName: 'Lấy dữ liệu khách hàng',
      nodeDescription: 'Lấy danh sách khách hàng từ database hệ thống',
      positionX: 500,
      positionY: 200,
      config: {
        interestedCustomerType: 'both',
        interestedLimit: 1000,
      },
    });
  } else if (audience.type === 'landing') {
    audienceNodeId = `${prefix}_read_landing_leads_1`;
    nodes.push({
      id: audienceNodeId,
      tempId: audienceNodeId,
      nodeType: 'data',
      nodeSubtype: 'read_landing_leads',
      nodeName: 'Dữ liệu Landing Page',
      nodeDescription: 'Lấy leads từ form đăng ký landing page',
      positionX: 500,
      positionY: 200,
      config: {
        landingPageSlugs: Array.isArray(audience.slugs) ? audience.slugs : [],
      },
    });
  }

  // 4. Send Zalo Personal Node
  const recipientSource = audienceNodeId ? 'node' : 'manual';
  const sendZaloPosX = audienceNodeId ? 750 : 500;
  nodes.push({
    id: sendZaloId,
    tempId: sendZaloId,
    nodeType: 'action',
    nodeSubtype: 'send_zalo_personal',
    nodeName: 'Gửi tin nhắn Zalo cá nhân',
    nodeDescription: 'Gửi tin nhắn Zalo đến số điện thoại/bạn bè',
    positionX: sendZaloPosX,
    positionY: 200,
    config: {
      zaloAccountId: Number(sender.id),
      zaloRecipientSource: recipientSource,
      zaloRecipientNodeId: audienceNodeId || '',
      zaloRecipientField: recipientField,
      zaloRecipientType: recipientType,
      zaloPersonalSendMode: 'all',
      saveMessageLog: true,
      zaloPersonalTemplateSteps: [
        {
          templateId: null,
          message: '',
          delayValue: 0,
          delayUnit: 'days',
          enableLinkTracking: true,
          templateMappings: [],
        },
      ],
    },
  });

  // 5. Connections
  connections.push({
    sourceNodeId: triggerId,
    targetNodeId: selectAccountId,
    connectionType: 'default',
    connectionLabel: '',
    sourceHandle: 'default_out',
    targetHandle: 'default_in',
  });

  if (audienceNodeId) {
    connections.push({
      sourceNodeId: selectAccountId,
      targetNodeId: audienceNodeId,
      connectionType: 'default',
      connectionLabel: '',
      sourceHandle: 'default_out',
      targetHandle: 'default_in',
    });
    connections.push({
      sourceNodeId: audienceNodeId,
      targetNodeId: sendZaloId,
      connectionType: 'default',
      connectionLabel: '',
      sourceHandle: 'default_out',
      targetHandle: 'default_in',
    });
  } else {
    connections.push({
      sourceNodeId: selectAccountId,
      targetNodeId: sendZaloId,
      connectionType: 'default',
      connectionLabel: '',
      sourceHandle: 'default_out',
      targetHandle: 'default_in',
    });
  }

  // 6. Content Slot
  contentSlots.push({
    slotId: `${sendZaloId}_step_0`,
    nodeId: sendZaloId,
    channel: 'zalo',
    stepIndex: 0,
    day: 1,
    type: 'zalo',
    brief: contentBrief,
  });

  return {
    nodes,
    connections,
    contentSlots,
  };
}

/**
 * Biên dịch luồng Zalo cá nhân Drip nhiều ngày.
 * Graph: Trigger -> select_zalo_account -> Audience -> send_zalo_personal
 */
function compileZaloPersonalDripCampaign({ sender, audience, schedule, contentBrief, options = {} }) {
  const prefix = options.idPrefix || 'node';
  const triggerId = `${prefix}_trigger_1`;
  const selectAccountId = `${prefix}_select_zalo_1`;
  const sendZaloId = `${prefix}_send_zalo_personal_1`;

  const nodes = [];
  const connections = [];
  const contentSlots = [];

  // Trigger
  nodes.push({
    id: triggerId,
    tempId: triggerId,
    nodeType: 'trigger',
    nodeSubtype: 'manual',
    nodeName: 'Bắt đầu (Manual Trigger)',
    nodeDescription: 'Khởi chạy chiến dịch thủ công',
    positionX: 100,
    positionY: 200,
    config: {},
  });

  // Select Account
  nodes.push({
    id: selectAccountId,
    tempId: selectAccountId,
    nodeType: 'data',
    nodeSubtype: 'select_zalo_account',
    nodeName: 'Chọn tài khoản Zalo',
    nodeDescription: 'Chọn tài khoản Zalo để gửi tin nhắn',
    positionX: 300,
    positionY: 200,
    config: {
      zaloAccountId: Number(sender.id),
      zaloPoolMultiAccountEnabled: false,
    },
  });

  // Audience
  let audienceNodeId = null;
  let recipientField = 'phone';
  let recipientType = 'phone';

  if (audience.type === 'zalo_contacts') {
    audienceNodeId = `${prefix}_get_all_friends_1`;
    recipientField = 'uid';
    recipientType = 'uid';
    nodes.push({
      id: audienceNodeId,
      tempId: audienceNodeId,
      nodeType: 'data',
      nodeSubtype: 'get_all_friends',
      nodeName: 'Lấy danh sách bạn bè Zalo',
      nodeDescription: 'Lấy danh sách bạn bè từ tài khoản Zalo đã chọn',
      positionX: 500,
      positionY: 200,
      config: {
        zaloFriendAccountNodeId: selectAccountId,
      },
    });
  } else if (audience.type === 'sheet') {
    audienceNodeId = `${prefix}_read_sheet_1`;
    nodes.push({
      id: audienceNodeId,
      tempId: audienceNodeId,
      nodeType: 'data',
      nodeSubtype: 'read_sheet',
      nodeName: 'Đọc dữ liệu Google Sheet',
      nodeDescription: 'Đọc danh sách khách từ Google Sheet hoặc Excel',
      positionX: 500,
      positionY: 200,
      config: {
        sheetUrl: audience.url || '',
        sheetName: '',
        headerRow: 1,
        dataStartRow: 2,
        dataSelectedColumns: [],
      },
    });
  } else if (audience.type === 'db') {
    audienceNodeId = `${prefix}_interested_customers_1`;
    nodes.push({
      id: audienceNodeId,
      tempId: audienceNodeId,
      nodeType: 'data',
      nodeSubtype: 'interested_customers',
      nodeName: 'Lấy dữ liệu khách hàng',
      nodeDescription: 'Lấy danh sách khách hàng từ database hệ thống',
      positionX: 500,
      positionY: 200,
      config: {
        interestedCustomerType: 'both',
        interestedLimit: 1000,
      },
    });
  } else if (audience.type === 'landing') {
    audienceNodeId = `${prefix}_read_landing_leads_1`;
    nodes.push({
      id: audienceNodeId,
      tempId: audienceNodeId,
      nodeType: 'data',
      nodeSubtype: 'read_landing_leads',
      nodeName: 'Dữ liệu Landing Page',
      nodeDescription: 'Lấy leads từ form đăng ký landing page',
      positionX: 500,
      positionY: 200,
      config: {
        landingPageSlugs: Array.isArray(audience.slugs) ? audience.slugs : [],
      },
    });
  }

  // Drip Steps
  const totalDays = Math.max(1, Number(schedule.days) || 1);
  const slotsPerDay = Math.max(1, Number(schedule.slotsPerDay) || 1);
  const zaloPersonalTemplateSteps = [];

  let stepIdx = 0;
  for (let day = 1; day <= totalDays; day++) {
    for (let slot = 1; slot <= slotsPerDay; slot++) {
      const delayValue = day === 1 && slot === 1 ? 0 : 1;
      const delayUnit = 'days';
      zaloPersonalTemplateSteps.push({
        templateId: null,
        message: '',
        delayValue,
        delayUnit,
        enableLinkTracking: true,
        templateMappings: [],
      });

      contentSlots.push({
        slotId: `${sendZaloId}_step_${stepIdx}`,
        nodeId: sendZaloId,
        channel: 'zalo',
        stepIndex: stepIdx,
        day,
        slot,
        type: 'zalo',
        brief: contentBrief,
      });

      stepIdx++;
    }
  }

  const recipientSource = audienceNodeId ? 'node' : 'manual';
  const sendZaloPosX = audienceNodeId ? 750 : 500;
  nodes.push({
    id: sendZaloId,
    tempId: sendZaloId,
    nodeType: 'action',
    nodeSubtype: 'send_zalo_personal',
    nodeName: 'Gửi tin nhắn Zalo cá nhân Drip',
    nodeDescription: 'Chuỗi tin nhắn Zalo tự động theo thời gian',
    positionX: sendZaloPosX,
    positionY: 200,
    config: {
      zaloAccountId: Number(sender.id),
      zaloRecipientSource: recipientSource,
      zaloRecipientNodeId: audienceNodeId || '',
      zaloRecipientField: recipientField,
      zaloRecipientType: recipientType,
      zaloPersonalSendMode: 'schedule',
      saveMessageLog: true,
      zaloPersonalTemplateSteps,
    },
  });

  connections.push({
    sourceNodeId: triggerId,
    targetNodeId: selectAccountId,
    connectionType: 'default',
    connectionLabel: '',
    sourceHandle: 'default_out',
    targetHandle: 'default_in',
  });

  if (audienceNodeId) {
    connections.push({
      sourceNodeId: selectAccountId,
      targetNodeId: audienceNodeId,
      connectionType: 'default',
      connectionLabel: '',
      sourceHandle: 'default_out',
      targetHandle: 'default_in',
    });
    connections.push({
      sourceNodeId: audienceNodeId,
      targetNodeId: sendZaloId,
      connectionType: 'default',
      connectionLabel: '',
      sourceHandle: 'default_out',
      targetHandle: 'default_in',
    });
  } else {
    connections.push({
      sourceNodeId: selectAccountId,
      targetNodeId: sendZaloId,
      connectionType: 'default',
      connectionLabel: '',
      sourceHandle: 'default_out',
      targetHandle: 'default_in',
    });
  }

  return {
    nodes,
    connections,
    contentSlots,
  };
}

/**
 * Biên dịch luồng Zalo nhóm gửi một lần (Zalo Group Once).
 * Graph: Trigger -> select_zalo_account -> get_all_groups -> send_zalo_group
 */
function compileZaloGroupOnceCampaign({ sender, audience, contentBrief, options = {} }) {
  const prefix = options.idPrefix || 'node';
  const triggerId = `${prefix}_trigger_1`;
  const selectAccountId = `${prefix}_select_zalo_1`;
  const groupAudienceId = `${prefix}_get_all_groups_1`;
  const sendGroupId = `${prefix}_send_zalo_group_1`;

  const nodes = [];
  const connections = [];
  const contentSlots = [];

  // 1. Trigger
  nodes.push({
    id: triggerId,
    tempId: triggerId,
    nodeType: 'trigger',
    nodeSubtype: 'manual',
    nodeName: 'Bắt đầu (Manual Trigger)',
    nodeDescription: 'Khởi chạy chiến dịch thủ công',
    positionX: 100,
    positionY: 200,
    config: {},
  });

  // 2. Select Zalo Account
  nodes.push({
    id: selectAccountId,
    tempId: selectAccountId,
    nodeType: 'data',
    nodeSubtype: 'select_zalo_account',
    nodeName: 'Chọn tài khoản Zalo',
    nodeDescription: 'Chọn tài khoản Zalo quản lý nhóm',
    positionX: 300,
    positionY: 200,
    config: {
      zaloAccountId: Number(sender.id),
      zaloPoolMultiAccountEnabled: false,
    },
  });

  // 3. Get All Groups Node
  nodes.push({
    id: groupAudienceId,
    tempId: groupAudienceId,
    nodeType: 'data',
    nodeSubtype: 'get_all_groups',
    nodeName: 'Lấy thông tin nhóm Zalo',
    nodeDescription: 'Lấy danh sách nhóm từ tài khoản Zalo đã chọn',
    positionX: 500,
    positionY: 200,
    config: {
      zaloGroupAccountNodeId: selectAccountId,
    },
  });

  // 4. Send Zalo Group Node
  nodes.push({
    id: sendGroupId,
    tempId: sendGroupId,
    nodeType: 'action',
    nodeSubtype: 'send_zalo_group',
    nodeName: 'Gửi tin nhắn nhóm Zalo',
    nodeDescription: 'Gửi tin nhắn Zalo đến danh sách nhóm',
    positionX: 750,
    positionY: 200,
    config: {
      zaloAccountId: Number(sender.id),
      zaloGroupSource: 'node',
      zaloGroupNodeId: groupAudienceId,
      zaloGroupField: 'groupId',
      saveMessageLog: true,
      zaloGroupTemplateSteps: [
        {
          templateId: null,
          message: '',
          delayValue: 0,
          delayUnit: 'days',
          templateMappings: [],
        },
      ],
    },
  });

  // 5. Connections
  connections.push({
    sourceNodeId: triggerId,
    targetNodeId: selectAccountId,
    connectionType: 'default',
    connectionLabel: '',
    sourceHandle: 'default_out',
    targetHandle: 'default_in',
  });
  connections.push({
    sourceNodeId: selectAccountId,
    targetNodeId: groupAudienceId,
    connectionType: 'default',
    connectionLabel: '',
    sourceHandle: 'default_out',
    targetHandle: 'default_in',
  });
  connections.push({
    sourceNodeId: groupAudienceId,
    targetNodeId: sendGroupId,
    connectionType: 'default',
    connectionLabel: '',
    sourceHandle: 'default_out',
    targetHandle: 'default_in',
  });

  // 6. Content Slot
  contentSlots.push({
    slotId: `${sendGroupId}_step_0`,
    nodeId: sendGroupId,
    channel: 'zalo_group',
    stepIndex: 0,
    day: 1,
    type: 'zalo',
    brief: contentBrief,
  });

  return {
    nodes,
    connections,
    contentSlots,
  };
}

/**
 * Biên dịch luồng Zalo nhóm Drip nhiều ngày.
 * Graph: Trigger -> select_zalo_account -> get_all_groups -> send_zalo_group
 */
function compileZaloGroupDripCampaign({ sender, audience, schedule, contentBrief, options = {} }) {
  const prefix = options.idPrefix || 'node';
  const triggerId = `${prefix}_trigger_1`;
  const selectAccountId = `${prefix}_select_zalo_1`;
  const groupAudienceId = `${prefix}_get_all_groups_1`;
  const sendGroupId = `${prefix}_send_zalo_group_1`;

  const nodes = [];
  const connections = [];
  const contentSlots = [];

  nodes.push({
    id: triggerId,
    tempId: triggerId,
    nodeType: 'trigger',
    nodeSubtype: 'manual',
    nodeName: 'Bắt đầu (Manual Trigger)',
    nodeDescription: 'Khởi chạy chiến dịch thủ công',
    positionX: 100,
    positionY: 200,
    config: {},
  });

  nodes.push({
    id: selectAccountId,
    tempId: selectAccountId,
    nodeType: 'data',
    nodeSubtype: 'select_zalo_account',
    nodeName: 'Chọn tài khoản Zalo',
    nodeDescription: 'Chọn tài khoản Zalo quản lý nhóm',
    positionX: 300,
    positionY: 200,
    config: {
      zaloAccountId: Number(sender.id),
      zaloPoolMultiAccountEnabled: false,
    },
  });

  nodes.push({
    id: groupAudienceId,
    tempId: groupAudienceId,
    nodeType: 'data',
    nodeSubtype: 'get_all_groups',
    nodeName: 'Lấy thông tin nhóm Zalo',
    nodeDescription: 'Lấy danh sách nhóm từ tài khoản Zalo đã chọn',
    positionX: 500,
    positionY: 200,
    config: {
      zaloGroupAccountNodeId: selectAccountId,
    },
  });

  const totalDays = Math.max(1, Number(schedule.days) || 1);
  const slotsPerDay = Math.max(1, Number(schedule.slotsPerDay) || 1);
  const zaloGroupTemplateSteps = [];

  let stepIdx = 0;
  for (let day = 1; day <= totalDays; day++) {
    for (let slot = 1; slot <= slotsPerDay; slot++) {
      const delayValue = day === 1 && slot === 1 ? 0 : 1;
      const delayUnit = 'days';
      zaloGroupTemplateSteps.push({
        templateId: null,
        message: '',
        delayValue,
        delayUnit,
        templateMappings: [],
      });

      contentSlots.push({
        slotId: `${sendGroupId}_step_${stepIdx}`,
        nodeId: sendGroupId,
        channel: 'zalo_group',
        stepIndex: stepIdx,
        day,
        slot,
        type: 'zalo',
        brief: contentBrief,
      });

      stepIdx++;
    }
  }

  nodes.push({
    id: sendGroupId,
    tempId: sendGroupId,
    nodeType: 'action',
    nodeSubtype: 'send_zalo_group',
    nodeName: 'Gửi tin nhắn nhóm Zalo Drip',
    nodeDescription: 'Chuỗi thông báo nhóm Zalo theo thời gian',
    positionX: 750,
    positionY: 200,
    config: {
      zaloAccountId: Number(sender.id),
      zaloGroupSource: 'node',
      zaloGroupNodeId: groupAudienceId,
      zaloGroupField: 'groupId',
      saveMessageLog: true,
      zaloGroupTemplateSteps,
    },
  });

  connections.push({
    sourceNodeId: triggerId,
    targetNodeId: selectAccountId,
    connectionType: 'default',
    connectionLabel: '',
    sourceHandle: 'default_out',
    targetHandle: 'default_in',
  });
  connections.push({
    sourceNodeId: selectAccountId,
    targetNodeId: groupAudienceId,
    connectionType: 'default',
    connectionLabel: '',
    sourceHandle: 'default_out',
    targetHandle: 'default_in',
  });
  connections.push({
    sourceNodeId: groupAudienceId,
    targetNodeId: sendGroupId,
    connectionType: 'default',
    connectionLabel: '',
    sourceHandle: 'default_out',
    targetHandle: 'default_in',
  });

  return {
    nodes,
    connections,
    contentSlots,
  };
}

export default {
  compileCampaign,
};
