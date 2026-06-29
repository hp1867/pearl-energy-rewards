import { useRef } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'

// Pointer-reactive 3D tilt wrapper — gives the premium interactive feel.
export default function Card3D({ children, intensity = 12, style, className, glare = true, onClick }) {
  const ref = useRef(null)
  const px = useMotionValue(0.5)
  const py = useMotionValue(0.5)
  const sx = useSpring(px, { stiffness: 180, damping: 18 })
  const sy = useSpring(py, { stiffness: 180, damping: 18 })

  const rotateY = useTransform(sx, [0, 1], [-intensity, intensity])
  const rotateX = useTransform(sy, [0, 1], [intensity, -intensity])
  const glareX = useTransform(sx, [0, 1], ['0%', '100%'])

  const move = (e) => {
    const r = ref.current.getBoundingClientRect()
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) - r.top
    px.set(Math.min(1, Math.max(0, cx / r.width)))
    py.set(Math.min(1, Math.max(0, cy / r.height)))
  }
  const reset = () => { px.set(0.5); py.set(0.5) }

  return (
    <motion.div
      ref={ref}
      className={className}
      onClick={onClick}
      onMouseMove={move}
      onMouseLeave={reset}
      onTouchMove={move}
      onTouchEnd={reset}
      style={{ rotateX, rotateY, transformStyle: 'preserve-3d', transformPerspective: 900, position: 'relative', ...style }}
    >
      {children}
      {glare && (
        <motion.div
          aria-hidden
          style={{
            position: 'absolute', inset: 0, borderRadius: 'inherit', pointerEvents: 'none',
            background: 'radial-gradient(220px 220px at var(--gx) 0%, rgba(255,255,255,.45), transparent 60%)',
            '--gx': glareX, mixBlendMode: 'soft-light',
          }}
        />
      )}
    </motion.div>
  )
}
