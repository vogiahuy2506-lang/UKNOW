/**
 * Campaign Script Merge Service (Việc 1 & Việc 2 - PLAN_BAT_CO_ZALO_GROUP)
 *
 * Nhiệm vụ:
 * 1. `mergeCompiledWithContent`: Ghép cấu trúc đồ thị từ Compiler với nội dung văn bản từ LLM legacy script.
 * 2. `assertNoEmptyContent`: Chốt chặn an toàn, đảm bảo tuyệt đối không có bước gửi nào bị rỗng nội dung.
 *
 * Hàm thuần túy, không I/O, an toàn và tất định.
 */

function getNodeSubtype(node) {
  return String(node?.nodeSubtype || node?.node_subtype || node?.subtype || '').trim();
}

/**
 * Ghép cấu trúc từ đồ thị do Compiler sinh ra với nội dung do LLM sinh ra.
 *
 * @param {object} compiledGraph - Đồ thị từ compileCampaign ({ nodes, connections, contentSlots })
 * @param {object} legacyScript - Kịch bản đồ thị do LLM sinh ra ({ nodes, connections })
 * @returns {{ script: object, unmatchedSlots: Array<object> }}
 */
export function mergeCompiledWithContent(compiledGraph, legacyScript) {
  if (!compiledGraph || !Array.isArray(compiledGraph.nodes)) {
    throw new Error('Invalid compiledGraph: nodes array required');
  }

  // Deep clone compiled graph để không làm biến đổi đối tượng ban đầu
  const mergedNodes = JSON.parse(JSON.stringify(compiledGraph.nodes));
  const mergedConnections = JSON.parse(JSON.stringify(compiledGraph.connections || []));
  const unmatchedSlots = [];

  const legacyNodes = Array.isArray(legacyScript?.nodes) ? legacyScript.nodes : [];

  for (const compNode of mergedNodes) {
    const subtype = getNodeSubtype(compNode);

    // 1. Kênh Zalo nhóm: send_zalo_group
    if (subtype === 'send_zalo_group') {
      const legNode = legacyNodes.find((n) => getNodeSubtype(n) === 'send_zalo_group');
      const legCfg = legNode?.config || legNode?.settings || {};
      const legSteps = Array.isArray(legCfg.zaloGroupTemplateSteps) ? legCfg.zaloGroupTemplateSteps : [];

      const compSteps = Array.isArray(compNode.config?.zaloGroupTemplateSteps)
        ? compNode.config.zaloGroupTemplateSteps
        : [];

      for (let i = 0; i < compSteps.length; i++) {
        const legStep = legSteps[i];
        let message = '';

        if (legStep && typeof legStep.message === 'string') {
          message = legStep.message;
        } else if (i === 0 && typeof legCfg.messageText === 'string') {
          message = legCfg.messageText;
        } else if (i === 0 && typeof legCfg.message === 'string') {
          message = legCfg.message;
        }

        if (message && message.trim()) {
          compSteps[i].message = message;
          if (legStep?.templateId) compSteps[i].templateId = legStep.templateId;
          if (Array.isArray(legStep?.templateMappings)) compSteps[i].templateMappings = legStep.templateMappings;
          // Bảo toàn attachments từ compiler; nếu compiler chưa có mà legacy có thì lấy legacy
          if (!compSteps[i].attachments && Array.isArray(legStep?.attachments) && legStep.attachments.length > 0) {
            compSteps[i].attachments = legStep.attachments;
          }
        } else {
          unmatchedSlots.push({
            nodeId: compNode.id,
            channel: 'zalo_group',
            stepIndex: i,
            reason: 'missing_legacy_content',
          });
        }
      }
    }

    // 2. Kênh Zalo cá nhân: send_zalo_personal
    else if (subtype === 'send_zalo_personal') {
      const legNode = legacyNodes.find((n) => getNodeSubtype(n) === 'send_zalo_personal');
      const legCfg = legNode?.config || legNode?.settings || {};
      const legSteps = Array.isArray(legCfg.zaloPersonalTemplateSteps) ? legCfg.zaloPersonalTemplateSteps : [];

      const compSteps = Array.isArray(compNode.config?.zaloPersonalTemplateSteps)
        ? compNode.config.zaloPersonalTemplateSteps
        : [];

      for (let i = 0; i < compSteps.length; i++) {
        const legStep = legSteps[i];
        let message = '';

        if (legStep && typeof legStep.message === 'string') {
          message = legStep.message;
        } else if (i === 0 && typeof legCfg.messageText === 'string') {
          message = legCfg.messageText;
        } else if (i === 0 && typeof legCfg.message === 'string') {
          message = legCfg.message;
        }

        if (message && message.trim()) {
          compSteps[i].message = message;
          if (legStep?.templateId) compSteps[i].templateId = legStep.templateId;
          if (Array.isArray(legStep?.templateMappings)) compSteps[i].templateMappings = legStep.templateMappings;
          if (!compSteps[i].attachments && Array.isArray(legStep?.attachments) && legStep.attachments.length > 0) {
            compSteps[i].attachments = legStep.attachments;
          }
        } else {
          unmatchedSlots.push({
            nodeId: compNode.id,
            channel: 'zalo',
            stepIndex: i,
            reason: 'missing_legacy_content',
          });
        }
      }
    }

    // 3. Kênh Email: send_email
    else if (subtype === 'send_email') {
      const legNode = legacyNodes.find((n) => getNodeSubtype(n) === 'send_email');
      const legCfg = legNode?.config || legNode?.settings || {};
      const legSteps = Array.isArray(legCfg.emailSteps) ? legCfg.emailSteps : [];

      const compSteps = Array.isArray(compNode.config?.emailSteps) ? compNode.config.emailSteps : [];

      for (let i = 0; i < compSteps.length; i++) {
        const legStep = legSteps[i];
        let subject = '';
        let body = '';

        if (legStep) {
          subject = typeof legStep.emailSubject === 'string' ? legStep.emailSubject : (legStep.subject || '');
          body = typeof legStep.emailBody === 'string' ? legStep.emailBody : (legStep.body || '');
        } else if (i === 0) {
          subject = typeof legCfg.emailSubject === 'string' ? legCfg.emailSubject : (legCfg.subject || '');
          body = typeof legCfg.emailBody === 'string' ? legCfg.emailBody : (legCfg.body || '');
        }

        if (subject && subject.trim() && body && body.trim()) {
          compSteps[i].emailSubject = subject;
          compSteps[i].emailBody = body;
          if (legStep?.templateId) compSteps[i].templateId = legStep.templateId;
          if (Array.isArray(legStep?.templateMappings)) compSteps[i].templateMappings = legStep.templateMappings;
          if (!compSteps[i].attachments && Array.isArray(legStep?.attachments) && legStep.attachments.length > 0) {
            compSteps[i].attachments = legStep.attachments;
          }
        } else {
          unmatchedSlots.push({
            nodeId: compNode.id,
            channel: 'email',
            stepIndex: i,
            reason: 'missing_legacy_content',
          });
        }
      }
    }
  }

  // CHIỀU NGƯỢC LẠI: legacy NHIỀU bước hơn compiler.
  //
  // Vòng lặp ở trên chỉ duyệt theo bước của compiler, nên nếu LLM soạn 5 tin mà compiler dựng
  // 3 bước thì cả 3 đều có nội dung, `unmatchedSlots` rỗng, và bản ghép được áp dụng — **2 tin
  // bị bỏ đi trong im lặng**. Khách nhận 3 thay vì 5 và không ai được báo.
  //
  // Mất nội dung lặng lẽ tệ hơn việc không áp dụng compiler. Ghi nhận để rơi về script cũ.
  const STEP_FIELDS = [
    ['send_zalo_group', 'zaloGroupTemplateSteps', 'zalo_group'],
    ['send_zalo_personal', 'zaloPersonalTemplateSteps', 'zalo'],
    ['send_email', 'emailSteps', 'email'],
  ];

  for (const [subtype, field, channel] of STEP_FIELDS) {
    const compNode = mergedNodes.find((n) => getNodeSubtype(n) === subtype);
    if (!compNode) continue;
    const legNode = legacyNodes.find((n) => getNodeSubtype(n) === subtype);
    if (!legNode) continue;

    const compLen = Array.isArray(compNode.config?.[field]) ? compNode.config[field].length : 0;
    const legCfg = legNode.config || legNode.settings || {};
    const legLen = Array.isArray(legCfg[field]) ? legCfg[field].length : 0;

    if (legLen > compLen) {
      unmatchedSlots.push({
        nodeId: compNode.id,
        channel,
        stepIndex: compLen,
        reason: 'legacy_has_more_steps',
        legacyStepCount: legLen,
        compiledStepCount: compLen,
      });
    }
  }

  return {
    script: {
      nodes: mergedNodes,
      connections: mergedConnections,
    },
    unmatchedSlots,
  };
}

