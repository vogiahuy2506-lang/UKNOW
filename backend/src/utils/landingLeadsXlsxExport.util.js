import ExcelJS from 'exceljs';

/**
 * Tạo nội dung file Excel (.xlsx) cho danh sách lead landing (màn admin).
 *
 * Luồng hoạt động:
 * 1. Khởi tạo workbook + sheet, cố định hàng tiêu đề.
 * 2. Ghi từng dòng theo cột hiển thị trên UI (họ tên, liên hệ, slug, nghề, lĩnh vực, đồng ý marketing, thời gian).
 * 3. Trả Buffer để controller gửi `Content-Disposition: attachment`.
 *
 * @param {object[]} items Các object đã qua `mapLeadRowToCampaignItem`
 * @returns {Promise<Buffer>}
 */
export async function buildLandingLeadsAdminXlsxBuffer(items) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Khách landing', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = [
    { header: 'Họ và tên', key: 'fullName', width: 28 },
    { header: 'Email', key: 'email', width: 32 },
    { header: 'Điện thoại', key: 'phone', width: 16 },
    { header: 'Landing / slug', key: 'landingPageSlug', width: 18 },
    { header: 'Nghề', key: 'occupation', width: 22 },
    { header: 'Lĩnh vực quan tâm', key: 'interestArea', width: 28 },
    { header: 'Đồng ý nhận tin', key: 'marketingConsent', width: 18 },
    { header: 'Thời gian đăng ký', key: 'createdAt', width: 22 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF3F4F6' },
  };

  for (const item of items) {
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

    sheet.addRow({
      fullName: item.fullName || '—',
      email: item.email || '',
      phone: item.phone || '',
      landingPageSlug: item.landingPageSlug || '',
      occupation: item.occupation || '',
      interestArea: item.interestArea || '',
      marketingConsent: item.marketingConsent ? 'Có' : 'Không',
      createdAt: createdStr,
    });
  }

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}
