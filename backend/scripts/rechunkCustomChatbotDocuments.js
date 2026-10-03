#!/usr/bin/env node
/**
 * PLAN_SUA_AI_DOT2_2026-10-03 G1.7 — nạp lại tài liệu kiến thức CŨ của chatbot Studio (custom_chatbot_documents).
 *
 * Vì sao: trước G1 (chunkText chỉ tách ở dòng trống, DOCX/XLSX/PDF thô không có dòng trống) có tài liệu bị lưu thành MỘT đoạn
 * hàng trăm nghìn ký tự (production 03/10/2026: 255 đoạn, max 219.902, 13 đoạn > 8.000). Trần prompt (G1.3) đã chặn chi phí;
 * script này chữa gốc: chia lại + embed lại, để chatbot tìm đúng đoạn thay vì đoạn khổng lồ.
 *
 * Với mỗi tài liệu `ready` có đoạn > 1.500 ký tự (ngưỡng đổi bằng --max-chunk):
 *   - tệp PDF mà `content_text` là RÁC của bộ đọc thô cũ (xem utils/kbTextQuality.util.js: cấu trúc PDF còn nguyên dạng chữ,
 *     hoặc tài liệu nạp trước 24/08/2026 11:47 +07 mà tỉ lệ ký hiệu bất thường) → KHÔNG chia lại rác: xoá các đoạn rác và đánh dấu
 *     `status='error'` + lý do "Tệp PDF cần tải lên lại" (chủ thấy trong Studio và tải lại tệp; nạp lại cùng tên là ghi đè);
 *   - còn lại (DOCX/XLSX/văn bản/URL…) → chia lại từ `content_text` đã lưu (không cần khách tải lại) + embed lại, thay toàn bộ
 *     đoạn của tài liệu trong MỘT giao dịch.
 * Cũng quét mọi tài liệu `file` còn `source_key` lỗi mã hoá ("chuyÃªn" ← multer đọc latin1) và sửa lại UTF-8 (cả `title` nếu
 * trùng khoá và cột `source` của các đoạn); trùng khoá với tài liệu khác của cùng chatbot thì bỏ qua và báo.
 * Cả tệp PDF rác nhỏ (chưa có đoạn > 1.500) cũng bị đánh dấu `error` — bot đang đọc rác như nhau.
 *
 * An toàn:
 *   - MẶC ĐỊNH là chạy thử (dry-run): chỉ đọc, không ghi, không gọi Google. `--apply` mới ghi.
 *   - Ghi một tài liệu = một giao dịch dưới khoá hạn mức KB của chủ (cùng khoá với tải lên/xoá tài liệu) + kiểm
 *     `updated_at` không đổi từ lúc đọc (khách sửa giữa chừng thì bỏ qua tài liệu đó).
 *   - Embed LỖI → tài liệu giữ nguyên (đoạn cũ vẫn bị cắt bởi trần prompt), ghi vào báo cáo; 3 lỗi embed liên tiếp → dừng cả lượt
 *     (Google quá tải: đừng gõ thêm). Chạy lại sau là tiếp tục được — idempotent (tài liệu đã xử lý không còn là ứng viên).
 *   - Embed tính token cho chủ tài liệu (feature embedding_custom_chat_doc), không trừ credit.
 *
 * Cách chạy trên production (script nạp .env bằng `-r dotenv/config`; cần DB_* và GEMINI_API_KEY trong .env):
 *   docker exec uknow-campaign-backend node -r dotenv/config scripts/rechunkCustomChatbotDocuments.js            # chạy thử, in báo cáo
 *   docker exec uknow-campaign-backend node -r dotenv/config scripts/rechunkCustomChatbotDocuments.js --apply    # ghi thật
 * Tuỳ chọn: --chatbot <id> | --owner <id> | --doc <id> (thu hẹp)  --limit <n> (tối đa n tài liệu)  --max-chunk <n> (mặc định 1500)
 * Mã thoát: 0 xong; 1 lỗi; 2 tham số sai; 3 dừng sớm vì embed lỗi liên tiếp.
 */
import db from '../src/config/database.js';
import { chunkText, CHUNK_MAX_CHARS } from '../src/utils/kbChunker.util.js';
import { PDF_PARSER_FIX_AT, detectRawPdfGarbage } from '../src/utils/kbTextQuality.util.js';
import { decodeUploadFilename } from '../src/utils/uploadFilename.util.js';
import customChatDocumentRepository from '../src/repositories/ai/customChatDocument.repository.js';
import { withKbQuotaLock } from '../src/services/storage/kbQuota.service.js';

