/**
 * Integration test cho AiCampaignRepository.getForms(ownerId) — PR-6c
 * (PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, "Bổ sung 15/09 khi soạn lệnh PR-6c" mục 1).
 *
 * Trợ lý AI chỉ được gợi ý formId từ danh sách này khi soạn node read_form_submissions —
 * nghiệm thu trực tiếp trên Postgres thật rằng danh sách CHỈ gồm form đã xuất bản, không bị
 * super admin tắt, đúng chủ workspace, kèm đúng consentEnabled + consentedCount (khớp điều
 * kiện lọc thật của node khi chạy — form.repository.js listConsentedSubmissionsForCampaign).
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import crypto from 'crypto';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';
import aiCampaignRepository from '../../src/repositories/ai/aiCampaign.repository.js';

beforeEach(async () => {
  await truncateAll();
});

async function insertForm(owner, {
  title = 'Form đăng ký tư vấn',
  isPublished = true,
  adminDisabled = false,
  settings = {},
} = {}) {
  const publicKey = crypto.randomBytes(12).toString('hex');
  const result = await db.query(
    `INSERT INTO forms (workspace_owner_id, public_key, title, fields, settings, is_published, admin_disabled_at)
     VALUES ($1, $2, $3, '[]'::jsonb, $4, $5, $6)
     RETURNING id`,
    [owner.id, publicKey, title, JSON.stringify(settings), isPublished, adminDisabled ? new Date() : null]
  );
  return Number(result.rows[0].id);
}

async function insertSubmission(formId, owner, { marketingConsent = null, status = 'submitted' } = {}) {
  const accessToken = crypto.randomBytes(16).toString('hex');
  await db.query(
    `INSERT INTO form_submissions (form_id, workspace_owner_id, access_token, answers, marketing_consent, status)
     VALUES ($1, $2, $3, '{}'::jsonb, $4, $5)`,
    [formId, owner.id, accessToken, marketingConsent, status]
  );
}

describe('AiCampaignRepository.getForms — PR-6c', () => {
  it('chỉ trả form đã xuất bản, không bị tắt, đúng chủ workspace; đếm đúng số bài đã đồng ý', async () => {
    const ownerA = await createUser({ username: 'owner_forms_a' });
    const ownerB = await createUser({ username: 'owner_forms_b' });

    const publishedForm = await insertForm(ownerA, {
      title: 'Tư vấn 1-1',
      isPublished: true,
      settings: { consentEnabled: true },
    });
    const draftForm = await insertForm(ownerA, { title: 'Bản nháp chưa xuất bản', isPublished: false });
    const disabledForm = await insertForm(ownerA, {
      title: 'Đã bị super admin tắt',
      isPublished: true,
      adminDisabled: true,
    });
    await insertForm(ownerB, { title: 'Form của chủ khác', isPublished: true });

    // publishedForm: 2 đồng ý còn hiệu lực (đếm), 1 đồng ý nhưng đã huỷ (không đếm),
    // 1 không đồng ý (không đếm), 1 chưa hỏi/null (không đếm).
    await insertSubmission(publishedForm, ownerA, { marketingConsent: true, status: 'submitted' });
    await insertSubmission(publishedForm, ownerA, { marketingConsent: true, status: 'confirmed' });
    await insertSubmission(publishedForm, ownerA, { marketingConsent: true, status: 'cancelled' });
    await insertSubmission(publishedForm, ownerA, { marketingConsent: false, status: 'submitted' });
    await insertSubmission(publishedForm, ownerA, { marketingConsent: null, status: 'submitted' });
    // Bài nộp của draftForm không được tính vào bất kỳ form nào khác — chỉ có publishedForm
    // và disabledForm được xét ở đây vì cả hai đã publish (draftForm bị loại từ vòng WHERE).

    const forms = await aiCampaignRepository.getForms(ownerA.id);

    expect(forms).toHaveLength(1);
    const [row] = forms;
    expect(Number(row.id)).toBe(publishedForm);
    expect(row.title).toBe('Tư vấn 1-1');
    expect(row.is_published).toBe(true);
    expect(row.consent_enabled).toBe(true);
    expect(Number(row.consented_count)).toBe(2);

    const formIds = forms.map((f) => Number(f.id));
    expect(formIds).not.toContain(draftForm);
    expect(formIds).not.toContain(disabledForm);
  });

  it('form không đặt consentEnabled trong settings → consent_enabled mặc định false', async () => {
    const owner = await createUser({ username: 'owner_forms_default' });
    await insertForm(owner, { title: 'Form không hỏi đồng ý', isPublished: true, settings: {} });

    const forms = await aiCampaignRepository.getForms(owner.id);
    expect(forms).toHaveLength(1);
    expect(forms[0].consent_enabled).toBe(false);
    expect(Number(forms[0].consented_count)).toBe(0);
  });

  it('không có form nào đã xuất bản → trả mảng rỗng', async () => {
    const owner = await createUser({ username: 'owner_forms_empty' });
    await insertForm(owner, { title: 'Chỉ có bản nháp', isPublished: false });

    const forms = await aiCampaignRepository.getForms(owner.id);
    expect(forms).toEqual([]);
  });
});

/**
 * Review 15/09 — getFormIdsOwnedBy CHỈ kiểm quyền sở hữu (workspace_owner_id), KHÔNG lọc
 * is_published/admin_disabled_at/LIMIT 20 như getForms — getForms cố ý hẹp để gợi ý trong
 * prompt; dùng nó để kiểm sở hữu ở sanitizeFormOwnership từng xoá nhầm formId hợp lệ của form
 * nháp hoặc form ngoài 20 form gần nhất của ĐÚNG chủ.
 */
