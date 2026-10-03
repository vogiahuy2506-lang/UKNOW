/**
 * PLAN_SUA_AI_DOT2 G1.7 — script nạp lại tài liệu kiến thức cũ, chạy trên Postgres THẬT (CSDL test).
 * Embed được thế bằng hàm giả (không gọi Google); mọi thứ còn lại — SQL, giao dịch, khoá hạn mức KB — là thật.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import db from '../../src/config/database.js';
import customChatDocumentRepository from '../../src/repositories/ai/customChatDocument.repository.js';
import {
  PDF_REUPLOAD_MESSAGE,
  planDocument,
  runRechunk,
} from '../../scripts/rechunkCustomChatbotDocuments.js';
import { createUser, truncateAll } from './helpers/db.js';

let seq = 0;
async function insertBot(ownerId) {
  seq += 1;
  const { rows } = await db.query(
    `INSERT INTO custom_chatbots (id_user, name, widget_key) VALUES ($1, $2, $3) RETURNING id`,
    [ownerId, `Bot ${seq}`, `rk_${Date.now()}_${seq}_${Math.random().toString(36).slice(2, 8)}`]
  );
  return rows[0].id;
}

/**
 * @param {{ chatbotId: number, ownerId: number, key: string, type?: string, status?: string, content?: string|null,
 *           chunks?: string[], embedded?: boolean, updatedAt?: string }} spec
 */
