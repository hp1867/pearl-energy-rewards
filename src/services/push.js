import { integrations } from '../config/integrations'
import { requireSupabase } from '../supabase/client'

export async function enablePush() {
  if (!integrations.push.ready) return { ok: false, message: 'Web Push needs its public VAPID key and a configured delivery worker. In-app notifications are available without push.' }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return { ok: false, message: 'Push notifications are not supported by this browser.' }
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return { ok: false, message: 'Notification permission was not granted.' }
    const registration = await navigator.serviceWorker.register('/pearl-push-sw.js')
    const encoded = integrations.push.vapidKey.replace(/-/g, '+').replace(/_/g, '/')
    const key = Uint8Array.from(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')), c => c.charCodeAt(0))
    const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
    const { error } = await requireSupabase().rpc('register_push_device', { p_subscription: subscription.toJSON() })
    if (error) throw error
    return { ok: true, message: 'Push notifications enabled.' }
  } catch (error) { return { ok: false, message: error.message || 'Could not enable notifications.' } }
}
