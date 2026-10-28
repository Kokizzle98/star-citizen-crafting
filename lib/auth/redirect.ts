export function safeRelativePath(raw: string | null, fallback = '/') {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return fallback
  try {
    const parsed = new URL(raw, 'https://vector.invalid')
    return parsed.origin === 'https://vector.invalid' ? `${parsed.pathname}${parsed.search}${parsed.hash}` : fallback
  } catch { return fallback }
}
