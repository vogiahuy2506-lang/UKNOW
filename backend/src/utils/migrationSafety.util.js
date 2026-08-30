/**
 * Migration Safety Utility (Checkpoint B).
 *
 * Kiểm tra 2 lớp bảo vệ cho schema migrations:
 * 1. Immutability Guard (B2): Cấm sửa, xóa hoặc đổi tên các migration đã tồn tại (append-only).
 * 2. Destructive DDL Guard (B3): Chặn các câu lệnh DDL phá vỡ backward compatibility
 *    (DROP TABLE/COLUMN/CONSTRAINT/TYPE, RENAME, SET NOT NULL, CREATE INDEX CONCURRENTLY, ALTER TYPE).
 *    Cho phép annotation tường minh `-- allow-destructive-ddl: <lý do>` trong comment hợp lệ.
 */

/**
 * Phân tích output từ `git diff --name-status` hoặc `git status --porcelain`
 * thành danh sách object diff chuẩn hóa cho thư mục migrations.
 *
 * @param {string} rawDiffOutput
 * @returns {Array<{ status: 'A'|'M'|'D'|'R'|'?', path: string, oldPath?: string }>}
 */
export function parseMigrationDiffEntries(rawDiffOutput) {
  if (!rawDiffOutput || !rawDiffOutput.trim()) return [];

  const lines = rawDiffOutput.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const entries = [];

  for (const line of lines) {
    // Format git status --porcelain: 'M  backend/migrations/001.sql' hoặc '?? backend/migrations/custom.sql'
    // Format git diff --name-status: 'M\tbackend/migrations/001.sql' hoặc 'R100\told.sql\tnew.sql'
    const parts = line.split(/[\t\s]+/).filter(Boolean);
    if (parts.length < 2) continue;

    let statusCode = parts[0];
    let filePath = '';
    let oldPath = undefined;

    if (statusCode.startsWith('R')) {
      // Rename: R100 oldPath newPath
      statusCode = 'R';
      oldPath = parts[1];
      filePath = parts[2] || parts[1];
    } else if (statusCode === '??') {
      statusCode = 'A';
      filePath = parts[1];
    } else {
      statusCode = statusCode.charAt(0);
      filePath = parts[1];
    }

    // Nhận diện MỌI file SQL trong thư mục migrations (kể cả không có prefix số như custom_chatbot_chunks.sql)
    const isMigration = /(?:^|\/)migrations\/[^/]+\.sql$/i.test(filePath)
      || (oldPath && /(?:^|\/)migrations\/[^/]+\.sql$/i.test(oldPath));

    if (isMigration) {
      entries.push({
        status: statusCode,
        path: filePath,
        oldPath,
      });
    }
  }

  return entries;
}

/**
 * Kiểm tra tính bất biến (Immutability):
 * Các migration đã tồn tại chỉ được phép bổ sung (Append-only).
 * Tuyệt đối không được Modified (M), Deleted (D), hay Renamed (R).
 *
 * @param {Array<{ status: string, path: string, oldPath?: string }>} diffEntries
 * @returns {{ ok: boolean, failures: string[], addedFiles: string[] }}
 */
