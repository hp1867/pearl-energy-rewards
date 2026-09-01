// Firebase Cloud Messaging (push) — enabled only when Firebase + a VAPID key
// are configured. Until then enablePush() is a graceful no-op.
import { integrations } from '../config/integrations'
import { auth, db, firebaseConfig } from './config'
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'

async function tokenDocumentId(token) {
  const bytes = new TextEncoder().encode(token)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
}

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

  if (auth.currentUser && token) {
    const deviceId = await tokenDocumentId(token)
    const ref = doc(db, 'customers', auth.currentUser.uid, 'devices', deviceId)
    const existing = await getDoc(ref)
    const common = {
      customerUid: auth.currentUser.uid,
      token,
      platform: 'web',
      notificationsEnabled: true,
      lastSeenAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
    if (existing.exists()) await updateDoc(ref, common)
    else await setDoc(ref, { ...common, createdAt: serverTimestamp() })
  }

  // surface foreground messages to the app
  onMessage(messaging, (payload) => window.dispatchEvent(new CustomEvent('pe-push', { detail: payload })))

  return { ok: true, message: 'Push notifications enabled 🔔', token }
}
