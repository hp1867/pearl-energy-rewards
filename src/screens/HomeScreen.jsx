import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CreditCard, Star, MapPin, ArrowUpRight, Zap, Cookie, Droplet, Navigation, Target, Tag, X } from 'lucide-react'
import { useApp } from '../context/AppContext'
import Card3D from '../components/Card3D'
import MapView from '../components/MapView'
import { integrations } from '../config/integrations'
import { tierTheme } from '../theme/tiers'
import { hotDeals, tiers } from '../data/mockData'
import { MISSION_TARGET, MISSION_PRIZES } from '../services/localProvider'

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good Morning' : h < 18 ? 'Good Afternoon' : 'Good Evening'
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

  // Tier progress runs on LIFETIME points (tier never goes down when you spend)
  const tierIdx = Math.max(0, tiers.findIndex((t) => t.name === member.tier))
  const tier = tiers[tierIdx]
  const next = tiers[tierIdx + 1]
  const lifetime = member.lifetimePoints ?? member.points
  const pct = next ? Math.min(100, ((lifetime - tier.min) / (next.min - tier.min)) * 100) : 100
  const away = next ? Math.max(0, next.min - lifetime) : 0
  const th = tierTheme(member.tier)

  // 2-week Fuel Mission: fill up 4 times → a mystery prize, drawn at random on
  // completion. The prize stays secret until the target is hit — customers
  // chase the segments, not the numbers.
  const missionCount = Math.min(member.missionCount ?? 0, MISSION_TARGET)
  const missionDone = missionCount >= MISSION_TARGET
  const missionLeft = MISSION_TARGET - missionCount
  const missionPrize = member.missionPrize
  const [showMissionInfo, setShowMissionInfo] = useState(false)

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setOverlay('coupons')} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '9px 12px', borderRadius: 999, background: 'var(--secondary-container)', color: 'var(--primary)', fontWeight: 700, fontSize: 12, boxShadow: '0 4px 14px rgba(0,87,184,0.18)' }}>
            <Tag size={15} /> My Coupons
          </button>
          <button onClick={() => setOverlay('wallet')} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px', borderRadius: 999, background: 'var(--primary-container)', color: '#fff', fontWeight: 700, fontSize: 13, boxShadow: '0 6px 18px rgba(0,87,184,0.28)' }}>
            <CreditCard size={17} /> My Card
          </button>
        </div>
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
                <button onClick={(e) => { e.stopPropagation(); setOverlay('tiers') }} className={th.shimmer ? 'gold-shimmer' : ''}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 999, ...th.badge }}>
                  <Star size={13} fill={th.badge.color} color={th.badge.color} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: th.badge.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{member.tier} Member</span>
                </button>
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
                <p style={{ fontSize: 12, color: th.sub, marginTop: 8, textAlign: 'center' }}>{next ? `${away.toLocaleString()} lifetime pts to ${next.name} · tap your badge to see all tiers` : 'Immortal — the top tier. You are a legend 👑'}</p>
              </div>
            </div>
          </Card3D>
        </div>

        {/* Fuel Mission Card — 4 fill-ups in 2 weeks, chased as a segmented target.
            Same dimensions as the Points card; points reveal only on completion. */}
        <div style={{ padding: '0 20px', marginTop: 14 }}>
          <Card3D intensity={6} glare onClick={() => setShowMissionInfo(true)}>
            <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 24, padding: 24, background: 'linear-gradient(135deg, #065f56 0%, #0d9488 55%, #2dd4bf 100%)', color: '#fff', boxShadow: '0 16px 44px rgba(13,148,136,0.38)', border: '1px solid rgba(255,255,255,0.2)' }}>
              <div style={{ position: 'absolute', right: -40, top: -40, width: 140, height: 140, background: 'rgba(255,255,255,0.15)', borderRadius: '50%', filter: 'blur(40px)' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(115deg, transparent 38%, rgba(255, 255, 255, 0.18) 50%, transparent 62%)', pointerEvents: 'none' }} />
              <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                <div>
                  <div className="label" style={{ color: 'rgba(255,255,255,0.8)' }}>Fuel Mission</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
                    <span style={{ fontSize: 48, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em', color: '#fff' }}>{missionCount}<span style={{ fontSize: 26, fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>/{MISSION_TARGET}</span></span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.8)' }}>fill-ups</span>
                  </div>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 999, background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.35)' }}>
                  <Target size={13} fill="#fff" color="#fff" />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.04em' }}>2-Week Mission</span>
                </div>
              </div>
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.8)' }}>Fill up 4× at Pearl to complete</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{missionDone ? 'Complete! 🏆' : `${missionLeft} to go`}</span>
                </div>
                {/* 4 × 25% target segments with gaps — each fill-up lights one up */}
                <div style={{ display: 'flex', gap: 7 }}>
                  {[...Array(MISSION_TARGET)].map((_, i) => (
                    <div key={i} style={{ flex: 1, height: 16, borderRadius: 999, background: 'rgba(255,255,255,0.22)', border: '1px solid rgba(255,255,255,0.25)', overflow: 'hidden' }}>
                      {i < missionCount && (
                        <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.45, delay: 0.15 + i * 0.15, ease: 'easeOut' }}
                          style={{ width: '100%', height: '100%', borderRadius: 999, background: '#fff', boxShadow: '0 0 12px rgba(255,255,255,0.7)', transformOrigin: 'left', display: 'grid', placeItems: 'center' }}>
                          <span style={{ fontSize: 10, lineHeight: 1 }}>⛽</span>
                        </motion.div>
                      )}
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)', marginTop: 8, textAlign: 'center', fontWeight: missionDone ? 700 : 500 }}>
                  {missionDone
                    ? `🏆 Mission complete! Your surprise: ${missionPrize ? `${missionPrize.img} ${missionPrize.label}` : '🎁 mystery prize unlocked'}`
                    : `🎁 ${missionLeft} more fill-up${missionLeft === 1 ? '' : 's'} to unlock a surprise prize · tap for details`}
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

      {/* How the Fuel Mission works — popup with the mystery prize pool */}
      <AnimatePresence>
        {showMissionInfo && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowMissionInfo(false)}
            style={{ position: 'absolute', inset: 0, zIndex: 80, display: 'grid', placeItems: 'center', background: 'rgba(8,22,48,.45)', backdropFilter: 'blur(4px)', padding: 24 }}>
            <motion.div initial={{ scale: 0.85, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              onClick={(e) => e.stopPropagation()}
              style={{ background: '#fff', borderRadius: 24, padding: 24, width: '100%', maxWidth: 340, maxHeight: '80%', overflowY: 'auto', boxShadow: 'var(--shadow-md)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <h3 style={{ fontSize: 19, fontWeight: 800, color: 'var(--ink)' }}>🎯 Fuel Mission</h3>
                <button onClick={() => setShowMissionInfo(false)} style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--surface-low)', display: 'grid', placeItems: 'center', color: 'var(--muted)' }}><X size={16} /></button>
              </div>

              {[
                ['⛽', `Fill up ${MISSION_TARGET} times at any Pearl Energy station within 2 weeks.`],
                ['🔋', 'Every fill-up lights one segment on your mission card.'],
                ['🎁', 'Light all 4 — a surprise prize is unlocked instantly.'],
              ].map(([icon, text], i) => (
                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg, #0d948822, #2dd4bf22)', display: 'grid', placeItems: 'center', fontSize: 16, flexShrink: 0 }}>{icon}</div>
                  <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.45, paddingTop: 7 }}>{text}</p>
                </div>
              ))}

              <div style={{ marginTop: 16, padding: 14, borderRadius: 16, background: 'linear-gradient(135deg, #e6fffa, #d2f5ee)', border: '1px solid #a7e3d6' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#0f766e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>One of these will be yours</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {MISSION_PRIZES.map((p) => (
                    <span key={p.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 999, background: '#fff', border: '1px solid #a7e3d6', fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>
                      {p.img} {p.label}
                    </span>
                  ))}
                </div>
                <p style={{ fontSize: 12, color: '#0f766e', marginTop: 10, lineHeight: 1.45 }}>
                  🤫 Which one? That's the surprise — your prize is drawn at random and revealed only the moment you complete the mission.
                </p>
              </div>

              <button onClick={() => setShowMissionInfo(false)}
                style={{ width: '100%', marginTop: 16, padding: 14, borderRadius: 14, background: 'linear-gradient(135deg, #0d9488, #2dd4bf)', color: '#fff', fontWeight: 800, fontSize: 14, boxShadow: '0 8px 24px rgba(13,148,136,0.35)' }}>
                Challenge accepted 🔥
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
