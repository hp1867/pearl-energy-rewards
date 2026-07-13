// Mock data for the Pearl Energy Rewards prototype.
// In production these come from the Node/Firebase backend + PostgreSQL.

export const member = {
  firstName: 'Hardik',
  lastName: 'Sharma',
  name: 'Hardik Sharma',
  membershipId: 'PE-4827-1903-5560',
  email: 'contact@sportsx.com.au',
  mobile: '+61 412 880 219',
  dob: '1994-07-12',
  points: 1840,
  tier: 'Gold',
  joined: 'Mar 2024',
  lifetimePoints: 9120,
  // 2-week Fuel Mission (4 fill-ups → bonus)
  missionStart: '2026-07-06',
  missionCount: 3,
  missionRewarded: false,
}

export const tiers = [
  { name: 'Blue', min: 0, color: '#0057B8', perk: '1x points' },
  { name: 'Silver', min: 1000, color: '#8a99b3', perk: '1.25x points + free coffee monthly' },
  { name: 'Gold', min: 1500, color: '#caa14a', perk: '1.5x points + fuel discounts' },
  { name: 'Platinum', min: 4000, color: '#5b6b85', perk: '2x points + priority offers' },
]

export const offers = [
  { id: 1, cat: 'Coffee Deals', title: 'Barista Coffee + Muffin', sub: 'Any size, any day', price: '$6.50', img: '☕', accent: '#7a4a2b', expiry: '30 Jun 2026', tag: 'POPULAR' },
  { id: 2, cat: 'Fuel Deals', title: '6¢ off per litre', sub: 'Weekend fuel special', price: 'Save big', img: '⛽', accent: '#0057B8', expiry: '08 Jun 2026', tag: 'ENDING SOON' },
  { id: 3, cat: 'Food Deals', title: 'Meal Combo', sub: 'Burger + Chips + Drink', price: '$11.90', img: '🍔', accent: '#c0392b', expiry: '21 Jun 2026', tag: 'COMBO' },
  { id: 4, cat: 'Imported Products', title: 'Imported Snack Box', sub: 'Japan & Korea range', price: '$14.00', img: '🍫', accent: '#6c3483', expiry: '15 Jul 2026', tag: 'NEW' },
  { id: 5, cat: 'Seasonal Specials', title: 'Winter Energy Bundle', sub: '2 Energy drinks + bar', price: '$8.50', img: '⚡', accent: '#1f7be0', expiry: '31 Jul 2026', tag: 'SEASONAL' },
]

export const carousel = [
  { id: 1, title: 'Weekend Fuel Special', sub: 'Members save 6¢/L this weekend', img: '⛽', from: '#003a86', to: '#1f7be0' },
  { id: 2, title: 'Free Coffee Friday', sub: 'Redeem with 500 points', img: '☕', from: '#6a3f22', to: '#b9793f' },
  { id: 3, title: 'Imported Snack Drop', sub: 'New Japan & Korea range in store', img: '🍫', from: '#4a235a', to: '#8e44ad' },
  { id: 4, title: 'Meal Combo Deal', sub: 'Burger + chips + drink $11.90', img: '🍔', from: '#7b241c', to: '#cb4335' },
]

export const hotDeals = [
  { id: 1, name: 'Red Bull 250ml', img: '🥤', off: 30, now: '$3.15', was: '$4.50' },
  { id: 2, name: 'Lindt Block', img: '🍫', off: 25, now: '$4.50', was: '$6.00' },
  { id: 3, name: 'Mt Franklin 600ml', img: '💧', off: 20, now: '$2.40', was: '$3.00' },
  { id: 4, name: 'Doritos Share', img: '🌮', off: 35, now: '$3.90', was: '$6.00' },
  { id: 5, name: 'Magnum Classic', img: '🍦', off: 15, now: '$4.25', was: '$5.00' },
]

export const recommended = [
  { id: 1, name: 'Flat White', sub: 'Your usual ☕', price: '$4.80', img: '☕' },
  { id: 2, name: 'Chicken Wrap', sub: 'Pairs with your coffee', price: '$8.50', img: '🌯' },
  { id: 3, name: 'V Energy', sub: 'Trending near you', price: '$3.80', img: '⚡' },
]

export const menuCategories = [
  'Sandwiches', 'Wraps', 'Burgers', 'Hot Food', 'Coffee', 'Drinks',
  'Imported Snacks', 'Chocolates', 'Chips', 'Ice Cream', 'Grocery', 'Energy Drinks',
]

