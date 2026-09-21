import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveSupabaseSettings, pearlPublicSettings, authErrorMessage } from '../src/supabase/settings.js'

test('a Vercel build without local env connects to the confirmed Pearl project', () => {
  assert.deepEqual(resolveSupabaseSettings({}), { ...pearlPublicSettings, configured: true })
})
test('partial overrides never combine credentials from different projects; server keys fail closed', () => {
  assert.equal(resolveSupabaseSettings({ VITE_SUPABASE_URL: 'https://another.supabase.co' }).configured, false)
  assert.equal(resolveSupabaseSettings({ VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_not-for-browser' }).configured, false)
  const token = claims => `eyJ.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.test`
  assert.equal(resolveSupabaseSettings({ VITE_SUPABASE_URL: pearlPublicSettings.url, VITE_SUPABASE_ANON_KEY: token({ role: 'service_role' }) }).configured, false)
  assert.equal(resolveSupabaseSettings({ VITE_SUPABASE_URL: pearlPublicSettings.url, VITE_SUPABASE_ANON_KEY: token({ role: 'anon', ref: 'another' }) }).configured, false)
})
test('sign-in failures explain the next action without claiming verification succeeded', () => {
  assert.match(authErrorMessage({ code: 'email_not_confirmed' }), /confirm your email/)
  assert.match(authErrorMessage({ code: 'email_address_not_authorized' }), /email service setup/)
  assert.match(authErrorMessage({ code: 'provider_disabled' }), /email and password/)
  assert.match(authErrorMessage({ message: 'OAuth state parameter missing' }), /Start again/)
})
