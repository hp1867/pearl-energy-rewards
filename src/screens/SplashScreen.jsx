import { motion } from 'framer-motion'
import { PearlMark } from '../components/Brand'

export default function SplashScreen() {
  return (
    <div className="screen" style={{ background: 'var(--grad-blue-deep)', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
      <motion.div
        initial={{ scale: 0.4, opacity: 0, rotate: -20 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 160, damping: 14 }}
      >
        <motion.div animate={{ y: [0, -10, 0] }} transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}>
          <PearlMark size={96} light />
        </motion.div>
      </motion.div>
      <motion.h1 initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}
        style={{ fontSize: 34, marginTop: 22, fontWeight: 800 }}>
        Pearl Energy
      </motion.h1>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 0.85 }} transition={{ delay: 0.5 }}
        style={{ marginTop: 8, letterSpacing: '0.06em', fontWeight: 500 }}>
        Fuel · Shop · Earn · Redeem
      </motion.p>
      <motion.div initial={{ width: 0 }} animate={{ width: 120 }} transition={{ delay: 0.7, duration: 1.1 }}
        style={{ height: 4, borderRadius: 999, background: 'rgba(255,255,255,.5)', marginTop: 34, overflow: 'hidden' }}>
        <motion.div initial={{ x: '-100%' }} animate={{ x: '100%' }} transition={{ repeat: Infinity, duration: 1, ease: 'easeInOut' }}
          style={{ height: '100%', width: '50%', background: '#fff' }} />
      </motion.div>
    </div>
  )
}
