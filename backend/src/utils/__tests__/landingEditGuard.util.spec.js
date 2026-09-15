import { describe, it, expect } from '@jest/globals';
import {
  extractHtmlFromModelText,
  validateEditHtmlOutput,
  LANDING_FORM_PLACEHOLDER,
  MAX_EDIT_HTML_INPUT_CHARS,
} from '../landingEditGuard.util.js';

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

describe('landingEditGuard.util', () => {
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

  it('MAX_TOKENS → ném lỗi 422 thông báo cắt ngắn', () => {
    expect(() => {
      validateEditHtmlOutput({
        currentHtml: baseValidHtml,
        newHtml: baseValidHtml,
        finishReason: 'MAX_TOKENS',
      });
    }).toThrow(/cắt ngắn/i);
  });

  it('bản cũ có <!DOCTYPE html> nhưng bản mới bị mất → ném lỗi 422', () => {
    const invalidHtml = baseValidHtml.replace('<!DOCTYPE html>', '');
    expect(() => {
      validateEditHtmlOutput({
        currentHtml: baseValidHtml,
        newHtml: invalidHtml,
      });
    }).toThrow(/<!DOCTYPE html>/i);
  });

  it('bản cũ có Tailwind CDN nhưng bản mới bị mất → ném lỗi 422', () => {
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

  it('AI sinh thêm placeholder mới {{company_name}} không có trong bản cũ → ném lỗi 422', () => {
    const invalidHtml = baseValidHtml.replace('Tiêu đề', '{{company_name}}');
    expect(() => {
      validateEditHtmlOutput({
        currentHtml: baseValidHtml,
        newHtml: invalidHtml,
      });
    }).toThrow(/\{\{\.\.\.\}\}/);
  });

  it('kết quả mới quá ngắn (< 0.6 độ dài cũ) → ném lỗi 422', () => {
    const shortHtml = `<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head><body><p>Quá ngắn</p><!-- UKNOW_LP_FORM --></body></html>`;
    expect(() => {
      validateEditHtmlOutput({
        currentHtml: baseValidHtml,
        newHtml: shortHtml,
      });
    }).toThrow(/viết lại toàn bộ trang/i);
  });

  it('bản cũ có <!-- UKNOW_LP_FORM --> nhưng bản mới bị mất → ném lỗi 422', () => {
    const withoutFormHtml = baseValidHtml.replace(LANDING_FORM_PLACEHOLDER, '');
    expect(() => {
      validateEditHtmlOutput({
        currentHtml: baseValidHtml,
        newHtml: withoutFormHtml,
      });
    }).toThrow(/mất vị trí form đăng ký/i);
  });

  it('bản cũ có /embed/lead-form (iframe nhúng) nhưng bản mới bị mất → ném lỗi 422', () => {
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

  it('bản cũ có data-uknow-lead-form (snippet tự chứa) nhưng bản mới bị mất → ném lỗi 422', () => {
    const snippetForm = '<form data-uknow-lead-form data-slug="demo" data-api-base="https://api.test/api"><input name="email"/></form>';
    const htmlWithSnippet = baseValidHtml.replace(LANDING_FORM_PLACEHOLDER, snippetForm);
    const htmlWithoutSnippet = baseValidHtml.replace(LANDING_FORM_PLACEHOLDER, '<p>Khách đã mất form</p>');

    expect(() => {
      validateEditHtmlOutput({
        currentHtml: htmlWithSnippet,
        newHtml: htmlWithoutSnippet,
      });
    }).toThrow(/mất form đăng ký nhúng \(snippet\)/i);
  });

  it('bản cũ có data-uknow-lead-form, bản mới vẫn giữ nguyên form đó → hợp lệ', () => {
    const snippetForm = '<form data-uknow-lead-form data-slug="demo" data-api-base="https://api.test/api"><input name="email"/></form>';
    const htmlWithSnippet = baseValidHtml.replace(LANDING_FORM_PLACEHOLDER, snippetForm);
    const editedHtml = htmlWithSnippet.replace(
      'class="text-2xl font-bold">Tiêu đề',
      'class="text-3xl font-extrabold text-blue-600">Tiêu đề mới cập nhật'
    );

    const isValid = validateEditHtmlOutput({
      currentHtml: htmlWithSnippet,
      newHtml: editedHtml,
    });
    expect(isValid).toBe(true);
  });

  it('bản cũ có data-founderai-capture (form hợp đồng mới) nhưng bản mới bị mất → ném lỗi 422', () => {
    const capForm = '<form data-founderai-capture><input name="name"/><input name="email"/><input name="phone"/></form>';
    const htmlWithCapForm = baseValidHtml.replace(LANDING_FORM_PLACEHOLDER, capForm);
    const htmlWithoutCapForm = baseValidHtml.replace(LANDING_FORM_PLACEHOLDER, '<p>Khách đã mất form</p>');

    expect(() => {
      validateEditHtmlOutput({
        currentHtml: htmlWithCapForm,
        newHtml: htmlWithoutCapForm,
      });
    }).toThrow(/mất form đăng ký/i);
  });

  it('bản cũ có data-founderai-capture, bản mới vẫn giữ nguyên form đó → hợp lệ', () => {
    const capForm = '<form data-founderai-capture><input name="name"/><input name="email"/><input name="phone"/></form>';
    const htmlWithCapForm = baseValidHtml.replace(LANDING_FORM_PLACEHOLDER, capForm);
    const editedHtml = htmlWithCapForm.replace(
      'class="text-2xl font-bold">Tiêu đề',
      'class="text-3xl font-extrabold text-blue-600">Tiêu đề mới cập nhật'
    );

    const isValid = validateEditHtmlOutput({
      currentHtml: htmlWithCapForm,
      newHtml: editedHtml,
    });
    expect(isValid).toBe(true);
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

  it('tăng quá 2 inline style so với bản cũ → ném lỗi 422', () => {
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

/**
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-5b-1.
 *
 * Khối nhúng Biểu mẫu (hợp đồng cố định PR-5): <section data-founderai-form-section> chứa
 * <div data-founderai-form="KEY">, <noscript>, và <script src=".../form-embed.js" defer>.
 * Trước bản vá này landingEditGuard.util.js chỉ canh form-lead cũ (data-founderai-capture,
 * :138) — không có chốt nào bảo vệ khối Biểu mẫu ở đường AI-edit.
 */
describe('landingEditGuard.util — chốt khối nhúng Biểu mẫu (PR-5b-1)', () => {
  const embedBlock = (key) =>
    `<section data-founderai-form-section><div data-founderai-form="${key}"></div>` +
    `<noscript><a href="https://founderai.biz/f/${key}">Mở biểu mẫu</a></noscript>` +
    `<script src="https://founderai.biz/form-embed.js" defer></script></section>`;

  const htmlWith = (...blocks) => baseValidHtml.replace(LANDING_FORM_PLACEHOLDER, blocks.join(''));

  it('HTML cũ có khối, HTML mới giữ nguyên khối + chỉ đổi màu nút khác → hợp lệ', () => {
    const current = htmlWith(embedBlock('pub_ABC123'));
    const next = current.replace(
      'class="text-2xl font-bold">Tiêu đề',
      'class="text-3xl font-extrabold text-blue-600">Tiêu đề mới cập nhật'
    );

    const isValid = validateEditHtmlOutput({ currentHtml: current, newHtml: next });
    expect(isValid).toBe(true);
  });

  it('HTML mới xoá cả khối nhúng → ném lỗi 422 "mất biểu mẫu nhúng"', () => {
    const current = htmlWith(embedBlock('pub_ABC123'));
    const next = current.replace(embedBlock('pub_ABC123'), '<p>Khách đã mất form</p>');

    expect(() => {
      validateEditHtmlOutput({ currentHtml: current, newHtml: next });
    }).toThrow(/mất biểu mẫu nhúng/i);
  });

  it('HTML mới giữ <div> nhưng đổi publicKey → ném lỗi 422', () => {
    const current = htmlWith(embedBlock('pub_ABC123'));
    const next = current.replace(/pub_ABC123/g, 'pub_XYZ999');

    expect(() => {
      validateEditHtmlOutput({ currentHtml: current, newHtml: next });
    }).toThrow(/mất biểu mẫu nhúng/i);
  });

  it('HTML mới giữ <div> đúng key nhưng mất thẻ <script form-embed.js> → ném lỗi 422', () => {
    const current = htmlWith(embedBlock('pub_ABC123'));
    const next = current.replace(
      '<script src="https://founderai.biz/form-embed.js" defer></script>',
      ''
    );

    expect(() => {
      validateEditHtmlOutput({ currentHtml: current, newHtml: next });
    }).toThrow(/mất biểu mẫu nhúng/i);
  });

  it('HTML cũ có 2 khối (2 publicKey khác nhau), HTML mới chỉ mất 1 khối → ném lỗi 422 (so TỪNG key, không chỉ so chuỗi)', () => {
    const current = htmlWith(embedBlock('pub_KEY_ONE'), embedBlock('pub_KEY_TWO'));
    // Chuỗi 'data-founderai-form' VẪN còn trong next (khối 1 còn) — nếu chốt chỉ so
    // .includes('data-founderai-form') thì sẽ lọt qua sai; phải so từng key mới bắt được.
    const next = current.replace(embedBlock('pub_KEY_TWO'), '');

    expect(() => {
      validateEditHtmlOutput({ currentHtml: current, newHtml: next });
    }).toThrow(/mất biểu mẫu nhúng/i);
  });

  it('HTML mới DI CHUYỂN cả khối nguyên vẹn xuống cuối trang → vẫn hợp lệ (không canh vị trí)', () => {
    const current = htmlWith(embedBlock('pub_ABC123'));
    const withoutBlockAtOldSpot = current.replace(embedBlock('pub_ABC123'), '');
    const next = withoutBlockAtOldSpot.replace('</body>', `${embedBlock('pub_ABC123')}</body>`);

    const isValid = validateEditHtmlOutput({ currentHtml: current, newHtml: next });
    expect(isValid).toBe(true);
  });

  it('trang không có khối Biểu mẫu → hành vi y như cũ, không đòi hỏi gì thêm', () => {
    const current = baseValidHtml.replace(LANDING_FORM_PLACEHOLDER, '');
    const next = current.replace('Tiêu đề', 'Tiêu đề mới, không liên quan biểu mẫu');

    const isValid = validateEditHtmlOutput({ currentHtml: current, newHtml: next });
    expect(isValid).toBe(true);
  });
});

/**
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, đính chính 16/09 → PR-5b-2c.
 *
 * Trình soạn landing gọi editHtml() ngay cả khi HTML CHƯA lưu còn chỗ trống chờ Biểu mẫu
 * (`<div data-founderai-form-slot></div>`, `AI_LANDING_FORM_MODE=form`, PR-5b-2a). Trước bản vá
 * này KHÔNG có chốt nào canh riêng cái này — AI bỏ chỗ trống / thay bằng <form> tự viết / nhét
 * nội dung vào bên trong đều lọt qua im lặng, landing publish ra KHÔNG có Biểu mẫu.
 */
describe('landingEditGuard.util — PR-5b-2c chỗ trống chờ Biểu mẫu (đính chính, đường AI-edit)', () => {
  const withSlot = (html = baseValidHtml) =>
    html.replace(LANDING_FORM_PLACEHOLDER, '<div data-founderai-form-slot></div>');

  it('HTML cũ có chỗ trống, HTML mới chỉ đổi màu nút khác → hợp lệ', () => {
    const current = withSlot();
    const next = current.replace(
      'class="text-2xl font-bold">Tiêu đề',
      'class="text-3xl font-extrabold text-blue-600">Tiêu đề mới cập nhật'
    );

    const isValid = validateEditHtmlOutput({ currentHtml: current, newHtml: next });
    expect(isValid).toBe(true);
  });

  it('HTML mới bỏ hẳn chỗ trống → ném lỗi 422', () => {
    const current = withSlot();
    const next = current.replace('<div data-founderai-form-slot></div>', '<p>Đăng ký nhận tin ngay hôm nay</p>');

    expect(() => {
      validateEditHtmlOutput({ currentHtml: current, newHtml: next });
    }).toThrow(/chỗ trống chờ Biểu mẫu/i);
  });

  it('HTML mới thay chỗ trống bằng <form> tự viết → ném lỗi 422', () => {
    const current = withSlot();
    const next = current.replace(
      '<div data-founderai-form-slot></div>',
      '<form data-founderai-capture><input name="email"/><button type="submit">Đăng ký</button></form>'
    );

    expect(() => {
      validateEditHtmlOutput({ currentHtml: current, newHtml: next });
    }).toThrow(/chỗ trống chờ Biểu mẫu/i);
  });

  it('HTML mới nhét nội dung con vào bên trong chỗ trống (sai dạng) → ném lỗi 422', () => {
    const current = withSlot();
    const next = current.replace(
      '<div data-founderai-form-slot></div>',
      '<div data-founderai-form-slot><p>Đăng ký ngay</p></div>'
    );

    expect(() => {
      validateEditHtmlOutput({ currentHtml: current, newHtml: next });
    }).toThrow(/chỗ trống chờ Biểu mẫu/i);
  });

  // Phản biện 16/09 điểm 2: chốt <form CHỈ áp khi bản cũ đang có chỗ trống — trang dùng form
  // capture bình thường (không phải form-mode) thêm hẳn một <form> khác (yêu cầu hợp lệ, không
  // liên quan chỗ trống) không được bị chặn nhầm.
  it('bản cũ KHÔNG có chỗ trống nào — thêm hẳn 1 <form> mới không bị chặn (chốt chỉ áp khi bản cũ CÓ chỗ trống)', () => {
    const current = baseValidHtml; // không có data-founderai-form-slot
    const next = current.replace(
      '</main>',
      '<form data-newsletter><input name="email"/><button type="submit">Nhận bản tin</button></form></main>'
    );

    const isValid = validateEditHtmlOutput({ currentHtml: current, newHtml: next });
    expect(isValid).toBe(true);
  });

  it('bản cũ có chỗ trống + thêm trường vào form capture khác trong cùng trang (không đụng chỗ trống) → vẫn hợp lệ', () => {
    // Trang hiếm gặp: vừa có chỗ trống chờ Biểu mẫu, vừa có form capture cũ còn sót lại y nguyên
    // — chỉnh sửa không đụng tới cái nào trong hai khối này thì vẫn qua bình thường.
    const capForm = '<form data-founderai-capture><input name="name"/><input name="email"/><input name="phone"/></form>';
    const current = withSlot(baseValidHtml).replace('</header>', `</header>${capForm}`);
    const next = current.replace(
      'class="text-2xl font-bold">Tiêu đề',
      'class="text-3xl font-extrabold text-blue-600">Tiêu đề mới cập nhật'
    );

    const isValid = validateEditHtmlOutput({ currentHtml: current, newHtml: next });
    expect(isValid).toBe(true);
  });
});

describe('extractHtmlFromModelText — HTML nằm trong chuỗi JSON hỏng (09/09: trang đầy \\n và \\")', () => {
  const doc = '<!DOCTYPE html>\n<html>\n<head><title>A</title></head>\n<body><img alt="FounderAI" src="/x.png" />\n<p class="py-2">Xin chào</p></body>\n</html>';
  const escaped = JSON.stringify(doc).slice(1, -1); // đúng thứ nằm bên trong "html": "..."

  it('JSON hỏng nhưng còn nguyên đoạn html thoát → giải mã ra HTML thật, không còn \\n/\\" chữ', () => {
    const broken = `{"title": "A", "html": "${escaped}"` /* thiếu } đóng → JSON.parse fail */;
    const out = extractHtmlFromModelText(broken);
    expect(out).toBe(doc);
    expect(out).not.toMatch(/\\n|\\"/);
  });

  it('JSON hỏng vì model chèn xuống dòng THẬT vào chuỗi (ca phổ biến) → vẫn giải mã được', () => {
    const mixed = escaped.replace('\\n<body>', '\n<body>'); // một chỗ là xuống dòng thật
    const out = extractHtmlFromModelText(`{"html": "${mixed}"}`);
    expect(out).toBe(doc);
  });

  it('thoát hỏng không giải mã được → trả rỗng để chốt 422 bắt, không phát hành rác', () => {
    const bad = '<!DOCTYPE html>\\n<html>\\n<body>\\n<p>\\u00ZZ</p>\\n</body>\\n</html>';
    expect(extractHtmlFromModelText(bad)).toBe('');
  });

  it('HTML thật có xuống dòng thật, không ký tự thoát → giữ nguyên (hồi quy)', () => {
    expect(extractHtmlFromModelText(`Đây là trang:\n${doc}\nHết.`)).toBe(doc);
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