export const PDF_REUPLOAD_MESSAGE = 'Tệp PDF cần tải lên lại: bản đọc cũ của hệ thống không trích được chữ từ tệp này. '
  + 'Vui lòng tải lại đúng tệp PDF này lên (cùng tên sẽ ghi đè tài liệu này).';

const MAX_CONSECUTIVE_EMBED_FAILURES = 3;

/** Embed mặc định: đúng đường tải lên bình thường (có thử lại + ghi token cho chủ). Nạp lười để chạy thử không cần cấu hình AI. */
async function defaultEmbedChunks(chunks, ownerUserId) {
  const { default: customChatService } = await import('../src/services/ai/customChat.service.js');
  return customChatService.generateEmbeddings(chunks, ownerUserId);
}

function isPdfName(sourceKey) {
  return /\.pdf$/i.test(String(sourceKey || '').trim());
}

/** Khoá đã sửa mã hoá nếu là tài liệu `file` có tên mojibake; ngược lại trả đúng khoá hiện tại. */
export function fixedSourceKey(doc) {
  if (doc.source_type !== 'file') return doc.source_key;
  return decodeUploadFilename(doc.source_key).normalize('NFC');
}

/**
 * Phân loại một tài liệu (hàm thuần, không ghi, không đụng DB).
 * @returns {{ action: 'none'|'rechunk'|'mark_error'|'rename_only'|'skip', reason?: string, newKey: string, renameNeeded: boolean,
 *             chunks?: string[], garbage?: object, beforeParserFix?: boolean }}
 */
export function planDocument(doc, { maxChunkChars = CHUNK_MAX_CHARS } = {}) {
  const newKey = fixedSourceKey(doc);
  const renameNeeded = newKey !== doc.source_key;
  const oversized = Number(doc.max_chunk_chars || 0) > maxChunkChars;

  if (doc.status === 'ready' && doc.source_type === 'file' && isPdfName(doc.source_key) && doc.content_text) {
    const beforeParserFix = new Date(doc.updated_at_iso).getTime() < new Date(PDF_PARSER_FIX_AT).getTime();
    const garbage = detectRawPdfGarbage(doc.content_text, { beforeParserFix });
    if (garbage.garbage) {
      return { action: 'mark_error', reason: `pdf_rac_${garbage.reason}`, newKey, renameNeeded, garbage, beforeParserFix };
    }
  }

  if (doc.status === 'ready' && oversized) {
    if (!doc.content_text || !String(doc.content_text).trim()) {
      return { action: 'skip', reason: 'khong_co_content_text', newKey, renameNeeded };
    }
    const chunks = chunkText(doc.content_text);
    if (chunks.length === 0) return { action: 'skip', reason: 'chia_ra_rong', newKey, renameNeeded };
    return { action: 'rechunk', newKey, renameNeeded, chunks };
  }

  return { action: renameNeeded ? 'rename_only' : 'none', newKey, renameNeeded };
}

const SELECT_DOCS_SQL = `
  SELECT d.id, d.chatbot_id, d.owner_user_id, d.source_type, d.source_key, d.title, d.status,
         d.content_text, d.extracted_chars, d.chunk_count,
         d.updated_at::text AS updated_at,
         to_char(d.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at_iso,
         (SELECT COUNT(*)::int FROM custom_chatbot_chunks c WHERE c.document_id = d.id) AS chunks_before,
         (SELECT COALESCE(MAX(char_length(c.chunk_text)), 0)::int FROM custom_chatbot_chunks c WHERE c.document_id = d.id) AS max_chunk_chars
    FROM custom_chatbot_documents d
   WHERE d.status = 'ready'
     AND ($2::bigint IS NULL OR d.chatbot_id = $2)
     AND ($3::bigint IS NULL OR d.owner_user_id = $3)
     AND ($4::bigint IS NULL OR d.id = $4)
     AND (
       EXISTS (SELECT 1 FROM custom_chatbot_chunks c WHERE c.document_id = d.id AND char_length(c.chunk_text) > $1)
       OR (d.source_type = 'file' AND d.source_key ~* '\\.pdf$')
       OR (d.source_type = 'file' AND d.source_key !~ '^[\\x01-\\x7f]*$')
     )
   ORDER BY d.id`;

function describeDoc(doc) {
  return `tài liệu ${doc.id} (chatbot ${doc.chatbot_id}, chủ ${doc.owner_user_id}, ${doc.source_type}) "${doc.source_key}"`;
}

