import db from '../../config/database.js';
import { collectStorageKeys, normalizeStorageKey } from '../../utils/storageKey.util.js';

const OPTIONAL_SCHEMA_ERRORS = new Set(['42P01', '42703']);
const MESSAGE_REFERENCE_CONFIGS = [
  { table: 'webchat_messages', column: 'attachments' },
  { table: 'chatbot_messages', column: 'attachments' },
  { table: 'chatbot_studio_messages', column: 'attachments' },
  { table: 'channel_messages', column: 'attachments' },
  { table: 'zalo_personal_messages', column: 'attachments' },
  { table: 'ai_chat_messages', column: 'data' },
];

async function queryOptional(queryable, sql) {
  try {
    return (await queryable.query(sql)).rows;
  } catch (error) {
    if (OPTIONAL_SCHEMA_ERRORS.has(String(error?.code || ''))) return [];
    throw error;
  }
}

function addReference(index, rawValues, reference) {
  const keys = new Set();
  for (const value of rawValues) collectStorageKeys(value, keys);
  for (const storageKey of keys) {
    const list = index.get(storageKey) || [];
    const duplicate = list.some((item) => (
      item.referenceType === reference.referenceType
      && String(item.referenceId) === String(reference.referenceId)
    ));
    if (!duplicate) list.push(reference);
    index.set(storageKey, list);
  }
}

/**
 * Load durable parent references once per inventory/reconciliation run.
 * Optional legacy tables/columns are skipped, while connection/query errors abort the run.
 */
