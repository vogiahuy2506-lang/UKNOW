/**
 * Escape HTML special characters (including quotes) for security.
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Check if a URL has a safe scheme (disallow javascript:, vbscript:, data:).
 * @param {string} url
 * @returns {boolean}
 */
export function isSafeUrl(url) {
  const trimmed = String(url || '').trim();
  if (/^(javascript|vbscript|data):/i.test(trimmed)) {
    return false;
  }
  return true;
}

/**
 * Format inline text (bold, italic, strikethrough).
 * Adheres to CommonMark rule for underscores: _ cannot trigger emphasis inside words (e.g. snake_case).
 * @param {string} text
 * @returns {string}
 */
function formatInlineText(text) {
  let s = text;
  // Bold: **text** or __text__ (non-intra-word for __)
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^\w*])__([^_]+)__(?![\w])/g, '$1<strong>$2</strong>');
  // Italic: *text* or _text_ (CommonMark: _ cannot be intra-word e.g. get_user_by_id)
  s = s.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^\w*])_([^_]+)_(?![\w])/g, '$1<em>$2</em>');
  // Strikethrough: ~~text~~
  s = s.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  return s;
}

/**
 * Parse inline markdown tokens after escaping HTML entities.
 * Uses placeholder stashing for atomic elements (code spans, images, links)
 * to prevent collisions between HTML attribute underscores (target="_blank", href="...")
 * and markdown inline syntax (_italic_).
 * @param {string} text
 * @returns {string}
 */