// Top-level food categories shown in the Menu tab (the sub-options).
export const menuGroups = [
  { key: 'fresh', label: 'Fast & Fresh', emoji: '🥪' },
  { key: 'hot', label: 'Hot Food', emoji: '🍔' },
  { key: 'coffee', label: 'Coffee', emoji: '☕' },
  { key: 'cold', label: 'Cold Drinks', emoji: '🥤' },
  { key: 'energy', label: 'Energy Drinks', emoji: '⚡' },
  { key: 'snacks', label: 'Snacks & Chips', emoji: '🍿' },
  { key: 'sweet', label: 'Chocolates', emoji: '🍫' },
  { key: 'icecream', label: 'Ice Cream', emoji: '🍦' },
  { key: 'grocery', label: 'Grocery', emoji: '🛒' },
]

export const menuItems = [
  // Fast & Fresh
  { id: 1, group: 'fresh', name: 'Chicken Schnitzel Sandwich', cat: 'Sandwiches', desc: 'Crispy schnitzel, slaw, aioli', price: '$9.50', img: '🥪', avail: true, tags: ['Best Sellers', 'Popular'] },
  { id: 2, group: 'fresh', name: 'Falafel Wrap', cat: 'Wraps', desc: 'Hummus, salad, tahini', price: '$8.50', img: '🌯', avail: true, tags: ['New'] },
  { id: 13, group: 'fresh', name: 'Caesar Salad Bowl', cat: 'Salads', desc: 'Cos, parmesan, croutons', price: '$10.50', img: '🥗', avail: true, tags: ['New', 'Popular'] },
  { id: 14, group: 'fresh', name: 'Ham & Cheese Croissant', cat: 'Bakery', desc: 'Buttery, baked fresh', price: '$6.50', img: '🥐', avail: true, tags: ['Popular'] },
  // Hot Food
  { id: 3, group: 'hot', name: 'Pearl Angus Burger', cat: 'Burgers', desc: 'Angus beef, cheddar, pickles', price: '$12.90', img: '🍔', avail: true, tags: ['Best Sellers', 'Popular'] },
  { id: 4, group: 'hot', name: 'Hot Chips (Large)', cat: 'Hot Food', desc: 'Sea salt, crispy cut', price: '$5.50', img: '🍟', avail: true, tags: ['Popular'] },
  { id: 15, group: 'hot', name: 'Chicken Tenders (4pc)', cat: 'Hot Food', desc: 'Crunchy, with dipping sauce', price: '$7.90', img: '🍗', avail: true, tags: ['Best Sellers'] },
  { id: 16, group: 'hot', name: 'Beef Sausage Roll', cat: 'Hot Food', desc: 'Flaky pastry, baked hot', price: '$4.80', img: '🥟', avail: true, tags: ['Popular'] },
  { id: 17, group: 'hot', name: 'Margherita Pizza Slice', cat: 'Hot Food', desc: 'Wood-fired, mozzarella', price: '$5.90', img: '🍕', avail: false, tags: ['New'] },
  // Coffee
  { id: 5, group: 'coffee', name: 'Flat White', cat: 'Coffee', desc: 'Single origin, silky milk', price: '$4.80', img: '☕', avail: true, tags: ['Best Sellers', 'Popular'] },
  { id: 6, group: 'coffee', name: 'Iced Latte', cat: 'Coffee', desc: 'Cold brew over ice', price: '$5.50', img: '🧋', avail: true, tags: ['New'] },
  { id: 18, group: 'coffee', name: 'Cappuccino', cat: 'Coffee', desc: 'Velvety foam, dusted cocoa', price: '$4.80', img: '☕', avail: true, tags: ['Popular'] },
  { id: 19, group: 'coffee', name: 'Hot Chocolate', cat: 'Coffee', desc: 'Rich Belgian cocoa', price: '$4.50', img: '🍫', avail: true, tags: ['New'] },
  // Cold Drinks
  { id: 7, group: 'cold', name: 'Coke No Sugar 600ml', cat: 'Drinks', desc: 'Chilled', price: '$4.20', img: '🥤', avail: true, tags: ['Popular'] },
  { id: 20, group: 'cold', name: 'Mount Franklin 600ml', cat: 'Drinks', desc: 'Spring water', price: '$3.00', img: '💧', avail: true, tags: ['Best Sellers'] },
  { id: 21, group: 'cold', name: 'Orange Juice 350ml', cat: 'Drinks', desc: 'Freshly squeezed', price: '$4.50', img: '🧃', avail: true, tags: ['New'] },
  // Energy Drinks
  { id: 12, group: 'energy', name: 'Red Bull 250ml', cat: 'Energy Drinks', desc: 'Gives you wings', price: '$4.50', img: '⚡', avail: true, tags: ['Popular', 'Best Sellers'] },
  { id: 22, group: 'energy', name: 'V Energy 500ml', cat: 'Energy Drinks', desc: 'Big hit of energy', price: '$5.20', img: '🔋', avail: true, tags: ['Popular'] },
  { id: 23, group: 'energy', name: 'Monster Ultra', cat: 'Energy Drinks', desc: 'Zero sugar', price: '$5.50', img: '⚡', avail: true, tags: ['New'] },
  // Snacks & Chips
  { id: 10, group: 'snacks', name: 'Doritos Cheese', cat: 'Chips', desc: 'Share pack', price: '$6.00', img: '🌮', avail: false, tags: ['Popular'] },
  { id: 8, group: 'snacks', name: 'Pocky Matcha', cat: 'Imported Snacks', desc: 'Imported from Japan', price: '$3.90', img: '🍡', avail: true, tags: ['Imported', 'New'] },
  { id: 24, group: 'snacks', name: 'Smith’s Original', cat: 'Chips', desc: 'Crinkle cut classic', price: '$4.50', img: '🥔', avail: true, tags: ['Best Sellers'] },
  // Chocolates
  { id: 9, group: 'sweet', name: 'Lindt Excellence 70%', cat: 'Chocolates', desc: 'Swiss dark chocolate', price: '$6.00', img: '🍫', avail: true, tags: ['Imported'] },
  { id: 25, group: 'sweet', name: 'Cadbury Dairy Milk', cat: 'Chocolates', desc: 'Family block', price: '$5.50', img: '🍫', avail: true, tags: ['Popular'] },
  { id: 26, group: 'sweet', name: 'KitKat 4-Finger', cat: 'Chocolates', desc: 'Have a break', price: '$2.50', img: '🍫', avail: true, tags: ['Best Sellers'] },
  // Ice Cream
  { id: 11, group: 'icecream', name: 'Magnum Almond', cat: 'Ice Cream', desc: 'Belgian chocolate coat', price: '$5.00', img: '🍦', avail: true, tags: ['Best Sellers'] },
  { id: 27, group: 'icecream', name: 'Cornetto Classico', cat: 'Ice Cream', desc: 'Crunchy cone', price: '$4.20', img: '🍨', avail: true, tags: ['Popular'] },
  // Grocery
  { id: 28, group: 'grocery', name: 'Full Cream Milk 2L', cat: 'Grocery', desc: 'Daily essentials', price: '$4.40', img: '🥛', avail: true, tags: ['Best Sellers'] },
  { id: 29, group: 'grocery', name: 'White Bread Loaf', cat: 'Grocery', desc: 'Fresh sliced', price: '$3.80', img: '🍞', avail: true, tags: ['Popular'] },
  { id: 30, group: 'grocery', name: 'Free Range Eggs (6)', cat: 'Grocery', desc: 'Farm fresh', price: '$5.20', img: '🥚', avail: true, tags: ['New'] },
]

