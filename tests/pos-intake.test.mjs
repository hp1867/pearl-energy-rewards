import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acceptReceipt } from '../supabase/functions/_shared/pos-intake.mjs'
import { canonicalizePosEvent } from '../supabase/functions/_shared/pos-contract.mjs'

test('processing is called only after the separate intake request has committed', async () => {
  const calls = [], client = { async rpc(name, args) {
    calls.push({ name, args })
    return name === 'ingest_pos' ? { data: { inboxId: 'saved', state: 'pending', accepted: true }, error: null }
      : { data: { transactionId: 'posted', state: 'processed', accepted: true }, error: null }
  } }
  const result = await acceptReceipt(client, 'store', { eventId: 'delivery' }, 'hash')
  assert.deepEqual(calls.map(x => x.name), ['ingest_pos', 'process_pos'])
  assert.equal(calls[1].args.p_inbox_id, 'saved')
  assert.equal(result.data.state, 'processed')
})
test('a lost processing connection returns the durable receipt reference', async () => {
  const client = { async rpc(name) {
    if (name === 'ingest_pos') return { data: { inboxId: 'durable', state: 'pending', accepted: true }, error: null }
    throw new Error('Connection lost')
  } }
  const result = await acceptReceipt(client, 'store', {}, 'hash')
  assert.equal(result.error, null); assert.equal(result.data.inboxId, 'durable'); assert.equal(result.data.state, 'pending')
})
test('an intake failure is not incorrectly acknowledged as a saved receipt', async () => {
  let calls = 0
  const result = await acceptReceipt({ async rpc() { calls++; return { data: null, error: { code: '23505' } } } }, 'store', {}, 'hash')
  assert.equal(calls, 1); assert.equal(result.error.code, '23505')
})
test('coupon and night-deal evidence is preserved by canonicalization', () => {
  const coupon = '11111111-1111-4111-8111-111111111111', deal = '22222222-2222-4222-8222-222222222222'
  const input = { eventId: 'one', eventType: 'sale', externalTransactionId: 'one', businessDate: '2026-09-15', occurredAt: '2026-09-15T00:00:00Z', currency: 'AUD', subtotalCents: 300, totalCents: 300,
    storeId: 'store', terminalId: 'terminal', receiptNumber: 'receipt',
    items: [{ lineId: '1', sku: 'PIE', description: 'Pie', category: 'bakery', totalCents: 300, grossTotalCents: 500 }],
    couponRedemptions: [{ couponId: coupon, lineId: '1', quantityMilli: 1000, discountCents: 200 }], nightDealSales: [{ dealId: deal, lineId: '1', quantity: 1 }] }
  const result = canonicalizePosEvent(input, 'test')
  assert.deepEqual(result.couponIds, [coupon]); assert.equal(result.couponRedemptions[0].lineId, '1')
  assert.equal(result.items[0].grossTotalCents, 500); assert.equal(result.nightDealSales[0].lineId, '1')
  const duplicate = canonicalizePosEvent({ ...input, couponRedemptions: [...input.couponRedemptions, ...input.couponRedemptions] }, 'test')
  assert.equal(duplicate.totalCents, 300)
  assert.deepEqual(duplicate.couponIds, [coupon])
  assert.equal(duplicate.couponRedemptions, undefined)
  assert.deepEqual(duplicate.benefitValidationErrors, ['Duplicate coupon claim'])
})
