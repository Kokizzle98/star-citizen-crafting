export function safeRelativePath(raw: string | null, fallback = '/') {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return fallback
  try {
    const u = new URL(raw, 'https://vector.invalid')
    return u.origin === 'https://vector.invalid' ? `${u.pathname}${u.search}${u.hash}` : fallback
  } catch { return fallback }
}
