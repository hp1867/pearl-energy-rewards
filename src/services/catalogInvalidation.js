// Catalog display reads only. Unknown/key-only DELETE payloads refresh safely.
// Include old and new kinds in case an item moves between categories of catalog.
export function catalogChangeAffectsKind(kind, change) {
  const previous = change?.old?.kind
  const next = change?.new?.kind
  if (!previous && !next) return true
  return previous === kind || next === kind
}