export async function buildStorageReferenceIndex(queryable = db) {
  const index = new Map();

  const chatRows = await queryOptional(queryable,
    `SELECT id, id_user, storage_key FROM chat_attachments`
  );
  for (const row of chatRows) {
    addReference(index, [row.storage_key], {
      poolType: 'workspace',
      ownerUserId: Number(row.id_user),
      ownerIsCanonical: true,
      category: 'chat',
      referenceType: 'chat_attachment',
      referenceId: row.id,
    });
  }

  const emailRows = await queryOptional(queryable,
    `SELECT id, id_user, attachments, body_html FROM email_templates`
  );
  for (const row of emailRows) {
    addReference(index, [row.attachments, row.body_html], {
      poolType: 'workspace',
      ownerUserId: Number(row.id_user),
      category: 'email_template',
      referenceType: 'email_template',
      referenceId: row.id,
    });
  }

  const templateFileRows = await queryOptional(queryable,
    `SELECT tf.storage_key, et.id, et.id_user
       FROM template_files tf
       JOIN email_templates et ON et.id = tf.template_id`
  );
  for (const row of templateFileRows) {
    addReference(index, [row.storage_key], {
      poolType: 'workspace',
      ownerUserId: Number(row.id_user),
      category: 'email_template',
      referenceType: 'email_template',
      referenceId: row.id,
    });
  }

  // Older installs used id_user directly and did not have template_id.
  const legacyTemplateFileRows = await queryOptional(queryable,
    `SELECT id, id_user, storage_key FROM template_files WHERE id_user IS NOT NULL`
  );
  for (const row of legacyTemplateFileRows) {
    addReference(index, [row.storage_key], {
      poolType: 'workspace',
      ownerUserId: Number(row.id_user),
      category: 'email_template',
      referenceType: 'template_file',
      referenceId: row.id,
    });
  }

  const zaloRows = await queryOptional(queryable,
    `SELECT id, id_user, attachments, body_html FROM zalo_templates`
  );
  for (const row of zaloRows) {
    addReference(index, [row.attachments, row.body_html], {
      poolType: 'workspace',
      ownerUserId: Number(row.id_user),
      category: 'zalo_template',
      referenceType: 'zalo_template',
      referenceId: row.id,
    });
  }

  const landingPageRows = await queryOptional(queryable,
    `SELECT id, id_user, html_content, custom_config FROM landing_pages`
  );
  for (const row of landingPageRows) {
    addReference(index, [row.html_content, row.custom_config], {
      poolType: 'workspace',
      ownerUserId: Number(row.id_user),
      category: 'landing',
      referenceType: 'landing_page',
      referenceId: row.id,
    });
  }

  const landingVersionRows = await queryOptional(queryable,
    `SELECT id, id_user, storage_key FROM landing_page_versions`
  );
  for (const row of landingVersionRows) {
    addReference(index, [row.storage_key], {
      poolType: 'workspace',
      ownerUserId: Number(row.id_user),
      category: 'landing_version',
      referenceType: 'landing_page_version',
      referenceId: row.id,
    });
  }

  const landingTemplateRows = await queryOptional(queryable,
    `SELECT id, user_id, thumbnail_url, html_structure, css_variables, default_config
       FROM landing_page_templates`
  );
  for (const row of landingTemplateRows) {
    const hasWorkspaceOwner = Number.isSafeInteger(Number(row.user_id)) && Number(row.user_id) > 0;
    addReference(index, [
      row.thumbnail_url,
      row.html_structure,
      row.css_variables,
      row.default_config,
    ], {
      poolType: hasWorkspaceOwner ? 'workspace' : 'system',
      ownerUserId: hasWorkspaceOwner ? Number(row.user_id) : null,
      category: 'landing',
      referenceType: 'landing_page_template',
      referenceId: row.id,
    });
  }

  const featuredRows = await queryOptional(queryable,
    `SELECT id, id_user, image_url FROM landing_featured_courses`
  );
  for (const row of featuredRows) {
    addReference(index, [row.image_url], {
      poolType: 'workspace',
      ownerUserId: Number(row.id_user),
      category: 'landing',
      referenceType: 'landing_featured_course',
      referenceId: row.id,
    });
  }

  const testimonialRows = await queryOptional(queryable,
    `SELECT id, id_user, image_url FROM landing_testimonials`
  );
  for (const row of testimonialRows) {
    addReference(index, [row.image_url], {
      poolType: 'workspace',
      ownerUserId: Number(row.id_user),
      category: 'landing',
      referenceType: 'landing_testimonial',
      referenceId: row.id,
    });
  }

  const helpRows = await queryOptional(queryable,
    `SELECT ha.id, ha.body_md, ha.body_html,
            COALESCE(jsonb_agg(ham.url) FILTER (WHERE ham.id IS NOT NULL), '[]'::jsonb) AS media_urls
       FROM help_articles ha
       LEFT JOIN help_article_media ham ON ham.article_id = ha.id
      GROUP BY ha.id, ha.body_md, ha.body_html`
  );
  for (const row of helpRows) {
    addReference(index, [row.body_md, row.body_html, row.media_urls], {
      poolType: 'system',
      ownerUserId: null,
      category: 'help',
      referenceType: 'help_article',
      referenceId: row.id,
    });
  }

  // These sections are global system content and have no workspace owner column.
  const sectionRows = await queryOptional(queryable,
    `SELECT id, html_content, css_content, config FROM landing_page_sections`
  );
  for (const row of sectionRows) {
    addReference(index, [row.html_content, row.css_content, row.config], {
      poolType: 'system',
      ownerUserId: null,
      category: 'landing',
      referenceType: 'landing_page_section',
      referenceId: row.id,
    });
  }

  const campaignRows = await queryOptional(queryable,
    `SELECT cn.id, c.id_user, cn.config
       FROM campaign_nodes cn
       JOIN campaigns c ON c.id = cn.id_campaign
      WHERE cn.config IS NOT NULL`
  );
  for (const row of campaignRows) {
    addReference(index, [row.config], {
      poolType: 'workspace',
      ownerUserId: Number(row.id_user),
      category: 'campaign',
      referenceType: 'campaign_node',
      referenceId: row.id,
    });
  }

  // These URL fields normally point to Cloudinary/external media, but they also
  // accept manually entered URLs. Retain any legacy local key found there.
  const businessProfileRows = await queryOptional(queryable,
    `SELECT id, user_id, logo_url FROM business_profiles WHERE logo_url IS NOT NULL`
  );
  for (const row of businessProfileRows) {
    addReference(index, [row.logo_url], {
      poolType: 'workspace',
      ownerUserId: Number(row.user_id),
      category: 'logo',
      referenceType: 'business_profile',
      referenceId: row.id,
    });
  }

  const subAssistantRows = await queryOptional(queryable,
    `SELECT id, id_user, avatar_url FROM sub_assistants WHERE avatar_url IS NOT NULL`
  );
  for (const row of subAssistantRows) {
    addReference(index, [row.avatar_url], {
      poolType: 'workspace',
      ownerUserId: Number(row.id_user),
      category: 'logo',
      referenceType: 'sub_assistant',
      referenceId: row.id,
    });
  }

  const customChatbotRows = await queryOptional(queryable,
    `SELECT id, id_user, avatar_url, logo_url FROM custom_chatbots`
  );
  for (const row of customChatbotRows) {
    addReference(index, [row.avatar_url, row.logo_url], {
      poolType: 'workspace',
      ownerUserId: Number(row.id_user),
      category: 'logo',
      referenceType: 'custom_chatbot',
      referenceId: row.id,
    });
  }

  const widgetRows = await queryOptional(queryable,
    `SELECT id, id_user, logo_url FROM web_widget_configs WHERE logo_url IS NOT NULL`
  );
  for (const row of widgetRows) {
    addReference(index, [row.logo_url], {
      poolType: 'workspace',
      ownerUserId: Number(row.id_user),
      category: 'logo',
      referenceType: 'web_widget_config',
      referenceId: row.id,
    });
  }

  const formReceiptRows = await queryOptional(queryable,
    `SELECT id, workspace_owner_id, payment_receipt_key FROM form_submissions WHERE payment_receipt_key IS NOT NULL`
  );
  for (const row of formReceiptRows) {
    addReference(index, [row.payment_receipt_key], {
      poolType: 'workspace',
      ownerUserId: Number(row.workspace_owner_id),
      category: 'form_receipt',
      referenceType: 'form_payment_receipt',
      referenceId: row.id,
    });
  }

  return index;
}