export function checkMigrationImmutability(diffEntries) {
  const failures = [];
  const addedFiles = [];

  for (const entry of diffEntries) {
    if (entry.status === 'M') {
      failures.push(
        `[Immutability] File migration đã tồn tại "${entry.path}" bị chỉnh sửa (Modified). ` +
        `Các migration lịch sử là append-only và không được sửa sau khi đã release.`
      );
    } else if (entry.status === 'D') {
      failures.push(
        `[Immutability] File migration đã tồn tại "${entry.path}" bị xóa (Deleted). ` +
        `Không được xóa migration lịch sử khỏi repository.`
      );
    } else if (entry.status === 'R') {
      failures.push(
        `[Immutability] File migration đã tồn tại "${entry.oldPath}" bị đổi tên thành "${entry.path}" (Renamed). ` +
        `Không được đổi tên migration lịch sử.`
      );
    } else if (entry.status === 'A' || entry.status === '?') {
      addedFiles.push(entry.path);
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    addedFiles,
  };
}

/**
 * A checksum baseline for a legacy database is an operational release boundary:
 * it must not arrive in the same revision as a new business migration. The
 * runner deliberately stops after baselining in that case, so catching the
 * mixed batch in CI prevents a production deploy that can only fail halfway.
 *
 * @param {Array<{ status: string, path: string }>} diffEntries
 * @param {string} migrationRunnerDiff
 * @returns {string|null}
 */
export function findChecksumRolloutBoundaryViolation(diffEntries, migrationRunnerDiff) {
  const hasAddedMigration = diffEntries.some((entry) => entry.status === 'A' || entry.status === '?');
  if (!hasAddedMigration) return null;

  const runnerDiff = String(migrationRunnerDiff || '');
  const introducesChecksumBaseline = /^\+[^+].*(?:checksum_sha256|CHECKSUM_BASELINE_PENDING_CHECKPOINT|baselineLegacyChecksums)/m
    .test(runnerDiff);
  if (!introducesChecksumBaseline) return null;

  return (
    'Checksum rollout và migration mới đang nằm trong cùng revision. '
    + 'Hãy deploy checksum baseline riêng, xác nhận `npm run migrate -- --check`, '
    + 'rồi mới deploy migration ở commit/release kế tiếp.'
  );
}

/**
 * Phân tích SQL thành chuỗi không chứa comments và string literals (thay bằng khoảng trắng),
 * đồng thời trích xuất danh sách annotation hợp lệ chỉ từ comment thực tế.
 * Giữ nguyên độ dài và vị trí dòng (\n) chính xác 100%.
 *
 * @param {string} sql
 * @returns {{ strippedSql: string, annotations: Array<{ reason: string, line: number, beforeCode: boolean, endOffset: number }>, dollarQuotedBodies: Array<{ bodyStart: number, bodyEnd: number, text: string }> }}
 */
export function stripCommentsAndStrings(sql) {
  const src = String(sql || '');
  const len = src.length;
  let i = 0;
  const outChars = [];
  const annotations = [];
  const dollarQuotedBodies = [];
  let seenCode = false;

  // Require a non-whitespace reason; a blank annotation must never disable the guard.
  const annotationPattern = /allow-(?:destructive|unsafe)-ddl\s*:\s*([^\r\n*]*\S[^\r\n*]*)/i;

  function countLinesUpTo(offset) {
    let count = 1;
    for (let c = 0; c < offset; c++) {
      if (src[c] === '\n') count++;
    }
    return count;
  }

  while (i < len) {
    const ch = src[i];
    const next = i + 1 < len ? src[i + 1] : '';

    // 1. Line comment: --
    if (ch === '-' && next === '-') {
      const start = i;
      i += 2;
      let commentText = '';
      while (i < len && src[i] !== '\n' && src[i] !== '\r') {
        commentText += src[i];
        i++;
      }
      const match = commentText.match(annotationPattern);
      if (match) {
        annotations.push({
          reason: match[1].trim(),
          line: countLinesUpTo(start),
          beforeCode: !seenCode,
          endOffset: i,
        });
      }
      // Thay thế comment bằng khoảng trắng, giữ nguyên độ dài
      for (let k = start; k < i; k++) {
        outChars.push(' ');
      }
      continue;
    }

    // 2. Block comment: /* ... */
    if (ch === '/' && next === '*') {
      const start = i;
      i += 2;
      let commentText = '';
      while (i < len && !(src[i] === '*' && i + 1 < len && src[i + 1] === '/')) {
        commentText += src[i];
        i++;
      }
      if (i < len) {
        i += 2; // bỏ qua */
      }
      const match = commentText.match(annotationPattern);
      if (match) {
        annotations.push({
          reason: match[1].trim(),
          line: countLinesUpTo(start),
          beforeCode: !seenCode,
          endOffset: i,
        });
      }
      // Thay thế comment bằng khoảng trắng, bảo tồn các ký tự \n
      for (let k = start; k < i; k++) {
        outChars.push(src[k] === '\n' ? '\n' : ' ');
      }
      continue;
    }

    // 3. String literal: '...' (xử lý escape '')
    if (ch === "'") {
      seenCode = true;
      const start = i;
      i++;
      while (i < len) {
        if (src[i] === "'") {
          if (i + 1 < len && src[i + 1] === "'") {
            i += 2; // escape ''
          } else {
            i++; // đóng string
            break;
          }
        } else {
          i++;
        }
      }
      for (let k = start; k < i; k++) {
        outChars.push(src[k] === '\n' ? '\n' : ' ');
      }
      continue;
    }

    // 4. Dollar quoted string: $$...$$ hoặc $tag$...$tag$
    if (ch === '$') {
      const matchTag = src.slice(i).match(/^\$([a-zA-Z0-9_]*)\$/);
      if (matchTag) {
        const start = i;
        const tag = matchTag[0];
        seenCode = true;
        i += tag.length;
        const endIdx = src.indexOf(tag, i);
        const bodyEnd = endIdx === -1 ? len : endIdx;
        dollarQuotedBodies.push({
          bodyStart: i,
          bodyEnd,
          text: src.slice(i, bodyEnd),
        });
        if (endIdx !== -1) {
          i = endIdx + tag.length;
        } else {
          i = len;
        }
        for (let k = start; k < i; k++) {
          outChars.push(src[k] === '\n' ? '\n' : ' ');
        }
        continue;
      }
    }

    // Ký tự code thông thường
    if (!/\s/.test(ch)) seenCode = true;
    outChars.push(ch);
    i++;
  }

  return {
    strippedSql: outChars.join(''),
    annotations,
    dollarQuotedBodies,
  };
}

/**
 * Quy tắc DDL nguy hiểm phá vỡ backward compatibility.
 */
// PostgreSQL cho phép bỏ từ khóa COLUMN trong `ALTER TABLE ... DROP [COLUMN]`.
// Giữ pattern identifier riêng để nhận cả schema/table/cột có quote mà không
// biến `ALTER COLUMN ... DROP DEFAULT` thành một false positive.
const SQL_IDENTIFIER_PATTERN = '(?:"(?:""|[^"])*"|[a-zA-Z_][a-zA-Z0-9_$]*)';

const DESTRUCTIVE_DDL_RULES = [
  {
    id: 'CREATE_INDEX_CONCURRENTLY',
    name: 'CREATE INDEX CONCURRENTLY',
    regex: /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\b/gi,
    message:
      'CREATE INDEX CONCURRENTLY bị cấm trong migration vì runner chạy trong transaction block (BEGIN...COMMIT). ' +
      'PostgreSQL sẽ báo lỗi "CREATE INDEX CONCURRENTLY cannot run inside a transaction block". ' +
      'Giải pháp: Dùng CREATE INDEX thông thường (có lock ngắn) hoặc tách script đánh index độc lập ngoài runner.',
  },
  {
    id: 'DROP_TABLE',
    name: 'DROP TABLE',
    regex: /\bDROP\s+TABLE\b/gi,
    message:
      'DROP TABLE phá vỡ tương thích ngược với backend replica cũ đang phục vụ trong lúc deploy. ' +
      'Giải pháp: Áp dụng quy trình 3 bước (expand -> deploy/backfill -> contract) ở release tiếp theo.',
  },
  {
    id: 'DROP_COLUMN',
    name: 'DROP COLUMN',
    regex: new RegExp(
      `\\bALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?` +
      `${SQL_IDENTIFIER_PATTERN}(?:\\s*\\.\\s*${SQL_IDENTIFIER_PATTERN})?(?:\\s*\\*)?` +
      `\\s+DROP\\s+(?:COLUMN\\s+)?(?:IF\\s+EXISTS\\s+)?` +
      `(?!CONSTRAINT\\b|DEFAULT\\b|IDENTITY\\b|EXPRESSION\\b)${SQL_IDENTIFIER_PATTERN}`,
      'gi'
    ),
    message:
      'DROP COLUMN phá vỡ các câu SELECT/INSERT từ container backend cũ chưa khởi động lại. ' +
      'Giải pháp: Chờ code mới chạy ổn định một phiên bản rồi mới drop column ở migration sau.',
  },
  {
    id: 'DROP_TYPE_OR_CONSTRAINT',
    name: 'DROP TYPE / CONSTRAINT',
    regex: /\bDROP\s+(?:TYPE|CONSTRAINT)\b/gi,
    message:
      'DROP TYPE hoặc DROP CONSTRAINT có thể làm fail các validation/insert đang chạy dở. ' +
      'Nếu đây là sửa lỗi ràng buộc có chủ đích, hãy thêm annotation "-- allow-destructive-ddl: <lý do>".',
  },
  {
    id: 'RENAME_TABLE_OR_COLUMN',
    name: 'RENAME TABLE / COLUMN',
    regex: /\b(?:RENAME\s+COLUMN\b|RENAME\s+TO\b|\bALTER\s+TABLE\s+[^\r\n;]+?\bRENAME\b)/gi,
    message:
      'RENAME TABLE hoặc RENAME COLUMN lập tức làm gãy mọi query từ backend hiện tại. ' +
      'Giải pháp: Thêm cột/bảng mới (expand), sync dữ liệu, sau đó đổi code trỏ sang tên mới, rồi mới dọn tên cũ (contract).',
  },
  {
    id: 'SET_NOT_NULL',
    name: 'SET NOT NULL trực tiếp',
    regex: /\bSET\s+NOT\s+NULL\b/gi,
    message:
      'SET NOT NULL trực tiếp trên cột có sẵn sẽ fail nếu có row chứa NULL và gây lock toàn bảng. ' +
      'Giải pháp: Thêm cột mới với DEFAULT an toàn, hoặc backfill dữ liệu trước rồi thêm CHECK constraint NOT VALID.',
  },
  {
    id: 'ALTER_COLUMN_TYPE',
    name: 'ALTER COLUMN TYPE',
    regex: new RegExp(
      `\\bALTER\\s+(?:COLUMN\\s+)?${SQL_IDENTIFIER_PATTERN}\\s+(?:SET\\s+DATA\\s+)?TYPE\\b`,
      'gi'
    ),
    message:
      'ALTER COLUMN TYPE có thể gây rewrite bảng và làm hỏng câu lệnh prepared statement của backend cũ. ' +
      'Nếu an toàn (như nới rộng VARCHAR(50) lên VARCHAR(100)), hãy thêm annotation "-- allow-destructive-ddl: <lý do>".',
  },
];

const DYNAMIC_SQL_EXECUTE_RULE = {
  name: 'Dynamic SQL EXECUTE',
  message:
    'EXECUTE SQL động trong dollar-quoted block không thể được kiểm chứng an toàn bằng regex, ' +
    'vì câu lệnh có thể được ghép từ nhiều chuỗi hoặc biến. Hãy viết DDL tĩnh để migration guard ' +
    'quét được đầy đủ, hoặc tách thao tác động sang script vận hành được review riêng.',
};

/**
 * Kiểm tra nội dung SQL của một migration mới xem có chứa DDL phá vỡ backward compatibility không.
 *
 * @param {string} sql
 * @param {string} [filename='<unnamed>']
 * @returns {{
 *   ok: boolean,
 *   hasAnnotation: boolean,
 *   annotationReason: string | null,
 *   violations: Array<{ rule: string, line: number, snippet: string, message: string }>
 * }}
 */
export function lintMigrationSqlContent(sql, filename = '<unnamed>') {
  const content = String(sql || '');

  // 1. Phân tích token: bóc comment & string literals và lấy annotation từ comment thực tế
  const { strippedSql, annotations, dollarQuotedBodies } = stripCommentsAndStrings(content);

  // Annotation phải đứng trước code đầu tiên, và chỉ được miễn chính câu DDL
  // nằm ngay sau nó. Không có annotation nào được phép tắt toàn bộ guard file.
  const validAnnotations = annotations.filter((annotation) => annotation.beforeCode && annotation.reason);

  const originalLines = content.split(/\r?\n/);
  const violations = [];

  function getLineNumber(offset) {
    let line = 1;
    for (let k = 0; k < offset; k++) {
      if (content[k] === '\n') line++;
    }
    return line;
  }

  for (const rule of DESTRUCTIVE_DDL_RULES) {
    rule.regex.lastIndex = 0;
    let match;
    while ((match = rule.regex.exec(strippedSql)) !== null) {
      const lineNum = getLineNumber(match.index);
      const snippet = (originalLines[lineNum - 1] || '').trim();

      violations.push({
        file: filename,
        rule: rule.name,
        line: lineNum,
        snippet,
        message: rule.message,
        offset: match.index,
        source: 'sql',
      });
    }
  }

  // Dollar-quoted DO/function bodies can contain dynamic SQL. They are kept
  // out of the normal token stream to avoid treating delimiters as SQL, then
  // scanned conservatively so EXECUTE 'DROP TABLE ...' cannot bypass the guard.
  for (const body of dollarQuotedBodies) {
    for (const rule of DESTRUCTIVE_DDL_RULES) {
      rule.regex.lastIndex = 0;
      let match;
      while ((match = rule.regex.exec(body.text)) !== null) {
        const absoluteOffset = body.bodyStart + match.index;
        const lineNum = getLineNumber(absoluteOffset);
        const snippet = (originalLines[lineNum - 1] || '').trim();
        violations.push({
          file: filename,
          rule: rule.name,
          line: lineNum,
          snippet,
          message: rule.message,
          offset: absoluteOffset,
          source: 'dollar_body',
        });
      }
    }

    // Fail closed for PL/pgSQL dynamic SQL. Scanning the raw body catches a
    // contiguous destructive string, but expressions such as
    // EXECUTE 'DROP ' || 'TABLE users' deliberately break that signature.
    // Strip nested comments/string contents only to locate the EXECUTE token;
    // any executable expression is rejected because it cannot be proven safe.
    const { strippedSql: strippedDollarBody } = stripCommentsAndStrings(body.text);
    const executeRegex = /\bEXECUTE\b/gi;
    const executeMatch = executeRegex.exec(strippedDollarBody);
    if (executeMatch) {
      const absoluteOffset = body.bodyStart + executeMatch.index;
      const lineNum = getLineNumber(absoluteOffset);
      violations.push({
        file: filename,
        rule: DYNAMIC_SQL_EXECUTE_RULE.name,
        line: lineNum,
        snippet: (originalLines[lineNum - 1] || '').trim(),
        message: DYNAMIC_SQL_EXECUTE_RULE.message,
        offset: absoluteOffset,
        source: 'dollar_body',
      });
    }
  }

  // Quét theo thứ tự source để một annotation chỉ có thể miễn một DDL ở ngay
  // phía sau. Dollar-quoted body cố ý không được miễn: `DO $$ EXECUTE ... $$`
  // không có ranh giới statement đủ chắc chắn cho annotation regex-based.
  violations.sort((a, b) => a.offset - b.offset || a.line - b.line);
  const usedAnnotations = new Set();
  const appliedAnnotations = [];
  const actionableViolations = violations.filter((violation) => {
    if (violation.source !== 'sql') return true;
    const annotationIndex = validAnnotations.findIndex((annotation, index) => (
      !usedAnnotations.has(index)
      && /^\s*$/.test(strippedSql.slice(annotation.endOffset, violation.offset))
    ));
    if (annotationIndex === -1) return true;

    usedAnnotations.add(annotationIndex);
    appliedAnnotations.push(validAnnotations[annotationIndex]);
    return false;
  });

  return {
    ok: actionableViolations.length === 0,
    hasAnnotation: appliedAnnotations.length > 0,
    annotationReason: appliedAnnotations[0]?.reason || null,
    violations: actionableViolations.map(({ offset, source, ...violation }) => violation),
  };
}

/**
 * Kiểm tra toàn diện cả Immutability và Destructive DDL.
 *
 * @param {{
 *   diffEntries: Array<{ status: string, path: string, oldPath?: string }>,
 *   readFileFn: (path: string) => string
 * }} options
 * @returns {{
 *   ok: boolean,
 *   immutabilityFailures: string[],
 *   ddlViolations: Array<{ file: string, line: number, rule: string, snippet: string, message: string }>,
 *   addedFiles: string[],
 *   annotatedFiles: Array<{ file: string, reason: string }>
 * }}
 */
export function checkMigrationSafety({ diffEntries, readFileFn }) {
  const immutability = checkMigrationImmutability(diffEntries);
  const ddlViolations = [];
  const annotatedFiles = [];

  for (const addedFile of immutability.addedFiles) {
    try {
      const content = readFileFn(addedFile);
      const lintResult = lintMigrationSqlContent(content, addedFile);
      if (lintResult.hasAnnotation) {
        annotatedFiles.push({ file: addedFile, reason: lintResult.annotationReason });
      }
      // Một annotation chỉ miễn đúng statement liền sau nó. Nếu file còn DDL
      // nguy hiểm khác, vẫn phải đưa vào kết quả fail; không được xem annotation
      // như công tắc tắt toàn bộ guard của file.
      if (!lintResult.ok) {
        ddlViolations.push(...lintResult.violations);
      }
    } catch (err) {
      ddlViolations.push({
        file: addedFile,
        rule: 'FILE_READ_ERROR',
        line: 1,
        snippet: '',
        message: `Không đọc được nội dung file migration: ${err.message}`,
      });
    }
  }

  const ok = immutability.ok && ddlViolations.length === 0;

  return {
    ok,
    immutabilityFailures: immutability.failures,
    ddlViolations,
    addedFiles: immutability.addedFiles,
    annotatedFiles,
  };
}
