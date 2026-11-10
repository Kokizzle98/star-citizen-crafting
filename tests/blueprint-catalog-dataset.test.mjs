import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

const [extractor, normalizer, composer, manifestText] = await Promise.all([
  read('lib/blueprints/blueprint-extractor.ts'),
  read('lib/blueprints/blueprint-normalizer.ts'),
  read('lib/blueprints/blueprint-dataset.ts'),
  read('data/scmdb/latest.json'),
])

const moduleUrl = source => {
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  return `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`
}

async function loadComposer(normalizerSource = normalizer) {
  const source = composer
    .replace("'./blueprint-extractor'", JSON.stringify(moduleUrl(extractor)))
    .replace("'./blueprint-normalizer'", JSON.stringify(moduleUrl(normalizerSource)))
  return (await import(moduleUrl(source))).prepareScmdbBlueprintDataset
}

const prepare = await loadComposer()
const manifest = JSON.parse(manifestText)

// Both channels carry the same three SCMDB-reported CIG data errors, each of
// which also ships a suggested replacement name. LIVE has five and PTU four
// blueprints without a product name.
const expected = {
  LIVE: { total: 1618, reviewRequired: 8, productNameMissing: 5 },
  PTU: { total: 1619, reviewRequired: 7, productNameMissing: 4 },
}

for (const channel of ['LIVE', 'PTU']) {
  test(`prepares the real ${channel} classified blueprint catalog`, async () => {
    const metadata = manifest.channels[channel.toLowerCase()]
    const data = JSON.parse(await read(`data/scmdb/${metadata.files.crafting_blueprints}`))
    const result = prepare(manifest, data, channel)

    assert.equal(result.channel, channel)
    assert.equal(result.version, metadata.version)
    assert.equal(result.sourceFile, metadata.files.crafting_blueprints)

    assert.equal(result.counts.total, expected[channel].total)
    assert.equal(result.counts.reviewRequired, expected[channel].reviewRequired)
    assert.equal(result.counts.valid, result.counts.total - result.counts.reviewRequired)
    assert.equal(result.counts.total, result.counts.valid + result.counts.reviewRequired)
    assert.equal(result.counts.total, result.blueprints.length)

    // Nothing is dropped: every source row stays in the catalog and only its
    // review state differs.
    assert.equal(result.valid.length + result.reviewRequired.length, result.blueprints.length)
    assert.ok(result.valid.every(blueprint => blueprint.reviewState === 'VALID'))
    assert.ok(result.valid.every(blueprint => blueprint.issues.length === 0))
    assert.ok(result.reviewRequired.every(blueprint => blueprint.reviewState === 'REVIEW_REQUIRED'))
    assert.ok(result.reviewRequired.every(blueprint => blueprint.issues.length > 0))

    const missing = result.blueprints.filter(blueprint =>
      blueprint.issues.includes('PRODUCT_NAME_MISSING'),
    )
    assert.equal(missing.length, expected[channel].productNameMissing)
    assert.ok(missing.every(blueprint => blueprint.productName === null))
    assert.ok(missing.every(blueprint => blueprint.reviewState === 'REVIEW_REQUIRED'))
  })

  test(`keeps the ${channel} source suggestion visible without adopting it`, async () => {
    const metadata = manifest.channels[channel.toLowerCase()]
    const data = JSON.parse(await read(`data/scmdb/${metadata.files.crafting_blueprints}`))
    const result = prepare(manifest, data, channel)

    const suggested = result.blueprints.filter(blueprint =>
      blueprint.issues.includes('SOURCE_SUGGESTED_NAME'),
    )
    assert.equal(suggested.length, 3)

    for (const blueprint of suggested) {
      assert.equal(blueprint.reviewState, 'REVIEW_REQUIRED')
      assert.ok(blueprint.scmdbSuggestedName.length > 0)
      // The product name stays exactly as SCMDB reports it. The suggestion is
      // recorded, never applied.
      assert.notEqual(blueprint.productName, blueprint.scmdbSuggestedName)
      const source = data.blueprints.find(row => row.guid === blueprint.sourceGuid)
      assert.equal(blueprint.productName, source.productName)
    }

    const cigErrors = result.blueprints.filter(blueprint =>
      blueprint.issues.includes('CIG_DATA_ERROR'),
    )
    assert.equal(cigErrors.length, 3)
    assert.ok(cigErrors.every(blueprint => blueprint.scmdbCigDataError === true))
  })

  test(`keeps ${channel} isDefault independent of the review state`, async () => {
    const metadata = manifest.channels[channel.toLowerCase()]
    const data = JSON.parse(await read(`data/scmdb/${metadata.files.crafting_blueprints}`))
    const result = prepare(manifest, data, channel)

    const flagged = result.blueprints.filter(blueprint => blueprint.scmdbIsDefault)
    assert.equal(flagged.length, 8)
    // The flag classifies nothing and grants nothing: it never appears as an
    // issue and never changes the review state.
    assert.ok(flagged.every(blueprint => blueprint.reviewState === 'VALID'))
    assert.ok(
      result.blueprints.every(blueprint =>
        blueprint.issues.every(issue => !issue.includes('DEFAULT')),
      ),
    )
  })
}

