import { useState } from 'react'
import { motion } from 'framer-motion'
import { Clock, AlertCircle } from 'lucide-react'
import { useApp } from '../context/AppContext'
import Card3D from '../components/Card3D'

const CATS = ['All', 'Fuel Deals', 'Food Deals', 'Coffee Deals', 'Imported Products', 'Seasonal Specials']

export default function OffersScreen() {
  const { notify, offers, redeemOffer, member } = useApp()
  const [cat, setCat] = useState('All')
  const [redeeming, setRedeeming] = useState(null)
  const list = cat === 'All' ? offers : offers.filter((o) => o.cat === cat)

  const handleRedeem = async (offer) => {
    const pointsCost = offer.pointsCost || 0
    if (member && member.points < pointsCost) {
      notify(`Need ${pointsCost - member.points} more points`)
      return
    }
    setRedeeming(offer.id)
    const res = await redeemOffer(offer)
    setRedeeming(null)
    if (res.ok) {
      notify(`✅ ${offer.title} added to My Coupons. Scan at POS to activate.`)
    } else {
      notify(res.message)
    }
  }

  return (
    <div className="screen">
      <div className="scroll">
        <Header title="Offers" sub="Hand-picked deals for members" />
        <div className="h-scroll" style={{ marginTop: 4 }}>
          {CATS.map((c) => (
            <button key={c} className={`chip ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>

        <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {list.map((o, i) => (
            <motion.div key={o.id} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card3D intensity={7}>
                <div style={{ borderRadius: 22, overflow: 'hidden', background: '#fff', boxShadow: 'var(--shadow-md)' }}>
                  <div style={{ height: 128, background: `linear-gradient(135deg, ${o.accent}, ${o.accent}cc)`, position: 'relative', display: 'flex', alignItems: 'center', padding: 20 }}>
                    <div style={{ position: 'absolute', right: 6, bottom: -20, fontSize: 110, opacity: 0.3 }}>{o.img}</div>
                    <div style={{ color: '#fff', zIndex: 1 }}>
                      <span className="pill" style={{ background: 'rgba(255,255,255,.25)', color: '#fff' }}>{o.tag}</span>
                      <h3 style={{ fontSize: 22, marginTop: 10 }}>{o.title}</h3>
                      <p style={{ opacity: 0.9, fontSize: 13.5, marginTop: 2 }}>{o.sub}</p>
                    </div>
                  </div>
                  <div style={{ padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--blue)' }}>{o.price}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                        <Clock size={13} /> Expires {o.expiry}
                      </div>
                      {(o.pointsCost || 0) > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--primary)', fontWeight: 700, marginTop: 4 }}>
                          <AlertCircle size={13} /> {o.pointsCost} pts
                        </div>
                      )}
                    </div>
                    <button 
                      className="btn" 
                      style={{ width: 'auto', padding: '14px 26px' }} 
                      onClick={() => handleRedeem(o)}
                      disabled={redeeming === o.id}
                    >
                      {redeeming === o.id ? 'Redeeming...' : 'Redeem'}
                    </button>
                  </div>
                </div>
              </Card3D>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function Header({ title, sub }) {
  return (
    <div style={{ padding: '52px 20px 16px' }}>
      <h1 style={{ fontSize: 28 }}>{title}</h1>
      {sub && <p style={{ color: 'var(--muted)', marginTop: 4, fontSize: 14 }}>{sub}</p>}
    </div>
  )
}
