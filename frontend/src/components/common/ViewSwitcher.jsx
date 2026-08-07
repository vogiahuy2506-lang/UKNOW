import { useState } from 'react';
import { HiOutlineViewGrid, HiOutlineViewList, HiOutlineViewBoards } from 'react-icons/hi';

const VIEW_TYPES = {
  GRID: 'grid',
  LIST: 'list',
  BOARD: 'board',
};

/**
 * ViewSwitcher - Component for switching between different view types
 * Inspired by Notion's database view switching
 */
const ViewSwitcher = ({
  currentView,
  onViewChange,
  availableViews = ['grid', 'list'],
  size = 'md',
}) => {
  const views = availableViews.map(v => ({
    type: v,
    icon: v === 'grid' ? HiOutlineViewGrid : v === 'list' ? HiOutlineViewList : HiOutlineViewBoards,
    label: v === 'grid' ? 'Grid' : v === 'list' ? 'List' : 'Board',
  }));

  const sizeClasses = {
    sm: 'p-1',
    md: 'p-1.5',
    lg: 'p-2',
  };

  const iconSizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  return (
    <div className={`flex items-center bg-gray-100 rounded-lg ${sizeClasses[size]}`}>
      {views.map(({ type, icon: Icon, label }) => (
        <button
          key={type}
          onClick={() => onViewChange(type)}
          className={`p-1.5 rounded-md transition-all ${
            currentView === type
              ? 'bg-white shadow-sm text-gray-900'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          title={label}
        >
          <Icon className={iconSizeClasses[size]} />
        </button>
      ))}
    </div>
  );
};

export { VIEW_TYPES };
export default ViewSwitcher;