async function insertDoc({
  chatbotId, ownerId, key, type = 'file', status = 'ready', content = null, chunks = [], embedded = true, updatedAt = null,
}) {
  const { rows } = await db.query(
    `INSERT INTO custom_chatbot_documents
       (chatbot_id, owner_user_id, source_type, source_key, title, content_text, status, extracted_chars, chunk_count)
     VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8)
     RETURNING id`,
    [chatbotId, ownerId, type, key, content, status, content ? content.length : 0, chunks.length]
  );
  const id = rows[0].id;
  for (let i = 0; i < chunks.length; i += 1) {
    await db.query(
      `INSERT INTO custom_chatbot_chunks (document_id, chatbot_id, user_id, chunk_text, embedding, chunk_index, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, chatbotId, ownerId, chunks[i], embedded ? JSON.stringify([1, 0]) : null, i, key]
    );
  }
  if (updatedAt) {
    await db.query(`UPDATE custom_chatbot_documents SET updated_at = $2::timestamptz WHERE id = $1`, [id, updatedAt]);
  }
  return id;
}

const mojibake = (utf8) => Buffer.from(utf8, 'utf8').toString('latin1');
const longSentences = (n, label = 'Câu') => Array.from({ length: n }, (_, i) => `${label} số ${i} nói về sản phẩm Trà Sen Tây Hồ, giá ${i * 1000} đồng một hộp.`).join(' ');

/** Văn bản giống đầu ra của bộ đọc PDF thô cũ: cấu trúc PDF còn nguyên + luồng nén thành ký hiệu ngẫu nhiên. */
function rawPdfGarbage(chars) {
  const lines = [];
  let total = 0;
  let state = 99;
  while (total < chars) {
    let noise = '';
    for (let i = 0; i < 180; i += 1) {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      noise += String.fromCharCode(0x21 + ((state >> 16) % 94));
    }
    const block = `12 0 obj << /Type /Page /Filter /FlateDecode /Length 6000 >> stream ${noise} endstream endobj`;
    lines.push(block);
    total += block.length + 1;
  }
  return lines.join('\n');
}

async function snapshot() {
  const docs = await db.query(
    `SELECT id, status, source_key, title, chunk_count, extracted_chars, error_message, updated_at::text AS updated_at
       FROM custom_chatbot_documents ORDER BY id`
  );
  const chunks = await db.query(
    `SELECT document_id, COUNT(*)::int AS n, SUM(char_length(chunk_text))::int AS chars, MAX(source) AS source
       FROM custom_chatbot_chunks GROUP BY document_id ORDER BY document_id`
  );
  return { docs: docs.rows, chunks: chunks.rows };
}

async function loadDoc(id) {
  const { rows } = await db.query(`SELECT * FROM custom_chatbot_documents WHERE id = $1`, [id]);
  return rows[0];
}

async function loadChunks(id) {
  const { rows } = await db.query(
    `SELECT chunk_text, chunk_index, embedding, source FROM custom_chatbot_chunks WHERE document_id = $1 ORDER BY chunk_index`,
    [id]
  );
  return rows;
}

const fakeEmbed = () => jest.fn(async (chunks) => chunks.map(() => [0.5, 0.5]));
const collectLog = () => {
  const lines = [];
  return { lines, log: (line) => lines.push(line) };
};

describe('rechunkCustomChatbotDocuments — nạp lại tài liệu cũ', () => {
  let owner;
  let botId;
  const ids = {};

  beforeEach(async () => {
    await truncateAll();
    owner = await createUser({ username: `rk_owner_${Date.now()}` });
    botId = await insertBot(owner.id);

    const giant = longSentences(2600); // ~200k ký tự, KHÔNG xuống dòng
    ids.docx = await insertDoc({ chatbotId: botId, ownerId: owner.id, key: 'bang-gia.docx', content: giant, chunks: [giant] });
    ids.small = await insertDoc({ chatbotId: botId, ownerId: owner.id, key: 'ghi-chu', type: 'text', content: 'Giờ mở cửa 8h-21h.', chunks: ['Giờ mở cửa 8h-21h.'] });
    const garbage = rawPdfGarbage(190000);
    ids.rawPdf = await insertDoc({
      chatbotId: botId, ownerId: owner.id, key: 'Profile.pdf', content: garbage, chunks: [garbage], updatedAt: '2026-08-17 10:00:00+07',
    });
    ids.mojibake = await insertDoc({
      chatbotId: botId, ownerId: owner.id, key: mojibake('Profile chuyên gia.docx'), content: 'Hồ sơ chuyên gia.', chunks: ['Hồ sơ chuyên gia.'],
    });
    ids.clashTaken = await insertDoc({ chatbotId: botId, ownerId: owner.id, key: 'Giá dịch vụ.docx', content: 'Bảng giá.', chunks: ['Bảng giá.'] });
    ids.clashMojibake = await insertDoc({
      chatbotId: botId, ownerId: owner.id, key: mojibake('Giá dịch vụ.docx'), content: 'Bảng giá bản cũ.', chunks: ['Bảng giá bản cũ.'],
    });
    ids.noContent = await insertDoc({ chatbotId: botId, ownerId: owner.id, key: 'khong-noi-dung.docx', content: null, chunks: ['y'.repeat(4000)] });
    ids.errored = await insertDoc({
      chatbotId: botId, ownerId: owner.id, key: 'da-loi.docx', status: 'error', content: giant, chunks: ['z'.repeat(4000)],
    });
    ids.goodPdf = await insertDoc({
      chatbotId: botId, ownerId: owner.id, key: 'tot.pdf', content: 'Chính sách bảo hành sản phẩm trong 12 tháng. '.repeat(20), chunks: ['Chính sách bảo hành sản phẩm trong 12 tháng.'],
    });
    ids.embedFail = await insertDoc({
      chatbotId: botId, ownerId: owner.id, key: 'loi-embed.docx', content: `GÂY LỖI ${longSentences(60)}`, chunks: [`GÂY LỖI ${longSentences(60)}`],
    });
  });

  describe('planDocument (thuần)', () => {
    const base = {
      id: 1, chatbot_id: 1, owner_user_id: 1, source_type: 'file', source_key: 'a.docx', title: 'a.docx', status: 'ready',
      content_text: longSentences(200), updated_at_iso: '2026-09-30T00:00:00.000Z', max_chunk_chars: 20000,
    };

    it('DOCX có đoạn quá lớn → rechunk, mọi đoạn mới ≤ 1.500', () => {
      const plan = planDocument(base);
      expect(plan.action).toBe('rechunk');
      expect(plan.chunks.length).toBeGreaterThan(5);
      expect(Math.max(...plan.chunks.map((c) => c.length))).toBeLessThanOrEqual(1500);
    });

    it('đoạn đã ≤ 1.500 và tên đúng → none', () => {
      expect(planDocument({ ...base, max_chunk_chars: 1400 }).action).toBe('none');
    });

    it('PDF rác của bộ đọc cũ → mark_error (không chia lại rác); PDF tốt → không đụng', () => {
      const bad = planDocument({ ...base, source_key: 'p.pdf', content_text: rawPdfGarbage(5000), updated_at_iso: '2026-08-17T03:00:00.000Z' });
      expect(bad.action).toBe('mark_error');
      expect(bad.reason).toBe('pdf_rac_pdf_markers');
      expect(bad.beforeParserFix).toBe(true);
      expect(planDocument({ ...base, source_key: 'p.pdf', content_text: 'Chính sách bảo hành sản phẩm trong 12 tháng. '.repeat(20), max_chunk_chars: 800 }).action).toBe('none');
    });

    it('thiếu content_text → skip; tên mojibake → rename_only', () => {
      expect(planDocument({ ...base, content_text: null }).action).toBe('skip');
      const plan = planDocument({ ...base, source_key: mojibake('Hồ sơ chuyên gia.docx'), max_chunk_chars: 100 });
      expect(plan.action).toBe('rename_only');
      expect(plan.newKey).toBe('Hồ sơ chuyên gia.docx');
    });
  });

  it('CHẠY THỬ (mặc định): không đổi một byte nào trong CSDL, không gọi embed, báo cáo đủ số liệu', async () => {
    const before = await snapshot();
    const embed = fakeEmbed();
    const { lines, log } = collectLog();

    const summary = await runRechunk({ embedChunks: embed, log });

    expect(await snapshot()).toEqual(before);
    expect(embed).not.toHaveBeenCalled();
    expect(summary.mode).toBe('dry-run');
    // docx + embedFail được chia lại; PDF rác bị đánh dấu; mojibake (+ trùng khoá) báo; noContent bỏ qua.
    expect(summary.rechunked).toBe(2);
    expect(summary.markedError).toBe(1);
    expect(summary.deletedChunks).toBe(1);
    expect(summary.renamed).toBe(1);
    expect(summary.renameBlocked).toBe(1);
    expect(summary.skipped).toEqual([{ id: ids.noContent, reason: 'khong_co_content_text' }]);
    expect(summary.maxChunkBefore).toBeGreaterThan(150000);
    expect(summary.maxChunkAfter).toBeLessThanOrEqual(1500);
    expect(summary.chunksAfter).toBeGreaterThan(150);
    const text = lines.join('\n');
    expect(text).toMatch(/CHẠY THỬ/);
    expect(text).toMatch(/PDF RÁC .*Profile\.pdf/);
    expect(text).toMatch(/CHIA LẠI .*"bang-gia\.docx": 1 → \d+ đoạn/);
  });

  it('GHI THẬT: chia lại + embed lại DOCX; PDF rác → error + xoá đoạn; khoá mojibake được sửa; các tài liệu còn lại giữ nguyên', async () => {
    const untouchedBefore = {
      small: await loadDoc(ids.small), noContent: await loadDoc(ids.noContent), errored: await loadDoc(ids.errored), goodPdf: await loadDoc(ids.goodPdf),
      clashTaken: await loadDoc(ids.clashTaken),
    };
    const embed = jest.fn(async (chunks) => {
      if (chunks[0].includes('GÂY LỖI')) throw new Error('Embedding API lỗi (429)');
      return chunks.map(() => [0.5, 0.5]);
    });
    const { lines, log } = collectLog();

    const summary = await runRechunk({ apply: true, embedChunks: embed, log });

    // --- DOCX khổng lồ: chia lại ---
    const docx = await loadDoc(ids.docx);
    const docxChunks = await loadChunks(ids.docx);
    expect(docxChunks.length).toBeGreaterThan(150);
    expect(docx.chunk_count).toBe(docxChunks.length);
    expect(docx.status).toBe('ready');
    expect(Math.max(...docxChunks.map((c) => c.chunk_text.length))).toBeLessThanOrEqual(1500);
    expect(docxChunks.map((c) => c.chunk_index)).toEqual(docxChunks.map((_, i) => i));
    for (const chunk of docxChunks) {
      expect(chunk.embedding).toEqual([0.5, 0.5]);
      expect(chunk.source).toBe('bang-gia.docx');
    }
    // Văn bản gốc và hạn mức không đổi (không cần khách tải lại, không đụng quota).
    expect(docx.content_text.length).toBe(Number(docx.extracted_chars));

    // --- PDF rác: error + xoá đoạn + giải phóng hạn mức ---
    const rawPdf = await loadDoc(ids.rawPdf);
    expect(rawPdf.status).toBe('error');
    expect(rawPdf.error_message).toBe(PDF_REUPLOAD_MESSAGE);
    expect(rawPdf.error_message).toMatch(/Tệp PDF cần tải lên lại/);
    expect(rawPdf.chunk_count).toBe(0);
    expect(Number(rawPdf.extracted_chars)).toBe(0);
    expect(await loadChunks(ids.rawPdf)).toHaveLength(0);

    // --- khoá mojibake sửa; trùng khoá thì giữ nguyên ---
    const mojibakeDoc = await loadDoc(ids.mojibake);
    expect(mojibakeDoc.source_key).toBe('Profile chuyên gia.docx');
    expect(mojibakeDoc.title).toBe('Profile chuyên gia.docx');
    expect((await loadChunks(ids.mojibake))[0].source).toBe('Profile chuyên gia.docx');
    expect((await loadDoc(ids.clashMojibake)).source_key).toBe(mojibake('Giá dịch vụ.docx'));

    // --- lỗi embed: tài liệu giữ nguyên, báo cáo ghi lại ---
    const embedFailChunks = await loadChunks(ids.embedFail);
    expect(embedFailChunks).toHaveLength(1);
    expect(summary.embedFailed.map((f) => f.id)).toEqual([ids.embedFail]);
    expect((await loadDoc(ids.embedFail)).status).toBe('ready');

    // --- không đụng: tài liệu nhỏ, thiếu content_text, đang error, PDF tốt, tài liệu đích của trùng khoá ---
    for (const [name, id] of [['small', ids.small], ['noContent', ids.noContent], ['errored', ids.errored], ['goodPdf', ids.goodPdf], ['clashTaken', ids.clashTaken]]) {
      expect((await loadDoc(id))).toEqual(untouchedBefore[name]);
    }
    expect(await loadChunks(ids.noContent)).toHaveLength(1);
    expect((await loadChunks(ids.noContent))[0].chunk_text).toHaveLength(4000);

    expect(summary).toMatchObject({
      mode: 'apply', rechunked: 1, markedError: 1, renamed: 1, renameBlocked: 1, aborted: false,
    });
    expect(lines.join('\n')).toMatch(/GHI THẬT/);
    expect(lines.join('\n')).toMatch(/EMBED LỖI, giữ nguyên tài liệu/);
  });

  it('chạy lại sau khi sửa lỗi: chỉ tài liệu còn dở được làm tiếp, tài liệu đã xử lý KHÔNG bị embed lại (idempotent)', async () => {
    let failEmbed = true;
    const embed = jest.fn(async (chunks) => {
      if (failEmbed && chunks[0].includes('GÂY LỖI')) throw new Error('Embedding API lỗi (503)');
      return chunks.map(() => [0.5, 0.5]);
    });
    await runRechunk({ apply: true, embedChunks: embed, log: () => {} });
    const callsAfterFirst = embed.mock.calls.length;
    expect(callsAfterFirst).toBe(2); // docx (thành công) + loi-embed (lỗi)

    failEmbed = false;
    const second = await runRechunk({ apply: true, embedChunks: embed, log: () => {} });

    expect(embed.mock.calls.length).toBe(callsAfterFirst + 1); // chỉ loi-embed
    expect(second.rechunked).toBe(1);
    expect(second.markedError).toBe(0);
    expect(second.embedFailed).toEqual([]);
    expect((await loadChunks(ids.embedFail)).length).toBeGreaterThan(1);

    const third = await runRechunk({ apply: true, embedChunks: embed, log: () => {} });
    expect(third.rechunked).toBe(0);
    expect(embed.mock.calls.length).toBe(callsAfterFirst + 1);
  });

  it('khách sửa tài liệu GIỮA CHỪNG (updated_at đổi trong lúc embed) → bỏ qua tài liệu đó, không ghi đè bản mới', async () => {
    const embed = jest.fn(async (chunks) => {
      await db.query(
        `UPDATE custom_chatbot_documents SET title = 'khách vừa sửa', updated_at = NOW() + interval '1 second' WHERE id = $1`,
        [ids.docx]
      );
      return chunks.map(() => [0.5, 0.5]);
    });

    const summary = await runRechunk({ apply: true, documentId: ids.docx, embedChunks: embed, log: () => {} });

    expect(summary.changedConcurrently).toEqual([ids.docx]);
    expect(summary.rechunked).toBe(0);
    expect(await loadChunks(ids.docx)).toHaveLength(1);
    expect((await loadDoc(ids.docx)).title).toBe('khách vừa sửa');
  });

  it('3 lần embed lỗi liên tiếp → dừng cả lượt (không gõ tiếp vào Google đang quá tải), mã aborted', async () => {
    await db.query(`DELETE FROM custom_chatbot_documents WHERE id <> ALL($1::bigint[])`, [[ids.docx]]);
    for (let i = 0; i < 4; i += 1) {
      const text = longSentences(30, `Tài liệu ${i}`);
      await insertDoc({ chatbotId: botId, ownerId: owner.id, key: `lo-${i}.docx`, content: text, chunks: [text.padEnd(4000, ' x')] });
    }
    const embed = jest.fn(async () => { throw new Error('Embedding API lỗi (503)'); });
    const { lines, log } = collectLog();

    const summary = await runRechunk({ apply: true, embedChunks: embed, log });

    expect(embed).toHaveBeenCalledTimes(3);
    expect(summary.aborted).toBe(true);
    expect(summary.embedFailed).toHaveLength(3);
    expect(lines.join('\n')).toMatch(/DỪNG lượt này/);
    expect((await loadChunks(ids.docx))).toHaveLength(1); // chưa tài liệu nào bị đổi
  });

  it('--doc / --owner / --limit thu hẹp phạm vi', async () => {
    const embed = fakeEmbed();
    const only = await runRechunk({ apply: true, documentId: ids.docx, embedChunks: embed, log: () => {} });
    expect(only.rechunked).toBe(1);
    expect(only.markedError).toBe(0);
    expect((await loadDoc(ids.rawPdf)).status).toBe('ready');

    const otherOwner = await createUser({ username: `rk_other_${Date.now()}` });
    const dry = await runRechunk({ ownerId: otherOwner.id, log: () => {} });
    expect(dry.scanned).toBe(0);

    const limited = await runRechunk({ limit: 1, log: () => {} });
    expect(limited.candidates).toBe(1);
  });

  it('thiếu GEMINI_API_KEY khi --apply với embed mặc định → từ chối trước khi đụng dữ liệu', async () => {
    const original = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const before = await snapshot();
      await expect(runRechunk({ apply: true, log: () => {} })).rejects.toThrow(/GEMINI_API_KEY/);
      expect(await snapshot()).toEqual(before);
    } finally {
      if (original !== undefined) process.env.GEMINI_API_KEY = original;
    }
  });
});

describe('customChatDocumentRepository — tìm bằng cosine và dự phòng từ khoá trên CSDL thật (G1.4)', () => {
  let owner;
  let botId;

  beforeEach(async () => {
    await truncateAll();
    owner = await createUser({ username: `rk_repo_${Date.now()}` });
    botId = await insertBot(owner.id);
  });

  it('searchChunksByChatbot: đoạn cosine cao nhất lên đầu, đoạn dưới ngưỡng bị loại, chỉ tài liệu ready của đúng chủ', async () => {
    const doc = await insertDoc({ chatbotId: botId, ownerId: owner.id, key: 'a.txt', type: 'text', chunks: ['về giá', 'về bảo hành', 'vô nghĩa'], embedded: false });
    const vectors = [[1, 0, 0], [0.8, 0.6, 0], [0, 0, 1]];
    for (let i = 0; i < 3; i += 1) {
      await db.query(`UPDATE custom_chatbot_chunks SET embedding = $2 WHERE document_id = $1 AND chunk_index = $3`, [doc, JSON.stringify(vectors[i]), i]);
    }
    const stranger = await createUser({ username: `rk_repo_other_${Date.now()}` });
    const strangerBot = await insertBot(stranger.id);
    await insertDoc({ chatbotId: strangerBot, ownerId: stranger.id, key: 'b.txt', type: 'text', chunks: ['của người khác'], embedded: true });
    await insertDoc({ chatbotId: botId, ownerId: owner.id, key: 'loi.txt', type: 'text', status: 'error', chunks: ['tài liệu lỗi'], embedded: true });

    const rows = await customChatDocumentRepository.searchChunksByChatbot(botId, owner.id, [1, 0, 0], { limit: 5, minSimilarity: 0.3 });

    expect(rows.map((r) => r.chunk_text)).toEqual(['về giá', 'về bảo hành']);
    expect(rows[0].similarity).toBeCloseTo(1, 5);
    expect(rows[1].similarity).toBeCloseTo(0.8, 5);
  });

  it('findChunkTexts({ onlyWithoutEmbedding }) chỉ trả đoạn CHƯA có vector; mặc định trả tất cả', async () => {
    const withVec = await insertDoc({ chatbotId: botId, ownerId: owner.id, key: 'co-vector.txt', type: 'text', chunks: ['có vector'], embedded: true });
    const noVec = await insertDoc({ chatbotId: botId, ownerId: owner.id, key: 'khong-vector.txt', type: 'text', chunks: ['không vector'], embedded: false });
    expect(withVec).not.toBe(noVec);

    expect(await customChatDocumentRepository.findChunkTexts({ chatbotId: botId, userId: owner.id })).toEqual(['có vector', 'không vector']);
    expect(await customChatDocumentRepository.findChunkTexts({ chatbotId: botId, userId: owner.id, onlyWithoutEmbedding: true })).toEqual(['không vector']);
  });

  it('hàm rỗng searchByEmbedding() (luôn trả []) đã bị gỡ', () => {
    expect(customChatDocumentRepository.searchByEmbedding).toBeUndefined();
  });
});
