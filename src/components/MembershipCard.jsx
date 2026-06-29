import Barcode from 'react-barcode'
import { QRCodeCanvas } from 'qrcode.react'
import { Star } from 'lucide-react'
import Card3D from './Card3D'
import { tierTheme } from '../theme/tiers'

export default function MembershipCard({ member }) {
  const t = tierTheme(member.tier)

  return (
    <div style={{ padding: '0 20px' }}>
      <Card3D intensity={10} glare>
        <div
          style={{
            position: 'relative', overflow: 'hidden', borderRadius: 20, padding: 24,
            display: 'flex', flexDirection: 'column', gap: 22, background: t.card,
            boxShadow: `0 16px 44px ${t.glow}`,
            border: '1px solid rgba(255,255,255,0.25)',
          }}
        >
          {/* decorative accents + diagonal sheen */}
          <div style={{ position: 'absolute', top: -40, right: -30, width: 150, height: 150, background: t.accent, filter: 'blur(40px)', borderRadius: '50%' }} />
          <div style={{ position: 'absolute', bottom: -50, left: -40, width: 160, height: 160, background: 'rgba(0,0,0,0.12)', filter: 'blur(46px)', borderRadius: '50%' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(115deg, transparent 38%, rgba(255,255,255,0.22) 50%, transparent 62%)', pointerEvents: 'none' }} />

          {/* header */}
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700, color: t.text, letterSpacing: '-0.02em' }}>Pearl Energy</div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', color: t.sub, marginTop: 3, textTransform: 'uppercase' }}>Rewards</div>
            </div>
            <div className={t.shimmer ? 'gold-shimmer' : ''} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 999, boxShadow: 'var(--shadow-sm)', ...t.badge }}>
              <Star size={14} fill={t.badge.color} color={t.badge.color} />
              <span style={{ fontSize: 12, fontWeight: 700, color: t.badge.color }}>{member.tier} Member</span>
            </div>
          </div>

          {/* user info */}
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 600, color: t.text }}>{member.firstName} {member.lastName[0]}.</div>
            <div style={{ fontFamily: 'monospace', fontSize: 16, letterSpacing: '0.18em', color: t.sub, marginTop: 4 }}>{member.membershipId}</div>
          </div>

          {/* codes panel (always light for scannability) */}
          <div style={{ position: 'relative', zIndex: 1, background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(255,255,255,0.7)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
              <Barcode value={member.membershipId.replace(/-/g, '')} height={56} width={1.9} displayValue={false} margin={0} background="transparent" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, width: '100%', justifyContent: 'center' }}>
              <div style={{ background: '#fff', padding: 5, borderRadius: 10, border: '1px solid var(--surface-variant)', boxShadow: 'var(--shadow-sm)' }}>
                <QRCodeCanvas value={`PEARL|${member.membershipId}|${member.points}`} size={72} level="M" />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)' }}>Scan at pump</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>or in-store</div>
              </div>
            </div>
          </div>
        </div>
      </Card3D>
    </div>
  )
}
