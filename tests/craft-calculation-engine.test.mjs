import assert from 'node:assert/strict';
import { calculateCraft, combineEffects, interpolateModifier, selectModifierSegment, CalculationError } from './craft-calculation-engine.js';

const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

// Glacier regression: additive deltas of multiplicative slot effects.
const glacier = calculateCraft({
  channel: 'LIVE', gameVersion: '4.10.2-live.12913470', blueprintId: 'BP_CRAFT_COOL_AEGS_S01_Glacier_SCItem',
  productEntityClass: '5748cdbc-5a26-477a-a4ad-b20a593bde59',
  baselines: {
    health_maxhealth: { status: 'RESOLVED', value: 230, sourcePath: 'items[1361].health' },
    itemresource_coolantgeneration: { status: 'RESOLVED', value: 38, sourcePath: 'items[1361].coolingRate' }
  },
  qualities: { shell: 934, coolant: 916, pump: 860 },
  modifiers: [
    { propertyKey: 'health_maxhealth', slotKey: 'shell', segments: [{ startQuality: 501, endQuality: 1000, modifierStart: 1, modifierEnd: 1.2 }] },
    { propertyKey: 'itemresource_coolantgeneration', slotKey: 'coolant', segments: [{ startQuality: 501, endQuality: 1000, modifierStart: 1, modifierEnd: 1.15 }] },
    { propertyKey: 'itemresource_coolantgeneration', slotKey: 'pump', segments: [{ startQuality: 501, endQuality: 1000, modifierStart: 1, modifierEnd: 1.05 }] }
  ],
  statDefinitions: {
    health_maxhealth: { displayPrecision: 0 },
    itemresource_coolantgeneration: { displayPrecision: 1 }
  }
});
assert.equal(glacier.status, 'COMPLETE');
const integrity = glacier.stats.find(x => x.propertyKey === 'health_maxhealth');
const cooling = glacier.stats.find(x => x.propertyKey === 'itemresource_coolantgeneration');
close(integrity.craftedValue, 230 * (1 + ((934 - 501) / 499) * 0.2));
close(cooling.craftedValue, 38 * (1 + ((916 - 501) / 499) * 0.15 + ((860 - 501) / 499) * 0.05));
assert.equal(integrity.display.crafted, '270');
assert.equal(cooling.display.crafted, '44,1');

// Additive and multiplicative ordering.
const mixed = combineEffects(100, [
  { operation: 'ADDITIVE', value: 10 },
  { operation: 'MULTIPLICATIVE', value: 1.2 },
  { operation: 'MULTIPLICATIVE', value: 0.95 }
]);
close(mixed.craftedValue, 110 * 1.15);

// Missing baseline produces PARTIAL, not zero.
const partial = calculateCraft({
  baselines: { a: { status: 'RESOLVED', value: 10 }, b: { status: 'SOURCE_UNAVAILABLE', value: null } },
  qualities: { x: 500 },
  modifiers: [
    { propertyKey: 'a', slotKey: 'x', startQuality: 0, endQuality: 1000, modifierStart: 0.9, modifierEnd: 1.1 },
    { propertyKey: 'b', slotKey: 'x', startQuality: 0, endQuality: 1000, modifierStart: 0.9, modifierEnd: 1.1 }
  ]
});
assert.equal(partial.status, 'PARTIAL');
assert.equal(partial.stats.find(x => x.propertyKey === 'b').craftedValue, null);

// Segment validation.
assert.equal(selectModifierSegment([{ startQuality: 0, endQuality: 500 }, { startQuality: 501, endQuality: 1000 }], 500).endQuality, 500);
assert.throws(() => selectModifierSegment([{ startQuality: 0, endQuality: 600 }, { startQuality: 500, endQuality: 1000 }], 550), e => e instanceof CalculationError && e.code === 'CALC_MODIFIER_RANGE_OVERLAP');
close(interpolateModifier({ startQuality: 0, endQuality: 1000, modifierStart: 0.8, modifierEnd: 1.2 }, 750), 1.1);

console.log('VECTOR Generic Craft Calculation Engine: all tests passed');
