import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

const [extractorSource, manifestText] = await Promise.all([
  read('lib/blueprints/blueprint-extractor.ts'),
  read('data/scmdb/latest.json'),
])

const moduleUrl = source => {
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  return `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`
}

const { extractScmdbBlueprints } = await import(moduleUrl(extractorSource))
const manifest = JSON.parse(manifestText)

const channelMetadata = channel => manifest.channels[channel.toLowerCase()]

async function realDataset(channel) {
  const metadata = channelMetadata(channel)
  return {
    metadata,
    data: JSON.parse(await read(`data/scmdb/${metadata.files.crafting_blueprints}`)),
  }
}

const expected = {
  LIVE: { total: 1618, isDefault: 8 },
  PTU: { total: 1619, isDefault: 8 },
}

for (const channel of ['LIVE', 'PTU']) {
  test(`extracts the real ${channel} blueprint catalog deterministically`, async () => {
    const { metadata, data } = await realDataset(channel)
    const result = extractScmdbBlueprints(manifest, data, channel)

    assert.equal(result.channel, channel)
    assert.equal(result.version, metadata.version)
    assert.equal(result.sourceFile, metadata.files.crafting_blueprints)
    assert.equal(result.blueprints.length, expected[channel].total)
    assert.equal(result.blueprints.length, data.blueprints.length)

    const guids = result.blueprints.map(blueprint => blueprint.sourceGuid)
    assert.equal(new Set(guids).size, guids.length)
    assert.deepEqual(guids, [...guids].sort((a, b) => a.localeCompare(b)))

    for (const blueprint of result.blueprints) {
      assert.ok(blueprint.sourceGuid.length > 0)
      assert.ok(blueprint.sourceTag.length > 0)
      assert.ok(blueprint.productEntityClass.length > 0)
      assert.ok(blueprint.gear.length > 0)
      assert.ok(blueprint.productName === null || blueprint.productName.length > 0)
      assert.ok(blueprint.type === null || blueprint.type.length > 0)
      assert.ok(blueprint.subtype === null || blueprint.subtype.length > 0)
      assert.ok(blueprint.manufacturer === null || blueprint.manufacturer.length > 0)
      assert.equal(typeof blueprint.scmdbIsDefault, 'boolean')
      assert.equal(typeof blueprint.scmdbCigDataError, 'boolean')
      assert.ok(
        blueprint.scmdbSuggestedName === null || blueprint.scmdbSuggestedName.length > 0,
      )
      assert.equal(typeof blueprint.recipe.craftTimeSeconds, 'number')
      assert.ok(Array.isArray(blueprint.recipe.slots))
    }

    const sameGuids = new Set(data.blueprints.map(blueprint => blueprint.guid))
    assert.equal(sameGuids.size, result.blueprints.length)
    assert.ok(result.blueprints.every(blueprint => sameGuids.has(blueprint.sourceGuid)))
  })

  test(`keeps the ${channel} isDefault flag as a raw source value only`, async () => {
    const { data } = await realDataset(channel)
    const result = extractScmdbBlueprints(manifest, data, channel)
    const flagged = result.blueprints.filter(blueprint => blueprint.scmdbIsDefault)

    assert.equal(flagged.length, expected[channel].isDefault)
    assert.equal(
      flagged.length,
      data.blueprints.filter(blueprint => blueprint.isDefault === true).length,
    )

    // The flag is carried, never translated into ownership: the extracted row
    // exposes no ownership field at all.
    for (const blueprint of result.blueprints) {
      assert.equal('owned' in blueprint, false)
      assert.equal('isOwned' in blueprint, false)
      assert.equal('ownership' in blueprint, false)
    }
  })

  test(`normalizes the real ${channel} recipe contract`, async () => {
    const { data } = await realDataset(channel)
    const result = extractScmdbBlueprints(manifest, data, channel)

    for (const blueprint of result.blueprints) {
      assert.ok(blueprint.recipe.craftTimeSeconds >= 0)
      for (const slot of blueprint.recipe.slots) {
        assert.ok(slot.name.length > 0)
        assert.ok(slot.options.length > 0)
        for (const option of slot.options) {
          assert.ok(option.kind === 'RESOURCE' || option.kind === 'ITEM')
          assert.ok(option.name.length > 0)
          assert.ok(option.quantity > 0)
          assert.ok(option.minQuality >= 0)
        }
      }
    }
  })
}

test('rejects a dataset whose version does not match the requested channel', async () => {
  const live = await realDataset('LIVE')
  const ptu = await realDataset('PTU')

  // Reading the PTU file as LIVE is a cross-channel substitution and must fail
  // closed instead of falling back.
  assert.throws(
    () => extractScmdbBlueprints(manifest, ptu.data, 'LIVE'),
    /SCMDB_BLUEPRINT_VERSION_MISMATCH/,
  )
  assert.throws(
    () => extractScmdbBlueprints(manifest, live.data, 'PTU'),
    /SCMDB_BLUEPRINT_VERSION_MISMATCH/,
  )
})

