import { useState, useEffect } from 'react';
import {
  HiOutlineX, HiOutlineSearch, HiOutlineSparkles
} from 'react-icons/hi';
import api from '../../../services/api';

const CATEGORY_LABELS = {
  lead_capture: 'Thu thập Lead',
  product: 'Sản phẩm',
  event: 'Sự kiện / Webinar',
  webinar: 'Webinar',
  ecommerce: 'Cửa hàng',
  consultation: 'Tư vấn',
};

const CATEGORY_ICONS = {
  lead_capture: '📋',
  product: '🏷️',
  event: '🎫',
  webinar: '💻',
  ecommerce: '🛒',
  consultation: '💼',
};

/**
 * Template Selector Modal for choosing a base template before generating.
 */
const TemplateSelector = ({ isOpen, onClose, onSelect }) => {
  const [templates, setTemplates] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [hoveredId, setHoveredId] = useState(null);

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
    }
  }, [isOpen]);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const [templatesRes, categoriesRes] = await Promise.all([
        api.get('/landing-templates'),
        api.get('/landing-templates/categories'),
      ]);
      setTemplates(templatesRes.data.data || []);
      setCategories(categoriesRes.data.data || []);
    } catch (error) {
      console.error('Failed to fetch templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTemplates = templates.filter((t) => {
    const matchesCategory = !selectedCategory || t.category === selectedCategory;
    const matchesSearch = !searchTerm ||
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.description?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleSelect = (template) => {
    onSelect(template);
    onClose();
  };

  const handleSkipTemplate = () => {
    onSelect(null); // null = no template, generate from scratch
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-pink-500 rounded-xl flex items-center justify-center">
              <HiOutlineSparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800 text-lg">Chọn Template</h2>
              <p className="text-xs text-slate-500">Chọn một mẫu làm nền tảng hoặc tạo từ đầu</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <HiOutlineX className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Search & Filter */}
        <div className="flex-shrink-0 p-4 border-b border-slate-100 bg-slate-50">
          <div className="flex gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm kiếm template..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"
              />
            </div>
          </div>

          {/* Category Pills */}
          <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`shrink-0 px-4 py-2 rounded-full text-xs font-semibold transition-all ${
                !selectedCategory
                  ? 'bg-slate-800 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              Tất cả
            </button>
            {categories.map((cat) => (
              <button
                key={cat.category}
                onClick={() => setSelectedCategory(cat.category)}
                className={`shrink-0 px-4 py-2 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  selectedCategory === cat.category
                    ? 'bg-slate-800 text-white'
                    : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <span>{CATEGORY_ICONS[cat.category] || '📄'}</span>
                <span>{CATEGORY_LABELS[cat.category] || cat.category}</span>
                <span className={`text-[10px] ${selectedCategory === cat.category ? 'text-slate-300' : 'text-slate-400'}`}>
                  ({cat.count})
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Template Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-3 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-400">Không tìm thấy template nào</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {/* Skip/Blank option */}
              <button
                onClick={handleSkipTemplate}
                className="group relative bg-white border-2 border-dashed border-slate-200 rounded-2xl p-6 hover:border-orange-300 hover:bg-orange-50/50 transition-all text-left"
              >
                <div className="flex flex-col items-center justify-center h-full min-h-[160px]">
                  <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-3 group-hover:bg-orange-100 transition-colors">
                    <span className="text-3xl">✨</span>
                  </div>
                  <span className="font-bold text-slate-700 text-sm">Tạo từ đầu</span>
                  <span className="text-xs text-slate-400 mt-1">Không dùng template</span>
                </div>
              </button>

              {filteredTemplates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleSelect(template)}
                  onMouseEnter={() => setHoveredId(template.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`group relative bg-white border-2 rounded-2xl p-4 hover:border-orange-400 hover:shadow-lg transition-all text-left ${
                    hoveredId === template.id ? 'border-orange-400 shadow-lg' : 'border-slate-200'
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="aspect-[4/3] bg-gradient-to-br from-slate-100 to-slate-50 rounded-xl mb-3 flex items-center justify-center overflow-hidden">
                    <div className="text-center p-4">
                      <div className="text-4xl mb-2">{CATEGORY_ICONS[template.category] || '📄'}</div>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">
                        {CATEGORY_LABELS[template.category] || template.category}
                      </div>
                    </div>
                  </div>

                  {/* Info */}
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm leading-tight line-clamp-1">
                      {template.name}
                    </h3>
                    {template.description && (
                      <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">
                        {template.description}
                      </p>
                    )}
                  </div>

                  {/* Hover Overlay */}
                  <div className={`absolute inset-0 bg-orange-500/90 rounded-2xl flex items-center justify-center transition-opacity ${
                    hoveredId === template.id ? 'opacity-100' : 'opacity-0'
                  }`}>
                    <span className="text-white font-bold text-sm">Chọn template này</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 p-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="w-full py-3 text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors"
          >
            Huỷ
          </button>
        </div>
      </div>
    </div>
  );
};

export default TemplateSelector;
