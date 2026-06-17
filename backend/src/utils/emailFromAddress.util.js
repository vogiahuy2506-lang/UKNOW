/**
 * Sanitize display name for SMTP From header — strip CRLF and characters
 * that could break header parsing or enable header injection.
 *
 * @param {string|null|undefined} name
 * @returns {string}
 */
export function sanitizeDisplayName(name) {
  if (name === null || name === undefined) return '';
  return String(name)
    .replace(/[\r\n\0]/g, '')
    .replace(/["\\]/g, '')
    .replace(/[<>]/g, '')
    .trim();
}

/**
 * Build RFC 5322 From address from email setting.
 * Falls back to bare email when name is empty after sanitization.
 *
 * @param {{ name?: string|null, email?: string|null }} setting
 * @returns {string}
 */
export function resolveFromAddress(setting) {
  const email = String(setting?.email || '').trim();
  if (!email) return '';

  const name = sanitizeDisplayName(setting?.name);
  if (!name) return email;

  return `"${name}" <${email}>`;
}

/**
 * Extract domain part from an email address (lowercased).
 *
 * @param {string|null|undefined} email
 * @returns {string|null}
 */
export function extractBrandDomain(email) {
  const normalized = String(email || '').trim().toLowerCase();
  const atIndex = normalized.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === normalized.length - 1) return null;
  return normalized.slice(atIndex + 1);
}
