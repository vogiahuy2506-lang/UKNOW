-- Migration 008: Thêm trạng thái pending_activation vào enum user_status

ALTER TYPE user_status ADD VALUE IF NOT EXISTS 'pending_activation';