export const menuFilters = ['Popular', 'New', 'Best Sellers', 'Imported']

export const fuelTypes = [
  { code: 'ULP 91', price: 1.879, trend: -0.04, color: '#27ae60' },
  { code: 'Premium 95', price: 1.989, trend: +0.02, color: '#0057B8' },
  { code: 'Premium 98', price: 2.079, trend: -0.01, color: '#6c3483' },
  { code: 'Diesel', price: 1.949, trend: +0.03, color: '#34495e' },
  { code: 'LPG', price: 0.929, trend: -0.02, color: '#e67e22' },
]

// A sample of the 170+ Pearl Energy network. Each store carries its own live
// fuel prices (cents/L). Add the rest in Admin → Stores.
export const stations = [
  // Sydney (NSW)
  { id: 's1', name: 'Pearl Energy Parramatta', city: 'Parramatta NSW', state: 'NSW', open: true, hours: '24 Hours', lat: -33.8150, lng: 151.0000, amenities: ['Coffee', 'Car Wash', 'ATM', 'Hot Food'], ulp91: 182.9, e10: 180.9, p95: 196.9, p98: 202.9, diesel: 199.9, lpg: 92.9 },
  { id: 's2', name: 'Pearl Energy Liverpool', city: 'Liverpool NSW', state: 'NSW', open: true, hours: '5am – 11pm', lat: -33.9200, lng: 150.9230, amenities: ['Coffee', 'EV Charging', 'Hot Food'], ulp91: 181.9, e10: 179.9, p95: 195.9, p98: 201.9, diesel: 198.9, lpg: 91.9 },
  { id: 's3', name: 'Pearl Energy Blacktown', city: 'Blacktown NSW', state: 'NSW', open: false, hours: '6am – 10pm', lat: -33.7710, lng: 150.9060, amenities: ['ATM', 'Car Wash'], ulp91: 184.9, e10: 182.9, p95: 198.9, p98: 204.9, diesel: 201.9, lpg: 93.9 },
  { id: 's4', name: 'Pearl Energy Penrith', city: 'Penrith NSW', state: 'NSW', open: true, hours: '24 Hours', lat: -33.7510, lng: 150.6940, amenities: ['Coffee', 'Hot Food', 'EV Charging', 'ATM'], ulp91: 185.9, e10: 183.9, p95: 199.9, p98: 205.9, diesel: 202.9, lpg: 94.9 },
  { id: 's5', name: 'Pearl Energy Sydney CBD', city: 'Sydney NSW', state: 'NSW', open: true, hours: '24 Hours', lat: -33.8688, lng: 151.2093, amenities: ['Coffee', 'ATM', 'Hot Food'], ulp91: 188.9, e10: 186.9, p95: 202.9, p98: 208.9, diesel: 204.9, lpg: 95.9 },
  { id: 's6', name: 'Pearl Energy Newcastle', city: 'Newcastle NSW', state: 'NSW', open: true, hours: '5am – 12am', lat: -32.9283, lng: 151.7817, amenities: ['Coffee', 'Car Wash', 'EV Charging'], ulp91: 179.9, e10: 177.9, p95: 193.9, p98: 199.9, diesel: 196.9, lpg: 90.9 },
  // Melbourne (VIC)
  { id: 's7', name: 'Pearl Energy Melbourne CBD', city: 'Melbourne VIC', state: 'VIC', open: true, hours: '24 Hours', lat: -37.8136, lng: 144.9631, amenities: ['Coffee', 'ATM', 'Hot Food', 'EV Charging'], ulp91: 178.9, e10: 176.9, p95: 192.9, p98: 198.9, diesel: 195.9, lpg: 89.9 },
  { id: 's8', name: 'Pearl Energy Geelong', city: 'Geelong VIC', state: 'VIC', open: true, hours: '5am – 11pm', lat: -38.1499, lng: 144.3617, amenities: ['Coffee', 'Car Wash'], ulp91: 176.9, e10: 174.9, p95: 190.9, p98: 196.9, diesel: 193.9, lpg: 88.9 },
  { id: 's9', name: 'Pearl Energy Dandenong', city: 'Dandenong VIC', state: 'VIC', open: true, hours: '24 Hours', lat: -37.9870, lng: 145.2150, amenities: ['Hot Food', 'ATM', 'EV Charging'], ulp91: 177.9, e10: 175.9, p95: 191.9, p98: 197.9, diesel: 194.9, lpg: 89.9 },
  { id: 's10', name: 'Pearl Energy St Kilda', city: 'St Kilda VIC', state: 'VIC', open: false, hours: '6am – 10pm', lat: -37.8678, lng: 144.9810, amenities: ['Coffee', 'Car Wash'], ulp91: 180.9, e10: 178.9, p95: 194.9, p98: 200.9, diesel: 197.9, lpg: 90.9 },
  // Brisbane (QLD)
  { id: 's11', name: 'Pearl Energy Brisbane CBD', city: 'Brisbane QLD', state: 'QLD', open: true, hours: '24 Hours', lat: -27.4698, lng: 153.0251, amenities: ['Coffee', 'ATM', 'Hot Food'], ulp91: 174.9, e10: 172.9, p95: 188.9, p98: 194.9, diesel: 191.9, lpg: 87.9 },
  { id: 's12', name: 'Pearl Energy Gold Coast', city: 'Gold Coast QLD', state: 'QLD', open: true, hours: '24 Hours', lat: -28.0167, lng: 153.4000, amenities: ['Coffee', 'Car Wash', 'EV Charging', 'Hot Food'], ulp91: 175.9, e10: 173.9, p95: 189.9, p98: 195.9, diesel: 192.9, lpg: 88.9 },
  { id: 's13', name: 'Pearl Energy Logan', city: 'Logan QLD', state: 'QLD', open: true, hours: '5am – 11pm', lat: -27.6390, lng: 153.1090, amenities: ['ATM', 'Hot Food'], ulp91: 173.9, e10: 171.9, p95: 187.9, p98: 193.9, diesel: 190.9, lpg: 86.9 },
  { id: 's14', name: 'Pearl Energy Ipswich', city: 'Ipswich QLD', state: 'QLD', open: true, hours: '24 Hours', lat: -27.6171, lng: 152.7600, amenities: ['Coffee', 'Car Wash'], ulp91: 172.9, e10: 170.9, p95: 186.9, p98: 192.9, diesel: 189.9, lpg: 86.9 },
  { id: 's15', name: 'Pearl Energy Wollongong', city: 'Wollongong NSW', state: 'NSW', open: true, hours: '5am – 12am', lat: -34.4278, lng: 150.8931, amenities: ['Coffee', 'EV Charging'], ulp91: 181.9, e10: 179.9, p95: 195.9, p98: 201.9, diesel: 198.9, lpg: 91.9 },
  { id: 's16', name: 'Pearl Energy Ballarat', city: 'Ballarat VIC', state: 'VIC', open: false, hours: '6am – 10pm', lat: -37.5622, lng: 143.8503, amenities: ['Coffee', 'ATM', 'Car Wash'], ulp91: 177.9, e10: 175.9, p95: 191.9, p98: 197.9, diesel: 194.9, lpg: 89.9 },
]

