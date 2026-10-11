import { useState } from 'react';
import { FaRocket, FaChartLine, FaUsers, FaCog, FaShieldAlt, FaBolt, FaCheck, FaStar, FaGift, FaHeart, FaLightbulb, FaBullseye, FaTrophy, FaMedal, FaCrown, FaFire, FaGem, FaAward, FaBuilding, FaBriefcase, FaCalendar, FaClock, FaGlobe, FaMapMarkerAlt, FaEnvelope, FaPhone, FaMobileAlt, FaComment, FaComments, FaHeadset, FaLifeRing, FaQuestion, FaInfo, FaExclamation, FaBell, FaEnvelopeOpen, FaPaperPlane, FaLocationArrow, FaEdit, FaPlus, FaMinus, FaTimes, FaCheckCircle, FaArrowRight, FaArrowLeft, FaChevronRight, FaChevronLeft, FaExternalLinkSquareAlt, FaLink, FaCopy, FaSave, FaTrash, FaPen } from 'react-icons/fa';
import { useI18n } from '../../../i18n';

const ICON_GROUPS = {
  'General': ['FaRocket', 'FaChartLine', 'FaUsers', 'FaCog', 'FaShieldAlt', 'FaBolt', 'FaCheck', 'FaStar', 'FaGift', 'FaHeart', 'FaLightbulb', 'FaBullseye', 'FaTrophy', 'FaMedal', 'FaCrown', 'FaFire', 'FaGem', 'FaAward'],
  'Business': ['FaBuilding', 'FaBriefcase', 'FaCalendar', 'FaClock', 'FaGlobe', 'FaMapMarkerAlt', 'FaEnvelope', 'FaPhone', 'FaMobileAlt', 'FaComment', 'FaComments'],
  'Support': ['FaHeadset', 'FaLifeRing', 'FaQuestion', 'FaInfo', 'FaExclamation', 'FaBell', 'FaEnvelopeOpen'],
  'Actions': ['FaPaperPlane', 'FaLocationArrow', 'FaEdit', 'FaPen', 'FaPlus', 'FaMinus', 'FaTimes', 'FaCheckCircle', 'FaArrowRight', 'FaArrowLeft', 'FaChevronRight', 'FaChevronLeft', 'FaExternalLinkSquareAlt', 'FaLink', 'FaCopy', 'FaSave', 'FaTrash'],
};

const ICON_MAP = {
  FaRocket, FaChartLine, FaUsers, FaCog, FaShieldAlt, FaBolt, FaCheck, FaStar, FaGift, FaHeart, FaLightbulb, FaBullseye, FaTrophy, FaMedal, FaCrown, FaFire, FaGem, FaAward,
  FaBuilding, FaBriefcase, FaCalendar, FaClock, FaGlobe, FaMapMarkerAlt, FaEnvelope, FaPhone, FaMobileAlt, FaComment, FaComments,
  FaHeadset, FaLifeRing, FaQuestion, FaInfo, FaExclamation, FaBell, FaEnvelopeOpen,
  FaPaperPlane, FaLocationArrow, FaEdit, FaPen, FaPlus, FaMinus, FaTimes, FaCheckCircle, FaArrowRight, FaArrowLeft, FaChevronRight, FaChevronLeft, FaExternalLinkSquareAlt, FaLink, FaCopy, FaSave, FaTrash,
};

export default function IconPicker({ value, onChange }) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState('General');
  const [search, setSearch] = useState('');

  const currentIcon = value && ICON_MAP[value] ? ICON_MAP[value] : null;
  const IconComponent = currentIcon;

  const filteredGroups = Object.entries(ICON_GROUPS).reduce((acc, [group, icons]) => {
    const filtered = icons.filter(icon => 
      icon.toLowerCase().includes(search.toLowerCase())
    );
    if (filtered.length > 0) {
      acc[group] = filtered;
    }
    return acc;
  }, {});

  const handleSelect = (iconName) => {
    onChange(iconName);
    setIsOpen(false);
    setSearch('');
  };

  const getGroupLabel = (group) => {
    switch (group) {
      case 'General': return t('landingCustomizer.icons.general', 'Chung');
      case 'Business': return t('landingCustomizer.icons.business', 'Kinh doanh');
      case 'Support': return t('landingCustomizer.icons.support', 'Hỗ trợ');
      case 'Actions': return t('landingCustomizer.icons.actions', 'Thao tác');
      default: return group;
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-white dark:bg-dk-inset border border-slate-200 dark:border-dk-border rounded-lg text-slate-800 dark:text-dk-text text-xs hover:border-slate-300 dark:hover:border-dk-border-strong transition-colors"
      >
        {IconComponent ? (
          <IconComponent className="w-4 h-4 flex-shrink-0 text-orange-500" />
        ) : (
          <span className="text-slate-400">{t('landingCustomizer.icons.chooseIcon', 'Chọn icon...')}</span>
        )}
        <span className="flex-1 text-left truncate">{value || t('landingCustomizer.icons.chooseIcon', 'Chọn icon...')}</span>
        <FaChevronRight className={`w-3 h-3 text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-2 w-72 bg-white dark:bg-dk-raised rounded-xl shadow-2xl border border-slate-200 dark:border-dk-border overflow-hidden">
          <div className="p-2.5 border-b border-slate-100 dark:border-dk-border">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('landingCustomizer.icons.searchPlaceholder', 'Tìm kiếm icon...')}
              className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-lg text-slate-800 dark:text-dk-text text-xs placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-orange-500"
              autoFocus
            />
          </div>
          
          <div className="flex border-b border-slate-100 dark:border-dk-border overflow-x-auto bg-slate-50/50 dark:bg-dk-surface">
            {Object.keys(filteredGroups).map(group => (
              <button
                key={group}
                onClick={() => setSelectedGroup(group)}
                className={`px-3 py-1.5 text-[11px] font-medium whitespace-nowrap transition-colors ${
                  selectedGroup === group 
                    ? 'text-orange-500 border-b-2 border-orange-500 bg-white dark:bg-dk-raised font-semibold' 
                    : 'text-slate-500 dark:text-dk-text2 hover:text-slate-900 dark:hover:text-dk-text'
                }`}
              >
                {getGroupLabel(group)}
              </button>
            ))}
          </div>

          <div className="p-2 max-h-56 overflow-y-auto">
            <div className="grid grid-cols-6 gap-1">
              {(filteredGroups[selectedGroup] || []).map(iconName => {
                const Icon = ICON_MAP[iconName];
                return (
                  <button
                    key={iconName}
                    onClick={() => handleSelect(iconName)}
                    className={`p-2 rounded-lg flex items-center justify-center transition-colors ${
                      value === iconName 
                        ? 'bg-orange-500 text-white shadow-sm' 
                        : 'hover:bg-slate-100 dark:hover:bg-dk-raised text-slate-700 dark:text-dk-text'
                    }`}
                    title={iconName}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
