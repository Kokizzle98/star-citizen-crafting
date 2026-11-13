import assert from 'node:assert/strict'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import ts from 'typescript'

const root = new URL('../', import.meta.url)
const load = async path => {
  const src = await readFile(new URL(path, root), 'utf8')
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
}
const { QUALITY_TIERS, tierFor, roundAverageQuality, tierForAverage, tierRangeLabel } = await load('lib/quality/tiers.ts')

test('tier boundaries', () => {
  const expected = [
    [0, 'SCRAP'], [499, 'SCRAP'],
    [500, 'STANDARD'], [750, 'STANDARD'],
    [751, 'BULK'], [850, 'BULK'],
    [851, 'PRODUCTION'], [950, 'PRODUCTION'],
    [951, 'PRIME'], [999, 'PRIME'],
    [1000, 'PERFECT'],
  ]
  for (const [quality, id] of expected) assert.equal(tierFor(quality).id, id, `Q${quality}`)
})

test('tiers cover 0 to 1000 without gaps or overlaps', () => {
  assert.equal(QUALITY_TIERS[0].min, 0)
  assert.equal(QUALITY_TIERS.at(-1).max, 1000)
  for (let i = 1; i < QUALITY_TIERS.length; i++) assert.equal(QUALITY_TIERS[i].min, QUALITY_TIERS[i - 1].max + 1)
  for (let q = 0; q <= 1000; q++) assert.ok(tierFor(q))
})

test('invalid input is rejected, not guessed', () => {
  for (const bad of [-1, 1001, 499.5, Number.NaN]) assert.throws(() => tierFor(bad), RangeError)
})

test('aggregates round to the nearest integer, halves up, before the tier', () => {
  assert.equal(roundAverageQuality(499.5), 500)
  assert.equal(tierForAverage(499.5).id, 'STANDARD')
  assert.equal(roundAverageQuality(499.49), 499)
  assert.equal(tierForAverage(499.49).id, 'SCRAP')
  assert.equal(tierForAverage(750.5).id, 'BULK')
  assert.equal(tierForAverage(999.5).id, 'PERFECT')
})

test('every tier has a name, a range label and a distinct colour', () => {
  const colours = new Set(QUALITY_TIERS.map(t => t.color))
  assert.equal(colours.size, QUALITY_TIERS.length)
  for (const t of QUALITY_TIERS) {
    assert.match(t.color, /^#[0-9a-f]{6}$/)
    assert.ok(t.label.length > 0)
    assert.ok(tierRangeLabel(t).length > 0)
  }
})

const { weightedQualityHalfUp, summarizeQuality } = await load('lib/quality/quality-weighting.ts')

test('weighted average (half up) reuses the weighting contract', () => {
  const parts = [
    { ref: 'a', quantity: 1n, quality: 499 },
    { ref: 'b', quantity: 1n, quality: 500 },
  ]
  assert.equal(weightedQualityHalfUp(parts), 500)
  assert.equal(summarizeQuality(parts).weightedQuality, 499, 'Fabricator keeps rounding down (D-F3-1)')
  assert.equal(weightedQualityHalfUp([]), null)
  assert.throws(() => weightedQualityHalfUp([{ ref: 'x', quantity: 0n, quality: 10 }]))
})

async function files(dir) {
  const out = []
  for (const e of await readdir(new URL(dir, root), { withFileTypes: true })) {
    const rel = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await files(rel)))
    else if (/\.(ts|tsx|css)$/.test(e.name)) out.push(rel)
  }
  return out
}

test('no tier boundary, tier name or tier colour is hard-coded outside the configuration', async () => {
  const all = [...(await files('app')), ...(await files('components')), ...(await files('lib'))]
    .filter(f => f !== join('lib', 'quality', 'tiers.ts'))
  const colours = QUALITY_TIERS.map(t => t.color)
  // 0 and 1000 are the overall quality range (validation), not tier boundaries.
  const compare = /\b(?:quality|q)\w*\s*(?:<=?|>=?|===?|!==?)\s*(?:499|500|750|751|850|851|950|951|999)\b/i
  const reverse = /\b(?:499|500|750|751|850|851|950|951|999)\s*(?:<=?|>=?|===?|!==?)\s*\w*quality/i
  const names = /['"`](?:SCRAP|STANDARD|BULK|PRODUCTION|PRIME|PERFECT)['"`]/
  for (const f of all) {
    const src = await readFile(new URL(f, root), 'utf8')
    assert.doesNotMatch(src, compare, `${f} compares quality with a tier boundary`)
    assert.doesNotMatch(src, reverse, `${f} compares quality with a tier boundary`)
    assert.doesNotMatch(src, names, `${f} hard-codes a tier name`)
    for (const colour of colours) assert.ok(!src.toLowerCase().includes(colour), `${f} hard-codes tier colour ${colour}`)
  }
})

test('quality chips always render the tier name next to the colour', async () => {
  const src = await readFile(new URL('components/quality/QualityChip.tsx', root), 'utf8')
  const chips = src.match(/className="quality-chip"[^>]*>[\s\S]*?<\/span>\s*<\/span>/g) ?? []
  assert.equal(chips.length, 2)
  for (const chip of chips) assert.match(chip, /quality-chip__tier/)
})

test('QualityChip renders a neutral hint for invalid values and never throws', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server')
  const React = (await import('react')).default
  // Transpile the real modules next to node_modules so their imports resolve.
  const dir = new URL('../node_modules/.cache/quality-chip-test/', import.meta.url)
  await mkdir(dir, { recursive: true })
  const emit = async (from, to, jsx) => {
    let js = ts.transpileModule(await readFile(new URL(from, root), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: jsx ? ts.JsxEmit.React : undefined },
    }).outputText
    js = js.replace(/from ['"]@\/lib\/quality\/(tiers|quality-weighting)['"]/g, "from './$1.mjs'")
    await writeFile(new URL(to, dir), js)
  }
  await emit('lib/quality/tiers.ts', 'tiers.mjs')
  await emit('lib/quality/quality-weighting.ts', 'quality-weighting.mjs')
  await emit('components/quality/QualityChip.tsx', 'chip.mjs', true)
  globalThis.React = React
  const { QualityChip } = await import(new URL('chip.mjs', dir).href)
  const render = quality => renderToStaticMarkup(React.createElement(QualityChip, { quality }))

  for (const bad of [Number.NaN, 1.5, -1, 1001, null, undefined, '500']) {
    const html = render(bad)
    assert.match(html, /Qualität unbekannt/, String(bad))
    assert.doesNotMatch(html, /Q-?\d|NaN|style=/, `no number or tier colour for ${String(bad)}`)
  }
  for (const [good, name] of [[0, 'Scrap'], [500, 'Standard'], [1000, 'Perfect']]) {
    const html = render(good)
    assert.match(html, new RegExp(`Q${good}`))
    assert.match(html, new RegExp(name))
    assert.match(html, /style="color:#/)
  }
})

test('displaying code uses QualityChip instead of plain Q values', async () => {
  for (const f of ['components/inventory/InventoryView.tsx', 'components/fabricator/FabricatorWorkspace.tsx', 'components/fabricator/FabricatorQuality.tsx']) {
    const src = await readFile(new URL(f, root), 'utf8')
    assert.match(src, /QualityChip/, f)
    assert.doesNotMatch(src, /<td>Q\{row\.quality\}<\/td>/, f)
    assert.doesNotMatch(src, /<strong>Q\{presetQuality\}<\/strong>/, f)
  }
})
