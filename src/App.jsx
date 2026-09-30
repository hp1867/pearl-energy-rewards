import { AnimatePresence, motion } from 'framer-motion'
import { useApp } from './context/AppContext'
import SplashScreen from './screens/SplashScreen'
import AuthScreen from './screens/AuthScreen'
import HomeScreen from './screens/HomeScreen'
import BottomNav from './components/BottomNav'
import Toast from './components/Toast'
import MemberOnboarding, { MemberSettings } from './screens/MemberAccess'
import { lazyTabs, lazyOverlays } from './screens/lazyScreens'
import ScreenBoundary from './components/ScreenBoundary'

const TABS = {
  home: HomeScreen,
  ...lazyTabs,
}

const OVERLAYS = {
  ...lazyOverlays,
  account: MemberSettings,
}

export default function App() {
  const { authed, user, member, resolving, tab, overlay, setOverlay, profileError, connectionError, retryConnection, logout } = useApp()

  const TabScreen = TABS[tab]
  const Overlay = overlay ? OVERLAYS[overlay] : null

  // Keep every existing auth/profile gate; remove only the artificial brand delay.
  const splash = resolving || (!!user && !user.recovery && !member && !profileError)

  return (
    <div className="stage">
      <div className="phone">
        <AnimatePresence mode="wait">
          {splash ? (
            <motion.div key="splash" exit={{ opacity: 0 }} style={{ position: 'absolute', inset: 0, zIndex: 90 }}>
              <SplashScreen />
            </motion.div>
          ) : profileError && user && !user.recovery ? (
            <div role="alert" style={{ padding: '80px 24px', lineHeight: 1.6 }}>
              <h2>We couldn't load your account</h2>
              <p style={{ margin: '16px 0' }}>{profileError}</p>
              <button className="btn" onClick={retryConnection}>Retry</button>
              <button className="btn ghost" onClick={() => logout().catch(() => {})} style={{ marginTop: 12 }}>Sign out</button>
            </div>
          ) : member?.onboarding && !user?.recovery ? <MemberOnboarding /> : !authed || user?.recovery ? (
            <motion.div key="auth" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ position: 'absolute', inset: 0 }}>
              <AuthScreen />
            </motion.div>
          ) : (
            <motion.div key="app" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ position: 'absolute', inset: 0 }}>
              {connectionError && <div role="alert" style={{ position: 'absolute', top: 64, left: 8, right: 8, zIndex: 85, background: '#fff4e5', padding: 10, borderRadius: 12, fontSize: 12 }} aria-live="polite">{connectionError} <button onClick={retryConnection}>Retry</button></div>}
              {/* tab screens with crossfade */}
              <AnimatePresence mode="wait">
                <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }} style={{ position: 'absolute', inset: 0 }}>
                  <ScreenBoundary key={tab}><TabScreen /></ScreenBoundary>
                </motion.div>
              </AnimatePresence>

              <BottomNav />
              <Toast />

              {/* full-screen overlays slide in over everything */}
              <AnimatePresence>{Overlay && <ScreenBoundary key={overlay} overlay onClose={() => setOverlay(null)}><Overlay /></ScreenBoundary>}</AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
