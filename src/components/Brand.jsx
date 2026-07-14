// Official Pearl Energy mark — the round "P" badge cropped from the logo
// downloaded from pearlenergy.com.au (public/pearl-logo.png, wordmark 942×211;
// the badge is the square at the left edge).
export function PearlMark({ size = 34, light = false }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
      background: '#fff', boxShadow: light ? '0 6px 20px rgba(0,20,60,0.35)' : '0 4px 14px rgba(0,40,90,0.2)',
    }}>
      <img src="/pearl-logo.png" alt="Pearl Energy"
        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'left center', display: 'block' }} />
    </div>
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
