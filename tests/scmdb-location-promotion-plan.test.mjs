import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [extractor, normalizer, dataset, promotability, planner, manifestText] = await Promise.all([
  read('lib/scmdb/location-extractor.ts'), read('lib/scmdb/location-normalizer.ts'),
  read('lib/scmdb/location-dataset.ts'), read('lib/scmdb/location-promotability.ts'),
  read('lib/scmdb/location-promotion-plan.ts'), read('data/scmdb/latest.json'),
])
const url = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64')}`
const prepare = (await import(url(dataset
  .replace("'./location-extractor'", JSON.stringify(url(extractor)))
  .replace("'./location-normalizer'", JSON.stringify(url(normalizer)))))).prepareScmdbLocationDataset
const { evaluateScmdbLocationDataset: evaluate } = await import(url(promotability))
const { planScmdbLocationPromotion: plan } = await import(url(planner.replace("'./location-promotability'", JSON.stringify(url(promotability)))))
const row = (sourceKey, name, type = 'Station', status = 'VALID') => ({
  sourceKey, name, type, status, canonicalName: name, normalizedName: name.toLowerCase(),
  system: null, planet: null, moon: null, issues: [],
})
const id = '12345678-1234-1234-1234-123456789abc'
const location = { id, normalizedName: 'legacy', isSystem: false, isArchived: false }
const mapping = { channel: 'LIVE', sourceKey: 'mapped', inventoryLocationId: id, isActive: false }

test('partitions by identity and conflicts without mutating inputs', () => {
  const rows = [row('z', 'New'), row('b', 'Duplicate'), row('a', 'Duplicate'), row('mapped', 'Legacy'), row('x', 'Legacy'), row('ignored', 'Ignored', 'Destination')]
  const evaluation = evaluate({ locations: rows })
  const before = structuredClone([evaluation, [mapping], [location]])
  const result = plan('LIVE', evaluation, [mapping], [location])
  assert.deepEqual([evaluation, [mapping], [location]], before)
  assert.deepEqual(result.alreadyMapped, [{ sourceKey: 'mapped', inventoryLocationId: id }])
  assert.deepEqual(result.safeNew.map(x => x.sourceKey), ['z'])
  assert.deepEqual(result.conflicts, [
    { sourceKey: 'a', reason: 'DUPLICATE_SCMDB_NAME' },
    { sourceKey: 'b', reason: 'DUPLICATE_SCMDB_NAME' },
    { sourceKey: 'x', reason: 'EXISTING_VECTOR_NAME' },
  ])
  assert.deepEqual(result.counts, { promotable: 5, alreadyMapped: 1, safeNew: 1, conflicts: 3 })
  assert.deepEqual(result, plan('LIVE', evaluation, [mapping], [location]))
  const fallback = plan('LIVE', evaluate({ locations: [row('fallback', 'Unbekannt')] }), [], [])
  assert.deepEqual(fallback.conflicts, [{ sourceKey: 'fallback', reason: 'EXISTING_VECTOR_NAME' }])
})

test('rejects malformed or duplicate identities and inconsistent evaluations', () => {
  const evaluation = evaluate({ locations: [row('mapped', 'Legacy')] })
  assert.throws(() => plan('LIVE', evaluation, [mapping, mapping], [location]), /SCMDB_PROMOTION_PLAN_INVALID/)
  assert.throws(() => plan('LIVE', evaluation, [mapping, { ...mapping, sourceKey: 'other' }], [location]), /SCMDB_PROMOTION_PLAN_INVALID/)
  assert.throws(() => plan('LIVE', evaluation, [{ ...mapping, inventoryLocationId: 'invalid' }], [location]), /SCMDB_PROMOTION_PLAN_INVALID/)
  assert.throws(() => plan('LIVE', evaluation, [mapping], [{ ...location, isSystem: true }]), /SCMDB_PROMOTION_PLAN_INVALID/)
  assert.throws(() => plan('LIVE', { ...evaluation, counts: { ...evaluation.counts, total: 2 } }, [], []), /SCMDB_PROMOTION_PLAN_INVALID/)
  assert.throws(() => plan('LIVE', { ...evaluation, promotable: [evaluation.promotable[0], evaluation.promotable[0]] }, [], []), /SCMDB_PROMOTION_PLAN_INVALID/)
  assert.throws(() => plan('LIVE', { ...evaluation, promotable: [{ ...evaluation.promotable[0], location: { ...evaluation.promotable[0].location, status: 'invalid' } }] }, [], []), /SCMDB_PROMOTABILITY_INVALID_CLASSIFICATION/)
})

test('plans real LIVE data against an explicitly empty snapshot', async t => {
  const manifest = JSON.parse(manifestText)
  const data = JSON.parse(await read(`data/scmdb/${manifest.channels.live.files.merged}`))
  const evaluation = evaluate(prepare(manifest, data, 'LIVE'))
  const result = plan('LIVE', evaluation, [], [])
  assert.equal(result.counts.promotable, 294)
  assert.equal(result.counts.promotable, result.counts.alreadyMapped + result.counts.safeNew + result.counts.conflicts)
  const reasons = Object.fromEntries(['EXISTING_VECTOR_NAME', 'DUPLICATE_SCMDB_NAME'].map(reason => [reason, result.conflicts.filter(c => c.reason === reason).length]))
  t.diagnostic(`LIVE, empty mapping/location snapshot: ${JSON.stringify({ ...result.counts, reasons })}`)
})