export function inline(text) {
  let s = escapeHtml(text);
  const stash = [];

  const stashToken = (html) => {
    const placeholder = `\u0000TOK${stash.length}\u0000`;
    stash.push(html);
    return placeholder;
  };

  // 1. Inline code: `code` -> stashed immediately so content isn't parsed as markdown
  s = s.replace(/`([^`]+)`/g, (_match, codeContent) => {
    return stashToken(`<code>${codeContent}</code>`);
  });

  // 2. Images: ![alt](url) -> MUST be processed before links [text](url)
  s = s.replace(/!\[([^\]]*)\]\(((?:[^()]+|\([^()]*\))*)\)/g, (_match, alt, url) => {
    const safeUrl = isSafeUrl(url) ? url : '#';
    return stashToken(`<img src="${safeUrl}" alt="${alt}">`);
  });

  // 3. Links: [text](url) -> label can have inline formatting, but the whole <a> tag is stashed.
  // Only off-site links open in a new tab; in-app and cross-article links (/app/..., another
  // article slug) stay in the same tab so reading several help pages doesn't spawn a tab each.
  s = s.replace(/\[([^\]]+)\]\(((?:[^()]+|\([^()]*\))*)\)/g, (_match, label, url) => {
    const safeUrl = isSafeUrl(url) ? url : '#';
    const formattedLabel = formatInlineText(label);
    const isExternal = /^(https?:|mailto:)/i.test(safeUrl);
    const attrs = isExternal ? ' rel="noopener noreferrer" target="_blank"' : '';
    return stashToken(`<a href="${safeUrl}"${attrs}>${formattedLabel}</a>`);
  });

  // 4. Bold, Italic, Strikethrough on the surrounding text
  s = formatInlineText(s);

  // 5. Restore stashed tokens in reverse order (handles nested tokens e.g. code inside link)
  for (let i = stash.length - 1; i >= 0; i--) {
    const token = `\u0000TOK${i}\u0000`;
    const val = stash[i];
    s = s.replaceAll(token, val);
  }

  return s;
}

/**
 * Build a nested tree from a flat list of {indent, ordered, content} items,
 * using an indent-stack (same idea as a bracket matcher): each new item pops
 * shallower/equal-indent frames off the stack before attaching under the
 * current deepest frame, which is what turns indentation into nesting.
 * @param {Array<{indent: number, ordered: boolean, content: string}>} items
 * @returns {Array<object>}
 */
function buildListNodes(items) {
  const root = { children: [] };
  const stack = [{ indent: -1, node: root }];
  for (const item of items) {
    while (stack.length > 1 && item.indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const node = {
      content: item.content,
      ordered: item.ordered,
      paras: item.paras || [],
      children: [],
    };
    stack[stack.length - 1].node.children.push(node);
    stack.push({ indent: item.indent, node });
  }
  return root.children;
}

/**
 * Render a list tree, grouping consecutive same-type siblings into one
 * <ul>/<ol> and nesting child lists inside their parent <li>.
 * @param {Array<object>} nodes
 * @returns {string}
 */
function renderListNodes(nodes) {
  let html = '';
  let i = 0;
  while (i < nodes.length) {
    const ordered = nodes[i].ordered;
    const tag = ordered ? 'ol' : 'ul';
    let group = '';
    while (i < nodes.length && nodes[i].ordered === ordered) {
      const node = nodes[i];
      const childHtml = node.children.length ? renderListNodes(node.children) : '';
      // Continuation paragraphs live INSIDE the <li> — moving them out would
      // split the surrounding <ol>, restarting its numbering at 1.
      const paraHtml = (node.paras || []).map((p) => `<p>${inline(p)}</p>`).join('');
      group += `<li>${inline(node.content)}${paraHtml}${childHtml}</li>`;
      i += 1;
    }
    html += `<${tag}>${group}</${tag}>`;
  }
  return html;
}

/**
 * Split a markdown table row into trimmed cell strings.
 * @param {string} line
 * @returns {string[]}
 */
function parseTableRow(line) {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map((cell) => cell.trim());
}

/**
 * Check if a line is a markdown table header separator (e.g. |---|:---:|---:|).
 * @param {string} line
 * @returns {boolean}
 */
function isTableSeparator(line) {
  const trimmed = line.trim();
  if (!trimmed.includes('-')) return false;
  const cells = parseTableRow(trimmed);
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

/**
 * Convert markdown to clean, semantic HTML suitable for TipTap RichTextEditor.
 * Supports headings, bullet/ordered lists, blockquotes, code blocks, tables, images, and inline styles.
 * @param {string} md
 * @returns {string}
 */
export function miniMarkdownToHtml(md) {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];

  let inCodeBlock = false;
  let codeLines = [];

  let listItems = []; // { indent, ordered, content, paras } — flat buffer, nested at flush time
  // Đã gặp dòng trống khi list đang mở. Chưa đóng list vội: dòng trống có thể chỉ
  // đang ngăn cách mục với đoạn con thụt lề của chính nó (vd chú thích ảnh).
  let pendingListBlank = false;
  let quoteLines = [];
  let tableLines = [];
  let paraLines = [];

  const flushCode = () => {
    if (!inCodeBlock) return;
    blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
    codeLines = [];
    inCodeBlock = false;
  };

  const flushList = () => {
    pendingListBlank = false;
    if (!listItems.length) return;
    blocks.push(renderListNodes(buildListNodes(listItems)));
    listItems = [];
  };

  const flushQuote = () => {
    if (!quoteLines.length) return;
    blocks.push(`<blockquote><p>${quoteLines.map((l) => inline(l)).join('<br>')}</p></blockquote>`);
    quoteLines = [];
  };

  const flushTable = () => {
    if (!tableLines.length) return;
    if (tableLines.length >= 2 && isTableSeparator(tableLines[1])) {
      const headerCells = parseTableRow(tableLines[0]);
      const thead = `<thead><tr>${headerCells.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>`;
      const bodyRows = tableLines.slice(2).map((rowLine) => {
        const cells = parseTableRow(rowLine);
        return `<tr>${cells.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`;
      });
      const tbody = bodyRows.length ? `<tbody>${bodyRows.join('')}</tbody>` : '';
      blocks.push(`<table>${thead}${tbody}</table>`);
    } else {
      tableLines.forEach((tl) => {
        blocks.push(`<p>${inline(tl)}</p>`);
      });
    }
    tableLines = [];
  };

  const flushPara = () => {
    if (!paraLines.length) return;
    blocks.push(`<p>${inline(paraLines.join(' '))}</p>`);
    paraLines = [];
  };

  const flushAll = () => {
    flushPara();
    flushList();
    flushQuote();
    flushTable();
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    // 1. Check Fenced Code Block start/end
    if (/^```|^~~~/.test(trimmed)) {
      if (inCodeBlock) {
        flushCode();
      } else {
        flushAll();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(raw);
      continue;
    }

    // 2. Empty line
    if (!trimmed) {
      // List đang mở: giữ nguyên, chờ xem dòng kế tiếp có phải đoạn con thụt lề
      // của mục hiện tại không. Nếu không phải, nhánh 7 bên dưới sẽ đóng list.
      if (listItems.length) {
        flushPara();
        flushQuote();
        flushTable();
        pendingListBlank = true;
        continue;
      }
      flushAll();
      continue;
    }

    // 3. Headings (# -> H2, ## -> H3, ### and deeper -> H4 — editor schema tops out at H4)
    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushAll();
      const level = Math.min(heading[1].length + 1, 4);
      blocks.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    // 4. Horizontal Rule (--- or *** or ___)
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
      flushAll();
      blocks.push('<hr>');
      continue;
    }

    // 5. Blockquotes (> text)
    const quoteMatch = trimmed.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      flushPara();
      flushList();
      flushTable();
      quoteLines.push(quoteMatch[1]);
      continue;
    }
    flushQuote();

    // 6/7. Lists (bullet or ordered) — read indent from the RAW line (not
    // trimmed) so nested items (2+ spaces in) stay children of their parent
    // instead of collapsing onto the top level.
    const listMatch = raw.match(/^(\s*)([-*+]|\d+\.)\s+(.+)$/);
    if (listMatch) {
      flushPara();
      flushQuote();
      flushTable();
      const indent = listMatch[1].length;
      const ordered = /^\d+\.$/.test(listMatch[2]);
      pendingListBlank = false;
      listItems.push({ indent, ordered, content: listMatch[3], paras: [] });
      continue;
    }

    // 7. Đoạn con thụt lề của mục list đang mở (continuation paragraph).
    // Nhờ nhánh này mà chú thích ảnh nằm giữa các mục không cắt đôi <ol>, số thứ
    // tự chạy liền 1..n thay vì reset về 1 sau mỗi ảnh.
    if (listItems.length && /^\s{2,}/.test(raw)) {
      const lastItem = listItems[listItems.length - 1];
      if (pendingListBlank) {
        lastItem.paras.push(trimmed);
        pendingListBlank = false;
      } else {
        // Không có dòng trống ngăn cách → vẫn là cùng một đoạn với nội dung mục.
        lastItem.content += ` ${trimmed}`;
      }
      continue;
    }
    flushList();

    // 8. Tables (| Header | Header |)
    if (trimmed.includes('|')) {
      if (tableLines.length > 0) {
        tableLines.push(trimmed);
        continue;
      } else if (i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
        flushPara();
        tableLines.push(trimmed);
        continue;
      }
    }
    flushTable();

    // 9. Normal paragraph text
    paraLines.push(trimmed);
  }

  if (inCodeBlock) {
    flushCode();
  } else {
    flushAll();
  }

  return blocks.join('') || '<p></p>';
}
