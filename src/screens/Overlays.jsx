import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  ChevronLeft, TrendingDown, TrendingUp, Navigation, Search, SlidersHorizontal, Crosshair,
  Smartphone, Wallet, Download, Share2, ScanLine, X, Coffee, Car, Banknote, UtensilsCrossed,
  Zap, Info, Tag, Star, Fuel, Bell,
} from 'lucide-react'
import Barcode from 'react-barcode'
import { QRCodeCanvas } from 'qrcode.react'
import { useApp } from '../context/AppContext'
import MembershipCard from '../components/MembershipCard'
import MapView from '../components/MapView'
import { integrations } from '../config/integrations'
import { enablePush } from '../firebase/messaging'
import { addToWallet } from '../services/wallet'
import { amenityFilters, transactions, stationFuelRows } from '../data/mockData'

const AMENITY_ICON = { Coffee, 'Car Wash': Car, ATM: Banknote, 'Hot Food': UtensilsCrossed, 'EV Charging': Zap }

function Shell({ title, children, dark = false }) {
  const { setOverlay } = useApp()
  return (
    <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 34 }}
      className="screen" style={{ background: dark ? 'var(--grad-blue-deep)' : 'var(--silver)', zIndex: 50 }}>
      <header className="glass" style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', background: dark ? 'transparent' : 'rgba(249,249,252,0.8)', color: dark ? '#fff' : 'var(--primary)' }}>
        <button onClick={() => setOverlay(null)} style={{ width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center', color: 'inherit' }}><ChevronLeft size={24} /></button>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'inherit' }}>{title}</h1>
        <div style={{ width: 40 }} />
      </header>
      <div className="scroll" style={{ paddingBottom: 30 }}>{children}</div>
    </motion.div>
  )
}

/* ---------------- Membership card / Wallet ---------------- */
export function WalletCard() {
  const { member, notify } = useApp()
  const wallet = async (p) => { const r = await addToWallet(p, member); notify(r.message) }
  return (
    <Shell title="Membership Card">
      <div style={{ marginTop: 8 }}><MembershipCard member={member} /></div>

      {/* stats grid */}
      <div style={{ padding: '16px 20px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow-sm)', border: '1px solid rgba(226,226,229,0.5)' }}>
          <div className="label" style={{ marginBottom: 4 }}>Current Points</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary)' }}>{member.points.toLocaleString()}</span>
            <span style={{ fontSize: 12, color: 'var(--secondary)' }}>pts</span>
          </div>
        </div>
        <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow-sm)', border: '1px solid rgba(226,226,229,0.5)' }}>
          <div className="label" style={{ marginBottom: 4 }}>Available Rewards</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary)' }}>3</span>
            <Tag size={18} color="var(--secondary-container)" fill="var(--secondary-container)" />
          </div>
        </div>
      </div>

      {/* wallet buttons */}
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="label" style={{ marginBottom: 2 }}>Add to phone wallet</div>
        <button onClick={() => wallet('apple')} className="btn dark"><Wallet size={20} /> Add to Apple Wallet</button>
        <button onClick={() => wallet('google')} className="btn ghost"><Wallet size={20} color="var(--primary)" /> Add to Google Wallet</button>
        <button onClick={() => wallet('samsung')} className="btn" style={{ background: '#1428a0', boxShadow: '0 8px 22px rgba(20,40,160,0.3)' }}><Wallet size={20} /> Add to Samsung Wallet</button>
      </div>
    </Shell>
  )
}

