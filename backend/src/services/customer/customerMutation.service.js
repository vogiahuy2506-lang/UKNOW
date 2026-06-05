import campaignCustomerRepository from '../../repositories/campaign/campaignCustomer.repository.js';
import customerMutationRepository from '../../repositories/customer/customerMutation.repository.js';
import customerHelperService from './customerHelper.service.js';

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

class CustomerMutationService {
  normalizeString(value) {
    const s = value === null || value === undefined ? '' : String(value).trim();
    return s.length ? s : null;
  }

  normalizeGender(value) {
    const raw = this.normalizeString(value);
    if (!raw) return null;
    const s = raw.toLowerCase();
    if (['male', 'm', 'nam', 'ong', 'ông', '1'].includes(s)) return 'male';
    if (['female', 'f', 'nu', 'nữ', 'ba', 'bà', '0'].includes(s)) return 'female';
    if (['other', 'khac', 'khác'].includes(s)) return 'other';
    return null;
  }

  parseJsonObject(value) {
    if (!value) return null;
    if (typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }
    return null;
  }

  normalizeCustomerSource(value) {
    return customerHelperService.normalizeCustomerSource(value);
  }

  validateCustomerSource(customerSource) {
    const normalizedCustomerSource = this.normalizeCustomerSource(customerSource);
    if (customerSource && !normalizedCustomerSource) {
      throw createServiceError(
        'Nguon khach hang khong hop le. Chi cho phep: founderai, uknow_campaign',
        400
      );
    }
    return normalizedCustomerSource;
  }

  async create({ userId, payload }) {
    const { email, phone, fullName, gender, customerSource, notes } = payload;
    const normalizedCustomerSource = this.validateCustomerSource(customerSource);

    const customer = await customerMutationRepository.createCustomer(userId, {
      email,
      phone,
      fullName,
      gender,
      customerSource: normalizedCustomerSource,
      notes,
    });

    return {
      id: customer.id,
      email: customer.email,
      phone: customer.phone,
      fullName: customer.full_name,
    };
  }

  async bulkUpsert({ userId, payload }) {
    const { items, campaignId } = payload || {};
    if (!Array.isArray(items) || items.length === 0) {
      throw createServiceError('Thiếu danh sách khách hàng', 400);
    }

    const campaignIdNum = parseInt(campaignId, 10);

    return customerMutationRepository.withTransaction(async (client) => {
      let inserted = 0;
      let updated = 0;
      let skipped = 0;
      let campaignLinked = 0;

      for (const raw of items) {
        const item = raw || {};
        const email = this.normalizeString(item.email);
        const phone = this.normalizeString(item.phone);
        const zaloId = this.normalizeString(item.zaloId || item.zalo_id);

        if (!email && !phone && !zaloId) {
          skipped += 1;
          continue;
        }

        const participationCampaignId = Number.isFinite(campaignIdNum) ? campaignIdNum : null;
        const customer = {
          email,
          phone,
          zaloId,
          zaloPhone: this.normalizeString(item.zaloPhone || item.zalo_phone),
          facebookId: this.normalizeString(item.facebookId || item.facebook_id),
          fullName: this.normalizeString(item.fullName || item.full_name),
          gender: this.normalizeGender(item.gender),
          customerSource:
            this.normalizeCustomerSource(item.customerSource || item.customer_source) ||
            (Number.isFinite(participationCampaignId) ? 'uknow_campaign' : null),
          sourceLandingPage: this.normalizeString(item.sourceLandingPage || item.source_landing_page),
          sourceFormId: this.normalizeString(item.sourceFormId || item.source_form_id),
          utmSource: this.normalizeString(item.utmSource || item.utm_source),
          utmMedium: this.normalizeString(item.utmMedium || item.utm_medium),
          utmCampaign: this.normalizeString(item.utmCampaign || item.utm_campaign),
          notes: this.normalizeString(item.notes),
          customFields: this.parseJsonObject(item.customFields || item.custom_fields),
        };

        const existingId = await customerMutationRepository.findExistingCustomerId(client, userId, {
          email,
          phone,
          zaloId,
        });

        if (existingId) {
          await customerMutationRepository.updateBulkCustomer(client, userId, existingId, customer);
          updated += 1;

          if (Number.isFinite(participationCampaignId)) {
            await campaignCustomerRepository.ensureCampaignParticipation(client, participationCampaignId, existingId);
            campaignLinked += 1;
          }
        } else {
          const insertedCustomerId = await customerMutationRepository.insertBulkCustomer(client, userId, customer);

          if (Number.isFinite(participationCampaignId) && Number.isFinite(parseInt(insertedCustomerId, 10))) {
            await campaignCustomerRepository.ensureCampaignParticipation(client, participationCampaignId, insertedCustomerId);
            campaignLinked += 1;
          }
          inserted += 1;
        }
      }

      return { inserted, updated, skipped, campaignLinked, total: items.length };
    });
  }

  async update({ userId, id, payload }) {
    const { email, phone, fullName, gender, customerSource, notes, customFields } = payload;
    const normalizedCustomerSource = this.validateCustomerSource(customerSource);

    const existing = await customerMutationRepository.findOwnedCustomer(id, userId);
    if (!existing) {
      throw createServiceError('Không tìm thấy khách hàng', 404);
    }

    const customer = await customerMutationRepository.updateCustomer(userId, id, {
      email,
      phone,
      fullName,
      gender,
      customerSource: normalizedCustomerSource,
      notes,
      customFields,
    });

    return {
      id: customer.id,
      email: customer.email,
      fullName: customer.full_name,
    };
  }

  async delete({ userId, id }) {
    const deleted = await customerMutationRepository.deleteCustomer(userId, id);
    if (!deleted) {
      throw createServiceError('Không tìm thấy khách hàng', 404);
    }
    return true;
  }
}

export default new CustomerMutationService();
