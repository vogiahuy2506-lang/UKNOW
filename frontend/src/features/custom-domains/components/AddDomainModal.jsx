import { useState, useEffect } from 'react';
import {
  HiOutlineGlobeAlt, HiOutlineX, HiOutlineCheck,
  HiOutlineInformationCircle, HiOutlineDocumentText
} from 'react-icons/hi';
import { toast } from 'react-hot-toast';
import customDomainApi from '../../../services/customDomainApi';
import api from '../../../services/api';
import { useI18n } from '../../../i18n';

const AddDomainModal = ({ isOpen, onClose, onSuccess }) => {
  const { t } = useI18n();
  const [step, setStep] = useState('form');
  const [loading, setLoading] = useState(false);
  const [landingPages, setLandingPages] = useState([]);
  const [instructions, setInstructions] = useState(null);
  const [newDomain, setNewDomain] = useState(null);

  const [formData, setFormData] = useState({
    domain: '',
    landingPageId: '',
  });

  useEffect(() => {
    if (isOpen) {
      fetchLandingPages();
      setStep('form');
      setFormData({ domain: '', landingPageId: '' });
      setInstructions(null);
      setNewDomain(null);
    }
  }, [isOpen]);

  const fetchLandingPages = async () => {
    try {
      const res = await api.get('/admin/landing-pages', {
        params: { status: 'draft,published' }
      });
      setLandingPages(res.data?.data || []);
    } catch (error) {
      console.error('Failed to fetch landing pages:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.domain.trim()) {
      toast.error(t('addDomain.enterDomain'));
      return;
    }

    const domainRegex = /^(?!:\/\/)([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+\.[a-zA-Z]{2,}$/;
    if (!domainRegex.test(formData.domain.trim())) {
      toast.error(t('addDomain.invalidDomain'));
      return;
    }

    setLoading(true);
    try {
      const res = await customDomainApi.create({
        domain: formData.domain.trim(),
        landingPageId: formData.landingPageId || null,
      });

      if (res.success) {
        setNewDomain(res.data);
        setInstructions(res.data.dnsInstructions);
        setStep('instructions');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || t('addDomain.addDomainFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerificationComplete = async () => {
    setStep('success');
  };

  const handleDone = () => {
    onSuccess?.();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-pink-500 rounded-xl flex items-center justify-center">
              <HiOutlineGlobeAlt className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800">
                {step === 'form' && t('addDomain.addPrivateDomain')}
                {step === 'instructions' && t('addDomain.configureDNS')}
                {step === 'success' && t('addDomain.completed')}
              </h2>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
            <HiOutlineX className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Step 1: Form */}
          {step === 'form' && (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  {t('addDomain.domainNameRequired')}
                </label>
                <input
                  type="text"
                  value={formData.domain}
                  onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                  placeholder={t('addDomain.domainPlaceholder')}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/10"
                />
                <p className="text-xs text-slate-500 mt-2">
                  {t('addDomain.domainHint')}
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  {t('addDomain.landingPage')} <span className="text-slate-400 font-normal">{t('addDomain.landingPageOptional')}</span>
                </label>
                <select
                  value={formData.landingPageId}
                  onChange={(e) => setFormData({ ...formData, landingPageId: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/10"
                >
                  <option value="">{t('addDomain.selectLandingPage')}</option>
                  {landingPages.map((lp) => (
                    <option key={lp.id} value={lp.id}>
                      {lp.title || lp.slug} {lp.isPublished ? '' : '(Nháp)'}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-2">
                  {t('addDomain.landingPageHint')}
                </p>
              </div>

              <div className="bg-blue-50 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <HiOutlineInformationCircle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-700">
                    <p className="font-semibold mb-1">{t('addDomain.afterAddingDomain')}</p>
                    <ol className="list-decimal list-inside space-y-1 text-blue-600">
                      <li>{t('addDomain.addDnsRecords')}</li>
                      <li>{t('addDomain.addDnsToProvider')}</li>
                      <li>{t('addDomain.returnToVerify')}</li>
                    </ol>
                  </div>
                </div>
              </div>
            </form>
          )}

          {/* Step 2: DNS Instructions */}
          {step === 'instructions' && instructions && (
            <div className="space-y-5">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <HiOutlineInformationCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-700">
                    <p className="font-semibold mb-1">{t('addDomain.addDnsRecordsToProvider')}</p>
                    <p className="mt-2 text-amber-600">
                      {t('addDomain.afterAddingDns')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {instructions.records?.map((record, index) => (
                  <div key={index} className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        record.type === 'TXT' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                      }`}>
                        {record.type}
                      </span>
                      <span className="text-sm font-semibold text-slate-700">{record.name}</span>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <span className="text-xs text-slate-500">{t('addDomain.value')}</span>
                        <p className="text-sm font-mono bg-white px-3 py-2 rounded-lg border border-slate-200 mt-1 break-all">
                          {record.value}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500">{t('addDomain.ttl')}</span>
                        <p className="text-sm font-medium">{t('addDomain.ttlSeconds', { ttl: record.ttl })}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 text-sm text-slate-600">
                <HiOutlineDocumentText className="w-4 h-4" />
                <span>{t('addDomain.cnameForWww')} <code className="bg-slate-100 px-1.5 py-0.5 rounded">{instructions.cnameTarget}</code></span>
              </div>
            </div>
          )}

          {/* Step 3: Success */}
          {step === 'success' && (
            <div className="text-center py-8">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <HiOutlineCheck className="w-10 h-10 text-green-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">{t('addDomain.domainAdded')}</h3>
              <p className="text-slate-600 mb-6">
                {t('addDomain.domainAddedSuccess', { domain: newDomain?.domain })}
              </p>
              <div className="bg-slate-50 rounded-xl p-4 text-left">
                <p className="text-sm font-semibold text-slate-700 mb-2">{t('addDomain.nextSteps')}</p>
                <ol className="text-sm text-slate-600 space-y-1 list-decimal list-inside">
                  <li>{t('addDomain.addDnsRecordsStep')}</li>
                  <li>{t('addDomain.waitDnsPropagate')}</li>
                  <li>{t('addDomain.returnToVerifyDomain')}</li>
                </ol>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 p-5 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
          {step === 'form' && (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 text-slate-600 font-semibold rounded-xl hover:bg-slate-200 transition-colors"
              >
                {t('addDomain.cancel')}
              </button>
              <button
                type="submit"
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 py-3 bg-orange-500 text-white font-semibold rounded-xl hover:bg-orange-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  t('addDomain.continue')
                )}
              </button>
            </div>
          )}

          {step === 'instructions' && (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep('form')}
                className="flex-1 py-3 text-slate-600 font-semibold rounded-xl hover:bg-slate-200 transition-colors"
              >
                {t('addDomain.back')}
              </button>
              <button
                type="button"
                onClick={handleVerificationComplete}
                className="flex-1 py-3 bg-green-500 text-white font-semibold rounded-xl hover:bg-green-600 transition-colors flex items-center justify-center gap-2"
              >
                <HiOutlineCheck className="w-4 h-4" />
                {t('addDomain.dnsAdded')}
              </button>
            </div>
          )}

          {step === 'success' && (
            <button
              type="button"
              onClick={handleDone}
              className="w-full py-3 bg-orange-500 text-white font-semibold rounded-xl hover:bg-orange-600 transition-colors"
            >
              {t('addDomain.done')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AddDomainModal;