test('LIVE and PTU classified catalogs stay separate', async () => {
  const live = manifest.channels.live
  const ptu = manifest.channels.ptu
  const liveData = JSON.parse(await read(`data/scmdb/${live.files.crafting_blueprints}`))
  const ptuData = JSON.parse(await read(`data/scmdb/${ptu.files.crafting_blueprints}`))

  const liveResult = prepare(manifest, liveData, 'LIVE')
  const ptuResult = prepare(manifest, ptuData, 'PTU')

  assert.notEqual(liveResult.version, ptuResult.version)
  assert.notEqual(liveResult.sourceFile, ptuResult.sourceFile)
  assert.notEqual(liveResult.counts.total, ptuResult.counts.total)

  assert.throws(() => prepare(manifest, ptuData, 'LIVE'), /SCMDB_BLUEPRINT_VERSION_MISMATCH/)
  assert.throws(() => prepare(manifest, liveData, 'PTU'), /SCMDB_BLUEPRINT_VERSION_MISMATCH/)
})

test('fails closed when the classification itself is inconsistent', async () => {
  const live = manifest.channels.live
  const liveData = JSON.parse(await read(`data/scmdb/${live.files.crafting_blueprints}`))

  const brokenState = normalizer.replace(
    "reviewState: issues.length === 0 ? 'VALID' : 'REVIEW_REQUIRED',",
    "reviewState: 'UNKNOWN',",
  )
  assert.notEqual(brokenState, normalizer)
  const prepareBrokenState = await loadComposer(brokenState)
  assert.throws(
    () => prepareBrokenState(manifest, liveData, 'LIVE'),
    /SCMDB_BLUEPRINT_CLASSIFICATION_INVALID/,
  )

  // A row claimed as VALID while carrying issues must not pass.
  const brokenValid = normalizer.replace(
    "reviewState: issues.length === 0 ? 'VALID' : 'REVIEW_REQUIRED',",
    "reviewState: 'VALID',",
  )
  const prepareBrokenValid = await loadComposer(brokenValid)
  assert.throws(
    () => prepareBrokenValid(manifest, liveData, 'LIVE'),
    /SCMDB_BLUEPRINT_CLASSIFICATION_INVALID/,
  )

  // A dropped row must not pass either.
  const dropping = normalizer.replace(
    'return blueprints.map(classifyScmdbBlueprint)',
    'return blueprints.slice(1).map(classifyScmdbBlueprint)',
  )
  assert.notEqual(dropping, normalizer)
  const prepareDropping = await loadComposer(dropping)
  assert.throws(
    () => prepareDropping(manifest, liveData, 'LIVE'),
    /SCMDB_BLUEPRINT_CLASSIFICATION_INVALID/,
  )
})
