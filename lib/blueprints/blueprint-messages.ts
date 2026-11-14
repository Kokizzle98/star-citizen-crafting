import type {
  BlueprintIssue,
  BlueprintOwnershipErrorCode,
  BlueprintOwnershipSuccessCode,
} from './blueprint-catalog-result'

// German UI texts for /vector/blueprints. Labels translate SCMDB category
// values for display only; unknown values are shown unchanged and nothing is
// corrected or reinterpreted.

export const BLUEPRINT_OWNERSHIP_ERROR_MESSAGES: Record<BlueprintOwnershipErrorCode, string> = {
  AUTH_REQUIRED: 'Deine Anmeldung ist nicht mehr gültig. Bitte melde dich erneut an.',
  BLUEPRINT_ID_INVALID: 'Der Blueprint konnte nicht eindeutig bestimmt werden.',
  BLUEPRINT_NOT_FOUND: 'Der Blueprint ist im Katalog nicht mehr vorhanden.',
  OWNERSHIP_ACTION_INVALID: 'Die Aktion ist ungültig.',
  OWNERSHIP_UPDATE_FAILED: 'Der Besitz konnte nicht gespeichert werden. Bitte versuche es erneut.',
}

export const BLUEPRINT_OWNERSHIP_SUCCESS_MESSAGES: Record<BlueprintOwnershipSuccessCode, string> = {
  OWNERSHIP_MARKED: 'als im Besitz markiert.',
  OWNERSHIP_UNMARKED: 'Markierung entfernt. Besitz ist nicht bekannt.',
}

export const BLUEPRINT_ISSUE_MESSAGES: Record<Exclude<BlueprintIssue, 'SOURCE_SUGGESTED_NAME'>, string> = {
  PRODUCT_NAME_MISSING: 'SCMDB liefert keinen Produktnamen.',
  CIG_DATA_ERROR: 'SCMDB meldet einen CIG-Datenfehler.',
  RECIPE_MISSING: 'SCMDB liefert kein Rezept.',
}

export function blueprintSuggestedNameMessage(suggestedName: string | null): string {
  return suggestedName
    ? `SCMDB schlägt den Namen „${suggestedName}“ vor (nicht übernommen).`
    : 'SCMDB schlägt einen anderen Namen vor (nicht übernommen).'
}

export const BLUEPRINT_CREW_NOTICES = {
  no_active_crew: 'Keine aktive Crew ausgewählt. Der Crew-Status ist nicht verfügbar; dein eigener Besitz funktioniert weiter.',
  not_allowed: 'Der Crew-Status für die aktive Crew ist nicht verfügbar. Dein eigener Besitz funktioniert weiter.',
  read_error: 'Der Crew-Status konnte nicht geladen werden. Dein eigener Besitz funktioniert weiter.',
} as const

export const BLUEPRINT_OWN_READ_ERROR =
  'Dein Blueprint-Besitz konnte nicht geladen werden. Der Katalog ist sichtbar, Besitz kann gerade nicht angezeigt oder geändert werden.'

export const BLUEPRINT_REVIEW_HELP =
  'Die Quelldaten dieses Blueprints sind unvollständig oder widersprüchlich. VECTOR zeigt sie unverändert an; Besitz kann trotzdem markiert werden.'

const GEAR_LABELS: Record<string, string> = {
  fpsgear: 'FPS-Ausrüstung',
  vehiclegear: 'Fahrzeugkomponenten',
  missionitems: 'Missionsgegenstände',
}

const TYPE_LABELS: Record<string, string> = {
  ammo: 'Munition',
  armour: 'Rüstung',
  cooler: 'Kühler',
  mininglaser: 'Mining-Laser',
  miningmodule: 'Mining-Modul',
  orepod: 'Erzbehälter',
  powerplant: 'Kraftwerk',
  quantumdrive: 'Quantenantrieb',
  radar: 'Radar',
  refuelling: 'Betankung',
  salvage: 'Bergung',
  shield: 'Schild',
  tractorbeam: 'Traktorstrahl',
  weapons: 'Waffen',
}

export const BLUEPRINT_NO_TYPE_LABEL = 'Ohne Typ'
export const BLUEPRINT_NO_MANUFACTURER_LABEL = 'Ohne Hersteller'

export function blueprintGearLabel(gear: string): string {
  return Object.hasOwn(GEAR_LABELS, gear) ? GEAR_LABELS[gear] : gear
}

export function blueprintTypeLabel(type: string | null): string {
  if (type === null) return BLUEPRINT_NO_TYPE_LABEL
  return Object.hasOwn(TYPE_LABELS, type) ? TYPE_LABELS[type] : type
}
