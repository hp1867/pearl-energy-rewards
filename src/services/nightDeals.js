export const NIGHT_DEAL_TIME_ZONE = 'Australia/Sydney'
export const NIGHT_DEAL_PERMISSION = 'nightDeals.manage'
export const NIGHT_DEAL_STATUSES = ['active', 'paused', 'sold_out', 'expired']

const datePartsFormatter = new Intl.DateTimeFormat('en-AU', {
  timeZone: NIGHT_DEAL_TIME_ZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

function partsInSydney(value) {
  const parts = datePartsFormatter.formatToParts(value)
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]))
}

function timeZoneOffsetMs(value) {
  const p = partsInSydney(value)
  const representedAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return representedAsUtc - value.getTime()
}

// Converts an Australia/Sydney wall-clock value to an instant. The second pass
// handles the different UTC offsets on either side of daylight-saving changes.
function sydneyWallTimeToDate({ year, month, day, hour = 0, minute = 0, second = 0 }) {
  const target = Date.UTC(year, month - 1, day, hour, minute, second)
  let result = new Date(target)
  result = new Date(target - timeZoneOffsetMs(result))
  result = new Date(target - timeZoneOffsetMs(result))
  return result
}

export function asDate(value) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value.toDate === 'function') return value.toDate()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function nextSydneyMidnight(now = new Date()) {
  const p = partsInSydney(now)
  const nextCalendarDay = new Date(Date.UTC(p.year, p.month - 1, p.day + 1))
  return sydneyWallTimeToDate({
    year: nextCalendarDay.getUTCFullYear(),
    month: nextCalendarDay.getUTCMonth() + 1,
    day: nextCalendarDay.getUTCDate(),
  })
}

export function sydneyBusinessDate(now = new Date()) {
  const p = partsInSydney(now)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

export function toDateTimeLocalValue(value) {
  const date = asDate(value)
  if (!date) return ''
  const p = partsInSydney(date)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}T${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

export function parseSydneyDateTime(value) {
  if (!value) return null
  if (value instanceof Date || typeof value?.toDate === 'function') return asDate(value)
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (!match) return asDate(value)
  return sydneyWallTimeToDate({
    year: Number(match[1]), month: Number(match[2]), day: Number(match[3]),
    hour: Number(match[4]), minute: Number(match[5]), second: Number(match[6] || 0),
  })
}

export function formatMoney(cents) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(cents || 0) / 100)
}

export function isNightDealVisible(deal, now = new Date()) {
  if (!deal || deal.status !== 'active' || Number(deal.quantityAvailable) <= 0) return false
  const startsAt = asDate(deal.startsAt)
  const sellUntil = asDate(deal.sellUntil)
  const safetyCutoffAt = asDate(deal.safetyCutoffAt)
  if (!startsAt || !sellUntil || !safetyCutoffAt) return false
  const time = now.getTime()
  return startsAt.getTime() <= time
    && time < sellUntil.getTime()
    && time < safetyCutoffAt.getTime()
}

export function visibleNightDeals(deals, now = new Date()) {
  return (deals || []).filter((deal) => isNightDealVisible(deal, now))
}

export function minutesUntil(value, now = new Date()) {
  const end = asDate(value)
  return end ? Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 60000)) : 0
}

