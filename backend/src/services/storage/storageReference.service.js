import db from '../../config/database.js';
import { collectStorageKeys, normalizeStorageKey } from '../../utils/storageKey.util.js';

const OPTIONAL_SCHEMA_ERRORS = new Set(['42P01', '42703']);
const MESSAGE_REFERENCE_TABLES = [
  'webchat_messages',
  'chatbot_messages',
  'chatbot_studio_messages',
  'channel_messages',
  'zalo_personal_messages',
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
  for (const table of MESSAGE_REFERENCE_TABLES) {
    try {
      const { rows } = await queryable.query(
        `SELECT 1
           FROM ${table}
          WHERE attachments::text LIKE $1
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

export default {
  buildStorageReferenceIndex,
  getIndexedStorageReferences,
  isStorageKeyReferencedByMessage,
  resolveWorkspaceOwner,
};
