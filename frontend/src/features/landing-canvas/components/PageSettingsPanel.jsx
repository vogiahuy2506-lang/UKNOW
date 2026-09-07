import { useI18n } from '../../../i18n';

/**
 * Page Settings Panel — landing page info + publish state.
 *
 * Page settings là thông tin cơ bản của landing page:
 *  - Title (cũng có thể sửa trên topbar)
 *  - Trạng thái Publish
 *
 * Slug đã chuyển sang tab "Tên miền" (ở đó user chọn sub miễn phí hoặc domain riêng).
 */
export default function PageSettingsPanel({ form, setForm }) {
  const tc = useI18n('landingCanvas.pageSettingsPanel');
  return (
    <div className="space-y-7">
      {/* Card: Tiêu đề */}
      <section className="rounded-xl border border-gray-200 bg-white p-7 shadow-sm">
        <h3 className="text-[20px] font-semibold text-gray-900 mb-2">{tc('titleLabel')}</h3>
        <p className="text-[16px] text-gray-500 mb-5 leading-relaxed">
          {tc('titleHelp')}
        </p>
        <input
          type="text"
          value={form?.title || ''}
          onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
          placeholder={tc('titlePlaceholder')}
          className="w-full rounded-lg border border-gray-300 px-5 py-4 text-[18px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition"
        />
      </section>

      {/* Card: Publish */}
      <section className="rounded-xl border border-gray-200 bg-white p-7 shadow-sm">
        <h3 className="text-[20px] font-semibold text-gray-900 mb-2">{tc('publishTitle')}</h3>
        <p className="text-[16px] text-gray-500 mb-5 leading-relaxed">
          {tc('publishHelp')}
        </p>
        <label className="flex items-start gap-4 cursor-pointer rounded-lg border border-gray-200 p-5 hover:bg-gray-50 transition-colors">
          <input
            type="checkbox"
            checked={Boolean(form?.isPublished)}
            onChange={(e) => setForm((prev) => ({ ...prev, isPublished: e.target.checked }))}
            className="mt-1 rounded border-gray-300 text-orange-500 focus:ring-orange-500 w-6 h-6"
          />
          <div className="flex-1">
            <p className="text-[18px] font-semibold text-gray-900">
              {form?.isPublished ? tc('published') : tc('draft')}
            </p>
            <p className="text-[16px] text-gray-500 mt-1.5 leading-relaxed">
              {form?.isPublished ? tc('publishedDesc') : tc('draftDesc')}
            </p>
          </div>
        </label>
      </section>
    </div>
  );
}
