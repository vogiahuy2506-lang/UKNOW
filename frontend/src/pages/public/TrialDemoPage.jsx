import { useState } from 'react';
import { Link } from 'react-router-dom';
import MockChatbot from './components/MockChatbot';
import { getConversation } from './components/mockConversations';
import HeroNavbar from './components/HeroNavbar';
import PublicFooter from './components/PublicFooter';
import { useI18n } from '../../i18n';
import {
  HiOutlineSparkles,
  HiOutlineMail,
  HiOutlineDocumentText,
  HiOutlineViewGrid,
  HiOutlineChevronRight,
  HiOutlineArrowLeft,
  HiOutlineShieldCheck,
  HiOutlineLightningBolt,
  HiOutlineStar,
  HiOutlineCheck,
} from 'react-icons/hi';

export default function TrialDemoPage() {
  const { t, locale } = useI18n();
  const chatbotLocale = locale === 'en' ? 'en' : 'vi';
  const [activeFlow, setActiveFlow] = useState('campaign');
  const [isStarted, setIsStarted] = useState(false);

  const FLOW_TABS = [
    {
      id: 'campaign',
      label: t('trialDemo.campaignTab'),
      icon: HiOutlineMail,
      color: 'from-blue-500 to-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      textColor: 'text-blue-600',
      description: t('trialDemo.campaignDesc'),
    },
    {
      id: 'template',
      label: t('trialDemo.templateTab'),
      icon: HiOutlineDocumentText,
      color: 'from-purple-500 to-purple-600',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
      textColor: 'text-purple-600',
      description: t('trialDemo.templateDesc'),
    },
    {
      id: 'landingPage',
      label: t('trialDemo.landingTab'),
      icon: HiOutlineViewGrid,
      color: 'from-orange-500 to-red-500',
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200',
      textColor: 'text-orange-600',
      description: t('trialDemo.landingDesc'),
    },
  ];

  const currentFlowConfig = FLOW_TABS.find((f) => f.id === activeFlow);

  const getFeaturesForFlow = (flowId) => {
    if (flowId === 'campaign') return [t('trialDemo.campaignF1'), t('trialDemo.campaignF2'), t('trialDemo.campaignF3')];
    if (flowId === 'template') return [t('trialDemo.templateF1'), t('trialDemo.templateF2'), t('trialDemo.templateF3')];
    if (flowId === 'landingPage') return [t('trialDemo.landingF1'), t('trialDemo.landingF2'), t('trialDemo.landingF3')];
    return [];
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Shared header */}
      <HeroNavbar />

      {/* Main content */}
      <main className="flex-1 max-w-6xl mx-auto px-4 py-8 w-full">
        {/* Hero section */}
        {!isStarted ? (
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-100 text-orange-700 rounded-full text-sm font-medium mb-6">
              <HiOutlineSparkles className="w-4 h-4" />
              {t('trialDemo.badge')}
            </div>

            <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              {t('trialDemo.titlePrefix')}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-red-500">
                {t('trialDemo.titleHighlight')}
              </span>
              {t('trialDemo.titleSuffix')}
            </h1>

            <p className="text-lg text-slate-600 max-w-2xl mx-auto mb-10">
              {t('trialDemo.subtitle')}
            </p>

            {/* Feature tabs */}
            <div className="grid md:grid-cols-3 gap-4 max-w-4xl mx-auto mb-12">
              {FLOW_TABS.map((flow) => (
                <button
                  key={flow.id}
                  onClick={() => {
                    setActiveFlow(flow.id);
                    setIsStarted(true);
                  }}
                  className={`relative p-6 rounded-2xl border-2 text-left transition-all hover:shadow-lg hover:-translate-y-1 bg-white ${
                    activeFlow === flow.id
                      ? `border-orange-300 shadow-md`
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${flow.color} flex items-center justify-center mb-4`}>
                    <flow.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-800 mb-2">{flow.label}</h3>
                  <p className="text-sm text-slate-500">{flow.description}</p>
                  <div className={`absolute top-4 right-4 w-6 h-6 rounded-full ${flow.bgColor} flex items-center justify-center ${flow.textColor}`}>
                    <HiOutlineChevronRight className="w-4 h-4" />
                  </div>
                </button>
              ))}
            </div>

            {/* Trust indicators */}
            <div className="flex flex-wrap justify-center gap-6 text-sm text-slate-500">
              <span className="flex items-center gap-2">
                <HiOutlineShieldCheck className="w-5 h-5 text-green-500" />
                {t('trialDemo.trustNoSignup')}
              </span>
              <span className="flex items-center gap-2">
                <HiOutlineLightningBolt className="w-5 h-5 text-yellow-500" />
                {t('trialDemo.trustInstant')}
              </span>
              <span className="flex items-center gap-2">
                <HiOutlineStar className="w-5 h-5 text-orange-500" />
                {t('trialDemo.trustFullFeature')}
              </span>
            </div>
          </div>
        ) : (
          /* Demo view */
          <div>
            {/* Back button and flow tabs */}
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={() => setIsStarted(false)}
                className="flex items-center gap-2 text-slate-600 hover:text-slate-800 transition-colors"
              >
                <HiOutlineArrowLeft className="w-4 h-4" />
                <span>{t('trialDemo.selectAnother')}</span>
              </button>

              <div className="flex gap-2">
                {FLOW_TABS.map((flow) => (
                  <button
                    key={flow.id}
                    onClick={() => {
                      setActiveFlow(flow.id);
                    }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      activeFlow === flow.id
                        ? `${flow.bgColor} ${flow.textColor} border border-current`
                        : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <flow.icon className="w-4 h-4 inline mr-1" />
                    {flow.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Chatbot demo */}
            <div className="grid lg:grid-cols-3 gap-6">
              {/* Chatbot */}
              <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden h-[600px]">
                <MockChatbot
                  flow={activeFlow}
                  initialMessage={getConversation(chatbotLocale, activeFlow)}
                  locale={chatbotLocale}
                />
              </div>

              {/* Sidebar info */}
              <div className="space-y-4">
                {/* Feature info card */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${currentFlowConfig.color} flex items-center justify-center mb-4`}>
                    <currentFlowConfig.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-800 mb-2">
                    {currentFlowConfig.label}
                  </h3>
                  <p className="text-sm text-slate-600 mb-4">
                    {currentFlowConfig.description}
                  </p>
                  <ul className="space-y-2 text-sm text-slate-600">
                    {getFeaturesForFlow(activeFlow).map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <HiOutlineCheck className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* CTA card */}
                <div className="bg-gradient-to-br from-orange-500 to-red-500 rounded-2xl p-6 text-white">
                  <h3 className="font-semibold mb-2">{t('trialDemo.ctaTitle')}</h3>
                  <p className="text-sm text-orange-100 mb-4">
                    {t('trialDemo.ctaSubtitle')}
                  </p>
                  <Link
                    to="/register"
                    className="block w-full py-3 bg-white text-orange-600 font-semibold rounded-lg text-center hover:bg-orange-50 transition-colors"
                  >
                    {t('trialDemo.ctaButton')}
                  </Link>
                </div>

                {/* Demo notice */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-sm text-amber-800">
                    <strong>{(locale === 'en' ? 'Note' : 'Lưu ý')}:</strong> {t('trialDemo.notice')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Shared footer */}
      <PublicFooter />
    </div>
  );
}
