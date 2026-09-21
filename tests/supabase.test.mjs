import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'node:crypto'

const db = new PGlite()
const customer = randomUUID(), other = randomUUID(), admin = randomUUID(), manager = randomUUID()
let customerId, otherId, integration
const query = (sql, args = []) => db.query(sql, args)
const one = async (sql, args) => (await query(sql, args)).rows[0]
async function as(role, uid, work) {
  await db.exec(`set role ${role}`)
  await query("select set_config('request.jwt.claim.sub',$1,false)", [uid || ''])
  try { return await work() } finally { await db.exec('reset role') }
}
const rpc = (name, args) => one(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as result`, args).then(r => r.result)
const pos = (event, hash = 'a'.repeat(64)) => as('service_role', null, () => rpc('record_pos', [integration, event, hash]))
async function retainedReview(event, expectedMessage, expectedState = 'review') {
  const result = await pos(event)
  assert.equal(result.state, expectedState)
  const inbox = await one('select last_error,transaction_id from private.pos_inbox where id=$1', [result.inboxId])
  assert.match(inbox.last_error, expectedMessage)
  assert.equal(inbox.transaction_id, null)
  return result
}
const sale = (overrides = {}) => ({
  contractVersion: 1, provider: 'test', eventId: randomUUID(), eventType: 'sale',
  externalTransactionId: randomUUID(), occurredAt: new Date().toISOString(), businessDate: '2026-09-14',
  storeId: 'external-a', terminalId: 't1', receiptNumber: 'r1', currency: 'AUD',
  subtotalCents: 10000, taxCents: 909, totalCents: 10000, membershipCode: '10000000',
  items: [{ lineId: '1', description: 'Shop purchase', category: 'snacks', quantityMilli: 1000, unitPriceMicros: 100000000, totalCents: 10000, eligibleForPoints: true }],
  payments: [{ method: 'card', amountCents: 10000 }], ...overrides,
})

before(async () => {
  // PostgreSQL engine with a minimal Auth/RPC role shim, not a mock SQL parser.
  // Hosted Auth, Realtime, gateway and multi-connection load tests are separate.
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create sequence auth.test_phone;
    create table auth.users (id uuid primary key, email text unique, email_confirmed_at timestamptz, phone text unique default ('614'||lpad(nextval('auth.test_phone')::text,8,'0')), phone_confirmed_at timestamptz default now(), raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `)
  const dir = new URL('../supabase/migrations/', import.meta.url)
  for (const file of (await readdir(dir)).filter(f => f.endsWith('.sql')).sort()) {
    try { await db.exec(await readFile(new URL(file, dir), 'utf8')) }
    catch (error) { throw new Error(`Migration ${file}: ${error.message}`, { cause: error }) }
  }
  for (const [id, email] of [[customer, 'customer@test.invalid'], [other, 'other@test.invalid'], [admin, 'admin@test.invalid'], [manager, 'manager@test.invalid']]) {
    await query('insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())', [id, email])
  }
  await db.exec("insert into public.policy_versions(kind,version,body) select kind,'test-v1','LOCAL TEST FIXTURE ONLY. These are synthetic policies and must never be published to customers.' from unnest(array['terms','privacy','closure']) kind")
  customerId = await as('authenticated', customer, () => rpc('complete_registration', [{ terms: 'test-v1', privacy: 'test-v1' }]))
  otherId = await as('authenticated', other, () => rpc('complete_registration', [{ terms: 'test-v1', privacy: 'test-v1' }]))
  await query("insert into private.staff_access(user_id,role) values ($1,'admin')", [admin])
  await db.exec("insert into public.stations(id,name) values ('a','Pearl Test A'),('b','Pearl Test B')")
  integration = (await one("insert into private.pos_integrations(provider,station_id,external_store_id,active) values ('test','a','external-a',true) returning id")).id
  await db.exec("insert into public.catalog_items(kind,id,title,price_cents) values('menu','test-drink','Test drink',500),('menu','test-pie','Test pie',600)")
  for (const [sku,product] of [['DRINK','test-drink'],['PIE','test-pie']]) {
    await query("insert into private.pos_product_mappings(integration_id,sku,product_kind,product_id,category,eligible_for_points,effective_from) values($1,$2,'menu',$3,'bakery',true,'-infinity')",[integration,sku,product])
  }
})
after(() => db.close())

test('hosted smoke script exercises real roles and rolls back every fixture', async () => {
  const count = () => one('select (select count(*) from auth.users) as users, (select count(*) from public.customers) as customers, (select count(*) from public.transactions) as transactions')
  const before = await count()
  try { await db.exec(await readFile(new URL('./hosted-smoke.sql', import.meta.url), 'utf8')) }
  catch (error) {
    await db.exec('rollback; reset role')
    throw new Error(`Hosted smoke script: ${error.message}`)
  }
  assert.deepEqual(await count(), before)
})

