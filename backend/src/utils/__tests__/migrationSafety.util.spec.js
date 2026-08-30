import { describe, it, expect } from '@jest/globals';
import {
  parseMigrationDiffEntries,
  checkMigrationImmutability,
  lintMigrationSqlContent,
  checkMigrationSafety,
  findChecksumRolloutBoundaryViolation,
  stripCommentsAndStrings,
} from '../migrationSafety.util.js';

describe('parseMigrationDiffEntries', () => {
  it('phân tích chính xác output từ git diff --name-status bao gồm file migration không có prefix số', () => {
    const raw = `M\tbackend/migrations/001_initial.sql
M\tbackend/migrations/custom_chatbot_chunks.sql
A\tbackend/migrations/191_new_feature.sql
D\tbackend/migrations/050_old_table.sql
R100\tbackend/migrations/051_rename_old.sql\tbackend/migrations/051_rename_new.sql
M\tbackend/src/index.js
A\tbackend/tests/integration/sql/bootstrap.sql`;

    const entries = parseMigrationDiffEntries(raw);
    expect(entries).toEqual([
      { status: 'M', path: 'backend/migrations/001_initial.sql', oldPath: undefined },
      { status: 'M', path: 'backend/migrations/custom_chatbot_chunks.sql', oldPath: undefined },
      { status: 'A', path: 'backend/migrations/191_new_feature.sql', oldPath: undefined },
      { status: 'D', path: 'backend/migrations/050_old_table.sql', oldPath: undefined },
      {
        status: 'R',
        path: 'backend/migrations/051_rename_new.sql',
        oldPath: 'backend/migrations/051_rename_old.sql',
      },
    ]);
  });

  it('phân tích chính xác output từ git status --porcelain', () => {
    const raw = ` M backend/migrations/custom_chatbot_chunks.sql
?? backend/migrations/192_add_campaign_metric.sql
 M backend/package.json`;

    const entries = parseMigrationDiffEntries(raw);
    expect(entries).toEqual([
      { status: 'M', path: 'backend/migrations/custom_chatbot_chunks.sql', oldPath: undefined },
      { status: 'A', path: 'backend/migrations/192_add_campaign_metric.sql', oldPath: undefined },
    ]);
  });

  it('trả về mảng rỗng khi không có migration nào trong diff', () => {
    const raw = `M\tbackend/src/app.js\nA\tfrontend/src/App.jsx`;
    expect(parseMigrationDiffEntries(raw)).toEqual([]);
    expect(parseMigrationDiffEntries('')).toEqual([]);
  });
});

describe('checkMigrationImmutability (B2)', () => {
  it('chặn khi migration không có prefix số (như custom_chatbot_chunks.sql) bị sửa đổi', () => {
    const entries = [
      { status: 'M', path: 'backend/migrations/custom_chatbot_chunks.sql' },
    ];
    const result = checkMigrationImmutability(entries);
    expect(result.ok).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatch(/bị chỉnh sửa \(Modified\)/);
  });

  it('chặn khi có file migration lịch sử bị xóa (Deleted)', () => {
    const entries = [
      { status: 'D', path: 'backend/migrations/020_deleted.sql' },
    ];
    const result = checkMigrationImmutability(entries);
    expect(result.ok).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatch(/bị xóa \(Deleted\)/);
  });

  it('chặn khi có file migration lịch sử bị đổi tên (Renamed)', () => {
    const entries = [
      {
        status: 'R',
        path: 'backend/migrations/021_renamed.sql',
        oldPath: 'backend/migrations/020_old.sql',
      },
    ];
    const result = checkMigrationImmutability(entries);
    expect(result.ok).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatch(/bị đổi tên/);
  });

  it('cho phép khi chỉ có file migration mới được thêm vào (Added)', () => {
    const entries = [
      { status: 'A', path: 'backend/migrations/191_new_table.sql' },
      { status: 'A', path: 'backend/migrations/192_new_column.sql' },
    ];
    const result = checkMigrationImmutability(entries);
    expect(result.ok).toBe(true);
    expect(result.failures).toHaveLength(0);
    expect(result.addedFiles).toEqual([
      'backend/migrations/191_new_table.sql',
      'backend/migrations/192_new_column.sql',
    ]);
  });
});

