import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import EmailTemplates from './EmailTemplates';
import { useI18n } from '../../i18n';

const TABS = [
  { key: 'email', label: 'channelTemplates.email' },
  { key: 'zalo', label: 'channelTemplates.zalo' },
];

const ChannelTemplates = () => {
  const { t } = useI18n();
  const [active, setActive] = useState('email');
  const location = useLocation();

  // Nếu chatbot AI truyền draft qua navigation state,
  // chuyển sang tab đúng kênh và truyền draft xuống EmailTemplates.
  const aiDraft = location.state?.aiDraft || null;

  useEffect(() => {
    if (aiDraft?.channel === 'zalo') {
      setActive('zalo');
    } else if (aiDraft?.channel === 'email') {
      setActive('email');
    }
  }, [aiDraft]);

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
            {t(label)}
          </button>
        ))}
      </div>

      <EmailTemplates
        key={active}
        isZaloTemplate={active === 'zalo'}
        aiDraft={active === (aiDraft?.channel || 'email') ? aiDraft : null}
      />
    </div>
  );
};

export default ChannelTemplates;
