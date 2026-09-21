import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normaliseMobile, latestPolicies } from '../src/services/memberIdentity.js'

test('Australian phone variants normalize to one identity; international input requires a country code', () => {
  for (const value of ['0412 345 678', '+61 (412) 345-678', '61412345678']) assert.equal(normaliseMobile(value), '+61412345678')
  assert.equal(normaliseMobile('+44 7700 900123'), '+447700900123')
  for (const value of ['', '12345', '7700900123', '+61garbage', '+1234567890123456']) assert.throws(() => normaliseMobile(value))
})

test('policy selection displays the most recently published version for each document', () => {
  const rows = [{ kind: 'privacy', version: 'a', published_at: '2026-01-01' }, { kind: 'privacy', version: 'b', published_at: '2026-02-01' }]
  assert.equal(latestPolicies(rows).privacy.version, 'b')
  assert.equal(latestPolicies(rows).terms, undefined)
})
import { rememberSignInConsent, takeSignInConsent } from '../src/services/signInConsent.js'

test('sign-in consent uses only displayed versions and expires after an OAuth attempt', () => {
  const values = new Map()
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
  const versions = { terms: 'v1', privacy: 'v2' }
  rememberSignInConsent(versions, storage, 1000)
  assert.deepEqual(takeSignInConsent(storage, 1001), versions)
  assert.equal(takeSignInConsent(storage, 1002), null)
  rememberSignInConsent(versions, storage, 1000)
  assert.equal(takeSignInConsent(storage, 1000 + 31 * 60 * 1000), null)
  rememberSignInConsent({ terms: 'v1' }, storage)
  assert.equal(takeSignInConsent(storage), null)
})
