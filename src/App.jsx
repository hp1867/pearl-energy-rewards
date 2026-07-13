import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useApp } from './context/AppContext'
import SplashScreen from './screens/SplashScreen'
import AuthScreen from './screens/AuthScreen'
import HomeScreen from './screens/HomeScreen'
import OffersScreen from './screens/OffersScreen'
import MenuScreen from './screens/MenuScreen'
import RewardsScreen from './screens/RewardsScreen'
import ProfileScreen from './screens/ProfileScreen'
import BottomNav from './components/BottomNav'
import Toast from './components/Toast'
import { FuelPrices, StoreLocator, WalletCard, ScanModal, Receipts, Notifications, MyCoupons, EditProfile, HelpSupport, TiersInfo } from './screens/Overlays'

const TABS = {
  home: HomeScreen,
  offers: OffersScreen,
  menu: MenuScreen,
  rewards: RewardsScreen,
  profile: ProfileScreen,
}

const OVERLAYS = {
  fuel: FuelPrices,
  locator: StoreLocator,
  wallet: WalletCard,
  scan: ScanModal,
  receipts: Receipts,
  notifications: Notifications,
  coupons: MyCoupons,
  editprofile: EditProfile,
  help: HelpSupport,
  tiers: TiersInfo,
}

export default function App() {
  const { authed, user, resolving, tab, overlay } = useApp()
  const [splashDone, setSplashDone] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setSplashDone(true), 2400)
    return () => clearTimeout(t)
  }, [])

  const TabScreen = TABS[tab]
  const Overlay = overlay ? OVERLAYS[overlay] : null

  // keep splash up until the brand timer AND auth state have both resolved;
  // also while a signed-in user's live customer doc is still loading.
  const splash = !splashDone || resolving || (!!user && !authed)

  return (
    <div className="stage">
      <div className="phone">
        <AnimatePresence mode="wait">
          {splash ? (
            <motion.div key="splash" exit={{ opacity: 0 }} style={{ position: 'absolute', inset: 0, zIndex: 90 }}>
              <SplashScreen />
            </motion.div>
          ) : !authed ? (
            <motion.div key="auth" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ position: 'absolute', inset: 0 }}>
              <AuthScreen />
            </motion.div>
          ) : (
            <motion.div key="app" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ position: 'absolute', inset: 0 }}>
              {/* tab screens with crossfade */}
              <AnimatePresence mode="wait">
                <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }} style={{ position: 'absolute', inset: 0 }}>
                  <TabScreen />
                </motion.div>
              </AnimatePresence>

              <BottomNav />
              <Toast />

              {/* full-screen overlays slide in over everything */}
              <AnimatePresence>{Overlay && <Overlay key={overlay} />}</AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
