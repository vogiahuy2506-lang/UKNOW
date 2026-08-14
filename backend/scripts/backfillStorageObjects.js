#!/usr/bin/env node
import path from 'path';
import { promises as fs } from 'fs';
import db from '../src/config/database.js';
import {
  buildStorageReferenceIndex,
  getIndexedStorageReferences,
  resolveWorkspaceOwner,
} from '../src/services/storage/storageReference.service.js';

const uploadsRoot = path.resolve(process.cwd(), 'uploads');
const tempRoot = path.resolve(process.cwd(), 'temp_uploads');
const apply = process.argv.includes('--apply');
const cutoffArg = process.argv.find((arg) => arg.startsWith('--cutoff='));
const cutoff = cutoffArg ? new Date(cutoffArg.slice('--cutoff='.length)) : new Date();

if (Number.isNaN(cutoff.getTime())) throw new Error('--cutoff phải là ISO timestamp hợp lệ');

async function walk(root, prefix = '') {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const found = [];
  for (const entry of entries) {
    const relative = path.posix.join(prefix, entry.name);
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) found.push(...await walk(full, relative));
    else if (entry.isFile()) found.push({ full, relative });
  }
  return found;
}

function selectReference(references) {
  if (!references.length) return null;
  const priorities = [
    'chat_attachment',
    'email_template',
    'template_file',
    'zalo_template',
    'landing_page',
    'landing_page_template',
    'landing_featured_course',
    'landing_testimonial',
    'help_article',
    'landing_page_section',
    'campaign_node',
    'business_profile',
    'sub_assistant',
    'custom_chatbot',
    'web_widget_config',
  ];
  return [...references].sort((a, b) => (
    (priorities.indexOf(a.referenceType) < 0 ? priorities.length : priorities.indexOf(a.referenceType))
    - (priorities.indexOf(b.referenceType) < 0 ? priorities.length : priorities.indexOf(b.referenceType))
  ))[0];
}

async function resolveReferenceOwner(reference, relativePath) {
  if (reference.poolType === 'system') {
    return { ownerUserId: null, source: 'system', ambiguous: false };
  }
  if (reference.ownerIsCanonical) {
    return { ownerUserId: Number(reference.ownerUserId), source: 'canonical_parent', ambiguous: false };
  }

  const fromParent = await resolveWorkspaceOwner(reference.ownerUserId);
  if (fromParent.ownerUserId) return fromParent;
  if (fromParent.ambiguous) return fromParent;

  // Path is only a final owner fallback after a real parent reference was found.
  const ownerMatch = relativePath.match(/^(\d+)\//);
  if (!ownerMatch) return fromParent;
  const fromPath = await resolveWorkspaceOwner(Number(ownerMatch[1]));
  if (fromPath.source !== 'self') {
    return { ownerUserId: null, source: 'unsafe_path_fallback', ambiguous: fromPath.ambiguous };
  }
  return { ...fromPath, source: 'verified_owner_path' };
}

async function main() {
  const [uploadFiles, tempFiles, referenceIndex] = await Promise.all([
    walk(uploadsRoot),
    walk(tempRoot),
    buildStorageReferenceIndex(),
  ]);
  const report = {
    cutoff: cutoff.toISOString(),
    mode: apply ? 'apply' : 'dry-run',
    candidates: 0,
    inserted: 0,
    existing: 0,
    skippedNewer: 0,
    verifiedPathFallback: 0,
    byReferenceType: {},
    unknown: [],
  };
  const uploadNames = new Set(uploadFiles.map((entry) => entry.relative));

  for (const entry of uploadFiles) {
    if (entry.relative.endsWith('.txt') && uploadNames.has(entry.relative.slice(0, -4))) continue;
    const stat = await fs.stat(entry.full);
    if (stat.mtime > cutoff) {
      report.skippedNewer += 1;
      continue;
    }

    const storageKey = `uploads/${entry.relative}`;
    const references = getIndexedStorageReferences(referenceIndex, storageKey);
    const reference = selectReference(references);
    if (!reference?.referenceType || reference.referenceId == null) {
      report.unknown.push({ key: storageKey, reason: 'db_parent_not_found' });
      continue;
    }

    const owner = await resolveReferenceOwner(reference, entry.relative);
    if (reference.poolType === 'workspace' && !owner.ownerUserId) {
      report.unknown.push({
        key: storageKey,
        reason: owner.ambiguous ? 'workspace_owner_ambiguous' : 'workspace_owner_not_provable',
        referenceType: reference.referenceType,
        referenceId: reference.referenceId,
      });
      continue;
    }

    let sizeBytes = stat.size;
    try {
      sizeBytes += (await fs.stat(`${entry.full}.txt`)).size;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    report.candidates += 1;
    report.byReferenceType[reference.referenceType] = (
      report.byReferenceType[reference.referenceType] || 0
    ) + 1;
    if (owner.source === 'verified_owner_path') report.verifiedPathFallback += 1;

    if (apply) {
      const result = await db.query(
        `INSERT INTO storage_objects
          (pool_type, owner_user_id, storage_key, category, state, size_bytes,
           reference_type, reference_id, created_at)
         VALUES ($1,$2,$3,$4,'active',$5,$6,$7,$8)
         ON CONFLICT (storage_key) DO NOTHING`,
        [
          reference.poolType,
          reference.poolType === 'workspace' ? owner.ownerUserId : null,
          storageKey,
          reference.category,
          sizeBytes,
          reference.referenceType,
          String(reference.referenceId),
          stat.birthtimeMs > 0 ? stat.birthtime : stat.mtime,
        ]
      );
      report.inserted += result.rowCount;
      if (result.rowCount === 0) report.existing += 1;
    }
  }

  for (const entry of tempFiles) {
    const stat = await fs.stat(entry.full);
    if (stat.mtime > cutoff) {
      report.skippedNewer += 1;
      continue;
    }
    report.unknown.push({ key: entry.relative, reason: 'legacy_temp_owner_unknown' });
  }

  console.log(JSON.stringify(report, null, 2));
  if (report.unknown.length && apply) process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error('[storage-backfill] failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.pool.end().catch(() => {});
  });
