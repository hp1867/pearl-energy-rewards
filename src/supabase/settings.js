// These are public browser connection details, not administrator credentials.
// Keeping the Pearl project defaults here lets a fresh Vercel build connect.
export const pearlPublicSettings = Object.freeze({
  url: 'https://zaooprrcqphzocigtrxg.supabase.co',
  key: 'sb_publishable_PlQq0YoZB9aF2D1aznFsZQ_RwLx9Ac4',
})

export function resolveSupabaseSettings(env = {}) {
  const suppliedUrl = String(env.VITE_SUPABASE_URL || '').trim()
  const suppliedKey = String(env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim()
  // An explicit environment must provide a complete pair; never mix projects.
  const { url, key } = suppliedUrl || suppliedKey ? { url: suppliedUrl, key: suppliedKey } : pearlPublicSettings
  let publicKey = key.startsWith('sb_publishable_')
  if (key.startsWith('eyJ')) {
    try {
      const claims = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
      publicKey = claims.role === 'anon' && (!claims.ref || new URL(url).hostname === `${claims.ref}.supabase.co`)
    } catch { publicKey = false }
  }
  const configured = publicKey && (/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || /^http:\/\/(localhost|127\.0\.0\.1):54321$/.test(url))
  return { url, key, configured }
}

export function authErrorMessage(error) {
  const code = error?.code || '', message = error?.message || ''
  if (code === 'invalid_credentials') return 'The email or password is incorrect. Check both, or use Forgot password.'
  if (code === 'phone_exists' || code === 'phone_already_exists') return 'This phone number cannot be used for another account. Sign in to your existing account.'
  if (code === 'sms_send_failed') return 'We could not send the verification code. Please retry later or contact Pearl Energy support.'
  if (code === 'otp_disabled') return 'Phone verification is not available yet. Pearl Energy needs to complete its SMS setup.'
  if (code === 'email_not_confirmed') return 'Please confirm your email before logging in. Check your inbox and spam folder, or resend the confirmation email.'
  if (code === 'email_address_not_authorized' || /email address not authorized/i.test(message)) return 'Account emails are not available for this address yet. Pearl Energy needs to finish its email service setup. Please contact support.'
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || error?.status === 429) return 'Too many attempts. Please wait a few minutes before trying again.'
  if (code === 'provider_disabled' || /unsupported provider|provider is not enabled/i.test(message)) return 'This sign-in option is not available yet. Please use email and password.'
  if (code === 'otp_expired' || /expired|code verifier|oauth state/i.test(message)) return 'This sign-in link has expired or was opened in a different browser. Start again here and open the new link in this browser.'
  if (code === 'weak_password') return 'Choose a stronger password with at least 10 characters.'
  if (/failed to fetch|network|load failed/i.test(message)) return 'Could not reach the sign-in service. Check your internet connection and retry.'
  return message || 'Unable to complete sign-in. Please retry.'
}
