#!/usr/bin/env node
/**
 * Tải ảnh đã chụp lên rồi chèn vào đúng ô chú thích "[ẢNH: …]" của bài hướng dẫn.
 *
 * Đi bằng API sẵn có chứ KHÔNG ghi thẳng SQL, để dùng lại đúng đường đã kiểm
 * chứng: kiểm dung lượng, sanitize HTML, và tự đánh chỉ mục lại cho RAG.
 *
 *   POST  /api/uploads/help-image        → tải ảnh, trả URL
 *   GET   /api/help/admin/articles       → tìm bài theo slug
 *   PATCH /api/help/admin/articles/:id   → ghi body_html mới
 *
 * Chạy trên MÁY CỦA BẠN (không cần SSH vào VPS):
 *
 *   # 1. Lấy access token: mở founderai.biz (đã đăng nhập), F12 → Console →
 *   #    copy(localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken'))
 *   export HELP_API_TOKEN='...'
 *   export HELP_API_URL='https://founderai.biz/api'      # mặc định
 *
 *   node backend/scripts/insertHelpScreenshots.js e2e/screenshots/out/doi-goi
 *   node backend/scripts/insertHelpScreenshots.js e2e/screenshots/out/doi-goi --apply
 *
 * Không có --apply thì chỉ in ra sẽ làm gì, không tải và không ghi.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  replaceCaptionWithImage,
  listCaptionSlots,
  normalizeCaption,
} from '../src/utils/helpCaptionReplace.util.js';

/**
 * Ô này đã được thay bằng ảnh ở lần chạy trước chưa?
 *
 * Nhận ra qua thuộc tính alt: script chèn lấy chính chú thích làm alt, nên ảnh
 * đã chèn vẫn mang dấu vết của ô nó thay thế.
 */
function isAlreadyInserted(html, captionKey) {
  const key = normalizeCaption(captionKey);
  const tags = String(html).match(/<img\b[^>]*\balt="([^"]*)"/g) || [];
  return tags.some((tag) => normalizeCaption(tag.match(/alt="([^"]*)"/)?.[1] ?? '').includes(key));
}

const API_URL = (process.env.HELP_API_URL || 'https://founderai.biz/api').replace(/\/$/, '');
const TOKEN = process.env.HELP_API_TOKEN;
const apply = process.argv.includes('--apply');
const inputDir = process.argv.find((arg) => !arg.startsWith('-') && arg.includes('out'));

