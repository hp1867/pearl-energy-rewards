import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { catalogChangeAffectsKind } from '../src/services/catalogInvalidation.js'

const kinds = ['offers', 'rewards', 'menu', 'categories', 'fuel', 'notifs']
const affected = change => kinds.filter(kind => catalogChangeAffectsKind(kind, change))
test('a menu edit refreshes its catalog, not all six catalog queries', () => {
  assert.deepEqual(affected({ eventType: 'UPDATE', old: { kind: 'menu', id: '5' }, new: { kind: 'menu', id: '5' } }), ['menu'])
  assert.deepEqual(affected({ eventType: 'INSERT', new: { kind: 'offers' } }), ['offers'])
})
test('deletes, missing payloads and moved items still invalidate safely', () => {
  assert.deepEqual(affected({ eventType: 'DELETE', old: { kind: 'menu', id: '5' } }), ['menu'])
  assert.deepEqual(affected({ eventType: 'DELETE', old: { id: '5' } }), kinds)
  assert.deepEqual(affected(undefined), kinds)
  assert.deepEqual(affected({ old: { kind: 'menu' }, new: { kind: 'offers' } }), ['offers', 'menu'])
})

// Exercise the real watcher without a live database or a signed-in user.
async function watcherHarness(acceptsChange) {
  const source = await readFile(new URL('../src/services/supabaseProvider.js', import.meta.url), 'utf8')
  const watcher = source.slice(source.indexOf('function watch('), source.indexOf('\nfunction catalogRow('))
  const window = new EventTarget(), changed = new EventTarget(), errors = []
  let handler, status, poll, removed = false, calls = 0
  window.setInterval = callback => { poll = callback; return 1 }
  const channel = { on: (_, spec, callback) => { handler = callback; return channel }, subscribe: callback => { status = callback } }
  const scope = { window, changed, document: { hidden: false }, crypto: { randomUUID: () => 'test' }, clearInterval: () => { poll = null }, report: error => errors.push(error), supabase: { channel: () => channel, removeChannel: () => { removed = true } } }
  vm.createContext(scope)
  const watch = vm.runInContext(`(${watcher})`, scope)
  const received = []
  const stop = watch(['catalog_items'], async () => { calls++; return [] }, rows => received.push(rows), undefined, 60000, acceptsChange)
  const settle = () => new Promise(resolve => setImmediate(resolve))
  await settle()
  return { event: payload => handler(payload), status: value => status(value), poll: () => poll?.(), focus: () => window.dispatchEvent(new Event('focus')), changed: () => changed.dispatchEvent(new Event('refresh')), settle, stop, calls: () => calls, received, errors, removed: () => removed }
}
test('catalog selection keeps polling, reconnect, focus and mutation refreshes intact', async () => {
  const watch = await watcherHarness(change => catalogChangeAffectsKind('menu', change))
  assert.equal(watch.calls(), 1)
  watch.event({ new: { kind: 'rewards' } }); await watch.settle()
  assert.equal(watch.calls(), 1)
  watch.event({ new: { kind: 'menu' } }); await watch.settle()
  assert.equal(watch.calls(), 2)
  watch.status('SUBSCRIBED'); await watch.settle()
  watch.poll(); await watch.settle()
  watch.focus(); await watch.settle()
  watch.changed(); await watch.settle()
  assert.equal(watch.calls(), 6)
  watch.stop()
  watch.event({ new: { kind: 'menu' } }); watch.focus(); watch.poll(); watch.changed(); await watch.settle()
  assert.equal(watch.calls(), 6)
  assert.equal(watch.removed(), true)
  assert.deepEqual(watch.errors, [])
})
test('non-catalog watcher still refreshes every received event by default', async () => {
  const watch = await watcherHarness()
  watch.event({ new: { kind: 'menu' } }); await watch.settle()
  watch.event({ new: { balance: 100 } }); await watch.settle()
  assert.equal(watch.calls(), 3)
  watch.stop()
})
test('startup retains auth/profile gates and defers secondary screens only', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
  assert.ok(!app.includes('2400'))
  assert.ok(app.includes('const splash = resolving || (!!user && !user.recovery && !member && !profileError)'))
  assert.ok(app.includes('member?.onboarding && !user?.recovery'))
  assert.ok(app.includes('!authed || user?.recovery'))
  assert.ok(app.includes("import AuthScreen from './screens/AuthScreen'"))
  assert.ok(app.includes("import HomeScreen from './screens/HomeScreen'"))
  assert.ok(!app.includes("from './screens/Overlays'"))
})

test('all deferred screens export their components and the loading boundary renders', async () => {
  const { createServer } = await import('vite')
  const { createElement, lazy } = await import('react')
  const { renderToString } = await import('react-dom/server')
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  try {
    for (const name of ['OffersScreen', 'MenuScreen', 'RewardsScreen', 'ProfileScreen', 'NightDealsScreen']) {
      assert.equal(typeof (await server.ssrLoadModule(`/src/screens/${name}.jsx`)).default, 'function')
    }
    const overlays = await server.ssrLoadModule('/src/screens/Overlays.jsx')
    for (const name of ['FuelPrices', 'StoreLocator', 'WalletCard', 'ScanModal', 'Receipts', 'Notifications', 'MyCoupons', 'EditProfile', 'HelpSupport', 'TiersInfo', 'SpinWheel', 'ItemDetails']) assert.equal(typeof overlays[name], 'function', name)
    const Boundary = (await server.ssrLoadModule('/src/components/ScreenBoundary.jsx')).default
    assert.match(renderToString(createElement(Boundary, null, createElement('p', null, 'Ready'))), /Ready/)
    const Pending = lazy(() => new Promise(() => {}))
    const loading = renderToString(createElement(Boundary, { overlay: true, onClose: () => {} }, createElement(Pending)))
    assert.match(loading, /Loading screen/)
    assert.match(loading, /Back/)
  } finally { await server.close() }
})
