/**
 * Build safe preview HTML document for iframe rendering.
 *
 * @param {string} html template html body
 * @returns {string}
 */
export const wrapEmailSrcDoc = (html) => `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <base target="_blank" />
    <style>
      html, body { margin: 0; padding: 0; }
      img { max-width: 100%; height: auto; }
      table { border-collapse: collapse; }
    </style>
  </head>
  <body>
    ${html || ''}
  </body>
</html>`;

/**
 * Resize preview iframe height to fit rendered email content.
 *
 * @param {HTMLIFrameElement|null} iframe target iframe
 * @returns {void}
 */
export const resizeIframeToContent = (iframe) => {
  if (!iframe) return;
  try {
    const doc = iframe.contentDocument;
    if (!doc) return;
    const height = Math.max(
      500,
      doc.documentElement?.scrollHeight || 0,
      doc.body?.scrollHeight || 0
    );
    iframe.style.height = `${height}px`;
  } catch {
    // ignore (e.g. browser restrictions)
  }
};

export const getCaretPosition = (textarea, selectionIndex) => {
  const div = document.createElement('div');
  const style = window.getComputedStyle(textarea);
  const properties = [
    'boxSizing',
    'width',
    'height',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'fontStyle',
    'letterSpacing',
    'textTransform',
    'lineHeight',
    'textAlign',
    'whiteSpace',
    'wordWrap',
  ];

  properties.forEach((prop) => {
    div.style[prop] = style[prop];
  });

  div.style.position = 'absolute';
  div.style.visibility = 'hidden';
  div.style.whiteSpace = 'pre-wrap';
  div.style.wordWrap = 'break-word';
  div.textContent = textarea.value.slice(0, selectionIndex);
  const span = document.createElement('span');
  span.textContent = textarea.value.slice(selectionIndex) || '.';
  div.appendChild(span);
  document.body.appendChild(div);

  const { offsetLeft, offsetTop } = span;
  const rect = textarea.getBoundingClientRect();
  const top = rect.top + window.scrollY + offsetTop - textarea.scrollTop + 24;
  const left = rect.left + window.scrollX + offsetLeft - textarea.scrollLeft;

  document.body.removeChild(div);

  return { top, left };
};

export const getCaretPositionForInput = (input, selectionIndex) => {
  const div = document.createElement('div');
  const style = window.getComputedStyle(input);
  const properties = [
    'boxSizing',
    'width',
    'height',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'fontStyle',
    'letterSpacing',
    'textTransform',
    'lineHeight',
    'textAlign',
    'whiteSpace',
  ];

  properties.forEach((prop) => {
    div.style[prop] = style[prop];
  });

  div.style.position = 'absolute';
  div.style.visibility = 'hidden';
  div.style.whiteSpace = 'pre';
  div.textContent = input.value.slice(0, selectionIndex);
  const span = document.createElement('span');
  span.textContent = input.value.slice(selectionIndex) || '.';
  div.appendChild(span);
  document.body.appendChild(div);

  const { offsetLeft, offsetTop } = span;
  const rect = input.getBoundingClientRect();
  const top = rect.top + window.scrollY + offsetTop + rect.height + 6;
  const left = rect.left + window.scrollX + offsetLeft;

  document.body.removeChild(div);

  return { top, left };
};

export const normalizeS3KeyFromUrl = (url) => {
  if (!url || typeof url !== 'string') return null;

  try {
    const parsed = new URL(url, window.location.origin);
    const pathname = decodeURIComponent(parsed.pathname || '');
    if (!pathname) return null;

    const segments = pathname.split('/').filter(Boolean);
    if (!segments.length) return null;

    if (segments[0] === 'uploads') {
      return segments.join('/');
    }

    const uploadIndex = segments.findIndex((segment) => segment === 'uploads');
    if (uploadIndex >= 0) {
      return segments.slice(uploadIndex).join('/');
    }

    const normalizedPath = pathname.startsWith('/') ? pathname.slice(1) : pathname;
    return normalizedPath.startsWith('uploads/') ? normalizedPath : null;
  } catch {
    return null;
  }
};

export const resolveAttachmentKey = (attachment) => {
  if (!attachment) return null;
  if (typeof attachment === 'string') {
    return normalizeS3KeyFromUrl(attachment);
  }
  if (typeof attachment === 'object') {
    if (attachment.key) return attachment.key;
    return normalizeS3KeyFromUrl(
      attachment.url || attachment.link || attachment.attachmentUrl
    );
  }
  return null;
};

export const getCategoryBadge = (category) => {
  switch (category) {
    case 'marketing':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
          Marketing
        </span>
      );
    case 'notification':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
          Thông báo
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
          {category}
        </span>
      );
  }
};