export function getIndexedStorageReferences(index, storageKey) {
  return index.get(normalizeStorageKey(storageKey)) || [];
}

/** Exact lookup for high-volume message tables that are intentionally not preloaded. */
export async function isStorageKeyReferencedByMessage(storageKey, queryable = db) {
  const key = normalizeStorageKey(storageKey);
  if (!key) return false;

  let queriedTables = 0;
  for (const { table, column } of MESSAGE_REFERENCE_CONFIGS) {
    try {
      const { rows } = await queryable.query(
        `SELECT 1
           FROM ${table}
          WHERE ${column}::text LIKE $1
          LIMIT 1`,
        [`%${key}%`]
      );
      queriedTables += 1;
      if (rows.length > 0) return true;
    } catch (error) {
      if (OPTIONAL_SCHEMA_ERRORS.has(String(error?.code || ''))) continue;
      throw error;
    }
  }

  if (queriedTables === 0) {
    const error = new Error('Không có bảng message reference nào khả dụng');
    error.code = 'STORAGE_REFERENCE_TABLES_UNAVAILABLE';
    throw error;
  }
  return false;
}

/** Resolve a legacy actor/parent id to the workspace billing owner. */
export async function resolveWorkspaceOwner(rawUserId, queryable = db) {
  const userId = Number(rawUserId);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return { ownerUserId: null, source: 'invalid', ambiguous: false };
  }

  const { rows } = await queryable.query(
    `SELECT u.id,
            COALESCE(array_agg(DISTINCT um.owner_id)
              FILTER (WHERE um.owner_id IS NOT NULL), '{}') AS owner_ids
       FROM users u
       LEFT JOIN user_members um
         ON um.employee_id = u.id AND um.status = 'active'
      WHERE u.id = $1
      GROUP BY u.id`,
    [userId]
  );
  if (!rows[0]) return { ownerUserId: null, source: 'missing', ambiguous: false };

  const ownerIds = (rows[0].owner_ids || []).map(Number).filter(Number.isSafeInteger);
  if (ownerIds.length > 1) return { ownerUserId: null, source: 'membership', ambiguous: true };
  if (ownerIds.length === 1) {
    return { ownerUserId: ownerIds[0], source: 'membership', ambiguous: false };
  }
  return { ownerUserId: userId, source: 'self', ambiguous: false };
}

