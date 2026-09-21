import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { startTestPostgres } from './helpers/postgres.mjs'
import { canonicalizePosEvent } from '../supabase/functions/_shared/pos-contract.mjs'

let runtime, db, integration, customer, customerId, member, owner, ruleId
const q = async (sql, params = []) => db.query(sql, params)
const one = async (sql, params = []) => (await q(sql, params)).rows[0]
const rpc = async (name, args = [], client = db) => (await client.query(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as result`, args)).rows[0].result
async function callAs(role, uid, name, args) {
  const client = await runtime.client()
  try { await client.query(`set role ${role}`); await client.query("select set_config('request.jwt.claim.sub',$1,false)", [uid || '']); return await rpc(name, args, client) }
  finally { await client.end() }
}
const pos = event => callAs('service_role', null, 'record_pos', [integration, event, 'a'.repeat(64)])
const action = (name, input, request = randomUUID()) => callAs('authenticated', owner, 'admin_database_action', [name, input, request])
function sale(extra = {}) {
  const at = new Date(Date.now() + 500).toISOString()
  return { contractVersion: 1, provider: 'recovery-test', eventId: randomUUID(), eventType: 'sale', externalTransactionId: randomUUID(),
    occurredAt: at, businessDate: at.slice(0, 10), storeId: 'recovery-store', terminalId: 'test', receiptNumber: randomUUID(), currency: 'AUD',
    subtotalCents: 10000, taxCents: 909, totalCents: 10000, membershipCode: member,
    items: [{ lineId: '1', sku: 'COFFEE', description: 'Test purchase', category: 'other', quantityMilli: 1000, unitPriceMicros: 100000000, totalCents: 10000, eligibleForPoints: true }],
    payments: [{ method: 'card', amountCents: 10000 }], ...extra }
}
async function coupon(extra = {}) {
  return (await one("insert into public.coupons(customer_id,title,cost_points,rule_id,issued_at,expires_at) values($1,'Test coffee',0,$2,$3,$4) returning id", [customerId, extra.ruleId || ruleId, extra.issued || new Date(Date.now() - 86400000), extra.expires || new Date(Date.now() + 86400000)])).id
}
function withCoupon(id, extra = {}) {
  const event = sale({ couponIds: [id], couponRedemptions: [{ couponId: id, lineId: 'coffee', quantityMilli: 1000, discountCents: 500 }], ...extra })
  event.items.push({ lineId: 'coffee', sku: 'COFFEE', description: 'Coffee', category: 'other', quantityMilli: 1000, unitPriceMicros: 5000000, totalCents: 0, grossTotalCents: 500, eligibleForPoints: true })
  return event
}

before(async () => {
  runtime = await startTestPostgres(); db = await runtime.client()
  customer = randomUUID(); owner = randomUUID()
  await q("insert into auth.users(id,email,email_confirmed_at) values($1,'native-customer@test.invalid',now()),($2,'native-admin@test.invalid',now())", [customer, owner])
  customerId = await callAs('authenticated', customer, 'complete_registration', [{ terms: 'test-v1', privacy: 'test-v1' }])
  member = String((await one('select customer_number from public.customers where id=$1', [customerId])).customer_number)
  await q("insert into private.staff_access(user_id,role) values($1,'admin')", [owner])
  await q("insert into public.stations(id,name) values('native','Local native test')")
  integration = (await one("insert into private.pos_integrations(provider,station_id,external_store_id,active) values('recovery-test','native','recovery-store',true) returning id")).id
  await q("insert into public.catalog_items(kind,id,title,price_cents) values('menu','native-coffee','Coffee',500),('menu','native-pie','Pie',600)")
  await action('mapping', { integrationId: integration, sku: 'COFFEE', productKind: 'menu', productId: 'native-coffee', category: 'other', eligibleForPoints: true })
  await action('mapping', { integrationId: integration, sku: 'PIE', productKind: 'menu', productId: 'native-pie', category: 'other', eligibleForPoints: true })
  ruleId = (await action('reward_rule', { name: 'Free coffee', products: [{ kind: 'menu', id: 'native-coffee' }], discountKind: 'free', discountValue: 0, maxDiscountCents: 500 })).id
  await q('update public.campaigns set active=false')
}, { timeout: 120000 })
after(async () => { await db?.end(); await runtime?.stop() })

test('intake survives an interrupted processing request and is visible to another connection', async () => {
  const event = sale()
  const accepted = await callAs('service_role', null, 'ingest_pos', [integration, event, 'a'.repeat(64)])
  assert.equal(accepted.state, 'pending')
  assert.equal((await one('select count(*)::int as n from public.transactions where external_id=$1', [event.externalTransactionId])).n, 0)
  assert.equal((await one('select state from private.pos_inbox where id=$1', [accepted.inboxId])).state, 'pending')
  const processed = await callAs('service_role', null, 'process_pos', [integration, accepted.inboxId])
  assert.equal(processed.state, 'processed')
  assert.equal(processed.pointsDelta, 100)
})

test('ten simultaneous deliveries post one receipt and one points entry', async () => {
  const event = sale()
  const results = await Promise.all(Array.from({ length: 10 }, () => pos({ ...event, eventId: randomUUID() })))
  assert.equal(new Set(results.map(x => x.transactionId)).size, 1)
  assert.equal((await one('select count(*)::int as n from public.loyalty_ledger where transaction_id=$1 and entry_type=$2', [results[0].transactionId, 'earn'])).n, 1)
  await assert.rejects(pos({ ...event, totalCents: 9900 }), /different content/)
})

test('malformed optional offer evidence still posts the canonical receipt and full ordinary points', async () => {
  const id = await coupon()
  const event = canonicalizePosEvent(withCoupon(id, { nightDealSales: 'invalid', couponRedemptions: [{ couponId: id, lineId: 'coffee', quantityMilli: 'invalid', discountCents: 500 }] }), 'recovery-test')
  const result = await pos(event)
  assert.equal(result.state, 'processed'); assert.equal(result.pointsDelta, 100)
  assert.equal((await one('select total_cents from public.transactions where id=$1', [result.transactionId])).total_cents, 10000)
  assert.equal((await one('select status from public.coupons where id=$1', [id])).status, 'revoked')
  assert.equal((await one('select count(*)::int as n from private.pos_issues where inbox_id=$1 and resolved_at is null', [result.inboxId])).n, 0)
  assert.equal((await one("select count(*)::int as n from private.pos_issues where inbox_id=$1 and kind='benefits' and resolved_at is not null", [result.inboxId])).n, 1)
})

test('simultaneous registration creates one membership and one consent per policy', async () => {
  const uid = randomUUID()
  await q('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [uid, `${uid}@test.invalid`])
  const results = await Promise.all(Array.from({ length: 5 }, () => callAs('authenticated', uid, 'complete_registration', [{ terms: 'test-v1', privacy: 'test-v1' }])))
  assert.equal(new Set(results).size, 1)
  assert.equal((await one('select count(*)::int as n from public.consent_events where customer_id=$1', [results[0]])).n, 2)
})

test('an expired coupon retains the paid receipt and ordinary points, and cannot be reused', async () => {
  const id = await coupon({ expires: new Date(Date.now() - 3600000) })
  const event = withCoupon(id)
  const result = await pos(event)
  assert.equal(result.state, 'processed'); assert.equal(result.pointsDelta, 100)
  assert.ok(result.transactionId)
  assert.equal((await one('select status from public.coupons where id=$1', [id])).status, 'revoked')
  assert.equal((await one('select count(*)::int as n from private.pos_issues where inbox_id=$1 and resolved_at is null', [result.inboxId])).n, 0)
  assert.equal((await pos(event)).transactionId, result.transactionId)
  const status = await callAs('authenticated', customer, 'receipt_processing_status', [result.transactionId])
  assert.equal(status.state, 'processed')
})

test('a coupon valid at purchase is accepted after its expiry, using its original rule', async () => {
  const id = await coupon({ expires: new Date(Date.now() - 60000) })
  const result = await pos(withCoupon(id, { occurredAt: new Date(Date.now() - 120000).toISOString() }))
  assert.equal(result.state, 'processed')
  assert.equal((await one('select status from public.coupons where id=$1', [id])).status, 'redeemed')
})

test('product mismatch and excessive discounts are auto-recorded without losing ordinary points', async () => {
  for (const scenario of ['wrong-product', 'excess-discount', 'missing-line']) {
    const id = await coupon(), event = withCoupon(id)
    if (scenario === 'wrong-product') event.items[1].sku = 'PIE'
    if (scenario === 'excess-discount') { event.couponRedemptions[0].discountCents = 600; event.items[1].grossTotalCents = 600 }
    if (scenario === 'missing-line') event.couponRedemptions[0].lineId = 'absent'
    const result = await pos(event)
    assert.equal(result.state, 'processed', scenario); assert.ok(result.transactionId); assert.equal(result.pointsDelta, 100)
    assert.equal((await one('select count(*)::int as n from public.coupon_redemptions where coupon_id=$1', [id])).n, 0)
  }
})

test('concurrent coupon redemption succeeds once without losing either sale', async () => {
  const id = await coupon()
  const results = await Promise.all([pos(withCoupon(id)), pos(withCoupon(id))])
  assert.equal(results.filter(x => x.state === 'processed').length, 2)
  assert.ok(results.every(x => x.transactionId))
  assert.equal((await one('select count(*)::int as n from public.coupon_redemptions where coupon_id=$1', [id])).n, 1)
})

test('a temporary benefit failure retains normal points and retries without blocking other receipts', async () => {
  const id = await coupon()
  await q(`create function private.test_offer_lock() returns trigger language plpgsql as $$ begin
    if new.id='${id}'::uuid then raise exception 'Test temporary benefit lock' using errcode='55P03'; end if; return new; end $$;
    create trigger test_offer_lock before update on public.coupons for each row execute function private.test_offer_lock()`)
  let first
  try {
    first = await pos(withCoupon(id))
    assert.equal(first.state, 'retry'); assert.equal(first.pointsDelta, 100); assert.ok(first.transactionId)
    assert.equal((await pos(sale())).state, 'processed')
    assert.equal((await one('select count(*)::int as n from public.loyalty_ledger where transaction_id=$1', [first.transactionId])).n, 1)
  } finally { await q('drop trigger test_offer_lock on public.coupons; drop function private.test_offer_lock()') }
  const retried = await callAs('service_role', null, 'process_pos', [integration, first.inboxId])
  assert.equal(retried.state, 'processed')
  assert.equal((await one('select count(*)::int as n from public.loyalty_ledger where transaction_id=$1', [first.transactionId])).n, 1)
})

test('simultaneous last-item sales preserve both receipts but never create negative stock', async () => {
  const deal = (await one("insert into public.night_deals(station_id,product_name,product_id,original_price_cents,deal_price_cents,quantity_available,business_date,starts_at,sell_until,safety_cutoff_at) values('native','Final pie','native-pie',600,300,1,current_date,now()-interval '1 minute',now()+interval '1 hour',now()+interval '1 hour') returning id")).id
  const event = () => sale({ subtotalCents: 300, taxCents: 27, totalCents: 300, payments: [{ method: 'card', amountCents: 300 }],
    items: [{ lineId: 'pie', sku: 'PIE', description: 'Pie', category: 'other', quantityMilli: 1000, unitPriceMicros: 3000000, totalCents: 300, eligibleForPoints: true }], nightDealSales: [{ dealId: deal, lineId: 'pie', quantity: 1 }] })
  const results = await Promise.all([pos(event()), pos(event())])
  assert.equal(results.filter(x => x.state === 'processed').length, 2)
  assert.equal((await one('select count(*)::int as n from public.transaction_night_deals where night_deal_id=$1', [deal])).n, 1)
  assert.ok(results.every(x => x.transactionId))
  assert.equal((await one('select quantity_available from public.night_deals where id=$1', [deal])).quantity_available, 0)
  assert.equal(Number((await one('select sum(delta) as total from private.deal_stock_movements where deal_id=$1', [deal])).total), 0)
})

test('late sales use the historic earning rate; refunds reverse that original award', async () => {
  await q("insert into public.loyalty_programs(id,version,points_numerator,points_denominator,excluded_categories,effective_from) values('pearl-rewards-au',2,2,1,array['tobacco'],now()-interval '1 hour')")
  const older = sale({ occurredAt: new Date(Date.now() - 86400000).toISOString() })
  assert.equal((await pos(older)).pointsDelta, 100)
  assert.equal((await pos(sale())).pointsDelta, 200)
  assert.equal((await pos({ ...older, occurredAt: new Date().toISOString(), eventId: randomUUID(), eventType: 'refund', externalTransactionId: randomUUID(), originalExternalTransactionId: older.externalTransactionId })).pointsDelta, -100)
  await assert.rejects(q("update public.loyalty_programs set points_numerator=99 where version=1"), /immutable/)
})

test('a wheel credit keeps the prize rules promised when the purchase qualified', async () => {
  // Earlier delayed-receipt fixtures legitimately earned older credits. Isolate this promise.
  await q("update public.wheel_credits set state='revoked' where customer_id=$1", [customerId])
  await q("update public.campaigns set active=true,config=jsonb_set(config,'{prizes}',$1) where id='shop_wheel'", [JSON.stringify([{ type: 'points', value: 100, label: 'Original 100', weight: 1 }])])
  const event = sale({ occurredAt: new Date().toISOString() })
  // Ensure the purchase instant follows the version published by PostgreSQL.
  event.occurredAt = (await one('select clock_timestamp() as t')).t.toISOString()
  event.occurredAt = new Date(Date.parse(event.occurredAt) + 10).toISOString()
  await pos(event)
  await q("update public.campaigns set config=jsonb_set(config,'{prizes}',$1) where id='shop_wheel'", [JSON.stringify([{ type: 'points', value: 500, label: 'New 500', weight: 1 }])])
  const result = await callAs('authenticated', customer, 'spin_wheel', [randomUUID()])
  assert.equal(result.prize.value, 100)
  await assert.rejects(q("update public.campaign_rule_versions set config='{}'"), /append-only/)
  await q('update public.campaigns set active=false')
})

test('a refund arriving before its sale is queued and processed safely on retry', async () => {
  const original = sale()
  const refund = { ...original, eventId: randomUUID(), externalTransactionId: randomUUID(), eventType: 'refund', originalExternalTransactionId: original.externalTransactionId }
  const delayed = await pos(refund)
  assert.equal(delayed.state, 'retry'); assert.equal(delayed.transactionId, null)
  await pos(original)
  await q('update private.pos_inbox set next_attempt_at=now() where id=$1', [delayed.inboxId])
  await q('select private.process_pos_batch()')
  assert.equal((await one('select state from private.pos_inbox where id=$1', [delayed.inboxId])).state, 'processed')
})

test('daily POS comparison finds missing receipts independently of a balanced ledger', async () => {
  const result = await action('reconcile', { integrationId: integration, businessDate: new Date().toISOString().slice(0, 10), receipts: [{ externalTransactionId: 'missing-at-loyalty', eventType: 'sale', totalCents: 5200 }] })
  assert.equal(result.matched, false)
  assert.ok(result.differences.some(x => x.externalId === 'missing-at-loyalty' && x.problem === 'missing_receipt'))
  const overview = await callAs('authenticated', owner, 'admin_database_overview', [])
  assert.equal(overview.health.balanceMismatches, 0)
  assert.equal(overview.health.stockMismatches, 0)
})

test('customer/anonymous roles cannot inspect intake or publish rules; admin retries are idempotent', async () => {
  await assert.rejects(callAs('authenticated', customer, 'admin_database_overview', []), /Main-admin/)
  await assert.rejects(callAs('anon', null, 'ingest_pos', [integration, sale(), 'a'.repeat(64)]), /permission denied/)
  const client = await runtime.client()
  try { await client.query('set role authenticated'); await assert.rejects(client.query('select * from private.pos_inbox'), /permission denied/) } finally { await client.end() }
  const request = randomUUID(), input = { integrationId: integration, sku: 'NEW', productKind: 'menu', productId: 'native-coffee', category: 'other', eligibleForPoints: true }
  assert.deepEqual(await action('mapping', input, request), await action('mapping', input, request))
  await assert.rejects(action('mapping', { ...input, sku: 'CHANGED' }, request), /reused/)
})

test('a cold PostgreSQL backup restores balances, permissions, historical rules and queued receipts', { timeout: 60000 }, async () => {
  const event = sale()
  const accepted = await callAs('service_role', null, 'ingest_pos', [integration, event, 'a'.repeat(64)])
  const snapshotSql = "select jsonb_build_object('health',private.database_health(),'receipts',(select count(*) from public.transactions),'rules',(select count(*) from public.campaign_rule_versions),'inbox',(select count(*) from private.pos_inbox)) as snapshot"
  const before = (await one(snapshotSql)).snapshot
  await db.end(); db = null
  const restored = await runtime.restoreCopy()
  try {
    assert.deepEqual((await restored.query(snapshotSql)).rows[0].snapshot, before)
    assert.equal((await restored.query('select state from private.pos_inbox where id=$1', [accepted.inboxId])).rows[0].state, 'pending')
    const result = await rpc('process_pos', [integration, accepted.inboxId], restored)
    assert.equal(result.state, 'processed')
    await restored.query('set role anon')
    await assert.rejects(restored.query('select * from public.customers'), /permission denied/)
    await restored.query('reset role')
    await assert.rejects(restored.query('update public.loyalty_ledger set delta=0'), /append-only/)
  } finally { await restored.end() }
})
