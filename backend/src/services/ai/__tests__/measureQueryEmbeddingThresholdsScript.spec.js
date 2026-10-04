import { describe, expect, it, jest } from '@jest/globals';
import {
  DEFAULT_THRESHOLDS,
  MEASURE_FEATURE,
  formatReport,
  parseQuestions,
  run,
  summarizeComparison,
} from '../../../../scripts/measureQueryEmbeddingThresholds.js';

/**
 * Script đo ngưỡng khi đổi embed câu hỏi DOCUMENT → QUERY (D-24 / EXTRA-A3). KHÔNG gọi Gemini thật: embed + repository là hàm giả;
 * kiểm phần tính (đếm câu/đoạn mất ở từng ngưỡng) trên số liệu dựng tay để kết quả đối chiếu được bằng mắt.
 */
describe('parseQuestions', () => {
  it('bỏ dòng trống, dòng # và câu trùng (không phân biệt hoa thường), giữ thứ tự, cắt theo --max', () => {
    const text = '\n# ghi chú\nLàm sao tạo chiến dịch?\n  làm sao TẠO chiến dịch?  \r\nGiá gói Starter?\n\nCách nối Zalo?\n';

    expect(parseQuestions(text)).toEqual(['Làm sao tạo chiến dịch?', 'Giá gói Starter?', 'Cách nối Zalo?']);
    expect(parseQuestions(text, { max: 2 })).toEqual(['Làm sao tạo chiến dịch?', 'Giá gói Starter?']);
    expect(parseQuestions(null)).toEqual([]);
  });
});

// Số dựng tay (điểm top-K giảm dần). Ngưỡng 0,5:
//   q1 DOCUMENT 2 đoạn qua (0,72 0,60) → QUERY 2 đoạn qua (0,62 0,50)  : không mất
//   q2 DOCUMENT 1 đoạn qua (0,55)      → QUERY 0 đoạn qua (0,45)        : MẤT hết đoạn
//   q3 DOCUMENT 2 đoạn qua (0,70 0,52) → QUERY 2 đoạn qua (0,66 0,61)  : không mất
const SAMPLES = [
  { question: 'q1', doc: [0.72, 0.6, 0.4], query: [0.62, 0.5, 0.3] },
  { question: 'q2', doc: [0.55, 0.4, 0.2], query: [0.45, 0.3, 0.1] },
  { question: 'q3', doc: [0.7, 0.52, 0.1], query: [0.66, 0.61, 0.2] },
];

describe('summarizeComparison', () => {
  const summary = summarizeComparison(SAMPLES, [0.5, 0.35]);

  it('ngưỡng 0,5: 3 câu có đoạn qua với DOCUMENT, còn 2 với QUERY → mất 1 câu, mất 1 đoạn', () => {
    const row = summary.perThreshold[0];
    expect(row).toMatchObject({
      threshold: 0.5, docHit: 3, queryHit: 2, lostQuestions: 1, gainedQuestions: 0, lostChunks: 1,
    });
    expect(row.docAvgChunks).toBe(1.67);
    expect(row.queryAvgChunks).toBe(1.33);
  });

  it('ngưỡng 0,35: không câu nào mất hết đoạn (chỉ mất bớt đoạn)', () => {
    const row = summary.perThreshold[1];
    // DOCUMENT qua 0,35: q1 3, q2 2, q3 2 = 7; QUERY: q1 2 (0,62 0,50), q2 1 (0,45), q3 2 = 5
    expect(row).toMatchObject({ threshold: 0.35, docHit: 3, queryHit: 3, lostQuestions: 0, lostChunks: 2 });
  });

  it('điểm top-1 trung bình tụt đúng số đo', () => {
    // DOCUMENT: (0,72+0,55+0,70)/3 = 0,657 ; QUERY: (0,62+0,45+0,66)/3 = 0,577
    expect(summary.top1).toMatchObject({ docMean: 0.657, queryMean: 0.577, meanDrop: 0.08, docMin: 0.55, queryMin: 0.45 });
  });

  it('ngưỡng tính ">=" (điểm đúng bằng ngưỡng vẫn qua) — khớp `ai.controller` (>= 0,5)', () => {
    const edge = summarizeComparison([{ question: 'x', doc: [0.5], query: [0.5] }], [0.5]);
    expect(edge.perThreshold[0]).toMatchObject({ docHit: 1, queryHit: 1, lostQuestions: 0 });
  });

  it('câu mà QUERY lại có đoạn còn DOCUMENT không → tính vào "được thêm"', () => {
    const gained = summarizeComparison([{ question: 'x', doc: [0.4], query: [0.55] }], [0.5]);
    expect(gained.perThreshold[0]).toMatchObject({ docHit: 0, queryHit: 1, gainedQuestions: 1, lostQuestions: 0 });
  });

  it('không có mẫu nào → không chia cho 0', () => {
    const empty = summarizeComparison([], [0.5]);
    expect(empty).toMatchObject({ questions: 0, top1: { docMean: null, queryMean: null, meanDrop: null } });
  });

  it('báo cáo nêu số câu mất ở từng ngưỡng bằng tiếng Việt', () => {
    const text = formatReport(summary, { label: 'Bài hướng dẫn' });
    expect(text).toContain('Bài hướng dẫn: 3 câu hỏi');
    expect(text).toContain('Ngưỡng 0.5: câu có ≥1 đoạn qua — DOCUMENT 3/3, QUERY 2/3 | MẤT hết đoạn: 1 câu');
  });
});

