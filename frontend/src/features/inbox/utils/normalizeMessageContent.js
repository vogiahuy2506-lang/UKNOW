const DEFAULT_LABELS = {
  sticker: '[Sticker]',
  groupEvent: 'Group event',
  link: 'Link',
  call: '[Call]',
  zaloEvent: '[Zalo event]',
};

const INTERNAL_EVENT_LABEL_KEYS = {
  sendbubblemessage: 'call',
  send_bubble_message: 'call',
  chat_call: 'call',
  call: 'call',
};

const isObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const getNestedValue = (source, paths) => {
  for (const path of paths) {
    const value = path.split('.').reduce((current, key) => {
      if (!isObject(current) && !Array.isArray(current)) return undefined;
      return current?.[key];
    }, source);

    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  return '';
};

const normalizeActionLabel = (action, labels) => {
  const compact = String(action || '')
    .replace(/^groupchat[_:-]?/i, '')
    .replace(/[_:-]+/g, ' ')
    .trim();

  return compact ? `${labels.groupEvent}: ${compact}` : labels.groupEvent;
};

const normalizeInternalToken = (value) =>
  String(value || '')
    .replace(/[\s:-]+/g, '_')
    .trim()
    .toLowerCase();

const getKnownInternalEventLabel = (value, labels) => {
  const candidates = [
    getNestedValue(value, ['title', 'action', 'type', 'event', 'data.title', 'data.action', 'data.type']),
    getNestedValue(value, ['message.title', 'message.type', 'attachment.title', 'attachment.type']),
  ]
    .join(' ')
    .split(/\s+/)
    .filter(Boolean);

  for (const candidate of candidates) {
    const labelKey = INTERNAL_EVENT_LABEL_KEYS[normalizeInternalToken(candidate)];
    if (labelKey && labels[labelKey]) return labels[labelKey];
  }

  return '';
};

const hasStickerShape = (value) => {
  if (!isObject(value)) return false;
  const type = String(value.type || value.msgType || value.messageType || '').toLowerCase();
  return Boolean(
    value.catId ||
    value.cat_id ||
    type === 'sticker' ||
    type.includes('sticker')
  );
};

const getUrl = (value) =>
  getNestedValue(value, [
    'href',
    'url',
    'link',
    'action.href',
    'action.url',
    'data.href',
    'data.url',
    'data.link',
  ]);

const getTitle = (value) =>
  getNestedValue(value, [
    'title',
    'name',
    'text',
    'data.title',
    'data.name',
    'data.text',
    'message.title',
    'attachment.title',
  ]);

const getDescription = (value) =>
  getNestedValue(value, [
    'description',
    'desc',
    'summary',
    'data.description',
    'data.desc',
    'message.description',
    'attachment.description',
  ]);

const getThumbUrl = (value) =>
  getNestedValue(value, [
    'thumb',
    'thumbUrl',
    'thumbnail',
    'thumbnailUrl',
    'image',
    'imageUrl',
    'data.thumb',
    'data.thumbUrl',
    'data.thumbnail',
    'data.image',
    'attachment.thumb',
    'attachment.thumbUrl',
  ]);

const normalizeParsedObject = (value, rawText, labels) => {
  if (hasStickerShape(value)) {
    return {
      type: 'sticker',
      text: labels.sticker,
      raw: value,
    };
  }

  const knownInternalLabel = getKnownInternalEventLabel(value, labels);
  if (knownInternalLabel) {
    return {
      type: 'event',
      text: knownInternalLabel,
      raw: value,
    };
  }

  const action = getNestedValue(value, ['action', 'type', 'data.action', 'event']);
  if (action.toLowerCase().includes('groupchat')) {
    const title = getTitle(value);
    const description = getDescription(value);
    return {
      type: 'group_event',
      text: title || description || normalizeActionLabel(action, labels),
      title,
      description,
      action,
      raw: value,
    };
  }

  const title = getTitle(value);
  const href = getUrl(value);
  const description = getDescription(value);
  const thumbUrl = getThumbUrl(value);

  if (title || href || description) {
    return {
      type: href ? 'link' : 'text',
      text: title || description || href || labels.link,
      title,
      href,
      description,
      thumbUrl,
      raw: value,
    };
  }

  return {
    type: 'text',
    text: rawText,
    raw: value,
  };
};

export const normalizeMessageContent = (content, labelOverrides = {}) => {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides };

  if (content === null || content === undefined) {
    return { type: 'text', text: '' };
  }

  if (isObject(content)) {
    return normalizeParsedObject(content, JSON.stringify(content), labels);
  }

  if (Array.isArray(content)) {
    const firstObject = content.find((item) => isObject(item));
    if (firstObject) return normalizeParsedObject(firstObject, JSON.stringify(firstObject), labels);
    return { type: 'text', text: content.join(', ') };
  }

  const text = String(content);
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return { type: 'text', text };
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      const firstObject = parsed.find((item) => isObject(item));
      if (firstObject) return normalizeParsedObject(firstObject, trimmed, labels);
      return { type: 'text', text };
    }

    if (isObject(parsed)) {
      return normalizeParsedObject(parsed, trimmed, labels);
    }

    return { type: 'text', text };
  } catch {
    return { type: 'text', text };
  }
};

export const getNormalizedMessageText = (normalized) => {
  if (!normalized) return '';

  if (normalized.type === 'link') {
    return [normalized.title || normalized.text, normalized.description, normalized.href]
      .filter(Boolean)
      .join(' · ');
  }

  return normalized.text || '';
};

export const getMessagePreviewText = (content, labels) =>
  getNormalizedMessageText(normalizeMessageContent(content, labels));