// `url` là đường dẫn THẬT của frontend (App.jsx) cho nút "Đi đến màn hình quản lý" ở Thư viện media — trang dùng nguyên
// văn làm href. Trước 03/10 hầu hết thiếu tiền tố /app nên rơi vào route `*` và về trang chủ. Spec
// storageReferenceUrls.spec.js đối chiếu từng url với App.jsx.
export const REFERENCE_CONFIGS = {
  business_profile: {
    sql: `SELECT id, company_name AS name FROM business_profiles WHERE id = $1 LIMIT 1`,
    label: 'Hồ sơ doanh nghiệp',
    url: '/app/settings/ai-profile',
  },
  campaign_node: {
    sql: `SELECT cn.id, c.campaign_name AS name FROM campaign_nodes cn JOIN campaigns c ON c.id = cn.id_campaign WHERE cn.id = $1 LIMIT 1`,
    label: 'Chiến dịch',
    url: '/app/campaigns',
  },
  chat_attachment: {
    sql: `SELECT id, display_name AS name FROM chat_attachments WHERE id = $1 LIMIT 1`,
    label: 'Hộp thư chat',
    url: '/app/settings/inbox',
  },
  custom_chatbot: {
    sql: `SELECT id, name FROM custom_chatbots WHERE id = $1 LIMIT 1`,
    label: 'Chatbot',
    url: '/app/chatbot-studio',
  },
  email_template: {
    sql: `SELECT id, template_name AS name FROM email_templates WHERE id = $1 LIMIT 1`,
    label: 'Mẫu Email',
    url: '/app/settings/templates',
  },
  // Ảnh banner/logo của biểu mẫu (`activateFormAssetStorageObjects` ghi reference_type 'form', reference_id = id form).
  // Thiếu dòng này thì tệp rơi vào nhánh fail-safe "kiểu lạ" của isReferenceAlive và câu báo lộ mã thô `form #2`, không link.
  form: {
    sql: `SELECT id, title AS name FROM forms WHERE id = $1 LIMIT 1`,
    label: 'Biểu mẫu',
    url: '/app/forms',
  },
  form_payment_receipt: {
    sql: `SELECT fs.id, COALESCE(f.title, 'Biểu mẫu') AS name
            FROM form_submissions fs
            JOIN forms f ON f.id = fs.form_id
           WHERE fs.id = $1 LIMIT 1`,
    label: 'Biên lai chuyển khoản',
    url: '/app/forms',
  },
  help_article: {
    sql: `SELECT id, title AS name FROM help_articles WHERE id = $1 LIMIT 1`,
    label: 'Bài viết hướng dẫn',
    url: '/admin/help-articles',
  },
  landing: {
    sql: `SELECT id, title AS name FROM landing_pages WHERE id = $1 LIMIT 1`,
    label: 'Landing Page',
    url: '/app/settings/landing-pages',
  },
  landing_page: {
    sql: `SELECT id, title AS name FROM landing_pages WHERE id = $1 LIMIT 1`,
    label: 'Landing Page',
    url: '/app/settings/landing-pages',
  },
  landing_page_version: {
    sql: `SELECT id, title AS name FROM landing_page_versions WHERE id = $1 LIMIT 1`,
    label: 'Phiên bản Landing Page',
    url: '/app/settings/landing-pages',
  },
  landing_featured_course: {
    sql: `SELECT id, COALESCE(title_vi, title_en) AS name FROM landing_featured_courses WHERE id = $1 LIMIT 1`,
    label: 'Khóa học nổi bật',
    url: '/app/settings/landing-featured-courses',
  },
  landing_page_section: {
    sql: `SELECT id, section AS name FROM landing_page_sections WHERE id = $1 LIMIT 1`,
    label: 'Section Landing Page',
    url: '/app/settings/landing-pages',
  },
  landing_page_template: {
    sql: `SELECT id, name FROM landing_page_templates WHERE id = $1 LIMIT 1`,
    label: 'Mẫu Landing Page',
    url: '/app/settings/landing-pages',
  },
  landing_testimonial: {
    sql: `SELECT id, COALESCE(name_vi, name_en) AS name FROM landing_testimonials WHERE id = $1 LIMIT 1`,
    label: 'Đánh giá Landing Page',
    url: '/app/settings/landing-testimonials',
  },
  sub_assistant: {
    sql: `SELECT id, name FROM sub_assistants WHERE id = $1 LIMIT 1`,
    label: 'Trợ lý AI',
    url: '/app/settings/sub-assistants',
  },
  template_file: {
    sql: `SELECT id, original_name AS name FROM template_files WHERE id = $1 LIMIT 1`,
    label: 'Tệp đính kèm mẫu',
    url: '/app/settings/templates',
  },
  web_widget_config: {
    sql: `SELECT id, display_name AS name FROM web_widget_configs WHERE id = $1 LIMIT 1`,
    label: 'Cấu hình Livechat',
    url: '/app/settings/chatbot-widget',
  },
  zalo_template: {
    sql: `SELECT id, template_name AS name FROM zalo_templates WHERE id = $1 LIMIT 1`,
    label: 'Mẫu tin nhắn',
    url: '/app/settings/templates',
  },
};