describe('AiCampaignRepository.getFormIdsOwnedBy — PR-6c review 15/09', () => {
  it('form NHÁP (chưa xuất bản) của đúng chủ → vẫn trả về (không lọc is_published như getForms)', async () => {
    const owner = await createUser({ username: 'owner_ids_draft' });
    const draftForm = await insertForm(owner, { title: 'Nháp', isPublished: false });

    const ids = await aiCampaignRepository.getFormIdsOwnedBy(owner.id, [draftForm]);
    expect(ids).toEqual([draftForm]);
  });

  it('form đã bị super admin tắt của đúng chủ → vẫn trả về (không lọc admin_disabled_at như getForms)', async () => {
    const owner = await createUser({ username: 'owner_ids_disabled' });
    const disabledForm = await insertForm(owner, { title: 'Đã tắt', isPublished: true, adminDisabled: true });

    const ids = await aiCampaignRepository.getFormIdsOwnedBy(owner.id, [disabledForm]);
    expect(ids).toEqual([disabledForm]);
  });

  it('form của chủ workspace khác → bị loại dù id có trong danh sách hỏi', async () => {
    const ownerA = await createUser({ username: 'owner_ids_a' });
    const ownerB = await createUser({ username: 'owner_ids_b' });
    const formA = await insertForm(ownerA, { title: 'Của A' });
    const formB = await insertForm(ownerB, { title: 'Của B' });

    const ids = await aiCampaignRepository.getFormIdsOwnedBy(ownerA.id, [formA, formB]);
    expect(ids).toEqual([formA]);
  });

  it('id không tồn tại lẫn trong danh sách hỏi → chỉ trả những id thật sự thuộc chủ', async () => {
    const owner = await createUser({ username: 'owner_ids_mixed' });
    const realForm = await insertForm(owner, { title: 'Thật' });

    const ids = await aiCampaignRepository.getFormIdsOwnedBy(owner.id, [realForm, 999999999]);
    expect(ids).toEqual([realForm]);
  });

  it('mảng formIds rỗng → trả mảng rỗng', async () => {
    const owner = await createUser({ username: 'owner_ids_empty' });
    const ids = await aiCampaignRepository.getFormIdsOwnedBy(owner.id, []);
    expect(ids).toEqual([]);
  });
});

async function insertLanding(owner, { slug, title = 'Landing', idUserOverride = undefined, workspaceOwnerIdOverride = undefined } = {}) {
  const idUser = idUserOverride !== undefined ? idUserOverride : owner.id;
  const workspaceOwnerId = workspaceOwnerIdOverride !== undefined ? workspaceOwnerIdOverride : owner.id;
  const result = await db.query(
    `INSERT INTO landing_pages (id_user, workspace_owner_id, slug, title, html_content, is_published)
     VALUES ($1, $2, $3, $4, '<p>x</p>', true)
     RETURNING id`,
    [idUser, workspaceOwnerId, slug, title]
  );
  return Number(result.rows[0].id);
}

async function attachFormToLanding(formId, landingId) {
  await db.query('UPDATE forms SET landing_page_id = $1 WHERE id = $2', [landingId, formId]);
}

/**
 * PR-5b-2b — kèm formId (landing đã gắn Biểu mẫu) + sửa lọc theo chủ workspace hiệu lực
 * (COALESCE(workspace_owner_id, id_user)), không còn lọc thẳng id_user.
 */
