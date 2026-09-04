import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, Clock3, LocateFixed, MapPin, Navigation, PackageCheck, ShieldCheck } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { formatMoney, rankNightDeals, timeRemainingLabel } from '../services/nightDeals'

const timeFormatter = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'Australia/Sydney', hour: 'numeric', minute: '2-digit',
})

function cutoffLabel(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'the listed closing time' : timeFormatter.format(date)
}

function DealCard({ deal, nearest, onStation }) {
  const discount = Math.max(0, Math.round((1 - deal.dealPriceCents / deal.originalPriceCents) * 100))
  return (
    <article style={{ background: '#fff', borderRadius: 20, overflow: 'hidden', border: nearest ? '1.5px solid #f59e0b' : '1px solid rgba(194,198,212,.35)', boxShadow: nearest ? '0 12px 34px rgba(217,119,6,.16)' : 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', gap: 14, padding: 16 }}>
        <div style={{ width: 78, height: 78, flex: '0 0 78px', borderRadius: 17, display: 'grid', placeItems: 'center', fontSize: 42, background: 'linear-gradient(145deg,#fff7df,#ffe2a8)', position: 'relative' }}>
          {deal.img || '🥧'}
          <span style={{ position: 'absolute', right: -7, top: -7, background: '#d9480f', color: '#fff', fontSize: 10, fontWeight: 800, borderRadius: 999, padding: '4px 7px' }}>-{discount}%</span>
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <div>
              {nearest && <div style={{ color: '#b45309', fontSize: 10, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 3 }}>Closest deal</div>}
              <h3 style={{ fontSize: 17, color: 'var(--ink)', lineHeight: 1.15 }}>{deal.productName}</h3>
            </div>
            <span style={{ color: '#d9480f', fontWeight: 800, fontSize: 20, whiteSpace: 'nowrap' }}>{formatMoney(deal.dealPriceCents)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'line-through' }}>{formatMoney(deal.originalPriceCents)}</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: Number(deal.quantityAvailable) <= 3 ? '#c2410c' : '#18794e', background: Number(deal.quantityAvailable) <= 3 ? '#fff1e8' : '#eaf8f0', padding: '3px 7px', borderRadius: 999 }}>
              {deal.quantityAvailable} left
            </span>
          </div>
        </div>
      </div>

      <button onClick={onStation} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', textAlign: 'left', borderTop: '1px solid var(--surface-variant)', background: 'var(--surface-low)' }}>
        <MapPin size={17} color="var(--primary)" />
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: 'block', fontSize: 12, fontWeight: 750, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{deal.station?.name || 'Pearl Energy station'}</span>
          <span style={{ display: 'block', fontSize: 10.5, color: 'var(--muted)', marginTop: 1 }}>
            {deal.distanceKm != null ? `${deal.distanceKm.toFixed(1)} km away · ` : ''}{deal.station?.city || 'View station'}
          </span>
        </span>
        <Navigation size={16} color="var(--primary)" />
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px', background: '#fff9e9', color: '#8a5300', fontSize: 11.5, fontWeight: 700 }}>
        <Clock3 size={15} /> {timeRemainingLabel(deal.sellUntil)} · Ends {cutoffLabel(deal.sellUntil)}
      </div>
    </article>
  )
}

