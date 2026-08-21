/**
 * Employee Permission Catalog
 * Single source of truth for workspace employee permissions, groups, metadata and dependencies.
 */

export const PERMISSION_GROUPS = {
  CAMPAIGNS: 'campaigns',
  CHANNELS: 'channels',
  TEMPLATES: 'templates',
  CRM: 'crm',
  CONTENT: 'content',
  LANDING: 'landing',
  CHATBOTS: 'chatbots',
  INBOX: 'inbox',
  MEDIA: 'media',
};

export const PERMISSION_CATALOG = {
  campaigns_view: {
    key: 'campaigns_view',
    group: PERMISSION_GROUPS.CAMPAIGNS,
    labelKey: 'permissions.campaigns_view',
    descriptionKey: 'permissions.description.campaigns_view',
    dependencies: [],
    riskLevel: 'low',
    defaultForNewEmployee: false,
  },
  campaigns_create: {
    key: 'campaigns_create',
    group: PERMISSION_GROUPS.CAMPAIGNS,
    labelKey: 'permissions.campaigns_create',
    descriptionKey: 'permissions.description.campaigns_create',
    dependencies: ['campaigns_view'],
    riskLevel: 'medium',
    defaultForNewEmployee: false,
  },
  campaigns_run: {
    key: 'campaigns_run',
    group: PERMISSION_GROUPS.CAMPAIGNS,
    labelKey: 'permissions.campaigns_run',
    descriptionKey: 'permissions.description.campaigns_run',
    dependencies: ['campaigns_view'],
    riskLevel: 'high',
    defaultForNewEmployee: false,
  },
  email_settings: {
    key: 'email_settings',
    group: PERMISSION_GROUPS.CHANNELS,
    labelKey: 'permissions.email_settings',
    descriptionKey: 'permissions.description.email_settings',
    dependencies: [],
    riskLevel: 'medium',
    defaultForNewEmployee: false,
  },
  email_templates: {
    key: 'email_templates',
    group: PERMISSION_GROUPS.TEMPLATES,
    labelKey: 'permissions.email_templates',
    descriptionKey: 'permissions.description.email_templates',
    dependencies: [],
    riskLevel: 'low',
    defaultForNewEmployee: false,
  },
  zalo_settings: {
    key: 'zalo_settings',
    group: PERMISSION_GROUPS.CHANNELS,
    labelKey: 'permissions.zalo_settings',
    descriptionKey: 'permissions.description.zalo_settings',
    dependencies: [],
    riskLevel: 'medium',
    defaultForNewEmployee: false,
  },
  zalo_templates: {
    key: 'zalo_templates',
    group: PERMISSION_GROUPS.TEMPLATES,
    labelKey: 'permissions.zalo_templates',
    descriptionKey: 'permissions.description.zalo_templates',
    dependencies: [],
    riskLevel: 'low',
    defaultForNewEmployee: false,
  },
  courses: {
    key: 'courses',
    group: PERMISSION_GROUPS.CONTENT,
    labelKey: 'permissions.courses',
    descriptionKey: 'permissions.description.courses',
    dependencies: [],
    riskLevel: 'low',
    defaultForNewEmployee: false,
  },
  landing_pages: {
    key: 'landing_pages',
    group: PERMISSION_GROUPS.LANDING,
    labelKey: 'permissions.landing_pages',
    descriptionKey: 'permissions.description.landing_pages',
    dependencies: [],
    riskLevel: 'medium',
    defaultForNewEmployee: false,
  },
  customers: {
    key: 'customers',
    group: PERMISSION_GROUPS.CRM,
    labelKey: 'permissions.customers',
    descriptionKey: 'permissions.description.customers',
    dependencies: [],
    riskLevel: 'medium',
    defaultForNewEmployee: false,
  },
  leads: {
    key: 'leads',
    group: PERMISSION_GROUPS.CRM,
    labelKey: 'permissions.leads',
    descriptionKey: 'permissions.description.leads',
    dependencies: [],
    riskLevel: 'low',
    defaultForNewEmployee: false,
  },
  chatbots_manage: {
    key: 'chatbots_manage',
    group: PERMISSION_GROUPS.CHATBOTS,
    labelKey: 'permissions.chatbots_manage',
    descriptionKey: 'permissions.description.chatbots_manage',
    dependencies: [],
    riskLevel: 'medium',
    defaultForNewEmployee: false,
  },
  chatbot_channels_manage: {
    key: 'chatbot_channels_manage',
    group: PERMISSION_GROUPS.CHATBOTS,
    labelKey: 'permissions.chatbot_channels_manage',
    descriptionKey: 'permissions.description.chatbot_channels_manage',
    dependencies: ['chatbots_manage'],
    riskLevel: 'high',
    defaultForNewEmployee: false,
  },
  inbox_view: {
    key: 'inbox_view',
    group: PERMISSION_GROUPS.INBOX,
    labelKey: 'permissions.inbox_view',
    descriptionKey: 'permissions.description.inbox_view',
    dependencies: [],
    riskLevel: 'medium',
    defaultForNewEmployee: false,
  },
  inbox_reply: {
    key: 'inbox_reply',
    group: PERMISSION_GROUPS.INBOX,
    labelKey: 'permissions.inbox_reply',
    descriptionKey: 'permissions.description.inbox_reply',
    dependencies: ['inbox_view'],
    riskLevel: 'high',
    defaultForNewEmployee: false,
  },
  inbox_manage: {
    key: 'inbox_manage',
    group: PERMISSION_GROUPS.INBOX,
    labelKey: 'permissions.inbox_manage',
    descriptionKey: 'permissions.description.inbox_manage',
    dependencies: ['inbox_view'],
    riskLevel: 'high',
    defaultForNewEmployee: false,
  },
  media_library_view: {
    key: 'media_library_view',
    group: PERMISSION_GROUPS.MEDIA,
    labelKey: 'permissions.media_library_view',
    descriptionKey: 'permissions.description.media_library_view',
    dependencies: [],
    riskLevel: 'medium',
    defaultForNewEmployee: false,
  },
  media_library_manage: {
    key: 'media_library_manage',
    group: PERMISSION_GROUPS.MEDIA,
    labelKey: 'permissions.media_library_manage',
    descriptionKey: 'permissions.description.media_library_manage',
    dependencies: ['media_library_view'],
    riskLevel: 'high',
    defaultForNewEmployee: false,
  },
};

export const VALID_PERMISSION_KEYS = Object.freeze(Object.keys(PERMISSION_CATALOG));

/**
 * Sanitize and normalize permission object:
 * - Drops unknown keys
 * - Coerces values to strict boolean
 * - Auto-resolves dependencies (e.g. campaigns_create/run -> campaigns_view)
 *
 * @param {object|null|undefined} rawPermissions
 * @returns {Record<string, boolean>}
 */
export function normalizePermissions(rawPermissions = {}) {
  const permissions = rawPermissions || {};
  const sanitized = {};

  for (const key of VALID_PERMISSION_KEYS) {
    sanitized[key] = permissions[key] === true;
  }

  // Resolve dependencies defined in catalog
  for (const [key, meta] of Object.entries(PERMISSION_CATALOG)) {
    if (sanitized[key] === true && Array.isArray(meta.dependencies)) {
      for (const depKey of meta.dependencies) {
        if (VALID_PERMISSION_KEYS.includes(depKey)) {
          sanitized[depKey] = true;
        }
      }
    }
  }

  return sanitized;
}