/**
 * Chốt chặn kiểm tra nội dung rỗng (Việc 2).
 * Ném lỗi nếu có bất kỳ bước gửi nào bị rỗng nội dung.
 *
 * @param {object} script - Kịch bản chứa nodes
 * @throws {Error} Ném lỗi với code 'EMPTY_CONTENT' nếu phát hiện bước gửi rỗng
 */
export function assertNoEmptyContent(script) {
  const nodes = Array.isArray(script?.nodes) ? script.nodes : [];

  for (const node of nodes) {
    const subtype = getNodeSubtype(node);
    const cfg = node.config || node.settings || {};

    if (subtype === 'send_zalo_group') {
      const steps = Array.isArray(cfg.zaloGroupTemplateSteps) ? cfg.zaloGroupTemplateSteps : [];
      if (steps.length === 0) {
        const err = new Error(`Node ${node.id || 'send_zalo_group'} không có zaloGroupTemplateSteps`);
        err.code = 'EMPTY_CONTENT';
        throw err;
      }
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (!step?.message || !String(step.message).trim()) {
          const err = new Error(`Node ${node.id || 'send_zalo_group'} bước #${i + 1} có nội dung message rỗng`);
          err.code = 'EMPTY_CONTENT';
          err.stepIndex = i;
          throw err;
        }
      }
    } else if (subtype === 'send_zalo_personal') {
      const steps = Array.isArray(cfg.zaloPersonalTemplateSteps) ? cfg.zaloPersonalTemplateSteps : [];
      if (steps.length === 0) {
        const err = new Error(`Node ${node.id || 'send_zalo_personal'} không có zaloPersonalTemplateSteps`);
        err.code = 'EMPTY_CONTENT';
        throw err;
      }
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (!step?.message || !String(step.message).trim()) {
          const err = new Error(`Node ${node.id || 'send_zalo_personal'} bước #${i + 1} có nội dung message rỗng`);
          err.code = 'EMPTY_CONTENT';
          err.stepIndex = i;
          throw err;
        }
      }
    } else if (subtype === 'send_email') {
      const steps = Array.isArray(cfg.emailSteps) ? cfg.emailSteps : [];
      if (steps.length === 0) {
        const err = new Error(`Node ${node.id || 'send_email'} không có emailSteps`);
        err.code = 'EMPTY_CONTENT';
        throw err;
      }
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (!step?.emailSubject || !String(step.emailSubject).trim()) {
          const err = new Error(`Node ${node.id || 'send_email'} bước #${i + 1} có emailSubject rỗng`);
          err.code = 'EMPTY_CONTENT';
          err.stepIndex = i;
          throw err;
        }
        if (!step?.emailBody || !String(step.emailBody).trim()) {
          const err = new Error(`Node ${node.id || 'send_email'} bước #${i + 1} có emailBody rỗng`);
          err.code = 'EMPTY_CONTENT';
          err.stepIndex = i;
          throw err;
        }
      }
    }
  }
}

export default {
  mergeCompiledWithContent,
  assertNoEmptyContent,
};
