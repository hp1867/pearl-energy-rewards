import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculatePointsDelta, canonicalizePosEvent, normalizeMembershipCode,
  tierForLifetimePoints, ValidationError,
} from '../src/domain.js'

function sale(overrides = {}) {
  return {
    eventId: 'evt-1',
    eventType: 'sale',
    occurredAt: '2026-09-01T04:25:31.000Z',
    externalTransactionId: 'STORE12-009871',
    originalExternalTransactionId: null,
    businessDate: '2026-09-01',
    storeId: 'store-12',
    terminalId: 'pos-03',
    receiptNumber: '009871',
    currency: 'AUD',
    subtotalCents: 7564,
    taxCents: 687,
    totalCents: 7564,
    membershipCode: 'PE-ABCD-EFGH-JKLM',
    items: [{
      lineId: '1', sku: 'FUEL-ULP91', description: 'Unleaded 91', category: 'fuel',
      quantityMilli: 42110, unitPriceMicros: 1799000, totalCents: 7564,
      eligibleForPoints: true, fuel: { gradeCode: 'ULP91', litresMilli: 42110 },
    }],
    payments: [{ method: 'card', amountCents: 7564 }],
    ...overrides,
  }
}

test('membership codes normalize for POS lookup', () => {
  assert.equal(normalizeMembershipCode(' pe-abcd efgh-jklm '), 'PEABCDEFGHJKLM')
})

test('tier calculation is deterministic at every boundary', () => {
  assert.equal(tierForLifetimePoints(0), 'Blue')
  assert.equal(tierForLifetimePoints(999), 'Blue')
  assert.equal(tierForLifetimePoints(1000), 'Silver')
  assert.equal(tierForLifetimePoints(2500), 'Gold')
  assert.equal(tierForLifetimePoints(5000), 'Diamond')
  assert.equal(tierForLifetimePoints(10000), 'Immortal')
})

test('POS sale uses integer cents and calculates whole-dollar points', () => {
  const event = canonicalizePosEvent(sale(), 'generic')
  const result = calculatePointsDelta(event)
  assert.deepEqual(result, { eligibleCents: 7564, pointsDelta: 75 })
})

test('refund produces a compensating negative points delta', () => {
  const event = canonicalizePosEvent(sale({
    eventId: 'refund-1', eventType: 'refund', externalTransactionId: 'refund-009871',
    originalExternalTransactionId: 'STORE12-009871',
  }), 'generic')
  assert.equal(calculatePointsDelta(event).pointsDelta, -75)
})

test('excluded and explicitly ineligible categories never earn points', () => {
  const input = sale({
    totalCents: 3000,
    subtotalCents: 3000,
    items: [
      { lineId: '1', description: 'Fuel', category: 'fuel', totalCents: 1000, eligibleForPoints: true },
      { lineId: '2', description: 'Tobacco', category: 'tobacco', totalCents: 1000, eligibleForPoints: true },
      { lineId: '3', description: 'Gift card', category: 'gift-card', totalCents: 1000, eligibleForPoints: false },
    ],
    payments: [{ method: 'card', amountCents: 3000 }],
  })
  const event = canonicalizePosEvent(input, 'generic')
  const result = calculatePointsDelta(event, { excludedCategories: ['tobacco'], pointsNumerator: 1, pointsDenominator: 1 })
  assert.deepEqual(result, { eligibleCents: 1000, pointsDelta: 10 })
})

test('payloads containing payment-card secrets are rejected', () => {
  assert.throws(
    () => canonicalizePosEvent(sale({ payments: [{ method: 'card', amountCents: 7564, cardNumber: '4111111111111111' }] })),
    ValidationError,
  )
})

test('duplicate receipt line IDs and invalid totals are rejected', () => {
  assert.throws(() => canonicalizePosEvent(sale({
    items: [
      { lineId: '1', description: 'A', category: 'shop', totalCents: 3000 },
      { lineId: '1', description: 'B', category: 'shop', totalCents: 4564 },
    ],
  })), /lineId must be unique/)
  assert.throws(() => canonicalizePosEvent(sale({ totalCents: 7000 })), /line totals/)
})
