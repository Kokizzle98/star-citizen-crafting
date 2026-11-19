// Read-only loaders: turn a directory or a git ref of data/scmdb/ into the
// role -> content map that the precheck expects (section 37.1: files are
// compared by logical role, not by path).
//
// This is the only I/O of the domain precheck, and it only reads. It uses no
// network: git is run with lazy fetching disabled, so an object that is not in
// the local repository is reported as missing instead of being downloaded.

import { execFileSync } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { CHANNEL_ROLES, CHANNELS, STATIC_ROLES } from './register.mjs'

const DATA_PATH = 'data/scmdb'

/**
 * Role map from a list of `{ name, bytes, reason? }` entries. `bytes` is null
 * when the entry could not be read (missing object, I/O error) or is not a
 * regular file (symlink, submodule). Such an entry is never dropped: it is
 * returned in `unreadable`, and the precheck turns every one of them into a
 * global HELD_FOR_REVIEW (UNREADABLE_FILE), whether the name is listed in
 * latest.json, statically registered or unknown. Static files map to their static role. Per-build
 * files map to `<channel>/<role>` through the `files` map of latest.json. Every
 * other name becomes `unregistered/<name>` so that the precheck can hold on it.
 */
export function buildRoleMap(entries) {
  const files = {}
  const fileNames = {}
  const unreadable = entries
    .filter(entry => !entry.bytes)
    .map(entry => ({ name: entry.name, reason: entry.reason ?? 'UNREADABLE' }))
  const byName = new Map(entries.map(entry => [entry.name, entry]))
  const claimed = new Set()

  for (const [role, spec] of Object.entries(STATIC_ROLES)) {
    const entry = byName.get(spec.file)
    if (entry && entry.bytes) {
      files[role] = entry.bytes
      fileNames[role] = spec.file
      claimed.add(spec.file)
    }
  }

  let latest = null
  try {
    if (files.latest) latest = JSON.parse(Buffer.from(files.latest).toString('utf8'))
  } catch {
    latest = null // the precheck reports an unparsable latest.json
  }
  for (const channel of CHANNELS) {
    const listed = latest?.channels?.[channel.toLowerCase()]?.files
    if (typeof listed !== 'object' || listed === null) continue
    for (const [role, name] of Object.entries(listed)) {
      if (!Object.hasOwn(CHANNEL_ROLES, role) || typeof name !== 'string') continue
      const entry = byName.get(name)
      if (entry && entry.bytes) {
        const key = `${channel.toLowerCase()}/${role}`
        files[key] = entry.bytes
        fileNames[key] = name
        claimed.add(name)
      }
    }
  }

  for (const entry of entries) {
    if (claimed.has(entry.name) || !entry.bytes) continue
    files[`unregistered/${entry.name}`] = entry.bytes
    fileNames[`unregistered/${entry.name}`] = entry.name
  }
  return { files, fileNames, unreadable }
}

/**
 * Reads the entries directly inside `directory`. A file that cannot be read, a
 * symlink or any other non-regular entry is reported as unreadable (never
 * skipped, never a crash with a partial result). A subdirectory is listed as
 * the unregistered entry `<name>/`.
 */
export async function loadDirectory(directory) {
  const dirents = await readdir(directory, { withFileTypes: true })
  const entries = []
  for (const dirent of dirents) {
    if (dirent.isDirectory()) {
      entries.push({ name: `${dirent.name}/`, bytes: Buffer.alloc(0) })
    } else if (!dirent.isFile()) {
      entries.push({ name: dirent.name, bytes: null, reason: 'NOT_A_REGULAR_FILE' })
    } else {
      let bytes = null
      try {
        bytes = await readFile(path.join(directory, dirent.name))
      } catch {
        bytes = null
      }
      entries.push({ name: dirent.name, bytes, reason: 'READ_FAILED' })
    }
  }
  return buildRoleMap(entries)
}

const git = (cwd, args, options = {}) => execFileSync('git', args, {
  cwd,
  maxBuffer: 256 * 1024 * 1024,
  env: { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' },
  stdio: ['ignore', 'pipe', 'pipe'],
  ...options,
})

/** Reads `data/scmdb/` of a local git ref. Objects missing locally are reported as missing files. */
export function loadGitRef(ref, { cwd = process.cwd() } = {}) {
  const listing = git(cwd, ['ls-tree', '-z', `${ref}:${DATA_PATH}`]).toString('utf8')
  const entries = []
  for (const line of listing.split('\0')) {
    if (!line) continue
    const tab = line.indexOf('\t')
    const [mode, type, sha] = line.slice(0, tab).split(' ')
    const name = line.slice(tab + 1)
    if (type === 'tree') {
      entries.push({ name: `${name}/`, bytes: Buffer.alloc(0) })
    } else if (type !== 'blob' || mode === '120000') {
      // Submodule (commit), symlink or anything else: not a regular file.
      entries.push({ name, bytes: null, reason: type === 'commit' ? 'SUBMODULE' : mode === '120000' ? 'SYMLINK' : `ENTRY_TYPE_${type}` })
    } else {
      let bytes = null
      try {
        bytes = git(cwd, ['cat-file', 'blob', sha])
      } catch {
        bytes = null
      }
      entries.push({ name, bytes, reason: 'OBJECT_UNAVAILABLE' })
    }
  }
  return buildRoleMap(entries)
}
