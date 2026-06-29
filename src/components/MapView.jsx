import { useEffect, useRef } from 'react'
import { integrations } from '../config/integrations'

// Loads the Google Maps JS SDK once, on demand.
let mapsPromise = null
function loadMaps(key) {
  if (window.google?.maps) return Promise.resolve(window.google.maps)
  if (mapsPromise) return mapsPromise
  mapsPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async`
    s.async = true
    s.onload = () => resolve(window.google.maps)
    s.onerror = reject
    document.head.appendChild(s)
  })
  return mapsPromise
}

const pin = (color) => ({
  path: 'M12 0C7 0 3 4 3 9c0 6 9 15 9 15s9-9 9-15c0-5-4-9-9-9z',
  fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2,
  scale: 1.4, anchor: { x: 12, y: 24 },
})

// Real Google map with station markers. Rendered only when a Maps key exists;
// otherwise StoreLocator shows its illustrated fallback map.
export default function MapView({ stations, activeId, onSelect }) {
  const ref = useRef(null)
  const map = useRef(null)
  const markers = useRef({})

  useEffect(() => {
    let cancelled = false
    loadMaps(integrations.maps.key).then((maps) => {
      if (cancelled || !ref.current) return
      map.current = new maps.Map(ref.current, {
        center: { lat: stations[0].lat, lng: stations[0].lng },
        zoom: 11, disableDefaultUI: true, gestureHandling: 'greedy',
        styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }],
      })
      stations.forEach((s) => {
        const m = new maps.Marker({
          position: { lat: s.lat, lng: s.lng }, map: map.current, title: s.name,
          icon: { ...pin(s.id === activeId ? '#00408b' : '#0057b8'), anchor: new maps.Point(12, 24) },
        })
        m.addListener('click', () => onSelect(s))
        markers.current[s.id] = m
      })
      // fit the whole network so zooming reveals every store
      if (stations.length > 1) {
        const bounds = new maps.LatLngBounds()
        stations.forEach((s) => bounds.extend({ lat: s.lat, lng: s.lng }))
        map.current.fitBounds(bounds, 48)
      }
    }).catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // reflect the active station
  useEffect(() => {
    const maps = window.google?.maps
    if (!maps || !map.current) return
    stations.forEach((s) => {
      const m = markers.current[s.id]
      if (m) m.setIcon({ ...pin(s.id === activeId ? '#00408b' : '#0057b8'), scale: s.id === activeId ? 1.8 : 1.4, anchor: new maps.Point(12, 24) })
    })
    const a = stations.find((s) => s.id === activeId)
    if (a) map.current.panTo({ lat: a.lat, lng: a.lng })
  }, [activeId, stations])

  return <div ref={ref} style={{ position: 'absolute', inset: 0 }} />
}
