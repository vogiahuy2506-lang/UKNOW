import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import EmailTemplates from './EmailTemplates';
import { useI18n } from '../../i18n';

const ChannelTemplates = () => {
  const { t } = useI18n();
  const [active, setActive] = useState('email');
  const TABS = [
    { key: 'email', label: t('channelTemplates.email') },
    { key: 'zalo', label: t('channelTemplates.zalo') },
  ];
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
    <EmailTemplates
      key={active}
      isZaloTemplate={active === 'zalo'}
      aiDraft={active === (aiDraft?.channel || 'email') ? aiDraft : null}
      channelTabs={TABS}
      activeChannel={active}
      onChannelChange={setActive}
    />
  );
};

export default ChannelTemplates;
