import { FaDesktop, FaTablet, FaMobile, FaSync } from 'react-icons/fa';

const DEVICES = [
  { id: 'desktop', label: 'Desktop', icon: FaDesktop },
  { id: 'tablet', label: 'Tablet', icon: FaTablet },
  { id: 'mobile', label: 'Mobile', icon: FaMobile },
];

export default function PreviewToolbar({ device, onDeviceChange, onRefresh, isLoading }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-slate-600">Preview:</span>
        <div className="flex bg-white rounded-lg p-1 border border-slate-200">
          {DEVICES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onDeviceChange(id)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors flex items-center gap-1.5 ${
                device === id
                  ? 'bg-orange-500 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
              title={label}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={onRefresh}
        disabled={isLoading}
        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
      >
        <FaSync className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        Làm mới
      </button>
    </div>
  );
}
