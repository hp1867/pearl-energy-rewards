// Only document versions actually displayed beside the clicked sign-in button.
// No tokens/passwords and no automatic marketing opt-in.
const key = 'pearl-sign-in-consent'
let memory
function sessionStorageOrNull() { try { return globalThis.sessionStorage } catch { return null } }
export function rememberSignInConsent(versions, storage = sessionStorageOrNull(), now = Date.now()) {
  memory = versions?.terms && versions?.privacy ? { versions, expires: now + 30 * 60 * 1000 } : null
  try { if (memory) storage?.setItem(key, JSON.stringify(memory)); else storage?.removeItem(key) } catch { /* same-page fallback */ }
}
export function takeSignInConsent(storage = sessionStorageOrNull(), now = Date.now()) {
  let choice = memory
  memory = null
  try { const saved = storage?.getItem(key); storage?.removeItem(key); if (saved) choice = JSON.parse(saved) } catch { /* unavailable or malformed storage */ }
  return choice?.expires > now && choice?.versions?.terms && choice?.versions?.privacy ? choice.versions : null
}