/**
 * Check if a reference parent record is still alive in the database.
 * Does not scan tables; runs a single parameterized lookup.
 * Fail-safe: Any error or unknown type is treated as alive to prevent deleting active files.
 * @param {string} referenceType
 * @param {string|number} referenceId
 * @param {object} queryable
 * @returns {Promise<{ alive: boolean, label?: string, name?: string, url?: string }>}
 */
export async function isReferenceAlive(referenceType, referenceId, queryable = db) {
  if (!referenceType || referenceId == null) {
    return { alive: false };
  }

  const config = REFERENCE_CONFIGS[referenceType];
  if (!config) {
    // Fail-safe: if referenceType is unknown, treat as alive to prevent accidental data loss
    return {
      alive: true,
      label: referenceType,
      name: `${referenceType} #${referenceId}`,
      url: null,
    };
  }

  try {
    const { rows } = await queryable.query(config.sql, [referenceId]);
    if (rows.length > 0) {
      return {
        alive: true,
        label: config.label,
        name: rows[0].name || `${config.label} #${referenceId}`,
        url: config.url,
      };
    }
    return { alive: false };
  } catch (error) {
    // Fail-safe: if query fails (schema error, DB error, type mismatch 22P02, etc.),
    // treat as alive to avoid deleting active customer files.
    console.warn(`[StorageReference] isReferenceAlive query failed for ${referenceType}#${referenceId}:`, error?.message);
    return {
      alive: true,
      label: config.label,
      name: `${config.label} #${referenceId}`,
      url: config.url,
    };
  }
}

/**
 * Loại tham chiếu mà "bản ghi cha còn sống" KHÔNG có nghĩa là tệp đang được dùng ở đâu đó.
 * `chat_attachment`: bản ghi cha chính là dòng danh mục `chat_attachments` của CHÍNH tệp này (mỗi tệp chat có một dòng) —
 * nên nó luôn "sống" và trước đây chặn xoá vĩnh viễn bằng câu "đang được sử dụng bởi Hộp thư chat", trong khi Hộp thư
 * không có nút xoá tệp (production 04/10: 10 tệp / 28 MB kẹt vì thế). Tệp chat xoá được; xoá xong phải xoá luôn dòng
 * danh mục (mediaLibrary.repository.js `deleteChatCatalogRows`).
 */
const NON_BLOCKING_REFERENCE_TYPES = new Set(['chat_attachment']);
const FREE_USAGE = Object.freeze({ inUse: false });
const USAGE_LOOKUP_CHUNK = 8;

function isExpiredTempObject(object, now = new Date()) {
  return object.category === 'temp' && Boolean(object.expiresAt) && new Date(object.expiresAt) < now;
}

/**
 * Ảnh `landing_asset` được kích hoạt (reference_type 'landing_page') khi HTML trang có `/lp-assets/<khoá>`
 * (`landingAsset.service.js` `linkAssetsToLandingPage`) — khoá nằm TRẦN trong html_content nên tìm được bằng
 * position(). Chỉ kiểu này được kiểm "khoá còn nằm trong trang không": các tệp landing khác (category 'landing')
 * có thể nhúng bằng link ký `/file/<token>` mà khoá không hiện nguyên văn, nên vẫn chặn theo "trang còn sống".
 */
function needsLandingContentCheck(object) {
  return object.category === 'landing_asset' && object.referenceType === 'landing_page' && Boolean(object.storageKey);
}

