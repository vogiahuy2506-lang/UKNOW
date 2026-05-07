import { useState } from 'react';
import EmailTemplates from './EmailTemplates';

const TABS = [
  { key: 'email', label: 'Email' },
  { key: 'zalo',  label: 'Zalo' },
];

const ChannelTemplates = () => {
  const [active, setActive] = useState('email');

  return (
    <div className="space-y-6">
      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActive(key)}
            className={`px-5 py-1.5 rounded-md text-sm font-medium transition-colors ${
              active === key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <EmailTemplates key={active} isZaloTemplate={active === 'zalo'} />
    </div>
  );
};

export default ChannelTemplates;