// price rows shown for a selected station (key → label, highlight premium)
export const stationFuelRows = [
  { key: 'ulp91', label: 'ULP 91' },
  { key: 'e10', label: 'E10' },
  { key: 'p95', label: 'Premium 95' },
  { key: 'p98', label: 'Premium 98', hl: true },
  { key: 'diesel', label: 'Diesel' },
  { key: 'lpg', label: 'LPG' },
]

export const amenityFilters = ['Car Wash', 'ATM', 'Coffee', 'Hot Food', 'EV Charging']

export const rewards = [
  { id: 1, cat: 'Free Coffee', title: 'Free Barista Coffee', cost: 500, img: '☕', color: '#7a4a2b' },
  { id: 2, cat: 'Fuel Discount', title: '$10 Fuel Voucher', cost: 1000, img: '⛽', color: '#0057B8' },
  { id: 3, cat: 'Food Discount', title: '$8 Off Any Meal', cost: 800, img: '🍔', color: '#c0392b' },
  { id: 4, cat: 'Merchandise', title: 'Pearl Drink Bottle', cost: 1500, img: '🥤', color: '#16a085' },
  { id: 5, cat: 'Partner Rewards', title: '$25 Movie Voucher', cost: 2500, img: '🎬', color: '#6c3483' },
]