test('migration enables RLS on every exposed table; anonymous and customer writes are denied', async () => {
  const rows = (await query("select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity")).rows
  assert.deepEqual(rows, [])
  await assert.rejects(as('anon', null, () => query('select * from public.customers')), /permission denied/)
  await assert.rejects(as('authenticated', customer, () => query('update public.loyalty_accounts set balance=999999')), /permission denied/)
  await assert.rejects(as('authenticated', customer, () => query("insert into private.staff_access(user_id,role) values ($1,'admin')", [customer])), /permission denied/)
  await assert.rejects(as('authenticated', customer, () => rpc('record_pos', [integration, sale(), 'a'.repeat(64)])), /permission denied/)
})

test('customer identity is stable, profiles are idempotent, and reads are owner scoped', async () => {
  assert.equal(await as('authenticated', customer, () => rpc('ensure_profile', [{ firstName: 'No overwrite' }])), customerId)
  const rows = await as('authenticated', customer, () => query('select id from public.customers'))
  assert.deepEqual(rows.rows, [{ id: customerId }])
  await assert.rejects(as('authenticated', customer, () => rpc('update_profile', [{ points: 99999 }])), /Unsupported/)
  await as('authenticated', customer, () => rpc('update_profile', [{ firstName: 'Pearl' }]))
  assert.equal((await one('select first_name from public.customers where id=$1', [customerId])).first_name, 'Pearl')
})

test('POS records atomically, retries only once and conflicts reject altered payloads', async () => {
  const event = sale()
  const first = await pos(event)
  const retry = await pos(event)
  assert.equal(retry.transactionId, first.transactionId)
  assert.equal(retry.duplicate, true)
  assert.equal((await one('select balance from public.loyalty_accounts where customer_id=$1', [customerId])).balance, 100)
  await assert.rejects(pos(event, 'b'.repeat(64)), /reused with different/)
  await assert.rejects(pos(sale({ storeId: 'external-b' })), /not authorised/)
  assert.equal((await query('select * from public.transactions')).rows.length, 1)
  const others = await as('authenticated', other, () => query('select * from public.transactions'))
  assert.equal(others.rows.length, 0)
  assert.equal((await as('authenticated', other, () => query('select * from public.transaction_items'))).rows.length, 0)
})

test('invalid financial input is retained for review without posting a receipt or points', async () => {
  const prior = await one('select balance from public.loyalty_accounts where customer_id=$1', [customerId])
  await retainedReview(sale({ payments: [{ method: 'card', amountCents: 9 }] }), /Payment totals/)
  const event = sale(); event.items[0].quantityMilli = -1
  await retainedReview(event, /check constraint/)
  assert.deepEqual(await one('select balance from public.loyalty_accounts where customer_id=$1', [customerId]), prior)
})

test('reward deduction and coupon creation are idempotent, bounded and owner-only', async () => {
  await as('authenticated', admin, () => rpc('save_catalog', ['rewards', { id: 'coffee', title: 'Coffee', cost: 40, img: '☕' }]))
  const rule=(await one("insert into public.reward_rules(reward_id,name,version,effective_from,discount_kind,discount_value,max_discount_cents) values('coffee','Test coffee',1,'-infinity','free',0,500) returning id")).id
  await query("insert into public.reward_rule_products values($1,'menu','test-drink')",[rule])
  const request = randomUUID()
  const result = await as('authenticated', customer, () => rpc('redeem_reward', ['coffee', request]))
  assert.equal(result.ok, true)
  assert.deepEqual(await as('authenticated', customer, () => rpc('redeem_reward', ['coffee', request])), result)
  await assert.rejects(as('authenticated', customer, () => rpc('redeem_reward', ['another', request])), /reused/)
  await assert.rejects(as('authenticated', other, () => rpc('redeem_reward', ['coffee', randomUUID()])), /Insufficient/)
  assert.equal((await query('select * from public.coupons')).rows.length, 1)
  assert.equal((await as('authenticated', other, () => query('select * from public.coupons'))).rows.length, 0)
  await assert.rejects(as('authenticated', customer, () => query("update public.coupons set status='redeemed'")), /permission denied/)
})

test('an unconfigured reward cannot charge points or issue an unusable paid coupon', async () => {
  await as('authenticated', admin, () => rpc('save_catalog', ['rewards', { id: 'unconfigured', title: 'Not configured', cost: 1 }]))
  const before = await one('select balance from public.loyalty_accounts where customer_id=$1', [customerId])
  await assert.rejects(as('authenticated', customer, () => rpc('redeem_reward', ['unconfigured', randomUUID()])), /No points have been deducted/)
  assert.deepEqual(await one('select balance from public.loyalty_accounts where customer_id=$1', [customerId]), before)
  assert.equal((await one("select count(*)::int as n from public.coupons where reward_id='unconfigured'")).n, 0)
})

