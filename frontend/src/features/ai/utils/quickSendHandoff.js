/**
 * Trích xuất tệp đính kèm khi bàn giao chiến dịch sang luồng Gửi nhanh (quickSendDraft)
 * Hỗ trợ cả cấp node (config.attachments) và cấp step của compiler (*TemplateSteps[0].attachments, emailSteps[0].attachments)
 */
export function extractQuickSendDraftAttachments(config = {}, singleStep = null) {
  const firstStepAttachments = (
    (Array.isArray(config?.zaloGroupTemplateSteps) && config.zaloGroupTemplateSteps[0]?.attachments) ||
    (Array.isArray(config?.zaloPersonalTemplateSteps) && config.zaloPersonalTemplateSteps[0]?.attachments) ||
    (Array.isArray(config?.emailSteps) && config.emailSteps[0]?.attachments)
  );
  return Array.isArray(config?.attachments)
    ? config.attachments
    : Array.isArray(firstStepAttachments)
      ? firstStepAttachments
      : Array.isArray(singleStep?.content?.attachments)
        ? singleStep.content.attachments
        : [];
}
