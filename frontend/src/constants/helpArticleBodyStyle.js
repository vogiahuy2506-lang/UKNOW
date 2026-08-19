/**
 * Tailwind classes for rendering help-article body HTML — shared by the
 * public article page (/huong-dan/:slug) and the admin preview pane so a
 * draft looks exactly like what readers will see. Keep both call sites on
 * this constant instead of duplicating the class list.
 */
export const HELP_ARTICLE_BODY_RICH_CLASS = `help-article-body
  [&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-slate-900
  [&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-xl [&_h3]:font-semibold
  [&_h4]:mt-4 [&_h4]:mb-2 [&_h4]:text-lg [&_h4]:font-semibold
  [&_p]:my-3 [&_p]:leading-relaxed [&_p]:text-slate-700
  [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5
  [&_li]:my-1 [&_blockquote]:border-l-4 [&_blockquote]:border-slate-200 [&_blockquote]:pl-4 [&_blockquote]:italic
  [&_a]:text-primary-600 [&_a]:underline
  [&_img]:my-4 [&_img]:max-w-full [&_img]:rounded-lg [&_img]:border [&_img]:border-slate-200
  [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-slate-900 [&_pre]:p-3 [&_pre]:text-slate-100
  [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:text-sm
  [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_td]:border [&_th]:border-slate-200 [&_td]:border-slate-200 [&_th]:bg-slate-50 [&_th]:p-2 [&_td]:p-2`;
