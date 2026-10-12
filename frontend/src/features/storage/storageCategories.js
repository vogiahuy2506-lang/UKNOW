/**
 * Mọi giá trị `storage_objects.category` mà backend ghi cho kho workspace, kèm khoá nhãn i18n + màu thẻ.
 *
 * MỘT bảng dùng chung cho thẻ category, ô lọc và thẻ tổng hợp của Thư viện media. Trước đây hai bảng trùng
 * trong MediaLibraryPage lệch nhau (thiếu landing_asset / form_asset / form_receipt / other nên màn hiện mã thô).
 * Test `storageCategories.spec.js` ghim từng phần tử và đối chiếu với mã nguồn backend — backend thêm category mới
 * mà không thêm dòng ở đây là đỏ.
 *
 * `value` KHÔNG đổi tên (là mã trong DB): `zalo_template` hiển thị là "Mẫu tin nhắn" vì kho mẫu dùng chung 3 kênh.
 */
export const STORAGE_CATEGORIES = Object.freeze([
  { value: 'zalo_template', labelKey: 'mediaLibrary.categoryZaloTemplate', color: 'bg-blue-50 text-blue-700 border-blue-100', darkColor: 'dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800' },
  { value: 'email_template', labelKey: 'mediaLibrary.categoryEmailTemplate', color: 'bg-indigo-50 text-indigo-700 border-indigo-100', darkColor: 'dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800' },
  { value: 'chat', labelKey: 'mediaLibrary.categoryChat', color: 'bg-emerald-50 text-emerald-700 border-emerald-100', darkColor: 'dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' },
  { value: 'landing', labelKey: 'mediaLibrary.categoryLanding', color: 'bg-purple-50 text-purple-700 border-purple-100', darkColor: 'dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800' },
  { value: 'landing_version', labelKey: 'mediaLibrary.categoryLandingVersion', color: 'bg-purple-50 text-purple-700 border-purple-100', darkColor: 'dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800' },
  { value: 'landing_asset', labelKey: 'mediaLibrary.categoryLandingAsset', color: 'bg-purple-50 text-purple-700 border-purple-100', darkColor: 'dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800' },
  { value: 'form_asset', labelKey: 'mediaLibrary.categoryFormAsset', color: 'bg-cyan-50 text-cyan-700 border-cyan-100', darkColor: 'dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800' },
  { value: 'form_receipt', labelKey: 'mediaLibrary.categoryFormReceipt', color: 'bg-cyan-50 text-cyan-700 border-cyan-100', darkColor: 'dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800' },
  { value: 'form_file', labelKey: 'mediaLibrary.categoryFormFile', color: 'bg-cyan-50 text-cyan-700 border-cyan-100', darkColor: 'dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800' },
  { value: 'logo', labelKey: 'mediaLibrary.categoryLogo', color: 'bg-pink-50 text-pink-700 border-pink-100', darkColor: 'dark:bg-pink-950/40 dark:text-pink-300 dark:border-pink-800' },
  { value: 'campaign', labelKey: 'mediaLibrary.categoryCampaign', color: 'bg-amber-50 text-amber-700 border-amber-100', darkColor: 'dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800' },
  { value: 'quick_send', labelKey: 'mediaLibrary.categoryQuickSend', color: 'bg-amber-50 text-amber-700 border-amber-100', darkColor: 'dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800' },
  { value: 'support_ticket', labelKey: 'mediaLibrary.categorySupportTicket', color: 'bg-rose-50 text-rose-700 border-rose-100', darkColor: 'dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800' },
  { value: 'help', labelKey: 'mediaLibrary.categoryHelp', color: 'bg-teal-50 text-teal-700 border-teal-100', darkColor: 'dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800' },
  { value: 'temp', labelKey: 'mediaLibrary.categoryTemp', color: 'bg-slate-100 text-slate-700 border-slate-200', darkColor: 'dark:bg-dk-raised dark:text-dk-text dark:border-dk-border' },
  { value: 'other', labelKey: 'mediaLibrary.categoryOther', color: 'bg-slate-100 text-slate-700 border-slate-200', darkColor: 'dark:bg-dk-raised dark:text-dk-text dark:border-dk-border' },
]);

const UNKNOWN_CATEGORY_COLOR = 'bg-slate-100 text-slate-700 border-slate-200';
const UNKNOWN_CATEGORY_DARK_COLOR = 'dark:bg-dk-raised dark:text-dk-text dark:border-dk-border';

/**
 * Nhãn + màu của một category. Mã CHƯA biết thì giữ nguyên mã thô (không nuốt thành "Khác": nhìn thấy mã lạ thì
 * còn biết là thiếu nhãn, còn "Khác" thì che mất).
 */
export function resolveStorageCategory(category, t) {
  const found = STORAGE_CATEGORIES.find((item) => item.value === category);
  // `color` (sáng) và `darkColor` (tối) tách riêng để test ghim định dạng `color` không đổi; ghép lại khi trả ra.
  if (found) return { label: t(found.labelKey), color: `${found.color} ${found.darkColor}` };
  return { label: category || t('mediaLibrary.categoryOther'), color: `${UNKNOWN_CATEGORY_COLOR} ${UNKNOWN_CATEGORY_DARK_COLOR}` };
}
