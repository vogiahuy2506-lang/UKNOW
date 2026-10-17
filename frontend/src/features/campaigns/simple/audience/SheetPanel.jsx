import { useRef, useState } from 'react';
import campaignBuilderApiService from '../../services/campaignBuilderApi.service';
import { getServerMessage, unwrapResponseData } from '../simpleCampaign.helpers';

const INPUT_CLASS =
  'w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 hover:bg-white focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 dark:border-dk-border dark:bg-dk-inset dark:text-dk-text dark:placeholder:text-dk-muted dark:hover:bg-dk-surface dark:focus:bg-dk-inset';

/**
 * "Danh sách Google Sheet": dán link → "Kiểm tra". Chỉ khi kiểm tra thành công mới sang bước kế được
 * (`sheetCheckedUrl` phải bằng link đang nhập). Sheet nhiều tab thì cho chọn tab (đổi tab = kiểm tra lại).
 * Bộ biên dịch đọc người nhận ở cột tên `email` (kênh email) hoặc `phone` (Zalo) nên nhắc và cảnh báo nếu thiếu cột đó.
 *
 * @param {object} props
 * @param {'email'|'zalo'|'zalo_group'} props.channel
 * @param {object} props.audience
 * @param {(patch: object) => void} props.patchAudience
 * @param {(key: string, params?: object) => string} props.t
 */
export default function SheetPanel({ channel, audience, patchAudience, t }) {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // { columns, worksheetNames, url }
  // Lượt kiểm tra cũ về muộn (đã đổi link / đổi tab) không được ghi đè kết quả mới.
  const seqRef = useRef(0);

  const requiredColumn = channel === 'email' ? 'email' : 'phone';
  const url = audience.sheetUrl.trim();
  const isChecked = Boolean(url) && audience.sheetCheckedUrl === url;
  const visibleResult = result && result.url === url ? result : null;
  const columnMissing = visibleResult
    && !visibleResult.columns.some((column) => String(column).trim().toLowerCase() === requiredColumn);

  const runCheck = async (sheetName) => {
    if (!url) return;
    seqRef.current += 1;
    const seq = seqRef.current;
    setChecking(true);
    setError('');
    try {
      const response = await campaignBuilderApiService.checkGoogleSheet({ sheetUrl: url, sheetName: sheetName || '', headerRow: 1 });
      if (seq !== seqRef.current) return;
      const data = unwrapResponseData(response);
      setResult({
        url,
        columns: Array.isArray(data.columns) ? data.columns : [],
        worksheetNames: Array.isArray(data.worksheetNames) ? data.worksheetNames : [],
      });
      patchAudience({ sheetCheckedUrl: url, sheetName: sheetName || '' });
    } catch (err) {
      if (seq !== seqRef.current) return;
      setResult(null);
      patchAudience({ sheetCheckedUrl: '' });
      setError(getServerMessage(err, t('simpleCampaign.audience.sheet.failed')));
    } finally {
      if (seq === seqRef.current) setChecking(false);
    }
  };

  return (
    <div className="space-y-3">
      <label htmlFor="simple-sheet-url" className="block text-sm font-semibold text-slate-800 dark:text-dk-text">
        {t('simpleCampaign.audience.sheet.label')}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="simple-sheet-url"
          type="url"
          inputMode="url"
          value={audience.sheetUrl}
          onChange={(event) => {
            seqRef.current += 1;
            setChecking(false);
            setError('');
            patchAudience({ sheetUrl: event.target.value, sheetCheckedUrl: '', sheetName: '' });
          }}
          placeholder={t('simpleCampaign.audience.sheet.placeholder')}
          className={INPUT_CLASS}
        />
        <button
          type="button"
          onClick={() => runCheck(audience.sheetName)}
          disabled={!url || checking}
          className="inline-flex shrink-0 items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-dk-strong dark:hover:bg-dk-border-strong"
        >
          {checking ? t('simpleCampaign.audience.sheet.checking') : t('simpleCampaign.audience.sheet.check')}
        </button>
      </div>
      <p className="text-xs text-slate-500 dark:text-dk-text2">{t('simpleCampaign.audience.sheet.hintShare')}</p>
      <p className="text-xs text-slate-500 dark:text-dk-text2">{t('simpleCampaign.audience.sheet.hintColumn', { column: requiredColumn })}</p>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300" data-testid="simple-sheet-error">{error}</p>
      )}

      {isChecked && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-200" data-testid="simple-sheet-ok">
          <p className="font-semibold">{t('simpleCampaign.audience.sheet.ok')}</p>
          {visibleResult && visibleResult.columns.length > 0 && (
            <p className="mt-1 break-words text-xs">{t('simpleCampaign.audience.sheet.columns', { columns: visibleResult.columns.join(', ') })}</p>
          )}
          {visibleResult && visibleResult.worksheetNames.length > 1 && (
            <label className="mt-2 block text-xs font-semibold">
              {t('simpleCampaign.audience.sheet.tab')}
              <select
                value={audience.sheetName || visibleResult.worksheetNames[0]}
                onChange={(event) => runCheck(event.target.value)}
                className="mt-1 block w-full rounded-lg border border-emerald-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-emerald-800 dark:bg-dk-inset dark:text-dk-text"
              >
                {visibleResult.worksheetNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {columnMissing && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200" data-testid="simple-sheet-missing-column">
          {t('simpleCampaign.audience.sheet.missingColumn', { column: requiredColumn })}
        </p>
      )}
    </div>
  );
}
