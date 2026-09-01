import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { verifyRequest } from '../src/posService.js'

const secret = 'test-secret-that-is-long-enough-for-hmac-only'

function request({ timestamp = Math.floor(Date.now() / 1000), body = '{"eventId":"evt-1"}', signature } = {}) {
  const rawBody = Buffer.from(body)
  const calculated = createHmac('sha256', secret)
    .update(String(timestamp)).update('.').update(rawBody).digest('hex')
  const headers = {
    'x-pearl-timestamp': String(timestamp),
    'x-pearl-signature': `sha256=${signature || calculated}`,
  }
  return {
    rawBody,
    body: JSON.parse(body),
    get(name) { return headers[String(name).toLowerCase()] },
  }
}

test('valid timestamped HMAC authenticates the exact raw POS body', () => {
  const result = verifyRequest(request(), secret)
  assert.equal(result.rawBody.toString(), '{"eventId":"evt-1"}')
  assert.match(result.rawPayloadHash, /^[a-f0-9]{64}$/)
})

test('invalid signatures are rejected', () => {
  assert.throws(() => verifyRequest(request({ signature: '0'.repeat(64) }), secret), /Invalid POS signature/)
})

test('stale signed requests are rejected to prevent replay', () => {
  const stale = Math.floor(Date.now() / 1000) - (6 * 60)
  assert.throws(() => verifyRequest(request({ timestamp: stale }), secret), /outside the allowed window/)
})

test('a missing server secret fails closed', () => {
  assert.throws(() => verifyRequest(request(), ''), /not configured/)
})

