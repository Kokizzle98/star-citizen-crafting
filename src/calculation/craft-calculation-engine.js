/**
 * VECTOR Generic Craft Calculation Engine
 * Version: VECTOR_CRAFT_CALC_V1
 * Pure, side-effect-free ES module.
 */

export const CALC_VERSION = 'VECTOR_CRAFT_CALC_V1';

export class CalculationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'CalculationError';
    this.code = code;
    this.details = details;
  }
}

const finite = (value, code, label) => {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new CalculationError(code, `${label} muss numerisch sein.`, { value });
  return number;
};

export function interpolateModifier(segment, quality) {
  const q = finite(quality, 'CALC_QUALITY_INVALID', 'Qualitaet');
  if (q < 0 || q > 1000) throw new CalculationError('CALC_QUALITY_OUT_OF_RANGE', 'Qualitaet muss zwischen 0 und 1000 liegen.', { quality: q });

  const startQuality = finite(segment.startQuality ?? segment.start_quality, 'CALC_MODIFIER_INVALID', 'startQuality');
  const endQuality = finite(segment.endQuality ?? segment.end_quality, 'CALC_MODIFIER_INVALID', 'endQuality');
  const modifierStart = finite(segment.modifierStart ?? segment.modifier_start, 'CALC_MODIFIER_INVALID', 'modifierStart');
  const modifierEnd = finite(segment.modifierEnd ?? segment.modifier_end, 'CALC_MODIFIER_INVALID', 'modifierEnd');

  if (endQuality < startQuality) throw new CalculationError('CALC_MODIFIER_INVALID', 'Quality-Intervall ist umgekehrt.', { startQuality, endQuality });
  if (q < startQuality || q > endQuality) throw new CalculationError('CALC_QUALITY_OUTSIDE_SEGMENT', 'Qualitaet liegt nicht im Modifier-Segment.', { quality: q, startQuality, endQuality });

  if (startQuality === endQuality) {
    if (modifierStart !== modifierEnd) throw new CalculationError('CALC_MODIFIER_INVALID', 'Ein Punktsegment darf keine Kurve enthalten.', { segment });
    return modifierStart;
  }

  const t = (q - startQuality) / (endQuality - startQuality);
  return modifierStart + t * (modifierEnd - modifierStart);
}

export function selectModifierSegment(segments, quality) {
  const q = finite(quality, 'CALC_QUALITY_INVALID', 'Qualitaet');
  const matches = (segments || []).filter(segment => {
    const start = Number(segment.startQuality ?? segment.start_quality);
    const end = Number(segment.endQuality ?? segment.end_quality);
    return q >= start && q <= end;
  });
  if (!matches.length) throw new CalculationError('CALC_MODIFIER_RANGE_GAP', 'Kein Modifier-Segment deckt die Qualitaet ab.', { quality: q });
  if (matches.length > 1) throw new CalculationError('CALC_MODIFIER_RANGE_OVERLAP', 'Mehrere Modifier-Segmente decken die Qualitaet ab.', { quality: q, matches: matches.length });
  return matches[0];
}

export function combineEffects(baseValue, effects, constraints = {}) {
  const base = finite(baseValue, 'CALC_BASELINE_INVALID', 'Baseline');
  const setEffects = effects.filter(effect => effect.operation === 'SET');
  if (setEffects.length > 1) throw new CalculationError('CALC_MULTIPLE_SET_MODIFIERS', 'Mehrere SET-Modifier fuer dieselbe Property sind unzulaessig.');

  let working = setEffects.length ? finite(setEffects[0].value, 'CALC_MODIFIER_INVALID', 'SET-Wert') : base;
  const additive = effects.filter(effect => effect.operation === 'ADDITIVE').reduce((sum, effect) => sum + finite(effect.value, 'CALC_MODIFIER_INVALID', 'Additiver Modifier'), 0);
  working += additive;

  const multiplicativeDelta = effects
    .filter(effect => effect.operation === 'MULTIPLICATIVE')
    .reduce((sum, effect) => sum + (finite(effect.value, 'CALC_MODIFIER_INVALID', 'Multiplikativer Modifier') - 1), 0);
  const combinedMultiplier = 1 + multiplicativeDelta;
  const unclampedValue = working * combinedMultiplier;

  let craftedValue = unclampedValue;
  if (constraints.minimumValue != null) craftedValue = Math.max(craftedValue, finite(constraints.minimumValue, 'CALC_CONSTRAINT_INVALID', 'minimumValue'));
  if (constraints.maximumValue != null) craftedValue = Math.min(craftedValue, finite(constraints.maximumValue, 'CALC_CONSTRAINT_INVALID', 'maximumValue'));

  return {
    baseValue: base,
    craftedValue,
    unclampedValue,
    wasClamped: craftedValue !== unclampedValue,
    combinedAdditive: additive,
    combinedMultiplier,
    absoluteDelta: craftedValue - base,
    percentDelta: base === 0 ? null : ((craftedValue - base) / Math.abs(base)) * 100
  };
}

