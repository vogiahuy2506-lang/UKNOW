import { getCustomerDisplayName } from './customerDisplay.helpers';

export const getInitial = (customer) => {
  const name = getCustomerDisplayName(customer);
  return name ? name[0].toUpperCase() : '?';
};

export const buildRunDisplayName = (runId, runName, t) => {
  const normalizedName = String(runName || '').trim();
  if (normalizedName) return normalizedName;
  if (runId != null && runId !== '') return `${t('campaignCustomerModals.run')} #${runId}`;
  return t('campaignCustomerModals.unknownRun');
};

export const hasInterestedStatus = (purchase) => {
  const statuses = purchase.statuses || [];
  return (
    purchase.itemStatus === 'interested' ||
    statuses.some((statusItem) => {
      const lowered = String(statusItem).toLowerCase();
      return lowered.includes('on-hold') || lowered.includes('onhold') || lowered.includes('interest');
    })
  );
};

export const hasPurchasedStatus = (purchase) => {
  const statuses = purchase.statuses || [];
  return (
    purchase.itemStatus === 'completed' ||
    statuses.some((statusItem) => {
      const lowered = String(statusItem).toLowerCase();
      return lowered.includes('completed');
    })
  );
};

/**
 * Build unique clicked-link list from journey click events.
 *
 * @param {Array<object>} clickedEvents
 * @returns {Array<{linkKey: string, targetUrl: string|null, label: string|null, clickedAt: string|null, clickCount: number}>}
 */
export const buildUniqueClickedLinks = (clickedEvents = []) => {
  const groupedByLink = new Map();
  (Array.isArray(clickedEvents) ? clickedEvents : []).forEach((event, index) => {
    const eventData = event?.eventData && typeof event.eventData === 'object' ? event.eventData : {};
    const targetUrl = String(eventData?.targetUrl || '').trim() || null;
    const label = String(eventData?.label || '').trim() || null;
    const rawLinkKey = String(eventData?.linkKey || '').trim();
    const fallbackKey = targetUrl || `event-${event?.id || index}`;
    const linkKey = rawLinkKey || fallbackKey;
    if (!groupedByLink.has(linkKey)) {
      groupedByLink.set(linkKey, {
        linkKey,
        targetUrl,
        label,
        clickedAt: event?.eventAt || null,
        clickCount: 0,
      });
    }
    const item = groupedByLink.get(linkKey);
    item.clickCount += 1;
    const itemTime = item.clickedAt ? new Date(item.clickedAt).getTime() : Number.POSITIVE_INFINITY;
    const nextTime = event?.eventAt ? new Date(event.eventAt).getTime() : Number.POSITIVE_INFINITY;
    if (nextTime < itemTime) item.clickedAt = event?.eventAt || item.clickedAt;
    if (!item.targetUrl && targetUrl) item.targetUrl = targetUrl;
    if (!item.label && label) item.label = label;
  });

  return Array.from(groupedByLink.values()).sort((a, b) => {
    const timeA = a.clickedAt ? new Date(a.clickedAt).getTime() : Number.POSITIVE_INFINITY;
    const timeB = b.clickedAt ? new Date(b.clickedAt).getTime() : Number.POSITIVE_INFINITY;
    return timeA - timeB;
  });
};

export const getFileIcon = (fileName) => {
  const ext = String(fileName || '').split('.').pop().toLowerCase();
  const map = {
    pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊',
    ppt: '📑', pptx: '📑', zip: '🗜', rar: '🗜', '7z': '🗜',
    jpg: '🖼', jpeg: '🖼', png: '🖼', gif: '🖼', webp: '🖼', svg: '🖼',
    mp4: '🎬', mov: '🎬', avi: '🎬', mp3: '🎵', wav: '🎵', m4a: '🎵',
    txt: '📃', csv: '📊', json: '📋', xml: '📋',
  };
  return map[ext] || '📎';
};

export const sanitizeEmailHtml = (html) => {
  if (!html) return '';
  let clean = html;
  clean = clean.replace(/<img[^>]*\/api\/customers\/email-tracking\/open\/[^>]*\/?>/gi, '');
  clean = clean.replace(
    /href=(["'])[^"']*\/api\/customers\/email-tracking\/click\/[^"'?]*\?[^"']*url=([^"'&]+)[^"']*/gi,
    (_m, q, encodedUrl) => {
      try { return `href=${q}${decodeURIComponent(encodedUrl)}`; }
      catch { return `href=${q}#`; }
    }
  );
  clean = clean.replace(
    /href=(["'])[^"']*\/track\/attachment\/[^"']*/gi,
    (_m, q) => `href=${q}#`
  );
  return clean;
};

export const wrapEmailPreviewHtml = (html) => `<!doctype html>
<html><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <base target="_blank">
  <style>html,body{margin:0;padding:0}img{max-width:100%;height:auto}table{border-collapse:collapse}</style>
</head><body>${html || ''}</body></html>`;
