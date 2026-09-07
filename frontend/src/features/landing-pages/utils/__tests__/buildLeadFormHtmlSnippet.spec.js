import { describe, it, expect } from 'vitest';
import { buildLeadFormHtmlSnippet } from '../buildLeadFormHtmlSnippet.js';

/**
 * Snippet form nhúng phải tuân thủ Nghị định 330/2026 về đồng ý marketing, cùng luật đã
 * áp cho form iframe ở PR-N1b (commit 18d068b0): ô đồng ý MẶC ĐỊNH BỎ TRỐNG và KHÔNG được
 * ép khách tick mới cho gửi. Backend lưu 3 trạng thái (true / false / null) và có ghi rõ
 * "Không ép khách phải đồng ý để được gửi form" (lead.service.js, createPublicLead).
 *
 * Bối cảnh (07/09/2026): bản đầu của snippet (commit dc78ef68) sinh
 *   <input type="checkbox" name="marketingConsent" required checked>
 * vi phạm cả hai vế. Test này parse HTML thật do hàm sinh ra, không chép lại template.
 */
function parseForm(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const form = doc.querySelector('form');
  expect(form).not.toBeNull();
  return { doc, form };
}

describe('buildLeadFormHtmlSnippet — ô đồng ý marketing', () => {
  const html = buildLeadFormHtmlSnippet({ slug: 'demo', apiBase: 'https://api.example.com/api' });

  it('có đúng một checkbox marketingConsent', () => {
    const { form } = parseForm(html);
    const boxes = form.querySelectorAll('input[type="checkbox"][name="marketingConsent"]');
    expect(boxes.length).toBe(1);
  });

  it('checkbox MẶC ĐỊNH KHÔNG tick', () => {
    const { form } = parseForm(html);
    const box = form.querySelector('input[name="marketingConsent"]');
    expect(box.hasAttribute('checked')).toBe(false);
    expect(box.checked).toBe(false);
  });

  it('checkbox KHÔNG bắt buộc — khách từ chối vẫn gửi được form', () => {
    const { form } = parseForm(html);
    const box = form.querySelector('input[name="marketingConsent"]');
    expect(box.hasAttribute('required')).toBe(false);
    expect(box.required).toBe(false);
  });

  it('form mang dấu nhận diện data-uknow-lead-form và slug', () => {
    const { form } = parseForm(html);
    expect(form.hasAttribute('data-uknow-lead-form')).toBe(true);
    expect(form.getAttribute('data-slug')).toBe('demo');
  });
});

/**
 * theme.primary/accent/bg/text/border được nội suy trực tiếp vào style="..." (không qua
 * React). Backend đã siết còn hex hợp lệ (landingLeadFormConfig.util.js normalizeLeadFormTheme),
 * nhưng hàm này tự đứng được — test phòng thủ khi gọi trực tiếp với giá trị bẩn (preview
 * canvas editor dùng state frontend, chưa qua backend validate).
 */
describe('buildLeadFormHtmlSnippet — escape theme màu chống breakout style attr', () => {
  it('giá trị chứa dấu ngoặc kép không tạo thêm thuộc tính (onmouseover) trên DOM', () => {
    const html = buildLeadFormHtmlSnippet({
      slug: 'demo',
      apiBase: 'https://api.example.com/api',
      theme: { primary: '" onmouseover="alert(1)' },
    });
    const { form } = parseForm(html);
    const button = form.querySelector('button[type="submit"]');
    expect(button.hasAttribute('onmouseover')).toBe(false);
    expect(Array.from(button.attributes).map((a) => a.name)).toEqual(['type', 'style']);
  });

  it('escapeHtml chạy trên màu — chuỗi kết quả không chứa chuỗi tấn công thô', () => {
    const html = buildLeadFormHtmlSnippet({
      slug: 'demo',
      apiBase: 'https://api.example.com/api',
      theme: { text: '"><script>window.__pwn=1</script>' },
    });
    expect(html).not.toContain('<script>window.__pwn=1</script>');
    const { doc } = parseForm(html);
    // Snippet luôn có đúng 1 <script> hợp lệ (handler submit) — payload chèn qua theme không được thêm script thứ hai.
    expect(doc.querySelectorAll('script')).toHaveLength(1);
    expect(doc.querySelector('script').textContent).not.toContain('__pwn');
  });
});
