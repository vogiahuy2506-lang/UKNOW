import { describe, it, expect } from '@jest/globals';
import {
  extractHtmlFromModelText,
  validateEditHtmlOutput,
  LANDING_FORM_PLACEHOLDER,
  MAX_EDIT_HTML_INPUT_CHARS,
} from '../landingEditGuard.util.js';

describe('landingEditGuard.util', () => {
  const baseValidHtml = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8"/>
  <script src="https://cdn.tailwindcss.com"></script>
  <title>Landing Page Demo</title>
</head>
<body class="bg-gray-50 text-gray-900">
  <header class="py-6 px-4"><h1 class="text-2xl font-bold">Tiêu đề</h1></header>
  <main class="py-10">
    <section class="max-w-4xl mx-auto"><p>Nội dung chính của trang landing marketing.</p></section>
    <!-- UKNOW_LP_FORM -->
  </main>
</body>
</html>`;

  it('hợp lệ khi AI chỉnh sửa đúng quy cách và giữ nguyên form marker', () => {
    const editedHtml = baseValidHtml.replace(
      'class="text-2xl font-bold">Tiêu đề',
      'class="text-3xl font-extrabold text-blue-600">Tiêu đề mới cập nhật'
    );

    const isValid = validateEditHtmlOutput({
      currentHtml: baseValidHtml,
      newHtml: editedHtml,
    });
    expect(isValid).toBe(true);
  });

  it('MAX_TOKENS → ném lỗi 502 thông báo cắt ngắn', () => {
    expect(() => {
      validateEditHtmlOutput({
        currentHtml: baseValidHtml,
        newHtml: baseValidHtml,
        finishReason: 'MAX_TOKENS',
      });
    }).toThrow(/cắt ngắn/i);
  });

  it('bản cũ có <!DOCTYPE html> nhưng bản mới bị mất → ném lỗi 502', () => {
    const invalidHtml = baseValidHtml.replace('<!DOCTYPE html>', '');
    expect(() => {
      validateEditHtmlOutput({
        currentHtml: baseValidHtml,
        newHtml: invalidHtml,
      });
    }).toThrow(/<!DOCTYPE html>/i);
  });

  it('bản cũ có Tailwind CDN nhưng bản mới bị mất → ném lỗi 502', () => {
    const invalidHtml = baseValidHtml.replace('<script src="https://cdn.tailwindcss.com"></script>', '');
    expect(() => {
      validateEditHtmlOutput({
        currentHtml: baseValidHtml,
        newHtml: invalidHtml,
      });
    }).toThrow(/Tailwind CDN/i);
  });

  it('bản cũ là fragment (không có DOCTYPE/Tailwind) → bản mới là fragment hợp lệ → pass', () => {
    const fragmentCurrent = `<div class="p-8 bg-white"><h2 class="text-xl font-bold">Fragment title</h2><p>Nội dung đoạn mẫu.</p></div>`;
    const fragmentEdited = `<div class="p-8 bg-white"><h2 class="text-2xl font-extrabold text-indigo-600">Fragment title mới</h2><p>Nội dung đoạn mẫu đã cập nhật.</p></div>`;

    const isValid = validateEditHtmlOutput({
      currentHtml: fragmentCurrent,
      newHtml: fragmentEdited,
    });
    expect(isValid).toBe(true);
  });

  it('bản cũ vốn có placeholder {{user_name}}, bản mới vẫn giữ → hợp lệ', () => {
    const currentWithPlaceholder = baseValidHtml.replace('Tiêu đề', 'Xin chào {{user_name}}');
    const newWithSamePlaceholder = currentWithPlaceholder.replace(
      'Nội dung chính của trang landing marketing.',
      'Nội dung đã được AI chỉnh sửa nhưng giữ nguyên biến.'
    );

    const isValid = validateEditHtmlOutput({
      currentHtml: currentWithPlaceholder,
      newHtml: newWithSamePlaceholder,
    });
    expect(isValid).toBe(true);
  });

  it('AI sinh thêm placeholder mới {{company_name}} không có trong bản cũ → ném lỗi 502', () => {
    const invalidHtml = baseValidHtml.replace('Tiêu đề', '{{company_name}}');
    expect(() => {
      validateEditHtmlOutput({
        currentHtml: baseValidHtml,
        newHtml: invalidHtml,
      });
    }).toThrow(/\{\{\.\.\.\}\}/);
  });

  it('kết quả mới quá ngắn (< 0.6 độ dài cũ) → ném lỗi 502', () => {
    const shortHtml = `<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head><body><p>Quá ngắn</p><!-- UKNOW_LP_FORM --></body></html>`;
    expect(() => {
      validateEditHtmlOutput({
        currentHtml: baseValidHtml,
        newHtml: shortHtml,
      });
    }).toThrow(/viết lại toàn bộ trang/i);
  });

  it('bản cũ có <!-- UKNOW_LP_FORM --> nhưng bản mới bị mất → ném lỗi 502', () => {
    const withoutFormHtml = baseValidHtml.replace(LANDING_FORM_PLACEHOLDER, '');
    expect(() => {
      validateEditHtmlOutput({
        currentHtml: baseValidHtml,
        newHtml: withoutFormHtml,
      });
    }).toThrow(/mất vị trí form đăng ký/i);
  });

  it('bản cũ có /embed/lead-form (iframe nhúng) nhưng bản mới bị mất → ném lỗi 502', () => {
    const htmlWithIframe = baseValidHtml.replace(
      LANDING_FORM_PLACEHOLDER,
      '<iframe src="/embed/lead-form/slug-123" style="border:0;display:block;width:100%;"></iframe>'
    );
    const htmlWithoutIframe = baseValidHtml.replace(LANDING_FORM_PLACEHOLDER, '<p>Khách đã mất form</p>');

    expect(() => {
      validateEditHtmlOutput({
        currentHtml: htmlWithIframe,
        newHtml: htmlWithoutIframe,
      });
    }).toThrow(/mất khối form đăng ký nhúng/i);
  });

  it('bản cũ KHÔNG có marker form (hoặc đã bỏ từ trước) → bản mới không bắt buộc phải có marker', () => {
    const currentWithoutForm = baseValidHtml.replace(LANDING_FORM_PLACEHOLDER, '');
    const newWithoutForm = currentWithoutForm.replace('Tiêu đề', 'Tiêu đề mới');

    const isValid = validateEditHtmlOutput({
      currentHtml: currentWithoutForm,
      newHtml: newWithoutForm,
    });
    expect(isValid).toBe(true);
  });

  it('tăng quá 2 inline style so với bản cũ → ném lỗi 502', () => {
    const currentHtmlWith1Style = baseValidHtml.replace('Tiêu đề', '<span style="color:red">Tiêu đề</span>');
    // Thêm 3 inline styles mới (tổng thành 4, tăng 3 so với 1 -> > +2)
    const newHtmlWith4Styles = currentHtmlWith1Style
      .replace('Tiêu đề', '<span style="color:blue">Tiêu đề</span>')
      .replace('<header', '<header style="margin-top:10px"')
      .replace('<main', '<main style="padding:20px"');

    expect(() => {
      validateEditHtmlOutput({
        currentHtml: currentHtmlWith1Style,
        newHtml: newHtmlWith4Styles,
      });
    }).toThrow(/quá nhiều inline style/i);
  });

  it('tăng ≤ 2 inline style (hoặc giữ nguyên) → hợp lệ', () => {
    const currentHtmlWith1Style = baseValidHtml.replace('Tiêu đề', '<span style="color:red">Tiêu đề</span>');
    // Thêm 1 inline style mới (tổng thành 2, tăng 1 <= 2)
    const newHtmlWith2Styles = currentHtmlWith1Style.replace(
      'Tiêu đề',
      '<span style="color:blue">Tiêu đề</span>'
    ).replace('<header', '<header style="margin-top:10px"');

    const isValid = validateEditHtmlOutput({
      currentHtml: currentHtmlWith1Style,
      newHtml: newHtmlWith2Styles,
    });
    expect(isValid).toBe(true);
  });

  it('MAX_EDIT_HTML_INPUT_CHARS hằng số là 60000', () => {
    expect(MAX_EDIT_HTML_INPUT_CHARS).toBe(60000);
  });
});

describe('extractHtmlFromModelText', () => {
  it('vớt tài liệu đầy đủ dù model kèm lời dẫn', () => {
    const text = 'Đây là kết quả:\n<!DOCTYPE html><html><body><p>Xin chào</p></body></html>\nHy vọng giúp được bạn.';
    expect(extractHtmlFromModelText(text)).toBe('<!DOCTYPE html><html><body><p>Xin chào</p></body></html>');
  });

  it('vớt fragment trong code fence ```html', () => {
    const text = '```html\n<section class="py-10"><h1>Tiêu đề</h1></section>\n```';
    expect(extractHtmlFromModelText(text)).toBe('<section class="py-10"><h1>Tiêu đề</h1></section>');
  });

  it('code fence ```json KHÔNG bị nhận nhầm thành HTML', () => {
    const text = 'Kết quả cho bạn:\n```json\n{"title":"X","html":"<div>abc</div>"}\n```';
    expect(extractHtmlFromModelText(text)).toBe('');
  });

  it('model trả thẳng fragment không code fence', () => {
    expect(extractHtmlFromModelText('  <section><p>abc</p></section>  ')).toBe('<section><p>abc</p></section>');
  });

  it('văn bản thuần / rỗng → chuỗi rỗng', () => {
    expect(extractHtmlFromModelText('Tôi không thể thực hiện yêu cầu này.')).toBe('');
    expect(extractHtmlFromModelText('')).toBe('');
    expect(extractHtmlFromModelText(null)).toBe('');
  });
});
