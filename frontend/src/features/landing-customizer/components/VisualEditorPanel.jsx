import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useI18n } from '../../../i18n';
import landingCustomizerApiService from '../services/landingCustomizerApi.service';

const SECTIONS_BY_PAGE = {
  hero: [
    {
      id: 'stats',
      label: 'Stats (Số liệu)',
      fields: [
        { key: 'businesses', label: 'Doanh nghiệp', placeholder: '1,500+' },
        { key: 'leads', label: 'Leads', placeholder: '5M+' },
        { key: 'campaigns', label: 'Chiến dịch', placeholder: '500+' },
        { key: 'uptime', label: 'Uptime', placeholder: '99.9%' },
      ],
    },
    {
      id: 'hero_content',
      label: 'Hero Content',
      fields: [
        { key: 'tagline', label: 'Tagline', placeholder: 'Marketing tự động' },
        { key: 'titleLine1', label: 'Tiêu đề dòng 1', placeholder: 'Giải pháp' },
        { key: 'titleAccent', label: 'Tiêu đề accent', placeholder: 'Marketing' },
        { key: 'titleLine2', label: 'Tiêu đề dòng 2', placeholder: 'toàn diện' },
        { key: 'subtitle', label: 'Mô tả', placeholder: 'Mô tả ngắn...' },
      ],
    },
    {
      id: 'media',
      label: 'Media',
      fields: [
        { key: 'videoUrl', label: 'Video URL', placeholder: 'https://...', type: 'url' },
      ],
    },
    {
      id: 'features',
      label: 'Features (6 tính năng)',
      fields: [
        { key: 'feature1Title', label: 'Feature 1 - Tiêu đề', placeholder: 'Xây dựng chiến dịch' },
        { key: 'feature1Desc', label: 'Feature 1 - Mô tả', placeholder: 'Mô tả...' },
        { key: 'feature2Title', label: 'Feature 2 - Tiêu đề', placeholder: 'Gửi email' },
        { key: 'feature2Desc', label: 'Feature 2 - Mô tả', placeholder: 'Mô tả...' },
        { key: 'feature3Title', label: 'Feature 3 - Tiêu đề', placeholder: 'Tin nhắn Zalo' },
        { key: 'feature3Desc', label: 'Feature 3 - Mô tả', placeholder: 'Mô tả...' },
        { key: 'feature4Title', label: 'Feature 4 - Tiêu đề', placeholder: 'Quản lý khách hàng' },
        { key: 'feature4Desc', label: 'Feature 4 - Mô tả', placeholder: 'Mô tả...' },
        { key: 'feature5Title', label: 'Feature 5 - Tiêu đề', placeholder: 'Báo cáo' },
        { key: 'feature5Desc', label: 'Feature 5 - Mô tả', placeholder: 'Mô tả...' },
        { key: 'feature6Title', label: 'Feature 6 - Tiêu đề', placeholder: 'Bảo mật' },
        { key: 'feature6Desc', label: 'Feature 6 - Mô tả', placeholder: 'Mô tả...' },
      ],
    },
    {
      id: 'steps',
      label: 'How It Works (4 bước)',
      fields: [
        { key: 'step1Title', label: 'Bước 1 - Tiêu đề', placeholder: 'Đăng ký' },
        { key: 'step1Desc', label: 'Bước 1 - Mô tả', placeholder: 'Mô tả...' },
        { key: 'step2Title', label: 'Bước 2 - Tiêu đề', placeholder: 'Cấu hình' },
        { key: 'step2Desc', label: 'Bước 2 - Mô tả', placeholder: 'Mô tả...' },
        { key: 'step3Title', label: 'Bước 3 - Tiêu đề', placeholder: 'Chạy chiến dịch' },
        { key: 'step3Desc', label: 'Bước 3 - Mô tả', placeholder: 'Mô tả...' },
        { key: 'step4Title', label: 'Bước 4 - Tiêu đề', placeholder: 'Theo dõi' },
        { key: 'step4Desc', label: 'Bước 4 - Mô tả', placeholder: 'Mô tả...' },
      ],
    },
    {
      id: 'benefits',
      label: 'Benefits (4 lợi ích)',
      fields: [
        { key: 'benefit1Title', label: 'Lợi ích 1 - Tiêu đề', placeholder: 'Nhanh chóng' },
        { key: 'benefit1Desc', label: 'Lợi ích 1 - Mô tả', placeholder: 'Mô tả...' },
        { key: 'benefit2Title', label: 'Lợi ích 2 - Tiêu đề', placeholder: 'Hỗ trợ 24/7' },
        { key: 'benefit2Desc', label: 'Lợi ích 2 - Mô tả', placeholder: 'Mô tả...' },
        { key: 'benefit3Title', label: 'Lợi ích 3 - Tiêu đề', placeholder: 'Cam kết' },
        { key: 'benefit3Desc', label: 'Lợi ích 3 - Mô tả', placeholder: 'Mô tả...' },
        { key: 'benefit4Title', label: 'Lợi ích 4 - Tiêu đề', placeholder: 'Dễ dùng' },
        { key: 'benefit4Desc', label: 'Lợi ích 4 - Mô tả', placeholder: 'Mô tả...' },
      ],
    },
    {
      id: 'cta',
      label: 'CTA Section',
      fields: [
        { key: 'ctaReady', label: 'Tiêu đề CTA', placeholder: 'Sẵn sàng bắt đầu?' },
        { key: 'ctaSubtitle', label: 'Mô tả CTA', placeholder: 'Dùng thử miễn phí...' },
        { key: 'ctaButton', label: 'Nút CTA', placeholder: 'Bắt đầu miễn phí' },
        { key: 'ctaNote', label: 'Ghi chú dưới nút', placeholder: 'Không cần thẻ tín dụng' },
      ],
    },
  ],
  contact: [
    {
      id: 'contact_info',
      label: 'Thông tin liên hệ',
      fields: [
        { key: 'email', label: 'Email', placeholder: 'hello@founderai.vn' },
        { key: 'emailLabel', label: 'Nhãn Email', placeholder: 'Email' },
        { key: 'emailValue', label: 'Giá trị Email', placeholder: 'hello@founderai.vn' },
        { key: 'hotline', label: 'Hotline Label', placeholder: 'Hotline' },
        { key: 'hotlineValue', label: 'Hotline Number', placeholder: '19006868' },
        { key: 'zalo', label: 'Zalo Label', placeholder: 'Zalo' },
        { key: 'zaloValue', label: 'Zalo Value', placeholder: 'Zalo OA' },
        { key: 'office', label: 'Office Label', placeholder: 'Văn phòng' },
        { key: 'officeValue', label: 'Office Address', placeholder: 'TP. Hồ Chí Minh' },
      ],
    },
    {
      id: 'hero',
      label: 'Hero Section',
      fields: [
        { key: 'title', label: 'Tiêu đề', placeholder: 'Liên hệ' },
        { key: 'subtitle', label: 'Mô tả', placeholder: 'Hãy liên hệ...' },
      ],
    },
    {
      id: 'form',
      label: 'Form Labels',
      fields: [
        { key: 'formTitle', label: 'Tiêu đề form', placeholder: 'Gửi yêu cầu' },
        { key: 'formSubtitle', label: 'Mô tả form', placeholder: 'Chúng tôi sẽ...' },
      ],
    },
  ],
  pricing: [
    {
      id: 'section',
      label: 'Pricing Section',
      fields: [
        { key: 'title', label: 'Tiêu đề', placeholder: 'Bảng giá' },
        { key: 'subtitle', label: 'Mô tả', placeholder: 'Chọn gói...' },
      ],
    },
  ],
};