describe('AiCampaignRepository.getLandingPages — PR-5b-2b', () => {
  it('landing có form gắn (chưa bị tắt) → formId đúng; landing không có form gắn → formId null', async () => {
    const owner = await createUser({ username: 'lp_owner_forms' });
    const landingWithForm = await insertLanding(owner, { slug: 'khoa-hoc-ielts', title: 'Khoá IELTS' });
    const landingNoForm = await insertLanding(owner, { slug: 'landing-thuong', title: 'Landing thường' });
    const form = await insertForm(owner, { title: 'Form đăng ký' });
    await attachFormToLanding(form, landingWithForm);

    const rows = await aiCampaignRepository.getLandingPages(owner.id);
    const withFormRow = rows.find((r) => r.slug === 'khoa-hoc-ielts');
    const noFormRow = rows.find((r) => r.slug === 'landing-thuong');
    expect(Number(withFormRow.form_id)).toBe(form);
    expect(noFormRow.form_id).toBeNull();
  });

  it('form gắn landing nhưng đã bị super admin tắt → formId null (không gợi ý form đã tắt)', async () => {
    const owner = await createUser({ username: 'lp_owner_disabled' });
    const landing = await insertLanding(owner, { slug: 'landing-form-tat' });
    const form = await insertForm(owner, { title: 'Form đã tắt', adminDisabled: true });
    await attachFormToLanding(form, landing);

    const rows = await aiCampaignRepository.getLandingPages(owner.id);
    const row = rows.find((r) => r.slug === 'landing-form-tat');
    expect(row.form_id).toBeNull();
  });

  // Review "Neo PR-5b-2b" — trước đây lọc thẳng WHERE id_user = $1; landing có workspace_owner_id
  // KHÁC id_user (đổi chủ tay qua DB, hoặc dữ liệu cũ trước cột workspace_owner_id) phải lấy theo
  // workspace_owner_id (chủ hiệu lực), không phải id_user.
  it('landing có workspace_owner_id khác id_user (dữ liệu lệch) → lọc theo workspace_owner_id (chủ hiệu lực)', async () => {
    const realOwner = await createUser({ username: 'lp_owner_effective' });
    const staleIdUser = await createUser({ username: 'lp_owner_stale' });
    await insertLanding(realOwner, {
      slug: 'landing-lech-chu',
      idUserOverride: staleIdUser.id,
      workspaceOwnerIdOverride: realOwner.id,
    });

    const rowsForRealOwner = await aiCampaignRepository.getLandingPages(realOwner.id);
    expect(rowsForRealOwner.some((r) => r.slug === 'landing-lech-chu')).toBe(true);

    const rowsForStaleIdUser = await aiCampaignRepository.getLandingPages(staleIdUser.id);
    expect(rowsForStaleIdUser.some((r) => r.slug === 'landing-lech-chu')).toBe(false);
  });

  it('landing của chủ khác → không lộ trong danh sách', async () => {
    const ownerA = await createUser({ username: 'lp_owner_a2' });
    const ownerB = await createUser({ username: 'lp_owner_b2' });
    await insertLanding(ownerB, { slug: 'landing-cua-b' });

    const rows = await aiCampaignRepository.getLandingPages(ownerA.id);
    expect(rows.some((r) => r.slug === 'landing-cua-b')).toBe(false);
  });
});

describe('AiCampaignRepository.getFormIdForLandingSlug — PR-5b-2b', () => {
  it('landing có form gắn, đúng chủ → trả formId', async () => {
    const owner = await createUser({ username: 'slug_owner_1' });
    const landing = await insertLanding(owner, { slug: 'khoa-hoc-ielts' });
    const form = await insertForm(owner, { title: 'Form' });
    await attachFormToLanding(form, landing);

    const formId = await aiCampaignRepository.getFormIdForLandingSlug(owner.id, 'khoa-hoc-ielts');
    expect(formId).toBe(form);
  });

  it('landing không có form gắn → trả null', async () => {
    const owner = await createUser({ username: 'slug_owner_2' });
    await insertLanding(owner, { slug: 'khong-co-form' });

    const formId = await aiCampaignRepository.getFormIdForLandingSlug(owner.id, 'khong-co-form');
    expect(formId).toBeNull();
  });

  it('slug thuộc landing của chủ KHÁC → trả null (không lộ formId của người khác)', async () => {
    const ownerA = await createUser({ username: 'slug_owner_a' });
    const ownerB = await createUser({ username: 'slug_owner_b' });
    const landingB = await insertLanding(ownerB, { slug: 'landing-cua-b-2' });
    const formB = await insertForm(ownerB, { title: 'Form của B' });
    await attachFormToLanding(formB, landingB);

    const formId = await aiCampaignRepository.getFormIdForLandingSlug(ownerA.id, 'landing-cua-b-2');
    expect(formId).toBeNull();
  });

  it('form gắn landing đã bị super admin tắt → trả null', async () => {
    const owner = await createUser({ username: 'slug_owner_3' });
    const landing = await insertLanding(owner, { slug: 'landing-form-tat-2' });
    const form = await insertForm(owner, { title: 'Form đã tắt', adminDisabled: true });
    await attachFormToLanding(form, landing);

    const formId = await aiCampaignRepository.getFormIdForLandingSlug(owner.id, 'landing-form-tat-2');
    expect(formId).toBeNull();
  });

  it('slug không tồn tại → trả null', async () => {
    const owner = await createUser({ username: 'slug_owner_4' });
    const formId = await aiCampaignRepository.getFormIdForLandingSlug(owner.id, 'khong-ton-tai');
    expect(formId).toBeNull();
  });
});