test('refunds use original ownership/eligible lines and cannot exceed the original', async () => {
  const event = sale()
  await pos(event)
  const refund = sale({ eventType: 'refund', originalExternalTransactionId: event.externalTransactionId, totalCents: 5000,
    items: [{ ...event.items[0], totalCents: 5000, quantityMilli: 500, eligibleForPoints: false }], payments: [{ method: 'card', amountCents: 5000 }] })
  const result = await pos(refund)
  assert.equal(result.pointsDelta, -50)
  await retainedReview({ ...refund, eventId: randomUUID(), externalTransactionId: randomUUID(), membershipCode: '10000001' }, /membership differs/)
  const remaining = await pos({ ...refund, eventId: randomUUID(), externalTransactionId: randomUUID() })
  assert.equal(remaining.pointsDelta, -50)
  await retainedReview({ ...refund, eventId: randomUUID(), externalTransactionId: randomUUID() }, /exceeds/)
  await retainedReview({ ...refund, eventId: randomUUID(), externalTransactionId: randomUUID(), originalExternalTransactionId: 'missing' }, /Original sale not found/, 'retry')
})

test('ledger and receipt history cannot be edited even through privileged database writes', async () => {
  await assert.rejects(query('update public.loyalty_ledger set delta=0'), /append-only/)
  await assert.rejects(query('delete from public.transactions'), /append-only/)
  await assert.rejects(query("update private.audit_logs set action='hidden'"), /append-only/)
  const balance = await one('select a.balance, coalesce(sum(l.delta),0)::bigint as expected from public.loyalty_accounts a left join public.loyalty_ledger l on l.customer_id=a.customer_id where a.customer_id=$1 group by a.balance', [customerId])
  assert.equal(balance.balance, balance.expected)
})

test('branch managers are limited to assigned stations and revocation applies to existing sessions', async () => {
  await as('authenticated', admin, () => rpc('manage_staff', [{ email: 'manager@test.invalid', displayName: 'Manager', stationIds: ['a'], enabled: true }]))
  const now = new Date(); const end = new Date(now.getTime() + 60000)
  const deal = { stationId: 'a', productName: 'Pie', originalPriceCents: 650, dealPriceCents: 300, quantityAvailable: 6, startsAt: now.toISOString(), sellUntil: end.toISOString(), safetyCutoffAt: end.toISOString(), status: 'active' }
  const id = await as('authenticated', manager, () => rpc('save_catalog', ['nightDeals', deal]))
  await assert.rejects(as('authenticated', manager, () => rpc('save_catalog', ['nightDeals', { ...deal, stationId: 'b' }])), /access denied/)
  await assert.rejects(as('authenticated', manager, () => rpc('adjust_points', [customerId, 10, 'Unauthorised', randomUUID()])), /Main-admin/)
  await assert.rejects(as('authenticated', manager, () => rpc('save_catalog', ['nightDeals', { ...deal, id, version: 1, safetyCutoffAt: new Date(end.getTime() + 1000).toISOString() }])), /cannot be extended/)
  await as('authenticated', admin, () => rpc('manage_staff', [{ email: 'manager@test.invalid', stationIds: [], enabled: false }]))
  await assert.rejects(as('authenticated', manager, () => rpc('save_catalog', ['nightDeals', { ...deal, id, version: 1 }])), /access denied/)
})

test('expired night deals are hidden by database time with no cleanup worker', async () => {
  await db.exec("insert into public.night_deals(station_id,product_name,original_price_cents,deal_price_cents,quantity_available,business_date,starts_at,sell_until,safety_cutoff_at) values ('a','Expired pie',600,300,3,current_date,now()-interval '2 hours',now()-interval '1 hour',now()-interval '1 hour')")
  const rows = await as('authenticated', customer, () => query("select * from public.night_deals where product_name='Expired pie'"))
  assert.equal(rows.rows.length, 0)
})

test('admin corrections require a reason, are audited and idempotent', async () => {
  const id = randomUUID()
  const first = await as('authenticated', admin, () => rpc('adjust_points', [otherId, 40, 'Customer service correction', id]))
  assert.equal(first.points, 40)
  assert.deepEqual(await as('authenticated', admin, () => rpc('adjust_points', [otherId, 40, 'Customer service correction', id])), first)
  await assert.rejects(as('authenticated', admin, () => rpc('adjust_points', [customerId, 40, 'Changed request', id])), /reused/)
  await assert.rejects(as('authenticated', admin, () => rpc('adjust_points', [otherId, -100, 'Correction', randomUUID()])), /Insufficient/)
})

test('no privileged function is executable by anonymous users; account helpers cannot be called as POS', async () => {
  const rows = (await query("select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and has_function_privilege('anon',p.oid,'EXECUTE')")).rows
  assert.deepEqual(rows, [])
  await assert.rejects(as('authenticated', customer, () => query("select private.issue_prize($1,'shop_wheel',$2)", [customerId,randomUUID()])), /permission denied/)
})

test('spin credits are POS-issued, one-use and idempotent; another member cannot use them', async () => {
  const request = randomUUID()
  const first = await as('authenticated', customer, () => rpc('spin_wheel', [request]))
  assert.equal(first.ok, true)
  assert.deepEqual(await as('authenticated', customer, () => rpc('spin_wheel', [request])), first)
  await assert.rejects(as('authenticated', other, () => rpc('spin_wheel', [randomUUID()])), /No spins/)
  await assert.rejects(as('authenticated', customer, () => query("insert into public.wheel_credits(customer_id,transaction_id) values ($1,$2)", [customerId,randomUUID()])), /permission denied/)
  assert.equal((await query("select * from public.wheel_credits where state='spent'")).rows.length,1)
})

