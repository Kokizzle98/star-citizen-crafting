#!/usr/bin/env python3
import json
from pathlib import Path

CONFIG = Path('VECTOR_V5_RESOLVER_DEFINITION.json')
FAMILY_ID = 'ARMOR_ENVIRONMENT'

ARMOR_ENVIRONMENT = {
    'id': FAMILY_ID,
    'properties': [
        'armor_temperaturemin',
        'armor_temperaturemax',
        'armor_radiationdissipation',
        'armor_radiationcapacity'
    ],
    'scope': {
        'itemType': ['armor'],
        'pathTokens': [
            'environment', 'temperature', 'radiation',
            'resistance', 'protection'
        ]
    },
    'pairRules': [
        [
            'armor_temperaturemin',
            'armor_temperaturemax'
        ]
    ],
    'candidateLeaves': {
        'armor_temperaturemin': [
            'armor_temperaturemin', 'min', 'minimum',
            'temperatureMin', 'minTemperature', 'minOperatingTemperature'
        ],
        'armor_temperaturemax': [
            'armor_temperaturemax', 'max', 'maximum',
            'temperatureMax', 'maxTemperature', 'maxOperatingTemperature'
        ],
        'armor_radiationdissipation': [
            'dissipation', 'dissipationRate', 'radiationDissipation'
        ],
        'armor_radiationcapacity': [
            'capacity', 'maxCapacity', 'radiationCapacity'
        ]
    },
    'acceptance': (
        'Accept only numeric candidates below an armor-scoped '
        'temperatureResistance or radiationResistance container. '
        'Temperature min/max must be numeric siblings under the same parent; '
        'min must be <= max. Radiation dissipation/capacity must be non-negative. '
        'Reject generic min/max/capacity values outside the matching semantic '
        'container and never use a zero fallback.'
    ),
    'output': 'scalar_family'
}


def main():
    if not CONFIG.exists():
        raise SystemExit(f'Missing {CONFIG}. Run this script from the repository root.')
    data = json.loads(CONFIG.read_text(encoding='utf-8'))
    families = data.setdefault('resolverFamilies', [])
    matches = [i for i, family in enumerate(families) if family.get('id') == FAMILY_ID]
    if len(matches) > 1:
        raise SystemExit(f'Duplicate resolver family: {FAMILY_ID}')
    if matches:
        families[matches[0]] = ARMOR_ENVIRONMENT
    else:
        families.insert(0, ARMOR_ENVIRONMENT)
    policy = data.setdefault('policy', {})
    policy['missingValue'] = 'SOURCE_DATA_MISSING'
    policy['multipleCandidates'] = 'REVIEW_REQUIRED'
    policy['singleVerifiedCandidate'] = 'RESOLVED'
    policy['zeroFallback'] = False
    policy['preserveStructuredValues'] = True
    CONFIG.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Updated {CONFIG}: {FAMILY_ID}')


if __name__ == '__main__':
    main()
