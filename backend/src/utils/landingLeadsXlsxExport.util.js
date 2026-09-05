import ExcelJS from 'exceljs';

function formulaSafe(value) {
  const text = value == null ? '' : String(value);
  if (!text) return '';
  if (/^[=+\-@]/.test(text) || text.startsWith('\t')) {
    return `'${text}`;
  }
  return text;
}

function displayForLocale(entry, locale = 'vi') {
  if (!entry || typeof entry !== 'object') return '';
  if (locale === 'en') {
    return entry.displayEn || entry.displayVi || String(entry.value ?? '');
  }
  return entry.displayVi || entry.displayEn || String(entry.value ?? '');
}

function headerForKey(key, currentByKey, snapshotEntry) {
  const current = currentByKey.get(key);
  if (current?.labelVi) return `${current.labelVi} (${key})`;
  if (snapshotEntry?.labelVi) return `${snapshotEntry.labelVi} (${key})`;
  return key;
}

/**
 * Tạo nội dung file Excel (.xlsx) cho danh sách lead landing (màn admin).
 *
 * @param {object[]} items Admin items (customFields = snapshot DTO)
 * @param {{ currentSchemas?: object[] }} [opts]
 * @returns {Promise<Buffer>}
 */
export async function buildLandingLeadsAdminXlsxBuffer(items, opts = {}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Khách landing', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  const currentByKey = new Map();
  for (const field of opts.currentSchemas || []) {
    if (field?.key) currentByKey.set(field.key, field);
  }

  const customKeys = [];
  const seen = new Set();
  for (const item of items || []) {
    const cf = item?.customFields && typeof item.customFields === 'object' ? item.customFields : {};
    for (const key of Object.keys(cf)) {
      if (seen.has(key)) continue;
      seen.add(key);
      customKeys.push(key);
    }
  }

  sheet.columns = [
    { header: 'Họ và tên', key: 'fullName', width: 28 },
    { header: 'Email', key: 'email', width: 32 },
    { header: 'Điện thoại', key: 'phone', width: 16 },
    { header: 'Trang nguồn', key: 'landingPageSlug', width: 18 },
    { header: 'Nghề', key: 'occupation', width: 22 },
    { header: 'Lĩnh vực quan tâm', key: 'interestArea', width: 28 },
    { header: 'Đồng ý nhận tin', key: 'marketingConsent', width: 18 },
    { header: 'Thời gian đăng ký', key: 'createdAt', width: 22 },
    ...customKeys.map((key) => ({
      header: formulaSafe(headerForKey(key, currentByKey, null)),
      key,
      width: 24,
    })),
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF3F4F6' },
  };
  customKeys.forEach((key, i) => {
    const sample = (items || []).find((item) => item?.customFields?.[key]);
    const header = headerForKey(key, currentByKey, sample?.customFields?.[key]);
    headerRow.getCell(9 + i).value = formulaSafe(header);
  });

  for (const item of items || []) {
    const created = item.createdAt ? new Date(item.createdAt) : null;
    const createdStr =
      created && !Number.isNaN(created.getTime())
        ? created.toLocaleString('vi-VN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
        : '';

    const row = {
      fullName: formulaSafe(item.fullName || '—'),
      email: formulaSafe(item.email || ''),
      phone: formulaSafe(item.phone || ''),
      landingPageSlug: formulaSafe(item.landingPageSlug || ''),
      occupation: formulaSafe(item.occupation || ''),
      interestArea: formulaSafe(item.interestArea || ''),
      marketingConsent: item.marketingConsent === true ? 'Có' : item.marketingConsent === false ? 'Không' : '—',
      createdAt: createdStr,
    };
    const cf = item.customFields && typeof item.customFields === 'object' ? item.customFields : {};
    for (const key of customKeys) {
      row[key] = formulaSafe(displayForLocale(cf[key], 'vi'));
    }
    sheet.addRow(row);
  }

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}