test('missions issue one server prize for four fuel receipts; a refund reverses its bonus', async () => {
  const uid=randomUUID()
  await query('insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())',[uid,'mission@test.invalid'])
  const id=await as('authenticated',uid,()=>rpc('complete_registration',[{ terms: 'test-v1', privacy: 'test-v1' }]))
  const number=String((await one('select customer_number from public.customers where id=$1',[id])).customer_number)
  const originalConfig=(await one("select config from public.campaigns where id='fuel_mission'")).config
  await query("update public.campaigns set config=jsonb_set(config,'{prizes}',$1) where id='fuel_mission'",[JSON.stringify([{type:'points',value:100,label:'100 Bonus Points',weight:100}])])
  let first
  for(let i=0;i<4;i++) {
    const event=sale({membershipCode:number,items:[{lineId:'1',description:'Fuel',category:'fuel',quantityMilli:1000,unitPriceMicros:100000000,totalCents:10000,eligibleForPoints:true,fuel:{gradeCode:'ULP91',litresMilli:50000}}]})
    if(!first)first=event
    await pos(event)
  }
  const status=await as('authenticated',uid,()=>rpc('campaign_status',[]))
  assert.equal(status.missionCount,4)
  assert.equal(status.missionPrize.value,100)
  assert.equal((await one('select balance from public.loyalty_accounts where customer_id=$1',[id])).balance,500)
  await pos({...first,eventId:randomUUID(),externalTransactionId:randomUUID(),eventType:'refund',originalExternalTransactionId:first.externalTransactionId})
  assert.equal((await one('select balance from public.loyalty_accounts where customer_id=$1',[id])).balance,300)
  assert.equal((await as('authenticated',uid,()=>rpc('campaign_status',[]))).missionCount,3)
  await query("update public.campaigns set config=$1 where id='fuel_mission'",[originalConfig])
})

test('double-points bonuses cannot be reversed twice across source and target refunds', async () => {
  const uid=randomUUID()
  await query('insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())',[uid,'double@test.invalid'])
  const id=await as('authenticated',uid,()=>rpc('complete_registration',[{ terms: 'test-v1', privacy: 'test-v1' }]))
  const number=String((await one('select customer_number from public.customers where id=$1',[id])).customer_number)
  const config=(await one("select config from public.campaigns where id='shop_wheel'")).config
  await query("update public.campaigns set config=jsonb_set(config,'{prizes}',$1) where id='shop_wheel'",[JSON.stringify([{id:'double',type:'double',label:'Double',weight:100}])])
  const first=sale({membershipCode:number}),second=sale({membershipCode:number})
  await pos(first)
  await as('authenticated',uid,()=>rpc('spin_wheel',[randomUUID()]))
  await pos(second)
  assert.equal((await one('select balance from public.loyalty_accounts where customer_id=$1',[id])).balance,300)
  for (const original of [first,second]) await pos({...original,eventId:randomUUID(),externalTransactionId:randomUUID(),eventType:'refund',originalExternalTransactionId:original.externalTransactionId})
  assert.equal((await one('select balance from public.loyalty_accounts where customer_id=$1',[id])).balance,0)
  await query("update public.campaigns set config=$1 where id='shop_wheel'",[config])
})

test('consumed promotional coupons create an admin review without losing the refund', async () => {
  const uid=randomUUID()
  await query('insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())',[uid,'coupon@test.invalid'])
  const id=await as('authenticated',uid,()=>rpc('complete_registration',[{ terms: 'test-v1', privacy: 'test-v1' }]))
  const number=String((await one('select customer_number from public.customers where id=$1',[id])).customer_number)
  const config=(await one("select config from public.campaigns where id='shop_wheel'")).config
  const rule=(await one("select id from public.reward_rules where reward_id='coffee'")).id
  await query("update public.campaigns set config=jsonb_set(config,'{prizes}',$1) where id='shop_wheel'",[JSON.stringify([{id:'drink',type:'coupon',title:'Free drink',weight:100,ruleId:rule}])])
  const source=sale({membershipCode:number})
  await pos(source)
  await as('authenticated',uid,()=>rpc('spin_wheel',[randomUUID()]))
  const coupon=(await one('select id from public.coupons where customer_id=$1',[id])).id
  const checkout=sale({membershipCode:number,couponIds:[coupon],couponRedemptions:[{couponId:coupon,lineId:'drink',quantityMilli:1000,discountCents:500}]})
  checkout.items.push({lineId:'drink',sku:'DRINK',description:'Drink',category:'bakery',quantityMilli:1000,unitPriceMicros:5000000,totalCents:0,grossTotalCents:500,eligibleForPoints:true})
  assert.equal((await pos(checkout)).state,'processed')
  const refund=await pos({...source,eventId:randomUUID(),externalTransactionId:randomUUID(),eventType:'refund',originalExternalTransactionId:source.externalTransactionId})
  assert.equal(refund.ok,true)
  assert.equal((await as('authenticated',uid,()=>rpc('campaign_status',[]))).promotionHold,true)
  await assert.rejects(as('authenticated',uid,()=>rpc('spin_wheel',[randomUUID()])),/staff review/)
  const review=(await as('authenticated',admin,()=>rpc('promotion_reviews',[]))).find(r=>r.customer_id===id)
  await assert.rejects(as('authenticated',uid,()=>rpc('resolve_promotion_review',[review.id,'Self approved'])),/Main-admin/)
  await as('authenticated',admin,()=>rpc('resolve_promotion_review',[review.id,'Reviewed customer-service exception']))
  assert.equal((await as('authenticated',uid,()=>rpc('campaign_status',[]))).promotionHold,false)
  await query("update public.campaigns set config=$1 where id='shop_wheel'",[config])
})