/** Đã có tài liệu KHÁC của cùng chatbot mang khoá `newKey` chưa (UNIQUE chatbot_id + source_key). */
async function keyClashes(queryable, doc, newKey) {
  const { rows } = await queryable.query(
    `SELECT 1 FROM custom_chatbot_documents WHERE chatbot_id = $1 AND source_key = $2 AND id <> $3 LIMIT 1`,
    [doc.chatbot_id, newKey, doc.id]
  );
  return rows.length > 0;
}

/**
 * Ghi MỘT tài liệu trong giao dịch dưới khoá hạn mức KB của chủ.
 * @returns {Promise<{ written: boolean, skipReason?: string, renamed?: boolean, renameBlocked?: boolean }>}
 */
async function writeDocument(doc, plan, { vectors } = {}) {
  return withKbQuotaLock(doc.owner_user_id, async ({ client }) => {
    // Khoá hàng + kiểm không ai sửa từ lúc đọc (so bằng chuỗi timestamptz, đủ micro giây).
    const { rows: locked } = await client.query(
      `SELECT id FROM custom_chatbot_documents
        WHERE id = $1 AND status = 'ready' AND updated_at = $2::timestamptz
          FOR UPDATE`,
      [doc.id, doc.updated_at]
    );
    if (locked.length === 0) return { written: false, skipReason: 'da_thay_doi_giua_chung' };

    const renameBlocked = plan.renameNeeded && await keyClashes(client, doc, plan.newKey);
    const finalKey = plan.renameNeeded && !renameBlocked ? plan.newKey : doc.source_key;
    const renamed = finalKey !== doc.source_key;

    if (plan.action === 'mark_error') {
      await client.query(`DELETE FROM custom_chatbot_chunks WHERE document_id = $1`, [doc.id]);
      await customChatDocumentRepository.markError(doc.id, PDF_REUPLOAD_MESSAGE, client);
    } else if (plan.action === 'rechunk') {
      await customChatDocumentRepository.replaceChunks({
        documentId: doc.id,
        chatbotId: doc.chatbot_id,
        userId: doc.owner_user_id,
        chunks: plan.chunks,
        embeddings: vectors,
        source: finalKey,
      }, client);
      await customChatDocumentRepository.markReady(doc.id, plan.chunks.length, client);
    }

    if (renamed) {
      await client.query(
        `UPDATE custom_chatbot_documents
            SET source_key = $2, title = CASE WHEN title = $3 THEN $2 ELSE title END, updated_at = NOW()
          WHERE id = $1`,
        [doc.id, finalKey, doc.source_key]
      );
      await client.query(`UPDATE custom_chatbot_chunks SET source = $2 WHERE document_id = $1`, [doc.id, finalKey]);
    }
    return { written: true, renamed, renameBlocked };
  });
}

/**
 * @param {object} [options]
 * @param {boolean} [options.apply=false] true mới ghi; mặc định chạy thử.
 * @param {number|null} [options.chatbotId] @param {number|null} [options.ownerId] @param {number|null} [options.documentId]
 * @param {number|null} [options.limit] số tài liệu tối đa cần xử lý
 * @param {number} [options.maxChunkChars=1500]
 * @param {(chunks: string[], ownerUserId: number) => Promise<number[][]>} [options.embedChunks] thế được khi test
 * @param {(line: string) => void} [options.log]
 * @returns {Promise<object>} bản tóm tắt
 */
