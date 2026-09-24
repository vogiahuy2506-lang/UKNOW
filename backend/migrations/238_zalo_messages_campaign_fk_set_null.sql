-- allow-destructive-ddl: DROP CONSTRAINT để đổi ON DELETE CASCADE -> SET NULL.
-- allow-immutable-edit: bản đầu ghim tên constraint của production nên chốt "Migration dry-run"
--   của CI đỏ ngay ở file này, runner halt trước khi ghi schema_migrations nên 239/240 không bao
--   giờ chạy được — không có migration follow-up nào cứu được, buộc phải vá tại chỗ.
-- Mục đích là GIỮ dữ liệu: hiện xoá 1 chiến dịch xoá trắng lịch sử gửi Zalo của nó.
--
-- Tên constraint KHÁC NHAU giữa các môi trường: production đặt tên
-- `zalo_messages_campaign_fkey`, còn `bootstrap.sql` khai FK không tên nên Postgres tự sinh
-- `zalo_messages_id_campaign_fkey`. Vì vậy tra tên THEO CỘT, không ghim tên.
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT c.conname INTO v_conname
    FROM pg_constraint c
   WHERE c.conrelid = 'zalo_messages'::regclass
     AND c.contype = 'f'
     AND c.confrelid = 'campaigns'::regclass
     AND c.conkey = ARRAY[
       (SELECT a.attnum FROM pg_attribute a
         WHERE a.attrelid = 'zalo_messages'::regclass AND a.attname = 'id_campaign')
     ]::smallint[]
   LIMIT 1;

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE zalo_messages DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

ALTER TABLE zalo_messages ALTER COLUMN id_campaign DROP NOT NULL;

ALTER TABLE zalo_messages ADD CONSTRAINT zalo_messages_campaign_fkey
  FOREIGN KEY (id_campaign) REFERENCES campaigns(id) ON DELETE SET NULL;
