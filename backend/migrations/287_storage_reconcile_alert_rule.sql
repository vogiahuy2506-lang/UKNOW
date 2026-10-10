-- 287: luat canh bao doi soat kho tep bat thuong - PLAN_GCS_LOI_QUYEN_KHONG_PHAI_MAT_TEP_2026-10-10.
--
-- Su co 05-08/10/2026: service account GCS mat role IAM, cron storage_objects_reconcile (02:40) ghi status=success ma van
-- danh dau 688 tep la "mat" (orphaned), khong ai duoc bao. Nay doi soat khong con danh dau khi loi quyen/mang, nhung phai bao
-- de admin biet kho dang hong: luat nay doc ket qua cron gan nhat (<= 26 gio) va ban khi
--   result.orphanBrakeTripped (phanh hang loat chan danh dau) hoac result.inspectErrors > 0 hoac luot chay hong han.
-- 'critical' + cooldown 360 phut, moi luot chay chi bao mot lan (metric chi xet luot ket thuc sau lan ban gan nhat).
-- Chi INSERT dong, khong doi cau truc bang.
INSERT INTO alert_rules (
  code, name, description, threshold_value, window_minutes, channel, severity, cooldown_minutes, config
)
VALUES
(
  'storage_reconcile_anomaly',
  'Doi soat kho tep bat thuong',
  'Cron doi soat kho tep (storage_objects_reconcile) gan nhat co tep khong kiem duoc (loi quyen/mang), phanh hang loat da chan danh dau mat tep, hoac chay hong - kiem tra role IAM cua service account GCS',
  1, NULL, 'email', 'critical', 360,
  '{"jobCode": "storage_objects_reconcile", "withinHours": 26}'::jsonb
)
ON CONFLICT (code) DO NOTHING;
