-- 286: 3 luat canh bao doc bang ai_call_events (migration 285) - PLAN_SUA_AI_DOT4_PR10 muc 7 (D-15, D-OLD-C4).
--
-- Truoc day chi co ai_cost_spike (tong token, gom ca embedding) nen khong ai biet ti le loi Gemini, so lan phai chuyen model du phong, hay ghi usage hong.
--   ai_error_rate_high   : 30 phut gan nhat co >= 20 lan goi Gemini that va ti le (error + busy + timeout) > 20%.
--                          Dat 'critical' (vuot dem toi 23h-6h): chatbot tra loi khach 24/7, AI sap la mat dich vu - khong the cho sang.
--                          Mau toi thieu 20 de 2/5 lan loi luc dem it khach khong bao dong gia; 20% de mot dot Google cham ngan van khong ban.
--   ai_fallback_spike    : > 10 lan/gio phai chuyen sang model du phong (fallback_ok) = model chinh co van de (qua tai/bi khai tu)
--                          nhung khach van duoc tra loi nen chi 'warning'. Cooldown 6 gio vi sua model la viec cua admin, khong phai viec tuc thi.
--   ai_usage_write_failed: > 0 lan ghi usage hong trong gio = Google da tinh tien ma so token khong co (trang Chi phi AI thap hon hoa don).
--                          'warning', cooldown 6 gio.
-- Nguong nam o DAY (cot threshold_value / window_minutes / config - sua duoc o trang Canh bao), va dung gia tri mac dinh trong
-- services/admin/alertEvaluator.service.js (AI_ALERT_DEFAULTS); spec alertEvaluator.aiCallEvents.spec.js doc file nay de ghim hai noi khop nhau.
-- Chi INSERT dong, khong doi cau truc bang.
INSERT INTO alert_rules (
  code, name, description, threshold_value, window_minutes, channel, severity, cooldown_minutes, config
)
VALUES
(
  'ai_error_rate_high',
  'Ti le loi AI cao',
  'Trong cua so window_minutes co it nhat minCalls lan goi Gemini that va ti le loi (error + busy + timeout) vuot nguong - xem ai_call_events (layer gemini)',
  0.20, 30, 'email', 'critical', 120,
  '{"minCalls": 20}'::jsonb
),
(
  'ai_fallback_spike',
  'Model AI chinh phai chuyen du phong nhieu',
  'So lan phai chuyen sang model du phong (outcome fallback_ok) trong cua so vuot nguong - model chinh qua tai hoac bi khai tu',
  10, 60, 'email', 'warning', 360,
  '{}'::jsonb
),
(
  'ai_usage_write_failed',
  'Ghi so token AI that bai',
  'Co lan ghi usage hong (error_code USAGE_WRITE_FAILED) trong cua so - Google da tinh tien nhung so token khong co',
  0, 60, 'email', 'warning', 360,
  '{}'::jsonb
)
ON CONFLICT (code) DO NOTHING;
