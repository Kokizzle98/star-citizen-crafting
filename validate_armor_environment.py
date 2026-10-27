#!/usr/bin/env python3
import csv
import json
import sys
from collections import Counter
from pathlib import Path

FIELDS = {
    'armor_temperaturemin',
    'armor_temperaturemax',
    'armor_radiationdissipation',
    'armor_radiationcapacity',
}
ALLOWED = {'RESOLVED', 'SOURCE_DATA_MISSING', 'REVIEW_REQUIRED'}


def validate_config(root: Path):
    p = root / 'VECTOR_V5_RESOLVER_DEFINITION.json'
    data = json.loads(p.read_text(encoding='utf-8'))
    families = [x for x in data.get('resolverFamilies', []) if x.get('id') == 'ARMOR_ENVIRONMENT']
    assert len(families) == 1, 'ARMOR_ENVIRONMENT must exist exactly once'
    family = families[0]
    assert set(family.get('properties', [])) == FIELDS
    assert data.get('policy', {}).get('zeroFallback') is False
    print('CONFIG OK')


def validate_channel(root: Path, channel: str):
    csv_path = root / 'data' / 'audit-v5' / channel / 'armor_resolver.csv'
    if not csv_path.exists():
        raise AssertionError(f'Missing {csv_path}; run the V5 profiler first')
    counts = Counter()
    pairs = {}
    with csv_path.open(encoding='utf-8-sig', newline='') as fh:
        for row in csv.DictReader(fh):
            key = row.get('property_key')
            if key not in FIELDS:
                continue
            status = row.get('resolver_status')
            assert status in ALLOWED, f'Unexpected status {status!r}'
            counts[(key, status)] += 1
            entity = row.get('entity_class')
            if key in {'armor_temperaturemin', 'armor_temperaturemax'} and status == 'RESOLVED':
                pairs.setdefault(entity, {})[key] = json.loads(row.get('value_json') or 'null')
    for entity, values in pairs.items():
        if set(values) == {'armor_temperaturemin', 'armor_temperaturemax'}:
            assert values['armor_temperaturemin'] <= values['armor_temperaturemax'], entity
    print(channel.upper(), dict(sorted(counts.items())))


def main():
    root = Path(sys.argv[1] if len(sys.argv) > 1 else '.')
    validate_config(root)
    for channel in ('live', 'ptu'):
        validate_channel(root, channel)


if __name__ == '__main__':
    main()
