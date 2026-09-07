import { DEVICES, DEFAULT_VIEWPORT } from '../utils/deviceFrameConfig.js';

/**
 * Toggle 3 device: desktop / tablet / mobile.
 * Style tham chiếu từ ui.corr.sh ResponsivePreviewShell.
 */
export default function DeviceFrameToggle({ value, onChange }) {
  return (
    <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-lg">
      {Object.values(DEVICES).map((device) => {
        const Icon = device.icon;
        const active = value === device.key;
        return (
          <button
            key={device.key}
            type="button"
            onClick={() => onChange(device.key)}
            title={`${device.label} (${device.width}×${device.height})`}
            className={`p-2 rounded-md transition-colors flex items-center gap-1.5 ${
              active
                ? 'bg-white text-orange-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="text-[13px] font-semibold hidden sm:inline">{device.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export { DEVICES, DEFAULT_VIEWPORT };
