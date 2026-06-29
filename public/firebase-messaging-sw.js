/* Firebase Cloud Messaging service worker.
   Receives your Firebase config via the registration query string
   (see src/firebase/messaging.js), so there's nothing to hard-code here.
   Only active once you've enabled FCM with a VAPID key. */
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js')

const cfg = Object.fromEntries(new URLSearchParams(self.location.search))

if (cfg.apiKey) {
  firebase.initializeApp(cfg)
  const messaging = firebase.messaging()
  messaging.onBackgroundMessage((payload) => {
    const n = payload.notification || {}
    self.registration.showNotification(n.title || 'Pearl Energy Rewards', {
      body: n.body || '',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
    })
  })
}
