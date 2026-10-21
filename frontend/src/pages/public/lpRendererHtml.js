// Tách khỏi LpRendererPage.jsx: tệp trang chỉ nên export component (react-refresh/only-export-components).
export function ensureTailwindCdnAndViewport(html) {
  if (!html) return html;
  let result = html;

  // Ensure viewport meta tag (critical for responsive layout on mobile)
  if (!result.includes('name="viewport"')) {
    result = result.replace(
      /<head([^>]*)>/i,
      `<head$1>\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">`,
    );
  }

  // Inject Tailwind CDN if not present
  if (!result.includes('cdn.tailwindcss.com')) {
    result = result.replace(
      /<head([^>]*)>/i,
      `<head$1>\n  <script src="https://cdn.tailwindcss.com"></script>`,
    );
  }

  return result;
}
