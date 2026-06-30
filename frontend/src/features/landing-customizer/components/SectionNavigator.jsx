import { useState } from 'react';

const TYPE_ICONS = {
  text: 'Aa',
  textarea: '¶',
  color: '🎨',
  icon: '★',
  image: '🖼',
};

const TYPE_COLORS = {
  text: 'text-blue-400',
  textarea: 'text-blue-400',
  color: 'text-pink-400',
  icon: 'text-yellow-400',
  image: 'text-green-400',
};

export default function SectionNavigator({
  elementDefs = [],
  selectedElementId,
  onElementSelect,
  onElementVisibilityChange,
  elementPositions = {},
}) {
  const [expandedSections, setExpandedSections] = useState({});

  // Group elements by section
  const sections = elementDefs.reduce((acc, def) => {
    if (!acc[def.section]) {
      acc[def.section] = [];
    }
    acc[def.section].push(def);
    return acc;
  }, {});

  // Toggle section expansion
  const toggleSection = (sectionName) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionName]: !prev[sectionName],
    }));
  };

  // Count custom positioned elements in a section
  const countCustomPositioned = (sectionElements) => {
    return sectionElements.filter(el => {
      const pos = elementPositions[el.id];
      return pos && (pos.top !== undefined || pos.left !== undefined);
    }).length;
  };

  // Get visible count in section
  const getVisibleCount = (sectionElements) => {
    return sectionElements.filter(el => {
      const pos = elementPositions[el.id];
      return pos?.visible !== false;
    }).length;
  };

  return (
    <div className="w-60 bg-slate-800 border-r border-slate-700 flex flex-col max-h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-slate-900 border-b border-slate-700 flex-shrink-0">
        <h3 className="text-white font-semibold text-sm">Layers</h3>
        <p className="text-slate-400 text-xs mt-0.5">{elementDefs.length} elements</p>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-slate-700 flex-shrink-0">
        <input
          type="text"
          placeholder="Search elements..."
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-xs focus:outline-none focus:ring-1 focus:ring-orange-500 placeholder-slate-400"
        />
      </div>

      {/* Element tree */}
      <div className="flex-1 overflow-y-auto p-2">
        {Object.entries(sections).map(([sectionName, elements]) => {
          const isExpanded = expandedSections[sectionName] !== false; // Default expanded
          const customCount = countCustomPositioned(elements);
          const visibleCount = getVisibleCount(elements);
          const totalCount = elements.length;

          return (
            <div key={sectionName} className="mb-1">
              {/* Section header */}
              <button
                onClick={() => toggleSection(sectionName)}
                className="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-slate-700/50 transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 text-xs transition-transform">
                    {isExpanded ? '▼' : '▶'}
                  </span>
                  <span className="text-slate-200 text-sm font-medium">{sectionName}</span>
                </div>
                <div className="flex items-center gap-2">
                  {customCount > 0 && (
                    <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-[10px] rounded font-medium">
                      {customCount}
                    </span>
                  )}
                  <span className="text-slate-500 text-xs">
                    {visibleCount}/{totalCount}
                  </span>
                </div>
              </button>

              {/* Elements in section */}
              {isExpanded && (
                <div className="ml-2 pl-2 border-l border-slate-700/50 space-y-0.5">
                  {elements.map((el) => {
                    const isSelected = selectedElementId === el.id;
                    const pos = elementPositions[el.id];
                    const hasCustomPos = pos && (pos.top !== undefined || pos.left !== undefined);
                    const isVisible = pos?.visible !== false;

                    return (
                      <div
                        key={el.id}
                        className={`group flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-orange-500/20 border border-orange-500/50'
                            : 'hover:bg-slate-700/50 border border-transparent'
                        } ${!isVisible ? 'opacity-40' : ''}`}
                        onClick={() => onElementSelect(el.id)}
                      >
                        {/* Visibility toggle */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onElementVisibilityChange?.(el.id, !isVisible);
                          }}
                          className={`w-5 h-5 flex items-center justify-center text-xs rounded transition-colors ${
                            isVisible
                              ? 'text-green-400 hover:bg-slate-600'
                              : 'text-slate-500 hover:bg-slate-600'
                          }`}
                        >
                          {isVisible ? '👁' : '○'}
                        </button>

                        {/* Type icon */}
                        <span className={`text-xs w-5 text-center ${TYPE_COLORS[el.type] || 'text-slate-400'}`}>
                          {TYPE_ICONS[el.type] || '●'}
                        </span>

                        {/* Label */}
                        <div className="flex-1 min-w-0">
                          <div className={`text-xs truncate ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                            {el.label}
                          </div>
                        </div>

                        {/* Custom position indicator */}
                        {hasCustomPos && (
                          <span className="text-green-400 text-[10px]">✦</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-slate-700 flex-shrink-0">
        <button
          className="w-full px-3 py-2 text-xs text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors text-center"
        >
          Expand All
        </button>
      </div>
    </div>
  );
}
