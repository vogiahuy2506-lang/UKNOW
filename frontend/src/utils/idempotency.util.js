/**
 * Generates a standard UUID v4 for request-level idempotency headers.
 * Retains the same key during UI retries of the same user action.
 *
 * @returns {string}
 */
export function generateIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Synchronously computes a 64-bit FNV-1a byte hash from an ArrayBuffer / Uint8Array.
 *
 * @param {ArrayBuffer|ArrayBufferView} buffer
 * @returns {string} Hex string hash
 */
export function hashBinaryBufferSync(buffer) {
  const bytes = ArrayBuffer.isView(buffer)
    ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    : new Uint8Array(buffer);
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h1 = Math.imul(h1 ^ bytes[i], 0x01000193);
    h2 = Math.imul(h2 ^ (bytes[i] << 1), 0x01000193);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

/**
 * Computes a SHA-256 digest hex string from an ArrayBuffer using Web Crypto API.
 * Falls back to hashBinaryBufferSync if crypto.subtle is unavailable.
 *
 * @param {ArrayBuffer} buffer
 * @returns {Promise<string>}
 */
export async function hashBinaryBuffer(buffer) {
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
    try {
      const hashBuf = await crypto.subtle.digest('SHA-256', buffer);
      return Array.from(new Uint8Array(hashBuf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      // fallback below
    }
  }
  return hashBinaryBufferSync(buffer);
}

/**
 * Safely extracts ArrayBuffer from a Blob or File across browser and jsdom environments.
 *
 * @param {Blob|File} blob
 * @returns {Promise<ArrayBuffer>}
 */
export async function readBinaryBlobBuffer(blob) {
  if (typeof Blob === 'undefined' || !(blob instanceof Blob)) {
    throw new TypeError('Unable to read binary data for idempotency signature');
  }
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
      reader.readAsArrayBuffer(blob);
    });
  }
  // Never stringify binary data or hash an empty fallback: both can make
  // different byte streams look identical and retain an incorrect action key.
  throw new TypeError('Unable to read binary data for idempotency signature');
}

/**
 * Asynchronously canonicalizes a value recursively:
 * - Sorts object keys recursively.
 * - Preserves types (string, number, boolean, null).
 * - Hashes binary contents of File, Blob, ArrayBuffer, and TypedArray via crypto.subtle.digest.
 *
 * @param {any} val
 * @returns {Promise<any>} JSON-serializable canonical value
 */
export async function canonicalizeValueAsync(val) {
  if (val === null || val === undefined) {
    return val;
  }
  const t = typeof val;
  if (t === 'string' || t === 'number' || t === 'boolean') {
    return val;
  }

  // Browser / DOM binary object handling with byte content hashing
  if (typeof File !== 'undefined' && val instanceof File) {
    const buf = await readBinaryBlobBuffer(val);
    const contentHash = await hashBinaryBuffer(buf);
    return {
      __type: 'File',
      contentHash,
      lastModified: val.lastModified,
      name: val.name,
      size: val.size,
      type: val.type,
    };
  }
  if (typeof Blob !== 'undefined' && val instanceof Blob) {
    const buf = await readBinaryBlobBuffer(val);
    const contentHash = await hashBinaryBuffer(buf);
    return {
      __type: 'Blob',
      contentHash,
      size: val.size,
      type: val.type,
    };
  }
  if (typeof ArrayBuffer !== 'undefined' && val instanceof ArrayBuffer) {
    const contentHash = await hashBinaryBuffer(val);
    return {
      __type: 'ArrayBuffer',
      byteLength: val.byteLength,
      contentHash,
    };
  }
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(val)) {
    const slice = val.buffer.slice(val.byteOffset, val.byteOffset + val.byteLength);
    const contentHash = await hashBinaryBuffer(slice);
    return {
      __type: 'TypedArray',
      byteLength: val.byteLength,
      contentHash,
    };
  }

  if (Array.isArray(val)) {
    const items = await Promise.all(val.map((item) => canonicalizeValueAsync(item)));
    return items.map((item) => (item === undefined ? null : item));
  }
  if (t === 'object') {
    const sortedKeys = Object.keys(val).sort();
    const result = {};
    for (const key of sortedKeys) {
      const canonicalProp = await canonicalizeValueAsync(val[key]);
      if (canonicalProp !== undefined) {
        result[key] = canonicalProp;
      }
    }
    return result;
  }
  return String(val);
}

