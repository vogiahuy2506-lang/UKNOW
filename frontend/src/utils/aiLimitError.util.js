/**
 * Shared AI quota/limit error helpers for user-facing surfaces.
 */

export function isAiQuotaExceededError(errorOrData) {
  const data = errorOrData?.response?.data || errorOrData || {};
  return data.code === 'RESOURCE_LIMIT_EXCEEDED'
    && (data.resource === 'ai_credit' || data.resource === 'ai_token');
}

export function isAiCreditExceededError(errorOrData) {
  const data = errorOrData?.response?.data || errorOrData || {};
  return data.code === 'RESOURCE_LIMIT_EXCEEDED' && data.resource === 'ai_credit';
}

export function getAiQuotaErrorMessage(error, t) {
  const data = error?.response?.data || {};
  if (data.resource === 'ai_credit') {
    return t('aiChatbot.aiCreditExceeded');
  }
  if (data.resource === 'ai_token' || data.code === 'RESOURCE_LIMIT_EXCEEDED') {
    return t('aiChatbot.aiTokenExceeded');
  }
  return data.message || error?.message || t('aiChatbot.genericError');
}

export function shouldShowAiUpgradeCta(errorOrData) {
  const data = errorOrData?.response?.data || errorOrData || {};
  return Boolean(data.upgradeRequired) && isAiQuotaExceededError(data);
}