test('push endpoints are private, owner bound and cannot target arbitrary servers', async () => {
  const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/test-endpoint',keys:{p256dh:'A'.repeat(87),auth:'B'.repeat(22)}}
  await as('authenticated',customer,()=>rpc('register_push_device',[subscription]))
  await assert.rejects(as('authenticated',other,()=>query('select * from private.push_devices')),/permission denied/)
  await assert.rejects(as('authenticated',customer,()=>rpc('register_push_device',[{...subscription,endpoint:'https://127.0.0.1/admin'}])),/Unsupported/)
  await assert.rejects(as('authenticated',customer,()=>rpc('register_push_device',[{...subscription,endpoint:'https://fcmxgoogleapisxcom/admin'}])),/Unsupported/)
  await as('authenticated',other,()=>rpc('unregister_push_device',[subscription.endpoint]))
  assert.equal((await query('select * from private.push_devices')).rows.length,1)
  await as('authenticated',customer,()=>rpc('unregister_push_device',[subscription.endpoint]))
})

test('catalog stock is separate from publication; stale edits cannot overwrite newer values', async () => {
  const item={id:'stock-test',name:'Sold out pie',price:'$6.50',avail:false,active:true}
  await as('authenticated',admin,()=>rpc('save_catalog',['menu',item]))
  let row=await as('authenticated',customer,()=>one("select * from public.catalog_items where kind='menu' and id='stock-test'"))
  assert.equal(row.price_cents,650)
  assert.equal(row.in_stock,false)
  assert.equal(row.active,true)
  await as('authenticated',admin,()=>rpc('save_catalog',['menu',{...item,version:1,avail:true}]))
  await assert.rejects(as('authenticated',admin,()=>rpc('save_catalog',['menu',{...item,version:1,price:'$1.00'}])),/changed/)
  row=await one("select * from public.catalog_items where kind='menu' and id='stock-test'")
  assert.equal(row.price_cents,650)
  assert.equal(row.version,2)
  await as('authenticated',admin,()=>rpc('archive_catalog',['menu','stock-test']))
  assert.equal((await as('authenticated',customer,()=>query("select * from public.catalog_items where kind='menu' and id='stock-test'"))).rows.length,0)
  assert.equal((await one("select active from public.catalog_items where kind='menu' and id='stock-test'")).active,false)
})

test('register lookup returns only checkout data and requires an active service integration', async () => {
  const row=await as('service_role',null,()=>rpc('pos_member',[integration,'10000000']))
  assert.deepEqual(Object.keys(row).sort(),['coupons','customerNumber','firstName','membershipId','points'])
  assert.equal(row.customerNumber,'10000000')
  await assert.rejects(as('authenticated',customer,()=>rpc('pos_member',[integration,'10000000'])),/permission denied/)
  await assert.rejects(as('service_role',null,()=>rpc('pos_member',[randomUUID(),'10000000'])),/not authorised/)
  await assert.rejects(as('service_role',null,()=>rpc('pos_member',[integration,'UNKNOWN'])),/not found/)
})

