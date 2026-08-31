/**
 * Campaign Compiler (Giai đoạn 2 - Intent Compiler)
 *
 * Nhiệm vụ: Chuyển đổi CampaignIntentV1 thành đồ thị thực thi hoàn chỉnh (nodes, connections, contentSlots).
 * Đặc điểm cốt lõi:
 * 1. Hàm thuần túy (pure function), đồng bộ, không I/O.
 * 2. Tất định 100%: Cùng một intent luôn sinh ra chính xác cùng một graph.
 * 3. Xuất camelCase (nodeType, nodeSubtype, nodeName, nodeDescription, positionX, positionY, config)
 *    khớp đúng contract của insertNodeTx, updateCampaign và aiCampaignDraft.service.js.
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

  // Luồng 1: Email gửi một lần (email-once)
  if (channel === 'email' && schedule.type === 'once') {
    return compileEmailOnceCampaign({ sender, audience, contentBrief, options });
  }

  // Các luồng mở rộng trong các giai đoạn tiếp theo (email drip, zalo personal, zalo group...)
  if (channel === 'email' && schedule.type === 'drip') {
    return compileEmailDripCampaign({ sender, audience, schedule, contentBrief, options });
  }

  throw new Error(`Unsupported compiler channel/schedule combination: channel="${channel}", schedule="${schedule?.type}"`);
}

/**
 * Biên dịch luồng Email gửi một lần (Email Once).
 * Graph: Trigger (manual) -> Audience (read_sheet / interested_customers / read_landing_leads) -> Action (send_email)
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
  nodes.push({
    id: sendEmailId,
    tempId: sendEmailId,
    nodeType: 'action',
    nodeSubtype: 'send_email',
    nodeName: 'Gửi Email',
    nodeDescription: 'Gửi email theo template',
    positionX: audienceNodeId ? 600 : 350,
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

  // 5. Content Slot (chừa sẵn cho LLM điền nội dung)
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
  nodes.push({
    id: sendEmailId,
    tempId: sendEmailId,
    nodeType: 'action',
    nodeSubtype: 'send_email',
    nodeName: 'Gửi Email Drip',
    nodeDescription: 'Chuỗi email tự động theo thời gian',
    positionX: audienceNodeId ? 600 : 350,
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

export default {
  compileCampaign,
};