/* ---------------- Fuel prices ---------------- */
export function FuelPrices() {
  const { fuelPrices, stations, setOverlay, setOverlayArg } = useApp()
  return (
    <Shell title="Live Fuel Prices">
      <div style={{ padding: '8px 20px 0' }}>
        <div style={{ background: 'var(--grad-blue-deep)', borderRadius: 20, padding: 20, color: '#fff', marginBottom: 18, boxShadow: 'var(--shadow-blue)' }}>
          <div style={{ fontSize: 13, opacity: 0.85 }}>📍 Pearl Energy Penrith · cheapest near you</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
            <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-0.02em' }}>185.9</span>
            <span style={{ opacity: 0.85 }}>¢/L ULP 91</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {fuelPrices.map((f) => {
            const down = f.trend < 0
            return (
              <div key={f.code} style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', borderRadius: 16, padding: 16, boxShadow: 'var(--shadow-sm)', border: '1px solid rgba(226,226,229,0.5)' }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: `${f.color}1a`, display: 'grid', placeItems: 'center', color: f.color }}><Fuel size={22} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{f.code}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: down ? '#1e8e4e' : 'var(--error)', marginTop: 2 }}>
                    {down ? <TrendingDown size={14} /> : <TrendingUp size={14} />} {down ? '' : '+'}{f.trend.toFixed(2)} today
                  </div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--primary)' }}>${f.price.toFixed(3)}</div>
              </div>
            )
          })}
        </div>
        <h3 style={{ margin: '22px 2px 12px', fontSize: 20 }}>Compare nearby stations</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {stations.slice(0, 6).map((s) => (
            <button key={s.id} onClick={() => { setOverlayArg(s.id); setOverlay('locator') }} style={{ width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', borderRadius: 14, padding: 14, boxShadow: 'var(--shadow-sm)' }}>
              <div><div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</div><div style={{ fontSize: 12, color: 'var(--muted)' }}>{s.city}</div></div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--primary)' }}>{Number(s.ulp91).toFixed(1)}</div>
            </button>
          ))}
        </div>
      </div>
    </Shell>
  )
}

