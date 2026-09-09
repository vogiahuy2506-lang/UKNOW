-- Migration 198: checkpoint marker for checksum baseline tests
-- DO NOT add any schema changes; this file exists only to give the
-- checksum-baseline test suite a stable "last migration before pending"
-- anchor.  See migrationRunner.util.spec.js "checksum baseline" group.
INSERT INTO schema_migrations (filename, checksum_sha256)
VALUES ('198_checkpoint_for_tests.sql', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
ON CONFLICT (filename) DO NOTHING;
