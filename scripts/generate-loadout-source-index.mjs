#!/usr/bin/env node
// Offline generator of the derived vehicle loadout index (F4-S, Option B).
//
//   node scripts/generate-loadout-source-index.mjs --source <scunpacked-data checkout>
//        [--out <file>] [--expect-commit <40-char commit>]
//
// Reads a LOCAL scunpacked-data checkout that is pinned to one commit
// (`ships/*.json` only) and writes the derived, component-UUID-centred index
// to a git-ignored path (default: data/derived/loadout-source/). It makes no
// network call, touches no database, Supabase or Vercel and writes nothing
// else. Neither the scunpacked-data raw tree nor the index is ever committed:
// the licence and redistribution status of scunpacked-data are unresolved.
// This file must never be imported by app/**, components/** or bundled code.
//
// The same checkout commit always yields byte-identical output.

import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import ts from 'typescript'

const execFileAsync = promisify(execFile)
const ROOT = new URL('../', import.meta.url)
const DEFAULT_OUT = path.join('data', 'derived', 'loadout-source', 'scunpacked-live-loadout-index.json')

export const EXIT_OK = 0
export const EXIT_FAILED = 1
export const EXIT_USAGE = 2

async function loadTsModule(root, relativePath, cache = new Map()) {
  if (cache.has(relativePath)) return cache.get(relativePath)
  const source = await readFile(new URL(relativePath, root), 'utf8')
  let output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const specifiers = new Set([...output.matchAll(/from\s+(['"])(\.{1,2}\/[^'"]+)\1/g)].map(m => m[2]))
  for (const specifier of specifiers) {
    const dependency = path.posix.join(path.posix.dirname(relativePath), `${specifier}.ts`)
    const url = await loadTsModule(root, dependency, cache)
    output = output.replaceAll(`'${specifier}'`, JSON.stringify(url)).replaceAll(`"${specifier}"`, JSON.stringify(url))
  }
  const url = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`
  cache.set(relativePath, url)
  return url
}

export async function loadLoadoutSourceModules(root = ROOT) {
  const cache = new Map()
  const load = async file => import(await loadTsModule(root, file, cache))
  const [build, generator] = await Promise.all([
    load('lib/loadout-source/loadout-source-build.ts'),
    load('lib/loadout-source/loadout-source-generator.ts'),
  ])
  return {
    createLoadoutProvenance: build.createLoadoutProvenance,
    buildLoadoutIndex: generator.buildLoadoutIndex,
    serializeLoadoutIndex: generator.serializeLoadoutIndex,
  }
}

async function git(source, args) {
  const { stdout } = await execFileAsync('git', ['-C', source, ...args], { maxBuffer: 64 * 1024 * 1024 })
  return stdout
}

function parseArguments(argv) {
  const options = { source: null, out: null, expectCommit: null }
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    const value = argv[i + 1]
    if (flag === '--source' && value) { options.source = value; i += 1 }
    else if (flag === '--out' && value) { options.out = value; i += 1 }
    else if (flag === '--expect-commit' && value) { options.expectCommit = value; i += 1 }
    else return null
  }
  return options.source ? options : null
}

function inside(parent, child) {
  const relative = path.relative(parent, child)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

/** Returns an exit code. All diagnostics go to the provided writers; the index content is never printed. */
export async function run(argv, { root = ROOT, out = line => console.log(line), err = line => console.error(line) } = {}) {
  const options = parseArguments(argv)
  if (!options) {
    err('Usage: node scripts/generate-loadout-source-index.mjs --source <scunpacked-data checkout> [--out <file>] [--expect-commit <commit>]')
    return EXIT_USAGE
  }

  try {
    const source = path.resolve(options.source)
    const rootPath = fileURLToPath(root)
    const outFile = path.resolve(rootPath, options.out ?? DEFAULT_OUT)
    if (inside(source, outFile)) throw new Error('OUTPUT_INSIDE_SOURCE_CHECKOUT')

    const commit = (await git(source, ['rev-parse', 'HEAD'])).trim()
    if (options.expectCommit && options.expectCommit !== commit) {
      throw new Error(`SOURCE_COMMIT_MISMATCH (expected ${options.expectCommit}, found ${commit})`)
    }
    // Pinned means: the tracked files equal the commit. Untracked files do not matter, local edits do.
    if ((await git(source, ['status', '--porcelain', '--untracked-files=no'])).trim() !== '') {
      throw new Error('SOURCE_CHECKOUT_MODIFIED')
    }
    const subject = (await git(source, ['log', '-1', '--format=%s', commit])).trim()

    const modules = await loadLoadoutSourceModules()
    const provenance = modules.createLoadoutProvenance(commit, subject)

    const shipFiles = (await git(source, ['ls-tree', '-r', '--name-only', commit, '--', 'ships']))
      .split('\n').map(name => name.trim()).filter(name => name.endsWith('.json')).sort()
    if (shipFiles.length === 0) throw new Error('SOURCE_HAS_NO_SHIP_FILES')

    const documents = []
    for (const name of shipFiles) {
      let content
      try { content = await readFile(path.join(source, name), 'utf8') } catch { throw new Error(`SOURCE_FILE_MISSING (${name})`) }
      try { documents.push(JSON.parse(content)) } catch { throw new Error(`SOURCE_FILE_NOT_JSON (${name})`) }
    }

    const index = modules.buildLoadoutIndex(documents, provenance)
    await mkdir(path.dirname(outFile), { recursive: true })
    await writeFile(outFile, modules.serializeLoadoutIndex(index), 'utf8')

    out(`Loadout source index written (${path.relative(rootPath, outFile) || outFile}).`)
    out(`Source commit: ${provenance.sourceCommit}`)
    out(`Game build:    ${provenance.gameBuild} (${provenance.channel})`)
    out(`Vehicles: ${index.counts.vehicles}, components: ${index.counts.components}, component-port links: ${index.counts.componentPortLinks}, empty ports: ${index.counts.emptyPorts}`)
    out('The index is git-ignored and must not be committed (licence of scunpacked-data unresolved).')
    return EXIT_OK
  } catch (error) {
    err(`BLOCKED: ${error instanceof Error ? error.message : 'UNEXPECTED_ERROR'}`)
    return EXIT_FAILED
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await run(process.argv.slice(2))
}