/** Trang landing của workspace mà html_content/custom_config còn chứa từng khoá. Trang đầu tiên (id nhỏ nhất) thắng. */
async function findLandingPagesUsingKeys(ownerUserId, storageKeys, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT k.sk AS storage_key, lp.id, lp.title
       FROM unnest($2::text[]) AS k(sk)
       JOIN landing_pages lp
         ON COALESCE(lp.workspace_owner_id, lp.id_user) = $1
        AND (position(k.sk IN COALESCE(lp.html_content, '')) > 0
             OR position(k.sk IN COALESCE(lp.custom_config::text, '')) > 0)
      ORDER BY lp.id`,
    [ownerUserId, storageKeys]
  );
  const byKey = new Map();
  for (const row of rows) {
    if (!byKey.has(row.storage_key)) byKey.set(row.storage_key, { id: row.id, name: row.title || null });
  }
  return byKey;
}

/**
 * Một quyết định DUY NHẤT "tệp này có đang được dùng không" cho cả hai nơi: nút Xoá (chặn 409) và danh sách (hiện
 * "Đang dùng ở …", khoá nút xoá) — để màn hình không bao giờ nói một đằng rồi chặn một nẻo.
 *
 * Quy tắc, theo thứ tự:
 *  1. Không có tham chiếu (reference_type/reference_id trống), hoặc tệp tạm đã quá hạn → không dùng.
 *  2. `chat_attachment` → không dùng (xem NON_BLOCKING_REFERENCE_TYPES).
 *  3. Ảnh landing_asset gắn với một landing page → chỉ "đang dùng" khi khoá còn nằm trong html_content/custom_config của
 *     MỘT landing page nào của workspace (ảnh bị thay/gỡ khỏi trang thì xoá tay được). Trang trả về là trang thật sự chứa
 *     khoá — không nhất thiết là trang trong reference_id (ảnh có thể được dùng lại ở trang khác).
 *  4. Còn lại → bản ghi cha còn sống (`isReferenceAlive`) thì đang dùng. Mọi lỗi → coi là đang dùng (fail-safe, đừng xoá
 *     nhầm tệp khách đang dùng).
 *
 * @param {Array<{ id: string|number, category?: string, storageKey?: string|null, expiresAt?: Date|string|null,
 *   referenceType?: string|null, referenceId?: string|number|null }>} objects
 * @param {number|string} ownerUserId chủ workspace (phạm vi tìm landing page)
 * @returns {Promise<Map<string, { inUse: boolean, referenceType?: string, referenceId?: string, label?: string,
 *   name?: string, url?: string|null }>>} khoá là String(id)
 */
export async function resolveStorageObjectsUsage(objects, ownerUserId, queryable = db) {
  const usage = new Map();
  const needReference = [];
  for (const object of objects) {
    const hasReference = Boolean(object.referenceType) && object.referenceId != null && object.referenceId !== '';
    if (!hasReference || NON_BLOCKING_REFERENCE_TYPES.has(object.referenceType) || isExpiredTempObject(object)) {
      usage.set(String(object.id), FREE_USAGE);
    } else {
      needReference.push(object);
    }
  }

  const landingKeys = [...new Set(needReference.filter(needsLandingContentCheck).map((object) => object.storageKey))];
  let landingByKey = null;
  if (landingKeys.length > 0) {
    try {
      landingByKey = await findLandingPagesUsingKeys(ownerUserId, landingKeys, queryable);
    } catch (error) {
      // Không kiểm được nội dung trang → rơi về "bản ghi cha còn sống" (nhánh 4), không bao giờ coi là rảnh.
      console.warn('[StorageReference] landing content lookup failed:', error?.message);
    }
  }

  const parentLookups = new Map();
  for (const object of needReference) {
    if (landingByKey && needsLandingContentCheck(object)) continue;
    const key = `${object.referenceType}#${object.referenceId}`;
    if (!parentLookups.has(key)) parentLookups.set(key, { referenceType: object.referenceType, referenceId: object.referenceId });
  }
  const parentResults = new Map();
  const lookups = [...parentLookups.entries()];
  for (let i = 0; i < lookups.length; i += USAGE_LOOKUP_CHUNK) {
    await Promise.all(lookups.slice(i, i + USAGE_LOOKUP_CHUNK).map(async ([key, { referenceType, referenceId }]) => {
      parentResults.set(key, await isReferenceAlive(referenceType, referenceId, queryable));
    }));
  }

  for (const object of needReference) {
    const id = String(object.id);
    if (landingByKey && needsLandingContentCheck(object)) {
      const page = landingByKey.get(object.storageKey);
      const config = REFERENCE_CONFIGS.landing_page;
      usage.set(id, page
        ? {
          inUse: true,
          referenceType: 'landing_page',
          referenceId: String(page.id),
          label: config.label,
          name: page.name || `${config.label} #${page.id}`,
          url: config.url,
        }
        : FREE_USAGE);
      continue;
    }
    const alive = parentResults.get(`${object.referenceType}#${object.referenceId}`);
    usage.set(id, alive?.alive
      ? {
        inUse: true,
        referenceType: object.referenceType,
        referenceId: String(object.referenceId),
        label: alive.label,
        name: alive.name,
        url: alive.url ?? null,
      }
      : FREE_USAGE);
  }
  return usage;
}

export default {
  buildStorageReferenceIndex,
  getIndexedStorageReferences,
  isReferenceAlive,
  resolveStorageObjectsUsage,
  isStorageKeyReferencedByMessage,
  resolveWorkspaceOwner,
};
