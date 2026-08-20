/**
 * Utility functions for batched chatbot replies
 */

export const DEFAULT_DEBOUNCE_MS = 4000;
export const DEFAULT_MAX_WAIT_MS = 10000;
export const MIN_DEBOUNCE_MS = 500;
export const MAX_DEBOUNCE_MS = 10000;
export const MAX_ALLOWED_WAIT_MS = 30000;

/**
 * Validate and resolve debounce configuration from environment variables.
 * @returns {{ debounceMs: number, maxWaitMs: number }}
 */
export function getDebounceConfig() {
  const rawDebounce = Number.parseInt(process.env.CHATBOT_INBOUND_DEBOUNCE_MS, 10);
  const debounceMs = Number.isSafeInteger(rawDebounce) && rawDebounce >= MIN_DEBOUNCE_MS && rawDebounce <= MAX_DEBOUNCE_MS
    ? rawDebounce
    : DEFAULT_DEBOUNCE_MS;

  const rawMaxWait = Number.parseInt(process.env.CHATBOT_INBOUND_MAX_WAIT_MS, 10);
  const maxWaitMs = Number.isSafeInteger(rawMaxWait) && rawMaxWait >= debounceMs && rawMaxWait <= MAX_ALLOWED_WAIT_MS
    ? rawMaxWait
    : Math.max(debounceMs, DEFAULT_MAX_WAIT_MS);

  return { debounceMs, maxWaitMs };
}

/**
 * Format an array of batched messages into a single prompt for the AI.
 * If there is only 1 message, return its original text without wrapper.
 *
 * @param {Array<{ content: string }>} messages
 * @returns {string}
 */
export function formatBatchedContent(messages = []) {
  const validMessages = (messages || []).filter((m) => m && typeof m.content === 'string' && m.content.trim().length > 0);
  if (validMessages.length === 0) return '';
  if (validMessages.length === 1) return validMessages[0].content.trim();

  const lines = validMessages.map((m, idx) => `${idx + 1}. ${m.content.trim()}`);
  return `Khách vừa gửi liên tiếp các tin sau:\n${lines.join('\n')}\n\nHãy trả lời một lần, bao quát toàn bộ ý mới nhất của khách.`;
}
