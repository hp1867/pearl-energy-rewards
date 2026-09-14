// Notifications never include account balances or customer data on lock screens.
self.addEventListener('push', event => {
  let payload = {}
  try { payload = event.data?.json() || {} } catch { /* generic message */ }
  event.waitUntil(self.registration.showNotification('Pearl Energy', {
    body: String(payload.body || 'You have a new message in the Pearl Energy app.').slice(0, 200),
    tag: payload.id || 'pearl-message', data: { path: '/' },
  }))
})
self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(self.clients.openWindow('/'))
})
