import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { data, DATA_MODE } from '../services/data'
import { offers as seedOffers, rewards as seedRewards, fuelTypes as seedFuel, menuItems as seedMenu, menuGroups as seedCats, notifications as seedNotifs, stations as seedStations } from '../data/mockData'

const AppContext = createContext(null)
export const useApp = () => useContext(AppContext)

export function AppProvider({ children }) {
  const [tab, setTab] = useState('home')
  const [overlay, setOverlay] = useState(null)
  const [overlayArg, setOverlayArg] = useState(null)
  const [toast, setToast] = useState(null)

  const [user, setUser] = useState(undefined)
  const [member, setMember] = useState(null)

  // Pending coupons (redeemed but not yet scanned at POS)
  const [pendingCoupons, setPendingCoupons] = useState([])

  const [offers, setOffers] = useState(seedOffers)
  const [rewards, setRewards] = useState(seedRewards)
  const [fuelPrices, setFuelPrices] = useState(seedFuel)
  const [menu, setMenu] = useState(seedMenu)
  const [categories, setCategories] = useState(seedCats)
  const [stations, setStations] = useState(seedStations)
  const [notifications, setNotifications] = useState(seedNotifs)

  const notify = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(null), 2400) }, [])

  useEffect(() => data.onAuth(setUser), [])

  useEffect(() => {
    if (!user) { setMember(null); return }
    return data.subscribeCustomer(user.uid, setMember)
  }, [user])

  useEffect(() => data.subscribeOffers(setOffers), [])
  useEffect(() => data.subscribeRewards(setRewards), [])
  useEffect(() => data.subscribeFuel(setFuelPrices), [])
  useEffect(() => data.subscribeMenu(setMenu), [])
  useEffect(() => data.subscribeCategories(setCategories), [])
  useEffect(() => data.subscribeStations(setStations), [])
  useEffect(() => data.subscribeNotifications(setNotifications), [])

  const signup = useCallback(async (fields) => {
    await data.signUp(fields); notify('Welcome to Pearl Energy Rewards ✨')
  }, [notify])

  const login = useCallback(async (creds) => {
    await data.signIn(creds); notify('Welcome back 👋')
  }, [notify])

  const loginProvider = useCallback(async (name) => {
    await data.signInWithProvider(name); notify(`Signed in with ${name}`)
  }, [notify])

  const logout = useCallback(async () => { await data.signOutUser(); setTab('home'); setOverlay(null); notify('Logged out') }, [notify])

  // Redeem an offer - adds to pending coupons (not active until scanned at POS)
  const redeemOffer = useCallback(async (offer) => {
    if (!member) return { ok: false, message: 'Please log in first' }
    if (member.points < (offer.pointsCost || 0)) {
      return { ok: false, message: `Need ${(offer.pointsCost || 0) - member.points} more points` }
    }
    
    // Deduct points locally immediately
    const newPoints = member.points - (offer.pointsCost || 0)
    const newLifetimePoints = member.lifetimePoints // Don't reduce lifetime
    
    // Add to pending coupons
    const newCoupon = {
      id: Date.now(),
      offerId: offer.id,
      title: offer.title,
      sub: offer.sub,
      price: offer.price,
      img: offer.img,
      accent: offer.accent,
      tag: offer.tag,
      expiry: offer.expiry,
      pointsCost: offer.pointsCost || 0,
      status: 'not_active', // not_active | active | redeemed
      redeemedAt: new Date().toISOString(),
      activatedAt: null,
    }
    
    setPendingCoupons(prev => [...prev, newCoupon])
    
    // Update member points
    setMember(prev => prev ? { ...prev, points: newPoints, lifetimePoints: newLifetimePoints } : null)
    
    // Also persist to backend
    try {
      await data.adminAdjustPoints(member.uid, -(offer.pointsCost || 0), { 
        store: 'Offer Redeemed', 
        amount: 0, 
        type: `Offer: ${offer.title}` 
      })
    } catch (e) {
      console.error('Failed to persist points deduction', e)
    }
    
    notify(`✅ ${offer.title} added to coupons. Scan at POS to activate.`)
    return { ok: true, coupon: newCoupon }
  }, [member, notify])

  // Activate a pending coupon (called when scanned at POS)
  const activateCoupon = useCallback(async (couponId) => {
    setPendingCoupons(prev => prev.map(c => 
      c.id === couponId ? { ...c, status: 'active', activatedAt: new Date().toISOString() } : c
    ))
    notify('✅ Coupon activated!')
    return { ok: true }
  }, [notify])

  // Mark coupon as fully redeemed (used)
  const useCoupon = useCallback(async (couponId) => {
    setPendingCoupons(prev => prev.map(c => 
      c.id === couponId ? { ...c, status: 'redeemed', usedAt: new Date().toISOString() } : c
    ))
    notify('✅ Coupon redeemed!')
    return { ok: true }
  }, [notify])

  // Remove expired/used coupons
  const removeCoupon = useCallback((couponId) => {
    setPendingCoupons(prev => prev.filter(c => c.id !== couponId))
  }, [])

  const lookupCustomer = useCallback((customerNumber) => data.lookupCustomer(customerNumber), [])

  const value = {
    mode: DATA_MODE,
    tab, setTab, overlay, setOverlay, overlayArg, setOverlayArg, toast, notify,
    user, member, authed: !!member, resolving: user === undefined,
    offers, rewards, fuelPrices, menu, categories, stations, notifications,
    pendingCoupons, redeemOffer, activateCoupon, useCoupon, removeCoupon,
    signup, login, loginProvider, logout, lookupCustomer,
  }
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
