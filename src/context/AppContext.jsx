import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { data, DATA_MODE } from '../services/data'
import { offers as seedOffers, rewards as seedRewards, fuelTypes as seedFuel, menuItems as seedMenu, menuGroups as seedCats, notifications as seedNotifs, stations as seedStations } from '../data/mockData'
import { visibleNightDeals } from '../services/nightDeals'

const AppContext = createContext(null)
export const useApp = () => useContext(AppContext)
const preview = DATA_MODE === 'local'

export function AppProvider({ children }) {
  const [tab, setTab] = useState('home'), [overlay, setOverlay] = useState(null), [overlayArg, setOverlayArg] = useState(null)
  const [toast, setToast] = useState(null), [user, setUser] = useState(undefined), [member, setMember] = useState(null)
  const [connectionError, setConnectionError] = useState(''), [profileError, setProfileError] = useState('')
  const [retry, setRetry] = useState(0), [pendingRewards, setPendingRewards] = useState([])
  const [offers, setOffers] = useState(preview ? seedOffers : [])
  const [rewards, setRewards] = useState(preview ? seedRewards : [])
  const [fuelPrices, setFuelPrices] = useState(preview ? seedFuel : [])
  const [menu, setMenu] = useState(preview ? seedMenu : [])
  const [categories, setCategories] = useState(preview ? seedCats : [])
  const [stations, setStations] = useState(preview ? seedStations : [])
  const [notifications, setNotifications] = useState(preview ? seedNotifs : [])
  const [nightDealRows, setNightDealRows] = useState([]), [catalogClock, setCatalogClock] = useState(Date.now())
  const notify = useCallback(msg => { setToast(msg); setTimeout(() => setToast(null), 3500) }, [])

  useEffect(() => data.onError?.(setConnectionError), [])
  useEffect(() => {
    const timer = setTimeout(() => {
      setUser(current => current === undefined ? null : current)
      setConnectionError('Sign-in is taking longer than expected. Check your connection and retry.')
    }, 15000)
    const stop = data.onAuth(value => { clearTimeout(timer); setUser(value) }, error => setConnectionError(error.message))
    return () => { clearTimeout(timer); stop?.() }
  }, [retry])

  useEffect(() => {
    setMember(null); setProfileError('')
    if (!user || user.recovery) return
    const timer = setTimeout(() => setProfileError('Your profile could not be loaded. Please retry; your points have not been changed.'), 15000)
    const stop = data.subscribeCustomer(user.uid, value => {
      if (!value) return
      clearTimeout(timer); setMember(value); setProfileError(''); setConnectionError('')
    }, error => { clearTimeout(timer); setProfileError(error.message) })
    return () => { clearTimeout(timer); stop?.() }
  }, [user, retry])

  useEffect(() => {
    setPendingRewards([])
    if (!user || user.recovery) return
    return data.subscribePendingCoupons?.(user.uid, rows => setPendingRewards(rows || []))
  }, [user])

  useEffect(() => {
    if (!user) {
      if (!preview) { setOffers([]); setRewards([]); setFuelPrices([]); setMenu([]); setCategories([]); setStations([]); setNotifications([]); setNightDealRows([]) }
      return
    }
    const stops = [
      data.subscribeOffers(setOffers), data.subscribeRewards(setRewards), data.subscribeFuel(setFuelPrices),
      data.subscribeMenu(setMenu), data.subscribeCategories(setCategories), data.subscribeStations(setStations),
      data.subscribeNotifications(setNotifications), data.subscribeNightDeals?.(setNightDealRows),
    ]
    return () => stops.forEach(stop => stop?.())
  }, [user, retry])

  // Expiration updates even in an already-open app with no realtime message.
  // New catalog rows must be compared with current time, not the last expiry.
  useEffect(() => { setCatalogClock(Date.now()) }, [nightDealRows, offers, rewards, menu, categories, fuelPrices, stations, notifications])
  useEffect(() => {
    const boundaries = [...nightDealRows, ...offers, ...rewards, ...menu, ...categories, ...fuelPrices, ...stations, ...notifications].flatMap(row => [row.startsAt, row.endsAt, row.sellUntil, row.safetyCutoffAt])
      .map(value => new Date(value).getTime()).filter(time => Number.isFinite(time) && time > Date.now()).sort((a,b) => a-b)
    if (!boundaries.length) return
    const timer = setTimeout(() => setCatalogClock(Date.now()), Math.min(boundaries[0]-Date.now()+50, 2147483647))
    return () => clearTimeout(timer)
  }, [nightDealRows, offers, rewards, menu, categories, fuelPrices, stations, notifications, catalogClock])
  const nightDeals = useMemo(() => visibleNightDeals(nightDealRows, new Date(catalogClock)), [nightDealRows, catalogClock])
  const visible = rows => rows.filter(row => row.active !== false && (!row.startsAt || new Date(row.startsAt).getTime() <= catalogClock) && (!row.endsAt || new Date(row.endsAt).getTime() > catalogClock))

  const signup = async fields => {
    const result = await data.signUp(fields)
    if (!result?.requiresConfirmation) notify('Welcome to Pearl Energy Rewards')
    return result
  }
  const login = async creds => { await data.signIn(creds); notify('Welcome back') }
  const loginProvider = name => data.signInWithProvider(name)
  const logout = async () => { await data.signOutUser(); setTab('home'); setOverlay(null); setConnectionError(''); notify('Logged out') }
  const redeemReward = async reward => {
    if (!member) return { ok: false, message: 'Please log in first' }
    try {
      const result = await data.redeemReward(member.uid, reward)
      if (!result?.ok) return result || { ok: false, message: 'Redemption failed' }
      if (result.coupon) setPendingRewards(previous => previous.some(row => row.id === result.coupon.id) ? previous : [result.coupon,...previous])
      notify('Your reward is active in My Coupons. Show your membership card at the register.')
      return { ...result, reward: result.coupon }
    } catch (error) { return { ok: false, message: error.message } }
  }
  const couponAction = async (method, id) => {
    try {
      const result = await data[method](member.uid, id)
      if (!result?.ok) { notify(result?.message || 'The request was not confirmed.'); return result }
      setPendingRewards(await data.getPendingCoupons(member.uid))
      return result
    } catch (error) { notify(error.message); return { ok: false } }
  }
  const updateProfile = async fields => {
    if (!member) return { ok: false, message: 'Please log in first' }
    await data.updateProfile(member.uid, fields); notify('Profile updated'); return { ok: true }
  }
  const value = {
    mode: DATA_MODE, tab, setTab, overlay, setOverlay, overlayArg, setOverlayArg, toast, notify,
    user, member, authed: !!member, resolving: user === undefined, profileError, connectionError,
    retryConnection: () => { setProfileError(''); setConnectionError(''); setRetry(value => value+1) },
    offers: visible(offers), rewards: visible(rewards), menu: visible(menu), categories: visible(categories),
    fuelPrices: visible(fuelPrices), stations: visible(stations), notifications: visible(notifications), nightDeals,
    pendingRewards, setPendingRewards, redeemReward,
    activateReward: id => couponAction('activatePendingCoupon', id), useReward: id => couponAction('usePendingCoupon', id), removeReward: id => couponAction('removePendingCoupon', id),
    signup, login, loginProvider, logout, lookupCustomer: number => data.lookupCustomer(number), updateProfile,
  }
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
