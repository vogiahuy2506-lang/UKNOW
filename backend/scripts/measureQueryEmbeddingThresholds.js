/**
 * Đo: đổi embed CÂU HỎI từ RETRIEVAL_DOCUMENT sang RETRIEVAL_QUERY (D-24 / EXTRA-A3) làm các ngưỡng tương đồng hiện hành
 * lệch đến đâu — để quyết định có cần chỉnh ngưỡng hay không, THAY VÌ đoán.
 *
 * Vì sao cần: đoạn hồ sơ / đoạn bài hướng dẫn lưu bằng RETRIEVAL_DOCUMENT. Cặp (QUERY câu hỏi, DOCUMENT đoạn) cho điểm cosine
 * THẤP hơn cặp (DOCUMENT, DOCUMENT) chừng 0,08–0,12 (đo ở Studio, G1 03/10/2026) trong khi các ngưỡng bên dưới hiệu chỉnh theo
 * kiểu cũ:
 *   - help:    0,35 (mặc định `searchHelpChunks`)   — ít đoạn qua → rơi về tìm từ khoá ILIKE
 *              0,50 (lưới an toàn `ai.controller` — chỉ thay câu của não chiến dịch khi top ≥ 0,5)
 *              0,60 (`helpAssistant` — top < 0,6 ghi backlog `help_unanswered` lý do low_similarity)
 *   - profile: 0,50 (`businessProfile.getContextForPrompt` — chỉ lấy đoạn hồ sơ > 0,5)
 *
 * Script này với MỖI câu hỏi: embed hai kiểu (DOCUMENT cũ / QUERY mới), tìm top-5 đoạn đã lưu bằng đúng hàm repository mà code
 * dùng (ngưỡng 0 để thấy cả điểm thấp), rồi báo bao nhiêu câu mất hết đoạn / mất bao nhiêu đoạn ở TỪNG ngưỡng hiện hành.
 * Kết luận (giữ ngưỡng hay hạ) là việc của người đọc số — script KHÔNG tự đổi gì.
 *
 * CHỈ ĐỌC dữ liệu đoạn. Tốn 2 lượt embed Gemini THẬT mỗi câu và ghi vài dòng usage (feature `embedding_threshold_measure`, userId rỗng).
 * KHÔNG chạy trong test (spec chỉ kiểm phần tính + `run` với embed/repository giả).
 *
 * Câu hỏi: tệp văn bản, mỗi dòng một câu (dòng trống và dòng bắt đầu bằng `#` bị bỏ). Dùng CÂU HỎI THẬT của khách (vd lấy từ
 * `help_unanswered.question` + tin `visitor` gần đây), đừng tự bịa — câu bịa thường giống đoạn hơn câu thật nên làm điểm đẹp giả.
 *
 *   docker cp cau-hoi.txt uknow-campaign-backend:/tmp/cau-hoi.txt
 *   docker exec uknow-campaign-backend node scripts/measureQueryEmbeddingThresholds.js --target help --questions /tmp/cau-hoi.txt
 *   docker exec uknow-campaign-backend node scripts/measureQueryEmbeddingThresholds.js --target profile --owner-id 90 --questions /tmp/cau-hoi.txt
 *   (thêm --max 60 để giới hạn số câu, mặc định 60)
 */
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

export const DEFAULT_THRESHOLDS = Object.freeze({
  help: Object.freeze([0.35, 0.5, 0.6]),
  profile: Object.freeze([0.5]),
});
export const DEFAULT_MAX_QUESTIONS = 60;
export const TOP_K = 5;
export const MEASURE_FEATURE = 'embedding_threshold_measure';

/** Mỗi dòng một câu; bỏ dòng trống, dòng `#…`, câu trùng (không phân biệt hoa thường); cắt còn `max` câu. */
export function parseQuestions(text, { max = DEFAULT_MAX_QUESTIONS } = {}) {
  const seen = new Set();
  const questions = [];
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    questions.push(line);
    if (questions.length >= max) break;
  }
  return questions;
}

const mean = (values) => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null);
const round = (value, digits = 3) => (value === null ? null : Number(value.toFixed(digits)));
const passing = (similarities, threshold) => similarities.filter((s) => Number(s) >= threshold).length;

/**
 * @param {Array<{ question: string, doc: number[], query: number[] }>} samples điểm top-K (giảm dần) cho từng câu, mỗi kiểu embed
 * @param {number[]} thresholds
 */
