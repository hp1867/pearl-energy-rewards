import { motion } from 'framer-motion'
import { CreditCard, Star, MapPin, ArrowUpRight, Zap, Cookie, Droplet, Navigation, Target } from 'lucide-react'
import { useApp } from '../context/AppContext'
import Card3D from '../components/Card3D'
import MapView from '../components/MapView'
import { integrations } from '../config/integrations'
import { tierTheme } from '../theme/tiers'
import { hotDeals, tiers, streakRewards } from '../data/mockData'

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good Morning' : h < 18 ? 'Good Afternoon' : 'Good Evening'
}

const getWeekNumber = () => {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1)
  const diff = now - start + (start.getTimezoneOffset() - now.getTimezoneOffset()) * 60000
  const oneWeek = 604800000
  return Math.ceil((diff + start.getTimezoneOffset() * 60000) / oneWeek)
}

const DEAL_ICON = [Zap, Cookie, Droplet, Zap, Cookie]

export default function HomeScreen() {
  const { member, offers, stations, setTab, setOverlay, setOverlayArg, notify } = useApp()
  const mapsReady = integrations.maps.ready
  const nearest = stations[0]
  const openLocator = (id) => { setOverlayArg(id || null); setOverlay('locator') }

  // geographic pin positions for the faux mini-map
  const lats = stations.map((s) => s.lat), lngs = stations.map((s) => s.lng)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const fx = (s) => ((s.lng - minLng) / ((maxLng - minLng) || 1)) * 80 + 10
  const fy = (s) => (1 - (s.lat - minLat) / ((maxLat - minLat) || 1)) * 62 + 18

  const tier = tiers.find((t) => t.name === member.tier)
  const next = tiers[tiers.findIndex((t) => t.name === member.tier) + 1]
  const pct = next ? Math.min(100, ((member.points - tier.min) / (next.min - tier.min)) * 100) : 100
  const away = next ? next.min - member.points : 0
  const th = tierTheme(member.tier)

  // Weekly streak progress (only weekly, no daily)
  const weeklyFuel = member.weeklyFuelCount || 0
  const nextWeeklyReward = [...streakRewards].filter(r => r.type === 'weekly_fuel').sort((a, b) => a.trigger - b.trigger).find(r => weeklyFuel < r.trigger)
  const weeklyProgress = nextWeeklyReward ? (weeklyFuel / nextWeeklyReward.trigger) * 100 : 100

  return (
    <div className="screen">
      {/* Top app bar */}
      <header className="glass" style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', background: 'rgba(249,249,252,0.8)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--grad-blue)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: 15 }}>
            {member.firstName[0]}{member.lastName[0]}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>{greeting()},</div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary)' }}>{member.firstName}</h1>
          </div>
        </div>
        <button onClick={() => setOverlay('wallet')} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px', borderRadius: 999, background: 'var(--primary-container)', color: '#fff', fontWeight: 700, fontSize: 13, boxShadow: '0 6px 18px rgba(0,87,184,0.28)' }}>
          <CreditCard size={17} /> My Card
        </button>
      </header>

      <div className="scroll" style={{ paddingTop: 80 }}>
        {/* Points Card */}
        <div style={{ padding: '0 20px' }}>
          <Card3D intensity={6} glare onClick={() => setTab('rewards')}>
            <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 24, padding: 24, background: th.card, boxShadow: `0 16px 44px ${th.glow}`, border: '1px solid rgba(255,255,255,0.25)' }}>
              <div style={{ position: 'absolute', right: -40, top: -40, width: 140, height: 140, background: th.accent, borderRadius: '50%', filter: 'blur(40px)' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(115deg, transparent 38%, rgba(255,255,255,0.18) 50%, transparent 62%)', pointerEvents: 'none' }} />
              <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                <div>
                  <div className="label" style={{ color: th.sub }}>Pearl Rewards</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
                    <span style={{ fontSize: 48, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em', color: th.text }}>{member.points.toLocaleString()}</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: th.sub }}>pts</span>
                  </div>
                </div>
                <div className={th.shimmer ? 'gold-shimmer' : ''} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 999, ...th.badge }}>
                  <Star size={13} fill={th.badge.color} color={th.badge.color} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: th.badge.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{member.tier} Member</span>
                </div>
              </div>
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: th.sub }}>Progress to {next ? next.name : 'Max tier'}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: th.text }}>{next ? next.min.toLocaleString() : ''} pts</span>
                </div>
                <div style={{ width: '100%', height: 8, background: th.track, borderRadius: 999, overflow: 'hidden' }}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 1, ease: 'easeOut' }}
                    style={{ height: '100%', borderRadius: 999, background: th.fill }} />
                </div>
                <p style={{ fontSize: 12, color: th.sub, marginTop: 8, textAlign: 'center' }}>{next ? `${away.toLocaleString()} points away from next tier` : 'Top tier unlocked 🏆'}</p>
              </div>
            </div>
          </Card3D>
        </div>

        {/* Weekly Streak Card - underneath the points card */}
        <div style={{ padding: '0 20px', marginTop: 14 }}>
          <Card3D intensity={6} glare onClick={() => setOverlay('streaks')}>
            <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 24, padding: 24, background: th.card, boxShadow: `0 16px 44px ${th.glow}`, border: '1px solid rgba(255,255,255,0.25)' }}>
              <div style={{ position: 'absolute', right: -40, top: -40, width: 140, height: 140, background: th.accent, borderRadius: '50%', filter: 'blur(40px)' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(115deg, transparent 38%, rgba(255,255,255,0.18) 50%, transparent 62%)', pointerEvents: 'none' }} />
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                  <div>
                    <div className="label" style={{ color: th.sub }}>Weekly Streak</div>
                    <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.02em', color: th.text }}>{weeklyFuel} <span style={{ fontSize: 14, fontWeight: 500, color: th.sub }}>refuels</span></div>
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 999, background: th.badge.background, color: th.badge.color, border: th.badge.border }}>
                    <Target size={13} fill={th.badge.color} color={th.badge.color} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: th.badge.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Week {getWeekNumber()}</span>
                  </div>
                </div>
                
                {/* Weekly progress */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: th.sub }}>Progress to next reward</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: th.text }}>{nextWeeklyReward ? nextWeeklyReward.reward.label : 'Max rewards earned'}</span>
                </div>
                <div style={{ width: '100%', height: 8, background: th.track, borderRadius: 999, overflow: 'hidden' }}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, weeklyProgress)}%` }} transition={{ duration: 1, ease: 'easeOut' }}
                    style={{ height: '100%', borderRadius: 999, background: th.fill }} />
                </div>
                <p style={{ fontSize: 12, color: th.sub, marginTop: 8, textAlign: 'center' }}>
                  {nextWeeklyReward ? `${nextWeeklyReward.trigger - weeklyFuel} more refuels this week for ${nextWeeklyReward.reward.label}` : 'All weekly rewards claimed! 🏆'}
                </p>
              </div>
            </div>
          </Card3D>
        </div>

        {/* Featured Offers */}
        <div className="section-title"><h3>Featured Offers</h3><button onClick={() => setTab('offers')}>See all</button></div>
        <div className="h-scroll fade-mask">
          {offers.slice(0, 4).map((o) => (
            <div key={o.id} onClick={() => setTab('offers')} style={{ width: 280, borderRadius: 16, overflow: 'hidden', background: '#fff', border: '1px solid rgba(194,198,212,0.3)', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ height: 128, position: 'relative', background: `linear-gradient(135deg, ${o.accent}, ${o.accent}cc)`, display: 'flex', alignItems: 'flex-end', padding: 12 }}>
                <div style={{ position: 'absolute', right: 6, top: -10, fontSize: 96, opacity: 0.25 }}>{o.img}</div>
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.5), transparent)' }} />
                <span className="pill" style={{ position: 'relative', background: o.tag === 'NEW' ? 'var(--secondary-container)' : 'var(--error)', color: '#fff' }}>{o.tag}</span>
              </div>
              <div style={{ padding: 12 }}>
                <h4 style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)' }}>{o.title}</h4>
                <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>{o.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Hot Deals */}
        <div className="section-title"><h3>Hot Deals</h3><button onClick={() => setTab('menu')}>View All</button></div>
        <div className="h-scroll fade-mask">
          {hotDeals.map((d, i) => {
            const Icon = DEAL_ICON[i % DEAL_ICON.length]
            return (
              <div key={d.id} style={{ width: 140, background: '#fff', borderRadius: 12, padding: 12, border: '1px solid rgba(194,198,212,0.2)', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ position: 'relative', width: 80, height: 80, borderRadius: 8, background: 'var(--surface-low)', display: 'grid', placeItems: 'center', marginBottom: 12 }}>
                  <span style={{ position: 'absolute', top: -8, right: -8, background: 'var(--error)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 999 }}>-{d.off}%</span>
                  <span style={{ fontSize: 34 }}>{d.img}</span>
                </div>
                <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink)', textAlign: 'center', minHeight: 32 }}>{d.name}</p>
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--primary)' }}>{d.now}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)', textDecoration: 'line-through' }}>{d.was}</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Nearest Station — live per-store prices */}
        <div className="section-title"><h3>Nearest Station</h3><button onClick={() => setOverlay('fuel')}>Fuel prices</button></div>
        <div style={{ padding: '0 20px 12px' }}>
          <div onClick={() => openLocator(nearest.id)} style={{ background: '#fff', borderRadius: 16, border: '1px solid rgba(194,198,212,0.3)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
            <div style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--surface-variant)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(0,87,184,0.1)', display: 'grid', placeItems: 'center', color: 'var(--primary)' }}><MapPin size={20} /></div>
                <div>
                  <h4 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{nearest.name}</h4>
                  <p style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{nearest.city} • {nearest.open ? `Open · ${nearest.hours}` : 'Closed'}</p>
                </div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); notify('Opening directions…') }} style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--outline-variant)', display: 'grid', placeItems: 'center', color: 'var(--primary)' }}><ArrowUpRight size={18} /></button>
            </div>
            <div style={{ padding: 12, background: 'var(--surface-low)', display: 'flex', justifyContent: 'space-around' }}>
              {[['ULP 91', nearest.ulp91], ['PREMIUM 95', nearest.p95], ['DIESEL', nearest.diesel]].map(([k, v], idx) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                  {idx > 0 && <div style={{ width: 1, height: 32, background: 'rgba(194,198,212,0.5)', marginRight: 16 }} />}
                  <div style={{ textAlign: 'center', marginRight: idx < 2 ? 16 : 0 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.05em', marginBottom: 2 }}>{k}</p>
                    <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>{Number(v).toFixed(1)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* GPS station map — tap to explore the whole network */}
        <div className="section-title"><h3>Find a station</h3><button onClick={() => openLocator()}>View all</button></div>
        <div style={{ padding: '0 20px 4px' }}>
          <div onClick={() => openLocator()} style={{ position: 'relative', height: 200, borderRadius: 20, overflow: 'hidden', boxShadow: 'var(--shadow-md)', cursor: 'pointer', background: 'linear-gradient(160deg,#e6eef9 0%,#dde7f4 40%,#e9e2d6 100%)' }}>
            {mapsReady ? (
              <MapView stations={stations} activeId={nearest.id} onSelect={(s) => openLocator(s.id)} />
            ) : (
              <>
                <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.4 }}>
                  {[...Array(8)].map((_, i) => <line key={'h' + i} x1="0" y1={i * 28} x2="100%" y2={i * 28} stroke="#acc3e6" strokeWidth="1" />)}
                  {[...Array(8)].map((_, i) => <line key={'v' + i} x1={i * 52} y1="0" x2={i * 52} y2="100%" stroke="#acc3e6" strokeWidth="1" />)}
                </svg>
                {stations.map((s, i) => (
                  <div key={s.id} style={{ position: 'absolute', left: `${fx(s)}%`, top: `${fy(s)}%`, transform: 'translate(-50%,-100%)', color: i === 0 ? 'var(--primary)' : 'var(--blue)' }}>
                    <MapPin size={i === 0 ? 26 : 18} fill={i === 0 ? 'var(--primary)' : '#fff'} stroke={i === 0 ? '#fff' : 'var(--primary)'} strokeWidth={2} />
                  </div>
                ))}
              </>
            )}
            {/* overlays (don't block map gestures) */}
            <div style={{ position: 'absolute', left: 12, top: 12, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(6px)', padding: '7px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, color: 'var(--primary)', boxShadow: 'var(--shadow-sm)', pointerEvents: 'none' }}>
              <MapPin size={14} /> 170+ stores · NSW · VIC · QLD
            </div>
            <div style={{ position: 'absolute', right: 12, bottom: 12, display: 'flex', alignItems: 'center', gap: 6, background: 'var(--grad-blue)', color: '#fff', padding: '9px 14px', borderRadius: 999, fontSize: 13, fontWeight: 700, boxShadow: 'var(--shadow-blue)', pointerEvents: 'none' }}>
              <Navigation size={15} /> Open map
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