export function timeRemainingLabel(value, now = new Date()) {
  const minutes = minutesUntil(value, now)
  if (minutes <= 0) return 'Ended'
  if (minutes < 60) return `${minutes}m left`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours}h ${remainder}m left` : `${hours}h left`
}

export function haversineKm(a, b) {
  if (![a?.lat, a?.lng, b?.lat, b?.lng].every(Number.isFinite)) return null
  const radians = (degrees) => degrees * Math.PI / 180
  const dLat = radians(b.lat - a.lat)
  const dLng = radians(b.lng - a.lng)
  const lat1 = radians(a.lat)
  const lat2 = radians(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

export function rankNightDeals(deals, stations, position = null) {
  const stationMap = new Map((stations || []).map((station) => [String(station.id), station]))
  return (deals || []).map((deal, index) => {
    const station = stationMap.get(String(deal.stationId)) || null
    return {
      ...deal,
      station,
      distanceKm: position && station ? haversineKm(position, station) : null,
      _originalOrder: index,
    }
  }).sort((a, b) => {
    if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm
    if (a.distanceKm != null) return -1
    if (b.distanceKm != null) return 1
    return a._originalOrder - b._originalOrder
  })
}

export function normaliseNightDeal(input, now = new Date()) {
  const startsAt = parseSydneyDateTime(input.startsAt)
  const sellUntil = parseSydneyDateTime(input.sellUntil)
  const safetyCutoffAt = parseSydneyDateTime(input.safetyCutoffAt)
  const originalPriceCents = Math.round(Number(input.originalPriceCents))
  const dealPriceCents = Math.round(Number(input.dealPriceCents))
  const quantityAvailable = Math.floor(Number(input.quantityAvailable))
  const status = NIGHT_DEAL_STATUSES.includes(input.status) ? input.status : 'active'

  if (!String(input.stationId || '').trim()) throw new Error('Choose the station for this deal.')
  if (!String(input.productName || '').trim()) throw new Error('Enter the product name.')
  if (!Number.isInteger(originalPriceCents) || originalPriceCents <= 0) throw new Error('Enter a valid regular price.')
  if (!Number.isInteger(dealPriceCents) || dealPriceCents <= 0 || dealPriceCents >= originalPriceCents) {
    throw new Error('The deal price must be lower than the regular price.')
  }
  if (!Number.isInteger(quantityAvailable) || quantityAvailable < 0) throw new Error('Quantity must be a whole number of zero or more.')
  if (!startsAt || !sellUntil || !safetyCutoffAt) throw new Error('Enter valid start, sale cutoff and food-safety cutoff times.')
  if (startsAt >= sellUntil) throw new Error('The sale cutoff must be after the start time.')
  if (sellUntil > nextSydneyMidnight(startsAt)) throw new Error('Tonight Only offers must end by midnight in Sydney.')
  if (sellUntil > safetyCutoffAt) throw new Error('The sale cutoff cannot be later than the food-safety cutoff.')
  if (status === 'active' && quantityAvailable === 0) throw new Error('An active deal must have at least one item available.')
  if (status === 'active' && sellUntil <= now) throw new Error('An active deal must end in the future.')

  return {
    ...input,
    stationId: String(input.stationId).trim(),
    productName: String(input.productName).trim(),
    description: String(input.description || '').trim(),
    img: String(input.img || '🥧').trim() || '🥧',
    originalPriceCents,
    dealPriceCents,
    quantityAvailable,
    status,
    startsAt: startsAt.toISOString(),
    sellUntil: sellUntil.toISOString(),
    safetyCutoffAt: safetyCutoffAt.toISOString(),
    businessDate: input.businessDate || sydneyBusinessDate(startsAt),
    timezone: NIGHT_DEAL_TIME_ZONE,
    schemaVersion: 1,
  }
}

export function newNightDealDefaults(now = new Date()) {
  const midnight = nextSydneyMidnight(now)
  return {
    img: '🥧', productName: '', description: '', originalPriceCents: 650,
    dealPriceCents: 250, quantityAvailable: 6, status: 'active',
    startsAt: now.toISOString(), sellUntil: midnight.toISOString(),
    safetyCutoffAt: midnight.toISOString(), timezone: NIGHT_DEAL_TIME_ZONE,
  }
}

export function buildDemoNightDeals(now = new Date()) {
  const base = newNightDealDefaults(now)
  return [
    normaliseNightDeal({
      ...base, id: 'tonight-altona-pies', stationId: 's17', productName: 'Classic Beef Pie',
      description: 'Fresh end-of-day surplus. Available in store while stocks last.',
      img: '🥧', originalPriceCents: 650, dealPriceCents: 250, quantityAvailable: 6,
    }, now),
    normaliseNightDeal({
      ...base, id: 'tonight-melbourne-rolls', stationId: 's7', productName: 'Sausage Roll',
      description: 'Tonight only at Pearl Energy Melbourne CBD.',
      img: '🥐', originalPriceCents: 550, dealPriceCents: 200, quantityAvailable: 4,
    }, now),
    normaliseNightDeal({
      ...base, id: 'tonight-dandenong-sandwiches', stationId: 's9', productName: 'Chicken Sandwich',
      description: 'Prepared today and reduced for tonight.',
      img: '🥪', originalPriceCents: 850, dealPriceCents: 350, quantityAvailable: 3,
    }, now),
  ]
}
