import { useI18n } from '../../../i18n';

const PAGES = [
  { id: 'hero', label: 'HeroPage', icon: '🎬' },
  { id: 'contact', label: 'ContactPage', icon: '📧' },
  { id: 'pricing', label: 'PricingPage', icon: '💰' },
];

export default function PageSelector({ selectedPage, onPageChange }) {
  useI18n();

  return (
    <div className="flex items-center gap-2 mb-6">
      {PAGES.map((page) => (
        <button
          key={page.id}
          onClick={() => onPageChange(page.id)}
          className={`
            flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all
            ${selectedPage === page.id
              ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg shadow-orange-500/30'
              : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
            }
          `}
        >
          <span>{page.icon}</span>
          <span>{page.label}</span>
        </button>
      ))}
    </div>
  );
}
