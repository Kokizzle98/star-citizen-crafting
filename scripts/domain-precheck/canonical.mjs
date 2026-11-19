// Canonical serialization and hashing (DATASET_PIPELINE_V1.md section 37.2).
//
// UTF-8, object keys sorted (UTF-16 code unit order), no insignificant
// whitespace, array order kept, values unchanged. Numbers are rendered the way
// JSON.parse / JSON.stringify round-trip them, which is also what every
// repository consumer sees. Number formatting and Unicode normalization beyond
// that are an open decision (section 43, item 25): integers outside the safe
// range cannot be represented faithfully, so they make the fingerprint
// not computable instead of risking a false UNCHANGED.

import { createHash } from 'node:crypto'

export class FingerprintError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code)
    this.name = 'FingerprintError'
    this.code = code
  }
}

export function sha256Hex(input) {
  const bytes = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
  return createHash('sha256').update(bytes).digest('hex')
}

function serialize(value) {
  if (value === null) return 'null'
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value)
    case 'boolean':
      return value ? 'true' : 'false'
    case 'number':
      if (!Number.isFinite(value)) throw new FingerprintError('NUMBER_NOT_FINITE')
      if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
        throw new FingerprintError('INTEGER_NOT_REPRESENTABLE', String(value))
      }
      return JSON.stringify(value)
    case 'object': {
      if (Array.isArray(value)) return `[${value.map(serialize).join(',')}]`
      const keys = Object.keys(value).sort()
      return `{${keys.map(key => `${JSON.stringify(key)}:${serialize(value[key])}`).join(',')}}`
    }
    default:
      throw new FingerprintError('VALUE_NOT_SERIALIZABLE', typeof value)
  }
}

/** Canonical JSON text of a parsed JSON value. */
export function canonicalize(value) {
  return serialize(value)
}

/** SHA-256 (hex) of the canonical UTF-8 serialization of a parsed JSON value. */
export function canonicalFingerprint(value) {
  return sha256Hex(canonicalize(value))
}
