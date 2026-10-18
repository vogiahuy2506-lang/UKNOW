import { readAudience } from './audienceSection';
import { readSender } from './senderSection';
import { readContent } from './contentSection';
import { readAfterSend, readTiming } from './summarySections';

export { audienceChangeNeedsRebuild, buildAudienceGraph, readAudience, validateAudience, writeAudience } from './audienceSection';
export { readSender, writeSender } from './senderSection';
export { readAfterSend, readTiming } from './summarySections';
export { TAG_NAME_MAX, isTagStepChanged, readTagStep, validateTagStep, writeTagStep } from './afterSection';
export {
  CONTENT_SEND_SPEC,
  CUSTOM_BODY_MAX,
  CUSTOM_SUBJECT_MAX,
  buildTemplateMappings,
  contentProblemOf,
  contentSignature,
  createBlankContentStep,
  delayProblemOf,
  isContentValueChanged,
  maxStepsOf,
  readContent,
  validateContentValue,
  writeContent,
} from './contentSection';

/** Số mục cần điền trước khi chạy: Gửi từ · Gửi cho ai · Nội dung (Thời điểm / Sau khi gửi không tính). */
export const countMissingSections = (sections) => ['sender', 'audience', 'content'].filter((key) => sections[key]?.status === 'missing').length;

/**
 * Đọc cả 5 mục một lượt.
 * @param {Array<object>} nodes
 * @param {Array<object>} edges
 * @param {{ campaignType: string, lookups?: object, t: Function, scheduleSummary?: string }} ctx
 */
export function readSettingsSections(nodes, edges, ctx) {
  return {
    sender: readSender(nodes, edges, ctx),
    audience: readAudience(nodes, edges, ctx),
    content: readContent(nodes, edges, ctx),
    timing: readTiming(nodes, edges, ctx),
    after: readAfterSend(nodes, edges, ctx),
  };
}
