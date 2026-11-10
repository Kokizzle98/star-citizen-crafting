import type {
  ScmdbBlueprintDataset,
  ScmdbBlueprintRaw,
  ScmdbBlueprintRecipe,
  ScmdbBlueprintRecipeOption,
  ScmdbBlueprintRecipeSlot,
  ScmdbChannel,
} from './blueprint-types'

type ManifestChannel = {
  version: unknown
  files: {
    crafting_blueprints?: unknown
  }
}

type Manifest = {
  channels?: {
    live?: ManifestChannel
    ptu?: ManifestChannel
  }
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function nullableText(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null
  if (!nonempty(value)) return undefined
  return value
}

function optionalFlag(value: unknown): boolean | undefined {
  if (value === null || value === undefined) return false
  if (value === true) return true
  return undefined
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function recipeOption(input: unknown): ScmdbBlueprintRecipeOption {
  if (!plainObject(input)) throw new Error('SCMDB_BLUEPRINT_RECIPE_INVALID')

  const quantity = input.quantity
  const minQuality = input.minQuality

  if (
    !finiteNumber(quantity) ||
    quantity <= 0 ||
    !finiteNumber(minQuality) ||
    minQuality < 0
  ) {
    throw new Error('SCMDB_BLUEPRINT_RECIPE_INVALID')
  }

  if (input.type === 'resource' && nonempty(input.resourceName)) {
    return { kind: 'RESOURCE', name: input.resourceName, quantity, minQuality }
  }

  if (input.type === 'item' && nonempty(input.itemName)) {
    return { kind: 'ITEM', name: input.itemName, quantity, minQuality }
  }

  throw new Error('SCMDB_BLUEPRINT_RECIPE_INVALID')
}

/**
 * A slot is a required ingredient position. A slot without any option has no
 * usable ingredient, so the recipe is malformed and fails closed instead of
 * letting an otherwise clean blueprint pass as `VALID`.
 */
function recipeSlot(input: unknown): ScmdbBlueprintRecipeSlot {
  if (
    !plainObject(input) ||
    !nonempty(input.name) ||
    !Array.isArray(input.options) ||
    input.options.length === 0
  ) {
    throw new Error('SCMDB_BLUEPRINT_RECIPE_INVALID')
  }

  return { name: input.name, options: input.options.map(recipeOption) }
}

/**
 * SCMDB models the recipe as a tier list. Every observed blueprint carries
 * exactly one tier. More than one tier is a source contract change rather than
 * something to interpret, so it fails closed instead of silently using the
 * first entry.
 */
function recipe(input: unknown): ScmdbBlueprintRecipe {
  if (!Array.isArray(input) || input.length !== 1) {
    throw new Error('SCMDB_BLUEPRINT_RECIPE_INVALID')
  }

  const tier = input[0]

  if (!plainObject(tier) || !finiteNumber(tier.craftTimeSeconds) || tier.craftTimeSeconds < 0) {
    throw new Error('SCMDB_BLUEPRINT_RECIPE_INVALID')
  }

  if (!Array.isArray(tier.slots)) throw new Error('SCMDB_BLUEPRINT_RECIPE_INVALID')

  return {
    craftTimeSeconds: tier.craftTimeSeconds,
    slots: tier.slots.map(recipeSlot),
  }
}

/**
 * Reads the blueprint catalog of exactly one channel.
 *
 * The channel is never mixed: the manifest version of the requested channel
 * must equal the dataset version, and no value is ever taken from the other
 * channel as a substitute (VECTOR_VERSIONING_V1_1, AGENTS.md working rules).
 */
export function extractScmdbBlueprints(
  manifestInput: unknown,
  datasetInput: unknown,
  channel: ScmdbChannel,
): ScmdbBlueprintDataset {
  if (!plainObject(manifestInput)) {
    throw new Error('SCMDB_BLUEPRINT_MANIFEST_INVALID')
  }

  const manifest = manifestInput as Manifest
  const channelKey = channel.toLowerCase() as 'live' | 'ptu'
  const channelManifest = manifest.channels?.[channelKey]

  if (
    !channelManifest ||
    !nonempty(channelManifest.version) ||
    !nonempty(channelManifest.files?.crafting_blueprints)
  ) {
    throw new Error('SCMDB_BLUEPRINT_MANIFEST_INVALID')
  }

  if (!plainObject(datasetInput)) {
    throw new Error('SCMDB_BLUEPRINT_DATASET_INVALID')
  }

  if (datasetInput.version !== channelManifest.version) {
    throw new Error('SCMDB_BLUEPRINT_VERSION_MISMATCH')
  }

  if (!Array.isArray(datasetInput.blueprints)) {
    throw new Error('SCMDB_BLUEPRINT_DATASET_INVALID')
  }

  const blueprints: ScmdbBlueprintRaw[] = []
  const seen = new Set<string>()

  for (const entry of datasetInput.blueprints) {
    if (!plainObject(entry)) throw new Error('SCMDB_BLUEPRINT_ROW_INVALID')

    const productName = nullableText(entry.productName)
    const type = nullableText(entry.type)
    const subtype = nullableText(entry.subtype)
    const manufacturer = nullableText(entry.manufacturer)
    const suggestedName = nullableText(entry.suggestedName)
    const isDefault = optionalFlag(entry.isDefault)
    const cigDataError = optionalFlag(entry.cigDataError)

    if (
      !nonempty(entry.guid) ||
      !nonempty(entry.tag) ||
      !nonempty(entry.productEntityClass) ||
      !nonempty(entry.gear) ||
      productName === undefined ||
      type === undefined ||
      subtype === undefined ||
      manufacturer === undefined ||
      suggestedName === undefined ||
      isDefault === undefined ||
      cigDataError === undefined
    ) {
      throw new Error('SCMDB_BLUEPRINT_ROW_INVALID')
    }

    if (seen.has(entry.guid)) throw new Error('SCMDB_BLUEPRINT_DUPLICATE_GUID')
    seen.add(entry.guid)

    blueprints.push({
      sourceGuid: entry.guid,
      sourceTag: entry.tag,
      productEntityClass: entry.productEntityClass,
      productName,
      gear: entry.gear,
      type,
      subtype,
      manufacturer,
      recipe: recipe(entry.tiers),
      scmdbIsDefault: isDefault,
      scmdbCigDataError: cigDataError,
      scmdbSuggestedName: suggestedName,
    })
  }

  blueprints.sort((a, b) => a.sourceGuid.localeCompare(b.sourceGuid))

  return {
    channel,
    version: channelManifest.version,
    sourceFile: channelManifest.files.crafting_blueprints,
    blueprints,
  }
}