/* ---------------- Store locator ---------------- */
export function StoreLocator() {
  const { setOverlay, notify, stations, overlayArg } = useApp()
  const [activeId, setActiveId] = useState(() => (overlayArg && stations.some((s) => s.id === overlayArg) ? overlayArg : stations[0]?.id))
  const [filters, setFilters] = useState([])
  const [q, setQ] = useState('')
  const toggle = (a) => setFilters((f) => (f.includes(a) ? f.filter((x) => x !== a) : [...f, a]))

  const visible = stations.filter((s) =>
    filters.every((f) => (s.amenities || []).includes(f)) &&
    (!q || s.name.toLowerCase().includes(q.toLowerCase()) || (s.city || '').toLowerCase().includes(q.toLowerCase())))
  const active = stations.find((s) => s.id === activeId) || visible[0] || stations[0]
  const mapsReady = integrations.maps.ready
  const select = (s) => setActiveId(s.id)

  // position pins on the faux map by their real geography (so all stores spread out)
  const lats = visible.map((s) => s.lat), lngs = visible.map((s) => s.lng)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const fx = (s) => ((s.lng - minLng) / ((maxLng - minLng) || 1)) * 78 + 11
  const fy = (s) => (1 - (s.lat - minLat) / ((maxLat - minLat) || 1)) * 60 + 16

  return (
    <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 34 }}
      className="screen" style={{ zIndex: 50, overflow: 'hidden' }}>
      {/* map background */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg,#e6eef9 0%,#dde7f4 40%,#e9e2d6 100%)' }}>
        {mapsReady && <MapView stations={visible} activeId={active?.id} onSelect={select} />}
        {!mapsReady && (<>
        <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.4 }}>
          {[...Array(14)].map((_, i) => <line key={'h' + i} x1="0" y1={i * 60} x2="100%" y2={i * 60} stroke="#acc3e6" strokeWidth="1" />)}
          {[...Array(8)].map((_, i) => <line key={'v' + i} x1={i * 60} y1="0" x2={i * 60} y2="100%" stroke="#acc3e6" strokeWidth="1" />)}
          <path d="M-20 320 Q120 240 240 300 T460 270" stroke="#8fb3e6" strokeWidth="10" fill="none" opacity="0.55" />
        </svg>
        {/* pins (geographically placed) */}
        {visible.map((s) => {
          const on = active?.id === s.id
          return (
            <motion.button key={s.id} whileTap={{ scale: 0.85 }} onClick={() => select(s)}
              style={{ position: 'absolute', left: `${fx(s)}%`, top: `${fy(s)}%`, transform: 'translate(-50%,-100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: on ? 3 : 1, opacity: on ? 1 : 0.9 }}>
              <div style={{ background: on ? 'var(--primary)' : '#fff', color: on ? '#fff' : 'var(--primary)', border: on ? 'none' : '2px solid var(--primary)', borderRadius: '50%', padding: on ? 8 : 6, boxShadow: 'var(--shadow-md)' }}>
                <Fuel size={on ? 20 : 15} />
              </div>
              {on && <span style={{ marginTop: 4, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(4px)', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, color: 'var(--primary)', whiteSpace: 'nowrap', boxShadow: 'var(--shadow-sm)' }}>{s.name.replace('Pearl Energy ', '')}</span>}
            </motion.button>
          )
        })}
        </>)}
      </div>

      {/* top header overlay */}
      <header style={{ position: 'relative', zIndex: 20, padding: '50px 20px 16px', background: 'linear-gradient(to bottom, rgba(255,255,255,0.92), rgba(255,255,255,0.7) 60%, transparent)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 44 }}>
          <button onClick={() => setOverlay(null)} style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--surface)', boxShadow: 'var(--shadow-sm)', display: 'grid', placeItems: 'center', color: 'var(--primary)' }}><ChevronLeft size={24} /></button>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary)' }}>Store Locator</h1>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{stations.length} of 170+ stores</div>
          </div>
          <button onClick={() => notify('Filters')} style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--surface)', boxShadow: 'var(--shadow-sm)', display: 'grid', placeItems: 'center', color: 'var(--primary)' }}><SlidersHorizontal size={20} /></button>
        </div>
        <div style={{ position: 'relative' }}>
          <Search size={20} color="var(--muted)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search stores, suburbs or cities" style={{ width: '100%', background: 'var(--surface)', borderRadius: 12, padding: '13px 44px', border: '1px solid var(--outline-variant)', fontSize: 15, outline: 'none', boxShadow: 'var(--shadow-sm)' }} />
          <button onClick={() => notify('Locating you…')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 32, height: 32, borderRadius: '50%', display: 'grid', placeItems: 'center', color: 'var(--primary)' }}><Crosshair size={20} /></button>
        </div>
        <div className="h-scroll" style={{ padding: '0 0 2px' }}>
          <button className="chip active"><Fuel size={16} /> All Fuels</button>
          {amenityFilters.map((a) => { const Icon = AMENITY_ICON[a]; return <button key={a} className={`chip ${filters.includes(a) ? 'active' : ''}`} onClick={() => toggle(a)}><Icon size={16} /> {a}</button> })}
        </div>
      </header>

      {/* bottom sheet — selected store's own live prices */}
      {active && (
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 20, padding: '0 20px 100px' }}>
        <div className="glass" style={{ borderRadius: 24, padding: 24, position: 'relative', display: 'flex', flexDirection: 'column', gap: 16, background: 'rgba(255,255,255,0.9)' }}>
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 48, height: 5, borderRadius: 999, background: 'rgba(194,198,212,0.6)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 8 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>{active.name}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--primary)', fontWeight: 600 }}><Navigation size={14} /> {active.city}</span>
                <span style={{ color: 'var(--muted)' }}>•</span>
                <span style={{ color: active.open ? 'var(--secondary)' : 'var(--error)' }}>{active.open ? `Open · ${active.hours}` : 'Closed'}</span>
              </div>
            </div>
            <button onClick={() => notify('Opening directions…')} style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--primary-container)', color: '#fff', display: 'grid', placeItems: 'center', boxShadow: 'var(--shadow-md)' }}><Navigation size={20} fill="#fff" /></button>
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Live fuel prices · ¢/L</div>
          {/* per-station pricing grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {stationFuelRows.map((r) => (
              <div key={r.key} style={{ background: r.hl ? 'rgba(0,87,184,0.07)' : 'var(--surface-low)', borderRadius: 12, padding: 12, border: `1px solid ${r.hl ? 'rgba(0,87,184,0.25)' : 'rgba(194,198,212,0.3)'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', color: r.hl ? 'var(--primary)' : 'var(--ink-soft)' }}>{r.label}</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: r.hl ? 'var(--primary)' : 'var(--ink)' }}>{active[r.key] != null ? Number(active[r.key]).toFixed(1) : '—'}</span>
              </div>
            ))}
          </div>
          {/* amenities */}
          <div style={{ paddingTop: 12, borderTop: '1px solid rgba(194,198,212,0.2)', display: 'flex', gap: 16 }}>
            {(active.amenities || []).slice(0, 3).map((a) => { const Icon = AMENITY_ICON[a] || Info; return (
              <div key={a} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--surface-c)', display: 'grid', placeItems: 'center', color: 'var(--primary)' }}><Icon size={20} /></div>
                <span style={{ fontSize: 10, color: 'var(--ink-soft)' }}>{a}</span>
              </div>
            ) })}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--surface)', border: '1px solid var(--outline-variant)', display: 'grid', placeItems: 'center', color: 'var(--primary)', boxShadow: 'var(--shadow-sm)' }}><Info size={20} /></div>
              <span style={{ fontSize: 10, color: 'var(--primary)' }}>More</span>
            </div>
          </div>
        </div>
      </div>
      )}
    </motion.div>
  )
}