async function api(pathname, options = {}) {
  const res = await fetch(`${API_URL}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  });
  const text = await res.text();
  let payload;
  try { payload = JSON.parse(text); } catch { payload = { raw: text }; }
  if (!res.ok) {
    const error = new Error(`${options.method || 'GET'} ${pathname} → ${res.status}: ${payload.message || text.slice(0, 200)}`);
    error.status = res.status;
    // express-rate-limit (standardHeaders) trả RateLimit-Reset = số giây còn lại.
    error.retryAfterSec = Number(res.headers.get('retry-after'))
      || Number(res.headers.get('ratelimit-reset'))
      || null;
    throw error;
  }
  return payload;
}

/**
 * Tải một ảnh lên, tự chờ khi đụng trần tải lên.
 *
 * `/uploads/help-image` giới hạn 20 file / 15 phút. Một lô ảnh minh hoạ dễ chạm
 * trần khi chèn liền mấy bài, và hỏng giữa chừng thì những ảnh đã lên nằm lại
 * trong kho mà không bài nào trỏ tới — chạy lại là đẻ thêm một lứa mồ côi nữa.
 * Chờ hết cửa sổ rồi đi tiếp rẻ hơn nhiều so với dọn rác.
 */
async function uploadImage(filePath, { onWait } = {}) {
  const buffer = await fs.readFile(filePath);

  for (let attempt = 0; ; attempt += 1) {
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: 'image/png' }), path.basename(filePath));
    try {
      const payload = await api('/uploads/help-image', { method: 'POST', body: form });
      const url = payload?.data?.url || payload?.result?.url || payload?.url;
      if (!url) throw new Error(`không lấy được URL sau khi tải ảnh: ${JSON.stringify(payload).slice(0, 200)}`);
      return url;
    } catch (error) {
      if (error.status !== 429 || attempt >= 2) throw error;
      const waitSec = Math.min(error.retryAfterSec || 15 * 60, 16 * 60) + 5;

      // Chờ xong mới phát hiện token chết là mất trắng cả quãng chờ. Biết trước
      // thì dừng ngay để người chạy đi lấy token mới.
      const left = tokenSecondsLeft();
      if (left !== null && left < waitSec) {
        throw new Error(
          `chạm trần tải lên, phải chờ ${Math.ceil(waitSec / 60)} phút, nhưng token chỉ còn `
          + `${Math.max(0, Math.floor(left / 60))} phút. Lấy token mới rồi chạy lại — `
          + 'bài viết chưa bị ghi gì.',
        );
      }
      onWait?.(waitSec);
      await new Promise((resolve) => { setTimeout(resolve, waitSec * 1000); });
    }
  }
}

/**
 * Còn bao nhiêu giây nữa token hết hạn, đọc từ chính JWT (`exp`).
 *
 * Chỉ giải mã phần payload, KHÔNG kiểm chữ ký — ở đây chỉ cần biết hạn để
 * cảnh báo sớm, việc xác thực thật là của server.
 *
 * @returns {number|null} null nếu không đọc được hạn.
 */
function tokenSecondsLeft() {
  try {
    const payload = JSON.parse(Buffer.from(String(TOKEN).split('.')[1], 'base64url').toString('utf8'));
    if (!payload?.exp) return null;
    return Math.round(payload.exp - Date.now() / 1000);
  } catch {
    return null;
  }
}

async function main() {
  if (!TOKEN) throw new Error('Thiếu HELP_API_TOKEN — xem hướng dẫn ở đầu file.');

  // Chờ hết cửa sổ tải lên có thể kéo tới 15 phút. Token sắp hết hạn mà cứ chờ
  // thì đợi xong lại chết vì 401 — mất trắng thời gian chờ. Báo trước.
  const secondsLeft = tokenSecondsLeft();
  if (secondsLeft !== null && secondsLeft <= 0) {
    throw new Error('HELP_API_TOKEN đã hết hạn — lấy token mới rồi chạy lại.');
  }
  if (apply && secondsLeft !== null && secondsLeft < 20 * 60) {
    console.log(
      `⚠ Token chỉ còn ${Math.floor(secondsLeft / 60)} phút. Trần tải lên là 20 file/15 phút,`
      + ' chạm trần là phải chờ — token có thể chết giữa chừng.\n'
      + '  Lấy token mới trước cho chắc.\n',
    );
  }
  if (!inputDir) throw new Error('Thiếu đường dẫn thư mục ảnh, ví dụ: e2e/screenshots/out/doi-goi');

  const manifest = JSON.parse(await fs.readFile(path.join(inputDir, 'manifest.json'), 'utf8'));
  console.log(`Bài: ${manifest.slug} — ${manifest.shots.length} ảnh\n`);

  const list = await api('/help/admin/articles');
  const articles = list?.result || list?.data || [];
  const article = articles.find((a) => a.slug === manifest.slug && (a.locale || 'vi') === 'vi');
  if (!article) throw new Error(`không tìm thấy bài "${manifest.slug}" bản tiếng Việt`);

  const detail = await api(`/help/admin/articles/${article.id}`);
  let html = (detail?.result || detail?.data || detail)?.body_html;
  if (!html) throw new Error('bài này chưa có body_html');

  const slotsBefore = listCaptionSlots(html).length;
  const planned = [];

  // Vòng 1: kiểm mọi ô khớp được trước khi tải bất kỳ ảnh nào lên. Tải rồi mới
  // phát hiện khoá sai thì ảnh đã nằm trong kho, tính vào dung lượng, mà không
  // bài nào dùng tới.
  let probe = html;
  let alreadyDone = 0;
  for (const shot of manifest.shots) {
    const trial = replaceCaptionWithImage(probe, shot.caption, 'https://example.invalid/probe.png');
    if (!trial.ok) {
      // Ô đã được thay bằng ảnh ở lần chạy trước thì không còn chú thích để khớp
      // nữa. Báo "không tìm thấy" ở đây khiến người chạy tưởng khoá sai và đi sửa
      // file shots — trong khi thực ra chẳng có gì phải làm.
      if (isAlreadyInserted(html, shot.caption)) {
        console.log(`  · ${shot.name}: đã chèn từ trước, bỏ qua`);
        alreadyDone += 1;
        continue;
      }
      console.log(`  ✗ ${shot.name}: ${trial.reason}`);
      console.log(`      khoá: "${shot.caption}"`);
      continue;
    }
    probe = trial.html;
    planned.push(shot);
    console.log(`  ✓ ${shot.name} → ô "${trial.caption.slice(0, 60)}…"`);
  }

  const doneNote = alreadyDone ? ` (${alreadyDone} ảnh đã chèn từ trước)` : '';
  if (!planned.length) {
    console.log(
      alreadyDone === manifest.shots.length
        ? `\nKhông còn gì để làm — cả ${alreadyDone} ảnh đều đã chèn từ trước.`
        : `\nKhông ô nào khớp${doneNote} — sửa lại \`caption\` trong file shots/ rồi chạy lại.`,
    );
    return;
  }
  console.log(`\n${planned.length}/${manifest.shots.length} ảnh sẽ được chèn${doneNote}.`);

  if (!apply) {
    console.log('Mới chỉ kiểm tra, CHƯA tải ảnh và CHƯA ghi gì. Thêm --apply để thực hiện.');
    return;
  }

  for (const shot of planned) {
    const url = await uploadImage(path.join(inputDir, shot.file), {
      onWait: (sec) => console.log(
        `  … chạm trần tải lên (20 file/15 phút) — chờ ${Math.ceil(sec / 60)} phút rồi tải tiếp.`
        + ' Đừng tắt: bài viết chỉ được ghi sau khi tải xong hết.',
      ),
    });
    const out = replaceCaptionWithImage(html, shot.caption, url);
    if (!out.ok) throw new Error(`${shot.name}: ${out.reason} (lẽ ra vòng kiểm đã bắt được)`);
    html = out.html;
    console.log(`  ↑ ${shot.name} đã tải lên`);
  }

  await api(`/help/admin/articles/${article.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ body_html: html }),
  });

  const slotsAfter = listCaptionSlots(html).length;
  console.log(`\nĐã chèn ${planned.length} ảnh vào "${manifest.slug}".`);
  console.log(`Ô chú thích còn lại: ${slotsBefore} → ${slotsAfter}`);
}

main().catch((error) => {
  console.error(`[insertHelpScreenshots] THẤT BẠI: ${error.message}`);
  process.exitCode = 1;
});
