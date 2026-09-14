import { requireSupabase, supabase, authRedirect } from '../supabase/client'
import { tierForPoints } from './ids'
import { normaliseNightDeal } from './nightDeals'

const errors = new EventTarget(), changed = new EventTarget(), inflight = new Map()
function report(error) {
  const message = ['PGRST202','42P01','42883'].includes(error?.code)
    ? 'The Supabase database migration has not been applied yet. Please complete database setup.'
    : error?.message || 'Could not connect to the database. Please try again.'
  errors.dispatchEvent(new CustomEvent('error', { detail: message }))
  return new Error(message)
}
async function checked(operation) {
  const { data, error } = await operation
  if (error) throw report(error)
  return data
}
const rpc = (name, args = {}) => checked(requireSupabase().rpc(name, args))
async function mutate(name, payload) {
  const { data: { session } } = await requireSupabase().auth.getSession()
  if (!session) throw new Error('Please sign in again')
  const key = `pearl-request:${session.user.id}:${name}:${JSON.stringify(payload)}`
  if (inflight.has(key)) return inflight.get(key)
  // Keep the same request ID after an uncertain response, including page reload.
  let requestId
  try { requestId = sessionStorage.getItem(key) } catch { /* storage disabled */ }
  requestId ||= crypto.randomUUID()
  try { sessionStorage.setItem(key, requestId) } catch { /* in-memory lock remains */ }
  const pending = rpc(name, { ...payload, p_request_id: requestId }).then(result => {
    try { sessionStorage.removeItem(key) } catch { /* storage disabled */ }
    changed.dispatchEvent(new Event('refresh')); return result
  }).finally(() => inflight.delete(key))
  inflight.set(key, pending); return pending
}
// Bounded initial fetch, Realtime invalidation, focus/reconnect refresh and a
// polling fallback. No failure or empty collection ever returns demo records.
function watch(tables, fetchRows, callback, onError, interval = 60000) {
  let stopped = false, loading = false, rerun = false
  const refresh = async () => {
    if (stopped) return
    if (loading) { rerun = true; return }
    loading = true
    try { const rows = await fetchRows(); if (!stopped) callback(rows) }
    catch (error) { if (!stopped) { onError?.(error); report(error) } }
    finally { loading = false; if (rerun) { rerun = false; void refresh() } }
  }
  const channel = supabase?.channel(`pearl:${crypto.randomUUID()}`)
  for (const spec of tables) channel?.on('postgres_changes', { event: '*', schema: 'public', ...(typeof spec === 'string' ? { table: spec } : spec) }, refresh)
  channel?.subscribe(status => { if (status === 'SUBSCRIBED') void refresh() })
  const timer = window.setInterval(() => { if (!document.hidden) void refresh() }, interval)
  window.addEventListener('focus', refresh); window.addEventListener('online', refresh); changed.addEventListener('refresh', refresh)
  void refresh()
  return () => {
    stopped = true; clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh); changed.removeEventListener('refresh', refresh)
    if (channel) void supabase.removeChannel(channel)
  }
}
function catalogRow(row) {
  const out = { ...row.data, id: row.id, version: row.version, active: row.active, startsAt: row.starts_at, endsAt: row.ends_at }
  if (row.kind === 'categories') return { ...out, key: row.id, label: row.title }
  if (row.kind === 'menu') return { ...out, name: row.title, group: row.category_id, price: `$${(row.price_cents / 100).toFixed(2)}`, avail: row.in_stock }
  if (row.kind === 'fuel') return { ...out, code: row.title, price: Number(row.unit_price_micros) / 1e6 }
  if (row.kind === 'rewards') return { ...out, title: row.title, cost: row.points_cost }
  return { ...out, title: row.title, time: new Date(row.updated_at).toLocaleString('en-AU'), expiry: row.ends_at ? new Date(row.ends_at).toLocaleDateString('en-AU') : out.expiry }
}
function couponRow(row) {
  return { ...row.display, id: row.id, rewardId: row.reward_id, title: row.title, cost: row.cost_points, cat: row.display?.cat || 'Reward', img: row.display?.img || '🎁', color: row.display?.color || '#0057b8',
    status: row.status, redeemedAt: row.issued_at, activatedAt: row.issued_at, expiresAt: row.expires_at, usedAt: row.used_at }
}
const nightDealRow = row => ({ id: row.id, stationId: row.station_id, productName: row.product_name, description: row.description, img: row.img, originalPriceCents: row.original_price_cents,
  dealPriceCents: row.deal_price_cents, quantityAvailable: row.quantity_available, status: row.status, businessDate: row.business_date, startsAt: row.starts_at, sellUntil: row.sell_until, safetyCutoffAt: row.safety_cutoff_at, version: row.version })