test('valid product-linked coupons and stock apply once; later failures retain the sale', async () => {
  const coupon=(await one("select id from public.coupons where customer_id=$1 and reward_id='coffee' and status='active'",[customerId])).id
  const deal=(await one("insert into public.night_deals(station_id,product_name,product_id,original_price_cents,deal_price_cents,quantity_available,business_date,starts_at,sell_until,safety_cutoff_at) values ('a','Last two pies','test-pie',600,300,2,current_date,now()-interval '1 minute',now()+interval '1 hour',now()+interval '1 hour') returning id")).id
  const event=sale({couponIds:[coupon],couponRedemptions:[{couponId:coupon,lineId:'drink',quantityMilli:1000,discountCents:500}],nightDealSales:[{dealId:deal,quantity:2,lineId:'pies'}]})
  event.items[0].totalCents=9400
  event.items.push({lineId:'drink',sku:'DRINK',description:'Drink',category:'bakery',quantityMilli:1000,unitPriceMicros:5000000,totalCents:0,grossTotalCents:500,eligibleForPoints:true},
    {lineId:'pies',sku:'PIE',description:'Two pies',category:'bakery',quantityMilli:2000,unitPriceMicros:3000000,totalCents:600,eligibleForPoints:true})
  const first=await pos(event)
  assert.equal(first.state,'processed')
  assert.equal((await pos(event)).transactionId,first.transactionId)
  assert.deepEqual(await one('select quantity_available,status from public.night_deals where id=$1',[deal]),{quantity_available:0,status:'sold_out'})
  assert.equal((await one('select used_transaction_id from public.coupons where id=$1',[coupon])).used_transaction_id,first.transactionId)
  assert.deepEqual(await one('select quantity,deal_price_cents from public.transaction_night_deals where transaction_id=$1',[first.transactionId]),{quantity:2,deal_price_cents:300})
  assert.equal((await as('authenticated',other,()=>query('select * from public.transaction_night_deals'))).rows.length,0)
  await assert.rejects(query('update public.transaction_night_deals set quantity=999'),/append-only/)
  const balance=await one('select balance from public.loyalty_accounts where customer_id=$1',[customerId])
  const count=(await one('select count(*) as n from public.transactions')).n
  assert.equal((await pos(sale({couponIds:[coupon]}))).state,'processed')
  assert.equal((await pos(sale({nightDealSales:[{dealId:deal,quantity:1}]}))).state,'processed')
  assert.equal((await one('select count(*) as n from public.transactions')).n,count+2)
  assert.equal((await one('select balance from public.loyalty_accounts where customer_id=$1',[customerId])).balance,balance.balance+200)
})

test('push queue deduplicates, reclaims expired leases and rejects stale worker acknowledgements', async () => {
  const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/queue-test',keys:{p256dh:'A'.repeat(87),auth:'B'.repeat(22)}}
  await as('authenticated',customer,()=>rpc('register_push_device',[subscription]))
  await as('authenticated',admin,()=>rpc('save_catalog',['notifs',{id:'queue-test',title:'Store news',body:'An in-app announcement'}]))
  await assert.rejects(as('authenticated',admin,()=>rpc('claim_push_batch',[])),/permission denied/)
  let batch=await as('service_role',null,()=>rpc('claim_push_batch',[]))
  assert.equal(batch.length,1)
  const first=batch[0]
  assert.equal(first.attempt,1)
  assert.deepEqual(await as('service_role',null,()=>rpc('claim_push_batch',[])),[])
  await query("update private.push_deliveries set lease_until=now()-interval '1 second' where id=$1",[first.id])
  batch=await as('service_role',null,()=>rpc('claim_push_batch',[]))
  assert.equal(batch[0].attempt,2)
  await as('service_role',null,()=>rpc('finish_push',[first.id,1,true,true]))
  assert.equal((await one('select state from private.push_deliveries where id=$1',[first.id])).state,'processing')
  await as('service_role',null,()=>rpc('finish_push',[first.id,2,true,false]))
  assert.equal((await one('select state from private.push_deliveries where id=$1',[first.id])).state,'delivered')
  assert.deepEqual(await as('service_role',null,()=>rpc('claim_push_batch',[])),[])
  await as('authenticated',admin,()=>rpc('save_catalog',['notifs',{id:'archived-queue',title:'Withdraw this'}]))
  const withdrawn=(await as('service_role',null,()=>rpc('claim_push_batch',[])))[0]
  await as('service_role',null,()=>rpc('finish_push',[withdrawn.id,withdrawn.attempt,false,false]))
  await query("update private.push_deliveries set available_at=now()-interval '1 second' where id=$1",[withdrawn.id])
  await as('authenticated',admin,()=>rpc('archive_catalog',['notifs','archived-queue']))
  assert.deepEqual(await as('service_role',null,()=>rpc('claim_push_batch',[])),[])
  await as('authenticated',customer,()=>rpc('unregister_push_device',[subscription.endpoint]))
})

test('retiring an authentication identity preserves the portable customer and immutable ledger', async () => {
  const uid=randomUUID()
  await query('insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())',[uid,'retired@test.invalid'])
  const id=await as('authenticated',uid,()=>rpc('complete_registration',[{ terms: 'test-v1', privacy: 'test-v1' }]))
  await as('authenticated',admin,()=>rpc('adjust_points',[id,50,'Migration identity preservation check',randomUUID()]))
  await query('delete from auth.users where id=$1',[uid])
  assert.equal((await one('select auth_user_id from public.customers where id=$1',[id])).auth_user_id,null)
  assert.equal((await one('select balance from public.loyalty_accounts where customer_id=$1',[id])).balance,50)
  assert.equal((await one('select count(*) as n from public.loyalty_ledger where customer_id=$1',[id])).n,1)
})

