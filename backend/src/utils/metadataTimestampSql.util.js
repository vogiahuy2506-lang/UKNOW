/**
 * Biểu thức timestamp JSONB ở campaign runtime không được ép kiểu trực tiếp:
 * một giá trị metadata hỏng không được làm hỏng toàn bộ lượt scheduler.
 *
 * App chỉ ghi timestamp ISO-8601 canonical (UTC `Z` hoặc offset `+HH:MM`,
 * với mili-giây tùy chọn). Parser này cố ý chỉ nhận tập con đó. Giá trị khác
 * trả về NULL để caller quyết định fail-safe phù hợp với từng loại metadata.
 */
const CANONICAL_ISO_8601_PATTERN =
  "^[1-9][0-9]{3}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\\.[0-9]{3})?(?:Z|[+-](?:(?:0[0-9]|1[0-3]):[0-5][0-9]|14:00))$";

/**
 * Tạo SQL parse timestamp ISO-8601 không thể ném lỗi từ JSON text hỏng.
 *
 * Không dùng `${valueSql}::timestamptz`: PostgreSQL không có TRY_CAST ở các
 * version production có thể đang dùng. Thay vào đó, CASE chỉ gọi
 * `make_timestamptz` sau khi đã kiểm tra hình dạng, ngày theo lịch, giờ và
 * timezone offset. Với giá trị không hợp lệ biểu thức trả về NULL.
 *
 * @param {string} valueSql biểu thức SQL trả text, ví dụ `meta->>'nextDueAt'`
 * @returns {string} biểu thức SQL `timestamptz | NULL`
 */
export function safeMetadataTimestampSql(valueSql) {
  const rawValueSql = String(valueSql || '').trim();
  if (!rawValueSql) {
    throw new Error('safeMetadataTimestampSql requires a non-empty SQL expression');
  }

  const value = `TRIM(COALESCE(${rawValueSql}, ''))`;
  const year = `substring(${value} FROM 1 FOR 4)`;
  const month = `substring(${value} FROM 6 FOR 2)`;
  const day = `substring(${value} FROM 9 FOR 2)`;
  const hour = `substring(${value} FROM 12 FOR 2)`;
  const minute = `substring(${value} FROM 15 FOR 2)`;
  const second = `substring(${value} FROM 18 FOR 2)`;
  const hasMilliseconds = `substring(${value} FROM 20 FOR 1) = '.'`;
  const milliseconds = `substring(${value} FROM 21 FOR 3)`;
  const offset = `right(${value}, 6)`;
  const offsetHours = `substring(${offset} FROM 2 FOR 2)`;
  const offsetMinutes = `substring(${offset} FROM 5 FOR 2)`;
  const leapYear = `(
    (${year}::int % 4 = 0)
    AND ((${year}::int % 100) <> 0 OR (${year}::int % 400) = 0)
  )`;
  const validCalendarDay = `(
    (${month} IN ('01', '03', '05', '07', '08', '10', '12') AND ${day} <= '31')
    OR (${month} IN ('04', '06', '09', '11') AND ${day} <= '30')
    OR (${month} = '02' AND ${day} <= CASE WHEN ${leapYear} THEN '29' ELSE '28' END)
  )`;
  const secondsWithMilliseconds = `(
    ${second}::double precision
    + CASE WHEN ${hasMilliseconds} THEN ${milliseconds}::double precision / 1000 ELSE 0 END
  )`;
  const offsetInterval = `CASE
    WHEN right(${value}, 1) = 'Z' THEN interval '0 seconds'
    WHEN substring(${offset} FROM 1 FOR 1) = '+' THEN make_interval(
      hours => ${offsetHours}::int,
      mins => ${offsetMinutes}::int
    )
    ELSE -make_interval(
      hours => ${offsetHours}::int,
      mins => ${offsetMinutes}::int
    )
  END`;

  return `(
    CASE
      WHEN ${value} ~ '${CANONICAL_ISO_8601_PATTERN}' THEN
        CASE
          WHEN ${validCalendarDay} THEN
            make_timestamptz(
              ${year}::int,
              ${month}::int,
              ${day}::int,
              ${hour}::int,
              ${minute}::int,
              ${secondsWithMilliseconds},
              'UTC'
            ) - ${offsetInterval}
          ELSE NULL
        END
      ELSE NULL
    END
  )`;
}
