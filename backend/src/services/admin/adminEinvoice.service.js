import * as adminEinvoiceRepo from '../../repositories/admin/adminEinvoice.repository.js';
import {
  dispatchPreparedEinvoice,
  sendInvoicePdfForEinvoice,
} from '../payment/matbaoInvoice.service.js';
import { isMatbaoEinvoiceWorkerEnabled } from '../../utils/invoiceVat.util.js';
import { isMatbaoConfigured } from '../../utils/matbaoHddtClient.util.js';

export async function listEinvoices(filters) {
  const { rows, total } = await adminEinvoiceRepo.findEinvoices(filters);
  return {
    einvoices: rows,
    total,
    page: Number(filters?.page) || 1,
    limit: Number(filters?.limit) || 20,
  };
}

export async function retryEinvoice(id) {
  if (!isMatbaoEinvoiceWorkerEnabled() || !isMatbaoConfigured()) {
    return { skipped: true, reason: 'worker_disabled' };
  }

  const existing = await adminEinvoiceRepo.findEinvoiceById(id);
  if (!existing) {
    throw { status: 404, message: 'Không tìm thấy hoá đơn' };
  }

  if (['issued', 'cqt_ok'].includes(existing.status)) {
    return { skipped: true, reason: 'already_issued', status: existing.status };
  }

  const resetRow = await adminEinvoiceRepo.resetEinvoiceForAdminRetry(id);
  if (!resetRow) {
    return { skipped: true, reason: 'not_claimable', status: existing.status };
  }

  const result = await dispatchPreparedEinvoice(id);
  return result;
}

export async function resendEinvoiceEmail(id) {
  if (!isMatbaoEinvoiceWorkerEnabled()) {
    return { skipped: true, reason: 'worker_disabled' };
  }

  const existing = await adminEinvoiceRepo.findEinvoiceById(id);
  if (!existing) {
    throw { status: 404, message: 'Không tìm thấy hoá đơn' };
  }

  if (!['issued', 'cqt_ok'].includes(existing.status)) {
    return { skipped: true, reason: 'not_issued', status: existing.status };
  }

  const resetRow = await adminEinvoiceRepo.resetEinvoiceEmailForAdminResend(id);
  if (!resetRow) {
    return { skipped: true, reason: 'not_claimable', status: existing.status };
  }

  const result = await sendInvoicePdfForEinvoice(id);
  return result;
}
