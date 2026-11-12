// VECTOR-own generic category visuals for the Fabricator hero (F2, D5).
//
// These are neutral inline SVG line drawings made for VECTOR. They never
// claim to show the concrete product: the accessible name says that it is a
// category placeholder. No external image, no hotlink, no bitmap that could
// fail to load, and no UI mockup is used as a product image.

type Glyph = 'default' | 'powerplant' | 'quantum' | 'weapon' | 'armor' | 'cooler' | 'shield' | 'tractor' | 'mining'

const GLYPH_BY_CATEGORY: Record<string, Glyph> = {
  PowerPlant: 'powerplant',
  QuantumDrive: 'quantum',
  WeaponPersonal: 'weapon',
  WeaponGun: 'weapon',
  WeaponAttachment: 'weapon',
  ARMOR: 'armor',
  Cooler: 'cooler',
  Shield: 'shield',
  TractorBeam: 'tractor',
  SalvageHead: 'tractor',
  WeaponMining: 'mining',
  MiningModifier: 'mining',
}

export function fabricatorGlyph(categoryKey: string): Glyph {
  return GLYPH_BY_CATEGORY[categoryKey] ?? 'default'
}

function GlyphShape({ glyph }: { glyph: Glyph }) {
  switch (glyph) {
    case 'powerplant':
      return <g><rect x="34" y="40" width="52" height="40" rx="6" /><circle cx="60" cy="60" r="10" /><path d="M28 50h6M28 70h6M86 50h6M86 70h6" /></g>
    case 'quantum':
      return <g><ellipse cx="60" cy="60" rx="30" ry="14" /><circle cx="60" cy="60" r="7" /><path d="M24 60h-8M104 60h-8" /></g>
    case 'weapon':
      return <g><circle cx="60" cy="60" r="22" /><circle cx="60" cy="60" r="4" /><path d="M60 30v14M60 76v14M30 60h14M76 60h14" /></g>
    case 'armor':
      return <g><path d="M60 30c14 0 24 8 24 22v10c0 16-12 26-24 28-12-2-24-12-24-28V52c0-14 10-22 24-22z" /><path d="M44 56h32" /></g>
    case 'cooler':
      return <g><path d="M60 30v60M34 45l52 30M34 75l52-30" /><circle cx="60" cy="60" r="6" /></g>
    case 'shield':
      return <g><path d="M60 28l26 10v18c0 18-12 30-26 36-14-6-26-18-26-36V38z" /></g>
    case 'tractor':
      return <g><rect x="28" y="50" width="20" height="20" rx="3" /><path d="M48 54l40-12M48 66l40 12M88 42v36" /></g>
    case 'mining':
      return <g><path d="M60 32l22 28-22 28-22-28z" /><path d="M38 60h44M60 32v56" /></g>
    default:
      return <g><path d="M60 30l26 15v30L60 90 34 75V45z" /><path d="M60 30v60M34 45l52 30M86 45L34 75" /></g>
  }
}

export function FabricatorVisual({ categoryKey, categoryLabel, size = 'hero' }: {
  categoryKey: string
  categoryLabel: string
  size?: 'hero' | 'thumb'
}) {
  const glyph = fabricatorGlyph(categoryKey)
  return (
    <svg
      className={`fabricator-visual fabricator-visual--${size}`}
      viewBox="0 0 120 120"
      role="img"
      aria-label={`Platzhalter für ${categoryLabel} – kein Produktbild`}
      focusable="false"
    >
      <rect className="fabricator-visual__frame" x="4" y="4" width="112" height="112" rx="14" />
      <g className="fabricator-visual__glyph"><GlyphShape glyph={glyph} /></g>
    </svg>
  )
}
