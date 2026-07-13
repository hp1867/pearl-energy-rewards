import { motion } from 'framer-motion'
import { Home, Tag, UtensilsCrossed, Award, User, ScanLine } from 'lucide-react'
import { useApp } from '../context/AppContext'

// Home · Offers · Menu · Rewards · Profile, with a floating Scan button.
const TABS = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'offers', label: 'Offers', icon: Tag },
  { id: 'menu', label: 'Menu', icon: UtensilsCrossed },
  { id: 'rewards', label: 'Rewards', icon: Award },
  { id: 'profile', label: 'Profile', icon: User },
]

export default function BottomNav() {
  const { tab, setTab, overlay, setOverlay } = useApp()

  return (
    <>
      {/* Scan floating action button */}
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => setOverlay('scan')}
        style={{
          position: 'absolute', right: 20, bottom: 92, zIndex: 41,
          width: 56, height: 56, borderRadius: '50%',
          background: 'var(--grad-blue)', color: '#fff',
          display: 'grid', placeItems: 'center',
          boxShadow: '0 12px 26px rgba(0,87,184,0.5)', border: '3px solid #fff',
        }}
        aria-label="Scan card"
      >
        <ScanLine size={24} />
      </motion.button>

      {/* zIndex 60: stays tappable above overlay panels (z 50) so users can
          always switch tabs from Find a Station, Fuel Prices, etc.; the
          full-screen scanner (z 80) still covers it. Tapping a tab also
          closes any open overlay. */}
      <nav
        className="glass"
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 60,
          display: 'flex', justifyContent: 'space-around', alignItems: 'center',
          height: 80, padding: '0 8px 14px',
          background: 'rgba(255,255,255,0.6)',
          borderTop: '1px solid rgba(255,255,255,0.4)',
          borderRadius: '14px 14px 0 0',
          boxShadow: '0 -8px 30px rgba(0,0,0,0.04)',
        }}
      >
        {TABS.map((t) => {
          const Icon = t.icon
          const active = tab === t.id && !overlay
          return (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setOverlay(null) }}
              style={{
                position: 'relative', flex: 1, maxWidth: 72,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                padding: '8px 0', borderRadius: 10,
                color: active ? 'var(--primary)' : 'var(--muted)',
              }}
            >
              {active && (
                <motion.span layoutId="nav-glow"
                  style={{ position: 'absolute', top: -14, width: 32, height: 4, borderRadius: '0 0 6px 6px', background: 'var(--primary)', boxShadow: '0 2px 8px rgba(0,64,139,0.5)' }} />
              )}
              <Icon size={23} strokeWidth={active ? 2.6 : 2} />
              <span style={{ fontSize: 11, fontWeight: active ? 700 : 500 }}>{t.label}</span>
            </button>
          )
        })}
      </nav>
    </>
  )
}
