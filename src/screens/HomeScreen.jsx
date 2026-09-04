import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CreditCard, Star, MapPin, ArrowUpRight, Zap, Cookie, Droplet, Navigation, Target, Tag, X, Clock3, MoonStar } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { PearlMark } from '../components/Brand'
import Card3D from '../components/Card3D'
import MapView from '../components/MapView'
import { integrations } from '../config/integrations'
import { tierTheme } from '../theme/tiers'
import { hotDeals, tiers } from '../data/mockData'
import { MISSION_TARGET, MISSION_PRIZES } from '../services/localProvider'
import { formatMoney } from '../services/nightDeals'

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good Morning' : h < 18 ? 'Good Afternoon' : 'Good Evening'
}

const DEAL_ICON = [Zap, Cookie, Droplet, Zap, Cookie]

export default function HomeScreen() {
  const { member, offers, stations, nightDeals, setTab, setOverlay, setOverlayArg, notify } = useApp()
  const mapsReady = integrations.maps.ready
  const nearest = stations[0]
  const firstNightDeal = nightDeals[0]
  const firstNightStation = firstNightDeal && stations.find((station) => String(station.id) === String(firstNightDeal.stationId))
  const openLocator = (id) => { setOverlayArg(id || null); setOverlay('locator') }
  const openItem = (kind, item) => { setOverlayArg({ kind, item }); setOverlay('itemdetails') }

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
          <PearlMark size={40} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>{greeting()},</div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary)' }}>{member.firstName}</h1>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="home-header-action" aria-label="My Coupons" onClick={() => setOverlay('coupons')} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '9px 12px', borderRadius: 999, background: 'var(--secondary-container)', color: 'var(--primary)', fontWeight: 700, fontSize: 12, boxShadow: '0 4px 14px rgba(0,87,184,0.18)' }}>
            <Tag size={15} /><span>My Coupons</span>
          </button>
          <button className="home-header-action" aria-label="My Card" onClick={() => setOverlay('wallet')} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px', borderRadius: 999, background: 'var(--primary-container)', color: '#fff', fontWeight: 700, fontSize: 13, boxShadow: '0 6px 18px rgba(0,87,184,0.28)' }}>
            <CreditCard size={17} /><span>My Card</span>
          </button>
        </div>
      </header>

      <div className="scroll" style={{ paddingTop: 80 }}>
        {/* A single glanceable rewards surface replaces the two competing hero cards. */}
        <div className="home-glance-wrap">
          <Card3D intensity={4} glare className="home-glance-tilt">
            <section
              className="home-glance"
              aria-label="Rewards summary"
              style={{
                '--glance-bg': th.card,
                '--glance-text': th.text,
                '--glance-sub': th.sub,
                '--glance-accent': th.accent,
                '--glance-track': th.track,
                '--glance-fill': th.fill,
                '--glance-panel': th.dark ? 'rgba(255,255,255,.13)' : 'rgba(255,255,255,.48)',
                '--glance-panel-border': th.dark ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.58)',
                boxShadow: `0 14px 38px ${th.glow}`,
              }}
            >
              <span className="home-glance-orb" aria-hidden />

              <div className="home-glance-top">
                <button className="home-points-button" onClick={() => setTab('rewards')} aria-label={`View ${member.points.toLocaleString()} Pearl Rewards points`}>
                  <span className="home-glance-kicker">Available points</span>
                  <span className="home-points-value">
                    {member.points.toLocaleString()}
                    <small>pts</small>
                  </span>
                </button>

                <button
                  onClick={() => setOverlay('tiers')}
                  className={`home-tier-chip${th.shimmer ? ' gold-shimmer' : ''}`}
                  style={th.badge}
                  aria-label={`View ${member.tier} membership tier`}
                >
                  <Star size={13} fill={th.badge.color} color={th.badge.color} />
                  <span>{member.tier}</span>
                </button>
              </div>

              <button className="home-tier-progress" onClick={() => setOverlay('tiers')} aria-label={next ? `${away.toLocaleString()} lifetime points to ${next.name}` : 'Top membership tier reached'}>
                <span className="home-tier-progress-copy">
                  <span>{next ? `${away.toLocaleString()} pts to ${next.name}` : 'Top tier reached'}</span>
                  <strong>{Math.round(pct)}%</strong>
                </span>
                <span className="home-tier-track">
                  <motion.span initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} />
                </span>
              </button>

              <button className="home-mission-row" onClick={() => setShowMissionInfo(true)} aria-label={`Fuel mission: ${missionDone ? 'complete' : `${missionCount} of ${MISSION_TARGET} fill-ups`}. View details`}>
                <span className="home-mission-icon"><Target size={17} /></span>
                <span className="home-mission-copy">
                  <span className="home-mission-title">
                    {missionDone ? 'Surprise unlocked' : 'Fuel mission'}
                    <small>{missionDone ? 'Open prize' : '2 weeks'}</small>
                  </span>
                  <span className="home-mission-subtitle">
                    {missionDone
                      ? (missionPrize ? `${missionPrize.img} ${missionPrize.label} is ready` : 'Your mystery prize is ready')
                      : `${missionLeft} more fill-up${missionLeft === 1 ? '' : 's'} to unlock a surprise`}
                  </span>
                </span>
                <span className="home-mission-status" aria-hidden>
                  <span className="home-mission-count">{missionCount}/{MISSION_TARGET}</span>
                  <span className="home-mission-dots">
                    {[...Array(MISSION_TARGET)].map((_, i) => <span key={i} className={i < missionCount ? 'is-active' : ''} />)}
                  </span>
                </span>
              </button>
            </section>
          </Card3D>
        </div>

        {/* Spin & Win banner — spins are earned via qualifying shop purchases */}
        <div style={{ padding: '0 20px', marginTop: 14 }}>
          <button onClick={() => setOverlay('wheel')}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, borderRadius: 18, padding: '14px 16px', background: 'linear-gradient(135deg, #3b2f8f 0%, #5b4bd4 55%, #7c6cf0 100%)', color: '#fff', boxShadow: '0 10px 30px rgba(91,75,212,0.32)', textAlign: 'left' }}>
            <span style={{ fontSize: 26 }}>🎡</span>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontWeight: 800, fontSize: 14.5 }}>Spin & Win</span>
              <span style={{ display: 'block', fontSize: 11.5, opacity: 0.88, marginTop: 2 }}>
                {(member.wheelSpins || 0) > 0
                  ? `${member.wheelSpins} spin${member.wheelSpins === 1 ? '' : 's'} ready — tap to play!`
                  : 'Buy snacks, lollies, biscuits or bakery — or spend $50 — to earn a spin'}
              </span>
            </span>
            {(member.wheelSpins || 0) > 0 && (
              <span style={{ background: '#fff', color: '#5b4bd4', fontWeight: 800, fontSize: 12, padding: '4px 10px', borderRadius: 999 }}>{member.wheelSpins}</span>
            )}
          </button>
        </div>

        {/* Branch-managed, automatically expiring end-of-day food offers */}
        <div className="section-title"><h3>Tonight Only</h3><button onClick={() => setOverlay('nightdeals')}>See nearby</button></div>
        <div style={{ padding: '0 20px 4px' }}>
          <button onClick={() => setOverlay('nightdeals')} style={{ width: '100%', borderRadius: 20, overflow: 'hidden', textAlign: 'left', color: '#fff', background: 'linear-gradient(145deg,#52270c 0%,#9a4b0c 58%,#e78b17 100%)', boxShadow: '0 12px 34px rgba(154,75,12,.28)', position: 'relative' }}>
            <div style={{ position: 'absolute', width: 130, height: 130, borderRadius: '50%', right: -35, top: -50, background: 'rgba(255,213,132,.19)' }} />
            <div style={{ padding: '15px 16px 14px', display: 'flex', alignItems: 'center', gap: 13, position: 'relative' }}>
              <div style={{ width: 58, height: 58, flex: '0 0 58px', borderRadius: 16, background: 'rgba(255,255,255,.15)', display: 'grid', placeItems: 'center', fontSize: firstNightDeal ? 32 : 0 }}>
                {firstNightDeal?.img || <MoonStar size={28} />}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', opacity: .8 }}><Clock3 size={12} /> Fresh end-of-day specials</div>
                {firstNightDeal ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 4 }}>
                      <strong style={{ fontSize: 17, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{firstNightDeal.productName}</strong>
                      <strong style={{ fontSize: 18, color: '#ffe098' }}>{formatMoney(firstNightDeal.dealPriceCents)}</strong>
                    </div>
                    <div style={{ fontSize: 11.5, opacity: .86, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{firstNightDeal.quantityAvailable} left · {firstNightStation?.name || 'Pearl Energy'} · {nightDeals.length} live deal{nightDeals.length === 1 ? '' : 's'}</div>
                  </>
                ) : (
                  <>
                    <strong style={{ display: 'block', fontSize: 16, marginTop: 4 }}>No specials live right now</strong>
                    <span style={{ display: 'block', fontSize: 11.5, opacity: .86, marginTop: 3 }}>Check back when your local branch publishes tonight’s surplus.</span>
                  </>
                )}
              </div>
              <ArrowUpRight size={19} />
            </div>
            <div style={{ padding: '8px 16px', background: 'rgba(29,12,3,.22)', fontSize: 10.5, fontWeight: 650, position: 'relative' }}>While stocks last · disappears automatically at the manager’s cutoff</div>
          </button>
        </div>

        {/* Featured Offers */}
        <div className="section-title"><h3>Featured Offers</h3><button onClick={() => setTab('offers')}>See all</button></div>
        <div className="h-scroll fade-mask">
          {offers.slice(0, 4).map((o) => (
            <button key={o.id} className="tap-card" onClick={() => openItem('offer', o)} aria-label={`View offer: ${o.title}`} style={{ width: 280, borderRadius: 16, overflow: 'hidden', background: '#fff', border: '1px solid rgba(194,198,212,0.3)', boxShadow: 'var(--shadow-sm)', textAlign: 'left' }}>
              <div style={{ height: 128, position: 'relative', background: `linear-gradient(135deg, ${o.accent}, ${o.accent}cc)`, display: 'flex', alignItems: 'flex-end', padding: 12 }}>
                <div style={{ position: 'absolute', right: 6, top: -10, fontSize: 96, opacity: 0.25 }}>{o.img}</div>
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.5), transparent)' }} />
                <span className="pill" style={{ position: 'relative', background: o.tag === 'NEW' ? 'var(--secondary-container)' : 'var(--error)', color: '#fff' }}>{o.tag}</span>
              </div>
              <div style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <h4 style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)' }}>{o.title}</h4>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>{o.sub}</span>
                </span>
                <span className="mini-open-cue" aria-hidden><ArrowUpRight size={15} /></span>
              </div>
            </button>
          ))}
        </div>

        {/* Hot Deals */}
        <div className="section-title"><h3>Hot Deals</h3><button onClick={() => setTab('menu')}>View All</button></div>
        <div className="h-scroll fade-mask">
          {hotDeals.map((d, i) => {
            const Icon = DEAL_ICON[i % DEAL_ICON.length]
            return (
              <button key={d.id} className="tap-card" onClick={() => openItem('hot-deal', d)} aria-label={`View deal: ${d.name}`} style={{ width: 140, background: '#fff', borderRadius: 12, padding: 12, border: '1px solid rgba(194,198,212,0.2)', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'left' }}>
                <div style={{ position: 'relative', width: 80, height: 80, borderRadius: 8, background: 'var(--surface-low)', display: 'grid', placeItems: 'center', marginBottom: 12 }}>
                  <span style={{ position: 'absolute', top: -8, right: -8, background: 'var(--error)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 999 }}>-{d.off}%</span>
                  <span style={{ fontSize: 34 }}>{d.img}</span>
                </div>
                <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink)', textAlign: 'center', minHeight: 32 }}>{d.name}</p>
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--primary)' }}>{d.now}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)', textDecoration: 'line-through' }}>{d.was}</span>
                  <ArrowUpRight size={14} color="var(--primary)" />
                </div>
              </button>
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
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg, #f2709c22, #ff9a8b22)', display: 'grid', placeItems: 'center', fontSize: 16, flexShrink: 0 }}>{icon}</div>
                  <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.45, paddingTop: 7 }}>{text}</p>
                </div>
              ))}

              <div style={{ marginTop: 16, padding: 14, borderRadius: 16, background: 'linear-gradient(135deg, #fdeef3, #ffe6e2)', border: '1px solid #f9c6d4' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#c2416b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>One of these will be yours</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {MISSION_PRIZES.map((p) => (
                    <span key={p.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 999, background: '#fff', border: '1px solid #f9c6d4', fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>
                      {p.img} {p.label}
                    </span>
                  ))}
                </div>
                <p style={{ fontSize: 12, color: '#c2416b', marginTop: 10, lineHeight: 1.45 }}>
                  🤫 Which one? That's the surprise — your prize is drawn at random and revealed only the moment you complete the mission.
                </p>
              </div>

              <button onClick={() => setShowMissionInfo(false)}
                style={{ width: '100%', marginTop: 16, padding: 14, borderRadius: 14, background: 'linear-gradient(135deg, #b52e4c, #d2477a)', color: '#fff', fontWeight: 800, fontSize: 14, boxShadow: '0 8px 24px rgba(181,46,76,0.35)' }}>
                Challenge accepted 🔥
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