/* ---------------- Scan modal ---------------- */
export function ScanModal() {
  const { member, setOverlay } = useApp()
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="screen" style={{ background: 'rgba(8,16,32,.92)', zIndex: 80, alignItems: 'center', justifyContent: 'center', padding: 28 }}>
      <button onClick={() => setOverlay(null)} style={{ position: 'absolute', top: 50, right: 22, color: '#fff', width: 42, height: 42, borderRadius: 12, background: 'rgba(255,255,255,.14)', display: 'grid', placeItems: 'center' }}><X size={22} /></button>
      <div style={{ color: '#fff', textAlign: 'center', marginBottom: 26 }}>
        <ScanLine size={30} style={{ marginBottom: 8 }} />
        <h2 style={{ fontSize: 22 }}>Scan to earn points</h2>
        <p style={{ opacity: 0.7, marginTop: 6, fontSize: 14 }}>Show this at the Pearl Energy counter</p>
      </div>
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ background: '#fff', borderRadius: 24, padding: 26, position: 'relative' }}>
        <QRCodeCanvas value={`PEARL|${member.membershipId}|${member.points}`} size={210} level="H" />
        <motion.div animate={{ y: [0, 210, 0] }} transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
          style={{ position: 'absolute', left: 26, right: 26, height: 3, background: 'linear-gradient(90deg,transparent,#4da3ff,transparent)', borderRadius: 999, boxShadow: '0 0 12px var(--blue-glow)' }} />
      </motion.div>
      <div style={{ marginTop: 22, color: '#fff', fontFamily: 'monospace', letterSpacing: '0.2em' }}>{member.membershipId}</div>
    </motion.div>
  )
}

/* ---------------- Digital receipts ---------------- */
export function Receipts() {
  const { notify, member } = useApp()
  const list = member?.transactions?.length ? member.transactions : transactions
  return (
    <Shell title="Digital Receipts">
      <div style={{ padding: '8px 20px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {list.map((t) => (
          <div key={t.id} style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: 'var(--shadow-sm)', border: '1px solid rgba(226,226,229,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{t.store}</div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>{t.date} · {t.type}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 17, fontWeight: 700 }}>${t.amount.toFixed(2)}</div>
                <span className="pill" style={{ background: '#e7f7ee', color: '#1e8e4e' }}>+{t.points} pts</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
              <button onClick={() => notify('Receipt PDF downloaded')} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: 'var(--primary)', padding: 8 }}><Download size={16} /> PDF</button>
              <button onClick={() => notify('Sharing receipt…')} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: 'var(--primary)', padding: 8, borderLeft: '1px solid var(--line)' }}><Share2 size={16} /> Share</button>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  )
}

