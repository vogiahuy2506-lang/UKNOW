/**
 * Build iframe srcDoc for full-page HTML overrides (fragment or full document).
 */
export function buildLandingHtmlSrcDoc(html, cssContent = '') {
  const raw = String(html || '').trim();
  if (!raw) return '';

  const extraCss = String(cssContent || '').trim();
  const cssBlock = extraCss ? `<style>${extraCss}</style>` : '';

  if (/<!doctype/i.test(raw) || /<html[\s>]/i.test(raw)) {
    if (extraCss && !/<\/head>/i.test(raw)) {
      return raw.replace(/<body([^>]*)>/i, `<body$1>${cssBlock}`);
    }
    if (extraCss && /<\/head>/i.test(raw)) {
      return raw.replace(/<\/head>/i, `${cssBlock}</head>`);
    }
    return raw;
  }

  const tailwind = raw.includes('cdn.tailwindcss.com')
    ? ''
    : '<script src="https://cdn.tailwindcss.com"></script>';

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  ${tailwind}
  ${cssBlock}
</head>
<body>
${raw}
</body>
</html>`;
}
