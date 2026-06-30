import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Star, ArrowRight, CreditCard, Coffee, Fuel, UtensilsCrossed, ShoppingBag, Ticket, Flame } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { tiers } from '../data/mockData'

const CAT_ICON = { 'Free Coffee': Coffee, 'Fuel Discount': Fuel, 'Food Discount': UtensilsCrossed, Merchandise: ShoppingBag, 'Partner Rewards': Ticket }

export default function RewardsScreen() {
  const { member, rewards, redeemReward, setOverlay, notify } = useApp()
  const [burst, setBurst] = useState(false)
  const [cat, setCat] = useState('All')

  const cats = ['All', ...new Set(rewards.map((r) => r.cat))]
  const list = cat === 'All' ? rewards : rewards.filter((r) => r.cat === cat)

  const tier = tiers.find((t) => t.name === member.tier)
  const next = tiers[tiers.findIndex((t) => t.name === member.tier) + 1]
  const pct = next ? Math.min(100, ((member.points - tier.min) / (next.min - tier.min)) * 100) : 100
  const away = next ? next.min - member.points : 0

  const doRedeem = async (r) => { const ok = await redeemReward(r); if (ok.ok) { setBurst(true); setTimeout(() => setBurst(false), 1400) } }

  return (
    <div className="screen">
      {/* top app bar */}
      <header className="glass" style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', background: 'rgba(249,249,252,0.8)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--grad-blue)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: 12 }}>{member.firstName[0]}{member.lastName[0]}</div>
          <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary)' }}>Pearl Energy</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setOverlay('streaks')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 999, background: 'linear-gradient(135deg, #ff6b35, #f7931e)', color: '#fff', fontWeight: 700, fontSize: 12, boxShadow: '0 4px 14px rgba(255,107,53,0.4)' }}>
            <Flame size={14} /> Streaks
          </button>
          <button onClick={() => setOverlay('wallet')} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px', borderRadius: 999, background: 'var(--primary-container)', color: '#fff', fontWeight: 700, fontSize: 13, boxShadow: '0 6px 18px rgba(0,87,184,0.28)' }}><CreditCard size={17} /> My Card</button>
        </div>
      </header>

      <div className="scroll" style={{ paddingTop: 84 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink)', padding: '0 20px 16px' }}>Your Rewards</h1>

        {/* balance card */}
        <div style={{ padding: '0 20px' }}>
          <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 24, padding: 24, background: 'linear-gradient(135deg,#0057b8,#0060a9)', color: '#fff', boxShadow: '0 12px 40px rgba(0,87,184,0.15)' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(255,255,255,0.1), transparent)', pointerEvents: 'none' }} />
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div className="label" style={{ color: 'rgba(255,255,255,0.8)' }}>Available Balance</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 4 }}>
                    <span style={{ fontSize: 48, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em' }}>{member.points.toLocaleString()}</span>
                    <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.9)' }}>pts</span>
                  </div>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 999, background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.2)' }}>
                  <Star size={13} fill="#fff" color="#fff" />
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{member.tier} Tier</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'rgba(255,255,255,0.9)' }}>
                  <span style={{ fontSize: 12 }}>Distance to {next ? next.name : 'Max'}</span>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{next ? `${away.toLocaleString()} pts` : '★'}</span>
                </div>
                <div style={{ height: 8, width: '100%', background: 'rgba(255,255,255,0.2)', borderRadius: 999, overflow: 'hidden' }}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 1, ease: 'easeOut' }}
                    style={{ height: '100%', background: '#fff', borderRadius: 999, boxShadow: '0 0 10px rgba(255,255,255,0.5)' }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* category chips */}
        <div className="h-scroll" style={{ marginTop: 20 }}>
          {cats.map((c) => <button key={c} className={`chip ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
        </div>

        {/* reward cards */}
        <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {list.map((r) => {
            const Icon = CAT_ICON[r.cat] || Star
            return (
              <motion.div key={r.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(226,226,229,0.5)', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ height: 128, position: 'relative', background: `linear-gradient(135deg, ${r.color}, ${r.color}bb)`, display: 'grid', placeItems: 'center' }}>
                  <span style={{ fontSize: 60, opacity: 0.9 }}>{r.img}</span>
                  <div style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(249,249,252,0.9)', borderRadius: 999, padding: '5px 8px', display: 'grid', placeItems: 'center', boxShadow: 'var(--shadow-sm)' }}>
                    <Icon size={14} color="var(--primary)" />
                  </div>
                </div>
                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <h3 style={{ fontSize: 20, fontWeight: 600, color: 'var(--ink)' }}>{r.title}</h3>
                    <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--primary)', marginTop: 4 }}>{r.cost.toLocaleString()} pts</p>
                  </div>
                  <button onClick={() => doRedeem(r)}
                    style={{ width: '100%', padding: 12, borderRadius: 12, background: 'linear-gradient(90deg,#0057b8,#0060a9)', color: '#fff', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.2)' }}>
                    Redeem Now <ArrowRight size={18} />
                  </button>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* reward collection burst */}
      <AnimatePresence>
        {burst && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'absolute', inset: 0, zIndex: 70, display: 'grid', placeItems: 'center', background: 'rgba(8,22,48,.4)', backdropFilter: 'blur(3px)' }}>
            <motion.div initial={{ scale: 0.4, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 14 }}
              style={{ background: '#fff', borderRadius: 24, padding: '34px 30px', textAlign: 'center', boxShadow: 'var(--shadow-md)' }}>
              <motion.div animate={{ rotate: [0, -10, 10, 0] }} transition={{ repeat: 2, duration: 0.5 }} style={{ fontSize: 64 }}>🎉</motion.div>
              <h3 style={{ marginTop: 10, fontSize: 20 }}>Reward redeemed!</h3>
              <p style={{ color: 'var(--muted)', marginTop: 4, fontSize: 14 }}>Saved to your wallet</p>
            </motion.div>
            {[...Array(14)].map((_, k) => (
              <motion.div key={k} initial={{ x: 0, y: 0, opacity: 1 }}
                animate={{ x: (Math.random() - 0.5) * 320, y: (Math.random() - 0.5) * 520, opacity: 0, rotate: Math.random() * 360 }}
                transition={{ duration: 1.2, ease: 'easeOut' }} style={{ position: 'absolute', fontSize: 22 }}>{['⭐', '✨', '🎈', '💙'][k % 4]}</motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
