import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../../i18n';
import customerApiService from '../services/customerApi.service';
import {
  IMPORT_BATCH_SIZE,
  IMPORT_FIELDS,
  IMPORT_MAX_ERRORS_SHOWN,
  IMPORT_MAX_FILE_ROWS,
  IMPORT_PREVIEW_ROWS,
  buildImportRows,
  chunk,
  importInBatches,
  readSpreadsheetFile,
  toBulkItem,
} from '../utils/customerImport.helpers';
import BaseModal from './CustomerModalBase';

/**
 * Nhập khách từ CSV/Excel: chọn file → xem trước 20 dòng → nhập theo lô ≤ 2.000 → báo kết quả + lỗi theo dòng.
 *
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {() => void} props.onClose
 * @param {() => void} props.onImported gọi khi đã có khách được ghi (tải lại danh sách)
 */
export default function CustomerImportModal({ isOpen, onClose, onImported }) {
  const { t } = useI18n();
  const fileInputRef = useRef(null);
  const [step, setStep] = useState('select'); // select | preview | importing | result
  const [parsing, setParsing] = useState(false);
  const [problem, setProblem] = useState('');
  const [parsed, setParsed] = useState(null); // { fileName, columns, rows }
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (isOpen) return;
    setStep('select');
    setParsing(false);
    setProblem('');
    setParsed(null);
    setResult(null);
  }, [isOpen]);

  const sendable = useMemo(() => (parsed ? parsed.rows.filter((row) => !row.skipped) : []), [parsed]);
  const skippedCount = parsed ? parsed.rows.length - sendable.length : 0;

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setProblem('');
    setParsing(true);
    try {
      const { matrix, firstRowNumber } = await readSpreadsheetFile(file);
      const built = buildImportRows(matrix, firstRowNumber);
      if (!built.hasContactColumn) {
        setProblem(t('customers.importFlow.noContactColumn'));
      } else if (built.rows.length === 0) {
        setProblem(t('customers.importFlow.emptyFile'));
      } else if (built.rows.length > IMPORT_MAX_FILE_ROWS) {
        setProblem(t('customers.importFlow.fileTooManyRows', { total: built.rows.length, max: IMPORT_MAX_FILE_ROWS }));
      } else {
        setParsed({ fileName: file.name, columns: built.columns, rows: built.rows });
        setStep('preview');
      }
    } catch {
      setProblem(t('customers.importFlow.readFailed'));
    } finally {
      setParsing(false);
    }
  };

  const handleStart = async () => {
    setStep('importing');
    const outcome = await importInBatches({
      items: sendable.map(toBulkItem),
      rowNumbers: sendable.map((row) => row.rowNumber),
      bulkFn: (items) => customerApiService.bulkUpsertCustomers(items),
      onProgress: setProgress,
    });
    setResult(outcome);
    setStep('result');
    if (outcome.totals.inserted + outcome.totals.updated > 0) onImported?.();
  };

  const resetToSelect = () => {
    setParsed(null);
    setResult(null);
    setProblem('');
    setStep('select');
  };

  // Tên trường lạ (vd zaloPhone) không có bản dịch → t() trả lại khoá; khi đó hiện chính tên trường.
  const fieldLabel = (field) => {
    const key = `customers.importFlow.fields.${field}`;
    const label = t(key);
    return label && label !== key ? label : field;
  };

  const detectedColumns = parsed
    ? IMPORT_FIELDS.filter((field) => parsed.columns[field] !== undefined)
        .map(fieldLabel)
        .join(', ')
    : '';
  const previewRows = parsed ? parsed.rows.slice(0, IMPORT_PREVIEW_ROWS) : [];
  const batchCount = chunk(sendable, IMPORT_BATCH_SIZE).length;
  const busy = step === 'importing';

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={busy ? () => {} : onClose}
      title={t('customers.importFlow.title')}
      contentStyle={{ maxWidth: '900px', height: 'auto', maxHeight: '85vh' }}
    >
      <div className="p-6 space-y-4">
        {step === 'select' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-dk-text2">{t('customers.importFlow.dropHint')}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv"
              onChange={handleFile}
              className="hidden"
              data-testid="customer-import-file"
              aria-label={t('customers.importFlow.chooseFile')}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={parsing}
            >
              {parsing ? t('customers.importFlow.parsing') : t('customers.importFlow.chooseFile')}
            </button>
            {problem && <p role="alert" className="text-sm text-red-600">{problem}</p>}
          </div>
        )}

        {step === 'preview' && parsed && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-dk-text2">
              <span className="font-medium text-gray-900 dark:text-dk-text">{parsed.fileName}</span>
              {' · '}
              {t('customers.importFlow.detectedColumns', { columns: detectedColumns })}
            </p>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-dk-text2">
              {t('customers.importFlow.previewTitle', { shown: previewRows.length, total: parsed.rows.length })}
            </p>
            <div className="table-container border border-gray-200 dark:border-dk-border rounded-lg">
              <table className="table" data-testid="customer-import-preview">
                <thead>
                  <tr>
                    <th>{t('customers.importFlow.rowNumber')}</th>
                    {IMPORT_FIELDS.map((field) => (
                      <th key={field}>{fieldLabel(field)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr key={row.rowNumber} className={row.skipped ? 'opacity-60' : ''}>
                      <td>{row.rowNumber}</td>
                      {IMPORT_FIELDS.map((field) => (
                        <td key={field} className="max-w-[180px] truncate">{row.fields[field] || '--'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {skippedCount > 0 && (
              <p className="text-xs text-amber-700">
                {skippedCount} · {t('customers.importFlow.rowSkipped')}
              </p>
            )}
            <p className="text-xs text-gray-500 dark:text-dk-text2">
              {t('customers.importFlow.batchInfo', { batches: batchCount, size: IMPORT_BATCH_SIZE })}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn btn-secondary" onClick={resetToSelect}>
                {t('customers.importFlow.back')}
              </button>
              <button type="button" className="btn btn-primary" onClick={handleStart} disabled={sendable.length === 0}>
                {t('customers.importFlow.start', { count: sendable.length })}
              </button>
            </div>
          </div>
        )}

        {step === 'importing' && (
          <div className="flex flex-col items-center gap-3 py-10">
            <div className="spinner w-8 h-8" />
            <p className="text-sm text-gray-600 dark:text-dk-text2">
              {t('customers.importFlow.importing', progress)}
            </p>
          </div>
        )}

        {step === 'result' && result && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-900 dark:text-dk-text" data-testid="customer-import-summary">
              {t('customers.importFlow.summary', result.totals)}
            </p>
            {result.failedBatch && (
              <p role="alert" className="text-sm text-red-600">
                {t('customers.importFlow.batchFailed', {
                  batch: result.failedBatch.batch,
                  message: result.failedBatch.message,
                })}
              </p>
            )}
            {result.errors.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-dk-text2 mb-1">
                  {t('customers.importFlow.errorsTitle')}
                </p>
                <ul className="space-y-1 text-sm text-red-700" data-testid="customer-import-errors">
                  {result.errors.slice(0, IMPORT_MAX_ERRORS_SHOWN).map((error, index) => (
                    <li key={`${error.row}-${error.field}-${index}`}>
                      {t('customers.importFlow.errorLine', {
                        row: error.row,
                        field: fieldLabel(error.field),
                        message: error.message,
                      })}
                    </li>
                  ))}
                </ul>
                {result.errors.length > IMPORT_MAX_ERRORS_SHOWN && (
                  <p className="text-xs text-gray-500 mt-1">
                    {t('customers.importFlow.moreErrors', { count: result.errors.length - IMPORT_MAX_ERRORS_SHOWN })}
                  </p>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn btn-secondary" onClick={resetToSelect}>
                {t('customers.importFlow.back')}
              </button>
              <button type="button" className="btn btn-primary" onClick={onClose}>
                {t('customers.importFlow.done')}
              </button>
            </div>
          </div>
        )}
      </div>
    </BaseModal>
  );
}
