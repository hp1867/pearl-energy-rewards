// Pearl Energy wordmark + pearl-drop mark
export function PearlMark({ size = 34, light = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <defs>
        <radialGradient id="pearl" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="42%" stopColor={light ? '#cfe2ff' : '#4da3ff'} />
          <stop offset="100%" stopColor={light ? '#4da3ff' : '#0057b8'} />
        </radialGradient>
      </defs>
      {/* fuel-drop silhouette */}
      <path d="M24 3C24 3 8 21 8 31a16 16 0 1 0 32 0C40 21 24 3 24 3Z" fill="url(#pearl)" />
      <ellipse cx="18.5" cy="26" rx="5.5" ry="7" fill="#fff" opacity="0.55" />
      <circle cx="30" cy="35" r="2.4" fill="#fff" opacity="0.8" />
    </svg>
  )
}

export function BrandLogo({ light = false, size = 22 }) {
  const color = light ? '#fff' : 'var(--primary)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <PearlMark size={size + 12} light={light} />
      <div style={{ lineHeight: 1 }}>
        <div style={{ fontWeight: 700, fontSize: size, color, letterSpacing: '-0.02em' }}>
          Pearl Energy
        </div>
        <div style={{ fontSize: size * 0.4, fontWeight: 700, letterSpacing: '0.18em', color: light ? 'rgba(255,255,255,.7)' : 'var(--muted)', marginTop: 4, textTransform: 'uppercase' }}>
          Rewards
        </div>
      </div>
    </div>
  )
}
