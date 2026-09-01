import test, { before } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../src/firebase.js'
import { canonicalizePosEvent, normalizeMembershipCode } from '../src/domain.js'
import { processPosEvent } from '../src/posService.js'

const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
const run = emulator ? test : test.skip
const uid = 'pos-test-customer'
const accountId = 'pos-test-account'
const membershipId = 'PE-TEST-MBER-0001'

function payload(overrides = {}) {
  return {
    eventId: 'sale-event-1',
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
    membershipCode: membershipId,
    items: [{
      lineId: '1', description: 'Unleaded 91', category: 'fuel', totalCents: 7564,
      quantityMilli: 42110, unitPriceMicros: 1799000, eligibleForPoints: true,
      fuel: { gradeCode: 'ULP91', litresMilli: 42110 },
    }],
    payments: [{ method: 'card', amountCents: 7564 }],
    ...overrides,
  }
}

before(async () => {
  if (!emulator) return
  const collections = await db.listCollections()
  await Promise.all(collections.map((ref) => db.recursiveDelete(ref)))
  await db.collection('customers').doc(uid).set({
    uid, authUid: uid, customerId: 'cus-pos-test', loyaltyAccountId: accountId,
    programId: 'pearl-rewards-au', programVersion: 1, points: 0, availablePoints: 0,
    lifetimePoints: 0, tier: 'Blue',
  })
  await db.collection('loyaltyAccounts').doc(accountId).set({
    accountId, customerId: 'cus-pos-test', customerUid: uid, balancePoints: 0,
    availablePoints: 0, lifetimeEarnedPoints: 0, lifetimeRedeemedPoints: 0, version: 0,
  })
  await db.collection('membershipCodes').doc(normalizeMembershipCode(membershipId)).set({
    customerId: 'cus-pos-test', customerUid: uid, loyaltyAccountId: accountId,
    membershipId, status: 'active',
  })
  await db.collection('loyaltyPrograms').doc('pearl-rewards-au').set({
    programId: 'pearl-rewards-au', version: 1, pointsNumerator: 1, pointsDenominator: 1,
    excludedCategories: ['tobacco', 'lottery', 'gift-card', 'cash-out'],
  })
})

run('concurrent duplicate POS deliveries award points exactly once', async () => {
  const event = canonicalizePosEvent(payload(), 'test-pos')
  const results = await Promise.all(Array.from({ length: 10 }, () => processPosEvent(event, 'payload-hash-sale')))
  assert.equal(results.filter((result) => result.duplicate === false).length, 1)
  assert.ok(results.every((result) => result.pointsDelta === 75 && result.balanceAfter === 75))

  const account = await db.collection('loyaltyAccounts').doc(accountId).get()
  assert.equal(account.data().balancePoints, 75)
  const ledger = await db.collection('loyaltyLedger').where('customerUid', '==', uid).get()
  assert.equal(ledger.size, 1)
  const transactions = await db.collection('transactions').where('customerUid', '==', uid).get()
  assert.equal(transactions.size, 1)
})

run('a refund appends a compensating ledger entry', async () => {
  const refund = canonicalizePosEvent(payload({
    eventId: 'refund-event-1', eventType: 'refund', externalTransactionId: 'REFUND-009871',
    originalExternalTransactionId: 'STORE12-009871', receiptNumber: 'R-009871',
    subtotalCents: 2000, taxCents: 0, totalCents: 2000,
    items: [{ lineId: 'r1', description: 'Partial fuel refund', category: 'fuel', totalCents: 2000 }],
    payments: [{ method: 'card', amountCents: 2000 }],
  }), 'test-pos')
  const result = await processPosEvent(refund, 'payload-hash-refund')
  assert.equal(result.pointsDelta, -20)
  assert.equal(result.balanceAfter, 55)

  const account = await db.collection('loyaltyAccounts').doc(accountId).get()
  assert.equal(account.data().balancePoints, 55)
  const ledger = await db.collection('loyaltyLedger').where('customerUid', '==', uid).get()
  assert.equal(ledger.size, 2)
})

run('an unknown membership stores the sale without awarding points', async () => {
  const event = canonicalizePosEvent(payload({
    eventId: 'unknown-event-1', externalTransactionId: 'UNKNOWN-1', receiptNumber: 'UNKNOWN-1',
    membershipCode: 'PE-UNKNOWN-0000-0000',
  }), 'test-pos')
  const result = await processPosEvent(event, 'payload-hash-unknown')
  assert.equal(result.customerMatched, false)
  assert.equal(result.pointsDelta, 0)
  assert.equal(result.balanceAfter, null)

  const account = await db.collection('loyaltyAccounts').doc(accountId).get()
  assert.equal(account.data().balancePoints, 55)
})

