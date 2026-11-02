export const INVENTORY_ERROR_MESSAGES = {
  AMOUNT_REQUIRED: 'Bitte eine Menge eingeben.',
  AMOUNT_INVALID_FORMAT:
    'Bitte eine gültige Menge eingeben. Dezimalwerte können mit Komma oder Punkt eingegeben werden.',
  AMOUNT_MUST_BE_POSITIVE:
    'Die Menge muss größer als 0 sein.',
  AMOUNT_NOT_INTEGER:
    'Stückmengen müssen als ganze Zahl eingegeben werden.',
  AMOUNT_NOT_EXACT_MICRO_SCU:
    'Die Menge kann nicht exakt in µSCU dargestellt werden. Bitte eine Menge mit ausreichender Genauigkeit eingeben.',
  AMOUNT_OUT_OF_RANGE:
    'Die eingegebene Menge liegt außerhalb des unterstützten Wertebereichs.',

  UNIT_REQUIRED:
    'Bitte eine Einheit auswählen.',
  UNIT_NOT_ALLOWED_FOR_MATERIAL_KIND:
    'Die ausgewählte Einheit ist für dieses Material nicht zulässig.',

  MATERIAL_REQUIRED:
    'Bitte ein Material auswählen.',
  MATERIAL_UNKNOWN:
    'Das ausgewählte Material ist nicht verfügbar.',
  MATERIAL_UNIT_UNKNOWN:
    'Für dieses Material ist keine eindeutige Mengeneinheit verfügbar. Der Lot kann deshalb nicht gespeichert werden.',

  QUALITY_REQUIRED:
    'Bitte eine Qualität eingeben.',
  QUALITY_INVALID:
    'Bitte eine gültige ganzzahlige Qualität eingeben.',
  QUALITY_OUT_OF_RANGE:
    'Die Qualität muss zwischen 0 und 1000 liegen.',

  LOCATION_REQUIRED:
    'Bitte eine Location auswählen.',
  LOCATION_INVALID:
    'Die ausgewählte Location ist nicht mehr verfügbar. Bitte eine andere Location auswählen.',

  AUTH_REQUIRED:
    'Deine Anmeldung ist nicht mehr gültig. Bitte melde dich erneut an.',
  ACTIVE_GROUP_REQUIRED:
    'Bitte wähle zuerst eine aktive Crew aus.',
  PLAYER_CONTEXT_REQUIRED:
    'Dein Spielerprofil konnte nicht eindeutig bestimmt werden. Der Lot wurde nicht gespeichert.',
  INSERT_NOT_ALLOWED:
    'Der Lot konnte aufgrund der Zugriffsregeln nicht gespeichert werden.',
  INSERT_FAILED:
    'Der Lot konnte nicht gespeichert werden. Bitte versuche es erneut.',
} as const

export const INVENTORY_SUCCESS_MESSAGES = {
  LOT_CREATED: 'Lot wurde zum Inventory hinzugefügt.',
} as const

export type InventoryErrorCode =
  keyof typeof INVENTORY_ERROR_MESSAGES

export type InventorySuccessCode =
  keyof typeof INVENTORY_SUCCESS_MESSAGES

export function getInventoryErrorMessage(
  code: InventoryErrorCode,
): string {
  return INVENTORY_ERROR_MESSAGES[code]
}

export function getInventorySuccessMessage(
  code: InventorySuccessCode,
): string {
  return INVENTORY_SUCCESS_MESSAGES[code]
}