describe('findChecksumRolloutBoundaryViolation', () => {
  it('chặn checksum baseline được đưa cùng migration nghiệp vụ mới', () => {
    const result = findChecksumRolloutBoundaryViolation(
      [{ status: 'A', path: 'backend/migrations/174_repair_billing_cycle_anchors.sql' }],
      '+  checksum_sha256 CHAR(64)\n+const CHECKSUM_BASELINE_PENDING_CHECKPOINT = \'checksum_baseline_with_pending\';'
    );

    expect(result).toMatch(/cùng revision/);
  });

  it('cho phép migration mới nếu revision không đưa checksum rollout vào', () => {
    expect(findChecksumRolloutBoundaryViolation(
      [{ status: 'A', path: 'backend/migrations/174_repair_billing_cycle_anchors.sql' }],
      '+  console.log(\'ordinary runner change\');'
    )).toBeNull();
  });

  it('cho phép checksum-only release khi không có migration mới', () => {
    expect(findChecksumRolloutBoundaryViolation(
      [{ status: 'M', path: 'backend/src/utils/migrationRunner.util.js' }],
      '+  checksum_sha256 CHAR(64)'
    )).toBeNull();
  });
});

describe('stripCommentsAndStrings', () => {
  it('bóc comment và string literal nhưng bảo tồn độ dài và vị trí dòng', () => {
    const sql = `SELECT '-- allow-destructive-ddl: in string';
-- allow-destructive-ddl: real comment
DROP TABLE users;`;

    const { strippedSql, annotations } = stripCommentsAndStrings(sql);
    expect(annotations).toMatchObject([
      { reason: 'real comment', line: 2, beforeCode: false },
    ]);
    expect(annotations[0].endOffset).toBeGreaterThan(0);
    expect(strippedSql.length).toBe(sql.length);
    expect(strippedSql).not.toContain('in string');
    expect(strippedSql).toContain('DROP TABLE users;');
  });
});

