# ARMOR_ENVIRONMENT implementation

## Included
- `scripts/armor-environment/apply_armor_environment_patch.py` updates only the `ARMOR_ENVIRONMENT` family in `scripts/audit/VECTOR_V5_RESOLVER_DEFINITION.json`.
- `scripts/armor-environment/validate_armor_environment.py` validates the config and the generated LIVE/PTU armor resolver outputs.

## Resolver contract
- Armor scope only.
- Temperature values must come from a matching temperature-resistance container.
- Min/max must be numeric siblings under the same parent and `min <= max`.
- Radiation values must come from a matching radiation-resistance container and be non-negative.
- Generic `min`, `max`, or `capacity` fields outside that scope remain rejected.
- Missing values stay `SOURCE_DATA_MISSING`; ambiguous candidates stay `REVIEW_REQUIRED`.
- No zero fallback.

## Apply and audit
Run from the repository root:

```bash
python scripts/armor-environment/apply_armor_environment_patch.py
python -m py_compile scripts/audit/vector_item_data_audit_v4_universal.py scripts/audit/vector_item_data_audit_v5_profiler.py
rm -rf vector-item-audit-v5
python scripts/audit/vector_item_data_audit_v5_profiler.py data/scmdb --config scripts/audit/VECTOR_V5_RESOLVER_DEFINITION.json --out vector-item-audit-v5
rm -rf data/audit-v5
mkdir -p data/audit-v5
cp -R vector-item-audit-v5/. data/audit-v5/
python scripts/armor-environment/validate_armor_environment.py .
```

## Acceptance gate
Do not mark an item stat as calculable unless its resolver status is `RESOLVED`. Keep `REVIEW_REQUIRED` and `SOURCE_DATA_MISSING` visible as unavailable/review states in the Fabricator.