const stationRow = row => ({ ...row.data, id: row.id, name: row.name, city: row.city, state: row.state, lat: row.latitude, lng: row.longitude, timezone: row.timezone, active: row.active, version: row.version })
function customerRow(row, account = row, email = row.email || '') {
  return { uid: row.auth_user_id, customerId: row.id, firstName: row.first_name, lastName: row.last_name, name: `${row.first_name} ${row.last_name}`.trim() || 'Pearl member', email, mobile: row.mobile, dob: row.dob || '', preferences: row.preferences,
    customerNumber: String(row.customer_number), membershipId: row.membership_code, qrData: `PEARL|1|${row.membership_code}`,
    points: Number(account.balance), lifetimePoints: Number(account.lifetime_points), tier: tierForPoints(Number(account.lifetime_points)), joined: row.created_at, createdAt: row.created_at,
    transactions: [], rewardsRedeemed: [], missionCount: 0, wheelSpins: 0, monthlyDrawEntries: 0, doublePointsNext: false }
}
async function currentCustomer() {
  const { data: { user }, error } = await requireSupabase().auth.getUser()
  if (error) throw error
  if (!user) throw new Error('Please sign in again')
  let row = await checked(supabase.from('customers').select('*').eq('auth_user_id', user.id).maybeSingle())
  if (!row) { await rpc('ensure_profile'); row = await checked(supabase.from('customers').select('*').eq('auth_user_id', user.id).single()) }
  const [account, history, campaign] = await Promise.all([
    checked(supabase.from('loyalty_accounts').select('*').eq('customer_id', row.id).single()),
    checked(supabase.from('transactions').select('id,event_type,total_cents,points_delta,occurred_at,receipt_number,stations(name),loyalty_ledger(delta)').eq('customer_id', row.id).order('occurred_at', { ascending: false }).order('id').limit(50)),
    rpc('campaign_status'),
  ])
  return { ...customerRow(row, account, user.email), ...campaign, transactions: history.map(t => ({ id: t.id, type: t.event_type, amount: t.total_cents / 100 * (t.event_type === 'sale' ? 1 : -1),
    points: (t.loyalty_ledger || []).reduce((sum, entry) => sum + Number(entry.delta), 0), store: t.stations?.name || 'Pearl Energy', date: new Date(t.occurred_at).toLocaleDateString('en-AU'), occurredAt: t.occurred_at, receiptNumber: t.receipt_number })) }
}
async function getCoupons(uid) {
  const row = await checked(requireSupabase().from('customers').select('id').eq('auth_user_id', uid).maybeSingle())
  if (!row) return []
  return (await checked(supabase.from('coupons').select('*').eq('customer_id', row.id).order('issued_at', { ascending: false }).limit(100))).map(couponRow)
}
const catalog = (kind, cb) => watch(['catalog_items'], async () => (await checked(requireSupabase().from('catalog_items').select('*').eq('kind', kind).order('id').limit(500))).map(catalogRow), cb)
const fail = message => async () => ({ ok: false, message })
export function createSupabaseProvider() {
  return {
    mode: 'supabase',
    onError(cb) { const fn = event => cb(event.detail); errors.addEventListener('error', fn); return () => errors.removeEventListener('error', fn) },
    onAuth(cb, onError) {
      let active = true, last
      const emit = (session, recovery = false) => {
        if (!active) return
        const key = `${session?.user?.id || ''}:${recovery}`
        if (key === last) return
        last = key; cb(session ? { uid: session.user.id, email: session.user.email, recovery } : null)
      }
      try {
        const client = requireSupabase()
        const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => emit(session, event === 'PASSWORD_RECOVERY'))
        client.auth.getSession().then(({ data, error }) => { if (error) throw error; if (last === undefined) emit(data.session) }).catch(e => { if (active) { cb(null); onError?.(e); report(e) } })
        return () => { active = false; subscription.unsubscribe() }
      } catch (error) { cb(null); onError?.(error); report(error); return () => { active = false } }
    },
    async signUp(fields) {
      const { data: result, error } = await requireSupabase().auth.signUp({ email: fields.email.trim(), password: fields.password,
        options: { emailRedirectTo: authRedirect(), data: { firstName: fields.firstName, lastName: fields.lastName, mobile: fields.mobile, dob: fields.dob || null } } })
      if (error) throw error
      if (result.session) await rpc('ensure_profile')
      return { requiresConfirmation: !result.session }
    },
    async signIn({ email, password }) { await checked(requireSupabase().auth.signInWithPassword({ email: email.trim(), password })); await rpc('ensure_profile') },
    async signInWithProvider(name) {
      const provider = name.toLowerCase()
      if (!['google','apple'].includes(provider)) throw new Error('Unsupported sign-in provider')
      return checked(requireSupabase().auth.signInWithOAuth({ provider, options: { redirectTo: authRedirect() } }))
    },
    async resetPassword(email) { return checked(requireSupabase().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${authRedirect()}?reset=1` })) },
    async setPassword(password) { return checked(requireSupabase().auth.updateUser({ password })) },
    async signOutUser() { return checked(requireSupabase().auth.signOut({ scope: 'local' })) },
    subscribeCustomer(uid, cb, onError) { return watch([{ table: 'customers', filter: `auth_user_id=eq.${uid}` }, 'loyalty_accounts','transactions','campaigns'], currentCustomer, cb, onError) },
    async updateProfile(uid, fields) { await rpc('update_profile', { p_fields: fields }); changed.dispatchEvent(new Event('refresh')) },
    async redeemReward(uid, reward) { const result = await mutate('redeem_reward', { p_reward_id: String(reward.id) }); return { ...result, coupon: result.coupon && couponRow(result.coupon) } },
    subscribePendingCoupons(uid, cb) { return watch(['coupons'], () => getCoupons(uid), cb) }, getPendingCoupons: getCoupons,
    activatePendingCoupon: fail('This coupon is active. Show your membership card at the register.'),
    usePendingCoupon: fail('Only the connected POS can confirm redemption. Show your membership card at the register.'),
    removePendingCoupon: fail('Coupon history is retained for your records.'),
    recordFuelPurchase: fail('Purchases must be recorded by the connected POS.'), recordShopPurchase: fail('Purchases must be recorded by the connected POS.'),
    spinWheel: () => mutate('spin_wheel', {}),
    subscribeCampaigns: cb => watch(['campaigns'], () => checked(requireSupabase().from('campaigns').select('*').order('id')), cb),
    async adminSetCampaign(id, active) { await rpc('manage_campaign', { p_id: id, p_active: active }); changed.dispatchEvent(new Event('refresh')) },
    adminPromotionReviews: () => rpc('promotion_reviews'),
    async adminResolvePromotion(id, reason) { await rpc('resolve_promotion_review', { p_id: id, p_reason: reason }); changed.dispatchEvent(new Event('refresh')) },
    subscribeOffers: cb => catalog('offers', cb), subscribeRewards: cb => catalog('rewards', cb), subscribeMenu: cb => catalog('menu', cb),
    subscribeCategories: cb => catalog('categories', cb), subscribeFuel: cb => catalog('fuel', cb), subscribeNotifications: cb => catalog('notifs', cb),
    subscribeStations: cb => watch(['stations'], async () => (await checked(requireSupabase().from('stations').select('*').order('name').limit(1000))).map(stationRow), cb),
    subscribeNightDeals: cb => watch(['night_deals'], async () => (await checked(requireSupabase().from('night_deals').select('*').eq('status','active').gt('sell_until',new Date().toISOString()).order('sell_until').limit(100))).map(nightDealRow), cb),
    subscribeNightDealsAdmin: cb => watch(['night_deals'], async () => (await checked(requireSupabase().from('night_deals').select('*').order('sell_until', { ascending: false }).limit(250))).map(nightDealRow), cb),
    adminOnAuth(cb) {
      let stopWatch = () => {}
      const stopAuth = this.onAuth(user => {
        stopWatch()
        if (!user) { cb(null); return }
        // Database work must run outside Supabase's auth callback lock.
        const timer = setTimeout(() => { stopWatch = watch([], () => rpc('staff_session'), cb, () => cb(null), 30000) }, 0)
        stopWatch = () => clearTimeout(timer)
      }, () => cb(null))
      return () => { stopAuth(); stopWatch() }
    },
    async adminSignIn({ email, password }) {
      await checked(requireSupabase().auth.signInWithPassword({ email: email.trim(), password }))
      const access = await rpc('staff_session')
      if (!access) throw new Error('This account has no staff access. A main admin must assign it first.')
      return access
    },
    async adminSignOut() { return checked(requireSupabase().auth.signOut({ scope: 'local' })) },
    subscribeStaff: cb => watch([], () => rpc('list_staff'), cb),
    async adminSetStaffAccess(input) { const result = await rpc('manage_staff', { p_input: input }); changed.dispatchEvent(new Event('refresh')); return result },
    async adminUpsert(name, item) {
      const payload = name === 'nightDeals' ? { ...normaliseNightDeal(item), version: item.version, id: item.id } : item
      const id = await rpc('save_catalog', { p_kind: name, p_item: payload }); changed.dispatchEvent(new Event('refresh')); return { ...item, id }
    },
    async adminRemove(name, id) { await rpc('archive_catalog', { p_kind: name, p_id: String(id) }); changed.dispatchEvent(new Event('refresh')) },
    async adminListCustomers({ search = '', offset = 0 } = {}) { return (await rpc('admin_customers', { p_search: search, p_offset: offset })).map(row => customerRow(row)) },
    adminSummary: () => rpc('admin_summary'),
    getReceipt: id => checked(requireSupabase().from('transactions').select('id,event_type,receipt_number,occurred_at,currency,subtotal_cents,tax_cents,total_cents,stations(name),transaction_items(*),transaction_payments(*),transaction_night_deals(*)').eq('id', id).single()),
    async adminAdjustPoints(customerId, delta, meta = {}) { return mutate('adjust_points', { p_customer_id: customerId, p_delta: Number(delta), p_reason: meta.store || meta.reason || '' }) },
    async lookupCustomer(number) { return (await rpc('admin_customers', { p_search: String(number), p_offset: 0 })).map(row => customerRow(row))[0] || null },
    async adminBroadcast(notification) { await rpc('save_catalog', { p_kind: 'notifs', p_item: { ...notification, id: notification.id || crypto.randomUUID() } }); changed.dispatchEvent(new Event('refresh')) },
  }
}