export async function runRechunk({
  apply = false,
  chatbotId = null,
  ownerId = null,
  documentId = null,
  limit = null,
  maxChunkChars = CHUNK_MAX_CHARS,
  embedChunks = defaultEmbedChunks,
  log = console.log,
} = {}) {
  if (apply && embedChunks === defaultEmbedChunks && !String(process.env.GEMINI_API_KEY || '').trim()) {
    throw new Error('Thiếu GEMINI_API_KEY: không thể embed lại. Đặt khoá rồi chạy lại (hoặc bỏ --apply để chạy thử).');
  }

  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    scanned: 0,
    candidates: 0,
    rechunked: 0,
    chunksBefore: 0,
    chunksAfter: 0,
    maxChunkBefore: 0,
    maxChunkAfter: 0,
    embeddedChunks: 0,
    embeddedChars: 0,
    markedError: 0,
    deletedChunks: 0,
    renamed: 0,
    renameBlocked: 0,
    skipped: [],
    embedFailed: [],
    changedConcurrently: [],
    aborted: false,
  };

  const recordRechunk = (doc, plan) => {
    summary.rechunked += 1;
    summary.chunksBefore += doc.chunks_before;
    summary.chunksAfter += plan.chunks.length;
    summary.maxChunkBefore = Math.max(summary.maxChunkBefore, doc.max_chunk_chars);
    summary.maxChunkAfter = Math.max(summary.maxChunkAfter, ...plan.chunks.map((chunk) => chunk.length));
    summary.embeddedChunks += plan.chunks.length;
    summary.embeddedChars += plan.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  };
  const recordMarkError = (doc) => {
    summary.markedError += 1;
    summary.deletedChunks += doc.chunks_before;
    summary.maxChunkBefore = Math.max(summary.maxChunkBefore, doc.max_chunk_chars);
  };
  const recordRename = ({ renamed, blocked }) => {
    if (renamed) summary.renamed += 1;
    if (blocked) summary.renameBlocked += 1;
  };

  const { rows } = await db.query(SELECT_DOCS_SQL, [maxChunkChars, chatbotId, ownerId, documentId]);
  summary.scanned = rows.length;
  log(`[rechunk] chế độ: ${apply ? 'GHI THẬT (--apply)' : 'CHẠY THỬ (không ghi, không gọi Google)'}; quét ${rows.length} tài liệu ứng viên (ready; có đoạn > ${maxChunkChars} ký tự, hoặc tệp PDF, hoặc tên tệp lỗi mã hoá).`);

  let consecutiveEmbedFailures = 0;

  for (const doc of rows) {
    const plan = planDocument(doc, { maxChunkChars });
    if (plan.action === 'none') continue;
    if (limit != null && summary.candidates >= limit) {
      log(`[rechunk] đạt --limit ${limit}, dừng.`);
      break;
    }
    summary.candidates += 1;

    if (plan.action === 'skip') {
      summary.skipped.push({ id: doc.id, reason: plan.reason });
      log(`[rechunk] BỎ QUA ${describeDoc(doc)}: ${plan.reason}`);
      continue;
    }

    // Chạy thử: đọc-chỉ để biết trùng khoá; chạy thật: kết quả thật do writeDocument trả về.
    const dryClash = !apply && plan.renameNeeded ? await keyClashes(db, doc, plan.newKey) : false;
    const renameNote = plan.renameNeeded
      ? (dryClash ? ` · KHÔNG đổi khoá "${plan.newKey}" (trùng tài liệu khác)` : ` · đổi khoá → "${plan.newKey}"`)
      : '';

    if (plan.action === 'mark_error') {
      log(`[rechunk] PDF RÁC ${describeDoc(doc)}: ${doc.chunks_before} đoạn (max ${doc.max_chunk_chars}), lý do ${plan.reason}`
        + ` (markers=${plan.garbage.metrics.markers}, symbolRatio=${plan.garbage.metrics.symbolRatio.toFixed(2)}, nạp trước bản vá bộ đọc: ${plan.beforeParserFix ? 'có' : 'không'})`
        + ` → ${apply ? 'ĐÁNH DẤU error + xoá đoạn rác' : 'sẽ đánh dấu error + xoá đoạn rác'}${renameNote}`);
    } else if (plan.action === 'rename_only') {
      log(`[rechunk] ĐỔI KHOÁ ${describeDoc(doc)} → "${plan.newKey}"${dryClash ? ' — KHÔNG đổi được (trùng tài liệu khác)' : ''}${apply ? '' : ' (chạy thử)'}`);
    } else {
      log(`[rechunk] CHIA LẠI ${describeDoc(doc)}: ${doc.chunks_before} → ${plan.chunks.length} đoạn (max ${doc.max_chunk_chars} → ${Math.max(...plan.chunks.map((chunk) => chunk.length))})${renameNote}`);
    }

    if (!apply) {
      if (plan.action === 'rechunk') recordRechunk(doc, plan);
      if (plan.action === 'mark_error') recordMarkError(doc);
      if (plan.renameNeeded) recordRename({ renamed: !dryClash, blocked: dryClash });
      continue;
    }

    let vectors;
    if (plan.action === 'rechunk') {
      try {
        vectors = await embedChunks(plan.chunks, doc.owner_user_id);
        if (!Array.isArray(vectors) || vectors.length !== plan.chunks.length || vectors.some((v) => !Array.isArray(v) || v.length === 0)) {
          throw new Error('embedding trả về thiếu vector');
        }
        consecutiveEmbedFailures = 0;
      } catch (error) {
        consecutiveEmbedFailures += 1;
        summary.embedFailed.push({ id: doc.id, error: error.message });
        log(`[rechunk]   ↳ EMBED LỖI, giữ nguyên tài liệu: ${error.message}`);
        if (consecutiveEmbedFailures >= MAX_CONSECUTIVE_EMBED_FAILURES) {
          summary.aborted = true;
          log(`[rechunk] ${MAX_CONSECUTIVE_EMBED_FAILURES} lần embed lỗi liên tiếp — DỪNG lượt này (Google quá tải?). Chạy lại sau; tài liệu đã xử lý sẽ không bị làm lại.`);
          break;
        }
        continue;
      }
    }

    const result = await writeDocument(doc, plan, { vectors });
    if (!result.written) {
      summary.changedConcurrently.push(doc.id);
      log(`[rechunk]   ↳ bỏ qua: ${result.skipReason}`);
      continue;
    }
    if (result.renameBlocked) log(`[rechunk]   ↳ KHÔNG đổi khoá: đã có tài liệu khác của chatbot mang khoá "${plan.newKey}"`);
    if (plan.action === 'rechunk') recordRechunk(doc, plan);
    if (plan.action === 'mark_error') recordMarkError(doc);
    recordRename({ renamed: result.renamed, blocked: result.renameBlocked });
  }

  const verbSuffix = apply ? '' : ' (dự kiến)';
  log('[rechunk] ===== TÓM TẮT =====');
  log(`[rechunk] chế độ ${summary.mode}: ${summary.candidates} tài liệu cần xử lý (trong ${summary.scanned} quét)`);
  log(`[rechunk] chia lại${verbSuffix} ${summary.rechunked} tài liệu: ${summary.chunksBefore} → ${summary.chunksAfter} đoạn; đoạn lớn nhất ${summary.maxChunkBefore} → ${summary.maxChunkAfter} ký tự`);
  log(`[rechunk] embed${verbSuffix} ${summary.embeddedChunks} đoạn (~${summary.embeddedChars} ký tự, ~${Math.ceil(summary.embeddedChars / 4)} token)`);
  log(`[rechunk] đánh dấu error${verbSuffix} (PDF rác, cần tải lại): ${summary.markedError} tài liệu, xoá ${summary.deletedChunks} đoạn rác`);
  log(`[rechunk] sửa khoá tên tệp lỗi mã hoá${verbSuffix}: ${summary.renamed} tài liệu${summary.renameBlocked ? `; ${summary.renameBlocked} bị chặn vì trùng khoá` : ''}`);
  if (summary.skipped.length) log(`[rechunk] bỏ qua ${summary.skipped.length}: ${summary.skipped.map((s) => `${s.id}(${s.reason})`).join(', ')}`);
  if (summary.embedFailed.length) log(`[rechunk] embed lỗi, giữ nguyên ${summary.embedFailed.length}: ${summary.embedFailed.map((s) => s.id).join(', ')}`);
  if (summary.changedConcurrently.length) log(`[rechunk] bị sửa giữa chừng, bỏ qua ${summary.changedConcurrently.length}: ${summary.changedConcurrently.join(', ')}`);
  if (summary.aborted) log('[rechunk] LƯỢT BỊ DỪNG SỚM — chạy lại để làm tiếp.');
  return summary;
}

function parseArgs(argv) {
  const numberFlag = (name) => {
    const index = argv.indexOf(name);
    if (index < 0) return null;
    const value = Number(argv[index + 1]);
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} cần một số nguyên dương`);
    return value;
  };
  return {
    apply: argv.includes('--apply'),
    chatbotId: numberFlag('--chatbot'),
    ownerId: numberFlag('--owner'),
    documentId: numberFlag('--doc'),
    limit: numberFlag('--limit'),
    maxChunkChars: numberFlag('--max-chunk') ?? CHUNK_MAX_CHARS,
  };
}

const isMain = process.argv[1] && process.argv[1].endsWith('rechunkCustomChatbotDocuments.js');
if (isMain) {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error('[rechunk] tham số sai:', error.message);
    process.exit(2);
  }
  runRechunk(options)
    .then((summary) => {
      process.exitCode = summary.aborted ? 3 : 0;
    })
    .catch((error) => {
      console.error('[rechunk] thất bại:', error.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await db.pool.end().catch(() => {});
    });
}
