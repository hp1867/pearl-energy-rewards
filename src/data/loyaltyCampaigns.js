// Campaign display constants. Importing these never seeds a demo database.
export const MISSION_TARGET = 4
export const MISSION_WINDOW_DAYS = 14

// The prize pool shown in the "how it works" popup. Weights set rarity —
// which prize the customer actually gets stays secret until they finish.
export const MISSION_PRIZES = [
  { type: 'points', value: 100, label: '100 Bonus Points', img: '⭐', weight: 40 },
  { type: 'points', value: 200, label: '200 Bonus Points', img: '⚡', weight: 25 },
  { type: 'points', value: 500, label: '500 Bonus Points', img: '💎', weight: 10 },
  { type: 'coupon', label: 'Free Regular Coffee', img: '☕', color: '#7a4a2b', weight: 20 },
  { type: 'coupon', label: 'Free Snack', img: '🍫', color: '#8e44ad', weight: 5 },
]

export const WHEEL_PRIZES = [
  { id: 'disc5', label: '5% Off', img: '🏷️', color: '#0057b8', weight: 25, type: 'coupon', title: '5% Off Next Purchase' },
  { id: 'drink', label: 'Free Drink', img: '🥤', color: '#16a085', weight: 20, type: 'coupon', title: 'Free Drink (600ml)' },
  { id: 'double', label: 'Double Points', img: '⚡', color: '#f39c12', weight: 20, type: 'double' },
  { id: 'gift', label: 'Mystery Gift', img: '🎁', color: '#8e44ad', weight: 10, type: 'coupon', title: 'Mystery Gift — reveal in store' },
  { id: 'entries', label: '5 Draw Entries', img: '🎟️', color: '#c0392b', weight: 25, type: 'entries', value: 5 },
]
export const WHEEL_QUALIFYING_CATS = ['lollies', 'snacks', 'biscuits', 'bakery']
export const WHEEL_MIN_SPEND = 50