export function summarizeComparison(samples, thresholds) {
  const top1 = (kind) => samples.map((s) => s[kind][0]).filter((v) => Number.isFinite(Number(v))).map(Number);
  const docTop1 = top1('doc');
  const queryTop1 = top1('query');

  const perThreshold = thresholds.map((threshold) => {
    let docHit = 0;
    let queryHit = 0;
    let lostQuestions = 0;
    let gainedQuestions = 0;
    let lostChunks = 0;
    const docCounts = [];
    const queryCounts = [];
    for (const sample of samples) {
      const docPass = passing(sample.doc, threshold);
      const queryPass = passing(sample.query, threshold);
      docCounts.push(docPass);
      queryCounts.push(queryPass);
      if (docPass > 0) docHit += 1;
      if (queryPass > 0) queryHit += 1;
      if (docPass > 0 && queryPass === 0) lostQuestions += 1;
      if (docPass === 0 && queryPass > 0) gainedQuestions += 1;
      lostChunks += Math.max(0, docPass - queryPass);
    }
    return {
      threshold,
      docHit,
      queryHit,
      lostQuestions,
      gainedQuestions,
      lostChunks,
      docAvgChunks: round(mean(docCounts), 2),
      queryAvgChunks: round(mean(queryCounts), 2),
    };
  });

  return {
    questions: samples.length,
    top1: {
      docMean: round(mean(docTop1)),
      queryMean: round(mean(queryTop1)),
      docMin: docTop1.length ? round(Math.min(...docTop1)) : null,
      queryMin: queryTop1.length ? round(Math.min(...queryTop1)) : null,
      meanDrop: docTop1.length && queryTop1.length ? round(mean(docTop1) - mean(queryTop1)) : null,
    },
    perThreshold,
  };
}

export function formatReport(summary, { label }) {
  const { questions, top1, perThreshold } = summary;
  const lines = [
    `== ${label}: ${questions} câu hỏi ==`,
    `Điểm top-1 trung bình: DOCUMENT ${top1.docMean} → QUERY ${top1.queryMean} (tụt ${top1.meanDrop}); thấp nhất ${top1.docMin} → ${top1.queryMin}`,
  ];
  for (const row of perThreshold) {
    lines.push(
      `Ngưỡng ${row.threshold}: câu có ≥1 đoạn qua — DOCUMENT ${row.docHit}/${questions}, QUERY ${row.queryHit}/${questions}`
      + ` | MẤT hết đoạn: ${row.lostQuestions} câu, được thêm: ${row.gainedQuestions} câu`
      + ` | số đoạn qua TB ${row.docAvgChunks} → ${row.queryAvgChunks} (tổng đoạn mất ${row.lostChunks})`,
    );
  }
  return lines.join('\n');
}

/**
 * @param {object} deps
 * @param {'help'|'profile'} deps.target
 * @param {string[]} deps.questions
 * @param {number|string|null} [deps.ownerId] bắt buộc khi target = profile
 * @param {(text: string, options: object) => Promise<number[]>} deps.embedText
 * @param {(vector: number[]) => Promise<Array<{similarity: number}>>} [deps.searchHelp]
 * @param {(ownerId: number|string, vector: number[]) => Promise<Array<{similarity: number}>>} [deps.searchProfile]
 * @param {number[]} [deps.thresholds]
 * @param {(line: string) => void} [deps.log]
 */
export async function run({
  target,
  questions,
  ownerId = null,
  embedText,
  searchHelp,
  searchProfile,
  thresholds = null,
  log = console.log,
}) {
  if (target !== 'help' && target !== 'profile') throw new Error('--target phải là help hoặc profile');
  if (target === 'profile' && (ownerId === null || ownerId === undefined || ownerId === '')) {
    throw new Error('--target profile cần --owner-id');
  }
  const search = target === 'help'
    ? (vector) => searchHelp(vector)
    : (vector) => searchProfile(ownerId, vector);

  const samples = [];
  for (const question of questions) {
    const scoresFor = async (taskType) => {
      const vector = await embedText(question, { feature: MEASURE_FEATURE, taskType });
      const rows = await search(vector);
      return rows.map((row) => Number(row.similarity)).filter(Number.isFinite).sort((a, b) => b - a);
    };
    samples.push({
      question,
      doc: await scoresFor('RETRIEVAL_DOCUMENT'),
      query: await scoresFor('RETRIEVAL_QUERY'),
    });
  }

  const summary = summarizeComparison(samples, thresholds || DEFAULT_THRESHOLDS[target]);
  log(formatReport(summary, { label: target === 'help' ? 'Bài hướng dẫn (help_article_chunks)' : `Hồ sơ doanh nghiệp (user ${ownerId})` }));
  return summary;
}

function readArg(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

async function main() {
  await import('dotenv/config');
  const argv = process.argv.slice(2);
  const target = readArg(argv, '--target');
  const file = readArg(argv, '--questions');
  const ownerId = readArg(argv, '--owner-id');
  const max = Number(readArg(argv, '--max')) || DEFAULT_MAX_QUESTIONS;
  if (!file) throw new Error('Thiếu --questions <tệp>');

  const { default: db } = await import('../src/config/database.js');
  const { embedText } = await import('../src/utils/embeddingClient.util.js');
  const helpRepo = await import('../src/repositories/help/helpArticle.repository.js');
  const { default: businessProfileRepository } = await import('../src/repositories/ai/businessProfile.repository.js');
  try {
    await run({
      target,
      ownerId,
      questions: parseQuestions(readFileSync(file, 'utf8'), { max }),
      embedText,
      searchHelp: (vector) => helpRepo.searchPublishedChunks(vector, { limit: TOP_K, minSimilarity: -1, locale: 'vi' }),
      searchProfile: (id, vector) => businessProfileRepository.searchSimilarChunks(id, vector, TOP_K),
    });
  } finally {
    await db.pool.end().catch(() => {});
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