function normalizeOperation(modifier) {
  if (modifier.operation) return String(modifier.operation).toUpperCase();
  return modifier.additive === true ? 'ADDITIVE' : 'MULTIPLICATIVE';
}

function groupByProperty(modifiers) {
  const grouped = new Map();
  for (const modifier of modifiers || []) {
    const propertyKey = modifier.propertyKey ?? modifier.property_key;
    if (!propertyKey) throw new CalculationError('CALC_MODIFIER_INVALID', 'Modifier ohne propertyKey.', { modifier });
    if (!grouped.has(propertyKey)) grouped.set(propertyKey, []);
    grouped.get(propertyKey).push(modifier);
  }
  return grouped;
}

function formatNumber(value, precision, locale = 'de-DE') {
  if (value == null) return '—';
  return Number(value).toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: precision });
}

export function calculateCraft(request) {
  const {
    channel = 'LIVE', gameVersion = '', blueprintId = '', productEntityClass = '',
    baselines = {}, modifiers = [], qualities = {}, statDefinitions = {}, locale = 'de-DE'
  } = request || {};

  const grouped = groupByProperty(modifiers);
  const stats = [];
  const warnings = [];
  let calculated = 0;

  for (const [propertyKey, propertyModifiers] of grouped.entries()) {
    const baseline = baselines[propertyKey];
    if (!baseline || baseline.status !== 'RESOLVED' || baseline.value == null) {
      const status = baseline?.status || 'SOURCE_UNAVAILABLE';
      stats.push({ propertyKey, status, baseValue: null, craftedValue: null, absoluteDelta: null, percentDelta: null, messageKey: 'fabricator.stat.sourceUnavailable' });
      warnings.push({ code: 'CALC_BASELINE_UNAVAILABLE', propertyKey, baselineStatus: status });
      continue;
    }

    const effects = [];
    for (const modifier of propertyModifiers) {
      const slotKey = String(modifier.slotKey ?? modifier.slot_index ?? modifier.slotIndex ?? '');
      const quality = qualities[slotKey] ?? modifier.quality;
      if (quality == null) throw new CalculationError('CALC_QUALITY_MISSING', `Qualitaet fuer Slot ${slotKey} fehlt.`, { propertyKey, slotKey });
      if (modifier.minimumQuality != null && Number(quality) < Number(modifier.minimumQuality)) {
        throw new CalculationError('CALC_MINIMUM_QUALITY_NOT_MET', 'Mindestqualitaet nicht erreicht.', { propertyKey, slotKey, quality, minimumQuality: modifier.minimumQuality });
      }
      const segment = modifier.segments ? selectModifierSegment(modifier.segments, quality) : modifier;
      effects.push({ operation: normalizeOperation(modifier), value: interpolateModifier(segment, quality), slotKey, quality: Number(quality) });
    }

    const definition = statDefinitions[propertyKey] || {};
    const result = combineEffects(baseline.value, effects, {
      minimumValue: definition.minimumValue,
      maximumValue: definition.maximumValue
    });
    const precision = definition.displayPrecision ?? 2;
    calculated += 1;
    stats.push({
      propertyKey,
      displayName: definition.displayName || propertyKey,
      status: 'RESOLVED',
      baseline,
      effects,
      operationSummary: {
        multiplicativeModifiers: effects.filter(x => x.operation === 'MULTIPLICATIVE').length,
        additiveModifiers: effects.filter(x => x.operation === 'ADDITIVE').length,
        combinedMultiplier: result.combinedMultiplier,
        combinedAdditive: result.combinedAdditive
      },
      ...result,
      display: {
        base: formatNumber(result.baseValue, precision, locale),
        crafted: formatNumber(result.craftedValue, precision, locale),
        delta: `${result.absoluteDelta >= 0 ? '+' : ''}${formatNumber(result.absoluteDelta, precision, locale)}`,
        percentDelta: result.percentDelta == null ? '—' : `${result.percentDelta >= 0 ? '+' : ''}${formatNumber(result.percentDelta, 2, locale)} %`
      }
    });
  }

  const status = !stats.length ? 'BLOCKED' : calculated === stats.length ? 'COMPLETE' : calculated > 0 ? 'PARTIAL' : 'BLOCKED';
  return { calculationVersion: CALC_VERSION, channel, gameVersion, blueprintId, productEntityClass, status, stats, warnings };
}
