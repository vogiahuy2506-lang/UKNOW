import { useEffect, useState } from 'react';
import { HiOutlineDocumentText, HiOutlineTrash } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';
import api from '../../services/api';

export default function SavedInvoiceProfileSection() {
  const { t } = useI18n();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/users/invoice-profile');
        if (!cancelled) {
          setProfile(res?.data?.data || null);
        }
      } catch {
        if (!cancelled) setProfile(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDelete = async () => {
    const ok = window.confirm(t('invoiceVat.savedProfile.confirmDelete'));
    if (!ok) return;

    setDeleting(true);
    try {
      await api.delete('/users/invoice-profile');
      setProfile(null);
      toast.success(t('invoiceVat.savedProfile.deleteSuccess'));
    } catch {
      toast.error(t('invoiceVat.savedProfile.deleteFailed'));
    } finally {
      setDeleting(false);
    }
  };

  if (loading || !profile) return null;

  const isCompany = profile.buyerType === 'company';

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <HiOutlineDocumentText className="h-5 w-5 text-primary-600" />
            <h3 className="text-sm font-bold text-gray-900">
              {t('invoiceVat.savedProfile.title')}
            </h3>
          </div>
          <p className="text-xs text-gray-500">
            {t('invoiceVat.savedProfile.subtitle')}
          </p>

          <div className="mt-3 grid grid-cols-1 gap-1 text-xs text-gray-700 sm:grid-cols-2">
            {isCompany ? (
              <>
                <div>
                  <span className="text-gray-400 font-medium">Tên công ty: </span>
                  <span className="font-semibold">{profile.companyName}</span>
                </div>
                <div>
                  <span className="text-gray-400 font-medium">{t('invoiceVat.savedProfile.taxCodeLabel')}: </span>
                  <span className="font-mono font-semibold">{profile.taxCode}</span>
                </div>
                {profile.companyAddress && (
                  <div className="sm:col-span-2">
                    <span className="text-gray-400 font-medium">Địa chỉ: </span>
                    <span>{profile.companyAddress}</span>
                  </div>
                )}
              </>
            ) : (
              <>
                <div>
                  <span className="text-gray-400 font-medium">Họ và tên: </span>
                  <span className="font-semibold">{profile.fullName}</span>
                </div>
                <div>
                  <span className="text-gray-400 font-medium">{t('invoiceVat.savedProfile.idNumberLabel')}: </span>
                  <span className="font-mono font-semibold">{profile.idNumber}</span>
                </div>
                {profile.address && (
                  <div className="sm:col-span-2">
                    <span className="text-gray-400 font-medium">Địa chỉ: </span>
                    <span>{profile.address}</span>
                  </div>
                )}
              </>
            )}
            {profile.phone && (
              <div>
                <span className="text-gray-400 font-medium">SĐT: </span>
                <span>{profile.phone}</span>
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 transition-colors"
        >
          <HiOutlineTrash className="h-4 w-4" />
          {t('invoiceVat.savedProfile.delete')}
        </button>
      </div>
    </div>
  );
}