test('rejects a manifest without the requested channel or its catalog file', () => {
  assert.throws(() => extractScmdbBlueprints(null, {}, 'LIVE'), /SCMDB_BLUEPRINT_MANIFEST_INVALID/)
  assert.throws(() => extractScmdbBlueprints({}, {}, 'LIVE'), /SCMDB_BLUEPRINT_MANIFEST_INVALID/)
  assert.throws(
    () => extractScmdbBlueprints({ channels: { live: { version: '1', files: {} } } }, {}, 'LIVE'),
    /SCMDB_BLUEPRINT_MANIFEST_INVALID/,
  )
  assert.throws(
    () =>
      extractScmdbBlueprints(
        { channels: { ptu: { version: '1', files: { crafting_blueprints: 'x.json' } } } },
        {},
        'LIVE',
      ),
    /SCMDB_BLUEPRINT_MANIFEST_INVALID/,
  )
})

const minimalManifest = {
  channels: { live: { version: '1', files: { crafting_blueprints: 'bp.json' } } },
}

const minimalRow = {
  guid: 'guid-1',
  tag: 'BP_CRAFT_x',
  productEntityClass: 'class-1',
  gear: 'fpsgear',
  type: null,
  subtype: null,
  manufacturer: null,
  productName: 'Example',
  tiers: [{ craftTimeSeconds: 10, slots: [] }],
}

const minimalDataset = rows => ({ version: '1', blueprints: rows })

test('accepts the minimal valid row contract', () => {
  const result = extractScmdbBlueprints(minimalManifest, minimalDataset([minimalRow]), 'LIVE')

  assert.equal(result.blueprints.length, 1)
  assert.equal(result.blueprints[0].sourceGuid, 'guid-1')
  assert.equal(result.blueprints[0].productName, 'Example')
  assert.equal(result.blueprints[0].scmdbIsDefault, false)
  assert.equal(result.blueprints[0].scmdbCigDataError, false)
  assert.equal(result.blueprints[0].scmdbSuggestedName, null)
})

test('rejects a structurally invalid dataset or row', () => {
  assert.throws(
    () => extractScmdbBlueprints(minimalManifest, { version: '1' }, 'LIVE'),
    /SCMDB_BLUEPRINT_DATASET_INVALID/,
  )
  assert.throws(
    () => extractScmdbBlueprints(minimalManifest, minimalDataset([null]), 'LIVE'),
    /SCMDB_BLUEPRINT_ROW_INVALID/,
  )

  for (const field of ['guid', 'tag', 'productEntityClass', 'gear']) {
    assert.throws(
      () =>
        extractScmdbBlueprints(
          minimalManifest,
          minimalDataset([{ ...minimalRow, [field]: '  ' }]),
          'LIVE',
        ),
      /SCMDB_BLUEPRINT_ROW_INVALID/,
      `blank ${field} must be rejected`,
    )
  }

  // An unexpected truthy value for a source flag is a contract change, not
  // something to interpret.
  assert.throws(
    () =>
      extractScmdbBlueprints(
        minimalManifest,
        minimalDataset([{ ...minimalRow, isDefault: 'yes' }]),
        'LIVE',
      ),
    /SCMDB_BLUEPRINT_ROW_INVALID/,
  )
})

test('rejects a duplicate source identity instead of collapsing it', () => {
  assert.throws(
    () =>
      extractScmdbBlueprints(
        minimalManifest,
        minimalDataset([minimalRow, { ...minimalRow, tag: 'BP_CRAFT_y' }]),
        'LIVE',
      ),
    /SCMDB_BLUEPRINT_DUPLICATE_GUID/,
  )
})

test('rejects a recipe that is absent, multi-tier or malformed', () => {
  const withTiers = tiers =>
    extractScmdbBlueprints(minimalManifest, minimalDataset([{ ...minimalRow, tiers }]), 'LIVE')

  assert.throws(() => withTiers(undefined), /SCMDB_BLUEPRINT_RECIPE_INVALID/)
  assert.throws(() => withTiers([]), /SCMDB_BLUEPRINT_RECIPE_INVALID/)
  assert.throws(
    () => withTiers([{ craftTimeSeconds: 1, slots: [] }, { craftTimeSeconds: 2, slots: [] }]),
    /SCMDB_BLUEPRINT_RECIPE_INVALID/,
  )
  assert.throws(() => withTiers([{ slots: [] }]), /SCMDB_BLUEPRINT_RECIPE_INVALID/)
  assert.throws(
    () => withTiers([{ craftTimeSeconds: 1, slots: [{ name: 'S' }] }]),
    /SCMDB_BLUEPRINT_RECIPE_INVALID/,
  )
  assert.throws(
    () =>
      withTiers([
        {
          craftTimeSeconds: 1,
          slots: [{ name: 'S', options: [{ type: 'resource', quantity: 1, minQuality: 0 }] }],
        },
      ]),
    /SCMDB_BLUEPRINT_RECIPE_INVALID/,
  )
  assert.throws(
    () =>
      withTiers([
        {
          craftTimeSeconds: 1,
          slots: [
            {
              name: 'S',
              options: [{ type: 'mystery', quantity: 1, minQuality: 0, resourceName: 'X' }],
            },
          ],
        },
      ]),
    /SCMDB_BLUEPRINT_RECIPE_INVALID/,
  )
})
