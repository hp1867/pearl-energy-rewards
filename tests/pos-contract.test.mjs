import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { canonicalizePosEvent, normalizeMembership, semanticHash, verifyPosSignature, readLimitedBody } from '../supabase/functions/_shared/pos-contract.mjs'
const event = () => ({ eventId:'evt-1',eventType:'sale',externalTransactionId:'txn-1',occurredAt:'2026-01-01T00:00:00Z',businessDate:'2026-01-01',storeId:'s1',terminalId:'t1',receiptNumber:'r1',currency:'AUD',subtotalCents:1000,totalCents:1000,
  items:[{ lineId:'1',description:'Coffee',category:'drinks',totalCents:1000 }],payments:[{ method:'card',amountCents:1000 }] })
test('live membership QR parses only the identifier, not demo balances', () => {
  assert.equal(normalizeMembership('PEARL|1|PE-1234-5678'),'PE12345678')
  assert.throws(() => normalizeMembership('PEARL|PE-1234|10000000|999999'), /Unsupported/)
})
test('money is integer cents and receipt/payment totals are checked', () => {
  assert.equal(canonicalizePosEvent(event(),'test').totalCents,1000)
  assert.throws(() => canonicalizePosEvent({ ...event(),totalCents:10.5 },'test'), /Invalid totalCents/)
  assert.throws(() => canonicalizePosEvent({ ...event(),payments:[{ method:'card',amountCents:999 }] },'test'), /Payment totals/)
  assert.throws(() => canonicalizePosEvent({ ...event(),businessDate:'2026-02-31' },'test'), /business date/)
})
test('payment credentials and nested card data never enter the database', () => {
  assert.throws(() => canonicalizePosEvent({ ...event(),extra:{ cardNumber:'TEST' } },'test'), /Card credentials/)
  assert.throws(() => canonicalizePosEvent({ ...event(),payments:[{ method:'card',amountCents:1000,cvv:'TEST' }] },'test'), /Card credentials/)
})
test('malformed nested values produce a validation error, not a server exception', () => {
  for (const changed of [{items:[null]}, {payments:[null]}, {nightDealSales:[null]}, {items:[{...event().items[0], fuel:[]}]}, {items:[{...event().items[0], eligibleForPoints:'false'}]}]) {
    assert.throws(() => canonicalizePosEvent({...event(),...changed}, 'test'), error => error.status === 400)
  }
  assert.throws(() => canonicalizePosEvent({...event(),taxCents:1001}, 'test'), /Tax cannot exceed/)
})
test('semantic hashes tolerate a new delivery ID but reject changed business input', async () => {
  const a=canonicalizePosEvent(event(),'test'),b={ ...a,eventId:'retry-2' }
  assert.equal(await semanticHash(a),await semanticHash(b))
  assert.notEqual(await semanticHash(a),await semanticHash({ ...b,receiptNumber:'different' }))
})
test('HMAC verifies exact bytes, key ID, contract version and a five-minute window', async () => {
  const secret='test-only-'.repeat(8),keyId='test-key',timestamp=String(Math.floor(Date.now()/1000)),rawBody=JSON.stringify(event())
  const signature=createHmac('sha256',secret).update(`v1.${keyId}.${timestamp}.${rawBody}`).digest('hex')
  const input={ secret,keyId,timestamp,rawBody,signature }
  await verifyPosSignature(input)
  await assert.rejects(verifyPosSignature({ ...input,rawBody:rawBody+' ' }),/signature/)
  await assert.rejects(verifyPosSignature({ ...input,keyId:'other-key' }),/signature/)
  await assert.rejects(verifyPosSignature({ ...input,now:Date.now()+301000 }),/expired/)
  await assert.rejects(verifyPosSignature({ ...input,signature:'invalid' }),/signature/)
})
test('streaming payload limit rejects oversized bodies without trusting Content-Length', async () => {
  const request = new Request('https://test.invalid/',{ method:'POST',body:'X'.repeat(100) })
  await assert.rejects(readLimitedBody(request,50),/too large/)
})