describe('lintMigrationSqlContent (B3) — Chống bypass đa dòng & String literal', () => {
  it('chặn DROP TABLE ngắt dòng (DROP \\n TABLE)', () => {
    const sql = `DROP
TABLE customers;`;
    const result = lintMigrationSqlContent(sql, '191_drop_multi.sql');
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.rule === 'DROP TABLE')).toBe(true);
  });

  it('chặn ALTER TABLE ... DROP ngắt dòng (DROP \\n COLUMN)', () => {
    const sql = `ALTER TABLE users DROP
COLUMN legacy;`;
    const result = lintMigrationSqlContent(sql, '192_drop_col_multi.sql');
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.rule === 'DROP COLUMN')).toBe(true);
  });

  it('chặn CREATE INDEX ngắt dòng (CREATE INDEX \\n CONCURRENTLY)', () => {
    const sql = `CREATE INDEX
CONCURRENTLY idx_x ON x(id);`;
    const result = lintMigrationSqlContent(sql, '193_concurrent_multi.sql');
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.rule === 'CREATE INDEX CONCURRENTLY')).toBe(true);
  });

  it('chặn khi annotation giả mạo nằm bên trong string literal SQL', () => {
    const sql = `SELECT '-- allow-destructive-ddl: not an annotation';
DROP TABLE users;`;
    const result = lintMigrationSqlContent(sql, '194_fake_annotation.sql');
    expect(result.ok).toBe(false);
    expect(result.hasAnnotation).toBe(false);
    expect(result.violations.some((v) => v.rule === 'DROP TABLE')).toBe(true);
  });

  it('cho phép khi annotation nằm trong comment thực tế', () => {
    const sql = `-- allow-destructive-ddl: Hủy bảng tạm sau khi migrate dữ liệu
DROP
TABLE temp_staging_customers;`;
    const result = lintMigrationSqlContent(sql, '195_real_annotation.sql');
    expect(result.ok).toBe(true);
    expect(result.hasAnnotation).toBe(true);
    expect(result.annotationReason).toBe('Hủy bảng tạm sau khi migrate dữ liệu');
    expect(result.violations).toHaveLength(0);
  });

  it('cho phép khi annotation nằm trong block comment', () => {
    const sql = `/* allow-destructive-ddl: Xóa bảng log cũ */
DROP TABLE old_access_logs;`;
    const result = lintMigrationSqlContent(sql, '196_block_annotation.sql');
    expect(result.ok).toBe(true);
    expect(result.hasAnnotation).toBe(true);
    expect(result.annotationReason).toBe('Xóa bảng log cũ');
    expect(result.violations).toHaveLength(0);
  });

  it('annotation chỉ miễn một DDL ngay sau nó, không tắt guard cho cả file', () => {
    const sql = `-- allow-destructive-ddl: Dọn bảng staging sau khi đã backfill
DROP TABLE staging_customers;
DROP TABLE users;`;
    const result = lintMigrationSqlContent(sql, '196_annotation_scope.sql');

    expect(result.ok).toBe(false);
    expect(result.hasAnnotation).toBe(true);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toMatchObject({ rule: 'DROP TABLE', line: 3 });
    expect(result.violations[0].snippet).toBe('DROP TABLE users;');
  });

  it('annotation không miễn DDL nếu có SQL khác chen giữa', () => {
    const sql = `-- allow-destructive-ddl: Dọn bảng staging sau khi đã backfill
SELECT 1;
DROP TABLE staging_customers;`;
    const result = lintMigrationSqlContent(sql, '196_annotation_not_adjacent.sql');

    expect(result.ok).toBe(false);
    expect(result.hasAnnotation).toBe(false);
    expect(result.violations.some((v) => v.rule === 'DROP TABLE')).toBe(true);
  });

  it('cho phép DDL additive an toàn', () => {
    const sql = `CREATE TABLE user_profiles (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      bio TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE;
    CREATE INDEX idx_user_profiles_user_id ON user_profiles(user_id);`;

    const result = lintMigrationSqlContent(sql, '197_safe.sql');
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('chặn RENAME TABLE và RENAME COLUMN', () => {
    const sql = `ALTER TABLE users RENAME COLUMN is_active TO status;
ALTER TABLE old_orders RENAME TO archived_orders;`;
    const result = lintMigrationSqlContent(sql, '198_rename.sql');
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.rule === 'RENAME TABLE / COLUMN')).toBe(true);
  });

  it('chặn SET NOT NULL trực tiếp', () => {
    const sql = `ALTER TABLE users ALTER COLUMN email SET NOT NULL;`;
    const result = lintMigrationSqlContent(sql, '199_not_null.sql');
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.rule === 'SET NOT NULL trực tiếp')).toBe(true);
  });

  it('chặn ALTER COLUMN TYPE nguy hiểm', () => {
    const sql = `ALTER TABLE users ALTER COLUMN description TYPE varchar(100);`;
    const result = lintMigrationSqlContent(sql, '200_type.sql');
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.rule === 'ALTER COLUMN TYPE')).toBe(true);
  });

  it('chặn ALTER COLUMN TYPE với quoted identifier có khoảng trắng', () => {
    const sql = 'ALTER TABLE users ALTER COLUMN "description field" TYPE varchar(100);';
    const result = lintMigrationSqlContent(sql, '200_quoted_type.sql');

    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.rule === 'ALTER COLUMN TYPE')).toBe(true);
  });

  it('chặn PostgreSQL SET DATA TYPE, một biến thể hợp lệ của ALTER COLUMN TYPE', () => {
    const sql = `ALTER TABLE users ALTER COLUMN description SET DATA TYPE varchar(100);`;
    const result = lintMigrationSqlContent(sql, '200_set_data_type.sql');
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.rule === 'ALTER COLUMN TYPE')).toBe(true);
  });

  it('chặn ALTER TABLE DROP khi PostgreSQL bỏ từ khóa COLUMN', () => {
    for (const sql of [
      'ALTER TABLE users DROP legacy_column;',
      'ALTER TABLE users DROP IF EXISTS legacy_column;',
      'ALTER TABLE IF EXISTS public.users DROP COLUMN IF EXISTS "legacy column";',
    ]) {
      const result = lintMigrationSqlContent(sql, '201_drop_column_short.sql');
      expect(result.ok).toBe(false);
      expect(result.violations.some((v) => v.rule === 'DROP COLUMN')).toBe(true);
    }
  });

  it('không nhầm ALTER COLUMN DROP DEFAULT là DROP COLUMN', () => {
    const result = lintMigrationSqlContent(
      'ALTER TABLE campaign_nodes ALTER COLUMN node_type DROP DEFAULT;',
      '201_drop_default.sql'
    );
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('chặn DDL động nằm trong dollar-quoted DO block', () => {
    const sql = `DO $$ BEGIN EXECUTE 'DROP TABLE users'; END $$;`;
    const result = lintMigrationSqlContent(sql, '201_do_dynamic.sql');
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.rule === 'DROP TABLE')).toBe(true);
  });

  it('chặn EXECUTE ghép chuỗi dù câu DROP TABLE không còn liền nhau', () => {
    const sql = `DO $$ BEGIN EXECUTE 'DROP ' || 'TABLE users'; END $$;`;
    const result = lintMigrationSqlContent(sql, '201_do_concat_dynamic.sql');

    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.rule === 'Dynamic SQL EXECUTE')).toBe(true);
  });

  it('không nhầm EXECUTE trong comment/string hoặc EXECUTE FUNCTION ngoài dollar body là SQL động', () => {
    const sql = `-- EXECUTE 'DROP TABLE users';
SELECT 'EXECUTE';
CREATE TRIGGER audit_trigger AFTER INSERT ON users
FOR EACH ROW EXECUTE FUNCTION audit_user_change();
DO $$ BEGIN PERFORM 1; END $$;`;
    const result = lintMigrationSqlContent(sql, '201_static_execute_function.sql');

    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('không chấp nhận annotation rỗng hoặc annotation nằm sau SQL code', () => {
    expect(lintMigrationSqlContent('-- allow-destructive-ddl:   \nDROP TABLE users;', '202_blank.sql').ok).toBe(false);
    expect(lintMigrationSqlContent('SELECT 1;\n-- allow-destructive-ddl: lý do\nDROP TABLE users;', '203_late.sql').ok).toBe(false);
  });
});

