import api from '../../../services/api';

async function messageFromErrorBlob(blob) {
  try {
    const text = await blob.text();
    const j = JSON.parse(text);
    return j?.message || text || 'Request failed';
  } catch {
    return 'Request failed';
  }
}

const checkoutApiService = {
  activateFreePlan(payload) {
    return api.post('/payments/activate-free', payload);
  },

  createPayment(payload) {
    return api.post('/payments/create-payment', payload);
  },

  createCustomPayment(payload) {
    return api.post('/payments/create-custom-payment', payload);
  },

  getScheduledChange() {
    return api.get('/payments/scheduled-change');
  },

  cancelScheduledChange(id = null) {
    return id ? api.delete(`/payments/scheduled-change/${id}`) : api.delete('/payments/scheduled-change');
  },

  resolvePlanChange(payload) {
    return api.post('/payments/resolve-change', payload);
  },

  async getPaymentStatus(orderCode) {
    const response = await api.get(`/payments/status/${orderCode}`);
    return response.data;
  },

  /**
   * Owner-scoped invoice metadata (emailStatus, canDownload, …).
   * @param {string|number} orderCode
   * @returns {Promise<object>} result DTO from GET /payments/invoice/:orderCode
   */
  async getInvoice(orderCode) {
    const response = await api.get(`/payments/invoice/${encodeURIComponent(orderCode)}`);
    const data = response.data;
    if (!data?.success) {
      const err = new Error(data?.message || 'Invoice not found');
      err.response = response;
      throw err;
    }
    return data.result;
  },

  /**
   * Download invoice PDF via authenticated blob endpoint; triggers browser save.
   * @param {string|number} orderCode
   * @returns {Promise<void>}
   */
  async downloadInvoicePdf(orderCode) {
    try {
      const response = await api.get(
        `/payments/invoice/${encodeURIComponent(orderCode)}/pdf`,
        {
          responseType: 'blob',
          timeout: 60000,
        },
      );

      const ct = String(response.headers['content-type'] || '');
      if (ct.includes('application/json')) {
        const msg = await messageFromErrorBlob(response.data);
        throw new Error(msg);
      }

      const blob =
        response.data instanceof Blob ? response.data : new Blob([response.data]);

      const dispo = response.headers['content-disposition'] || '';
      let filename = `hoa-don-${orderCode}.pdf`;
      const m = /filename="?([^";\n]+)"?/i.exec(dispo);
      if (m?.[1]) {
        filename = m[1].trim();
      }

      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      const data = e?.response?.data;
      if (data instanceof Blob) {
        const msg = await messageFromErrorBlob(data);
        throw new Error(msg);
      }
      throw e;
    }
  },
};

export default checkoutApiService;
