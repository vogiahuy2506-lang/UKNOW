import { useState } from 'react';
import { FaRocket, FaChartLine, FaUsers, FaCog, FaShieldAlt, FaBolt, FaCheck, FaStar, FaGift, FaHeart, FaLightbulb, FaBullseye, FaTrophy, FaMedal, FaCrown, FaFire, FaGem, FaAward, FaBuilding, FaBriefcase, FaCalendar, FaClock, FaGlobe, FaMapMarkerAlt, FaEnvelope, FaPhone, FaMobileAlt, FaComment, FaComments, FaHeadset, FaLifeRing, FaQuestion, FaInfo, FaExclamation, FaBell, FaEnvelopeOpen, FaPaperPlane, FaLocationArrow, FaEdit, FaPlus, FaMinus, FaTimes, FaCheckCircle, FaArrowRight, FaArrowLeft, FaChevronRight, FaChevronLeft, FaExternalLinkSquareAlt, FaLink, FaCopy, FaSave, FaTrash, FaPen } from 'react-icons/fa';

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

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm hover:bg-slate-600"
      >
        {IconComponent ? (
          <IconComponent className="w-5 h-5 flex-shrink-0" />
        ) : (
          <span className="text-slate-400">Chọn icon...</span>
        )}
        <span className="flex-1 text-left truncate">{value || 'Chọn icon'}</span>
        <FaChevronRight className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-2 w-72 bg-slate-800 rounded-xl shadow-2xl border border-slate-600 overflow-hidden">
          <div className="p-3 border-b border-slate-600">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm kiếm icon..."
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
              autoFocus
            />
          </div>
          
          <div className="flex border-b border-slate-600 overflow-x-auto">
            {Object.keys(filteredGroups).map(group => (
              <button
                key={group}
                onClick={() => setSelectedGroup(group)}
                className={`px-3 py-2 text-xs font-medium whitespace-nowrap ${
                  selectedGroup === group 
                    ? 'text-orange-400 border-b-2 border-orange-400 bg-slate-700' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                {group}
              </button>
            ))}
          </div>

          <div className="p-2 max-h-64 overflow-y-auto">
            <div className="grid grid-cols-6 gap-1">
              {(filteredGroups[selectedGroup] || []).map(iconName => {
                const Icon = ICON_MAP[iconName];
                return (
                  <button
                    key={iconName}
                    onClick={() => handleSelect(iconName)}
                    className={`p-2 rounded-lg flex items-center justify-center transition-colors ${
                      value === iconName 
                        ? 'bg-orange-500 text-white' 
                        : 'hover:bg-slate-700 text-white'
                    }`}
                    title={iconName}
                  >
                    <Icon className="w-4 h-4" />
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
