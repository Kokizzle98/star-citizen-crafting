import { readFile } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

// Shared fixture for the Fabricator F1 tests: transpiles lib/fabricator/*.ts
// (and their relative imports) without a build step and loads the
// repository-pinned LIVE mirror exactly once. Type-only imports disappear in
// transpilation; files that import 'server-only' are never loaded here.

export const ROOT = new URL('../', import.meta.url)

const cache = new Map()

async function loadTsModule(relativePath) {
  if (cache.has(relativePath)) return cache.get(relativePath)
  const source = await readFile(new URL(relativePath, ROOT), 'utf8')
  let output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const specifiers = new Set([...output.matchAll(/from\s+(['"])(\.{1,2}\/[^'"]+)\1/g)].map(m => m[2]))
  for (const specifier of specifiers) {
    const dependency = path.posix.join(path.posix.dirname(relativePath), `${specifier}.ts`)
    const url = await loadTsModule(dependency)
    output = output.replaceAll(`'${specifier}'`, JSON.stringify(url)).replaceAll(`"${specifier}"`, JSON.stringify(url))
  }
  if (/from\s+['"](?!data:)[^'"]+['"]/.test(output)) throw new Error(`Unexpected non-relative import in ${relativePath}`)
  const url = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`
  cache.set(relativePath, url)
  return url
}

export const loadFabricatorModule = async name => import(await loadTsModule(`lib/fabricator/${name}.ts`))

export const readText = file => readFile(new URL(file, ROOT), 'utf8')
export const readJson = async file => JSON.parse(await readText(file))

let livePromise = null

/** The real LIVE mirror documents plus the prepared source and hierarchy. */
export function loadLive() {
  livePromise ??= (async () => {
    const sourceModule = await loadFabricatorModule('fabricator-live-source')
    const familyModule = await loadFabricatorModule('fabricator-product-family')
    const manifest = await readJson('data/scmdb/latest.json')
    const files = sourceModule.liveFilesFromManifest(manifest)
    const [blueprintDocument, itemDocument] = await Promise.all([
      readJson(`data/scmdb/${files.blueprintFile}`), readJson(`data/scmdb/${files.itemFile}`),
    ])
    const source = sourceModule.prepareFabricatorLiveSource(manifest, blueprintDocument, itemDocument)
    const hierarchy = familyModule.buildFabricatorProductHierarchy(source.blueprints, source.items)
    const byTag = new Map(source.blueprints.map(b => [b.sourceTag, b]))
    const byGuid = new Map(source.blueprints.map(b => [b.sourceGuid, b]))
    return { manifest, files, blueprintDocument, itemDocument, source, hierarchy, byTag, byGuid }
  })()
  return livePromise
}

/** The family that contains the given blueprint tag. */
export function familyOfTag(live, tag) {
  const guid = live.byTag.get(tag)?.sourceGuid
  return live.hierarchy.families.find(family =>
    family.variants.some(variant => variant.components.some(component => component.blueprintGuids.includes(guid))))
}

export const productNames = (live, family) => family.variants.map(variant =>
  variant.components.map(component => live.byGuid.get(component.blueprintGuids[0]).productName))
