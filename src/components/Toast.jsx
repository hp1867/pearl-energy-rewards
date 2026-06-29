import { AnimatePresence, motion } from 'framer-motion'
import { useApp } from '../context/AppContext'

export default function Toast() {
  const { toast } = useApp()
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 26 }}
          style={{
            position: 'absolute', bottom: 96, left: 20, right: 20, zIndex: 60,
            background: '#0c1b32', color: '#fff', padding: '14px 18px', borderRadius: 16,
            fontWeight: 600, fontSize: 14, textAlign: 'center', boxShadow: 'var(--shadow-md)',
          }}
        >
          {toast}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
