// Shared tier palette — used by the membership card, the home summary card,
// and the "My Card" buttons so they always match the member's tier colour.
export const TIER_THEME = {
  Blue: {
    dark: true, shimmer: false,
    card: 'linear-gradient(150deg,#003a86 0%,#0057b8 52%,#4da3ff 100%)',
    text: '#ffffff', sub: 'rgba(255,255,255,0.82)',
    badge: { background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.35)' },
    accent: 'rgba(255,255,255,0.22)', glow: 'rgba(0,87,184,0.45)',
    track: 'rgba(255,255,255,0.22)', fill: '#ffffff',
    button: 'linear-gradient(135deg,#0057b8,#4da3ff)', buttonText: '#ffffff',
  },
  Silver: {
    dark: false, shimmer: false,
    card: 'linear-gradient(150deg,#7c889c 0%,#e3e9f1 46%,#6c798f 100%)',
    text: '#1b2333', sub: 'rgba(27,35,51,0.7)',
    badge: { background: 'rgba(255,255,255,0.55)', color: '#34405a', border: '1px solid rgba(255,255,255,0.7)' },
    accent: 'rgba(255,255,255,0.5)', glow: 'rgba(120,135,160,0.4)',
    track: 'rgba(0,0,0,0.12)', fill: '#34405a',
    button: 'linear-gradient(135deg,#8a96aa,#c4cdda)', buttonText: '#26304a',
  },
  Gold: {
    dark: false, shimmer: true,
    card: 'linear-gradient(150deg,#8a6a23 0%,#caa14a 36%,#f6e09a 60%,#9c7424 100%)',
    text: '#3a2c08', sub: 'rgba(58,44,8,0.75)',
    badge: { background: 'rgba(255,255,255,0.35)', color: '#5a4413', border: '1px solid rgba(255,255,255,0.55)' },
    accent: 'rgba(255,255,255,0.5)', glow: 'rgba(202,161,74,0.5)',
    track: 'rgba(0,0,0,0.14)', fill: '#5a4413',
    button: 'linear-gradient(135deg,#caa14a,#f6e09a)', buttonText: '#3a2c08',
  },
  Diamond: {
    dark: false, shimmer: false,
    card: 'linear-gradient(150deg,#0f6db8 0%,#8fd3f4 40%,#e8f9ff 62%,#2b86c5 100%)',
    text: '#08344f', sub: 'rgba(8,52,79,0.72)',
    badge: { background: 'rgba(255,255,255,0.55)', color: '#0b4a73', border: '1px solid rgba(255,255,255,0.75)' },
    accent: 'rgba(255,255,255,0.55)', glow: 'rgba(64,164,223,0.5)',
    track: 'rgba(0,0,0,0.12)', fill: '#0b4a73',
    button: 'linear-gradient(135deg,#36a3e0,#8fd3f4)', buttonText: '#08344f',
  },
  Immortal: {
    dark: true, shimmer: false,
    card: 'linear-gradient(150deg,#12081f 0%,#5b21b6 45%,#a855f7 68%,#1a0b2e 100%)',
    text: '#ffffff', sub: 'rgba(255,255,255,0.8)',
    badge: { background: 'rgba(255,255,255,0.22)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)' },
    accent: 'rgba(168,85,247,0.45)', glow: 'rgba(124,45,214,0.55)',
    track: 'rgba(255,255,255,0.22)', fill: '#ffffff',
    button: 'linear-gradient(135deg,#7c3aed,#a855f7)', buttonText: '#ffffff',
  },
}

export const tierTheme = (tier) => TIER_THEME[tier] || TIER_THEME.Blue
