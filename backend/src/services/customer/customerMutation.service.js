import campaignCustomerRepository from '../../repositories/campaign/campaignCustomer.repository.js';
import customerMutationRepository from '../../repositories/customer/customerMutation.repository.js';
import customerReadRepository from '../../repositories/customer/customerRead.repository.js';
import customerHelperService from './customerHelper.service.js';
import {
  collectContactLookupKeys,
  createCustomerContactIndex,
  findExistingCustomerByContact,
} from '../../utils/customerContactMatch.util.js';
import { BULK_MAX_ITEMS, validateBulkItemFields } from '../../utils/customerBulkInput.util.js';

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

  async create({ workspaceOwnerId, actorUserId, payload }) {
    const { email, phone, fullName, gender, customerSource, consentSource, notes } = payload;
    const normalizedCustomerSource = this.validateCustomerSource(customerSource);

    const customer = await customerMutationRepository.createCustomer({ workspaceOwnerId, actorUserId }, {
      email,
      phone,
      fullName,
      gender,
      customerSource: normalizedCustomerSource,
      consentSource: consentSource || 'manual',
      notes,
    });

    return {
      id: customer.id,
      email: customer.email,
      phone: customer.phone,
      fullName: customer.full_name,
    };
  }

  /**
   * Nhập/cập nhật khách hàng loạt.
   *
   * - Trần {@link BULK_MAX_ITEMS} dòng; quá trần -> 400 (không xử lý một phần).
   * - Mỗi dòng được kiểm riêng: dòng sai bị bỏ qua và báo trong `errors` theo CHỈ SỐ (0-based) của mảng gửi lên,
   *   các dòng đúng vẫn được xử lý. Dòng không có email/SĐT/zaloId là `skipped` (không phải lỗi).
   * - Khớp khách đã có bằng quy tắc chung với node "lưu khách" (`customerContactMatch.util.js`), nạp MỘT lần
   *   cho cả lô thay vì một truy vấn mỗi dòng; dòng trùng NHAU trong cùng lô cũng gộp về một khách.
   *
   * @returns {Promise<{ inserted: number, updated: number, skipped: number, invalid: number,
   *   errors: Array<{ index: number, field: string, message: string }>, campaignLinked: number, total: number }>}
   */
  async bulkUpsert({ workspaceOwnerId, actorUserId, payload }) {
    const { items, campaignId } = payload || {};
    if (!Array.isArray(items) || items.length === 0) {
      throw createServiceError('Thiếu danh sách khách hàng', 400);
    }
    if (items.length > BULK_MAX_ITEMS) {
      throw createServiceError(`Mỗi lần chỉ nhập tối đa ${BULK_MAX_ITEMS} khách hàng`, 400);
    }

    const campaignIdNum = parseInt(campaignId, 10);

    // Chiến dịch phải thuộc đúng workspace — không cho ghi khách vào chiến dịch của tenant khác.
    if (Number.isFinite(campaignIdNum)) {
      const ownedCampaign = await customerReadRepository.getOwnedCampaign(campaignIdNum, workspaceOwnerId);
      if (!ownedCampaign) {
        throw createServiceError('Không tìm thấy chiến dịch', 404);
      }
    }
    const participationCampaignId = Number.isFinite(campaignIdNum) ? campaignIdNum : null;

    // Bước 1 (không DB): chuẩn hoá + kiểm từng dòng.
    let skipped = 0;
    const errors = [];
    const invalidIndexes = new Set();
    const candidates = [];
    items.forEach((raw, index) => {
      const item = raw || {};
      const fields = {
        email: this.normalizeString(item.email),
        phone: this.normalizeString(item.phone),
        zaloId: this.normalizeString(item.zaloId || item.zalo_id),
        zaloPhone: this.normalizeString(item.zaloPhone || item.zalo_phone),
        facebookId: this.normalizeString(item.facebookId || item.facebook_id),
        fullName: this.normalizeString(item.fullName || item.full_name),
        sourceLandingPage: this.normalizeString(item.sourceLandingPage || item.source_landing_page),
        sourceFormId: this.normalizeString(item.sourceFormId || item.source_form_id),
        utmSource: this.normalizeString(item.utmSource || item.utm_source),
        utmMedium: this.normalizeString(item.utmMedium || item.utm_medium),
        utmCampaign: this.normalizeString(item.utmCampaign || item.utm_campaign),
      };

      if (!fields.email && !fields.phone && !fields.zaloId) {
        skipped += 1;
        return;
      }

      const explicitConsentSource = item.consentSource ?? item.consent_source;
      const rowErrors = validateBulkItemFields(fields, explicitConsentSource);
      if (rowErrors.length > 0) {
        invalidIndexes.add(index);
        rowErrors.forEach((e) => errors.push({ index, field: e.field, message: e.message }));
        return;
      }

      const isLandingLead = Boolean(
        item.sourceLandingPage ||
        item.source_landing_page ||
        item.landingPageSlug ||
        item.landing_page_slug ||
        item.leadId ||
        item.lead_id
      );
      const explicitNormalized = this.normalizeString(explicitConsentSource);
      const resolvedConsentSource = explicitNormalized
        ? explicitNormalized.toLowerCase()
        : (isLandingLead ? 'landing_lead' : 'import');

      candidates.push({
        index,
        customer: {
          ...fields,
          gender: this.normalizeGender(item.gender),
          customerSource:
            this.normalizeCustomerSource(item.customerSource || item.customer_source) ||
            (participationCampaignId !== null ? 'uknow_campaign' : null),
          consentSource: resolvedConsentSource,
          notes: this.normalizeString(item.notes),
          customFields: this.parseJsonObject(item.customFields || item.custom_fields),
        },
      });
    });

    // Bước 2 (một transaction): nạp khách có thể trùng MỘT lần rồi khớp trong bộ nhớ.
    return customerMutationRepository.withTransaction(async (client) => {
      let inserted = 0;
      let updated = 0;
      let campaignLinked = 0;

      const lookupKeys = collectContactLookupKeys(
        candidates.map(({ customer }) => ({ email: customer.email, phone: customer.phone, zaloId: customer.zaloId }))
      );
      const preloaded = await customerMutationRepository.preloadCustomersByContact(client, workspaceOwnerId, lookupKeys);
      const contactIndex = createCustomerContactIndex();
      preloaded.forEach((row) => contactIndex.add(row));

      for (const { customer } of candidates) {
        const existingRow = findExistingCustomerByContact(contactIndex, customer);

        if (existingRow) {
          await customerMutationRepository.updateBulkCustomer(client, workspaceOwnerId, existingRow.id, customer);
          updated += 1;

          // Khoá tra cứu của dòng đổi theo COALESCE như câu UPDATE: gỡ khoá cũ, đổi, nạp lại.
          contactIndex.remove(existingRow);
          existingRow.email = customer.email ?? existingRow.email;
          existingRow.phone = customer.phone ?? existingRow.phone;
          existingRow.zalo_id = customer.zaloId ?? existingRow.zalo_id;
          contactIndex.add(existingRow);

          if (participationCampaignId !== null) {
            await campaignCustomerRepository.ensureCampaignParticipation(client, participationCampaignId, existingRow.id);
            campaignLinked += 1;
          }
        } else {
          const insertedCustomerId = await customerMutationRepository.insertBulkCustomer(
            client,
            { workspaceOwnerId, actorUserId },
            customer
          );

          if (Number.isFinite(parseInt(insertedCustomerId, 10))) {
            contactIndex.add({
              id: insertedCustomerId,
              email: customer.email,
              phone: customer.phone,
              zalo_id: customer.zaloId,
            });
            if (participationCampaignId !== null) {
              await campaignCustomerRepository.ensureCampaignParticipation(client, participationCampaignId, insertedCustomerId);
              campaignLinked += 1;
            }
          }
          inserted += 1;
        }
      }

      return {
        inserted,
        updated,
        skipped,
        invalid: invalidIndexes.size,
        errors,
        campaignLinked,
        total: items.length,
      };
    });
  }

  async update({ workspaceOwnerId, id, payload }) {
    const { email, phone, fullName, gender, customerSource, notes, customFields } = payload;
    const normalizedCustomerSource = this.validateCustomerSource(customerSource);

    const existing = await customerMutationRepository.findOwnedCustomer(id, workspaceOwnerId);
    if (!existing) {
      throw createServiceError('Không tìm thấy khách hàng', 404);
    }

    const customer = await customerMutationRepository.updateCustomer(workspaceOwnerId, id, {
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

  /**
   * Xoá khách. Khách đã có đơn mua/quan tâm (`customer_purchases`) thì CHẶN (409): xoá cứng sẽ kéo theo
   * lịch sử mua, hành trình và số liệu chiến dịch của khách đó mà không có đường quay lại.
   */
  async delete({ workspaceOwnerId, id }) {
    const existing = await customerMutationRepository.findOwnedCustomer(id, workspaceOwnerId);
    if (!existing) {
      throw createServiceError('Không tìm thấy khách hàng', 404);
    }

    const purchaseCount = await customerMutationRepository.countCustomerPurchases(id);
    if (purchaseCount > 0) {
      throw createServiceError(
        `Không thể xoá khách hàng đã có ${purchaseCount} đơn mua/quan tâm. Xoá sẽ làm mất lịch sử mua hàng và số liệu chiến dịch của khách này.`,
        409
      );
    }

    // Câu DELETE tự kiểm lại điều kiện chưa có đơn — đơn có thể phát sinh giữa hai bước trên.
    const deleted = await customerMutationRepository.deleteCustomer(workspaceOwnerId, id);
    if (!deleted) {
      throw createServiceError('Không thể xoá khách hàng vừa phát sinh đơn mua. Vui lòng tải lại.', 409);
    }
    return true;
  }
}

export default new CustomerMutationService();
