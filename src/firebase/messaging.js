// Firebase Cloud Messaging (push) — enabled only when Firebase + a VAPID key
// are configured. Until then enablePush() is a graceful no-op.
import { integrations } from '../config/integrations'
import { firebaseConfig } from './config'

export async function enablePush() {
  if (!integrations.fcm.ready) return { ok: false, message: 'Push not configured yet (needs Firebase + VAPID key)' }
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return { ok: false, message: 'Push not supported on this browser' }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, message: 'Notifications permission denied' }

  // hand the Firebase config to the service worker via query string
  const qs = new URLSearchParams(firebaseConfig).toString()
  const reg = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${qs}`)

  const { getMessaging, getToken, onMessage } = await import('firebase/messaging')
  const messaging = getMessaging()
  const token = await getToken(messaging, { vapidKey: integrations.fcm.vapidKey, serviceWorkerRegistration: reg })

  // surface foreground messages to the app
  onMessage(messaging, (payload) => window.dispatchEvent(new CustomEvent('pe-push', { detail: payload })))

  // NOTE: in production, save `token` to the customer's record so the backend can target them.
  return { ok: true, message: 'Push notifications enabled 🔔', token }
}