export default function NightDealsScreen() {
  const { nightDeals, stations, setOverlay, setOverlayArg } = useApp()
  const [position, setPosition] = useState(null)
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [, tick] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => tick((value) => value + 1), 30000)
    return () => window.clearInterval(timer)
  }, [])

  const ranked = useMemo(() => rankNightDeals(nightDeals, stations, position), [nightDeals, stations, position])
  const stationCount = new Set(ranked.map((deal) => deal.stationId)).size

  const useLocation = () => {
    if (!navigator.geolocation) { setLocationError('Location is not supported by this browser.'); return }
    setLocating(true); setLocationError('')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setPosition({ lat: coords.latitude, lng: coords.longitude }); setLocating(false) },
      () => { setLocationError('Location permission was not available. Deals are still shown by branch.'); setLocating(false) },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    )
  }

  const openStation = (stationId) => {
    setOverlayArg(stationId)
    setOverlay('locator')
  }

  return (
    <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 34 }}
      className="screen" style={{ zIndex: 60, background: '#f7f4ed' }}>
      <header style={{ padding: '48px 18px 22px', color: '#fff', background: 'linear-gradient(145deg,#53280c 0%,#9a4b0c 52%,#e78b17 100%)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,205,107,.18)', right: -55, top: -70 }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
          <button onClick={() => setOverlay(null)} aria-label="Close Tonight Only" style={{ width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,.15)', color: '#fff' }}><ChevronLeft size={23} /></button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', opacity: .78 }}>Pearl Energy</div>
            <h1 style={{ fontSize: 22, marginTop: 2 }}>Tonight Only</h1>
          </div>
          <div style={{ width: 40 }} />
        </div>
        <div style={{ position: 'relative', marginTop: 20 }}>
          <h2 style={{ fontSize: 27, maxWidth: 290, lineHeight: 1.08 }}>Fresh food, lower prices, less waste.</h2>
          <p style={{ fontSize: 12.5, lineHeight: 1.5, opacity: .86, marginTop: 9, maxWidth: 320 }}>Today’s end-of-day specials disappear automatically at the manager’s chosen cutoff.</p>
        </div>
      </header>

      <div className="scroll" style={{ padding: '16px 18px 110px' }}>
        <button onClick={useLocation} disabled={locating} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, background: '#fff', padding: '13px 14px', borderRadius: 14, color: 'var(--primary)', fontWeight: 750, boxShadow: 'var(--shadow-sm)', textAlign: 'left' }}>
          <LocateFixed size={19} />
          <span style={{ flex: 1 }}>{position ? 'Sorted by your current location' : locating ? 'Finding your nearest station…' : 'Find the closest Tonight Only deal'}</span>
          {position && <span style={{ fontSize: 11, color: '#18794e' }}>On</span>}
        </button>
        {locationError && <p style={{ color: '#a33b22', fontSize: 11.5, margin: '8px 4px 0' }}>{locationError}</p>}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', margin: '22px 2px 12px' }}>
          <div><h2 style={{ fontSize: 19 }}>Available now</h2><p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{ranked.length} item{ranked.length === 1 ? '' : 's'} across {stationCount} station{stationCount === 1 ? '' : 's'}</p></div>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: '#9a4b0c', background: '#fff0ce', padding: '5px 8px', borderRadius: 999 }}>While stocks last</span>
        </div>

        {ranked.length ? (
          <div style={{ display: 'grid', gap: 13 }}>
            {ranked.map((deal, index) => <DealCard key={deal.id} deal={deal} nearest={position && index === 0} onStation={() => openStation(deal.stationId)} />)}
          </div>
        ) : (
          <div style={{ textAlign: 'center', background: '#fff', borderRadius: 20, padding: '34px 24px', boxShadow: 'var(--shadow-sm)' }}>
            <PackageCheck size={38} color="var(--primary)" style={{ marginBottom: 10 }} />
            <h3 style={{ fontSize: 18 }}>No specials available right now</h3>
            <p style={{ color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.5, marginTop: 7 }}>Check again later. Branch managers publish each day’s surplus only when it is safe and available.</p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 16, padding: 14, borderRadius: 14, color: '#51606f', background: 'rgba(255,255,255,.7)', fontSize: 11.5, lineHeight: 1.45 }}>
          <ShieldCheck size={18} style={{ flex: '0 0 auto', color: '#18794e' }} />
          <span>Available in store only. Quantity is indicative until confirmed at the register; offers cannot remain visible past their sale or food-safety cutoff.</span>
        </div>
      </div>
    </motion.div>
  )
}