/**
 * Synchronous canonicalization helper for in-memory structures and descriptors.
 * Hashes ArrayBuffer / TypedArray synchronously via FNV-1a. File and Blob are
 * deliberately rejected: synchronous code cannot read their bytes without
 * falling back to unsafe metadata-only signatures.
 *
 * @param {any} val
 * @returns {any}
 */
export function canonicalizeValueSync(val) {
  if (val === null || val === undefined) {
    return val;
  }
  const t = typeof val;
  if (t === 'string' || t === 'number' || t === 'boolean') {
    return val;
  }

  if (
    (typeof File !== 'undefined' && val instanceof File)
    || (typeof Blob !== 'undefined' && val instanceof Blob)
  ) {
    throw new TypeError('Binary File/Blob payload requires async idempotency signature');
  }

  if (typeof ArrayBuffer !== 'undefined' && val instanceof ArrayBuffer) {
    return {
      __type: 'ArrayBuffer',
      byteLength: val.byteLength,
      contentHash: hashBinaryBufferSync(val),
    };
  }
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(val)) {
    const slice = val.buffer.slice(val.byteOffset, val.byteOffset + val.byteLength);
    return {
      __type: 'TypedArray',
      byteLength: val.byteLength,
      contentHash: hashBinaryBufferSync(slice),
    };
  }
  if (Array.isArray(val)) {
    return val.map((item) => {
      const canonicalItem = canonicalizeValueSync(item);
      return canonicalItem === undefined ? null : canonicalItem;
    });
  }
  if (t === 'object') {
    const sortedKeys = Object.keys(val).sort();
    const result = {};
    for (const key of sortedKeys) {
      const canonicalProp = canonicalizeValueSync(val[key]);
      if (canonicalProp !== undefined) {
        result[key] = canonicalProp;
      }
    }
    return result;
  }
  return String(val);
}

/**
 * Canonical serializer for computing deterministic payload signatures in the frontend.
 * Uses recursive key sorting and JSON.stringify to prevent collisions and preserve types.
 *
 * @param {any} val
 * @returns {Promise<string>}
 */
export async function canonicalSerializePayload(val) {
  const canonical = await canonicalizeValueAsync(val);
  return JSON.stringify(canonical);
}

/**
 * Synchronous canonical serializer for in-memory structures.
 *
 * @param {any} val
 * @returns {string}
 */
export function canonicalSerializePayloadSync(val) {
  const canonical = canonicalizeValueSync(val);
  return JSON.stringify(canonical);
}

/**
 * Computes a deterministic string signature for a payload asynchronously,
 * hashing raw binary bytes of File, Blob, ArrayBuffer, and TypedArray.
 *
 * @param {object|any} payload
 * @returns {Promise<string>}
 */
export async function computePayloadSignature(payload) {
  return canonicalSerializePayload(payload);
}

/**
 * Synchronously computes a deterministic string signature for a payload.
 *
 * @param {object|any} payload
 * @returns {string}
 */
export function computePayloadSignatureSync(payload) {
  return canonicalSerializePayloadSync(payload);
}

/**
 * Manages an idempotency key lifecycle for user actions:
 * - If the current payload signature matches the previous signature, retains the same key (retry).
 * - If the signature changes or key is missing, rotates to a fresh UUID v4.
 *
 * @param {object|null} state - Current holder state: { key: string|null, signature: string|null }
 * @param {object|any} payload - Action payload
 * @returns {Promise<{ key: string, signature: string, isRotated: boolean }>} Updated holder state
 */
export async function resolveActionIdempotencyKey(state, payload) {
  const nextSignature = await computePayloadSignature(payload);
  if (state?.key && state?.signature && state.signature === nextSignature) {
    return {
      key: state.key,
      signature: state.signature,
      isRotated: false,
    };
  }
  return {
    key: generateIdempotencyKey(),
    signature: nextSignature,
    isRotated: true,
  };
}

/**
 * Synchronous variant of resolveActionIdempotencyKey for non-blob payloads.
 * Throws for File / Blob to prevent metadata-only attachment signatures.
 *
 * @param {object|null} state
 * @param {object|any} payload
 * @returns {{ key: string, signature: string, isRotated: boolean }}
 */
export function resolveActionIdempotencyKeySync(state, payload) {
  const nextSignature = computePayloadSignatureSync(payload);
  if (state?.key && state?.signature && state.signature === nextSignature) {
    return {
      key: state.key,
      signature: state.signature,
      isRotated: false,
    };
  }
  return {
    key: generateIdempotencyKey(),
    signature: nextSignature,
    isRotated: true,
  };
}
