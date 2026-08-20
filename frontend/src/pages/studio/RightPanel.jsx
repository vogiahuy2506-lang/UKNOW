import { useState } from 'react';
import { HiOutlineBookOpen, HiOutlineGlobeAlt } from 'react-icons/hi';
import KnowledgeTab from './KnowledgeTab';
import DeployTab from './DeployTab';

const TABS = [
  { id: 'knowledge', label: 'Kiến thức', icon: HiOutlineBookOpen },
  { id: 'deploy', label: 'Triển khai', icon: HiOutlineGlobeAlt },
];

export default function RightPanel({
  chatbot,
  onOpenWidgetSettings,
  defaultTab = 'knowledge',
  onTabChange,
}) {
  const [tab, setTab] = useState(defaultTab);

  const handleTabChange = (next) => {
    setTab(next);
    onTabChange?.(next);
  };

  // Guard: không render gì khi không có chatbot
  if (!chatbot) {
    return (
      <div className="h-full bg-white flex items-center justify-center">
        <p className="text-sm text-slate-400">Chọn chatbot để xem cấu hình</p>
      </div>
    );
  }

  return (
    <div className="h-full bg-white flex flex-col">
      {/* Tab switcher (segmented) */}
      <div className="px-5 pt-5 pb-4 shrink-0">
        <div className="inline-flex items-center gap-0.5 p-0.5 bg-slate-100/80 rounded-lg">
          {TABS.map(t => {
            const Icon = t.icon;
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => handleTabChange(t.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  isActive ? 'bg-white text-slate-900 shadow-sm shadow-slate-200/60' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'knowledge' && <KnowledgeTab chatbot={chatbot} />}
        {tab === 'deploy' && (
          <DeployTab
            chatbot={chatbot}
            onOpenWidgetSettings={onOpenWidgetSettings}
          />
        )}
      </div>
    </div>
  );
}
