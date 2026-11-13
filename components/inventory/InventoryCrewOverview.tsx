import type { InventoryRow } from '@/lib/inventory/inventory-result'
import { playerOverview, qualityDistribution } from '@/lib/inventory/inventory-crew-overview'
import type { MaterialUnitsLike } from '@/lib/inventory/inventory-summary'
import { QualityTierChip } from '@/components/quality/QualityChip'
import { tierRangeLabel } from '@/lib/quality/tiers'

// Read-only crew overview (UX-4), Crew Inventory only. It uses the same rows
// as the list (after filtering) and has no buttons and no filter effect.
// SCU and pieces are never mixed; there is no overall average.
export function InventoryCrewOverview({ rows, units }: { rows: InventoryRow[]; units: MaterialUnitsLike }) {
  const distribution = qualityDistribution(rows, units)
  const players = playerOverview(rows)
  const notCounted = distribution.countMaterials + distribution.unknownUnitMaterials + distribution.withoutAverage
  const hints = [
    distribution.countMaterials > 0 ? `${distribution.countMaterials} Stückmaterial${distribution.countMaterials === 1 ? '' : 'ien'}` : null,
    distribution.unknownUnitMaterials > 0 ? `${distribution.unknownUnitMaterials} mit unbekannter Einheit` : null,
    distribution.withoutAverage > 0 ? `${distribution.withoutAverage} ohne Durchschnitt` : null,
  ].filter((hint): hint is string => hint !== null)

  return <section className="inventory-crew-overview" aria-label="Crew-Überblick">
    <section className="inventory-crew-overview__panel" aria-labelledby="crew-quality-heading">
      <h2 id="crew-quality-heading">Qualitätsverteilung</h2>
      <p className="inventory-crew-overview__note">
        Materialien (SCU) nach ihrer Durchschnittsqualität. Stückmaterialien und Materialien mit unbekannter Einheit zählen hier nicht mit{notCounted > 0 ? ` (${hints.join(', ')})` : ''}.
      </p>
      {distribution.counted === 0
        ? <p className="inventory-crew-overview__empty">Keine SCU-Materialien mit Durchschnitt.</p>
        : <ul className="inventory-crew-overview__tiers">
            {distribution.tiers.map(({ tier, materials }) => <li key={tier.id}>
              <QualityTierChip tier={tier} />
              <span className="quality-legend__range">Q{tierRangeLabel(tier)}</span>
              <strong>{materials} {materials === 1 ? 'Material' : 'Materialien'}</strong>
            </li>)}
          </ul>}
    </section>
    <section className="inventory-crew-overview__panel" aria-labelledby="crew-players-heading">
      <h2 id="crew-players-heading">Spieler</h2>
      {players.length === 0
        ? <p className="inventory-crew-overview__empty">Keine Lots.</p>
        : <ul className="inventory-crew-overview__players">
            {players.map(player => <li key={player.ownerUserId}>
              <span>{player.playerName}</span>
              <span>{player.lots} {player.lots === 1 ? 'Lot' : 'Lots'}</span>
              <span>{player.materials} {player.materials === 1 ? 'Material' : 'Materialien'}</span>
            </li>)}
          </ul>}
    </section>
  </section>
}
