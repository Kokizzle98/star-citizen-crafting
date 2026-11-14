// Same-origin redirect guard. The input is resolved first (against a fixed
// dummy origin, so dot segments and encodings are normalized) and only the
// RESULT is checked: a path like `/x/..//example.org` resolves to
// `//example.org`, which a browser treats as an external host.
// Anything that is not a plain string, or does not resolve to a same-origin
// path with exactly one leading slash, returns the fallback. Never throws.
const DUMMY_ORIGIN = 'https://vector.invalid'
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/

export function safeRelativePath(raw: unknown, fallback = '/'): string {
  if (typeof raw !== 'string' || raw.length === 0) return fallback
  if (!raw.startsWith('/') || raw.includes('\\') || CONTROL_CHARACTERS.test(raw)) return fallback

  try {
    const url = new URL(raw, DUMMY_ORIGIN)
    if (url.origin !== DUMMY_ORIGIN) return fallback

    const resolved = `${url.pathname}${url.search}${url.hash}`
    if (
      !resolved.startsWith('/') ||
      resolved.startsWith('//') ||
      resolved.startsWith('/\\') ||
      resolved.includes('\\') ||
      CONTROL_CHARACTERS.test(resolved)
    ) {
      return fallback
    }
    return resolved
  } catch {
    return fallback
  }
}