test('promotion pause is reflected in member status and enforced by the server', async () => {
  await assert.rejects(as('authenticated',other,()=>rpc('manage_campaign',['shop_wheel',false])),/Main-admin/)
  await as('authenticated',admin,()=>rpc('manage_campaign',['shop_wheel',false]))
  assert.equal((await as('authenticated',other,()=>rpc('campaign_status',[]))).wheelActive,false)
  await assert.rejects(as('authenticated',other,()=>rpc('spin_wheel',[randomUUID()])),/paused/)
  await as('authenticated',admin,()=>rpc('manage_campaign',['shop_wheel',true]))
  assert.equal((await as('authenticated',other,()=>rpc('campaign_status',[]))).wheelActive,true)
})

test('editable authentication metadata never grants staff privileges', async () => {
  await query('update auth.users set raw_user_meta_data=$1 where id=$2',[{role:'admin',admin:true,permissions:['*']},other])
  assert.equal(await as('authenticated',other,()=>rpc('staff_session',[])),null)
  await assert.rejects(as('authenticated',other,()=>rpc('admin_customers',['',0])),/Main-admin/)
  await assert.rejects(as('authenticated',other,()=>rpc('manage_staff',[{email:'other@test.invalid',stationIds:['a']}])),/Main-admin/)
})

test('email and normalized verified phone identify one membership; metadata cannot claim a phone', async () => {
  assert.equal((await one("select private.normalise_phone('0412 345 678') as phone")).phone, '+61412345678')
  assert.equal((await one("select private.normalise_phone('+61 (412) 345-678') as phone")).phone, '+61412345678')
  await assert.rejects(query("insert into auth.users(id,email) values($1,'customer@test.invalid')", [randomUUID()]), /unique/)
  const uid = randomUUID()
  await query("insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at,raw_user_meta_data) values($1,'verify@test.invalid',now(),'61412345678',null,$2)", [uid, { mobile: '61400000001', phone_verified: true }])
  assert.equal((await as('authenticated', uid, () => rpc('member_onboarding', []))).needsPhone, false)
  assert.equal((await one('select mobile from public.customers where auth_user_id=$1', [uid])).mobile, '')
  await query('update auth.users set phone_confirmed_at=now() where id=$1', [uid])
  const id = await as('authenticated', uid, () => rpc('complete_registration', [{ terms: 'test-v1', privacy: 'test-v1' }]))
  assert.equal((await one('select mobile from public.customers where id=$1', [id])).mobile, '+61412345678')
  await assert.rejects(query("insert into public.customers(mobile) values('+61412345678')"), /unique/)
  await assert.rejects(as('authenticated', uid, () => rpc('update_profile', [{ mobile: '0499 999 999' }])), /SMS verification/)
  await query('update auth.users set phone_confirmed_at=null where id=$1', [uid])
  assert.equal((await as('authenticated', uid, () => query('select * from public.customers'))).rows.length, 1)
})

test('email-only onboarding activates exactly one membership without inventing policy consent', async () => {
  const uid = randomUUID()
  await query("insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at,raw_user_meta_data) values($1,'email-only@test.invalid',now(),null,null,$2)", [uid, { mobile: '+61400000001', phone_verified: true }])
  for (let i = 0; i < 3; i++) {
    const state = await as('authenticated', uid, () => rpc('member_onboarding', []))
    assert.equal(state.needsEmail, false)
    assert.equal(state.needsPhone, false)
    assert.equal(state.needsConsent, false)
  }
  const row = await one('select id,status,mobile from public.customers where auth_user_id=$1', [uid])
  assert.equal(row.status, 'active')
  assert.equal(row.mobile, '')
  assert.equal((await one('select count(*) as n from public.loyalty_accounts where customer_id=$1', [row.id])).n, 1)
  assert.equal((await one('select count(*) as n from public.consent_events where customer_id=$1', [row.id])).n, 0)
  await query("update public.customers set status='suspended' where id=$1", [row.id])
  await assert.rejects(as('authenticated', uid, () => rpc('member_onboarding', [])), /not active/)
  assert.equal((await as('authenticated', uid, () => query('select * from public.customers'))).rows.length, 0)
})

test('unverified email and forged metadata cannot activate membership', async () => {
  const uid = randomUUID()
  await query("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,'unverified@test.invalid',null,$2)", [uid, { email_verified: true, role: 'admin', registrationConsent: { terms: 'test-v1', privacy: 'test-v1' } }])
  assert.equal((await as('authenticated', uid, () => rpc('member_onboarding', []))).needsEmail, true)
  await assert.rejects(as('authenticated', uid, () => rpc('ensure_profile', [{}])), /Verify your email/)
  assert.equal((await one('select count(*) as n from public.customers where auth_user_id=$1', [uid])).n, 0)
})

test('sign-up document choices are recorded after verification, once only', async () => {
  const uid = randomUUID()
  await query("insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at,raw_user_meta_data) values($1,'signup-choice@test.invalid',now(),null,null,$2)", [uid, { registrationConsent: { terms: 'test-v1', privacy: 'test-v1' } }])
  await as('authenticated', uid, () => rpc('member_onboarding', []))
  await as('authenticated', uid, () => rpc('member_onboarding', []))
  assert.equal((await one('select count(*) as n from public.consent_events where actor_user_id=$1', [uid])).n, 2)
})

