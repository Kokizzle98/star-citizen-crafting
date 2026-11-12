// German display labels for the Fabricator (F2). Labels are presentation only:
// they never create or change a product, family or material identity.

export type FabricatorCategoryKey = string

/** Category key from the SCMDB item attachType; all armor slots share one category. */
export function fabricatorCategoryKey(attachType: string | null): FabricatorCategoryKey {
  if (attachType === null) return 'UNKNOWN'
  if (attachType.startsWith('Char_Armor_')) return 'ARMOR'
  if (attachType.startsWith('Char_Clothing_')) return 'CLOTHING'
  return attachType
}

const CATEGORY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  ARMOR: 'Armor',
  CLOTHING: 'Kleidung',
  UNKNOWN: 'Ohne Item-Zuordnung',
  PowerPlant: 'Power Plant',
  Cooler: 'Cooler',
  Shield: 'Shield',
  QuantumDrive: 'Quantum Drive',
  Radar: 'Radar',
  WeaponGun: 'Schiffswaffe',
  WeaponPersonal: 'FPS-Waffe',
  WeaponAttachment: 'Waffenzubehör',
  WeaponMining: 'Mining-Laser',
  MiningModifier: 'Mining-Modul',
  TractorBeam: 'Traktorstrahl',
  SalvageHead: 'Salvage-Kopf',
  SalvageModifier: 'Salvage-Modul',
  Container: 'Container',
  DockingCollar: 'Docking Collar',
  Cargo: 'Fracht',
  Misc: 'Sonstiges',
})

/** Known categories get a German label; anything else shows the raw source value, never a guess. */
export function fabricatorCategoryLabel(key: FabricatorCategoryKey): string {
  return CATEGORY_LABELS[key] ?? key
}

export const FABRICATOR_SLOT_LABELS: Readonly<Record<string, string>> = Object.freeze({
  Helmet: 'Helm',
  Torso: 'Torso',
  Arms: 'Arme',
  Legs: 'Beine',
  Backpack: 'Rucksack',
  Undersuit: 'Undersuit',
})

export const FABRICATOR_MATERIAL_KIND_LABELS = Object.freeze({ RESOURCE: 'Ressource', ITEM: 'Item' })

export const FABRICATOR_CRAFTABILITY_LABELS = Object.freeze({
  AVAILABLE: 'Herstellbar',
  PARTIAL: 'Teilweise',
  UNAVAILABLE: 'Nicht verfügbar',
  UNRESOLVED: 'Nicht auflösbar',
  CREW_UNAVAILABLE: 'Crew-Bestand nicht verfügbar',
})

/** Non-colour status glyphs; the text label is always shown next to them. */
export const FABRICATOR_CRAFTABILITY_GLYPHS = Object.freeze({
  AVAILABLE: '●',
  PARTIAL: '◐',
  UNAVAILABLE: '○',
  UNRESOLVED: '⚠',
  CREW_UNAVAILABLE: '–',
})

export const FABRICATOR_REVIEW_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  FAMILY_NAME_CONFLICT: 'Die Quelldaten deuten eine Produktlinie an, die Produktnamen widersprechen ihr. Das Item wird daher einzeln angezeigt.',
  FAMILY_NAME_MISSING: 'Für eine Produktlinie fehlt in SCMDB ein Produktname. Das Item wird daher einzeln angezeigt.',
  ARMOR_TAG_UNSUPPORTED: 'Die Blueprint-Kennung hat keine unterstützte Set-Struktur. Das Item wird einzeln angezeigt.',
  ARMOR_SLOT_TOKEN_CONFLICT: 'Die Blueprint-Kennung widerspricht dem Slot des Items. Das Item wird einzeln angezeigt.',
  ARMOR_DUPLICATE_VARIANT_SLOT: 'Die Set-Struktur ist mehrdeutig. Das Item wird einzeln angezeigt.',
  MULTIPLE_BLUEPRINTS: 'Für dieses Item gibt es mehrere Blueprints. Bitte wähle den Blueprint selbst.',
  BLUEPRINT_OUTPUT_UNRESOLVED: 'Das hergestellte Item fehlt im SCMDB-Itemdatensatz.',
  PRODUCT_NAME_MISSING: 'Name fehlt in SCMDB, die Blueprint-Kennung wird angezeigt.',
})

export const FABRICATOR_RECIPE_ISSUE_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  RECIPE_SHAPE_INVALID: 'Das Rezept hat eine unbekannte Struktur.',
  RECIPE_TIER_COUNT_UNSUPPORTED: 'Das Rezept hat eine nicht unterstützte Anzahl an Stufen.',
  RECIPE_SLOT_OPTION_COUNT_UNSUPPORTED: 'Ein Rezept-Slot bietet mehrere Materialien zur Wahl; das wird noch nicht unterstützt.',
  RECIPE_MATERIAL_INVALID: 'Ein Material im Rezept ist ungültig.',
  RECIPE_MATERIAL_UNRESOLVED: 'Ein Material ist im LIVE-Materialverzeichnis nicht bekannt.',
  RECIPE_EMPTY: 'Das Rezept enthält keine Materialien.',
  MODIFIER_SHAPE_INVALID: 'Die Qualitätsmodifikatoren haben eine unbekannte Struktur.',
  MODIFIER_PROPERTY_UNKNOWN: 'Ein Qualitätsmodifikator verweist auf eine unbekannte Eigenschaft.',
})