export default function VisualEditorPanel({ page, overrides, onSave, isSaving }) {
  const { t } = useI18n();
  const [localValues, setLocalValues] = useState({});
  const [hasChanges, setHasChanges] = useState(false);

  const sections = SECTIONS_BY_PAGE[page] || [];

  useEffect(() => {
    const values = {};
    for (const section of sections) {
      for (const field of section.fields) {
        const existing = overrides.find(
          (o) => o.section === section.id && o.key === field.key
        );
        values[`${section.id}|${field.key}`] = {
          valueVi: existing?.valueVi || '',
          valueEn: existing?.valueEn || '',
        };
      }
    }
    setLocalValues(values);
    setHasChanges(false);
  }, [page, overrides, sections]);

  const handleChange = (sectionId, fieldKey, lang, value) => {
    setLocalValues((prev) => ({
      ...prev,
      [`${sectionId}|${fieldKey}`]: {
        ...prev[`${sectionId}|${fieldKey}`],
        [lang === 'vi' ? 'valueVi' : 'valueEn']: value,
      },
    }));
    setHasChanges(true);
  };

  const handleSaveSection = async (sectionId) => {
    const sectionFields = sections.find((s) => s.id === sectionId)?.fields || [];
    const items = [];
    
    for (const field of sectionFields) {
      const values = localValues[`${sectionId}|${field.key}`];
      if (values) {
        items.push({
          page,
          section: sectionId,
          key: field.key,
          valueVi: values.valueVi || null,
          valueEn: values.valueEn || null,
        });
      }
    }

    const success = await onSave(items);
    if (success) {
      setHasChanges(false);
    }
  };

  const handleSaveAll = async () => {
    const items = [];
    for (const [key, values] of Object.entries(localValues)) {
      const [sectionId, fieldKey] = key.split('|');
      items.push({
        page,
        section: sectionId,
        key: fieldKey,
        valueVi: values.valueVi || null,
        valueEn: values.valueEn || null,
      });
    }

    const success = await onSave(items);
    if (success) {
      setHasChanges(false);
    }
  };

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <div
          key={section.id}
          className="bg-white rounded-2xl border border-slate-200 overflow-hidden"
        >
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-bold text-slate-800">{section.label}</h3>
            <button
              onClick={() => handleSaveSection(section.id)}
              disabled={isSaving}
              className="px-4 py-1.5 bg-orange-500 text-white text-sm font-semibold rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Đang lưu...' : 'Lưu section'}
            </button>
          </div>
          
          <div className="p-6 space-y-4">
            {section.fields.map((field) => {
              const values = localValues[`${section.id}|${field.key}`] || { valueVi: '', valueEn: '' };
              return (
                <div key={field.key} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                      {field.label} (VI)
                    </label>
                    <input
                      type={field.type || 'text'}
                      value={values.valueVi}
                      onChange={(e) => handleChange(section.id, field.key, 'vi', e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-100 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                      {field.label} (EN)
                    </label>
                    <input
                      type={field.type || 'text'}
                      value={values.valueEn}
                      onChange={(e) => handleChange(section.id, field.key, 'en', e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-100 outline-none transition-all"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {sections.length > 1 && (
        <div className="flex justify-end">
          <button
            onClick={handleSaveAll}
            disabled={isSaving || !hasChanges}
            className="px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-orange-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Đang lưu...' : hasChanges ? 'Lưu tất cả thay đổi' : 'Không có thay đổi'}
          </button>
        </div>
      )}
    </div>
  );
}
