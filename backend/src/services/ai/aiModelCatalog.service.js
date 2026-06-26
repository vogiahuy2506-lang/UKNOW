import {
  listAiModels,
  markGoogleModelsMissing,
  updateAiModel,
  upsertGoogleModel,
} from '../../repositories/ai/aiModelCatalog.repository.js';
import { DEFAULT_AI_MODEL, normalizeModelId } from '../../utils/aiModelTier.util.js';

const CACHE_TTL_MS = 10 * 60 * 1000;
let catalogCache = null;

function nowMs() {
  return Date.now();
}

function normalizeGoogleModelName(name) {
  return String(name || '').trim().replace(/^models\//, '').toLowerCase();
}

function displayNameFor(modelId, displayName) {
  const clean = String(displayName || '').trim();
  if (clean) return clean;
  return String(modelId || '')
    .split('-')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
  return Boolean(value);
}

function fallbackCatalog() {
  return [
    {
      modelId: DEFAULT_AI_MODEL,
      displayName: 'Gemini 2.5 Flash',
      tierRank: 20,
      isEnabled: true,
      supportsGenerateContent: true,
      source: 'manual',
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
  if (patch.tierRank !== undefined) {
    const rank = Number.parseInt(String(patch.tierRank), 10);
    if (!Number.isFinite(rank)) {
      const err = new Error('tier_rank không hợp lệ');
      err.status = 400;
      throw err;
    }
    normalizedPatch.tierRank = rank;
  }
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
      const modelId = normalizeGoogleModelName(model.name);
      if (!modelId) continue;
      const supportedMethods = Array.isArray(model.supportedGenerationMethods)
        ? model.supportedGenerationMethods
        : [];
      const supportsGenerateContent = supportedMethods.includes('generateContent');
      if (!supportsGenerateContent) {
        skippedUnsupported++;
        continue;
      }
      generateContentCount++;
      seenModelIds.push(modelId);
      await upsertGoogleModel({
        modelId,
        displayName: displayNameFor(modelId, model.displayName),
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
    markedUnsupported,
  };
}
