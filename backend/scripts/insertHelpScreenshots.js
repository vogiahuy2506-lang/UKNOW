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
import { replaceCaptionWithImage, listCaptionSlots } from '../src/utils/helpCaptionReplace.util.js';

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
    throw new Error(`${options.method || 'GET'} ${pathname} → ${res.status}: ${payload.message || text.slice(0, 200)}`);
  }
  return payload;
}

async function uploadImage(filePath) {
  const buffer = await fs.readFile(filePath);
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'image/png' }), path.basename(filePath));
  const payload = await api('/uploads/help-image', { method: 'POST', body: form });
  const url = payload?.data?.url || payload?.result?.url || payload?.url;
  if (!url) throw new Error(`không lấy được URL sau khi tải ảnh: ${JSON.stringify(payload).slice(0, 200)}`);
  return url;
}

async function main() {
  if (!TOKEN) throw new Error('Thiếu HELP_API_TOKEN — xem hướng dẫn ở đầu file.');
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
  for (const shot of manifest.shots) {
    const trial = replaceCaptionWithImage(probe, shot.caption, 'https://example.invalid/probe.png');
    if (!trial.ok) {
      console.log(`  ✗ ${shot.name}: ${trial.reason}`);
      console.log(`      khoá: "${shot.caption}"`);
      continue;
    }
    probe = trial.html;
    planned.push(shot);
    console.log(`  ✓ ${shot.name} → ô "${trial.caption.slice(0, 60)}…"`);
  }

  if (!planned.length) {
    console.log('\nKhông ô nào khớp — sửa lại `caption` trong file shots/ rồi chạy lại.');
    return;
  }
  console.log(`\n${planned.length}/${manifest.shots.length} ảnh sẽ được chèn.`);

  if (!apply) {
    console.log('Mới chỉ kiểm tra, CHƯA tải ảnh và CHƯA ghi gì. Thêm --apply để thực hiện.');
    return;
  }

  for (const shot of planned) {
    const url = await uploadImage(path.join(inputDir, shot.file));
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
