import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { carousel } from '../data/mockData'

// Auto-sliding promo carousel (5s) with swipe + pagination dots.
export default function OfferCarousel() {
  const [i, setI] = useState(0)
  const [dir, setDir] = useState(1)
  const timer = useRef()

  const go = (n) => { setDir(n > i ? 1 : -1); setI((n + carousel.length) % carousel.length) }

  useEffect(() => {
    timer.current = setInterval(() => { setDir(1); setI((p) => (p + 1) % carousel.length) }, 5000)
    return () => clearInterval(timer.current)
  }, [])

  const s = carousel[i]
  return (
    <div style={{ padding: '0 20px' }}>
      <div style={{ position: 'relative', height: 168, borderRadius: 24, overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}>
        <AnimatePresence custom={dir} mode="popLayout">
          <motion.div
            key={s.id}
            custom={dir}
            initial={(d) => ({ x: d > 0 ? '100%' : '-100%', opacity: 0.4 })}
            animate={{ x: 0, opacity: 1 }}
            exit={(d) => ({ x: d > 0 ? '-100%' : '100%', opacity: 0.4 })}
            transition={{ type: 'spring', stiffness: 280, damping: 30 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            onDragEnd={(_, info) => { if (info.offset.x < -60) go(i + 1); else if (info.offset.x > 60) go(i - 1) }}
            style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${s.from}, ${s.to})`, padding: 22, color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
          >
            <div style={{ position: 'absolute', right: 8, top: -16, fontSize: 120, opacity: 0.22 }}>{s.img}</div>
            <span className="pill" style={{ alignSelf: 'flex-start', background: 'rgba(255,255,255,.25)', color: '#fff' }}>LIMITED TIME</span>
            <h3 style={{ fontSize: 24, marginTop: 10, lineHeight: 1.1, maxWidth: '78%' }}>{s.title}</h3>
            <p style={{ marginTop: 6, opacity: 0.92, fontSize: 14 }}>{s.sub}</p>
          </motion.div>
        </AnimatePresence>
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 12 }}>
        {carousel.map((c, n) => (
          <button key={c.id} onClick={() => go(n)} style={{ height: 6, width: n === i ? 22 : 6, borderRadius: 999, background: n === i ? 'var(--blue)' : 'rgba(11,31,58,.18)', transition: 'all .3s' }} />
        ))}
      </div>
    </div>
  )
}
