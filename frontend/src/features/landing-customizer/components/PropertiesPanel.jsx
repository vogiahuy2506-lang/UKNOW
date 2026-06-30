import IconPicker from './IconPicker';

const COLOR_PRESETS = [
  '#f97316', '#ef4444', '#3b82f6', '#22c55e', '#eab308', '#8b5cf6', '#ec4899', 
  '#000000', '#ffffff', '#64748b', '#1e293b', '#0f172a', '#f8fafc'
];

export default function PropertiesPanel({ element, value, onChange, onClose }) {
  if (!element) return null;

  const currentValue = value || { valueVi: '', valueEn: '' };

  const handleChange = (lang, newValue) => {
    onChange(element.id, lang, newValue);
  };

  const renderEditor = () => {
    switch (element.type) {
      case 'color':
        return (
          <div className="space-y-4">
            <ColorEditor 
              label="Tiếng Việt" 
              lang="vi"
              value={currentValue.valueVi || '#000000'}
              onChange={(val) => handleChange('vi', val)}
            />
            <ColorEditor 
              label="English" 
              lang="en"
              value={currentValue.valueEn || '#000000'}
              onChange={(val) => handleChange('en', val)}
            />
          </div>
        );

      case 'icon':
        return (
          <div className="space-y-4">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-blue-400 mb-2">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                Tiếng Việt
              </label>
              <input
                type="text"
                value={currentValue.valueVi || ''}
                onChange={(e) => handleChange('vi', e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="FaRocket"
              />
              <IconPicker 
                value={currentValue.valueVi || ''} 
                onChange={(val) => handleChange('vi', val)} 
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-green-400 mb-2">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                English
              </label>
              <input
                type="text"
                value={currentValue.valueEn || ''}
                onChange={(e) => handleChange('en', e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="FaRocket"
              />
              <IconPicker 
                value={currentValue.valueEn || ''} 
                onChange={(val) => handleChange('en', val)} 
              />
            </div>
          </div>
        );

      case 'image':
        return (
          <div className="space-y-4">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-blue-400 mb-2">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                Tiếng Việt - URL
              </label>
              {currentValue.valueVi && (
                <img 
                  src={currentValue.valueVi} 
                  alt="" 
                  className="w-full h-24 object-cover rounded-lg mb-2" 
                />
              )}
              <input
                type="text"
                value={currentValue.valueVi || ''}
                onChange={(e) => handleChange('vi', e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-green-400 mb-2">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                English - URL
              </label>
              {currentValue.valueEn && (
                <img 
                  src={currentValue.valueEn} 
                  alt="" 
                  className="w-full h-24 object-cover rounded-lg mb-2" 
                />
              )}
              <input
                type="text"
                value={currentValue.valueEn || ''}
                onChange={(e) => handleChange('en', e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="https://..."
              />
            </div>
          </div>
        );

      case 'textarea':
        return (
          <div className="space-y-4">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-blue-400 mb-2">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                Tiếng Việt
              </label>
              <textarea
                value={currentValue.valueVi || ''}
                onChange={(e) => handleChange('vi', e.target.value)}
                rows={4}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="Nhập nội dung..."
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-green-400 mb-2">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                English
              </label>
              <textarea
                value={currentValue.valueEn || ''}
                onChange={(e) => handleChange('en', e.target.value)}
                rows={4}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="Enter content..."
              />
            </div>
          </div>
        );

      default: // text
        return (
          <div className="space-y-4">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-blue-400 mb-2">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                Tiếng Việt
              </label>
              <input
                type="text"
                value={currentValue.valueVi || ''}
                onChange={(e) => handleChange('vi', e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="Nhập nội dung..."
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-green-400 mb-2">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                English
              </label>
              <input
                type="text"
                value={currentValue.valueEn || ''}
                onChange={(e) => handleChange('en', e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="Enter content..."
              />
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header - Fixed */}
      <div className="px-4 py-3 bg-slate-900 border-b border-slate-700 flex-shrink-0">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs text-orange-400 font-medium">{element.section}</div>
            <div className="text-white font-semibold">{element.label}</div>
            <div className="text-xs text-slate-400 mt-1">ID: {element.id}</div>
            <div className="mt-1">
              <span className={`inline-block px-2 py-0.5 text-[10px] rounded ${
                element.type === 'color' ? 'bg-purple-500/20 text-purple-400' :
                element.type === 'icon' ? 'bg-blue-500/20 text-blue-400' :
                element.type === 'image' ? 'bg-green-500/20 text-green-400' :
                element.type === 'textarea' ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-slate-500/20 text-slate-400'
              }`}>
                {element.type.toUpperCase()}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
          >
            ✕
          </button>
        </div>
      </div>
      
      {/* Editor - Scrollable */}
      <div className="flex-1 overflow-y-auto p-4">
        {renderEditor()}
      </div>
    </div>
  );
}

function ColorEditor({ label, lang, value, onChange }) {
  return (
    <div>
      <label className={`flex items-center gap-2 text-sm font-medium mb-2 ${
        lang === 'vi' ? 'text-blue-400' : 'text-green-400'
      }`}>
        <span className={`w-2 h-2 rounded-full ${lang === 'vi' ? 'bg-blue-500' : 'bg-green-500'}`} />
        {label}
      </label>
      <div className="flex gap-2 items-center">
        <input
          type="color"
          value={value || '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="w-12 h-10 rounded cursor-pointer border-0 bg-transparent"
        />
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500"
          placeholder="#000000"
        />
      </div>
      {/* Presets */}
      <div className="flex flex-wrap gap-1.5 mt-2">
        {COLOR_PRESETS.map((color) => (
          <button
            key={color}
            onClick={() => onChange(color)}
            className={`w-6 h-6 rounded border-2 transition-all ${
              value === color ? 'border-orange-500 scale-110' : 'border-transparent hover:scale-105'
            }`}
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
      </div>
    </div>
  );
}