describe('checkMigrationSafety (End-to-End)', () => {
  it('phát hiện cả vi phạm immutability và DDL nguy hiểm', () => {
    const diffEntries = [
      { status: 'M', path: 'backend/migrations/custom_chatbot_chunks.sql' },
      { status: 'A', path: 'backend/migrations/191_unsafe.sql' },
    ];

    const files = {
      'backend/migrations/191_unsafe.sql': 'DROP\nTABLE customers;',
    };

    const result = checkMigrationSafety({
      diffEntries,
      readFileFn: (p) => files[p],
    });

    expect(result.ok).toBe(false);
    expect(result.immutabilityFailures).toHaveLength(1);
    expect(result.ddlViolations).toHaveLength(1);
    expect(result.ddlViolations[0].rule).toBe('DROP TABLE');
  });

  it('thành công khi chỉ thêm migration an toàn', () => {
    const diffEntries = [
      { status: 'A', path: 'backend/migrations/191_safe.sql' },
    ];

    const files = {
      'backend/migrations/191_safe.sql': 'CREATE TABLE feature_flags (id serial primary key, key text);',
    };

    const result = checkMigrationSafety({
      diffEntries,
      readFileFn: (p) => files[p],
    });

    expect(result.ok).toBe(true);
    expect(result.immutabilityFailures).toHaveLength(0);
    expect(result.ddlViolations).toHaveLength(0);
  });

  it('vẫn fail DDL không được annotation trong file đã có một annotation hợp lệ', () => {
    const diffEntries = [
      { status: 'A', path: 'backend/migrations/192_partially_annotated.sql' },
    ];
    const files = {
      'backend/migrations/192_partially_annotated.sql': `-- allow-destructive-ddl: Xóa bảng staging đã migrate xong
DROP TABLE staging_customers;
DROP TABLE users;`,
    };

    const result = checkMigrationSafety({
      diffEntries,
      readFileFn: (p) => files[p],
    });

    expect(result.ok).toBe(false);
    expect(result.annotatedFiles).toEqual([
      {
        file: 'backend/migrations/192_partially_annotated.sql',
        reason: 'Xóa bảng staging đã migrate xong',
      },
    ]);
    expect(result.ddlViolations).toHaveLength(1);
    expect(result.ddlViolations[0]).toMatchObject({ rule: 'DROP TABLE', line: 3 });
  });
});