export const rewardJourney = [
  { points: 500, label: 'Free Coffee', img: '☕' },
  { points: 1000, label: 'Fuel Voucher', img: '⛽' },
  { points: 2500, label: 'Premium Reward', img: '🎁' },
]

export const transactions = [
  { id: 1, store: 'Pearl Energy Parramatta', date: '02 Jun 2026', amount: 78.4, points: 78, type: 'Fuel + Store' },
  { id: 2, store: 'Pearl Energy Liverpool', date: '29 May 2026', amount: 6.5, points: 7, type: 'Coffee' },
  { id: 3, store: 'Pearl Energy Penrith', date: '25 May 2026', amount: 54.2, points: 54, type: 'Fuel' },
  { id: 4, store: 'Pearl Energy Parramatta', date: '21 May 2026', amount: 22.9, points: 23, type: 'Store' },
]

export const notifications = [
  { id: 1, icon: '⛽', title: 'Fuel prices dropped near you', body: 'ULP 91 now $1.86 at Penrith', time: '10m ago' },
  { id: 2, icon: '⭐', title: 'You earned 78 points', body: 'From your Parramatta visit', time: '1d ago' },
  { id: 3, icon: '☕', title: 'New coffee deal available', body: 'Coffee + muffin just $6.50', time: '2d ago' },
]
