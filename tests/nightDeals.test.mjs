import test from 'node:test'
import assert from 'node:assert/strict'
import {
  haversineKm, isNightDealVisible, nextSydneyMidnight,
  normaliseNightDeal, rankNightDeals, sydneyBusinessDate,
} from '../src/services/nightDeals.js'

const validDeal = (overrides = {}) => ({
  id: 'deal-1', stationId: 's17', productName: 'Classic Beef Pie', img: 'pie',
  description: '', originalPriceCents: 650, dealPriceCents: 250,
  quantityAvailable: 6, status: 'active',
  startsAt: '2026-09-04T08:00:00.000Z',
  sellUntil: '2026-09-04T14:00:00.000Z',
  safetyCutoffAt: '2026-09-04T14:00:00.000Z',
  ...overrides,
})

test('computes the next Sydney midnight across standard and daylight-saving time', () => {
  assert.equal(nextSydneyMidnight(new Date('2026-09-04T10:00:00.000Z')).toISOString(), '2026-09-04T14:00:00.000Z')
  assert.equal(nextSydneyMidnight(new Date('2026-01-15T10:00:00.000Z')).toISOString(), '2026-01-15T13:00:00.000Z')
  assert.equal(sydneyBusinessDate(new Date('2026-09-04T15:00:00.000Z')), '2026-09-05')
})

test('an offer vanishes at its end time without a manager action', () => {
  const deal = validDeal()
  assert.equal(isNightDealVisible(deal, new Date('2026-09-04T13:59:59.999Z')), true)
  assert.equal(isNightDealVisible(deal, new Date('2026-09-04T14:00:00.000Z')), false)
  assert.equal(isNightDealVisible(validDeal({ status: 'paused' }), new Date('2026-09-04T12:00:00.000Z')), false)
  assert.equal(isNightDealVisible(validDeal({ quantityAvailable: 0 }), new Date('2026-09-04T12:00:00.000Z')), false)
})

test('a sale cutoff can never exceed the food-safety cutoff', () => {
  assert.throws(() => normaliseNightDeal(validDeal({
    sellUntil: '2026-09-04T13:30:00.000Z',
    safetyCutoffAt: '2026-09-04T13:00:00.000Z',
  }), new Date('2026-09-04T10:00:00.000Z')), /food-safety cutoff/i)
})

test('a Tonight Only offer cannot run beyond its Sydney midnight reset', () => {
  assert.throws(() => normaliseNightDeal(validDeal({
    sellUntil: '2026-09-04T15:00:00.000Z',
    safetyCutoffAt: '2026-09-04T16:00:00.000Z',
  }), new Date('2026-09-04T10:00:00.000Z')), /end by midnight/i)
})

test('prices use integer cents and deal price must be lower', () => {
  const deal = normaliseNightDeal(validDeal(), new Date('2026-09-04T10:00:00.000Z'))
  assert.equal(deal.dealPriceCents, 250)
  assert.throws(() => normaliseNightDeal(validDeal({ dealPriceCents: 650 }), new Date('2026-09-04T10:00:00.000Z')), /lower than/i)
})

test('deals sort by physical distance after location permission is granted', () => {
  const stations = [
    { id: 'far', lat: -37.8136, lng: 144.9631 },
    { id: 'near', lat: -37.8697, lng: 144.8304 },
  ]
  const deals = [{ id: 'a', stationId: 'far' }, { id: 'b', stationId: 'near' }]
  const position = { lat: -37.87, lng: 144.83 }
  assert.equal(rankNightDeals(deals, stations, position)[0].stationId, 'near')
  assert.ok(haversineKm(position, stations[1]) < haversineKm(position, stations[0]))
})
