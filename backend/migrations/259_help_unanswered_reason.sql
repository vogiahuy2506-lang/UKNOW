-- Migration 259: help_unanswered.reason — vì sao dòng này được ghi vào backlog kho bài.
--
-- PLAN_VA_TRO_LY_AI_2026-09-28 PR-2 mục 5 / RA_SOAT_TRO_LY_AI_LUONG_2026-09-28 mục 9 — bảng
-- help_unanswered trống suốt 60 ngày dù 14/42 lượt hỏi đáp model tự nói "chưa có hướng dẫn":
-- trước đây chỉ ghi khi searchHelpChunks trả 0 đoạn, mà dự phòng ILIKE luôn vớt được vài đoạn
-- (khớp 0,72–0,87) nên nhánh "0 đoạn" gần như không bao giờ chạy. Cột này phân biệt 3 lý do
-- ghi backlog: 'low_similarity' (có đoạn nhưng topSimilarity < 0.6), 'model_said_no_doc' (model
-- tự nhận chưa có hướng dẫn dù có đoạn), 'no_chunks' (đúng 0 đoạn — 2 nhánh cũ).
--
-- NULL cho các dòng cũ trước migration (không biết lý do, không backfill — chỉ 0 dòng thực tế
-- theo bằng chứng production 28/09).

ALTER TABLE help_unanswered ADD COLUMN IF NOT EXISTS reason VARCHAR(32);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'help_unanswered_reason_check'
  ) THEN
    ALTER TABLE help_unanswered ADD CONSTRAINT help_unanswered_reason_check
      CHECK (reason IS NULL OR reason IN ('low_similarity', 'model_said_no_doc', 'no_chunks'));
  END IF;
END $$;
