import { DEVICES, DEFAULT_VIEWPORT } from '../utils/deviceFrameConfig.js';

/**
 * Toggle 3 device: desktop / tablet / mobile.
 * Style compact, fit trên toolbar ngang.
 */
export default function DeviceFrameToggle({ value, onChange }) {
  return (
    <div className="flex items-center gap-0.5 p-1 bg-gray-100/90 rounded-xl">
      {Object.values(DEVICES).map((device) => {
        const Icon = device.icon;
        const active = value === device.key;
        return (
          <button
            key={device.key}
            type="button"
            onClick={() => onChange(device.key)}
            title={`${device.label} (${device.width}×${device.height})`}
            className={`px-2 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
              active
                ? 'bg-white text-orange-600 shadow-xs ring-1 ring-orange-500/20'
                : 'text-gray-500 hover:text-gray-900 hover:bg-white/60'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="text-xs font-semibold hidden xl:inline">{device.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export { DEVICES, DEFAULT_VIEWPORT };
