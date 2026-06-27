import {
  listAiModels,
  markGoogleModelsMissing,
  updateAiModel,
  upsertGoogleModel,
} from '../../repositories/ai/aiModelCatalog.repository.js';
import { DEFAULT_AI_MODEL, normalizeModelId } from '../../utils/aiModelTier.util.js';
import {
  extractGoogleModelMetadata,
  isRelevantChatModel,
} from '../../utils/aiModelMetadata.util.js';

const CACHE_TTL_MS = 10 * 60 * 1000;
let catalogCache = null;

function nowMs() {
  return Date.now();
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
  return Boolean(value);
}

function fallbackCatalog() {
  const modelId = normalizeModelId(process.env.GEMINI_MODEL) || DEFAULT_AI_MODEL;
  return [
    {
      modelId,
      displayName: modelId,
      inputTokenLimit: null,
      outputTokenLimit: null,
      description: null,
      version: null,
      thinking: false,
      isEnabled: true,
      supportsGenerateContent: true,
      source: 'env',
    },
  ];
}

function cloneRows(rows = []) {
  return rows.map((row) => ({ ...row }));
}

export function invalidateCatalogCache() {
  catalogCache = null;
}

export async function getCatalog({ enabledOnly = false } = {}) {
  const cacheKey = enabledOnly ? 'enabled' : 'all';
  if (catalogCache?.expiresAt > nowMs() && catalogCache[cacheKey]) {
    return cloneRows(catalogCache[cacheKey]);
  }

  let allRows;
  try {
    allRows = await listAiModels({ generateContentOnly: false });
  } catch (err) {
    if (err?.code !== '42P01') throw err;
    allRows = fallbackCatalog();
  }

  if (!allRows.length) {
    allRows = fallbackCatalog();
  }

  const enabledRows = allRows.filter((row) => row.isEnabled && row.supportsGenerateContent);
  const cache = {
    expiresAt: nowMs() + CACHE_TTL_MS,
    all: cloneRows(allRows),
    enabled: cloneRows(enabledRows.length ? enabledRows : fallbackCatalog()),
  };
  catalogCache = cache;
  return cloneRows(cache[cacheKey]);
}

export async function getEnabledModelIds() {
  const rows = await getCatalog({ enabledOnly: true });
  return rows.map((row) => row.modelId).filter(Boolean);
}

export async function getDefaultModel() {
  const enabled = await getCatalog({ enabledOnly: true });
  return enabled[enabled.length - 1]?.modelId || DEFAULT_AI_MODEL;
}

export async function updateCatalogModel(modelId, patch = {}) {
  const id = normalizeModelId(modelId);
  if (!id) {
    const err = new Error('Model ID không hợp lệ');
    err.status = 400;
    throw err;
  }

  const normalizedPatch = {};
  if (patch.displayName !== undefined) normalizedPatch.displayName = String(patch.displayName || '').trim() || id;
  if (patch.isEnabled !== undefined) normalizedPatch.isEnabled = parseBoolean(patch.isEnabled);

  const row = await updateAiModel(id, normalizedPatch);
  if (!row) {
    const err = new Error('Không tìm thấy model AI');
    err.status = 404;
    throw err;
  }
  invalidateCatalogCache();
  return row;
}

export async function syncModelsFromGoogle() {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    const err = new Error('Thiếu GEMINI_API_KEY để đồng bộ model Google');
    err.status = 503;
    throw err;
  }

  const seenAt = new Date();
  const seenModelIds = [];
  let pageToken = '';
  let fetched = 0;
  let generateContentCount = 0;
  let skippedUnsupported = 0;
  let skippedIrrelevant = 0;

  do {
    const url = new URL('https://generativelanguage.googleapis.com/v1beta/models');
    url.searchParams.set('key', apiKey);
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const response = await fetch(url);
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const err = new Error(`Google ListModels failed (${response.status}): ${body || response.statusText}`);
      err.status = 502;
      throw err;
    }

    const data = await response.json();
    const models = Array.isArray(data.models) ? data.models : [];
    fetched += models.length;

    for (const model of models) {
      const meta = extractGoogleModelMetadata(model);
      if (!meta.modelId) continue;

      const supportedMethods = Array.isArray(model.supportedGenerationMethods)
        ? model.supportedGenerationMethods
        : [];
      const supportsGenerateContent = supportedMethods.includes('generateContent');
      if (!supportsGenerateContent) {
        skippedUnsupported++;
        continue;
      }

      if (!isRelevantChatModel(meta.modelId)) {
        skippedIrrelevant++;
        continue;
      }

      generateContentCount++;
      seenModelIds.push(meta.modelId);
      await upsertGoogleModel({
        ...meta,
        supportsGenerateContent: true,
        seenAt,
      });
    }

    pageToken = String(data.nextPageToken || '');
  } while (pageToken);

  const markedUnsupported = await markGoogleModelsMissing({ seenModelIds, seenAt });
  invalidateCatalogCache();

  return {
    fetched,
    seen: seenModelIds.length,
    generateContent: generateContentCount,
    skippedUnsupported,
    skippedIrrelevant,
    markedUnsupported,
  };
}
