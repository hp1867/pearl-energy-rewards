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