/* ---------------- Customer lookup (staff) ---------------- */
export function CustomerLookup() {
  const { lookupCustomer } = useApp()
  const [num, setNum] = useState('')
  const [state, setState] = useState({ status: 'idle', customer: null })

  const search = async () => {
    if (!num.trim()) return
    setState({ status: 'loading', customer: null })
    const c = await lookupCustomer(num)
    setState({ status: c ? 'found' : 'missing', customer: c })
  }

  return (
    <Shell title="Customer Lookup">
      <div style={{ padding: '8px 20px 0' }}>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 14 }}>Enter a customer number to fetch their full record from the database.</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, background: '#fff', borderRadius: 14, padding: '13px 16px', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--line)' }}>
            <Search size={18} color="var(--muted)" />
            <input value={num} onChange={(e) => setNum(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="e.g. 10042377" inputMode="numeric" style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, background: 'transparent' }} />
          </div>
          <button className="btn" style={{ width: 'auto', padding: '0 22px' }} onClick={search}>Fetch</button>
        </div>

        {state.status === 'loading' && <p style={{ textAlign: 'center', color: 'var(--muted)', marginTop: 28 }}>Searching…</p>}
        {state.status === 'missing' && <p style={{ textAlign: 'center', color: 'var(--error)', fontWeight: 600, marginTop: 28 }}>No customer found for #{num}</p>}

        {state.status === 'found' && state.customer && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 20, background: '#fff', borderRadius: 18, padding: 18, boxShadow: 'var(--shadow-md)', border: '1px solid rgba(226,226,229,0.6)' }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--grad-blue)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: 18 }}>{state.customer.firstName?.[0]}{state.customer.lastName?.[0]}</div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{state.customer.name}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Customer #{state.customer.customerNumber}</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
              {[['Points', state.customer.points?.toLocaleString()], ['Tier', state.customer.tier], ['Lifetime', state.customer.lifetimePoints?.toLocaleString()], ['Member ID', state.customer.membershipId]].map(([k, v]) => (
                <div key={k} style={{ background: 'var(--surface-low)', borderRadius: 12, padding: 12 }}>
                  <div className="label" style={{ marginBottom: 3 }}>{k}</div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--primary)' }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16, padding: 14, background: '#fff', borderRadius: 12, border: '1px solid var(--line)' }}>
              <QRCodeCanvas value={state.customer.qrData || `PEARL|${state.customer.membershipId}|${state.customer.customerNumber}`} size={120} level="M" />
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginTop: 10 }}>{state.customer.email} · {state.customer.mobile || 'no mobile on file'}</div>
          </motion.div>
        )}
      </div>
    </Shell>
  )
}

/* ---------------- Notifications ---------------- */
export function Notifications() {
  const { notifications, notify } = useApp()
  const enable = async () => { const r = await enablePush(); notify(r.message) }
  return (
    <Shell title="Notifications">
      <div style={{ padding: '8px 20px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button className="btn" onClick={enable}><Bell size={18} /> Enable push notifications</button>
        {notifications.map((n) => (
          <div key={n.id} style={{ display: 'flex', gap: 14, background: '#fff', borderRadius: 16, padding: 16, boxShadow: 'var(--shadow-sm)', border: '1px solid rgba(226,226,229,0.5)' }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: 'var(--surface-low)', display: 'grid', placeItems: 'center', fontSize: 22 }}>{n.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14.5 }}>{n.title}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 2 }}>{n.body}</div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>{n.time}</div>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  )
}
