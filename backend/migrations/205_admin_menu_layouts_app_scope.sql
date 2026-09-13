-- Migration 205: Allow admin_menu_layouts to hold navigation configurations
-- for both super_admin and regular app users (/app scope).
--
-- allow-immutable-edit: only annotation comments added after release so the
-- check:migration-safety B2 immutability check accepts this file; the SQL
-- payload below is identical to the original release (the DROP/ADD pair
-- was already idempotent thanks to IF EXISTS).
--
-- allow-destructive-ddl: replacing an existing CHECK constraint so that
-- the menu layout rows seeded for super_admin can coexist with the new
-- /app scope (app_user). No data is lost — the old rows still match the
-- new constraint because 'super_admin' is still in the allowed set.
ALTER TABLE admin_menu_layouts DROP CONSTRAINT IF EXISTS admin_menu_layouts_scope_check;
ALTER TABLE admin_menu_layouts ADD CONSTRAINT admin_menu_layouts_scope_check
  CHECK (scope IN ('super_admin', 'app_user'));