describe('run — dùng embed + repository giả, KHÔNG gọi Gemini thật', () => {
  // embed giả: vector mang kiểu embed để repository giả trả điểm khác nhau cho DOCUMENT và QUERY.
  const embedText = jest.fn(async (text, options) => [options.taskType === 'RETRIEVAL_QUERY' ? 1 : 0, text.length]);
  const scoresByKind = (vector) => (vector[0] === 1
    ? [{ similarity: 0.45 }, { similarity: 0.3 }]
    : [{ similarity: 0.55 }, { similarity: 0.4 }]);

  it('help: mỗi câu embed ĐÚNG hai lần (DOCUMENT rồi QUERY) bằng feature đo, tìm bằng vector tương ứng, báo mất câu ở ngưỡng 0,5', async () => {
    embedText.mockClear();
    const searchHelp = jest.fn(async (vector) => scoresByKind(vector));
    const log = jest.fn();

    const summary = await run({ target: 'help', questions: ['Làm sao tạo chiến dịch?', 'Giá gói?'], embedText, searchHelp, log });

    expect(embedText).toHaveBeenCalledTimes(4);
    expect(embedText.mock.calls.map((call) => call[1])).toEqual([
      { feature: MEASURE_FEATURE, taskType: 'RETRIEVAL_DOCUMENT' },
      { feature: MEASURE_FEATURE, taskType: 'RETRIEVAL_QUERY' },
      { feature: MEASURE_FEATURE, taskType: 'RETRIEVAL_DOCUMENT' },
      { feature: MEASURE_FEATURE, taskType: 'RETRIEVAL_QUERY' },
    ]);
    expect(searchHelp).toHaveBeenCalledTimes(4);
    expect(summary.perThreshold.map((row) => row.threshold)).toEqual([...DEFAULT_THRESHOLDS.help]);
    expect(summary.perThreshold.find((row) => row.threshold === 0.5)).toMatchObject({ docHit: 2, queryHit: 0, lostQuestions: 2 });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('MẤT hết đoạn: 2 câu'));
  });

  it('profile: cần --owner-id, truyền đúng chủ shop cho repository, dùng ngưỡng hồ sơ 0,5', async () => {
    await expect(run({ target: 'profile', questions: ['x'], embedText, searchProfile: jest.fn(), log: jest.fn() }))
      .rejects.toThrow('--owner-id');

    const searchProfile = jest.fn(async (_ownerId, vector) => scoresByKind(vector));
    const summary = await run({ target: 'profile', ownerId: 90, questions: ['Viết email giới thiệu'], embedText, searchProfile, log: jest.fn() });

    expect(searchProfile).toHaveBeenCalledWith(90, expect.any(Array));
    expect(summary.perThreshold.map((row) => row.threshold)).toEqual([...DEFAULT_THRESHOLDS.profile]);
  });

  it('--target lạ bị từ chối', async () => {
    await expect(run({ target: 'studio', questions: [], embedText, log: jest.fn() })).rejects.toThrow('--target');
  });
});
