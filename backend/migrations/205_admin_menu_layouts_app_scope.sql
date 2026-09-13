-- Allow admin_menu_layouts to hold navigation configurations for both
-- super_admin and regular app users (/app scope).
ALTER TABLE admin_menu_layouts DROP CONSTRAINT IF EXISTS admin_menu_layouts_scope_check;
ALTER TABLE admin_menu_layouts ADD CONSTRAINT admin_menu_layouts_scope_check
  CHECK (scope IN ('super_admin', 'app_user'));
