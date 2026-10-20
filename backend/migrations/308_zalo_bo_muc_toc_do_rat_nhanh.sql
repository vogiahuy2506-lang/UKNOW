-- 308: bo muc toc do "Rat nhanh" (30-60 giay/tin) cua Zalo ca nhan (PLAN_BO_MUC_RAT_NHANH_ZALO_2026-10-20).
--
-- Do production 20/10: nick 34 dat 30-60 giay mat 44% tin (61/138) voi loi [ZALO_SEND_NOT_DELIVERED] tu 06:00 toi 09:30,
-- ca thang truoc chi 4 lan. Muc duy nhat da chung minh an toan la ~150 tin/ngay/nick o 80-150 giay.
-- Code da bo preset `very_fast` va nang san cung len 50 giay (zaloRateLimiter.js); migration nay dua cac nick con luu
-- ghi de duoi 50 giay ve "Mac dinh" (NULL = theo env). Nick dang o 50-100 giay (muc "Nhanh") hoac cham hon giu nguyen.
--
-- Chi du lieu (UPDATE), khong doi cau truc bang -> khong can mirror bootstrap.sql. Chay lai an toan: lan 2 khong con dong khop dieu kien.
-- Dieu kien chi xet min (< 50000); dua CA HAI cot ve NULL de khong con lai cap nua vo (min NULL ma max con gia tri).

UPDATE zalo_settings
   SET zalo_personal_outbound_delay_min_ms = NULL,
       zalo_personal_outbound_delay_max_ms = NULL
 WHERE zalo_personal_outbound_delay_min_ms < 50000;
