/** Frontend master switch for VAT invoice UI — keep OFF until Mat Bao PR2 is live. */
export function isInvoiceVatUiEnabled() {
  const v = String(import.meta.env.VITE_INVOICE_VAT_ENABLED || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}