test('missing policies never block verified-email membership or fabricate agreement', async () => {
  await db.exec('begin; truncate public.policy_versions cascade')
  try {
    const uid = randomUUID()
    await query("insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values($1,'no-policy@test.invalid',now(),null,null)", [uid])
    const state = await as('authenticated', uid, () => rpc('member_onboarding', []))
    assert.equal(state.needsPolicies, true)
    assert.equal(state.needsConsent, false)
    const id = await as('authenticated', uid, () => rpc('ensure_profile', [{}]))
    assert.ok(id)
    assert.equal((await one('select count(*) as n from public.consent_events where customer_id=$1', [id])).n, 0)
  } finally { await db.exec('rollback') }
})

test('consent choices are append-only, owner-scoped and cannot be bypassed through profile preferences', async () => {
  const request = randomUUID()
  await as('authenticated', customer, () => rpc('set_marketing_consent', [true, request]))
  await as('authenticated', customer, () => rpc('set_marketing_consent', [true, request]))
  await assert.rejects(as('authenticated', customer, () => rpc('set_marketing_consent', [false, request])), /different choice/)
  await as('authenticated', customer, () => rpc('set_marketing_consent', [false, randomUUID()]))
  const rows = (await as('authenticated', customer, () => query("select decision from public.consent_events where purpose='marketing' order by id"))).rows
  assert.deepEqual(rows, [{ decision: 'accepted' }, { decision: 'withdrawn' }])
  assert.equal((await one('select preferences from public.customers where id=$1', [customerId])).preferences.marketing, false)
  await assert.rejects(as('authenticated', customer, () => rpc('update_profile', [{ preferences: { marketing: true } }])), /consent setting/)
  await assert.rejects(query("update public.consent_events set decision='accepted'"), /append-only/)
  await assert.rejects(query("update public.policy_versions set body='Changed legal text'"), /append-only/)
  await assert.rejects(as('authenticated', other, () => rpc('publish_policy', ['privacy', 'v2', 'Unauthorised customer changes to the public privacy policy text.'])), /Main-admin/)
  assert.equal((await as('anon', null, () => query('select * from public.policy_versions'))).rows.length, 3)
})

test('closing an account requires its disclosure and keeps history without transferring anything', async () => {
  const uid = randomUUID()
  await query("insert into auth.users(id,email,email_confirmed_at) values($1,'close@test.invalid',now())", [uid])
  const id = await as('authenticated', uid, () => rpc('complete_registration', [{ terms: 'test-v1', privacy: 'test-v1' }]))
  await assert.rejects(as('authenticated', uid, () => rpc('close_my_account', ['YES', 'test-v1'])), /Type CLOSE/)
  await assert.rejects(as('authenticated', uid, () => rpc('close_my_account', ['CLOSE', 'old-version'])), /current account closure disclosure/)
  await as('authenticated', uid, () => rpc('close_my_account', ['CLOSE', 'test-v1']))
  await as('authenticated', uid, () => rpc('close_my_account', ['CLOSE', 'test-v1']))
  assert.equal((await one('select status from public.customers where id=$1', [id])).status, 'closed')
  assert.equal((await one('select count(*) as n from private.account_closures where customer_id=$1', [id])).n, 1)
  assert.equal((await one('select count(*) as n from public.consent_events where customer_id=$1', [id])).n, 2)
  await assert.rejects(as('authenticated', uid, () => rpc('ensure_profile', [{}])), /not active/)
  await assert.rejects(as('authenticated', uid, () => rpc('member_onboarding', [])), /not active/)
  await assert.rejects(as('authenticated', uid, () => rpc('spin_wheel', [randomUUID()])), /active customer/)
})

test('support recovery is main-admin only, rate-limited, auditable and restricted to the registered email', async () => {
  const request = randomUUID()
  await assert.rejects(as('authenticated', other, () => rpc('begin_member_recovery', [customerId, request])), /Main-admin/)
  const claim = await as('authenticated', admin, () => rpc('begin_member_recovery', [customerId, request]))
  assert.equal(claim.shouldSend, true)
  assert.equal(claim.email, 'customer@test.invalid')
  assert.equal((await as('authenticated', admin, () => rpc('begin_member_recovery', [customerId, request]))).shouldSend, false)
  await assert.rejects(as('authenticated', admin, () => rpc('begin_member_recovery', [customerId, randomUUID()])), /rate limit/)
  await assert.rejects(as('authenticated', admin, () => rpc('finish_member_recovery', [request, true, null])), /permission denied/)
  await as('service_role', null, () => rpc('finish_member_recovery', [request, true, null]))
  assert.equal((await one('select state from private.account_recovery_requests where id=$1', [request])).state, 'sent')
  assert.equal((await one("select count(*) as n from private.audit_logs where action='account.recovery_requested' and target_id=$1", [customerId])).n, 1)
})
