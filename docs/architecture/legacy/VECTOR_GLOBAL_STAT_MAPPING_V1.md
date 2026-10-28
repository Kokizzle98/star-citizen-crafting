# VECTOR Global Stat Mapping v1

## Verbindliche Regeln

1. `property_key` aus SCMDB Blueprints ist der externe Schlüssel.
2. VECTOR verwendet denselben Schlüssel als kanonischen Import-Key, bis ein explizites internes Alias benötigt wird.
3. `VERIFIED` bedeutet: Datenpfad oder Poolbeziehung ist in den vorliegenden SCMDB-Daten direkt belegt.
4. `REVIEW_REQUIRED` bedeutet: Property ist belegt, aber Baseline-Pfad oder Transformationsformel ist noch nicht hinreichend verifiziert.
5. `UNRESOLVED` wird niemals als `0` gespeichert oder angezeigt.
6. Item-spezifische Overrides sind nur zulässig, wenn ein strukturelles Mapping nicht funktioniert.
7. Multiplikative und additive Blueprint-Modifikatoren bleiben getrennt.
8. Mehrere Fire Modes werden nicht gemittelt. VECTOR verwendet einen expliziten Fire-Mode-Resolver.
9. Recoil bleibt als Rohvektor erhalten. Eine Prozentanzeige darf erst nach bestätigter Kalibrierungsformel aktiviert werden.
10. Mining Equipment bleibt eine spezialisierte zusätzliche Quelle, nicht Ersatz für Crafting Items.

## Direkt verifizierte Zuordnungen

- `weapon_firerate` -> Fire-mode pool `fireRate`
- `weapon_spread` -> Fire-mode pool `spread`
- `armor_damagemitigation` -> Damage-resistance pool
- `crafter_dismantleefficiency` -> `dismantle.efficiency`

## Verifizierte Rohquellen, Formel noch offen

- `weapon_recoil_smoothness` -> `recoil.smoothTime`
- `weapon_recoil_handling` -> `recoil.maxFireTime`
- `weapon_recoil_kick` -> Recoil-Achsen `pitchMaxDeg`, `yawMaxDeg`, `rollMaxDeg`

## Globaler Property-Katalog

Die begleitende CSV enthält den gesamten in SCMDB vorliegenden Blueprint-Property-Katalog mit Quelle, Resolver, Transformation und Freigabestatus.

## Runtime-Verhalten

```text
Blueprint propertyKey
  -> Mapping suchen
  -> Baseline auflösen
  -> wenn VERIFIED: Delta berechnen
  -> wenn REVIEW_REQUIRED: Rohwert/Prüfstatus anzeigen
  -> wenn UNRESOLVED: CRAFT_STAT_BASELINE_MISSING
```
