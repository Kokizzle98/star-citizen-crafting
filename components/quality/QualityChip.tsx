import { QUALITY_TIERS, QUALITY_TIER_DISCLAIMER, tierFor, tierRangeLabel } from '@/lib/quality/tiers'

// Quality tier chip: the tier colour always appears together with the tier
// name as text, so colour alone never carries meaning (INVENTORY_UX_V1_1 5.1).
export function QualityChip({ quality }: { quality: number }) {
  const tier = tierFor(quality)
  return (
    <span className="quality-chip" style={{ color: tier.color, borderColor: tier.color }}>
      <span className="quality-chip__value">Q{quality}</span>
      <span className="quality-chip__tier">{tier.label}</span>
    </span>
  )
}

/** Legend with every tier and its range. */
export function QualityLegend() {
  return (
    <details className="quality-legend">
      <summary>Qualitätsstufen</summary>
      <ul>
        {QUALITY_TIERS.map(tier => (
          <li key={tier.id}>
            <span className="quality-chip" style={{ color: tier.color, borderColor: tier.color }}>
              <span className="quality-chip__tier">{tier.label}</span>
            </span>{' '}
            <span className="quality-legend__range">Q{tierRangeLabel(tier)}</span>
          </li>
        ))}
      </ul>
      <p className="quality-legend__note">{QUALITY_TIER_DISCLAIMER}</p>
    </details>
  )
}
